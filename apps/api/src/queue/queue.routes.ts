import type { Express, Request } from "express";
import { z } from "zod";
import type { SavedFlow } from "../flows/flow.repository";
import { attendantRepository, flowRepository, tenantRepository } from "../lib/repositories";
import { typebotPublicIdFromViewerUrl } from "../lib/typebot-public-id";
import { QueueRepository } from "./queue.repository";
import { QueueService, assignSchema, enqueueSchema, sendLiveMessageSchema } from "./queue.service";

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

const queueRepository = new QueueRepository();
const queueService = new QueueService(queueRepository);
type ViewerVisualConfig = {
  pageBg: string;
  chatBg: string;
  userBubbleBg: string;
  botBubbleBg: string;
  profileImageUrl?: string;
};

const DEFAULT_VISUAL_CONFIG: ViewerVisualConfig = {
  pageBg: "#FFFFFF",
  chatBg: "#FFFFFF",
  userBubbleBg: "#4aa3d1",
  botBubbleBg: "#FFFFFF",
};

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

const pickLeadNameFromPayload = (payload: Record<string, unknown>): string => {
  const candidates = [
    payload.contactName,
    payload.Nome,
    payload.nome,
    payload.nome_completo,
    payload["nome completo"],
    payload.name,
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
  const getPublicBaseUrl = (req: Request) => {
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
    const tenantId = String(
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
    const contactName = String(req.query.contactName ?? "Visitante");
    const flow = String(req.query.flow ?? "Fluxo");
    const mode = String(req.query.mode ?? "visitor");
    const senderRole = mode === "agent" ? "agent" : "visitor";
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

    if (!tenantId || !contactId) {
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
  <title>Atendimento ao vivo</title>
  <style>
    body { margin:0; font-family: Inter, Arial, sans-serif; background:#dfe5ec; color:#111827; }
    .shell { max-width: 880px; margin: 18px auto; padding: 12px; border:1px solid #1f2a44; border-radius:14px; background:#111b34; box-shadow: 0 18px 48px rgba(0,0,0,.35); }
    .shell.visitor { max-width: 520px; padding: 0; background: transparent; border: 0; box-shadow: none; }
    .top { display:flex; flex-direction:column; gap:6px; margin-bottom: 12px; }
    h2 { margin:0; font-size: 18px; }
    .meta { color:#a2b2cf; font-size: 13px; line-height: 1.35; }
    .lead-info { margin: 8px 0 12px; display:flex; flex-wrap:wrap; gap:8px; }
    .chip { border:1px solid #304264; background:#0d1630; color:#dbe6ff; padding:6px 10px; border-radius:999px; font-size:12px; white-space:nowrap; }
    .chat-wrap { border:1px solid #243455; border-radius:12px; overflow:hidden; background:linear-gradient(180deg,#0f1b37 0%,#0b1530 100%); min-height: 64vh; display:flex; flex-direction:column; }
    .chat { flex:1; overflow:auto; padding:12px; display:flex; flex-direction:column; gap:8px; }
    .msg { max-width: 86%; border:1px solid #334b73; border-radius:14px; padding:10px; }
    .visitor { align-self:flex-end; background:#1f2948; border-color:#4f6fb1; }
    .agent { align-self:flex-start; background:#132a2a; border-color:#2fa6a1; }
    .system { align-self:center; max-width:100%; background:#1a2340; border-color:#46527a; }
    .input { padding:10px; border-top:1px solid #243455; display:grid; grid-template-columns:1fr auto; gap:8px; background:#0d1630; }
    input, button { border-radius:10px; border:1px solid #334b73; padding:10px; }
    input { background:#0b1530; color:#eef2ff; }
    button { background:#39d0c7; color:#062422; border-color:#39d0c7; font-weight:700; cursor:pointer; }

    .visitor-shell {
      --visitor-accent: ${themeUserBubbleBg.replace(/"/g, "")};
      width: 100vw;
      margin: 0;
      min-height: 100dvh;
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
      min-height: 100dvh;
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
      max-height: calc(100dvh - 132px);
      background: #ece5dd;
    }
    .visitor-live-wrap .input {
      background:#f0f2f5;
      border-top: 1px solid #d7dee8;
      padding: 8px;
      position: sticky;
      bottom: 0;
      z-index: 5;
      padding-bottom: calc(8px + env(safe-area-inset-bottom));
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
      }
      .visitor-live-wrap .chat {
        max-height: calc(min(860px, 92vh) - 132px);
      }
      .wait-overlay {
        border-radius: 16px;
        backdrop-filter: blur(9px) saturate(115%);
        -webkit-backdrop-filter: blur(9px) saturate(115%);
      }
    }
  </style>
</head>
<body>
  ${
    isAgentMode
      ? `<div class="shell">
    <div class="top">
      <h2>Atendimento ao vivo</h2>
      <div class="meta">${escapedModeLabel}</div>
      <div class="meta">Fluxo: ${escapedFlow} | Sessão: ${escapedContactId} | Usuário: ${escapedName}</div>
    </div>
    ${leadContextHtml ? `<div class="lead-info">${leadContextHtml}</div>` : ""}

    <div class="chat-wrap">
      <div id="chat" class="chat"></div>
      <form id="form" class="input">
        <input id="message" placeholder="Digite sua resposta..." />
        <button type="submit">Enviar</button>
      </form>
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

    async function loadMessages() {
      const response = await fetch("/api/chat/sessions/" + contactId + "/messages?t=" + Date.now(), {
        cache: "no-store",
        headers: { "x-tenant-id": tenantId }
      });
      if (!response.ok) return;
      const data = await response.json();
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
        const row = document.createElement("div");
        row.className = "msg-row " + (item.sender === "visitor" ? "visitor-row" : item.sender === "agent" ? "agent-row" : "system-row");
        const div = document.createElement("div");
        div.className = "msg " + item.sender;
        div.innerHTML = "<strong>" + roleLabel(item.sender) + "</strong><div>" + formatMessageContent(item.content) + "</div>";
        if (!isAgentMode && (item.sender === "agent" || item.sender === "system")) {
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

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!isAgentMode && !visitorChatEnabled) return;
      const content = messageInput.value.trim();
      if (!content) return;
      await fetch("/api/chat/sessions/" + contactId + "/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ sender: senderRole, content })
      });
      messageInput.value = "";
      loadMessages();
    });

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
      const payloadSchema = enqueueSchema
      .extend({
        tenantId: z.string().min(2).optional(),
        initialMessage: z.string().max(3000).optional(),
        flowAlias: z.string().min(2).max(120).optional(),
        typebotViewerUrl: z.string().url().max(2048).optional(),
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
      const normalizedLabel = payload.sourceFlowLabel.toLowerCase();
      const viewerPidFromBody = payload.typebotViewerUrl?.trim()
        ? normalizeHandoffMatchToken(typebotPublicIdFromViewerUrl(payload.typebotViewerUrl))
        : "";
      const matchingFlowsMap = new Map<string, SavedFlow>();
      for (const saved of allFlows) {
        if (savedFlowMatchesHandoffSource(saved, normalizedLabel, viewerPidFromBody)) {
          matchingFlowsMap.set(saved.id, saved);
        }
      }
      const matchingFlows = [...matchingFlowsMap.values()];

      const resolvedTenantIds = [...new Set(matchingFlows.map((flow) => flow.tenantId))];
      const resolvedTenantId = payload.tenantId ?? (resolvedTenantIds.length === 1 ? resolvedTenantIds[0] : null);

      if (!resolvedTenantId) {
        return res.status(400).json({
          message:
            "Não foi possível identificar o tenant automaticamente. Envie tenantId no body do webhook, use sourceFlowLabel igual ao publicId do viewer ou ao apelido do fluxo no painel, ou inclua typebotViewerUrl com a URL pública do fluxo.",
        });
      }

      const payloadRecord = payload as Record<string, unknown>;
      const resolvedContactName = pickLeadNameFromPayload(payloadRecord);
      const resolvedFlowLabel = String(payload.flowAlias ?? payload.sourceFlowLabel ?? "Fluxo").trim();
      const knownKeys = new Set([
        "tenantId",
        "contactName",
        "source",
        "sourceFlowLabel",
        "flowAlias",
        "initialMessage",
        "typebotViewerUrl",
        "leadContext",
        "variables",
        "answers",
        "resultId",
      ]);
      const autoLeadContext = Object.entries(payload)
        .filter(([key]) => !knownKeys.has(key))
        .reduce<Record<string, string | number | boolean>>((acc, [key, value]) => {
          return flattenPrimitiveValues(value, key, acc);
        }, {});
      const variablesLeadContext = extractNamedVariables(payloadRecord.variables);
      let parsedLeadContext: Record<string, string | number | boolean> = {};
      if (typeof payload.leadContext === "string") {
        try {
          parsedLeadContext = flattenPrimitiveValues(JSON.parse(payload.leadContext));
        } catch {
          parsedLeadContext = {};
        }
      } else if (payload.leadContext && typeof payload.leadContext === "object") {
        parsedLeadContext = payload.leadContext;
      }
      const resolvedLeadContext =
        Object.keys(parsedLeadContext).length > 0
          ? parsedLeadContext
          : Object.keys(variablesLeadContext).length > 0
            ? variablesLeadContext
            : autoLeadContext;
      const tenant = tenantRepository.getById(resolvedTenantId);
      const distributionMode = tenant?.queueDistributionMode ?? "shared_pool";
      const attendantsForTenant = attendantsForQueueRouting(resolvedTenantId, tenant);

      const item = queueService.enqueue(resolvedTenantId, {
        contactName: resolvedContactName,
        source: "typebot",
        sourceFlowLabel: resolvedFlowLabel || "Fluxo",
        leadContext: Object.keys(resolvedLeadContext).length > 0 ? resolvedLeadContext : undefined,
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
      const typebotViewerUrlFromBody = payload.typebotViewerUrl?.trim();
      const inferredFlow = matchingFlows.find((saved) => saved.tenantId === resolvedTenantId);
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
      const displayFlowLabel = (payload.flowAlias?.trim() || payload.sourceFlowLabel).trim();
      const handoffUrl = `${publicBaseUrl}/handoff-view?tenantId=${resolvedTenantId}&contactId=${item.contactId}&contactName=${encodeURIComponent(
        payload.contactName,
      )}&flow=${encodeURIComponent(displayFlowLabel)}${typebotQuery}${leadContextQuery}${visualQuery}`;

      return res.status(201).json({
        ...item,
        tenantId: resolvedTenantId,
        handoffUrl,
        redirectUrl: handoffUrl,
        url: handoffUrl,
        // Compatibilidade com mapeamentos de webhook no Typebot que leem em `data.*`.
        data: {
          handoffUrl,
          redirectUrl: handoffUrl,
          url: handoffUrl,
          handoffUrlFlat: handoffUrl,
          redirectUrlFlat: handoffUrl,
          urlFlat: handoffUrl,
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
      const tenantId = getTenantId(req);
      const item = queueService.getContact(tenantId, req.params.contactId);
      if (!item) return res.status(404).json({ message: "Contact not found for tenant" });
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.status(200).json(item);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.patch("/api/chat/queue/:contactId/assign", (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const input = assignSchema.parse(req.body);
      const assigned = queueService.assign(tenantId, req.params.contactId, input);

      if (!assigned) return res.status(404).json({ message: "Contact not found for tenant" });
      return res.status(200).json(assigned);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/chat/sessions/:contactId/messages", (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const messages = queueService.getMessages(tenantId, req.params.contactId);
      if (!messages) return res.status(404).json({ message: "Session not found for tenant" });
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.status(200).json(messages);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/chat/sessions/:contactId/messages", (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const input = sendLiveMessageSchema.parse(req.body);
      const message = queueService.sendMessage(tenantId, req.params.contactId, input);
      if (!message) return res.status(404).json({ message: "Session not found for tenant" });
      return res.status(201).json(message);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });
};
