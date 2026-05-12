import { randomUUID } from "node:crypto";
import type { Express, Request } from "express";
import { z } from "zod";
import type { SavedFlow } from "../flows/flow.repository";
import { attendantRepository, flowRepository, queueRepository, tenantRepository } from "../lib/repositories";
import {
  formatAgentSessionMeta,
  resolveAttendantDisplayName,
  resolveServiceStartedAt,
} from "../lib/agent-session-meta";
import { typebotPublicIdFromViewerUrl } from "../lib/typebot-public-id";
import {
  QueueService,
  addAgentNoteSchema,
  addLeadAttachmentSchema,
  assignSchema,
  enqueueSchema,
  sendLiveMessageSchema,
  updateQueueContactSchema,
} from "./queue.service";

function normalizeHandoffMatchToken(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Associa o pedido de handoff ao fluxo gravado no painel quando o Typebot envia
 * publicId do viewer, apelido, label exibido ou URL do viewer — não só nickname idêntico.
 */
function savedFlowMatchesHandoffSource(
  saved: SavedFlow,
  normalizedSourceFlowLabel: string,
  viewerPublicIdFromBody: string,
): boolean {
  const label = normalizeHandoffMatchToken(normalizedSourceFlowLabel);
  const viewerPid = normalizeHandoffMatchToken(viewerPublicIdFromBody);
  const nick = normalizeHandoffMatchToken(saved.nickname);
  const disp = normalizeHandoffMatchToken(saved.displayLabel ?? "");
  const urlLower = saved.url.trim().toLowerCase();
  const pidStored = normalizeHandoffMatchToken(saved.typebotPublicId ?? "");
  const pidFromUrl = normalizeHandoffMatchToken(typebotPublicIdFromViewerUrl(saved.url));

  const matchesLabel =
    label.length >= 2 &&
    (nick === label ||
      disp === label ||
      pidStored === label ||
      pidFromUrl === label ||
      urlLower.includes(`/${label}`));

  const matchesViewer =
    viewerPid.length >= 2 &&
    (pidStored === viewerPid || pidFromUrl === viewerPid || urlLower.includes(`/${viewerPid}`));

  return matchesLabel || matchesViewer;
}

const queueService = new QueueService(queueRepository);

const slugifyFlowNickname = (value: string): string =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 120);

const ensureTenantFlowRegisteredFromHandoff = (params: {
  tenantId: string;
  sourceFlowLabel: string;
  viewerUrl?: string;
  flowAlias?: string;
}) => {
  const tenantId = String(params.tenantId ?? "").trim();
  const sourceFlowLabel = String(params.sourceFlowLabel ?? "").trim();
  const viewerUrl = String(params.viewerUrl ?? "").trim();
  if (!tenantId) return;

  const sourceToken = normalizeHandoffMatchToken(sourceFlowLabel);
  const viewerToken = normalizeHandoffMatchToken(typebotPublicIdFromViewerUrl(viewerUrl));
  const byTenant = flowRepository.listByTenant(tenantId);
  const alreadyExists = byTenant.some((flow) =>
    savedFlowMatchesHandoffSource(flow, sourceToken || viewerToken, viewerToken),
  );
  if (alreadyExists) return;

  const displayLabel = String(params.flowAlias ?? "").trim() || sourceFlowLabel || "Fluxo";
  const nicknameBase = sourceFlowLabel || viewerToken || displayLabel;
  let nickname = slugifyFlowNickname(nicknameBase);
  if (nickname.length < 2) nickname = `fluxo-${Date.now()}`;
  if (byTenant.some((flow) => normalizeHandoffMatchToken(flow.nickname) === normalizeHandoffMatchToken(nickname))) {
    nickname = `${nickname}-${Date.now().toString().slice(-4)}`;
  }

  flowRepository.create({
    id: randomUUID(),
    tenantId,
    createdAt: new Date().toISOString(),
    nickname,
    displayLabel,
    url: viewerUrl || `https://placeholder.local/${encodeURIComponent(sourceFlowLabel || nickname)}`,
    typebotPublicId: viewerToken || sourceToken || undefined,
  });
};
type ViewerVisualConfig = {
  pageBg: string;
  chatBg: string;
  userBubbleBg: string;
  botBubbleBg: string;
  profileImageUrl?: string;
};

const DEFAULT_VISUAL_CONFIG: ViewerVisualConfig = {
  pageBg: "#ECE5DD",
  chatBg: "#F0F2F5",
  userBubbleBg: "#128C7E",
  botBubbleBg: "#FFFFFF",
};

const getReadableTextColor = (hexColor: string): string => {
  const value = String(hexColor ?? "").trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return "#f8fafc";
  const r = Number.parseInt(value.slice(1, 3), 16);
  const g = Number.parseInt(value.slice(3, 5), 16);
  const b = Number.parseInt(value.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.74 ? "#111827" : "#f8fafc";
};

const getInitials = (label: string): string =>
  String(label ?? "")
    .split(" ")
    .map((token) => token.trim()[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

const pickHexColors = (jsonText: string) => {
  const matches = [...jsonText.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0]);
  return [...new Set(matches)];
};

const extractImageUrl = (jsonText: string) => {
  const urls = [...jsonText.matchAll(/https?:\/\/[^"'\s]+?\.(?:png|jpg|jpeg|webp|gif)(?:\?[^"'\s]*)?/gi)].map((m) => m[0]);
  const preferred = urls.find((url) => url.includes("/typebot/public/") && !url.includes("ogImage"));
  return preferred ?? urls[0];
};

const extractViewerVisualConfig = async (viewerUrl: string): Promise<ViewerVisualConfig> => {
  const response = await fetch(viewerUrl, { method: "GET" });
  if (!response.ok) return DEFAULT_VISUAL_CONFIG;

  const html = await response.text();
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!nextDataMatch) return DEFAULT_VISUAL_CONFIG;

  const nextDataText = nextDataMatch[1];
  const nextData = JSON.parse(nextDataText) as {
    props?: { pageProps?: { publishedTypebot?: { background?: { content?: string } } } };
  };

  const backgroundColor = nextData.props?.pageProps?.publishedTypebot?.background?.content;
  const colors = pickHexColors(nextDataText);

  return {
    pageBg: typeof backgroundColor === "string" ? backgroundColor : DEFAULT_VISUAL_CONFIG.pageBg,
    chatBg: colors[0] ?? DEFAULT_VISUAL_CONFIG.chatBg,
    userBubbleBg: colors[1] ?? DEFAULT_VISUAL_CONFIG.userBubbleBg,
    botBubbleBg: colors[2] ?? DEFAULT_VISUAL_CONFIG.botBubbleBg,
    profileImageUrl: extractImageUrl(nextDataText),
  };
};

const flattenPrimitiveValues = (
  value: unknown,
  prefix = "",
  output: Record<string, string | number | boolean> = {},
): Record<string, string | number | boolean> => {
  if (value === null || value === undefined) return output;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const key = prefix || "value";
    output[key] = value;
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const nextPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      flattenPrimitiveValues(item, nextPrefix, output);
    });
    return output;
  }

  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenPrimitiveValues(nested, nextPrefix, output);
    });
    return output;
  }

  return output;
};

const extractNamedVariables = (value: unknown): Record<string, string | number | boolean> => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return extractNamedVariables(parsed);
    } catch {
      return {};
    }
  }

  if (!Array.isArray(value)) {
    if (value && typeof value === "object") {
      return flattenPrimitiveValues(value);
    }
    return {};
  }
  return value.reduce<Record<string, string | number | boolean>>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const variable = item as { name?: unknown; value?: unknown };
    const name = typeof variable.name === "string" ? variable.name.trim() : "";
    const rawValue = variable.value;
    if (!name) return acc;
    if (typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean") {
      acc[name] = rawValue;
      return acc;
    }
    if (Array.isArray(rawValue)) {
      const joined = rawValue.map((entry) => String(entry ?? "")).filter((entry) => entry.trim()).join(", ");
      if (joined) acc[name] = joined;
    }
    return acc;
  }, {});
};

const pruneEmptyLeadContext = (
  context: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> => {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => String(value ?? "").trim().length > 0),
  );
};

const extractAnswersContext = (value: unknown): Record<string, string | number | boolean> => {
  if (!Array.isArray(value)) return {};
  return value.reduce<Record<string, string | number | boolean>>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const answer = item as { name?: unknown; key?: unknown; label?: unknown; value?: unknown };
    const name = String(answer.name ?? answer.key ?? answer.label ?? "").trim();
    const rawValue = answer.value;
    if (!name) return acc;
    if (typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean") {
      acc[name] = rawValue;
      return acc;
    }
    if (Array.isArray(rawValue)) {
      const joined = rawValue.map((entry) => String(entry ?? "")).filter((entry) => entry.trim()).join(", ");
      if (joined) acc[name] = joined;
    }
    return acc;
  }, {});
};

const mergeLeadContextLayers = (
  ...layers: Array<Record<string, string | number | boolean>>
): Record<string, string | number | boolean> => {
  return pruneEmptyLeadContext(
    layers.reduce<Record<string, string | number | boolean>>((acc, layer) => ({ ...acc, ...layer }), {}),
  );
};

const resolveLeadContextFromHandoffPayload = (
  payload: Record<string, unknown>,
): Record<string, string | number | boolean> => {
  const knownKeys = new Set([
    "tenantId",
    "tenant_id",
    "contactName",
    "source",
    "sourceFlowLabel",
    "source_flow_label",
    "flowAlias",
    "initialMessage",
    "typebotViewerUrl",
    "viewer_url",
    "leadContext",
    "variables",
    "answers",
    "resultId",
    "leadWhatsapp",
  ]);
  const autoLeadContext = Object.entries(payload)
    .filter(([key]) => !knownKeys.has(key))
    .reduce<Record<string, string | number | boolean>>((acc, [key, value]) => {
      return flattenPrimitiveValues(value, key, acc);
    }, {});
  const variablesLeadContext = extractNamedVariables(payload.variables);
  const answersLeadContext = extractAnswersContext(payload.answers);
  let parsedLeadContext: Record<string, string | number | boolean> = {};
  if (typeof payload.leadContext === "string") {
    try {
      parsedLeadContext = flattenPrimitiveValues(JSON.parse(payload.leadContext));
    } catch {
      parsedLeadContext = {};
    }
  } else if (payload.leadContext && typeof payload.leadContext === "object") {
    parsedLeadContext = payload.leadContext as Record<string, string | number | boolean>;
  }
  return mergeLeadContextLayers(autoLeadContext, answersLeadContext, variablesLeadContext, parsedLeadContext);
};

const pickLeadWhatsappFromContext = (
  context: Record<string, string | number | boolean>,
  payload: Record<string, unknown>,
): string | undefined => {
  const directCandidates = [
    payload.leadWhatsapp,
    payload.Whatsapp,
    payload.WhatsApp,
    payload.whatsapp,
    payload.telefone,
    payload.celular,
  ];
  for (const candidate of directCandidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  const preferredKeys = ["WhatsApp", "Whatsapp", "whatsapp", "telefone", "celular", "phone", "fone"];
  for (const key of preferredKeys) {
    const value = String(context[key] ?? "").trim();
    if (value) return value;
  }
  for (const [key, value] of Object.entries(context)) {
    const normalized = key.trim().toLowerCase();
    if (!["whatsapp", "telefone", "celular", "phone", "fone"].includes(normalized)) continue;
    const resolved = String(value ?? "").trim();
    if (resolved) return resolved;
  }
  return undefined;
};

const pickLeadNameFromPayload = (
  payload: Record<string, unknown>,
  leadContext?: Record<string, string | number | boolean>,
): string => {
  const candidates = [
    payload.contactName,
    payload.Nome,
    payload.Nome_Contato,
    payload.nome,
    payload.nome_completo,
    payload["nome completo"],
    payload.name,
    leadContext?.Nome,
    leadContext?.Nome_Contato,
    leadContext?.nome,
    leadContext?.nome_completo,
    leadContext?.name,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value && value.toLowerCase() !== "lead") return value;
  }
  return "Lead";
};

const getTenantId = (req: Request) => {
  const tenantId = req.header("x-tenant-id");
  if (!tenantId) throw new Error("x-tenant-id is required");
  return tenantId;
};

