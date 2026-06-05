import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { SavedFlow } from "../flows/flow.repository";
import { listKanbanColumnOptions } from "../lib/kanban-column-options";
import {
  attendantRepository,
  flowRepository,
  kanbanRepository,
  labelRepository,
  priorityRepository,
  queueRepository,
  tenantRepository,
} from "../lib/repositories";
import { findSystemMasterTenant } from "../auth/system-master-auth";
import { shouldHandoffResolveToMasterTenant } from "../typebot/typebot-matrix-viewer";
import { LabelService } from "../labels/label.service";
import { PriorityService } from "../priorities/priority.service";
import {
  formatAgentSessionMeta,
  resolveAttendantDisplayName,
  resolveQueueContactAssignedAgentName,
  resolveServiceStartedAt,
} from "../lib/agent-session-meta";
import { pruneLeadContext } from "../lib/lead-context";
import { resolveLeadContactName } from "../lib/lead-contact-name";
import { resolveSourceFlowDisplayName } from "../lib/source-flow-display";
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
import {
  isBrokenTypebotMediaUrl,
  resolveHandoffProfileImageUrl,
} from "../typebot/typebot-media-sanitize.service";
import { buildHandoffRedirectGetUrl } from "../typebot/typebot-handoff-flow-topology.js";

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
  const ordered = [
    ...urls.filter((url) => url.includes("/public/") && !url.includes("ogImage")),
    ...urls.filter((url) => !url.includes("ogImage")),
  ];
  for (const url of ordered) {
    const resolved = resolveHandoffProfileImageUrl(null, url);
    if (resolved) return resolved;
  }
  return undefined;
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
): string => resolveLeadContactName(String(payload.contactName ?? ""), leadContext, [payload]);

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
  const priorityService = new PriorityService(priorityRepository);
  const labelService = new LabelService(labelRepository);

  const asOptionalNonEmptyString = (max = 2048) =>
    z.preprocess((value) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }, z.string().min(2).max(max).optional());

  /**
   * Host público canônico do handoff (links do Typebot → tela do lead).
   * `api.chattypebot.com` costuma não ter DNS; o serviço ativo é `app.chattypebot.com`.
   */
  const canonicalizeHandoffPublicBase = (base: string): string => {
    const normalized = base.trim().replace(/\/$/, "");
    if (!normalized) return normalized;
    const override = String(process.env.HANDOFF_CANONICAL_BASE_URL ?? "").trim().replace(/\/$/, "");
    const lower = normalized.toLowerCase();
    if (lower === "https://api.chattypebot.com" || lower === "http://api.chattypebot.com") {
      return override || "https://app.chattypebot.com";
    }
    return normalized;
  };

  /**
   * URL pública da API usada em links do handoff (evita localhost quando o Typebot
   * chama via túnel e o Host não é o domínio real).
   */
  const getPublicBaseUrl = (req: Request, preferRequestHost = false) => {
    const proto = req.header("x-forwarded-proto") ?? req.protocol;
    const host = req.header("x-forwarded-host") ?? req.header("host");
    const requestBase = host ? `${proto}://${host}`.replace(/\/$/, "") : "";
    if (preferRequestHost && requestBase) return canonicalizeHandoffPublicBase(requestBase);
    const fixedBase = String(process.env.HANDOFF_PUBLIC_BASE_URL ?? "").trim().replace(/\/$/, "");
    if (fixedBase) return canonicalizeHandoffPublicBase(fixedBase);
    return canonicalizeHandoffPublicBase(requestBase || "http://localhost:3333");
  };

  const mergeHandoffRequestInput = (req: Request): unknown => {
    if (req.method !== "GET") return req.body;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (value === undefined) continue;
      const normalized = Array.isArray(value) ? value[0] : value;
      if (typeof normalized === "string" && (key === "leadContext" || key === "lead_context")) {
        try {
          out[key] = JSON.parse(normalized);
          continue;
        } catch {
          // mantém string
        }
      }
      out[key] = normalized;
    }
    return out;
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
    if (!isSafeHttpUrl(trimmed) || isBrokenTypebotMediaUrl(trimmed)) return false;
    return Boolean(resolveHandoffProfileImageUrl(null, trimmed));
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
    const embedInbox = String(req.query.embed ?? "").trim().toLowerCase() === "inbox";
    const senderRole = mode === "agent" ? "agent" : "visitor";
    const resolvedTenantIdForSession = String(queuedContact?.tenantId || tenantIdFromQuery || "").trim();
    const tenantId = resolvedTenantIdForSession;
    const contactClosed = queuedContact?.status === "closed";
    const initialVisitorChatEnabled =
      mode !== "agent" && !contactClosed && queuedContact?.status === "in_service";
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
    const profileImageUrl = resolveHandoffProfileImageUrl(
      tenant,
      String(req.query.profileImageUrl ?? "").trim(),
    );
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
    const tenantPrioritiesJson = isAgentMode && tenantId ? JSON.stringify(priorityService.listByTenant(tenantId)) : "[]";
    const tenantLabelsJson = isAgentMode && tenantId ? JSON.stringify(labelService.listByTenant(tenantId)) : "[]";
    const tenantKanbanColumnsJson =
      isAgentMode && tenantId
        ? JSON.stringify(
            listKanbanColumnOptions(tenantId, {
              kanbanRepository,
              priorityRepository,
              labelRepository,
            }),
          )
        : "[]";
    const initialQueueContactForHeader = JSON.stringify(
      queuedContact
        ? {
            contactName: queuedContact.contactName,
            leadWhatsapp: queuedContact.leadWhatsapp,
            leadContext: queuedContact.leadContext ?? {},
          }
        : null,
    );
    const initialLeadMetaJson = JSON.stringify({
      priorityId: queuedContact?.priorityId ?? null,
      priorityName: queuedContact?.priorityName ?? null,
      labelId: queuedContact?.labelId ?? null,
      labelName: queuedContact?.labelName ?? null,
      labelColor: queuedContact?.labelColor ?? null,
      labelIds: queuedContact?.labelIds ?? (queuedContact?.labelId ? [queuedContact.labelId] : []),
      labels: queuedContact?.labels ?? [],
      scheduledAt: queuedContact?.scheduledAt ?? null,
      isPinned: queuedContact?.isPinned === true,
      assignedAgentId: queuedContact?.assignedAgentId ?? null,
      assignedAgentName: queuedContact?.assignedAgentName ?? null,
      kanbanColumnId: queuedContact?.kanbanColumnId ?? null,
      kanbanColumnName: queuedContact?.kanbanColumnName ?? null,
    });
    const safeProfileImageTag =
      profileImageUrl && isSafeImageSrc(profileImageUrl)
        ? `<img class="avatar" src="${profileImageUrl.replace(/"/g, "&quot;")}" alt="Bot" />`
        : `<div class="avatar-fallback">bot</div>`;

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
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
    html, body { height:100%; }
    body.agent-screen { background:#0b1224; min-height:100vh; color:#f1f5f9; }
    body.agent-screen.embed-inbox { background:#060b14; min-height:100%; height:100%; overflow:hidden; }
    body.agent-screen .agent-widget { width:min(500px,92vw); margin:20px auto; background:#111827; border:1px solid #1f2937; border-radius:12px; display:grid; gap:12px; padding:16px; box-sizing:border-box; }
    body.agent-screen.embed-inbox .agent-widget { width:100%; max-width:none; height:100%; min-height:100%; margin:0; border:0; border-radius:0; padding:12px 14px 10px; display:flex; flex-direction:column; gap:10px; background:#0b1224; box-sizing:border-box; }
    body.agent-screen.embed-inbox .widget-header { flex-shrink:0; padding-bottom:2px; border-bottom:1px solid #1e293b; }
    body.agent-screen.embed-inbox .widget-chat { flex:1; min-height:0; max-height:none; border:0; border-radius:0; background:#0b1224; padding:10px 4px; }
    body.agent-screen.embed-inbox .widget-input { flex-shrink:0; }
    body.agent-screen.embed-inbox .session-meta { flex-shrink:0; margin-top:0; }
    body.agent-screen.embed-inbox .lead-drawer-panel { height:100%; }
    body.agent-screen .widget-header { display:flex; flex-direction:row; align-items:flex-start; justify-content:space-between; gap:10px; }
    body.agent-screen .lead-header-main { display:flex; flex-direction:column; gap:4px; flex:1; min-width:0; }
    body.agent-screen .lead-header-main strong { font-size:18px; line-height:1.25; word-break:break-word; }
    body.agent-screen .lead-header-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
    body.agent-screen .widget-header span { color:#94a3b8; font-size:14px; }
    body.agent-screen .lead-info-button { width:38px; height:38px; min-width:38px; flex-shrink:0; border-radius:999px; border:1px solid #334155; background:#0f172a; color:#cbd5e1; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0; }
    body.agent-screen .lead-info-button--active { border-color:#14b8a6; background:rgba(20,184,166,.16); color:#5eead4; }
    body.agent-screen .lead-info-button.lead-end-service-button { border-color:#7f1d1d; color:#f87171; }
    body.agent-screen .lead-info-button.lead-end-service-button:hover, body.agent-screen .lead-info-button.lead-end-service-button:focus-visible { border-color:#ef4444; background:rgba(239,68,68,.18); color:#fecaca; }
    body.agent-screen .lead-info-button svg { width:18px; height:18px; fill:currentColor; }
    body.agent-screen .lead-end-service-button svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    body.agent-screen .agent-widget.is-ended .widget-input { opacity:.55; pointer-events:none; }
    body.agent-screen .agent-widget.is-ended .widget-chat { opacity:.92; overflow-y:auto; overflow-x:hidden; pointer-events:auto; -webkit-overflow-scrolling:touch; cursor:default; }
    body.agent-screen.embed-inbox .agent-widget.is-ended .widget-chat { flex:1; min-height:0; }
    body.agent-screen .agent-ended-banner { display:none; margin:0 0 8px; padding:10px 12px; border-radius:10px; border:1px solid #334155; background:#0f172a; color:#94a3b8; font-size:13px; }
    body.agent-screen .agent-widget.is-ended .agent-ended-banner { display:block; }
    body.agent-screen .lead-header-top { display:flex; align-items:flex-start; gap:10px; width:100%; }
    body.agent-screen .lead-header-identity { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-width:0; flex:1; }
    body.agent-screen .lead-header-identity > strong { font-size:18px; line-height:1.25; }
    body.agent-screen .lead-header-sub { display:block; color:#94a3b8; font-size:13px; margin-top:4px; }
    body.agent-screen .lead-inline-meta { display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap; position:relative; }
    body.agent-screen .lead-meta-icon-btn { width:34px; height:34px; min-width:34px; border-radius:999px; border:1px solid #334155; background:#0f172a; color:#cbd5e1; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0; }
    body.agent-screen .lead-meta-icon-btn:hover, body.agent-screen .lead-meta-icon-btn:focus-visible { border-color:#14b8a6; color:#5eead4; outline:none; }
    body.agent-screen .lead-meta-icon-btn.is-active { border-color:#14b8a6; background:rgba(20,184,166,.14); color:#5eead4; }
    body.agent-screen .lead-meta-icon-btn.lead-whatsapp-btn { border-color:#15803d; background:rgba(34,197,94,.18); color:#4ade80; text-decoration:none; }
    body.agent-screen .lead-meta-icon-btn.lead-whatsapp-btn:hover, body.agent-screen .lead-meta-icon-btn.lead-whatsapp-btn:focus-visible { border-color:#22c55e; background:rgba(34,197,94,.32); color:#bbf7d0; outline:none; }
    body.agent-screen .lead-meta-icon-btn.is-set { border-color:#15803d; background:rgba(34,197,94,.18); color:#4ade80; }
    body.agent-screen .lead-meta-icon-btn.is-set:hover, body.agent-screen .lead-meta-icon-btn.is-set:focus-visible { border-color:#22c55e; background:rgba(34,197,94,.32); color:#bbf7d0; outline:none; }
    body.agent-screen .lead-meta-icon-btn.is-set.active { border-color:#22c55e; background:rgba(34,197,94,.28); color:#bbf7d0; }
    body.agent-screen .lead-meta-icon-wrap { position:relative; display:inline-flex; }
    body.agent-screen .lead-meta-menu-current { display:grid; gap:4px; padding:8px 10px; margin-bottom:4px; border-bottom:1px solid #1e293b; color:#e2e8f0; font-size:13px; }
    body.agent-screen .lead-meta-menu-current strong { font-weight:700; color:#f8fafc; text-transform:capitalize; }
    body.agent-screen .lead-meta-menu-current__label { font-size:11px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; color:#64748b; }
    body.agent-screen .lead-meta-menu-current--empty { color:#94a3b8; font-size:12px; }
    body.agent-screen .lead-meta-menu-section-label { padding:6px 10px 2px; font-size:11px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; color:#64748b; }
    body.agent-screen .lead-meta-menu-item--danger { color:#fca5a5; }
    body.agent-screen .lead-meta-menu-item--danger:hover, body.agent-screen .lead-meta-menu-item--danger:focus-visible { background:rgba(239,68,68,.14); color:#fecaca; }
    body.agent-screen .lead-meta-icon-btn.is-hidden { display:none !important; }
    body.agent-screen .lead-meta-icon-btn svg { width:17px; height:17px; fill:currentColor; }
    body.agent-screen .lead-meta-badge { display:inline-flex; align-items:center; gap:6px; max-width:160px; border:1px solid #334155; border-radius:999px; padding:4px 10px; font-size:11px; font-weight:600; color:#e2e8f0; background:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    body.agent-screen .lead-meta-badge.is-hidden { display:none; }
    body.agent-screen .lead-meta-badge--priority-high { border-color:#b91c1c; background:rgba(185,28,28,.18); color:#fecaca; }
    body.agent-screen .lead-meta-badge--priority-medium { border-color:#b45309; background:rgba(180,83,9,.18); color:#fde68a; }
    body.agent-screen .lead-meta-badge--priority-low { border-color:#15803d; background:rgba(21,128,61,.18); color:#bbf7d0; }
    body.agent-screen .lead-meta-badge--priority-neutral { border-color:#334155; background:#0f172a; color:#cbd5e1; }
    body.agent-screen .lead-meta-badge__dot { width:8px; height:8px; border-radius:999px; background:var(--label-dot, #64748b); flex-shrink:0; }
    body.agent-screen .lead-meta-menu { position:absolute; top:calc(100% + 6px); left:0; min-width:200px; max-width:min(280px,92vw); background:#0f172a; border:1px solid #334155; border-radius:10px; padding:6px; z-index:140; box-shadow:0 14px 34px rgba(2,6,23,.45); display:none; gap:2px; }
    body.agent-screen .lead-meta-menu.open { display:grid; }
    body.agent-screen .lead-meta-menu--schedule { min-width:260px; padding:10px; gap:8px; }
    body.agent-screen .lead-meta-icon-wrap .lead-meta-menu { top:calc(100% + 6px); left:0; }
    body.agent-screen .lead-meta-menu-item { width:100%; border:0; border-radius:8px; background:transparent; color:#e2e8f0; text-align:left; padding:8px 10px; font:inherit; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px; }
    body.agent-screen .lead-meta-menu-item:hover, body.agent-screen .lead-meta-menu-item:focus-visible { background:#1e293b; outline:none; }
    body.agent-screen .lead-meta-menu-item.is-selected { background:rgba(20,184,166,.12); color:#99f6e4; }
    body.agent-screen .lead-meta-menu-item small { color:#94a3b8; font-size:11px; }
    body.agent-screen .lead-meta-menu-item__dot { width:10px; height:10px; border-radius:999px; flex-shrink:0; background:var(--label-dot, #64748b); }
    body.agent-screen .lead-meta-menu-actions { display:flex; gap:8px; justify-content:flex-end; }
    body.agent-screen .lead-meta-menu-actions button { border-radius:8px; border:1px solid #334155; background:#111827; color:#e2e8f0; padding:7px 10px; font-size:12px; font-weight:600; cursor:pointer; }
    body.agent-screen .lead-meta-menu-actions button.primary { border-color:#14b8a6; background:rgba(20,184,166,.16); color:#5eead4; }
    body.agent-screen .lead-actions-menu-wrap { position:relative; display:inline-flex; }
    body.agent-screen .lead-actions-menu { position:absolute; top:calc(100% + 6px); left:0; min-width:220px; background:#0f172a; border:1px solid #334155; border-radius:10px; padding:6px; z-index:150; box-shadow:0 14px 34px rgba(2,6,23,.45); display:none; }
    body.agent-screen .lead-actions-menu.open { display:block; }
    body.agent-screen .lead-actions-menu-row { position:relative; display:flex; align-items:center; justify-content:space-between; gap:8px; border-radius:8px; padding:8px 10px; color:#e2e8f0; font-size:13px; cursor:default; }
    body.agent-screen .lead-actions-menu-row:hover, body.agent-screen .lead-actions-menu-row:focus-within { background:#1e293b; }
    body.agent-screen .lead-actions-menu-row > span { pointer-events:none; font-weight:600; white-space:nowrap; }
    body.agent-screen .lead-actions-menu-row::after { content:"›"; color:#94a3b8; font-size:14px; }
    body.agent-screen .lead-actions-submenu { position:absolute; left:calc(100% + 4px); top:0; min-width:200px; max-width:min(280px,70vw); max-height:min(280px,55vh); overflow:auto; background:#0f172a; border:1px solid #334155; border-radius:10px; padding:6px; display:none; gap:2px; z-index:160; box-shadow:0 14px 34px rgba(2,6,23,.45); }
    body.agent-screen .lead-actions-menu-row:hover .lead-actions-submenu, body.agent-screen .lead-actions-menu-row:focus-within .lead-actions-submenu { display:grid; }
    body.agent-screen .lead-actions-submenu-item { width:100%; border:0; border-radius:8px; background:transparent; color:#e2e8f0; text-align:left; padding:8px 10px; font:inherit; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px; }
    body.agent-screen .lead-actions-submenu-item:hover, body.agent-screen .lead-actions-submenu-item:focus-visible { background:#1e293b; outline:none; }
    body.agent-screen .lead-actions-submenu-item.is-selected { background:rgba(20,184,166,.12); color:#99f6e4; }
    body.agent-screen .lead-actions-submenu-item__check { width:14px; height:14px; border:1px solid #475569; border-radius:4px; display:inline-flex; align-items:center; justify-content:center; font-size:10px; flex-shrink:0; color:transparent; }
    body.agent-screen .lead-actions-submenu-item.is-selected .lead-actions-submenu-item__check { border-color:#14b8a6; color:#5eead4; background:rgba(20,184,166,.2); }
    body.agent-screen .lead-actions-submenu-item__dot { width:10px; height:10px; border-radius:999px; flex-shrink:0; }
    body.agent-screen .lead-actions-menu-pin { width:100%; border:0; border-radius:8px; background:transparent; color:#e2e8f0; text-align:left; padding:8px 10px; font:inherit; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px; }
    body.agent-screen .lead-actions-menu-pin:hover, body.agent-screen .lead-actions-menu-pin:focus-visible { background:#1e293b; outline:none; }
    body.agent-screen .lead-actions-menu-pin.is-active { color:#fde68a; }
    body.agent-screen .lead-meta-badges { display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap; }
    body.agent-screen .lead-schedule-input { width:100%; border-radius:8px; border:1px solid #334155; background:#111827; color:#f1f5f9; padding:9px 10px; font:inherit; box-sizing:border-box; }
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
    body.agent-screen .lead-fact-list li, body.agent-screen .lead-inline-fact-field { display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:center; padding:8px 10px; border:1px solid #1f2937; border-radius:10px; background:#0f172a; }
    body.agent-screen .lead-inline-fact-field-main { display:grid; gap:4px; min-width:0; }
    body.agent-screen .lead-inline-fact-field-main small { color:#64748b; font-size:11px; }
    body.agent-screen .lead-inline-fact-input-wrap { position:relative; display:block; }
    body.agent-screen .lead-inline-fact-input { width:100%; border:1px solid #1f2937; border-radius:8px; background:#111827; color:#e2e8f0; font:inherit; font-size:13px; line-height:1.35; padding:8px 34px 8px 10px; box-sizing:border-box; }
    body.agent-screen .lead-inline-fact-input:focus { outline:none; border-color:#3b82f6; box-shadow:0 0 0 1px rgba(59,130,246,.35); }
    body.agent-screen .lead-inline-fact-input:read-only { cursor:default; background:#0f172a; }
    body.agent-screen .lead-inline-fact-input-wrap.is-editing .lead-inline-fact-input { background:#111827; cursor:text; }
    body.agent-screen .lead-inline-fact-edit { position:absolute; top:50%; right:6px; width:24px; height:24px; margin:0; padding:0; border:0; border-radius:6px; background:transparent; color:#64748b; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; transform:translateY(-50%); }
    body.agent-screen .lead-inline-fact-edit svg { width:14px; height:14px; fill:currentColor; }
    body.agent-screen .lead-inline-fact-edit:hover, body.agent-screen .lead-inline-fact-edit:focus-visible { color:#cbd5e1; background:rgba(148,163,184,.12); }
    body.agent-screen .lead-fact-icon, body.agent-screen .lead-fact-copy, body.agent-screen .lead-toolbar-button { width:34px; height:34px; border-radius:10px; border:1px solid #334155; background:#111827; color:#cbd5e1; display:inline-flex; align-items:center; justify-content:center; padding:0; cursor:pointer; }
    body.agent-screen .lead-toolbar-button--active { border-color:#14b8a6; background:rgba(20,184,166,.16); color:#5eead4; }
    body.agent-screen .lead-fact-icon svg, body.agent-screen .lead-fact-copy svg, body.agent-screen .lead-toolbar-button svg { width:16px; height:16px; fill:currentColor; }
    body.agent-screen .lead-fact-copy:disabled { opacity:.45; cursor:not-allowed; }
    body.agent-screen .lead-toolbar { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
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
    body.agent-screen .lead-attachment-item a { color:#93c5fd; text-decoration:none; font-weight:600; }
    body.agent-screen .lead-attachment-item .msg-image { display:block; max-width:100%; border-radius:8px; margin-bottom:8px; }
    body.agent-screen .lead-attachment-download { display:inline-block; margin-top:4px; font-size:12px; }
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
<body class="${isAgentMode ? `agent-screen${embedInbox ? " embed-inbox" : ""}` : ""}">
  ${
    isAgentMode
      ? `<div class="agent-widget${contactClosed ? " is-ended" : ""}" id="agentWidgetRoot">
    <p class="agent-ended-banner" id="agentEndedBanner">Atendimento encerrado. Histórico e dados do lead permanecem disponíveis; o envio de mensagens está desativado.</p>
    <div class="widget-header">
      <div class="lead-header-main">
        <div class="lead-header-top">
          <div class="lead-header-identity">
            <strong id="leadTitle">${escapedName}</strong>
            <div class="lead-inline-meta" id="leadInlineMeta">
              <div class="lead-actions-menu-wrap">
                <button type="button" id="leadMenuBtn" class="lead-meta-icon-btn" title="Opções do lead" aria-label="Abrir menu do lead" aria-haspopup="menu" aria-expanded="false">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16v2H4V8Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z"/></svg>
                </button>
                <div id="leadActionsMenu" class="lead-actions-menu" role="menu" aria-label="Opções do lead">
                  <div class="lead-actions-menu-row" tabindex="0">
                    <span>Atribuir etiqueta</span>
                    <div id="leadLabelsSubmenu" class="lead-actions-submenu" role="menu" aria-label="Etiquetas"></div>
                  </div>
                  <div class="lead-actions-menu-row" tabindex="0">
                    <span>Propriedade</span>
                    <div id="leadPrioritySubmenu" class="lead-actions-submenu" role="menu" aria-label="Propriedades"></div>
                  </div>
                  <div class="lead-actions-menu-row" tabindex="0">
                    <span>Atribuir atendente</span>
                    <div id="leadAssignSubmenu" class="lead-actions-submenu" role="menu" aria-label="Atendentes"></div>
                  </div>
                  <button type="button" id="leadPinToggleBtn" class="lead-actions-menu-pin" aria-pressed="false">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1.03 1 1.03-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/></svg>
                    <span id="leadPinToggleLabel">Fixar conversa</span>
                  </button>
                </div>
              </div>
              <div class="lead-meta-icon-wrap">
                <button type="button" id="leadScheduleBtn" class="lead-meta-icon-btn" title="Agendar retorno" aria-label="Agendar retorno com o lead" aria-haspopup="dialog" aria-expanded="false">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h2v2H7V3Zm8 0h2v2h-2V3ZM5 7h14v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7Zm2 2v10h10V9H7Zm2 2h2v2H9v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2H9v-2Zm4 0h2v2h-2v-2Z"/></svg>
                </button>
                <div id="leadScheduleMenu" class="lead-meta-menu lead-meta-menu--schedule" role="dialog" aria-label="Agendamento">
                  <div id="leadScheduleCurrent" class="lead-meta-menu-current lead-meta-menu-current--empty">Nenhum agendamento definido</div>
                  <label class="lead-field" style="margin:0;"><span style="color:#94a3b8;font-size:12px;font-weight:600;">Definir data e hora do retorno</span>
                    <input id="leadScheduleInput" class="lead-schedule-input" type="datetime-local" />
                  </label>
                  <div class="lead-meta-menu-actions">
                    <button type="button" id="leadScheduleClearBtn">Remover agendamento</button>
                    <button type="button" id="leadScheduleSaveBtn" class="primary">Salvar</button>
                  </div>
                </div>
              </div>
              <div class="lead-meta-icon-wrap">
                <button type="button" id="leadKanbanBtn" class="lead-meta-icon-btn" title="Coluna do Kanban" aria-label="Definir coluna do Kanban" aria-haspopup="menu" aria-expanded="false">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v16H4V4Zm10 0h6v10h-6V4Zm0 12h6v6h-6v-6Z"/></svg>
                </button>
                <div id="leadKanbanMenu" class="lead-meta-menu" role="menu" aria-label="Coluna do Kanban"></div>
              </div>
              <a id="leadWhatsappHeaderButton" class="lead-meta-icon-btn lead-whatsapp-btn is-hidden" href="#" target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp Web" aria-label="Iniciar conversa no WhatsApp Web">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </a>
            </div>
          </div>
        </div>
        ${embedInbox ? "" : '<span class="lead-header-sub">Você está conversando com o visitante em tempo real</span>'}
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
        <button type="button" id="leadEndServiceButton" class="lead-info-button lead-end-service-button" title="Encerrar atendimento" aria-label="Encerrar atendimento">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
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
            <li class="lead-inline-fact-field">
              <span class="lead-fact-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/></svg>
              </span>
              <label class="lead-inline-fact-field-main">
                <small>Nome do lead</small>
                <span class="lead-inline-fact-input-wrap">
                  <input id="leadNameInput" class="lead-inline-fact-input" readonly />
                  <button type="button" class="lead-inline-fact-edit" data-edit-for="leadNameInput" aria-label="Editar nome do lead" title="Editar nome do lead">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm18-11.5a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13Z"/></svg>
                  </button>
                </span>
              </label>
              <button type="button" class="lead-fact-copy" data-copy-for="leadNameInput" aria-label="Copiar nome" title="Copiar nome">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v16h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 18H8V7h11v16Z"/></svg>
              </button>
            </li>
            <li class="lead-inline-fact-field">
              <span class="lead-fact-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.9 15.9 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.24 1Z"/></svg>
              </span>
              <label class="lead-inline-fact-field-main">
                <small>WhatsApp</small>
                <span class="lead-inline-fact-input-wrap">
                  <input id="leadWhatsappInput" class="lead-inline-fact-input" inputmode="tel" readonly />
                  <button type="button" class="lead-inline-fact-edit" data-edit-for="leadWhatsappInput" aria-label="Editar WhatsApp" title="Editar WhatsApp">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm18-11.5a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13Z"/></svg>
                  </button>
                </span>
              </label>
              <button type="button" class="lead-fact-copy" data-copy-for="leadWhatsappInput" aria-label="Copiar WhatsApp" title="Copiar WhatsApp">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v16h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 18H8V7h11v16Z"/></svg>
              </button>
            </li>
            <li class="lead-inline-fact-field">
              <span class="lead-fact-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v12h16V6H4Zm3 4h10v1.5H7V10Zm0 3h7v1.5H7V13Z"/></svg>
              </span>
              <label class="lead-inline-fact-field-main">
                <small>CPF</small>
                <span class="lead-inline-fact-input-wrap">
                  <input id="leadCpfInput" class="lead-inline-fact-input" inputmode="numeric" placeholder="000.000.000-00" readonly />
                  <button type="button" class="lead-inline-fact-edit" data-edit-for="leadCpfInput" aria-label="Editar CPF" title="Editar CPF">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm18-11.5a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13Z"/></svg>
                  </button>
                </span>
              </label>
              <button type="button" class="lead-fact-copy" data-copy-for="leadCpfInput" aria-label="Copiar CPF" title="Copiar CPF">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v16h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 18H8V7h11v16Z"/></svg>
              </button>
            </li>
          </ul>
          <div class="lead-toolbar">
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
    let tenantId = ${JSON.stringify(tenantId)};
    const contactId = ${JSON.stringify(contactId)};
    let visitorChatEnabled = ${JSON.stringify(initialVisitorChatEnabled)};
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

    function shouldEnableVisitorLiveChat(contact) {
      if (!contact) return false;
      if (contact.status === "closed") return false;
      return contact.status === "in_service";
    }

    async function syncVisitorSessionState() {
      if (isAgentMode) return;
      const headers = tenantId ? { "x-tenant-id": tenantId } : {};
      const response = await fetch("/api/chat/queue/" + contactId + "?t=" + Date.now(), {
        cache: "no-store",
        headers,
      });
      if (!response.ok) return;
      const resolvedTenantHeader = String(response.headers.get("x-resolved-tenant-id") || "").trim();
      if (resolvedTenantHeader) tenantId = resolvedTenantHeader;
      const data = await response.json();
      setVisitorChatEnabled(shouldEnableVisitorLiveChat(data));
    }

    function roleLabel(sender) {
      if (sender === "visitor") return "você";
      if (sender === "agent") return "atendente";
      return "sistema";
    }

    function formatCreatedAt(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleString("pt-BR");
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
    const MAX_IMAGE_PAYLOAD_LENGTH = 280000;
    const MAX_DOCUMENT_BYTES = 4194304;
    const MAX_DOCUMENT_PAYLOAD_LENGTH = 6000000;

    function resolveLeadAttachmentMimeType(file) {
      const direct = String(file?.type || "").trim();
      if (direct && direct !== "application/octet-stream") return direct;
      const name = String(file?.name || "").trim().toLowerCase();
      if (name.endsWith(".pdf")) return "application/pdf";
      if (name.endsWith(".doc")) return "application/msword";
      if (name.endsWith(".docx")) {
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      }
      if (name.endsWith(".xls")) return "application/vnd.ms-excel";
      if (name.endsWith(".xlsx")) {
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      }
      if (name.endsWith(".txt")) return "text/plain";
      return "application/octet-stream";
    }

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
        if (isAgentMode && agentWidgetRoot && agentWidgetRoot.classList.contains("is-ended")) return;
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
      if (isAgentMode && agentWidgetRoot && agentWidgetRoot.classList.contains("is-ended")) return;
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
    const leadCpfInput = document.getElementById("leadCpfInput");
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
    const sessionMeta = document.getElementById("sessionMeta");
    const leadInlineFieldState = new Map();
    const tenantPriorities = ${tenantPrioritiesJson};
    const tenantLabels = ${tenantLabelsJson};
    const tenantKanbanColumns = ${tenantKanbanColumnsJson};
    let leadMetaState = ${initialLeadMetaJson};
    const leadMenuBtn = document.getElementById("leadMenuBtn");
    const leadActionsMenu = document.getElementById("leadActionsMenu");
    const leadLabelsSubmenu = document.getElementById("leadLabelsSubmenu");
    const leadPrioritySubmenu = document.getElementById("leadPrioritySubmenu");
    const leadAssignSubmenu = document.getElementById("leadAssignSubmenu");
    const leadPinToggleBtn = document.getElementById("leadPinToggleBtn");
    const leadPinToggleLabel = document.getElementById("leadPinToggleLabel");
    const leadScheduleBtn = document.getElementById("leadScheduleBtn");
    const leadScheduleMenu = document.getElementById("leadScheduleMenu");
    const leadScheduleCurrent = document.getElementById("leadScheduleCurrent");
    const leadScheduleInput = document.getElementById("leadScheduleInput");
    const leadScheduleSaveBtn = document.getElementById("leadScheduleSaveBtn");
    const leadScheduleClearBtn = document.getElementById("leadScheduleClearBtn");
    const leadKanbanBtn = document.getElementById("leadKanbanBtn");
    const leadKanbanMenu = document.getElementById("leadKanbanMenu");
    const leadInlineMeta = document.getElementById("leadInlineMeta");
    const leadEndServiceButton = document.getElementById("leadEndServiceButton");
    const agentWidgetRoot = document.getElementById("agentWidgetRoot");
    const contactClosedInitially = ${JSON.stringify(contactClosed)};

    function toDatetimeLocalValue(iso) {
      if (!iso) return "";
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "";
      const pad = (value) => String(value).padStart(2, "0");
      return (
        date.getFullYear() +
        "-" +
        pad(date.getMonth() + 1) +
        "-" +
        pad(date.getDate()) +
        "T" +
        pad(date.getHours()) +
        ":" +
        pad(date.getMinutes())
      );
    }

    function datetimeLocalToIso(localValue) {
      const raw = String(localValue || "").trim();
      if (!raw) return null;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return null;
      return date.toISOString();
    }

    function schedulePayloadFromInput() {
      return datetimeLocalToIso(readLeadScheduleInputValue());
    }

    function formatScheduleDetail(iso) {
      const raw = String(iso || "").trim();
      if (!raw) return "";
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    function isLeadScheduleMenuOpen() {
      return Boolean(leadScheduleMenu && leadScheduleMenu.classList.contains("open"));
    }

    function readLeadScheduleInputValue() {
      return leadScheduleInput ? String(leadScheduleInput.value || "").trim() : "";
    }

    function persistLeadScheduleDraft() {
      const raw = readLeadScheduleInputValue();
      const savedLocal = toDatetimeLocalValue(leadMetaState.scheduledAt);
      if (raw === savedLocal) return;
      void patchLeadMeta({ scheduledAt: schedulePayloadFromInput() });
    }

    function closeLeadActionsMenu() {
      if (leadActionsMenu) leadActionsMenu.classList.remove("open");
      if (leadMenuBtn) {
        leadMenuBtn.classList.remove("is-active");
        leadMenuBtn.setAttribute("aria-expanded", "false");
      }
    }

    function isLeadKanbanMenuOpen() {
      return Boolean(leadKanbanMenu && leadKanbanMenu.classList.contains("open"));
    }

    function closeLeadMetaMenus(exceptMenu) {
      const scheduleWasOpen = isLeadScheduleMenuOpen();
      const closingSchedule = scheduleWasOpen && exceptMenu !== leadScheduleMenu;
      if (closingSchedule) {
        persistLeadScheduleDraft();
      }
      if (exceptMenu !== leadScheduleMenu) {
        closeLeadActionsMenu();
      }
      if (leadScheduleMenu) {
        const active = leadScheduleMenu === exceptMenu;
        leadScheduleMenu.classList.toggle("open", active);
        if (leadScheduleBtn) {
          leadScheduleBtn.classList.toggle("active", active);
          leadScheduleBtn.setAttribute("aria-expanded", active ? "true" : "false");
        }
      }
      if (leadKanbanMenu) {
        const active = leadKanbanMenu === exceptMenu;
        leadKanbanMenu.classList.toggle("open", active);
        if (leadKanbanBtn) {
          leadKanbanBtn.classList.toggle("active", active);
          leadKanbanBtn.setAttribute("aria-expanded", active ? "true" : "false");
        }
      }
      syncLeadMetaIconStates();
    }

    function buildLeadKanbanMenu() {
      if (!leadKanbanMenu) return;
      const currentName = String(leadMetaState.kanbanColumnName || "").trim();
      const currentBlock = currentName
        ? '<div class="lead-meta-menu-current"><span class="lead-meta-menu-current__label">Coluna atual</span><strong>' +
          escapeHtml(currentName) +
          "</strong></div>"
        : '<div class="lead-meta-menu-current lead-meta-menu-current--empty"><span>Nenhuma coluna definida</span></div>';
      const removeItem = currentName
        ? '<button type="button" class="lead-meta-menu-item lead-meta-menu-item--danger" data-kanban-column-id=""><span>Remover coluna do Kanban</span></button>'
        : "";
      const chooseLabel =
        '<div class="lead-meta-menu-section-label">Escolher coluna</div>';
      const items = (tenantKanbanColumns || [])
        .map((item) => {
          const id = String(item.id || "").trim();
          const selected = id && id === String(leadMetaState.kanbanColumnId || "");
          return (
            '<button type="button" class="lead-meta-menu-item' +
            (selected ? " is-selected" : "") +
            '" data-kanban-column-id="' +
            escapeHtml(id) +
            '"><span>' +
            escapeHtml(String(item.name || "")) +
            "</span></button>"
          );
        })
        .join("");
      leadKanbanMenu.innerHTML =
        currentBlock +
        removeItem +
        chooseLabel +
        (items ||
          '<button type="button" class="lead-meta-menu-item" disabled><span>Configure o Kanban no Master Console</span></button>');
    }

    function renderLeadScheduleCurrent() {
      if (!leadScheduleCurrent) return;
      const detail = formatScheduleDetail(leadMetaState.scheduledAt);
      if (!detail) {
        leadScheduleCurrent.className = "lead-meta-menu-current lead-meta-menu-current--empty";
        leadScheduleCurrent.textContent = "Nenhum agendamento definido";
        if (leadScheduleClearBtn) leadScheduleClearBtn.disabled = true;
        return;
      }
      leadScheduleCurrent.className = "lead-meta-menu-current";
      leadScheduleCurrent.innerHTML =
        '<span class="lead-meta-menu-current__label">Agendamento atual</span><strong>' +
        escapeHtml(detail) +
        "</strong>";
      if (leadScheduleClearBtn) leadScheduleClearBtn.disabled = false;
    }

    function syncLeadMetaIconStates() {
      if (!isAgentMode) return;
      const scheduledAt = String(leadMetaState.scheduledAt || "").trim();
      const hasSchedule = Boolean(scheduledAt);
      const columnName = String(leadMetaState.kanbanColumnName || "").trim();
      const hasKanban = Boolean(String(leadMetaState.kanbanColumnId || "").trim() && columnName);

      if (leadScheduleBtn) {
        leadScheduleBtn.classList.toggle("is-set", hasSchedule);
        leadScheduleBtn.title = hasSchedule
          ? "Agendamento: " + formatScheduleDetail(scheduledAt)
          : "Agendar retorno";
        leadScheduleBtn.setAttribute(
          "aria-label",
          hasSchedule ? "Ver ou alterar agendamento" : "Agendar retorno com o lead",
        );
      }
      if (leadKanbanBtn) {
        leadKanbanBtn.classList.toggle("is-set", hasKanban);
        leadKanbanBtn.title = hasKanban ? "Kanban: " + columnName : "Coluna do Kanban";
        leadKanbanBtn.setAttribute(
          "aria-label",
          hasKanban ? "Ver ou alterar coluna do Kanban" : "Definir coluna do Kanban",
        );
      }
      renderLeadScheduleCurrent();
      buildLeadKanbanMenu();
    }

    function notifyParentQueueUpdated() {
      if (!window.parent || window.parent === window) return;
      window.parent.postMessage({ type: "chattypebot-queue-updated", contactId }, "*");
    }

    function renderLeadMetaBadges() {
      if (!isAgentMode) return;
      if (leadPinToggleBtn) {
        const pinned = leadMetaState.isPinned === true;
        leadPinToggleBtn.classList.toggle("is-active", pinned);
        leadPinToggleBtn.setAttribute("aria-pressed", pinned ? "true" : "false");
        if (leadPinToggleLabel) {
          leadPinToggleLabel.textContent = pinned ? "Desafixar conversa" : "Fixar conversa";
        }
      }
      if (leadScheduleInput && !isLeadScheduleMenuOpen()) {
        leadScheduleInput.value = toDatetimeLocalValue(leadMetaState.scheduledAt);
      }
      syncLeadMetaIconStates();
    }

    function applyLeadMetaFromContact(contact) {
      if (!contact || typeof contact !== "object") return;
      const labelIds = Array.isArray(contact.labelIds)
        ? contact.labelIds.map((id) => String(id || "").trim()).filter(Boolean)
        : contact.labelId
          ? [String(contact.labelId).trim()]
          : [];
      const labels = Array.isArray(contact.labels)
        ? contact.labels
        : contact.labelId && contact.labelName
          ? [{ id: contact.labelId, name: contact.labelName, color: contact.labelColor || "#64748b" }]
          : [];
      leadMetaState = {
        priorityId: contact.priorityId || null,
        priorityName: contact.priorityName || null,
        labelId: contact.labelId || labelIds[0] || null,
        labelName: contact.labelName || labels[0]?.name || null,
        labelColor: contact.labelColor || labels[0]?.color || null,
        labelIds,
        labels,
        scheduledAt: contact.scheduledAt || null,
        isPinned: contact.isPinned === true,
        assignedAgentId: contact.assignedAgentId || null,
        assignedAgentName: contact.assignedAgentName || null,
        kanbanColumnId: contact.kanbanColumnId || null,
        kanbanColumnName: contact.kanbanColumnName || null,
      };
      renderLeadMetaBadges();
      buildLeadActionsMenus();
    }

    async function patchLeadMeta(patch) {
      const response = await fetch("/api/chat/queue/" + contactId + "/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify(patch),
      });
      if (!response.ok) return null;
      const updated = await response.json();
      applyLeadMetaFromContact(updated);
      notifyParentQueueUpdated();
      return updated;
    }

    async function assignLeadToAttendant(agentId, agentName) {
      const response = await fetch("/api/chat/queue/" + contactId + "/assign", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ agentId, agentName }),
      });
      if (!response.ok) return null;
      const updated = await response.json();
      applyLeadMetaFromContact(updated);
      if (leadDrawerContact) applyLeadContactToDrawer(updated);
      notifyParentQueueUpdated();
      return updated;
    }

    function getSelectedLabelIds() {
      return Array.isArray(leadMetaState.labelIds)
        ? leadMetaState.labelIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [];
    }

    function toggleLeadLabel(labelId) {
      const normalized = String(labelId || "").trim();
      if (!normalized) return;
      const current = new Set(getSelectedLabelIds());
      if (current.has(normalized)) current.delete(normalized);
      else current.add(normalized);
      void patchLeadMeta({ labelIds: [...current] });
    }

    function buildLeadActionsMenus() {
      if (!isAgentMode) return;
      if (leadPrioritySubmenu) {
        const clearItem =
          '<button type="button" class="lead-actions-submenu-item" data-priority-id=""><span>Sem propriedade</span></button>';
        const items = (tenantPriorities || [])
          .map((item) => {
            const id = String(item.id || "").trim();
            const selected = id && id === String(leadMetaState.priorityId || "");
            return (
              '<button type="button" class="lead-actions-submenu-item' +
              (selected ? " is-selected" : "") +
              '" data-priority-id="' +
              escapeHtml(id) +
              '"><span>' +
              escapeHtml(String(item.name || "")) +
              "</span></button>"
            );
          })
          .join("");
        leadPrioritySubmenu.innerHTML = clearItem + items;
      }
      if (leadLabelsSubmenu) {
        const items = (tenantLabels || [])
          .map((item) => {
            const id = String(item.id || "").trim();
            const selected = getSelectedLabelIds().includes(id);
            return (
              '<button type="button" class="lead-actions-submenu-item' +
              (selected ? " is-selected" : "") +
              '" data-label-id="' +
              escapeHtml(id) +
              '"><span class="lead-actions-submenu-item__check" aria-hidden="true">✓</span><span class="lead-actions-submenu-item__dot" style="background:' +
              escapeHtml(String(item.color || "#64748b")) +
              '"></span><span>' +
              escapeHtml(String(item.name || "")) +
              "</span></button>"
            );
          })
          .join("");
        leadLabelsSubmenu.innerHTML =
          (items || '<button type="button" class="lead-actions-submenu-item" disabled><span>Sem etiquetas cadastradas</span></button>');
      }
      if (leadAssignSubmenu) {
        const currentAssigned = String(leadMetaState.assignedAgentId || "").trim().toLowerCase();
        const options = (leadAttendants || [])
          .map((attendant) => {
            const username = String(attendant.username || "").trim();
            if (!username) return "";
            const displayName = resolveAttendantDisplayName(attendant, {
              assignedAgentId: leadMetaState.assignedAgentId,
              assignedAgentName: leadMetaState.assignedAgentName,
              sessionAgentId,
              sessionAgentName,
            });
            const selected = username.toLowerCase() === currentAssigned;
            return (
              '<button type="button" class="lead-actions-submenu-item' +
              (selected ? " is-selected" : "") +
              '" data-agent-id="' +
              escapeHtml(username) +
              '" data-agent-name="' +
              escapeHtml(displayName) +
              '"><span>' +
              escapeHtml(displayName) +
              (selected ? " (atual)" : "") +
              "</span></button>"
            );
          })
          .join("");
        leadAssignSubmenu.innerHTML =
          options || '<button type="button" class="lead-actions-submenu-item" disabled><span>Nenhum atendente cadastrado</span></button>';
      }
    }

    async function ensureLeadAttendantsLoaded() {
      if (!isAgentMode) return;
      if (leadAttendants.length > 0) return;
      const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenantId) + "/attendants?t=" + Date.now(), {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      leadAttendants = Array.isArray(data) ? data : [];
      buildLeadActionsMenus();
    }

    function initLeadMetaControls() {
      if (!isAgentMode) return;
      buildLeadActionsMenus();
      renderLeadMetaBadges();
      void ensureLeadAttendantsLoaded();
      if (leadMenuBtn && leadActionsMenu) {
        leadMenuBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          void ensureLeadAttendantsLoaded();
          const willOpen = !leadActionsMenu.classList.contains("open");
          closeLeadMetaMenus(null);
          if (willOpen) {
            leadActionsMenu.classList.add("open");
            leadMenuBtn.classList.add("is-active");
            leadMenuBtn.setAttribute("aria-expanded", "true");
            buildLeadActionsMenus();
          }
        });
        leadPrioritySubmenu?.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          const button = target.closest("[data-priority-id]");
          if (!button) return;
          const priorityId = button.getAttribute("data-priority-id");
          closeLeadMetaMenus(null);
          void patchLeadMeta({ priorityId: priorityId || null });
        });
        leadLabelsSubmenu?.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          const button = target.closest("[data-label-id]");
          if (!button) return;
          event.stopPropagation();
          toggleLeadLabel(button.getAttribute("data-label-id"));
        });
        leadAssignSubmenu?.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          const button = target.closest("[data-agent-id]");
          if (!button) return;
          const agentId = String(button.getAttribute("data-agent-id") || "").trim();
          const agentName = String(button.getAttribute("data-agent-name") || "").trim();
          if (!agentId) return;
          closeLeadMetaMenus(null);
          void assignLeadToAttendant(agentId, agentName);
        });
        if (leadPinToggleBtn) {
          leadPinToggleBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            const nextPinned = leadMetaState.isPinned !== true;
            closeLeadMetaMenus(null);
            void patchLeadMeta({ isPinned: nextPinned });
          });
        }
      }
      if (leadScheduleBtn && leadScheduleMenu) {
        leadScheduleBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          const willOpen = !leadScheduleMenu.classList.contains("open");
          closeLeadMetaMenus(willOpen ? leadScheduleMenu : null);
        });
      }
      if (leadScheduleInput) {
        leadScheduleInput.addEventListener("change", () => {
          void patchLeadMeta({ scheduledAt: schedulePayloadFromInput() });
        });
      }
      if (leadScheduleSaveBtn) {
        leadScheduleSaveBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          persistLeadScheduleDraft();
          closeLeadMetaMenus(null);
        });
      }
      if (leadScheduleClearBtn) {
        leadScheduleClearBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          if (leadScheduleInput) leadScheduleInput.value = "";
          closeLeadMetaMenus(null);
          void patchLeadMeta({ scheduledAt: null });
        });
      }
      if (leadKanbanBtn && leadKanbanMenu) {
        buildLeadKanbanMenu();
        leadKanbanBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          const willOpen = !leadKanbanMenu.classList.contains("open");
          closeLeadMetaMenus(willOpen ? leadKanbanMenu : null);
        });
        leadKanbanMenu.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          const button = target.closest("[data-kanban-column-id]");
          if (!button || button.disabled) return;
          const columnId = button.getAttribute("data-kanban-column-id");
          closeLeadMetaMenus(null);
          void patchLeadMeta({ kanbanColumnId: columnId || null }).then(() => {
            if (!columnId) closeLeadMetaMenus(null);
          });
        });
      }
      document.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof Node) {
          if (leadInlineMeta && leadInlineMeta.contains(target)) return;
          if (leadActionsMenu && leadActionsMenu.contains(target)) return;
        }
        closeLeadMetaMenus(null);
      });
    }

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
      applyLeadMetaFromContact(contact);
      updateLeadWhatsappHeaderButton(contact);
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

    function normalizeWhatsappPhoneDigits(value) {
      let digits = String(value || "").replace(/\\D/g, "");
      if (!digits) return "";
      if (digits.startsWith("00")) digits = digits.slice(2);
      if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
        digits = "55" + digits;
      }
      return digits.length >= 10 ? digits : "";
    }

    function buildLeadWhatsappWebUrl(phoneDigits, contactName) {
      const greeting = "Olá" + (contactName ? " " + contactName : "") + "!";
      return "https://web.whatsapp.com/send?phone=" + encodeURIComponent(phoneDigits) + "&text=" + encodeURIComponent(greeting);
    }

    function updateLeadWhatsappHeaderButton(contact) {
      const button = document.getElementById("leadWhatsappHeaderButton");
      if (!button) return;
      const raw = resolveLeadWhatsappDisplay(contact?.leadWhatsapp, contact?.leadContext);
      const digits = normalizeWhatsappPhoneDigits(raw);
      if (!digits) {
        button.classList.add("is-hidden");
        button.setAttribute("href", "#");
        return;
      }
      const name = String(contact?.contactName || leadTitle?.textContent || "").trim();
      button.href = buildLeadWhatsappWebUrl(digits, name);
      button.classList.remove("is-hidden");
    }

    function isLeadCpfContextKey(key) {
      const normalized = String(key || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "");
      return ["cpf", "documento", "doc", "identificacao", "document"].some((candidate) => normalized.includes(candidate));
    }

    function resolveLeadCpfFromContext(context) {
      const source = context && typeof context === "object" ? context : {};
      const canonical = String(source.CPF || "").trim();
      if (canonical) return canonical;
      for (const [key, value] of Object.entries(source)) {
        if (String(key || "").trim() === "CPF") continue;
        if (!isLeadCpfContextKey(key)) continue;
        const resolved = String(value || "").trim();
        if (resolved) return resolved;
      }
      return "";
    }

    function formatBrazilianCpf(value) {
      const digits = String(value || "").replace(/\\D/g, "").slice(0, 11);
      if (!digits) return "";
      if (digits.length <= 3) return digits;
      if (digits.length <= 6) return digits.slice(0, 3) + "." + digits.slice(3);
      if (digits.length <= 9) return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6);
      return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6, 9) + "-" + digits.slice(9);
    }

    function resolveLeadCpfDisplay(inputValue, context) {
      const direct = String(inputValue || "").trim();
      if (direct) return direct;
      return resolveLeadCpfFromContext(context);
    }

    function formatLeadCpfPreview(value) {
      const resolved = String(value || "").trim();
      if (!resolved) return "Não informado";
      const masked = formatBrazilianCpf(resolved);
      return masked || "Não informado";
    }

    function syncLeadProfilePreview() {
      const name = leadNameInput ? String(leadNameInput.value || "").trim() : "";
      if (leadProfileAvatar) leadProfileAvatar.textContent = getLeadInitials(name);
      if (leadProfileName) leadProfileName.textContent = name || "Visitante";
    }

    function rememberLeadInlineFieldValue(input) {
      if (!input) return;
      leadInlineFieldState.set(input, String(input.value || "").trim());
    }

    function setLeadInlineFieldEditing(input, editing) {
      if (!input) return;
      const wrap = input.closest(".lead-inline-fact-input-wrap");
      if (wrap) wrap.classList.toggle("is-editing", editing);
      input.readOnly = !editing;
      if (editing) {
        input.focus();
        input.select();
      }
    }

    function syncLeadInlineCopyButton(input, copyButton) {
      if (!copyButton) return;
      copyButton.disabled = !String(input?.value || "").trim();
    }

    async function copyTextToClipboard(text) {
      const value = String(text || "").trim();
      if (!value) return false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch {}
      try {
        const area = document.createElement("textarea");
        area.value = value;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        area.style.top = "0";
        document.body.appendChild(area);
        area.focus();
        area.select();
        area.setSelectionRange(0, value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(area);
        return ok;
      } catch {
        return false;
      }
    }

    function bindLeadInlineField(input, copyButton, editButton) {
      if (!input) return;
      rememberLeadInlineFieldValue(input);
      input.readOnly = true;
      syncLeadInlineCopyButton(input, copyButton);
      if (editButton) {
        editButton.addEventListener("mousedown", (event) => event.preventDefault());
        editButton.addEventListener("click", () => setLeadInlineFieldEditing(input, true));
      }
      input.addEventListener("input", () => {
        syncLeadProfilePreview();
        syncLeadInlineCopyButton(input, copyButton);
      });
      input.addEventListener("blur", () => {
        setLeadInlineFieldEditing(input, false);
        const next = String(input.value || "").trim();
        const previous = String(leadInlineFieldState.get(input) || "").trim();
        if (next === previous) return;
        rememberLeadInlineFieldValue(input);
        void saveLeadContactFields();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") input.blur();
      });
      if (copyButton) {
        copyButton.addEventListener("click", async (event) => {
          event.stopPropagation();
          const value = String(input.value || "").trim();
          if (!value) return;
          const ok = await copyTextToClipboard(value);
          setLeadDrawerStatus(ok ? "Copiado para a área de transferência." : "Não foi possível copiar.");
        });
      }
    }

    function initLeadInlineFields() {
      document.querySelectorAll(".lead-inline-fact-field").forEach((item) => {
        const input = item.querySelector(".lead-inline-fact-input");
        const copyButton = item.querySelector(".lead-fact-copy");
        const editButton = item.querySelector(".lead-inline-fact-edit");
        bindLeadInlineField(input, copyButton, editButton);
      });
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
      const entries = Object.entries(contextMap || {}).filter(([key, value]) => {
        if (!key || !String(value ?? "").trim()) return false;
        return !isLeadCpfContextKey(key);
      });
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
              '" /><a class="lead-attachment-download" href="' +
              content +
              '" download="' +
              fileName +
              '">Baixar</a></div>'
            );
          }
          return (
            '<div class="lead-attachment-item"><strong>' +
            fileName +
            '</strong><a class="lead-attachment-download" href="' +
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

    function resolveLeadContactNameDisplay(contact) {
      if (!contact || typeof contact !== "object") return "";
      const direct = String(contact.contactName || "").trim();
      const context = contact.leadContext && typeof contact.leadContext === "object" ? contact.leadContext : {};
      const override = String(
        context.contactNameOverride || context.nome_contato || context["nome contato"] || "",
      ).trim();
      if (override) return override;
      if (direct && !["lead", "visitante", "-"].includes(direct.toLowerCase())) return direct;
      const preferredKeys = ["nome_completo", "Nome", "nome", "name"];
      for (const key of preferredKeys) {
        const value = String(context[key] || "").trim();
        if (value && !["lead", "visitante", "-"].includes(value.toLowerCase())) return value;
      }
      return direct || "Visitante";
    }

    function applyLeadContactToDrawer(contact) {
      leadDrawerContact = contact;
      updateLeadWhatsappHeaderButton(contact);
      const displayName = resolveLeadContactNameDisplay(contact);
      if (leadNameInput) leadNameInput.value = displayName;
      if (leadWhatsappInput) {
        leadWhatsappInput.value = resolveLeadWhatsappDisplay(contact?.leadWhatsapp, contact?.leadContext);
      }
      if (leadCpfInput) {
        leadCpfInput.value = resolveLeadCpfFromContext(contact?.leadContext || {});
      }
      if (leadNotesInput) leadNotesInput.value = "";
      if (leadTitle) leadTitle.textContent = displayName || "Visitante";
      syncLeadProfilePreview();
      rememberLeadInlineFieldValue(leadNameInput);
      rememberLeadInlineFieldValue(leadWhatsappInput);
      rememberLeadInlineFieldValue(leadCpfInput);
      document.querySelectorAll(".lead-inline-fact-field").forEach((item) => {
        const input = item.querySelector(".lead-inline-fact-input");
        const copyButton = item.querySelector(".lead-fact-copy");
        syncLeadInlineCopyButton(input, copyButton);
      });
      renderLeadVariables(contact?.leadContext || {});
      renderLeadAttachments(contact?.attachments || []);
      renderLeadNotesHistory(contact?.agentNotesHistory || []);
      syncLeadToolbarIndicators();
    }

    const knownAttendantDisplayNames = {
      "draxsistemas@gmail.com": "Drax Sistemas",
      draxsistemas: "Drax Sistemas",
      darsistemas: "Drax Sistemas",
    };

    function resolveKnownAttendantDisplayName(value) {
      const normalized = String(value || "").trim().toLowerCase();
      if (!normalized) return "";
      if (knownAttendantDisplayNames[normalized]) return knownAttendantDisplayNames[normalized];
      if (normalized.includes("@")) {
        const localPart = normalized.split("@")[0] || "";
        if (knownAttendantDisplayNames[localPart]) return knownAttendantDisplayNames[localPart];
      }
      return "";
    }

    function finalizeAttendantLabel(value) {
      const normalized = String(value || "").trim();
      if (!normalized) return "";
      return resolveKnownAttendantDisplayName(normalized) || normalized;
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
      if (displayName && !looksLikeEmail(displayName)) return finalizeAttendantLabel(displayName);
      if (usernameKey && usernameKey === assignedAgentId && assignedAgentName && !looksLikeEmail(assignedAgentName)) {
        return finalizeAttendantLabel(assignedAgentName);
      }
      if (usernameKey && usernameKey === sessionId && sessionName && !looksLikeEmail(sessionName)) {
        return finalizeAttendantLabel(sessionName);
      }
      const knownFromUsername = resolveKnownAttendantDisplayName(username);
      if (knownFromUsername) return knownFromUsername;
      if (looksLikeEmail(username)) {
        const prefix = username.split("@")[0];
        if (prefix) return finalizeAttendantLabel(prefix.trim());
      }
      return finalizeAttendantLabel(username);
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
      applyLeadMetaFromContact(contact);
      await ensureLeadAttendantsLoaded();
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

    async function saveLeadContactFields() {
      if (!isAgentMode) return false;
      setLeadDrawerStatus("Salvando...");
      const payload = {};
      const name = leadNameInput ? String(leadNameInput.value || "").trim() : "";
      const whatsapp = leadWhatsappInput ? String(leadWhatsappInput.value || "").trim() : "";
      const cpf = leadCpfInput ? String(leadCpfInput.value || "").trim() : "";
      if (name.length >= 2) payload.contactName = name;
      payload.leadWhatsapp = whatsapp;
      payload.leadCpf = cpf;
      const response = await fetch("/api/chat/queue/" + contactId + "/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setLeadDrawerStatus("Falha ao salvar dados do lead.");
        return false;
      }
      applyLeadContactToDrawer(await response.json());
      notifyParentQueueUpdated();
      setLeadDrawerStatus("Dados do lead salvos.");
      return true;
    }

    async function saveLeadProfile() {
      if (!isAgentMode) return;
      setLeadDrawerStatus("Salvando...");
      const saved = await saveLeadContactFields();
      if (!saved) return;
      const noteSaved = await registerLeadNote();
      if (!noteSaved) return;
      setLeadDrawerStatus("Dados do lead salvos.");
    }

    async function uploadLeadAttachment(file) {
      const fileName = String(file?.name || "anexo").trim();
      const mimeType = resolveLeadAttachmentMimeType(file);
      let content = "";
      if (mimeType.startsWith("image/")) {
        const raw = await readFileAsDataUrl(file);
        content = await compressImageDataUrl(raw);
        if (content.length > MAX_IMAGE_PAYLOAD_LENGTH) throw new Error("image too large");
      } else {
        const rawSize = Number(file?.size || 0);
        if (rawSize > MAX_DOCUMENT_BYTES) throw new Error("document too large");
        content = await readFileAsDataUrl(file);
        if (content.length > MAX_DOCUMENT_PAYLOAD_LENGTH) throw new Error("document too large");
      }
      const response = await fetch("/api/chat/queue/" + contactId + "/attachments", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ fileName, mimeType, content }),
      });
      if (!response.ok) {
        let detail = "";
        try {
          const payload = await response.json();
          detail = String(payload?.message || "").trim();
        } catch {}
        throw new Error(detail || "upload failed");
      }
      applyLeadContactToDrawer(await response.json());
      notifyParentQueueUpdated();
    }

    if (isAgentMode) {
      initLeadAccordion();
      initLeadInlineFields();
    }
    if (isAgentMode && leadNotesRegisterButton) {
      leadNotesRegisterButton.addEventListener("click", () => {
        void registerLeadNote();
      });
    }
    function notifyParentQueueEnded(contact) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: "chattypebot-queue-ended", contactId: contactId, contact: contact || null },
          "*",
        );
      }
    }

    function setAgentServiceEndedUI(ended) {
      if (agentWidgetRoot) agentWidgetRoot.classList.toggle("is-ended", ended);
      if (leadEndServiceButton) leadEndServiceButton.disabled = ended;
      closeLeadMetaMenus(null);
    }

    async function completeLeadService() {
      if (!isAgentMode || leadEndServiceButton?.disabled) return;
      const agentLabel = resolveAttendantDisplayName(
        { username: sessionAgentId, displayName: sessionAgentName },
        { sessionAgentId, sessionAgentName },
      );
      const response = await fetch("/api/chat/queue/" + contactId + "/complete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ agentName: agentLabel }),
      });
      if (!response.ok) return;
      const updated = await response.json();
      applyLeadMetaFromContact(updated);
      setAgentServiceEndedUI(true);
      notifyParentQueueEnded(updated);
      await loadMessages();
    }

    if (isAgentMode && leadEndServiceButton) {
      leadEndServiceButton.addEventListener("click", () => {
        void completeLeadService();
      });
      if (contactClosedInitially) {
        setAgentServiceEndedUI(true);
      }
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
        } catch (error) {
          const code = error && error.message ? String(error.message) : "";
          if (code === "document too large" || code === "image too large") {
            setLeadDrawerStatus("Arquivo muito grande. Imagens até ~200 KB após compressão; documentos até 4 MB.");
          } else if (code && code !== "upload failed") {
            setLeadDrawerStatus("Falha no envio: " + code);
          } else {
            setLeadDrawerStatus("Falha ao enviar um ou mais anexos.");
          }
        }
      });
    }

    loadAndPersistLeadCache();
    if (isAgentMode) {
      setVisitorChatEnabled(true);
      initLeadMetaControls();
      const initialQueueContactForHeader = ${initialQueueContactForHeader};
      if (initialQueueContactForHeader) {
        updateLeadWhatsappHeaderButton(initialQueueContactForHeader);
      }
    } else {
      setVisitorChatEnabled(visitorChatEnabled);
    }
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

  const handleTypebotHandoff = async (req: Request, res: Response) => {
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
        /** POST prepare-only: não enfileira (Redirect GET faz um único enqueue). */
        enqueue: z
          .preprocess((value) => {
            if (value === false || value === "false" || value === 0 || value === "0") return false;
            return true;
          }, z.boolean())
          .optional(),
      })
      .passthrough();
      const payload = payloadSchema.parse(mergeHandoffRequestInput(req));
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
      const masterTenant = findSystemMasterTenant();
      const masterTenantId = String(masterTenant?.id ?? "").trim();
      const resolvedTenantId = (() => {
        if (requestedTenantExists && requestedTenantId) {
          const hasFlowForRequested = matchingFlows.some((flow) => flow.tenantId === requestedTenantId);
          if (hasFlowForRequested) return requestedTenantId;
          if (masterTenantId && requestedTenantId === masterTenantId) return requestedTenantId;
          // Payload com tenantId desatualizado (cópia da matriz): prioriza fluxo identificado por label/URL.
          if (singleMatchedTenantId) return singleMatchedTenantId;
          return requestedTenantId;
        }
        if (singleMatchedTenantId) return singleMatchedTenantId;
        if (shouldHandoffResolveToMasterTenant(resolvedViewerUrlFromPayload) && masterTenantId) {
          return masterTenantId;
        }
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
      const storedLeadContext = pruneLeadContext(resolvedLeadContext);
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

      const typebotViewerUrlFromBody = resolvedViewerUrlFromPayload;
      const typebotViewerUrl = typebotViewerUrlFromBody || inferredFlow?.url;

      const shouldSkipEnqueue =
        req.method === "POST" && (payload as { enqueue?: boolean }).enqueue === false;

      if (shouldSkipEnqueue && tenant) {
        const prepareRedirectUrl = buildHandoffRedirectGetUrl(tenant, {
          sourceFlowLabel: sourceFlowLabelCandidate || viewerPidFromBody || displayFlowLabel,
          typebotViewerUrl: typebotViewerUrl && isSafeHttpUrl(typebotViewerUrl) ? typebotViewerUrl : undefined,
        });
        const preparePayload = {
          tenantId: resolvedTenantId,
          enqueue: false,
          handoffUrl: prepareRedirectUrl,
          redirectUrl: prepareRedirectUrl,
          url: prepareRedirectUrl,
          url_direct: prepareRedirectUrl,
          redirectTarget: prepareRedirectUrl,
          visitUrl: prepareRedirectUrl,
          openUrl: prepareRedirectUrl,
          handoffUrlFlat: prepareRedirectUrl,
          redirectUrlFlat: prepareRedirectUrl,
          urlFlat: prepareRedirectUrl,
          data: {
            handoffUrl: prepareRedirectUrl,
            redirectUrl: prepareRedirectUrl,
            url: prepareRedirectUrl,
            url_direct: prepareRedirectUrl,
            redirectTarget: prepareRedirectUrl,
            visitUrl: prepareRedirectUrl,
            openUrl: prepareRedirectUrl,
          },
          resolvedTypebotViewerUrl: typebotViewerUrl ?? null,
        };
        return res.status(200).json(preparePayload);
      }

      const item = queueService.enqueue(resolvedTenantId, {
        contactName: resolvedContactName,
        source: "typebot",
        sourceFlowLabel: displayFlowLabel || resolvedFlowLabel || "Fluxo",
        leadContext: storedLeadContext,
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
      const publicBaseUrl = getPublicBaseUrl(req, req.method === "GET" || Boolean(req.header("host")));
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
        profileImageUrl: resolveHandoffProfileImageUrl(
          tenant,
          visualConfigFromFlow?.profileImageUrl ?? visualConfigDetected.profileImageUrl,
        ),
      };
      const typebotQuery =
        typebotViewerUrl && isSafeHttpUrl(typebotViewerUrl)
          ? `&typebotUrl=${encodeURIComponent(typebotViewerUrl)}`
          : "";
      const visualQuery = `&themePageBg=${encodeURIComponent(visualConfig.pageBg)}&themeChatBg=${encodeURIComponent(
        visualConfig.chatBg,
      )}&themeUserBubbleBg=${encodeURIComponent(visualConfig.userBubbleBg)}&themeBotBubbleBg=${encodeURIComponent(
        visualConfig.botBubbleBg,
      )}`;
      const leadContextQuery = storedLeadContext
        ? `&leadContext=${encodeURIComponent(JSON.stringify(storedLeadContext))}`
        : "";
      const handoffUrl = `${publicBaseUrl}/handoff-view?tenantId=${resolvedTenantId}&contactId=${item.contactId}&contactName=${encodeURIComponent(
        payload.contactName,
      )}&flow=${encodeURIComponent(displayFlowLabel)}${typebotQuery}${leadContextQuery}${visualQuery}`;

      const responsePayload = {
        ...item,
        tenantId: resolvedTenantId,
        handoffUrl,
        redirectUrl: handoffUrl,
        url: handoffUrl,
        /** Alias para Redirect `{{url_direct}}` quando o mapeamento usa bodyPath `url_direct`. */
        url_direct: handoffUrl,
        /** Use no bloco Redirect do Typebot (bodyPath ou variável). Não use URL de imagem do MinIO. */
        redirectTarget: handoffUrl,
        visitUrl: handoffUrl,
        openUrl: handoffUrl,
        data: {
          handoffUrl,
          redirectUrl: handoffUrl,
          url: handoffUrl,
          handoffUrlFlat: handoffUrl,
          redirectUrlFlat: handoffUrl,
          urlFlat: handoffUrl,
          url_direct: handoffUrl,
          redirectTarget: handoffUrl,
          visitUrl: handoffUrl,
          openUrl: handoffUrl,
        },
        handoffUrlFlat: handoffUrl,
        redirectUrlFlat: handoffUrl,
        urlFlat: handoffUrl,
        resolvedTypebotViewerUrl: typebotViewerUrl ?? null,
      };

      if (req.method === "GET") {
        return res.redirect(302, handoffUrl);
      }

      // 200: alguns clientes HTTP do Typebot tratam melhor 200 do que 201 no fluxo síncrono.
      return res.status(200).json(responsePayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      if (req.method === "GET") {
        return res.status(400).send(`Handoff indisponível: ${message}`);
      }
      return res.status(400).json({ message });
    }
  };

  /**
   * GET: bloco Redirect do Typebot abre o link no browser (não é POST como o Webhook).
   * POST: Webhook/HTTP Request do Typebot — retorna JSON com url_direct para {{url_direct}}.
   */
  app.get("/api/typebot/handoff", handleTypebotHandoff);
  app.post("/api/typebot/handoff", handleTypebotHandoff);

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
      const tenantFlows = flowRepository.listByTenant(tenantId);
      const queue = queueService.listInbox(tenantId).map((contact) => ({
        ...contact,
        sourceFlowDisplayName: resolveSourceFlowDisplayName(tenantFlows, contact.sourceFlowLabel),
        assignedAgentName: resolveQueueContactAssignedAgentName(contact, attendants),
      }));
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.status(200).json(queue);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/master/queue/contacts", (_req, res) => {
    try {
      const tenants = tenantRepository.list();
      const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
      const attendantsByTenantId = new Map(
        tenants.map((tenant) => [tenant.id, attendantRepository.listByTenant(tenant.id)]),
      );

      for (const tenant of tenants) {
        const attendants = attendantsByTenantId.get(tenant.id) ?? [];
        const attendantByUsername = new Map(
          attendants.map((attendant) => [attendant.username.trim().toLowerCase(), attendant.displayName]),
        );
        queueService.backfillAssignedAgentNames(tenant.id, (agentId) =>
          attendantByUsername.get(agentId.trim().toLowerCase()),
        );
      }

      const contacts = queueService.listAll().map((contact) => {
        const tenantFlows = flowRepository.listByTenant(contact.tenantId);
        return {
          ...contact,
          tenantName: tenantNames.get(contact.tenantId) ?? contact.tenantId,
          sourceFlowDisplayName: resolveSourceFlowDisplayName(tenantFlows, contact.sourceFlowLabel),
          assignedAgentName: resolveQueueContactAssignedAgentName(
            contact,
            attendantsByTenantId.get(contact.tenantId) ?? [],
          ),
        };
      });

      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.status(200).json(contacts);
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
      const attendants = attendantRepository.listByTenant(tenantId);
      const normalized = {
        ...item,
        assignedAgentName: resolveQueueContactAssignedAgentName(item, attendants),
      };
      res.setHeader("x-resolved-tenant-id", tenantId);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.status(200).json(normalized);
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

  app.post("/api/chat/queue/:contactId/complete", (req, res) => {
    try {
      const tenantId = resolveTenantIdForContact(req, req.params.contactId);
      const agentName = String(req.body?.agentName ?? req.body?.agentId ?? "").trim();
      const closedByLabel =
        agentName ||
        resolveAttendantDisplayName(
          { username: String(req.header("x-agent-id") ?? "").trim(), displayName: agentName },
          {},
        ) ||
        "atendente";
      const completed = queueService.completeService(tenantId, req.params.contactId, closedByLabel);
      if (!completed) return res.status(404).json({ message: "Contact not found for tenant" });
      res.setHeader("x-resolved-tenant-id", tenantId);
      return res.status(200).json(completed);
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