const resolveTenantIdForContact = (req: Request, contactId: string): string => {
  const headerTenantId = String(req.header("x-tenant-id") ?? "").trim();
  const normalizedContactId = String(contactId ?? "").trim();
  if (!normalizedContactId) throw new Error("contactId is required");
  if (headerTenantId) {
    const strictMatch = queueService.getContact(headerTenantId, normalizedContactId);
    if (strictMatch) return headerTenantId;
  }
  const byContact = queueService.getContactById(normalizedContactId);
  if (byContact?.tenantId) return byContact.tenantId;
  if (headerTenantId) return headerTenantId;
  throw new Error("x-tenant-id is required");
};

/** Quando o tenant marca “sem atendentes”, só o usuário Master entra na roleta/distribuição automática. */
const attendantsForQueueRouting = (
  tenantId: string,
  tenant: { noSeparateAttendants?: boolean } | null | undefined,
) => {
  const all = attendantRepository.listByTenant(tenantId);
  const mapped = all.map((attendant) => ({ username: attendant.username, displayName: attendant.displayName }));
  if (!tenant?.noSeparateAttendants) return mapped;
  const masters = all.filter((a) => a.role === "master");
  if (masters.length === 0) return mapped;
  return masters.map((attendant) => ({ username: attendant.username, displayName: attendant.displayName }));
};

export const registerQueueRoutes = (app: Express) => {
  const asOptionalNonEmptyString = (max = 2048) =>
    z.preprocess((value) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }, z.string().min(2).max(max).optional());

  /**
   * URL pública da API usada em links do handoff (evita localhost quando o Typebot
   * chama via túnel e o Host não é o domínio real).
   */
  const getPublicBaseUrl = (req: Request) => {
    const fixedBase = String(process.env.HANDOFF_PUBLIC_BASE_URL ?? "").trim().replace(/\/$/, "");
    if (fixedBase) return fixedBase;
    const proto = req.header("x-forwarded-proto") ?? req.protocol;
    const host = req.header("x-forwarded-host") ?? req.header("host");
    return `${proto}://${host}`;
  };

  const isSafeHttpUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  };

  const isSafeImageSrc = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("data:image/")) return true;
    return isSafeHttpUrl(trimmed);
  };

  const pickThemeHex = (queryValue: string | undefined, tenantValue: string | undefined, fallback: string) => {
    const q = (queryValue ?? "").trim();
    if (/^#[0-9A-Fa-f]{6}$/i.test(q)) return q;
    const t = (tenantValue ?? "").trim();
    if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return t;
    return fallback;
  };

  app.get("/redirect-layout-preview", (req, res) => {
    const viewerUrl = String(req.query.viewerUrl ?? "").trim();
    if (!viewerUrl || !isSafeHttpUrl(viewerUrl)) {
      return res.status(400).send("viewerUrl inválida.");
    }

    return res.status(200).send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Preview Redirect</title>
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; background:#fff; overflow:hidden; }
    iframe { border:0; width:100%; height:100%; display:block; }
  </style>
</head>
<body>
  <iframe src="${viewerUrl.replace(/"/g, "&quot;")}" title="typebot-viewer-preview" allow="clipboard-write; microphone"></iframe>
</body>
</html>`);
  });

  app.get("/handoff-view", (req, res) => {
    const tenantIdFromQuery = String(
      req.query.tenantId ??
        req.query.tenant ??
        req.query.tenant_id ??
        req.query.tenantID ??
        "",
    ).trim();
    const contactId = String(
      req.query.contactId ??
        req.query.contact ??
        req.query.contact_id ??
        req.query.sessionId ??
        req.query.session ??
        "",
    ).trim();
    const queuedContact = queueService.getContactById(contactId);
    const contactNameFromQuery = String(req.query.contactName ?? "").trim();
    const contactName = contactNameFromQuery || String(queuedContact?.contactName ?? "").trim() || "Visitante";
    const flow = String(req.query.flow ?? "Fluxo");
    const mode = String(req.query.mode ?? "visitor");
    const senderRole = mode === "agent" ? "agent" : "visitor";
    const resolvedTenantIdForSession = tenantIdFromQuery || queuedContact?.tenantId || "";
    const tenantId = resolvedTenantIdForSession;
    const tenant = tenantRepository.getById(tenantId);
    const tenantTheme = tenant?.defaultChatTheme;
    const tenantDisplayName =
      tenant?.chatDisplayName?.trim() || tenant?.name?.trim() || "Atendimento em tempo real";
    const useWhatsappSecondOption = tenant?.useWhatsappSecondOption !== false;
    const tenantWhatsapp = String(tenant?.whatsapp ?? "").replace(/\D/g, "");
    const leadContextRaw = String(req.query.leadContext ?? "").trim();
    const themePageBg = pickThemeHex(String(req.query.themePageBg), tenantTheme?.pageBg, DEFAULT_VISUAL_CONFIG.pageBg);
    const themeChatBg = pickThemeHex(String(req.query.themeChatBg), tenantTheme?.chatBg, DEFAULT_VISUAL_CONFIG.chatBg);
    const themeUserBubbleBg = pickThemeHex(
      String(req.query.themeUserBubbleBg),
      tenantTheme?.userBubbleBg,
      DEFAULT_VISUAL_CONFIG.userBubbleBg,
    );
    const themeBotBubbleBg = pickThemeHex(String(req.query.themeBotBubbleBg), tenantTheme?.botBubbleBg, DEFAULT_VISUAL_CONFIG.botBubbleBg);
    const tenantProfileImageUrl = tenant?.profileImageUrl ?? "";
    const profileImageUrl = String(req.query.profileImageUrl ?? "").trim() || tenantProfileImageUrl.trim();
    const agentId = String(req.query.agentId ?? "").trim();
    const agentName = String(req.query.agentName ?? (agentId || "atendente-01")).trim();
    const attendantForAgent = resolvedTenantIdForSession
      ? attendantRepository
          .listByTenant(resolvedTenantIdForSession)
          .find((row) => row.username.trim().toLowerCase() === agentId.toLowerCase())
      : undefined;
    const resolvedAgentDisplayName = resolveAttendantDisplayName(
      {
        username: agentId,
        displayName: attendantForAgent?.displayName ?? agentName,
      },
      {
        assignedAgentId: queuedContact?.assignedAgentId,
        assignedAgentName: queuedContact?.assignedAgentName,
        sessionAgentId: agentId,
        sessionAgentName: agentName,
      },
    );
    const serviceStartedAt = resolveServiceStartedAt(
      resolvedTenantIdForSession && contactId ? queueService.getMessages(resolvedTenantIdForSession, contactId) : null,
      queuedContact,
    );
    const sessionMetaLabel = formatAgentSessionMeta(serviceStartedAt, resolvedAgentDisplayName);
    const agentBubbleTextColor = getReadableTextColor(themeUserBubbleBg);
    const agentAvatarInitials = getInitials(tenantDisplayName);
    const safeAgentLogoUrl = profileImageUrl && isSafeImageSrc(profileImageUrl) ? profileImageUrl : "";

    if (!contactId || (mode === "agent" && !tenantId) || (mode !== "agent" && !tenantId)) {
      return res.status(200).send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sessão de atendimento</title>
  <style>
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: #0b1224; color: #e2e8f0; display:grid; place-items:center; min-height:100vh; }
    .card { width:min(460px,92vw); border:1px solid #23324a; background:#10192d; border-radius:12px; padding:18px; box-shadow: 0 14px 34px rgba(0,0,0,.35); }
    h1 { margin: 0 0 8px; font-size: 18px; color:#f8fafc; }
    p { margin: 0; line-height: 1.5; color:#9fb0c8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sessão de atendimento indisponível</h1>
    <p>Não foi possível abrir esta conversa porque o link está incompleto ou expirou. Volte ao fluxo e solicite o atendimento novamente.</p>
  </div>
</body>
</html>`);
    }

    const escapedTenantId = tenantId.replace(/"/g, "&quot;");
    const escapedContactId = contactId.replace(/"/g, "&quot;");
    const escapedName = contactName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escapedFlow = flow.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escapedModeLabel = mode === "agent" ? "Painel do atendente" : "Conversa com atendente";
    let leadContextEntries: Array<{ key: string; value: string }> = [];
    if (leadContextRaw) {
      try {
        const parsed = JSON.parse(leadContextRaw) as Record<string, unknown>;
        leadContextEntries = Object.entries(parsed)
          .slice(0, 12)
          .map(([key, value]) => ({ key: String(key), value: String(value ?? "") }))
          .filter((item) => item.key.trim() && item.value.trim());
      } catch {
        leadContextEntries = [];
      }
    }
    const leadContextHtml = leadContextEntries
      .map(
        (item) =>
          `<span class="chip"><strong>${item.key.replace(/</g, "&lt;").replace(/>/g, "&gt;")}:</strong> ${item.value
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</span>`,
      )
      .join("");
    const leadContextJson = JSON.stringify(
      leadContextEntries.reduce<Record<string, string>>((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {}),
    );

    const isAgentMode = mode === "agent";
    const safeProfileImageTag =
      profileImageUrl && isSafeImageSrc(profileImageUrl)
        ? `<img class="avatar" src="${profileImageUrl.replace(/"/g, "&quot;")}" alt="Bot" />`
        : `<div class="avatar-fallback">bot</div>`;

    return res.status(200).send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${isAgentMode ? escapedName : "Atendimento ao vivo"}</title>
  <style>
    :root {
      --handoff-page-bg: ${themePageBg};
      --handoff-chat-bg: ${themeChatBg};
      --handoff-user-bubble-bg: ${themeUserBubbleBg};
      --handoff-bot-bubble-bg: ${themeBotBubbleBg};
      --handoff-accent: ${themeUserBubbleBg};
    }
    body { margin:0; font-family: Inter, Arial, sans-serif; background:var(--handoff-page-bg); color:#111827; }
    body.agent-screen { background:#0b1224; min-height:100vh; color:#f1f5f9; }
    body.agent-screen .agent-widget { width:min(500px,92vw); margin:20px auto; background:#111827; border:1px solid #1f2937; border-radius:12px; display:grid; gap:12px; padding:16px; box-sizing:border-box; }
    body.agent-screen .widget-header { display:flex; flex-direction:row; align-items:flex-start; justify-content:space-between; gap:10px; }
    body.agent-screen .lead-header-main { display:flex; flex-direction:column; gap:4px; flex:1; min-width:0; }
    body.agent-screen .lead-header-main strong { font-size:18px; line-height:1.25; word-break:break-word; }
    body.agent-screen .lead-header-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
    body.agent-screen .widget-header span { color:#94a3b8; font-size:14px; }
    body.agent-screen .lead-info-button { width:38px; height:38px; min-width:38px; flex-shrink:0; border-radius:999px; border:1px solid #334155; background:#0f172a; color:#cbd5e1; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0; }
    body.agent-screen .lead-info-button--active { border-color:#14b8a6; background:rgba(20,184,166,.16); color:#5eead4; }
    body.agent-screen .lead-info-button svg { width:18px; height:18px; fill:currentColor; }
    body.agent-screen .lead-drawer-overlay { position:fixed; inset:0; background:transparent; z-index:80; display:none; pointer-events:none; }
    body.agent-screen .lead-drawer-overlay.open { display:block; }
    body.agent-screen .lead-drawer-panel { position:fixed; top:0; right:0; width:min(380px,92vw); height:100dvh; background:#111827; border-left:1px solid #1f2937; box-shadow:-18px 0 40px rgba(2,6,23,.45); overflow:hidden; transform:translateX(100%); transition:transform .2s ease; z-index:90; padding:16px 16px 12px; box-sizing:border-box; pointer-events:auto; display:flex; flex-direction:column; }
    body.agent-screen .lead-drawer-overlay.open .lead-drawer-panel { transform:translateX(0); }
    body.agent-screen .lead-drawer-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px; flex-shrink:0; }
    body.agent-screen .lead-drawer-head strong { font-size:16px; color:#f8fafc; }
    body.agent-screen .lead-drawer-close { width:34px; height:34px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; font-size:22px; line-height:1; cursor:pointer; }
    body.agent-screen .lead-drawer-body { display:grid; gap:12px; flex:1; min-height:0; overflow:auto; padding-right:2px; }
    body.agent-screen .lead-drawer-footer { display:grid; gap:8px; flex-shrink:0; padding-top:12px; border-top:1px solid #1f2937; background:#111827; box-shadow:0 -12px 24px rgba(2,6,23,.4); }
    body.agent-screen .lead-profile-card { display:flex; align-items:center; gap:12px; padding:4px 2px 10px; }
    body.agent-screen .lead-profile-avatar { width:52px; height:52px; border-radius:999px; background:#1d4ed8; color:#eff6ff; display:inline-flex; align-items:center; justify-content:center; font-size:18px; font-weight:700; flex-shrink:0; }
    body.agent-screen .lead-profile-meta strong { display:block; font-size:18px; line-height:1.2; color:#f8fafc; word-break:break-word; }
    body.agent-screen .lead-profile-sub { display:block; margin-top:4px; color:#94a3b8; font-size:12px; }
    body.agent-screen .lead-fact-list { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
    body.agent-screen .lead-fact-list li { display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:center; padding:8px 10px; border:1px solid #1f2937; border-radius:10px; background:#0f172a; }
    body.agent-screen .lead-fact-icon, body.agent-screen .lead-fact-copy, body.agent-screen .lead-toolbar-button { width:34px; height:34px; border-radius:10px; border:1px solid #334155; background:#111827; color:#cbd5e1; display:inline-flex; align-items:center; justify-content:center; padding:0; cursor:pointer; }
    body.agent-screen .lead-toolbar-button--active { border-color:#14b8a6; background:rgba(20,184,166,.16); color:#5eead4; }
    body.agent-screen .lead-fact-icon svg, body.agent-screen .lead-fact-copy svg, body.agent-screen .lead-toolbar-button svg { width:16px; height:16px; fill:currentColor; }
    body.agent-screen .lead-fact-text { display:grid; gap:2px; min-width:0; }
    body.agent-screen .lead-fact-text small { color:#64748b; font-size:11px; }
    body.agent-screen .lead-fact-text span { color:#e2e8f0; font-size:13px; word-break:break-word; }
    body.agent-screen .lead-fact-copy:disabled { opacity:.45; cursor:not-allowed; }
    body.agent-screen .lead-toolbar { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
    body.agent-screen .lead-accordion { display:grid; gap:8px; }
    body.agent-screen .lead-accordion-item { border:1px solid #1f2937; border-radius:10px; background:#0f172a; overflow:hidden; }
    body.agent-screen .lead-accordion-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px; border:0; background:transparent; color:#f8fafc; font:inherit; font-weight:600; text-align:left; cursor:pointer; }
    body.agent-screen .lead-accordion-icon { color:#60a5fa; font-size:20px; line-height:1; transition:transform .2s ease; }
    body.agent-screen .lead-accordion-item.open .lead-accordion-icon { transform:rotate(45deg); }
    body.agent-screen .lead-accordion-panel { display:none; gap:10px; padding:0 14px 14px; }
    body.agent-screen .lead-accordion-item.open .lead-accordion-panel { display:grid; }
    body.agent-screen .lead-field { display:grid; gap:6px; }
    body.agent-screen .lead-field span { color:#94a3b8; font-size:12px; font-weight:600; }
    body.agent-screen .lead-field input, body.agent-screen .lead-field select, body.agent-screen .lead-field textarea { width:100%; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#f1f5f9; padding:10px; box-sizing:border-box; font:inherit; }
    body.agent-screen .lead-field textarea { resize:vertical; min-height:110px; }
    body.agent-screen .lead-variables-list, body.agent-screen .lead-attachments-list, body.agent-screen .lead-notes-history { display:grid; gap:8px; }
    body.agent-screen .lead-note-item { display:grid; gap:4px; padding:10px; border:1px solid #1f2937; border-radius:10px; background:#0b1224; }
    body.agent-screen .lead-note-item p { margin:0; color:#e2e8f0; white-space:pre-wrap; word-break:break-word; }
    body.agent-screen .lead-note-item small { color:#94a3b8; font-size:12px; }
    body.agent-screen .lead-note-empty { color:#94a3b8; font-size:13px; }
    body.agent-screen .lead-note-register-button { width:100%; margin-top:8px; border-radius:8px; border:1px solid #2f6ca3; background:#2f6ca3; color:#f8fafc; padding:10px; font-weight:700; cursor:pointer; }
    body.agent-screen .lead-variable-chip, body.agent-screen .lead-attachment-item { border:1px solid #334155; border-radius:8px; background:#0f172a; padding:8px 10px; font-size:12px; color:#e2e8f0; word-break:break-word; }
    body.agent-screen .lead-variable-chip strong, body.agent-screen .lead-attachment-item strong { display:block; color:#94a3b8; font-size:11px; margin-bottom:4px; }
    body.agent-screen .lead-attachment-item a { color:#93c5fd; text-decoration:none; }
    body.agent-screen .lead-save-button { border-radius:8px; border:1px solid #334155; background:var(--handoff-user-bubble-bg, #2f6ca3); color:#f8fafc; font-weight:700; padding:11px 12px; cursor:pointer; }
    body.agent-screen .lead-drawer-status { color:#94a3b8; min-height:16px; }
    body.agent-screen .widget-chat { min-height:320px; max-height:min(420px,52vh); overflow:auto; padding:10px; border:1px solid #1f2937; border-radius:10px; display:flex; flex-direction:column; gap:10px; background:#0b1224; }
    body.agent-screen .live-message-row { display:flex; align-items:flex-end; gap:8px; }
    body.agent-screen .live-message-row.mine { justify-content:flex-end; }
    body.agent-screen .live-message-row.other { justify-content:flex-start; }
    body.agent-screen .live-message { border:1px solid #334155; border-radius:8px; padding:10px; background:#111827; max-width:82%; }
    body.agent-screen .live-message p { margin:6px 0; }
    body.agent-screen .live-message small { color:#94a3b8; display:block; margin-top:4px; }
    body.agent-screen .live-message.visitor { border-color:#35658e; background:#2f5f8a; }
    body.agent-screen .live-message.visitor strong { color:#f8fafc; }
    body.agent-screen .live-message.visitor p { color:#e2edf8; }
    body.agent-screen .live-message.visitor small { color:#b7cee3; }
    body.agent-screen .live-message.system { border-color:#26374c; background:#0f1a2a; max-width:100%; }
    body.agent-screen .live-message.system strong { color:#6f87a2; }
    body.agent-screen .live-message.system p { color:#8098b2; }
    body.agent-screen .live-message.system small { color:#6f8298; }
    body.agent-screen .msg-image { width:min(240px,100%); max-height:240px; object-fit:cover; border-radius:8px; border:1px solid rgba(148,163,184,.35); display:block; margin:6px 0; }
    body.agent-screen .message-avatar { width:28px; height:28px; border-radius:999px; border:1px solid #334155; background:#0f172a; display:inline-flex; align-items:center; justify-content:center; overflow:hidden; color:#cbd5e1; font-size:11px; font-weight:700; flex-shrink:0; }
    body.agent-screen .message-avatar img { width:100%; height:100%; object-fit:cover; }
    body.agent-screen .message-avatar--lead { border-color:#1b4f7b; background:#0f4f7f; color:#9ec2df; }
    body.agent-screen .message-avatar-icon { width:16px; height:16px; position:relative; display:inline-block; }
    body.agent-screen .message-avatar-icon-head { position:absolute; top:1px; left:5px; width:6px; height:6px; border-radius:999px; background:currentColor; }
    body.agent-screen .message-avatar-icon-body { position:absolute; left:2px; bottom:1px; width:12px; height:8px; border-radius:8px 8px 4px 4px; background:currentColor; }
    body.agent-screen .widget-input { display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center; }
    body.agent-screen .widget-input input, body.agent-screen .widget-input button { border-radius:8px; border:1px solid #334155; background:#0f172a; color:#f1f5f9; padding:10px; }
    body.agent-screen .widget-input button { font-weight:700; cursor:pointer; }
    body.agent-screen .attach-button { width:34px; height:34px; min-width:34px; padding:0; display:inline-flex; align-items:center; justify-content:center; border-radius:10px; font-size:20px; line-height:1; box-sizing:border-box; }
    body.agent-screen .attach-button-symbol { display:block; line-height:1; transform:translateY(-1px); }
    body.agent-screen .session-meta { color:#64748b; word-break:break-all; font-size:12px; }
    .shell { max-width: 880px; margin: 18px auto; padding: 12px; border:1px solid #d7dee8; border-radius:14px; background:var(--handoff-chat-bg); box-shadow: 0 18px 48px rgba(15,23,42,.12); }
    .shell.visitor { max-width: 520px; padding: 0; background: transparent; border: 0; box-shadow: none; }
    .top { display:flex; flex-direction:column; gap:6px; margin-bottom: 12px; }
    h2 { margin:0; font-size: 18px; color:#111827; }
    .meta { color:#64748b; font-size: 13px; line-height: 1.35; }
    .lead-info { margin: 8px 0 12px; display:flex; flex-wrap:wrap; gap:8px; }
    .chip { border:1px solid #e2e8f0; background:#fff; color:#334155; padding:6px 10px; border-radius:999px; font-size:12px; white-space:nowrap; }
    .shell .chat-wrap { border:1px solid #d7dee8; border-radius:12px; overflow:hidden; background:var(--handoff-page-bg); min-height: 64vh; display:flex; flex-direction:column; }
    .shell .chat { flex:1; overflow:auto; padding:12px; display:flex; flex-direction:column; gap:10px; color:#111827; }
    .shell .msg-row { display:flex; align-items:flex-end; gap:8px; }
    .shell .msg-row.visitor-row { justify-content:flex-end; }
    .shell .msg-row.agent-row { justify-content:flex-start; }
    .shell .msg-row.system-row { justify-content:center; }
    .shell .msg { max-width: 78%; border-radius:10px; padding:9px 11px; border:1px solid transparent; box-shadow:0 1px 0 rgba(15,23,42,.03); }
    .shell .msg strong { display:block; font-size:11px; color:#64748b; margin-bottom:2px; font-weight:600; text-transform:lowercase; }
    .shell .msg.visitor { background:var(--handoff-bot-bubble-bg); color:#111827; border-color:#e2e8f0; border-top-right-radius:4px; }
    .shell .msg.agent { background:var(--handoff-user-bubble-bg); color:#111827; border-top-left-radius:4px; }
    .shell .msg.system { max-width:100%; background:#f8fafc; border-color:#e2e8f0; color:#334155; }
    .shell .input { padding:10px; border-top:1px solid #d7dee8; display:grid; grid-template-columns:auto 1fr auto; gap:8px; background:var(--handoff-chat-bg); align-items:center; }
    .shell input, .shell button { border-radius:20px; border:1px solid #cbd5e1; padding:10px 14px; }
    .shell input { background:#fff; color:#334155; }
    .shell button { background:var(--handoff-accent); color:#fff; border-color:var(--handoff-accent); font-weight:700; cursor:pointer; }
    .image-picker-input { display:none; }
    .attach-button {
      width:40px; height:40px; min-width:40px; border-radius:999px; border:1px solid #cbd5e1; background:#fff; color:#334155;
      font-size:20px; line-height:1; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0;
      box-sizing:border-box;
    }
    .attach-button-symbol { display:block; line-height:1; transform:translateY(-1px); }

    .visitor-shell {
      --visitor-accent: ${themeUserBubbleBg.replace(/"/g, "")};
      width: 100vw;
      margin: 0;
      min-height: 100dvh;
      height: 100dvh;
      background: #ece5dd;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      padding: 0;
      box-sizing: border-box;
      position: relative;
    }
    .wait-overlay {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 20% 10%, rgba(255, 255, 255, 0.22), transparent 46%),
        radial-gradient(circle at 80% 90%, rgba(20, 184, 166, 0.2), transparent 44%),
        rgba(15, 23, 42, 0.22);
      backdrop-filter: blur(7px) saturate(115%);
      -webkit-backdrop-filter: blur(7px) saturate(115%);
      z-index: 30;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .wait-card {
      border: 1px solid rgba(255, 255, 255, 0.46);
      border-radius: 18px;
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.46));
      backdrop-filter: blur(10px) saturate(120%);
      -webkit-backdrop-filter: blur(10px) saturate(120%);
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.4);
      padding: 18px 14px;
      width: min(560px, 100%);
      position: relative;
      overflow: hidden;
    }
    .wait-card::before {
      content: "";
      position: absolute;
      top: -90px;
      right: -70px;
      width: 180px;
      height: 180px;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(20, 184, 166, 0.32), transparent 68%);
      pointer-events: none;
    }
    .wait-card::after {
      content: "";
      position: absolute;
      left: -80px;
      bottom: -90px;
      width: 200px;
      height: 200px;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(59, 130, 246, 0.25), transparent 68%);
      pointer-events: none;
    }
    .wait-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid #bbf7d0;
      color: #166534;
      background: #f0fdf4;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .wait-title {
      margin: 0;
      font-size: 20px;
      color: #0f172a;
      line-height: 1.3;
      position: relative;
      z-index: 1;
    }
    .wait-subtitle {
      margin: 8px 0 0;
      color: #475569;
      font-size: 14px;
      line-height: 1.5;
      position: relative;
      z-index: 1;
    }
    .wait-alert {
      margin-top: 12px;
      border: 1px solid rgba(250, 204, 21, 0.65);
      background: rgba(254, 249, 195, 0.72);
      color: #713f12;
      border-radius: 10px;
      padding: 10px;
      font-size: 13px;
      font-weight: 600;
      position: relative;
      z-index: 1;
    }
    .cache-panel {
      border: 1px solid rgba(148, 163, 184, 0.36);
      background: rgba(248, 250, 252, 0.42);
      border-radius: 10px;
      margin-top: 12px;
      padding: 8px;
      display:flex;
      flex-wrap:wrap;
      gap:6px;
      position: relative;
      z-index: 1;
    }
    .cache-chip {
      border:1px solid #cbd5e1;
      background:#fff;
      color:#334155;
      border-radius:999px;
      padding: 4px 8px;
      font-size: 11px;
      white-space: nowrap;
    }
    .wait-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      margin-top: 14px;
      position: relative;
      z-index: 1;
    }
    .whatsapp-btn {
      appearance: none;
      border: 1px solid #16a34a;
      background: #16a34a;
      color: #fff;
      border-radius: 10px;
      text-align: center;
      text-decoration: none;
      padding: 11px 12px;
      font-weight: 700;
      font-size: 14px;
    }
    .wait-note {
      margin: 0;
      color: #64748b;
      font-size: 12px;
      text-align: center;
    }
    .visitor-live-wrap {
      margin-top: 0;
      border: 0;
      border-radius: 0;
      overflow: hidden;
      background: #ece5dd;
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      height: 100dvh;
    }
    .visitor-live-head {
      padding: 10px 12px;
      border-bottom: 1px solid #cfd6de;
      color: #0f172a;
      font-weight: 700;
      font-size: 13px;
      background: #f0f2f5;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .visitor-head-meta { display:flex; flex-direction:column; gap:2px; }
    .visitor-head-title { font-size: 14px; font-weight: 700; color: #111827; }
    .visitor-head-sub { font-size: 11px; color:#64748b; }
    .visitor-live-wrap .chat {
      color:#111827;
      padding: 12px 10px 14px;
      gap: 10px;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      background: #ece5dd;
      display: flex;
      flex-direction: column;
    }
    .visitor-live-wrap .input {
      background:#f0f2f5;
      border-top: 1px solid #d7dee8;
      padding: 8px;
      flex-shrink: 0;
      z-index: 5;
      padding-bottom: calc(8px + env(safe-area-inset-bottom));
      display:grid;
      grid-template-columns:auto 1fr auto;
      gap:8px;
      align-items:center;
    }
    .visitor-live-wrap.locked .input {
      pointer-events: none;
      opacity: 0.55;
    }
    .visitor-live-wrap input {
      background:#fff;
      border-color:#cbd5e1;
      color:#334155;
      border-radius:20px;
      padding: 11px 14px;
      font-size: 16px;
      line-height: 1.2;
    }
    .visitor-live-wrap button {
      background: var(--visitor-accent, #128c7e);
      border-color: var(--visitor-accent, #128c7e);
      color:#fff;
      border-radius:20px;
      padding: 11px 16px;
      font-size: 16px;
      line-height: 1.2;
      white-space: nowrap;
    }
    .visitor-live-wrap .attach-button {
      width:40px;
      height:40px;
      min-width:40px;
      padding:0;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:#fff;
      color:var(--visitor-accent, #128c7e);
      border:1px solid #cbd5e1;
      font-size:20px;
      line-height:1;
    }
    .msg-row { display:flex; align-items:flex-end; gap:8px; }
    .msg-row.visitor-row { justify-content:flex-end; }
    .msg-row.agent-row { justify-content:flex-start; }
    .msg-row.system-row { justify-content:flex-start; }
    .visitor-live-wrap .msg {
      max-width: 78%;
      border-radius: 10px;
      border: 1px solid transparent;
      padding: 9px 11px;
      box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
    }
    .visitor-live-wrap .msg strong {
      display:block;
      font-size: 11px;
      color:#64748b;
      margin-bottom: 2px;
      font-weight: 600;
      text-transform: lowercase;
    }
    .visitor-live-wrap .msg.visitor {
      background:#dcf8c6;
      color:#111827;
      border-color: transparent;
      border-top-right-radius: 4px;
    }
    .visitor-live-wrap .msg.visitor strong { color:#4b5563; }
    .visitor-live-wrap .msg.agent, .visitor-live-wrap .msg.system {
      background:#fff;
      color:#111827;
      border-top-left-radius: 4px;
      border-color:#e2e8f0;
    }
    .msg-image {
      width: min(240px, 100%);
      max-height: 240px;
      border-radius: 8px;
      object-fit: cover;
      display: block;
    }
    .avatar {
      width: 26px;
      height: 26px;
      border-radius: 999px;
      object-fit: cover;
      border: 1px solid #cbd5e1;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .avatar-fallback {
      width: 26px;
      height: 26px;
      border-radius: 999px;
      background: #334155;
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 10px;
      text-transform: uppercase;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .warn { padding:12px; color:#fecaca; font-size: 13px; }
    @media (min-width: 900px) {
      body { display:grid; place-items:center; background: rgba(15, 23, 42, 0.5); min-height: 100vh; }
      body.agent-screen { background:#0b1224; display:grid; place-items:center; }
      body.agent-screen .agent-widget { margin:0 auto; }
      .visitor-shell {
        width: min(460px, 92vw);
        min-height: min(860px, 92vh);
        max-height: 92vh;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 22px 60px rgba(15, 23, 42, 0.35);
      }
      .visitor-live-wrap {
        min-height: min(860px, 92vh);
        height: min(860px, 92vh);
      }
      .visitor-live-wrap .chat {
        flex: 1;
        min-height: 0;
      }
      .wait-overlay {
        border-radius: 16px;
        backdrop-filter: blur(9px) saturate(115%);
        -webkit-backdrop-filter: blur(9px) saturate(115%);
      }
    }
  </style>
</head>
<body class="${isAgentMode ? "agent-screen" : ""}">
  ${
    isAgentMode
      ? `<div class="agent-widget">
    <div class="widget-header">
      <div class="lead-header-main">
        <strong id="leadTitle">${escapedName}</strong>
        <span>Você está conversando com o visitante em tempo real</span>
      </div>
      <div class="lead-header-actions">
        <button type="button" id="leadAttachmentsHeaderButton" class="lead-info-button" title="Anexos do lead" aria-label="Abrir anexos do lead">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 6.5v9a4.5 4.5 0 0 1-9 0v-10a3 3 0 0 1 6 0v9a1.5 1.5 0 0 1-3 0V7h-1.5v8.5a3 3 0 0 0 6 0v-10a4.5 4.5 0 0 0-9 0v10a6 6 0 0 0 12 0V6.5h-1.5Z"/></svg>
        </button>
        <button type="button" id="leadNotesHeaderButton" class="lead-info-button" title="Observações do lead" aria-label="Abrir observações do lead">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L18.5 9H14V4.5ZM8 13h8v1.5H8V13Zm0 3.5h8V18H8v-1.5Z"/></svg>
        </button>
        <button type="button" id="leadInfoButton" class="lead-info-button" title="Dados do lead" aria-label="Abrir dados do lead">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/></svg>
        </button>
      </div>
    </div>
    <div id="chat" class="widget-chat agent-chat"></div>
    <form id="form" class="widget-input">
      <input id="imagePicker" class="image-picker-input" type="file" accept="image/*" />
      <button type="button" id="attachButton" class="attach-button" title="Enviar imagem" style="background:${themeUserBubbleBg};border-color:${themeUserBubbleBg};color:${agentBubbleTextColor};"><span class="attach-button-symbol">+</span></button>
      <input id="message" placeholder="Digite sua resposta..." />
      <button type="submit" style="background:${themeUserBubbleBg};border-color:${themeUserBubbleBg};color:${agentBubbleTextColor};">Enviar</button>
    </form>
    <small class="session-meta" id="sessionMeta">${sessionMetaLabel.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</small>
    <div id="leadDrawerOverlay" class="lead-drawer-overlay" aria-hidden="true">
      <aside id="leadDrawerPanel" class="lead-drawer-panel" role="dialog" aria-labelledby="leadDrawerTitle">
        <div class="lead-drawer-head">
          <strong id="leadDrawerTitle">Contato</strong>
          <button type="button" id="leadDrawerClose" class="lead-drawer-close" aria-label="Fechar painel">×</button>
        </div>
        <div class="lead-drawer-body">
          <div class="lead-profile-card">
            <div class="lead-profile-avatar" id="leadProfileAvatar">L</div>
            <div class="lead-profile-meta">
              <strong id="leadProfileName">Visitante</strong>
              <span class="lead-profile-sub">Lead em atendimento ao vivo</span>
            </div>
          </div>
          <ul class="lead-fact-list">
            <li>
              <span class="lead-fact-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.9 15.9 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.24 1Z"/></svg>
              </span>
              <span class="lead-fact-text"><small>WhatsApp</small><span id="leadWhatsappPreview">Indisponível</span></span>
              <button type="button" id="leadWhatsappCopy" class="lead-fact-copy" aria-label="Copiar WhatsApp" title="Copiar WhatsApp">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v16h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 18H8V7h11v16Z"/></svg>
              </button>
            </li>
          </ul>
          <div class="lead-toolbar">
            <button type="button" class="lead-toolbar-button" data-open-section="contact" aria-label="Editar dados" title="Editar dados">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm18-11.5a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13Z"/></svg>
            </button>
            <button type="button" class="lead-toolbar-button" data-open-section="assign" aria-label="Atribuir atendente" title="Atribuir atendente">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11c1.7 0 3-1.3 3-3S17.7 5 16 5s-3 1.3-3 3 1.3 3 3 3Zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3Zm0 2c-2.3 0-7 1.2-7 3.5V18h8v-2.5C9 15.2 8.3 14.4 8 14Zm8 0c-.3 0-1.2.4-2 2.5V18h7v-2.5C21 14.2 16.3 13 14 13Z"/></svg>
            </button>
            <button type="button" class="lead-toolbar-button" data-open-section="attachments" aria-label="Anexos" title="Anexos">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 6.5v9a4.5 4.5 0 0 1-9 0v-10a3 3 0 0 1 6 0v9a1.5 1.5 0 0 1-3 0V7h-1.5v8.5a3 3 0 0 0 6 0v-10a4.5 4.5 0 0 0-9 0v10a6 6 0 0 0 12 0V6.5h-1.5Z"/></svg>
            </button>
            <button type="button" class="lead-toolbar-button" data-open-section="notes" aria-label="Observações" title="Observações">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L18.5 9H14V4.5ZM8 13h8v1.5H8V13Zm0 3.5h8V18H8v-1.5Z"/></svg>
            </button>
          </div>
          <div class="lead-accordion">
            <section class="lead-accordion-item" data-lead-section="contact">
              <button type="button" class="lead-accordion-trigger" aria-expanded="false"><span class="lead-accordion-label">Dados do contato</span><span class="lead-accordion-icon">+</span></button>
              <div class="lead-accordion-panel">
                <label class="lead-field"><span>Nome do lead</span><input id="leadNameInput" /></label>
                <label class="lead-field"><span>WhatsApp</span><input id="leadWhatsappInput" inputmode="tel" /></label>
              </div>
            </section>
            <section class="lead-accordion-item" data-lead-section="assign">
              <button type="button" class="lead-accordion-trigger" aria-expanded="false"><span class="lead-accordion-label">Atribuição</span><span class="lead-accordion-icon">+</span></button>
              <div class="lead-accordion-panel">
                <label class="lead-field"><span>Atribuir para outro atendente</span><select id="leadAssignSelect"><option value="">Manter atendente atual</option></select></label>
              </div>
            </section>
            <section class="lead-accordion-item" data-lead-section="variables">
              <button type="button" class="lead-accordion-trigger" aria-expanded="false"><span class="lead-accordion-label">Informações do Typebot</span><span class="lead-accordion-icon">+</span></button>
              <div class="lead-accordion-panel"><div id="leadVariablesList" class="lead-variables-list"></div></div>
            </section>
            <section class="lead-accordion-item" data-lead-section="notes">
              <button type="button" class="lead-accordion-trigger" aria-expanded="false"><span class="lead-accordion-label">Observações do atendimento</span><span class="lead-accordion-icon">+</span></button>
              <div class="lead-accordion-panel">
                <label class="lead-field"><span>Registro interno</span><textarea id="leadNotesInput" rows="5" placeholder="Descreva a observação..."></textarea></label>
                <button type="button" id="leadNotesRegisterButton" class="lead-note-register-button">Registrar observação</button>
                <div id="leadNotesHistory" class="lead-notes-history"></div>
              </div>
            </section>
            <section class="lead-accordion-item" data-lead-section="attachments">
              <button type="button" class="lead-accordion-trigger" aria-expanded="false"><span class="lead-accordion-label">Anexos</span><span class="lead-accordion-icon">+</span></button>
              <div class="lead-accordion-panel">
                <label class="lead-field"><span>Imagens e documentos</span><input id="leadFilesInput" type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" multiple /></label>
                <div id="leadAttachmentsList" class="lead-attachments-list"></div>
              </div>
            </section>
          </div>
        </div>
        <div class="lead-drawer-footer">
          <button type="button" id="leadSaveButton" class="lead-save-button">Salvar alterações</button>
          <small id="leadDrawerStatus" class="lead-drawer-status"></small>
        </div>
      </aside>
    </div>
  </div>`
      : `<div class="visitor-shell">
    <div id="waitOverlay" class="wait-overlay">
      <div id="waitCard" class="wait-card">
        <div class="wait-badge">● Atendimento ao vivo ativo</div>
        <h1 class="wait-title">Você está na fila e um atendente já está com o seu atendimento.</h1>
        <p class="wait-subtitle">
          Aguarde nesta tela para continuar o atendimento. Em instantes você será atendido.
        </p>
        <div class="wait-alert">Não feche esta página para não perder sua posição na fila.</div>
        <div id="cachePanel" class="cache-panel" style="${leadContextEntries.length > 0 ? "" : "display:none;"}">${leadContextEntries
        .map(
          (item) =>
            `<span class="cache-chip">${item.key.replace(/</g, "&lt;").replace(/>/g, "&gt;")}: ${item.value
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")}</span>`,
        )
        .join("")}</div>
        ${
          useWhatsappSecondOption
            ? `<div class="wait-actions">
          <a id="whatsButton" class="whatsapp-btn" href="#" target="_blank" rel="noopener noreferrer">Quero atendimento imediato no WhatsApp</a>
          <p class="wait-note">Ao clicar, abriremos o WhatsApp com seus dados já preenchidos.</p>
        </div>`
            : ""
        }
      </div>
    </div>
    <div id="visitorLiveWrap" class="visitor-live-wrap locked">
      <div class="visitor-live-head">
        ${safeProfileImageTag}
        <div class="visitor-head-meta">
          <div class="visitor-head-title">${tenantDisplayName.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          <div class="visitor-head-sub">Atendente conectado</div>
        </div>
      </div>
      <div id="chat" class="chat"></div>
      <form id="form" class="input">
        <input id="imagePicker" class="image-picker-input" type="file" accept="image/*" />
        <button type="button" id="attachButton" class="attach-button" title="Enviar imagem"><span class="attach-button-symbol">+</span></button>
        <input id="message" placeholder="Digite sua mensagem..." />
        <button type="submit">Enviar</button>
      </form>
    </div>
  </div>`
  }
  <script>
    const tenantId = ${JSON.stringify(tenantId)};
    const contactId = ${JSON.stringify(contactId)};
    const senderRole = ${JSON.stringify(senderRole)};
    const isAgentMode = ${JSON.stringify(isAgentMode)};
    const sessionAgentId = ${JSON.stringify(agentId)};
    const sessionAgentName = ${JSON.stringify(agentName)};
    const tenantChatLabel = ${JSON.stringify(tenantDisplayName)};
    const tenantBubbleColor = ${JSON.stringify(themeUserBubbleBg)};
    const tenantBubbleText = ${JSON.stringify(agentBubbleTextColor)};
    const tenantLogoUrl = ${JSON.stringify(safeAgentLogoUrl)};
    const tenantAvatarInitials = ${JSON.stringify(agentAvatarInitials)};
    const chat = document.getElementById("chat");
    const form = document.getElementById("form");
    const messageInput = document.getElementById("message");
    const whatsButton = document.getElementById("whatsButton");
    const cachePanel = document.getElementById("cachePanel");
    const waitCard = document.getElementById("waitCard");
    const waitOverlay = document.getElementById("waitOverlay");
    const visitorLiveWrap = document.getElementById("visitorLiveWrap");
    const initialLeadContext = ${JSON.stringify(leadContextJson)};
    const whatsappPhone = ${JSON.stringify(tenantWhatsapp || "5551997462102")};
    const cacheStorageKey = ["wabaLeadContext", tenantId, ${JSON.stringify(flow)}, ${JSON.stringify(contactName)}].join(":");
    let visitorChatEnabled = isAgentMode;

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function formatMessageContent(content) {
      const raw = String(content || "").trim();
      if (raw.startsWith("data:image/")) {
        return '<img class="msg-image" src="' + raw + '" alt="Imagem enviada no chat" />';
      }
      const safe = escapeHtml(raw);
      const linkRegex = new RegExp("((https?:\\\\/\\\\/|www\\\\.)[^\\\\s<]+)", "gi");
      return safe.replace(
        linkRegex,
        (url) => {
          const href = url.startsWith("http://") || url.startsWith("https://") ? url : "https://" + url;
          return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + url + "</a>";
        },
      );
    }

    function normalizeLeadContext(input) {
      if (!input || typeof input !== "object") return {};
      const entries = Object.entries(input)
        .filter(([key, value]) => key && String(value ?? "").trim())
        .slice(0, 40);
      return Object.fromEntries(entries.map(([key, value]) => [String(key), String(value)]));
    }

    function renderLeadCache(contextMap) {
      if (!cachePanel) return;
      const entries = Object.entries(contextMap);
      if (entries.length === 0) {
        cachePanel.style.display = "none";
        cachePanel.innerHTML = "";
        return;
      }
      cachePanel.style.display = "flex";
      cachePanel.innerHTML = entries
        .map(([key, value]) => '<span class="cache-chip">' + escapeHtml(key) + ': ' + escapeHtml(value) + "</span>")
        .join("");
    }

    function loadAndPersistLeadCache() {
      let contextFromQuery = {};
      try {
        const parsed = JSON.parse(initialLeadContext || "{}");
        contextFromQuery = normalizeLeadContext(parsed);
      } catch {
        contextFromQuery = {};
      }

      let contextFromStorage = {};
      try {
        const stored = localStorage.getItem(cacheStorageKey);
        contextFromStorage = normalizeLeadContext(stored ? JSON.parse(stored) : {});
      } catch {
        contextFromStorage = {};
      }

      const resolvedContext = Object.keys(contextFromQuery).length > 0 ? contextFromQuery : contextFromStorage;
      renderLeadCache(resolvedContext);

      if (Object.keys(resolvedContext).length > 0) {
        try {
          localStorage.setItem(cacheStorageKey, JSON.stringify(resolvedContext));
        } catch {}
      }

      if (whatsButton) {
        const summary = Object.entries(resolvedContext)
          .map(([key, value]) => "- " + key + ": " + value)
          .join("\\n");
        const message = summary
          ? "Olá, tenho interesse no " +
            encodeURIComponent(${JSON.stringify(flow)}) +
            ".%0A%0ADados informados:%0A" +
            encodeURIComponent(summary)
          : "Olá, tenho interesse no " + encodeURIComponent(${JSON.stringify(flow)}) + ".";
        whatsButton.href = "https://wa.me/" + whatsappPhone + "?text=" + message;
      }
    }

    function setVisitorChatEnabled(enabled) {
      visitorChatEnabled = enabled;
      if (isAgentMode) return;
      if (waitCard) waitCard.style.display = enabled ? "none" : "block";
      if (waitOverlay) waitOverlay.style.display = enabled ? "none" : "flex";
      if (visitorLiveWrap) {
        if (enabled) visitorLiveWrap.classList.remove("locked");
        else visitorLiveWrap.classList.add("locked");
      }
    }

    async function syncVisitorSessionState() {
      if (isAgentMode) return;
      const response = await fetch("/api/chat/queue/" + contactId + "?t=" + Date.now(), {
        cache: "no-store",
        headers: { "x-tenant-id": tenantId }
      });
      if (!response.ok) return;
      const data = await response.json();
      setVisitorChatEnabled(data.status === "in_service");
    }

    function roleLabel(sender) {
      if (sender === "visitor") return "você";
      if (sender === "agent") return "atendente";
      return "sistema";
    }

    function formatCreatedAt(value) {
      try {
        return new Date(value).toLocaleString("pt-BR");
      } catch {
        return "";
      }
    }

    function senderTitle(sender) {
      if (sender === "visitor") return "Cliente";
      if (sender === "agent") return tenantChatLabel;
      return "Sistema";
    }

    function buildLeadAvatarNode() {
      const avatar = document.createElement("span");
      avatar.className = "message-avatar message-avatar--lead";
      avatar.setAttribute("aria-hidden", "true");
      avatar.innerHTML =
        '<span class="message-avatar-icon"><span class="message-avatar-icon-head"></span><span class="message-avatar-icon-body"></span></span>';
      return avatar;
    }

    function buildAgentAvatarNode() {
      const avatar = document.createElement("span");
      avatar.className = "message-avatar message-avatar--right";
      avatar.setAttribute("aria-hidden", "true");
      if (tenantLogoUrl) {
        const img = document.createElement("img");
        img.src = tenantLogoUrl;
        img.alt = tenantChatLabel;
        avatar.appendChild(img);
      } else {
        avatar.textContent = tenantAvatarInitials;
      }
      return avatar;
    }

    async function loadMessages() {
      const response = await fetch("/api/chat/sessions/" + contactId + "/messages?t=" + Date.now(), {
        cache: "no-store",
        headers: { "x-tenant-id": tenantId }
      });
      if (!response.ok) return;
      const data = await response.json();
      if (isAgentMode) {
        void refreshSessionMeta(data);
      }
      if (!isAgentMode && !visitorChatEnabled) {
        const hasLiveStartSignal = data.some(
          (item) =>
            item?.sender === "agent" ||
            (item?.sender === "system" && String(item?.content ?? "").toLowerCase().includes("assumido")),
        );
        if (hasLiveStartSignal) setVisitorChatEnabled(true);
      }
      chat.innerHTML = "";
      data.forEach((item) => {
        if (isAgentMode) {
          const row = document.createElement("div");
          row.className = "live-message-row " + (item.sender === "agent" ? "mine" : "other");
          if (item.sender === "agent") row.appendChild(buildAgentAvatarNode());
          if (item.sender === "visitor") row.appendChild(buildLeadAvatarNode());
          const bubble = document.createElement("div");
          bubble.className = "live-message " + item.sender + " " + (item.sender === "agent" ? "mine" : "other");
          if (item.sender === "agent") {
            bubble.style.background = tenantBubbleColor;
            bubble.style.borderColor = tenantBubbleColor;
            bubble.style.color = tenantBubbleText;
          }
          const title = document.createElement("strong");
          title.textContent = senderTitle(item.sender);
          bubble.appendChild(title);
          const bodyWrap = document.createElement("div");
          bodyWrap.innerHTML = formatMessageContent(item.content);
          bubble.appendChild(bodyWrap);
          const stamp = document.createElement("small");
          stamp.textContent = formatCreatedAt(item.createdAt);
          if (item.sender === "agent") {
            stamp.style.color = tenantBubbleText;
            stamp.style.opacity = "0.84";
          }
          bubble.appendChild(stamp);
          row.appendChild(bubble);
          chat.appendChild(row);
          return;
        }
        const row = document.createElement("div");
        row.className = "msg-row " + (item.sender === "visitor" ? "visitor-row" : item.sender === "agent" ? "agent-row" : "system-row");
        const div = document.createElement("div");
        div.className = "msg " + item.sender;
        div.innerHTML = "<strong>" + roleLabel(item.sender) + "</strong><div>" + formatMessageContent(item.content) + "</div>";
        if (item.sender === "agent" || item.sender === "system") {
          const avatarWrap = document.createElement("div");
          avatarWrap.innerHTML = ${JSON.stringify(safeProfileImageTag)};
          row.appendChild(avatarWrap.firstChild);
        }
        row.appendChild(div);
        chat.appendChild(row);
      });
      const images = chat.querySelectorAll("img.msg-image");
      images.forEach((img) => {
        if (img.complete) return;
        img.addEventListener(
          "load",
          () => {
            chat.scrollTop = chat.scrollHeight;
          },
          { once: true },
        );
      });
      chat.scrollTop = chat.scrollHeight;
    }

    const imagePicker = document.getElementById("imagePicker");
    const attachButton = document.getElementById("attachButton");
    const MAX_IMAGE_SIDE = 900;
    const IMAGE_JPEG_QUALITY = 0.78;
    const MAX_IMAGE_PAYLOAD_LENGTH = 260000;

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
    }

    function compressImageDataUrl(dataUrl) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const ratio = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
          const targetWidth = Math.max(1, Math.round(image.width * ratio));
          const targetHeight = Math.max(1, Math.round(image.height * ratio));
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const context = canvas.getContext("2d");
          if (!context) return reject(new Error("canvas failed"));
          context.drawImage(image, 0, 0, targetWidth, targetHeight);
          resolve(canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY));
        };
        image.onerror = () => reject(new Error("invalid image"));
        image.src = dataUrl;
      });
    }

    async function sendMessageContent(content) {
      await fetch("/api/chat/sessions/" + contactId + "/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ sender: senderRole, content })
      });
      loadMessages();
    }

    if (attachButton && imagePicker) {
      attachButton.addEventListener("click", () => imagePicker.click());
      imagePicker.addEventListener("change", async () => {
        const file = imagePicker.files && imagePicker.files[0];
        imagePicker.value = "";
        if (!file || !String(file.type || "").startsWith("image/")) return;
        if (!isAgentMode && !visitorChatEnabled) return;
        try {
          const raw = await readFileAsDataUrl(file);
          const compressed = await compressImageDataUrl(raw);
          if (compressed.length > MAX_IMAGE_PAYLOAD_LENGTH) return;
          await sendMessageContent(compressed);
        } catch {}
      });
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!isAgentMode && !visitorChatEnabled) return;
      const content = messageInput.value.trim();
      if (!content) return;
      await sendMessageContent(content);
      messageInput.value = "";
    });

    let leadDrawerContact = null;
    let leadAttendants = [];
    const leadTitle = document.getElementById("leadTitle");
    const leadInfoButton = document.getElementById("leadInfoButton");
    const leadAttachmentsHeaderButton = document.getElementById("leadAttachmentsHeaderButton");
    const leadNotesHeaderButton = document.getElementById("leadNotesHeaderButton");
    const leadDrawerOverlay = document.getElementById("leadDrawerOverlay");
    const leadDrawerClose = document.getElementById("leadDrawerClose");
    const leadNameInput = document.getElementById("leadNameInput");
    const leadWhatsappInput = document.getElementById("leadWhatsappInput");
    const leadAssignSelect = document.getElementById("leadAssignSelect");
    const leadFilesInput = document.getElementById("leadFilesInput");
    const leadAttachmentsList = document.getElementById("leadAttachmentsList");
    const leadVariablesList = document.getElementById("leadVariablesList");
    const leadNotesInput = document.getElementById("leadNotesInput");
    const leadNotesHistory = document.getElementById("leadNotesHistory");
    const leadNotesRegisterButton = document.getElementById("leadNotesRegisterButton");
    const leadSaveButton = document.getElementById("leadSaveButton");
    const leadDrawerStatus = document.getElementById("leadDrawerStatus");
    const leadProfileAvatar = document.getElementById("leadProfileAvatar");
    const leadProfileName = document.getElementById("leadProfileName");
    const leadWhatsappPreview = document.getElementById("leadWhatsappPreview");
    const leadWhatsappCopy = document.getElementById("leadWhatsappCopy");
    const sessionMeta = document.getElementById("sessionMeta");

    function formatSessionMetaLabel(startedAt, agentLabel) {
      const formattedDate = formatCreatedAt(startedAt);
      const normalizedAgent = String(agentLabel || "").trim();
      if (!formattedDate && !normalizedAgent) return "";
      if (!formattedDate) return "Atendente: " + normalizedAgent;
      if (!normalizedAgent) return "Atendimento iniciado em " + formattedDate;
      return "Atendimento iniciado em " + formattedDate + " | Atendente: " + normalizedAgent;
    }

    function resolveServiceStartedAtFromMessages(messages, contact) {
      const assignmentMessage = (messages || []).find(
        (item) =>
          item?.sender === "system" && String(item?.content || "").toLowerCase().includes("atendimento assumido"),
      );
      if (assignmentMessage?.createdAt) return assignmentMessage.createdAt;
      if (contact?.status === "in_service" && contact?.updatedAt) return contact.updatedAt;
      return String(contact?.updatedAt || "").trim();
    }

    async function refreshSessionMeta(messages) {
      if (!isAgentMode || !sessionMeta) return;
      const queueResponse = await fetch("/api/chat/queue/" + contactId + "?t=" + Date.now(), {
        cache: "no-store",
        headers: { "x-tenant-id": tenantId },
      });
      if (!queueResponse.ok) return;
      const contact = await queueResponse.json();
      const startedAt = resolveServiceStartedAtFromMessages(messages, contact);
      const agentLabel = resolveAttendantDisplayName(
        {
          username: sessionAgentId,
          displayName: String(contact?.assignedAgentName || sessionAgentName || "").trim(),
        },
        {
          assignedAgentId: String(contact?.assignedAgentId || "").trim(),
          assignedAgentName: String(contact?.assignedAgentName || "").trim(),
          sessionAgentId,
          sessionAgentName,
        },
      );
      sessionMeta.textContent = formatSessionMetaLabel(startedAt, agentLabel);
    }

    function getLeadInitials(value) {
      return (
        String(value || "")
          .trim()
          .split(/\\s+/)
          .filter(Boolean)
          .map((part) => part[0] || "")
          .join("")
          .slice(0, 2)
          .toUpperCase() || "L"
      );
    }

    function pickLeadWhatsappFromContext(context) {
      const source = context && typeof context === "object" ? context : {};
      const preferredKeys = ["WhatsApp", "Whatsapp", "whatsapp", "telefone", "celular", "phone", "fone"];
      for (const key of preferredKeys) {
        const value = String(source[key] || "").trim();
        if (value) return value;
      }
      for (const [key, value] of Object.entries(source)) {
        const normalized = String(key || "").trim().toLowerCase();
        if (!["whatsapp", "telefone", "celular", "phone", "fone"].includes(normalized)) continue;
        const resolved = String(value || "").trim();
        if (resolved) return resolved;
      }
      return "";
    }

    function resolveLeadWhatsappDisplay(leadWhatsapp, context) {
      const direct = String(leadWhatsapp || "").trim();
      if (direct) return direct;
      return pickLeadWhatsappFromContext(context);
    }

    function syncLeadProfilePreview() {
      const name = leadNameInput ? String(leadNameInput.value || "").trim() : "";
      const whatsapp = resolveLeadWhatsappDisplay(
        leadWhatsappInput ? leadWhatsappInput.value : "",
        leadDrawerContact?.leadContext,
      );
      if (leadProfileAvatar) leadProfileAvatar.textContent = getLeadInitials(name);
      if (leadProfileName) leadProfileName.textContent = name || "Visitante";
      if (leadWhatsappPreview) leadWhatsappPreview.textContent = whatsapp || "Indisponível";
      if (leadWhatsappCopy) leadWhatsappCopy.disabled = !whatsapp;
    }

    function setLeadAccordionOpen(section, open) {
      const item = document.querySelector('[data-lead-section="' + section + '"]');
      if (!item) return;
      if (open) item.classList.add("open");
      else item.classList.remove("open");
      const trigger = item.querySelector(".lead-accordion-trigger");
      if (trigger) trigger.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function initLeadAccordion() {
      document.querySelectorAll(".lead-accordion-item").forEach((item) => {
        const trigger = item.querySelector(".lead-accordion-trigger");
        if (!trigger) return;
        trigger.addEventListener("click", () => {
          const expanded = item.classList.toggle("open");
          trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
        });
      });
      document.querySelectorAll("[data-open-section]").forEach((button) => {
        button.addEventListener("click", () => {
          const section = String(button.getAttribute("data-open-section") || "").trim();
          if (!section) return;
          const item = document.querySelector('[data-lead-section="' + section + '"]');
          const isOpen = item ? item.classList.contains("open") : false;
          setLeadAccordionOpen(section, !isOpen);
        });
      });
    }

    function setLeadDrawerStatus(text) {
      if (!leadDrawerStatus) return;
      leadDrawerStatus.textContent = String(text || "");
    }

    function openLeadDrawer(section) {
      if (!leadDrawerOverlay) return;
      leadDrawerOverlay.classList.add("open");
      leadDrawerOverlay.setAttribute("aria-hidden", "false");
      if (section) setLeadAccordionOpen(section, true);
      void refreshLeadDrawer();
    }

    function closeLeadDrawer() {
      if (!leadDrawerOverlay) return;
      leadDrawerOverlay.classList.remove("open");
      leadDrawerOverlay.setAttribute("aria-hidden", "true");
      setLeadDrawerStatus("");
    }

    function renderLeadVariables(contextMap) {
      if (!leadVariablesList) return;
      const entries = Object.entries(contextMap || {}).filter(([key, value]) => key && String(value ?? "").trim());
      if (entries.length === 0) {
        leadVariablesList.innerHTML = '<div class="lead-variable-chip"><strong>Sem variáveis registradas</strong></div>';
        return;
      }
      leadVariablesList.innerHTML = entries
        .map(
          ([key, value]) =>
            '<div class="lead-variable-chip"><strong>' +
            escapeHtml(key) +
            "</strong>" +
            escapeHtml(String(value)) +
            "</div>",
        )
        .join("");
    }

    function renderLeadNotesHistory(notes) {
      if (!leadNotesHistory) return;
      const items = Array.isArray(notes) ? notes : [];
      if (items.length === 0) {
        leadNotesHistory.innerHTML = '<div class="lead-note-empty">Nenhuma observação registrada ainda.</div>';
        syncLeadToolbarIndicators();
        return;
      }
      leadNotesHistory.innerHTML = items
        .map((item) => {
          const createdAt = formatCreatedAt(item.createdAt);
          const text = escapeHtml(String(item.text || ""));
          const author = escapeHtml(String(item.authorName || "").trim());
          const meta = author ? createdAt + " · " + author : createdAt;
          return '<article class="lead-note-item"><small>' + meta + '</small><p>' + text + '</p></article>';
        })
        .join("");
      syncLeadToolbarIndicators();
    }

    function renderLeadAttachments(attachments) {
      if (!leadAttachmentsList) return;
      const items = Array.isArray(attachments) ? attachments : [];
      if (items.length === 0) {
        leadAttachmentsList.innerHTML = "";
        syncLeadToolbarIndicators();
        return;
      }
      leadAttachmentsList.innerHTML = items
        .map((item) => {
          const fileName = escapeHtml(item.fileName || "arquivo");
          const mimeType = String(item.mimeType || "");
          const content = String(item.content || "").replace(/"/g, "&quot;");
          if (mimeType.startsWith("image/") || String(item.content || "").startsWith("data:image/")) {
            return (
              '<div class="lead-attachment-item"><strong>' +
              fileName +
              '</strong><img class="msg-image" src="' +
              content +
              '" alt="' +
              fileName +
              '" /></div>'
            );
          }
          return (
            '<div class="lead-attachment-item"><strong>' +
            fileName +
            '</strong><a href="' +
            content +
            '" download="' +
            fileName +
            '">Baixar</a></div>'
          );
        })
        .join("");
      syncLeadToolbarIndicators();
    }

    function syncLeadToolbarIndicators() {
      const attachmentsButton = document.querySelector('[data-open-section="attachments"]');
      const notesButton = document.querySelector('[data-open-section="notes"]');
      const hasAttachments =
        Array.isArray(leadDrawerContact?.attachments) && leadDrawerContact.attachments.length > 0;
      const hasNotes = Array.isArray(leadDrawerContact?.agentNotesHistory) && leadDrawerContact.agentNotesHistory.length > 0;
      if (attachmentsButton) attachmentsButton.classList.toggle("lead-toolbar-button--active", hasAttachments);
      if (notesButton) notesButton.classList.toggle("lead-toolbar-button--active", hasNotes);
      if (leadAttachmentsHeaderButton) {
        leadAttachmentsHeaderButton.classList.toggle("lead-info-button--active", hasAttachments);
      }
      if (leadNotesHeaderButton) {
        leadNotesHeaderButton.classList.toggle("lead-info-button--active", hasNotes);
      }
    }

    function applyLeadContactToDrawer(contact) {
      leadDrawerContact = contact;
      if (leadNameInput) leadNameInput.value = String(contact?.contactName || "");
      if (leadWhatsappInput) {
        leadWhatsappInput.value = resolveLeadWhatsappDisplay(contact?.leadWhatsapp, contact?.leadContext);
      }
      if (leadNotesInput) leadNotesInput.value = "";
      if (leadTitle) leadTitle.textContent = String(contact?.contactName || leadTitle.textContent || "Visitante");
      syncLeadProfilePreview();
      renderLeadVariables(contact?.leadContext || {});
      renderLeadAttachments(contact?.attachments || []);
      renderLeadNotesHistory(contact?.agentNotesHistory || []);
      syncLeadToolbarIndicators();
    }

    function looksLikeEmail(value) {
      return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(value || "").trim());
    }

    function resolveAttendantDisplayName(attendant, hints) {
      const source = hints && typeof hints === "object" ? hints : {};
      const username = String(attendant?.username || "").trim();
      const usernameKey = username.toLowerCase();
      const displayName = String(attendant?.displayName || "").trim();
      const assignedAgentId = String(source.assignedAgentId || "").trim().toLowerCase();
      const assignedAgentName = String(source.assignedAgentName || "").trim();
      const sessionId = String(source.sessionAgentId || "").trim().toLowerCase();
      const sessionName = String(source.sessionAgentName || "").trim();
      if (displayName && !looksLikeEmail(displayName)) return displayName;
      if (usernameKey && usernameKey === assignedAgentId && assignedAgentName && !looksLikeEmail(assignedAgentName)) {
        return assignedAgentName;
      }
      if (usernameKey && usernameKey === sessionId && sessionName && !looksLikeEmail(sessionName)) {
        return sessionName;
      }
      if (looksLikeEmail(username)) {
        const prefix = username.split("@")[0];
        if (prefix) return prefix.trim();
      }
      return username;
    }

    async function loadLeadAttendants() {
      if (!isAgentMode || !leadAssignSelect) return;
      const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenantId) + "/attendants?t=" + Date.now(), {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      leadAttendants = Array.isArray(data) ? data : [];
      const currentAssigned = String(leadDrawerContact?.assignedAgentId || "").trim().toLowerCase();
      const currentAssignedName = String(leadDrawerContact?.assignedAgentName || "").trim();
      const labelHints = {
        assignedAgentId: currentAssigned,
        assignedAgentName: currentAssignedName,
        sessionAgentId,
        sessionAgentName,
      };
      leadAssignSelect.innerHTML = '<option value="">Manter atendente atual</option>';
      leadAttendants.forEach((attendant) => {
        const username = String(attendant.username || "").trim();
        if (!username) return;
        const displayName = resolveAttendantDisplayName(attendant, labelHints);
        const option = document.createElement("option");
        option.value = username;
        option.textContent = displayName;
        if (username.toLowerCase() === currentAssigned) option.textContent = displayName + " (atual)";
        leadAssignSelect.appendChild(option);
      });
    }

    async function refreshLeadDrawer() {
      if (!isAgentMode) return;
      setLeadDrawerStatus("Carregando dados do lead...");
      const response = await fetch("/api/chat/queue/" + contactId + "?t=" + Date.now(), {
        cache: "no-store",
        headers: { "x-tenant-id": tenantId },
      });
      if (!response.ok) {
        setLeadDrawerStatus("Não foi possível carregar os dados do lead.");
        return;
      }
      const contact = await response.json();
      applyLeadContactToDrawer(contact);
      await loadLeadAttendants();
      setLeadDrawerStatus("");
    }

    async function registerLeadNote() {
      if (!isAgentMode) return true;
      const text = leadNotesInput ? String(leadNotesInput.value || "").trim() : "";
      if (!text) return true;
      setLeadDrawerStatus("Registrando observação...");
      const response = await fetch("/api/chat/queue/" + contactId + "/notes", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ text, authorName: sessionAgentName, authorId: sessionAgentId }),
      });
      if (!response.ok) {
        setLeadDrawerStatus("Falha ao registrar observação.");
        return false;
      }
      applyLeadContactToDrawer(await response.json());
      setLeadDrawerStatus("Observação registrada.");
      return true;
    }

    async function saveLeadProfile() {
      if (!isAgentMode) return;
      setLeadDrawerStatus("Salvando...");
      const noteSaved = await registerLeadNote();
      if (!noteSaved) return;
      const payload = {};
      const name = leadNameInput ? String(leadNameInput.value || "").trim() : "";
      const whatsapp = leadWhatsappInput ? String(leadWhatsappInput.value || "").trim() : "";
      if (name.length >= 2) payload.contactName = name;
      payload.leadWhatsapp = whatsapp;
      const response = await fetch("/api/chat/queue/" + contactId + "/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setLeadDrawerStatus("Falha ao salvar dados do lead.");
        return;
      }
      const updated = await response.json();
      applyLeadContactToDrawer(updated);

      const assignTo = leadAssignSelect ? String(leadAssignSelect.value || "").trim() : "";
      const currentAssigned = String(leadDrawerContact?.assignedAgentId || "").trim().toLowerCase();
      if (assignTo && assignTo.toLowerCase() !== currentAssigned) {
        const attendant = leadAttendants.find((item) => String(item.username || "").trim() === assignTo);
        const assignResponse = await fetch("/api/chat/queue/" + contactId + "/assign", {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-tenant-id": tenantId },
          body: JSON.stringify({
            agentId: assignTo,
            agentName: attendant
              ? resolveAttendantDisplayName(attendant, {
                  assignedAgentId: String(leadDrawerContact?.assignedAgentId || "").trim(),
                  assignedAgentName: String(leadDrawerContact?.assignedAgentName || "").trim(),
                  sessionAgentId,
                  sessionAgentName,
                })
              : undefined,
          }),
        });
        if (!assignResponse.ok) {
          setLeadDrawerStatus("Dados salvos, mas a transferência falhou.");
          return;
        }
        applyLeadContactToDrawer(await assignResponse.json());
        if (leadAssignSelect) leadAssignSelect.value = "";
      }
      setLeadDrawerStatus("Dados do lead salvos.");
    }

    async function uploadLeadAttachment(file) {
      const fileName = String(file?.name || "anexo").trim();
      const mimeType = String(file?.type || "application/octet-stream").trim();
      let content = "";
      if (mimeType.startsWith("image/")) {
        const raw = await readFileAsDataUrl(file);
        content = await compressImageDataUrl(raw);
        if (content.length > MAX_IMAGE_PAYLOAD_LENGTH) throw new Error("image too large");
      } else {
        content = await readFileAsDataUrl(file);
        if (content.length > MAX_IMAGE_PAYLOAD_LENGTH) throw new Error("file too large");
      }
      const response = await fetch("/api/chat/queue/" + contactId + "/attachments", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ fileName, mimeType, content }),
      });
      if (!response.ok) throw new Error("upload failed");
      applyLeadContactToDrawer(await response.json());
    }

    if (isAgentMode) {
      initLeadAccordion();
    }
    if (isAgentMode && leadNameInput) {
      leadNameInput.addEventListener("input", syncLeadProfilePreview);
    }
    if (isAgentMode && leadWhatsappInput) {
      leadWhatsappInput.addEventListener("input", syncLeadProfilePreview);
    }
    if (isAgentMode && leadNotesRegisterButton) {
      leadNotesRegisterButton.addEventListener("click", () => {
        void registerLeadNote();
      });
    }
    if (isAgentMode && leadWhatsappCopy) {
      leadWhatsappCopy.addEventListener("click", async () => {
        const value = resolveLeadWhatsappDisplay(
          leadWhatsappInput ? leadWhatsappInput.value : "",
          leadDrawerContact?.leadContext,
        );
        if (!value) return;
        try {
          await navigator.clipboard.writeText(value);
          setLeadDrawerStatus("WhatsApp copiado.");
        } catch {
          setLeadDrawerStatus("Não foi possível copiar o WhatsApp.");
        }
      });
    }
    if (isAgentMode && leadInfoButton) {
      leadInfoButton.addEventListener("click", () => openLeadDrawer());
    }
    if (isAgentMode && leadAttachmentsHeaderButton) {
      leadAttachmentsHeaderButton.addEventListener("click", () => openLeadDrawer("attachments"));
    }
    if (isAgentMode && leadNotesHeaderButton) {
      leadNotesHeaderButton.addEventListener("click", () => openLeadDrawer("notes"));
    }
    if (isAgentMode && leadDrawerClose) {
      leadDrawerClose.addEventListener("click", closeLeadDrawer);
    }
    if (isAgentMode && leadSaveButton) {
      leadSaveButton.addEventListener("click", () => {
        void saveLeadProfile();
      });
    }
    if (isAgentMode && leadFilesInput) {
      leadFilesInput.addEventListener("change", async () => {
        const files = leadFilesInput.files ? [...leadFilesInput.files] : [];
        leadFilesInput.value = "";
        if (files.length === 0) return;
        setLeadDrawerStatus("Enviando anexos...");
        try {
          for (const file of files) {
            await uploadLeadAttachment(file);
          }
          setLeadDrawerStatus("Anexos enviados.");
        } catch {
          setLeadDrawerStatus("Falha ao enviar um ou mais anexos.");
        }
      });
    }

    loadAndPersistLeadCache();
    setVisitorChatEnabled(isAgentMode);
    syncVisitorSessionState();
    loadMessages();
    setInterval(() => {
      syncVisitorSessionState();
      loadMessages();
    }, 2500);
  </script>
</body>
</html>`);
  });

  app.post("/api/typebot/handoff", async (req, res) => {
    try {
      const payloadSchema = z
      .object({
        contactName: z.preprocess((value) => {
          const normalized = typeof value === "string" ? value.trim() : "";
          return normalized.length >= 2 ? normalized : "Lead";
        }, z.string().min(2).max(120)),
        source: z.enum(["typebot", "widget"]).default("typebot"),
        sourceFlowLabel: asOptionalNonEmptyString(150),
        source_flow_label: asOptionalNonEmptyString(150),
        tenantId: asOptionalNonEmptyString(120),
        tenant_id: asOptionalNonEmptyString(120),
        initialMessage: z.preprocess((value) => {
          if (typeof value !== "string") return undefined;
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : undefined;
        }, z.string().max(3000).optional()),
        flowAlias: asOptionalNonEmptyString(120),
        typebotViewerUrl: z.preprocess((value) => {
          if (typeof value !== "string") return undefined;
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : undefined;
        }, z.string().url().max(2048).optional()),
        viewer_url: z.preprocess((value) => {
          if (typeof value !== "string") return undefined;
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : undefined;
        }, z.string().url().max(2048).optional()),
        leadContext: z
          .union([
            z.record(z.string().min(1).max(80), z.union([z.string(), z.number(), z.boolean()])),
            z.string(),
          ])
          .optional(),
      })
      .passthrough();
      const payload = payloadSchema.parse(req.body);
      const allFlows = flowRepository.listAll();
      const sourceFlowLabelCandidate = String(
        payload.sourceFlowLabel ?? payload.source_flow_label ?? payload.flowAlias ?? "",
      ).trim();
      const normalizedLabel = sourceFlowLabelCandidate.toLowerCase();
      const resolvedViewerUrlFromPayload = String(payload.typebotViewerUrl ?? payload.viewer_url ?? "").trim();
      const viewerPidFromBody = resolvedViewerUrlFromPayload
        ? normalizeHandoffMatchToken(typebotPublicIdFromViewerUrl(resolvedViewerUrlFromPayload))
        : "";
      const matchingFlowsMap = new Map<string, SavedFlow>();
      for (const saved of allFlows) {
        if (savedFlowMatchesHandoffSource(saved, normalizedLabel, viewerPidFromBody)) {
          matchingFlowsMap.set(saved.id, saved);
        }
      }
      const matchingFlows = [...matchingFlowsMap.values()];

      const resolvedTenantIds = [...new Set(matchingFlows.map((flow) => flow.tenantId))];
      const requestedTenantId = String(payload.tenantId ?? payload.tenant_id ?? "").trim();
      const requestedTenantExists = requestedTenantId ? Boolean(tenantRepository.getById(requestedTenantId)) : false;
      const singleMatchedTenantId = resolvedTenantIds.length === 1 ? resolvedTenantIds[0] : "";
      const resolvedTenantId = (() => {
        if (requestedTenantExists && requestedTenantId) {
          const hasFlowForRequested = matchingFlows.some((flow) => flow.tenantId === requestedTenantId);
          if (hasFlowForRequested) return requestedTenantId;
          // Quando o payload vem com tenant antigo/incorreto, prioriza o tenant inferido pelo fluxo.
          if (singleMatchedTenantId) return singleMatchedTenantId;
          return requestedTenantId;
        }
        if (singleMatchedTenantId) return singleMatchedTenantId;
        if (requestedTenantId) return requestedTenantId;
        return null;
      })();

      if (!resolvedTenantId) {
        return res.status(400).json({
          message:
            "Não foi possível identificar o tenant automaticamente. Envie tenantId no body do webhook, use sourceFlowLabel igual ao publicId do viewer ou ao apelido do fluxo no painel, ou inclua typebotViewerUrl com a URL pública do fluxo.",
        });
      }

      const payloadRecord = payload as Record<string, unknown>;
      const resolvedLeadContext = resolveLeadContextFromHandoffPayload(payloadRecord);
      const resolvedContactName = pickLeadNameFromPayload(payloadRecord, resolvedLeadContext);
      const resolvedLeadWhatsapp = pickLeadWhatsappFromContext(resolvedLeadContext, payloadRecord);
      const inferredFlow = matchingFlows.find((saved) => saved.tenantId === resolvedTenantId) ?? matchingFlows[0];
      const resolvedFlowLabel = String(
        payload.flowAlias ??
          inferredFlow?.displayLabel ??
          inferredFlow?.nickname ??
          payload.sourceFlowLabel ??
          payload.source_flow_label ??
          viewerPidFromBody ??
          "Fluxo",
      ).trim();
      const tenant = tenantRepository.getById(resolvedTenantId);
      const distributionMode = tenant?.queueDistributionMode ?? "shared_pool";
      const attendantsForTenant = attendantsForQueueRouting(resolvedTenantId, tenant);
      const displayFlowLabel = (
        inferredFlow?.displayLabel?.trim() ||
        inferredFlow?.nickname?.trim() ||
        payload.flowAlias?.trim() ||
        payload.sourceFlowLabel?.trim() ||
        payload.source_flow_label?.trim() ||
        viewerPidFromBody ||
        "Fluxo"
      ).trim();

      ensureTenantFlowRegisteredFromHandoff({
        tenantId: resolvedTenantId,
        sourceFlowLabel: sourceFlowLabelCandidate || viewerPidFromBody || displayFlowLabel,
        viewerUrl: resolvedViewerUrlFromPayload,
        flowAlias: payload.flowAlias ?? inferredFlow?.displayLabel ?? inferredFlow?.nickname,
      });

      const item = queueService.enqueue(resolvedTenantId, {
        contactName: resolvedContactName,
        source: "typebot",
        sourceFlowLabel: resolvedFlowLabel || "Fluxo",
        leadContext: Object.keys(resolvedLeadContext).length > 0 ? resolvedLeadContext : undefined,
        leadWhatsapp: resolvedLeadWhatsapp,
      }, {
        distributionMode,
        attendants: attendantsForTenant,
      });
      if (payload.initialMessage) {
        queueService.sendMessage(resolvedTenantId, item.contactId, {
          sender: "visitor",
          content: payload.initialMessage,
        });
      }
      const publicBaseUrl = getPublicBaseUrl(req);
      const typebotViewerUrlFromBody = resolvedViewerUrlFromPayload;
      const typebotViewerUrl = typebotViewerUrlFromBody || inferredFlow?.url;
      const visualConfigFromFlow = inferredFlow?.redirectTheme;
      const visualConfigDetected =
        typebotViewerUrl && isSafeHttpUrl(typebotViewerUrl) ? await extractViewerVisualConfig(typebotViewerUrl) : DEFAULT_VISUAL_CONFIG;
      const tenantTheme = tenant?.defaultChatTheme;
      const visualConfig = {
        pageBg: visualConfigFromFlow?.pageBg ?? tenantTheme?.pageBg ?? visualConfigDetected.pageBg,
        chatBg: visualConfigFromFlow?.chatBg ?? tenantTheme?.chatBg ?? visualConfigDetected.chatBg,
        userBubbleBg:
          visualConfigFromFlow?.userBubbleBg ?? tenantTheme?.userBubbleBg ?? visualConfigDetected.userBubbleBg,
        botBubbleBg:
          visualConfigFromFlow?.botBubbleBg ?? tenantTheme?.botBubbleBg ?? visualConfigDetected.botBubbleBg,
        profileImageUrl: tenant?.profileImageUrl ?? visualConfigFromFlow?.profileImageUrl ?? visualConfigDetected.profileImageUrl,
      };
      const profileImageQuery =
        visualConfig.profileImageUrl &&
        !visualConfig.profileImageUrl.trim().startsWith("data:")
          ? `&profileImageUrl=${encodeURIComponent(visualConfig.profileImageUrl)}`
          : "";
      const typebotQuery =
        typebotViewerUrl && isSafeHttpUrl(typebotViewerUrl)
          ? `&typebotUrl=${encodeURIComponent(typebotViewerUrl)}`
          : "";
      const visualQuery = `&themePageBg=${encodeURIComponent(visualConfig.pageBg)}&themeChatBg=${encodeURIComponent(
        visualConfig.chatBg,
      )}&themeUserBubbleBg=${encodeURIComponent(visualConfig.userBubbleBg)}&themeBotBubbleBg=${encodeURIComponent(
        visualConfig.botBubbleBg,
      )}${profileImageQuery}`;
      const leadContextQuery = Object.keys(resolvedLeadContext).length > 0
        ? `&leadContext=${encodeURIComponent(JSON.stringify(resolvedLeadContext))}`
        : "";
      const handoffUrl = `${publicBaseUrl}/handoff-view?tenantId=${resolvedTenantId}&contactId=${item.contactId}&contactName=${encodeURIComponent(
        payload.contactName,
      )}&flow=${encodeURIComponent(displayFlowLabel)}${typebotQuery}${leadContextQuery}${visualQuery}`;

      // 200: alguns clientes HTTP do Typebot tratam melhor 200 do que 201 no fluxo síncrono.
      return res.status(200).json({
        ...item,
        tenantId: resolvedTenantId,
        handoffUrl,
        redirectUrl: handoffUrl,
        url: handoffUrl,
        /** Alias para Redirect `{{url_direct}}` quando o mapeamento usa bodyPath `url_direct`. */
        url_direct: handoffUrl,
        // Compatibilidade com mapeamentos de webhook no Typebot que leem em `data.*`.
        data: {
          handoffUrl,
          redirectUrl: handoffUrl,
          url: handoffUrl,
          handoffUrlFlat: handoffUrl,
          redirectUrlFlat: handoffUrl,
          urlFlat: handoffUrl,
          url_direct: handoffUrl,
        },
        // Campos no nível raiz para integrações (Typebot) que expõem o JSON como `data`
        // e tornam ambíguo acessar `data.url` quando também existe `data.data.url`.
        handoffUrlFlat: handoffUrl,
        redirectUrlFlat: handoffUrl,
        urlFlat: handoffUrl,
        resolvedTypebotViewerUrl: typebotViewerUrl ?? null,
      });
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/chat/queue", (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const input = enqueueSchema.parse(req.body);
      const tenant = tenantRepository.getById(tenantId);
      const distributionMode = tenant?.queueDistributionMode ?? "shared_pool";
      const attendantsForTenant = attendantsForQueueRouting(tenantId, tenant);
      return res.status(201).json(
        queueService.enqueue(tenantId, input, {
          distributionMode,
          attendants: attendantsForTenant,
        }),
      );
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/chat/queue", (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const attendants = attendantRepository.listByTenant(tenantId);
      const attendantByUsername = new Map(
        attendants.map((attendant) => [attendant.username.trim().toLowerCase(), attendant.displayName]),
      );
      queueService.backfillAssignedAgentNames(tenantId, (agentId) => attendantByUsername.get(agentId.trim().toLowerCase()));
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.status(200).json(queueService.list(tenantId));
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/master/queue/backfill-agent-names", (req, res) => {
    try {
      const bodyTenantId = String((req.body as { tenantId?: unknown } | undefined)?.tenantId ?? "").trim();
      const tenantId = bodyTenantId || getTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ message: "tenantId is required" });
      }
      const attendants = attendantRepository.listByTenant(tenantId);
      const attendantByUsername = new Map(
        attendants.map((attendant) => [attendant.username.trim().toLowerCase(), attendant.displayName]),
      );
      queueService.backfillAssignedAgentNames(tenantId, (agentId) => attendantByUsername.get(agentId.trim().toLowerCase()));
      const queue = queueService.list(tenantId);
      return res.status(200).json({
        status: "ok",
        tenantId,
        total: queue.length,
      });
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/chat/queue/:contactId", (req, res) => {
    try {
      const tenantId = resolveTenantIdForContact(req, req.params.contactId);
      const item = queueService.getContact(tenantId, req.params.contactId);
      if (!item) return res.status(404).json({ message: "Contact not found for tenant" });
      res.setHeader("x-resolved-tenant-id", tenantId);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.status(200).json(item);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.patch("/api/chat/queue/:contactId/assign", (req, res) => {
    try {
      const tenantId = resolveTenantIdForContact(req, req.params.contactId);
      const input = assignSchema.parse(req.body);
      const assigned = queueService.assign(tenantId, req.params.contactId, input);

      if (!assigned) return res.status(404).json({ message: "Contact not found for tenant" });
      return res.status(200).json(assigned);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.patch("/api/chat/queue/:contactId/profile", (req, res) => {
    try {
      const tenantId = resolveTenantIdForContact(req, req.params.contactId);
      const input = updateQueueContactSchema.parse(req.body);
      const updated = queueService.updateContact(tenantId, req.params.contactId, input);
      if (!updated) return res.status(404).json({ message: "Contact not found for tenant" });
      res.setHeader("x-resolved-tenant-id", tenantId);
      return res.status(200).json(updated);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/chat/queue/:contactId/notes", (req, res) => {
    try {
      const tenantId = resolveTenantIdForContact(req, req.params.contactId);
      const input = addAgentNoteSchema.parse(req.body);
      const updated = queueService.addAgentNote(tenantId, req.params.contactId, input);
      if (!updated) return res.status(404).json({ message: "Contact not found for tenant" });
      res.setHeader("x-resolved-tenant-id", tenantId);
      return res.status(201).json(updated);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/chat/queue/:contactId/attachments", (req, res) => {
    try {
      const tenantId = resolveTenantIdForContact(req, req.params.contactId);
      const input = addLeadAttachmentSchema.parse(req.body);
      const updated = queueService.addAttachment(tenantId, req.params.contactId, input);
      if (!updated) return res.status(404).json({ message: "Contact not found for tenant" });
      res.setHeader("x-resolved-tenant-id", tenantId);
      return res.status(201).json(updated);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/chat/sessions/:contactId/messages", (req, res) => {
    try {
      const tenantId = resolveTenantIdForContact(req, req.params.contactId);
      const messages = queueService.getMessages(tenantId, req.params.contactId);
      if (!messages) return res.status(404).json({ message: "Session not found for tenant" });
      res.setHeader("x-resolved-tenant-id", tenantId);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.status(200).json(messages);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/chat/sessions/:contactId/messages", (req, res) => {
    try {
      const tenantId = resolveTenantIdForContact(req, req.params.contactId);
      const input = sendLiveMessageSchema.parse(req.body);
      const message = queueService.sendMessage(tenantId, req.params.contactId, input);
      if (!message) return res.status(404).json({ message: "Session not found for tenant" });
      res.setHeader("x-resolved-tenant-id", tenantId);
      return res.status(201).json(message);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });
};
