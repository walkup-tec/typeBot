import { flowRepository, tenantRepository } from "../lib/repositories";
import type { Tenant } from "../tenants/tenant.repository";
import type { SystemMasterLibraryItem } from "../flows/system-master-library.repository";
import { listSystemMasterLibrary } from "../flows/system-master-library.repository";
import { syncSourceWorkspaceFlowsToMasterTenant } from "../flows/source-master-sync.service";
import { isFlowUrlActive } from "../lib/flow-url-health";
import { importManualWorkspaceTypebotsIntoTenantFlows, refreshTenantFlowViewerUrls } from "./typebot-flow-viewer-url-sync";
import {
  buildTenantPublicLogoUrl,
  buildTenantPublicShareImageUrl,
  sanitizeTypebotSchemaMedia,
} from "./typebot-media-sanitize.service";

type ImportMapEntry = {
  matchViewerUrl?: string;
  matchTitle?: string;
  sourceTypebotId: string;
  name?: string;
};

const normalizeText = (value: string | undefined): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
const normalizeEmail = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();
const isDataImageValue = (value: string): boolean => /^data:image\//i.test(String(value ?? "").trim());
const sanitizeTypebotText = (value: string, fallback = ""): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  if (isDataImageValue(normalized)) return fallback;
  return normalized;
};

/** Builder API usada quando não há override de fonte/destino. */
const TYPEBOT_BUILDER_API_BASE_URL = String(process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "").trim();
const TYPEBOT_BUILDER_API_TOKEN = String(process.env.TYPEBOT_BUILDER_API_TOKEN ?? "").trim();

/** Leitura do schema na matriz (Walkup self-host). Default: mesma base do builder. */
const TYPEBOT_SOURCE_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_SOURCE_BUILDER_API_BASE_URL ?? TYPEBOT_BUILDER_API_BASE_URL,
).trim();
const TYPEBOT_SOURCE_BUILDER_API_TOKEN = String(
  process.env.TYPEBOT_SOURCE_BUILDER_API_TOKEN ?? TYPEBOT_BUILDER_API_TOKEN,
).trim();

/** Import/list/create workspace no ambiente do assinante (ex.: app.typebot.com). Default: mesma base. */
const TYPEBOT_TARGET_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_BASE_URL ?? TYPEBOT_BUILDER_API_BASE_URL,
).trim();
const targetTokenFromEnv = process.env.TYPEBOT_TARGET_BUILDER_API_TOKEN;
const TYPEBOT_TARGET_BUILDER_API_TOKEN = String(targetTokenFromEnv ?? TYPEBOT_BUILDER_API_TOKEN).trim();

/** URL pública do builder do destino (link “Acessar Typebot”). */
const TYPEBOT_TARGET_PUBLIC_BASE_URL = String(process.env.TYPEBOT_TARGET_PUBLIC_BASE_URL ?? "").trim();

const TYPEBOT_AUTO_CREATE_WORKSPACE = String(process.env.TYPEBOT_AUTO_CREATE_WORKSPACE ?? "true").trim().toLowerCase() !== "false";
const TYPEBOT_DEFAULT_IMPORTS_MAP_RAW = String(process.env.TYPEBOT_DEFAULT_IMPORTS_MAP ?? "").trim();
const TYPEBOT_SYSTEM_MASTER_URL = String(process.env.TYPEBOT_SYSTEM_MASTER_URL ?? "").trim();

/** Opcional: importar todos os typebots deste workspace da fonte (matriz), além dos itens padrão. */
const TYPEBOT_SOURCE_MASTER_WORKSPACE_ID = String(process.env.TYPEBOT_SOURCE_MASTER_WORKSPACE_ID ?? "").trim();
const TYPEBOT_IMPORT_FULL_SOURCE_WORKSPACE =
  String(process.env.TYPEBOT_IMPORT_FULL_SOURCE_WORKSPACE ?? "false").trim().toLowerCase() === "true";

/** Base do viewer público da fonte (ex.: `https://...viewer...host`) — usado com `publicId` do typebot para checar ativo. */
const TYPEBOT_SOURCE_VIEWER_BASE_URL = String(process.env.TYPEBOT_SOURCE_VIEWER_BASE_URL ?? "").trim();
const TYPEBOT_TARGET_VIEWER_BASE_URL = String(process.env.TYPEBOT_TARGET_VIEWER_BASE_URL ?? "").trim();
const TYPEBOT_HANDOFF_WEBHOOK_URL = String(process.env.TYPEBOT_HANDOFF_WEBHOOK_URL ?? "").trim();

/** Se true (default), só importa fluxos cuja URL pública responde 2xx (mesmo critério da Biblioteca Master). */
const TYPEBOT_TYPEBOT_IMPORT_ONLY_ACTIVE =
  String(process.env.TYPEBOT_TYPEBOT_IMPORT_ONLY_ACTIVE ?? "true").trim().toLowerCase() !== "false";

const resolveTargetViewerBaseUrl = (): string =>
  (TYPEBOT_TARGET_VIEWER_BASE_URL || TYPEBOT_SOURCE_VIEWER_BASE_URL || "").replace(/\/$/, "");

const slugifyForTypebotPublicId = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

const deriveExpectedPublicIdForTypebot = (name: string, typebotId: string): string => {
  const safeName = slugifyForTypebotPublicId(String(name ?? "").trim());
  const safeId = String(typebotId ?? "").trim();
  if (!safeName || safeId.length < 7) return "";
  const suffix = safeId.slice(-7).toLowerCase();
  return `${safeName}-${suffix}`;
};

const buildViewerUrl = (viewerBaseUrl: string, publicId: string): string =>
  `${viewerBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(publicId)}`;

const fetchTypebotPublicIdOnTarget = async (typebotId: string): Promise<string> => {
  ensureTargetConfigured();
  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`, {
    method: "GET",
    headers: buildTargetHeaders(),
  });
  if (!response.ok) return "";
  const payload = (await response.json().catch(() => ({}))) as { typebot?: { publicId?: string | null } };
  return String(payload.typebot?.publicId ?? "").trim();
};

const patchTypebotPublicIdOnTarget = async (typebotId: string, publicId: string): Promise<boolean> => {
  ensureTargetConfigured();
  const safePublicId = String(publicId ?? "").trim();
  if (!safePublicId) return false;
  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`, {
    method: "PATCH",
    headers: buildTargetHeaders(),
    body: JSON.stringify({
      typebot: {
        publicId: safePublicId,
      },
    }),
  });
  return response.ok;
};

const resolvePublicBaseForTarget = (): string => {
  if (TYPEBOT_TARGET_PUBLIC_BASE_URL) return TYPEBOT_TARGET_PUBLIC_BASE_URL.replace(/\/$/, "");
  if (TYPEBOT_SYSTEM_MASTER_URL && TYPEBOT_TARGET_BUILDER_API_BASE_URL === TYPEBOT_BUILDER_API_BASE_URL) {
    return TYPEBOT_SYSTEM_MASTER_URL.replace(/\/$/, "");
  }
  return TYPEBOT_TARGET_BUILDER_API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");
};

const TYPEBOT_PUBLIC_BASE_URL = resolvePublicBaseForTarget();

const normalizeHttpUrl = (raw: string): string => {
  const value = String(raw ?? "").trim();
  return /^https?:\/\//i.test(value) ? value : "";
};

const normalizeAvatarDataImage = (raw: string): string => {
  const value = String(raw ?? "").trim();
  return /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value) ? value : "";
};

const normalizeHexColor = (raw: string): string => {
  const value = String(raw ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "";
};

type HandoffRuntimeVars = {
  tenantId?: string;
  sourceFlowLabel?: string;
  typebotViewerUrl?: string;
};

const HANDOFF_WEBHOOK_RESERVED_KEYS = new Set([
  "tenantId",
  "tenant_id",
  "sourceFlowLabel",
  "source_flow_label",
  "flowAlias",
  "typebotViewerUrl",
  "viewer_url",
  "contactName",
  "source",
  "initialMessage",
  "leadContext",
  "variables",
  "answers",
  "resultId",
  "leadWhatsapp",
]);

const isHandoffSystemVariableName = (name: string): boolean => {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return true;
  if (HANDOFF_WEBHOOK_RESERVED_KEYS.has(name)) return true;
  if (normalized.includes("url_direct")) return true;
  if (normalized.startsWith("handoff_")) return true;
  if (normalized === "viewer_url" || normalized === "viewer url") return true;
  return false;
};

const collectHandoffLeadVariableNames = (schema: Record<string, unknown>): string[] => {
  const variables = schema.variables;
  if (!Array.isArray(variables)) return [];
  const names = new Set<string>();
  for (const variable of variables) {
    if (!variable || typeof variable !== "object") continue;
    const record = variable as { name?: unknown; isSessionVariable?: unknown };
    if (record.isSessionVariable) continue;
    const name = String(record.name ?? "").trim();
    if (!name || isHandoffSystemVariableName(name)) continue;
    names.add(name);
  }
  return [...names];
};

const mergeHandoffWebhookLeadFields = (rawBody: string, variableNames: string[]): string => {
  const body = String(rawBody ?? "").trim();
  if (!body || variableNames.length === 0) return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return body;
    for (const name of variableNames) {
      if (Object.prototype.hasOwnProperty.call(parsed, name)) continue;
      parsed[name] = `{{${name}}}`;
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
};

const normalizeTypebotWebhookBody = (rawBody: string, runtimeVars: HandoffRuntimeVars): string => {
  const body = String(rawBody ?? "").trim();
  if (!body) return body;
  const tenantId = String(runtimeVars.tenantId ?? "").trim();
  const sourceFlowLabel = String(runtimeVars.sourceFlowLabel ?? "").trim();
  const typebotViewerUrl = String(runtimeVars.typebotViewerUrl ?? "").trim();
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      if (tenantId) parsed.tenantId = tenantId;
      if (sourceFlowLabel) parsed.sourceFlowLabel = sourceFlowLabel;
      if (typebotViewerUrl) parsed.typebotViewerUrl = typebotViewerUrl;
      return JSON.stringify(parsed);
    }
  } catch {
    // fallback regex abaixo
  }
  let nextBody = body;
  if (tenantId) nextBody = nextBody.replace(/"tenantId"\s*:\s*"[^"]*"/, `"tenantId": "${tenantId}"`);
  if (sourceFlowLabel) {
    nextBody = nextBody.replace(/"sourceFlowLabel"\s*:\s*"[^"]*"/, `"sourceFlowLabel": "${sourceFlowLabel}"`);
  }
  if (typebotViewerUrl) {
    nextBody = nextBody.replace(/"typebotViewerUrl"\s*:\s*"[^"]*"/, `"typebotViewerUrl": "${typebotViewerUrl}"`);
  }
  return nextBody;
};

const isWebhookLikeHttpBlock = (blockType: string): boolean => {
  const n = blockType.trim().toLowerCase();
  return n === "webhook" || n === "http request";
};

const patchHandoffWebhookAndRedirectConfig = (
  schema: Record<string, unknown>,
  tenant: Tenant,
  runtimeVars?: HandoffRuntimeVars,
): Record<string, unknown> => {
  const groupsRaw = schema.groups;
  const groups = Array.isArray(groupsRaw) ? groupsRaw : [];
  const nextGroups = groups.map((group) => {
    if (!group || typeof group !== "object") return group;
    const groupRecord = { ...(group as Record<string, unknown>) };
    const blocksRaw = groupRecord.blocks;
    if (!Array.isArray(blocksRaw)) return groupRecord;
    groupRecord.blocks = blocksRaw.map((block) => {
      if (!block || typeof block !== "object") return block;
      const blockRecord = { ...(block as Record<string, unknown>) };
      const type = String(blockRecord.type ?? "").trim();
      if (!isWebhookLikeHttpBlock(type)) return blockRecord;
      const optionsRaw = blockRecord.options;
      if (!optionsRaw || typeof optionsRaw !== "object") return blockRecord;
      const options = { ...(optionsRaw as Record<string, unknown>) };
      const webhookRaw = options.webhook;
      if (!webhookRaw || typeof webhookRaw !== "object") return blockRecord;
      const webhook = { ...(webhookRaw as Record<string, unknown>) };
      if (TYPEBOT_HANDOFF_WEBHOOK_URL) {
        webhook.url = TYPEBOT_HANDOFF_WEBHOOK_URL;
      }
      const body = String(webhook.body ?? "");
      const normalizedBody = normalizeTypebotWebhookBody(body, {
        tenantId: String(tenant.id ?? "").trim(),
        sourceFlowLabel: runtimeVars?.sourceFlowLabel,
        typebotViewerUrl: runtimeVars?.typebotViewerUrl,
      });
      webhook.body = mergeHandoffWebhookLeadFields(normalizedBody, collectHandoffLeadVariableNames(schema));
      options.webhook = webhook;
      const responseVariableMappingRaw = options.responseVariableMapping;
      const responseVariableMapping = Array.isArray(responseVariableMappingRaw)
        ? responseVariableMappingRaw.map((row) => {
            if (!row || typeof row !== "object") return row;
            const item = { ...(row as Record<string, unknown>) };
            const path = String(item.bodyPath ?? "").trim().toLowerCase();
            // Resposta do handoff expõe `url_direct` na raiz (e em data) para combinar com Redirect `{{url_direct}}`.
            if (
              path === "urlflat" ||
              path === "url" ||
              path === "data.url" ||
              path === "data.urlflat" ||
              path === "handoffurl" ||
              path === "redirecturl" ||
              path === "urldirect" ||
              path === "url_direct" ||
              path === "data.url_direct"
            ) {
              item.bodyPath = "url_direct";
            }
            return item;
          })
        : responseVariableMappingRaw;
      options.responseVariableMapping = responseVariableMapping;
      blockRecord.options = options;
      return blockRecord;
    });
    return groupRecord;
  });
  return {
    ...schema,
    groups: nextGroups,
  };
};

const getReadableButtonTextColor = (hex: string): string => {
  const color = normalizeHexColor(hex);
  if (!color) return "#FFFFFF";
  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#FFFFFF";
};

const BUTTON_THEME_CSS_MARKER_START = "/* drax-auto-button-theme:start */";
const BUTTON_THEME_CSS_MARKER_END = "/* drax-auto-button-theme:end */";

const upsertAutoButtonCss = (currentCss: string, buttonBgColor: string, buttonTextColor: string): string => {
  const css = String(currentCss ?? "").trim();
  const autoBlock = `${BUTTON_THEME_CSS_MARKER_START}
.typebot-button {
  background-color: ${buttonBgColor} !important;
  border-color: ${buttonBgColor} !important;
  color: ${buttonTextColor} !important;
}
${BUTTON_THEME_CSS_MARKER_END}`;

  if (!css) return autoBlock;
  const escapedStart = BUTTON_THEME_CSS_MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = BUTTON_THEME_CSS_MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRegex = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, "m");
  if (blockRegex.test(css)) {
    return css.replace(blockRegex, autoBlock);
  }
  return `${css}\n\n${autoBlock}`;
};

const parseImportsMap = (): ImportMapEntry[] => {
  if (!TYPEBOT_DEFAULT_IMPORTS_MAP_RAW) return [];
  try {
    const parsed = JSON.parse(TYPEBOT_DEFAULT_IMPORTS_MAP_RAW) as ImportMapEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const importsMap = parseImportsMap();

const resolvePublishedViewerUrlFromTypebot = (typebot: Record<string, unknown>): string | null => {
  if (!TYPEBOT_SOURCE_VIEWER_BASE_URL) return null;
  const publicIdRaw = typebot.publicId;
  const publicId = typeof publicIdRaw === "string" ? publicIdRaw.trim() : "";
  if (!publicId) return null;
  const base = TYPEBOT_SOURCE_VIEWER_BASE_URL.replace(/\/$/, "");
  return `${base}/${encodeURIComponent(publicId)}`;
};

const buildSourceHeaders = () => ({
  "content-type": "application/json",
  Authorization: `Bearer ${TYPEBOT_SOURCE_BUILDER_API_TOKEN}`,
});

const buildTargetHeaders = () => ({
  "content-type": "application/json",
  Authorization: `Bearer ${TYPEBOT_TARGET_BUILDER_API_TOKEN}`,
});

/** Lê corpo de erro HTTP (JSON.message ou texto cru), truncado para persistência segura em tenant. */
const readFetchErrorBody = async (response: Response): Promise<string> => {
  const text = await response.text();
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return "";
  try {
    const json = JSON.parse(trimmed) as { message?: unknown };
    const msg = json.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  } catch {
    // resposta não-JSON
  }
  return trimmed;
};

const listTargetWorkspaces = async (): Promise<Array<{ id: string; name: string }>> => {
  ensureTargetConfigured();
  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/workspaces`, {
    method: "GET",
    headers: buildTargetHeaders(),
  });
  if (!response.ok) {
    const detail = await readFetchErrorBody(response);
    throw new Error(`Falha ao listar workspaces Typebot (${response.status}).${detail ? ` ${detail}` : ""}`);
  }
  const payload = (await response.json()) as { workspaces?: Array<{ id?: string; name?: string | null }> };
  const out: Array<{ id: string; name: string }> = [];
  for (const row of payload.workspaces ?? []) {
    const id = String(row.id ?? "").trim();
    const name = String(row.name ?? "").trim();
    if (id && name) out.push({ id, name });
  }
  return out;
};

/** Workspace já criado manualmente ou por tentativa anterior com mesmo nome de assinante. */
const findTargetWorkspaceMatchingTenant = async (tenant: Tenant): Promise<{ id: string; name: string } | null> => {
  const safeName = sanitizeTypebotText(tenant.name, "Workspace");
  const needle = normalizeText(safeName);
  if (!needle) return null;
  const rows = await listTargetWorkspaces();
  return rows.find((row) => normalizeText(row.name) === needle) ?? null;
};

const ensureSourceConfigured = () => {
  if (!TYPEBOT_SOURCE_BUILDER_API_BASE_URL) {
    throw new Error("Fonte Typebot: configure TYPEBOT_SOURCE_BUILDER_API_BASE_URL ou TYPEBOT_BUILDER_API_BASE_URL.");
  }
  if (!TYPEBOT_SOURCE_BUILDER_API_TOKEN) {
    throw new Error("Fonte Typebot: configure TYPEBOT_SOURCE_BUILDER_API_TOKEN ou TYPEBOT_BUILDER_API_TOKEN.");
  }
};

const ensureTargetConfigured = () => {
  if (!TYPEBOT_TARGET_BUILDER_API_BASE_URL) {
    throw new Error("Destino Typebot: configure TYPEBOT_TARGET_BUILDER_API_BASE_URL ou TYPEBOT_BUILDER_API_BASE_URL.");
  }
  if (!TYPEBOT_TARGET_BUILDER_API_TOKEN) {
    throw new Error("Destino Typebot: configure TYPEBOT_TARGET_BUILDER_API_TOKEN ou TYPEBOT_BUILDER_API_TOKEN.");
  }
};

const resolveSourceTypebotId = (item: SystemMasterLibraryItem): string | null => {
  const byViewer = importsMap.find(
    (entry) => normalizeText(entry.matchViewerUrl) && normalizeText(entry.matchViewerUrl) === normalizeText(item.viewerUrl),
  );
  if (byViewer?.sourceTypebotId) return byViewer.sourceTypebotId.trim();
  const byTitle = importsMap.find(
    (entry) => normalizeText(entry.matchTitle) && normalizeText(entry.matchTitle) === normalizeText(item.title),
  );
  if (byTitle?.sourceTypebotId) return byTitle.sourceTypebotId.trim();
  return null;
};

const resolveSourceTypebotIdWithFallback = async (item: SystemMasterLibraryItem): Promise<string | null> => {
  const mapped = resolveSourceTypebotId(item);
  if (mapped) return mapped;
  if (!TYPEBOT_SOURCE_MASTER_WORKSPACE_ID) return null;
  try {
    const masterBots = await listSourceWorkspaceTypebots(TYPEBOT_SOURCE_MASTER_WORKSPACE_ID);
    const expectedTitle = normalizeText(item.title);
    const expectedNickname = normalizeText(item.suggestedNickname);
    const match = masterBots.find((bot) => {
      const botName = normalizeText(bot.name);
      return botName === expectedTitle || botName === expectedNickname;
    });
    return match?.id ?? null;
  } catch {
    return null;
  }
};

const createWorkspace = async (tenant: Tenant): Promise<{ id: string; name: string }> => {
  ensureTargetConfigured();
  const preexisting = await findTargetWorkspaceMatchingTenant(tenant);
  if (preexisting) return preexisting;

  const safeWorkspaceName = sanitizeTypebotText(tenant.name, "Workspace");
  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/workspaces`, {
    method: "POST",
    headers: buildTargetHeaders(),
    body: JSON.stringify({
      name: safeWorkspaceName,
    }),
  });
  if (!response.ok) {
    const detail = await readFetchErrorBody(response);
    if (response.status === 400 && /same name already exists/i.test(detail)) {
      const recovered = await findTargetWorkspaceMatchingTenant(tenant);
      if (recovered) return recovered;
    }
    throw new Error(`Falha ao criar workspace Typebot no destino (${response.status}).${detail ? ` ${detail}` : ""}`);
  }
  const payload = (await response.json()) as { workspace?: { id?: string; name?: string } };
  const workspaceId = String(payload.workspace?.id ?? "").trim();
  const workspaceName = sanitizeTypebotText(String(payload.workspace?.name ?? safeWorkspaceName), safeWorkspaceName);
  if (!workspaceId) {
    throw new Error("Workspace Typebot criado sem ID.");
  }
  return { id: workspaceId, name: workspaceName };
};

const sanitizeWorkspaceIconOnTarget = async (workspaceId: string, fallbackName: string): Promise<void> => {
  ensureTargetConfigured();
  const normalizedWorkspaceId = String(workspaceId ?? "").trim();
  if (!normalizedWorkspaceId) return;
  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/workspaces`, {
    method: "GET",
    headers: buildTargetHeaders(),
  });
  if (!response.ok) return;
  const payload = (await response.json()) as {
    workspaces?: Array<{ id?: string | null; name?: string | null; icon?: string | null }>;
  };
  const workspace = (payload.workspaces ?? []).find(
    (item) => String(item?.id ?? "").trim() === normalizedWorkspaceId,
  );
  if (!workspace) return;
  const icon = String(workspace.icon ?? "").trim();
  if (!/^data:image\//i.test(icon)) return;
  const safeName = sanitizeTypebotText(
    String(workspace.name ?? "").trim(),
    sanitizeTypebotText(String(fallbackName ?? "").trim(), "Workspace"),
  );
  await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/workspaces/${encodeURIComponent(normalizedWorkspaceId)}`, {
    method: "PATCH",
    headers: buildTargetHeaders(),
    body: JSON.stringify({
      name: safeName,
      icon: "",
    }),
  });
};

const fetchTypebotSchemaFromSource = async (sourceTypebotId: string) => {
  ensureSourceConfigured();
  const response = await fetch(
    `${TYPEBOT_SOURCE_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(sourceTypebotId)}?migrateToLatestVersion=true`,
    {
      method: "GET",
      headers: buildSourceHeaders(),
    },
  );
  if (!response.ok) {
    throw new Error(`Falha ao obter typebot fonte ${sourceTypebotId} (${response.status}).`);
  }
  const payload = (await response.json()) as { typebot?: Record<string, unknown> };
  if (!payload.typebot || typeof payload.typebot !== "object") {
    throw new Error(`Typebot fonte ${sourceTypebotId} inválido.`);
  }
  return payload.typebot;
};

const applyTenantMetadataToTypebotSchema = (
  schema: Record<string, unknown>,
  tenant: Tenant,
  flowTitle: string,
): Record<string, unknown> => {
  const next: Record<string, unknown> = patchHandoffWebhookAndRedirectConfig({ ...schema }, tenant);
  const title = sanitizeTypebotText(String(flowTitle ?? "").trim(), "Fluxo");
  const iconRaw = String(tenant.profileImageUrl ?? "").trim();
  const imageRaw = String(tenant.shareImageUrl ?? "").trim();
  const tenantPublicLogoUrl = buildTenantPublicLogoUrl(tenant);
  const tenantPublicShareImageUrl = buildTenantPublicShareImageUrl(tenant);
  // Mantém upload local por data URI no cadastro do tenant, mas sempre envia ao Typebot apenas URL http(s).
  const iconHttpUrl = normalizeHttpUrl(iconRaw);
  const iconDataImage = normalizeAvatarDataImage(iconRaw);
  const imageHttpUrl = normalizeHttpUrl(imageRaw);
  // Avatar visual do chat pode usar data:image quando não houver URL pública.
  const avatarUrl = tenantPublicLogoUrl || iconHttpUrl || iconDataImage;
  // Ícone do typebot aparece no topo/listagens: nunca usar data:image aqui.
  const iconUrl = tenantPublicLogoUrl || iconHttpUrl;
  const iconMetadata = tenantPublicLogoUrl || iconHttpUrl;
  const imageMetadata = tenantPublicShareImageUrl || imageHttpUrl;
  const description = sanitizeTypebotText(String(tenant.shareDescription ?? "").trim(), "");
  const buttonBgColor = normalizeHexColor(String(tenant.defaultChatTheme?.userBubbleBg ?? ""));
  const buttonTextColor = getReadableButtonTextColor(buttonBgColor);

  // Campos diretos (compatível com variações de schema).
  if (title) next.title = title;
  if (iconUrl) next.icon = iconUrl;
  next.image = null;
  if (description) next.description = description;

  // Campos de metadata (tela Metadados do Typebot).
  const settingsRaw = next.settings;
  const settings =
    settingsRaw && typeof settingsRaw === "object" ? ({ ...(settingsRaw as Record<string, unknown>) } as Record<string, unknown>) : {};
  const metadataRaw = settings.metadata;
  const metadata =
    metadataRaw && typeof metadataRaw === "object"
      ? ({ ...(metadataRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  // Não sobrescreve metadados já definidos no builder (ex.: compartilhamento WhatsApp/OG).
  if (title && !String(metadata.title ?? "").trim()) metadata.title = title;
  if (iconMetadata && !String(metadata.favIconUrl ?? "").trim()) metadata.favIconUrl = iconMetadata;
  if (imageMetadata && !String(metadata.imageUrl ?? "").trim()) metadata.imageUrl = imageMetadata;
  if (description && !String(metadata.description ?? "").trim()) metadata.description = description;

  settings.metadata = metadata;
  next.settings = settings;

  // Tema do Typebot (Chat > Avatar do bot): força avatar com logo do assinante.
  const themeRaw = next.theme;
  const theme =
    themeRaw && typeof themeRaw === "object" ? ({ ...(themeRaw as Record<string, unknown>) } as Record<string, unknown>) : {};
  const chatRaw = theme.chat;
  const chat =
    chatRaw && typeof chatRaw === "object" ? ({ ...(chatRaw as Record<string, unknown>) } as Record<string, unknown>) : {};
  const hostAvatarRaw = chat.hostAvatar;
  const hostAvatar =
    hostAvatarRaw && typeof hostAvatarRaw === "object"
      ? ({ ...(hostAvatarRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  if (avatarUrl) {
    hostAvatar.isEnabled = true;
    hostAvatar.url = avatarUrl;
  }
  chat.hostAvatar = hostAvatar;

  // Botões (Theme do Typebot): usa cor predominante da logo salva no tenant.
  if (buttonBgColor) {
    const chatButtonsRaw = chat.buttons;
    const chatButtons =
      chatButtonsRaw && typeof chatButtonsRaw === "object"
        ? ({ ...(chatButtonsRaw as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    chatButtons.backgroundColor = buttonBgColor;
    chatButtons.color = buttonTextColor;
    chat.buttons = chatButtons;
  }

  theme.chat = chat;
  if (buttonBgColor) {
    const currentCss = typeof theme.customCss === "string" ? theme.customCss : "";
    theme.customCss = upsertAutoButtonCss(currentCss, buttonBgColor, buttonTextColor);
  }
  next.theme = theme;

  return sanitizeTypebotSchemaMedia(next, tenant);
};

const publishTypebotOnTarget = async (typebotId: string): Promise<void> => {
  ensureTargetConfigured();
  const normalizedId = String(typebotId ?? "").trim();
  if (!normalizedId) throw new Error("Typebot importado sem ID para publicar.");

  const attempts: Array<{ method: "POST" | "PATCH"; url: string; body?: Record<string, unknown> }> = [
    { method: "POST", url: `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(normalizedId)}/publish` },
    { method: "POST", url: `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(normalizedId)}/publications` },
    {
      method: "PATCH",
      url: `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(normalizedId)}`,
      body: { published: true },
    },
  ];

  for (const attempt of attempts) {
    const response = await fetch(attempt.url, {
      method: attempt.method,
      headers: buildTargetHeaders(),
      body: attempt.body ? JSON.stringify(attempt.body) : undefined,
    });
    if (response.ok) return;
  }

  throw new Error(`Falha ao publicar typebot importado ${normalizedId} no destino.`);
};

const ensureTypebotOperationalOnTarget = async (typebotId: string, name: string): Promise<void> => {
  const normalizedId = String(typebotId ?? "").trim();
  if (!normalizedId) throw new Error("Typebot sem ID para validação operacional.");
  const expectedPublicId = deriveExpectedPublicIdForTypebot(name, normalizedId);
  const viewerBaseUrl = resolveTargetViewerBaseUrl();
  const maxAttempts = 3;
  let lastViewerUrl = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (expectedPublicId) {
      const currentPublicId = await fetchTypebotPublicIdOnTarget(normalizedId);
      if (currentPublicId !== expectedPublicId) {
        await patchTypebotPublicIdOnTarget(normalizedId, expectedPublicId);
      }
    }

    await publishTypebotOnTarget(normalizedId);

    if (!viewerBaseUrl || !expectedPublicId) return;

    lastViewerUrl = buildViewerUrl(viewerBaseUrl, expectedPublicId);
    const active = await isFlowUrlActive(lastViewerUrl);
    if (active) return;
    if (attempt < maxAttempts) await sleep(1200);
  }

  throw new Error(
    `Fluxo "${name}" publicado, porém sem acessibilidade confirmada no viewer: ${lastViewerUrl || "URL indisponível"}.`,
  );
};

const applyTenantButtonThemeCssOnTarget = async (typebotId: string, tenant: Tenant): Promise<void> => {
  ensureTargetConfigured();
  const buttonBgColor = normalizeHexColor(String(tenant.defaultChatTheme?.userBubbleBg ?? "")) || "#000000";
  const buttonTextColor = getReadableButtonTextColor(buttonBgColor);

  const getResponse = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}?migrateToLatestVersion=true`,
    {
      method: "GET",
      headers: buildTargetHeaders(),
    },
  );
  if (!getResponse.ok) return;
  const payload = (await getResponse.json()) as { typebot?: Record<string, unknown> };
  if (!payload.typebot || typeof payload.typebot !== "object") return;

  const currentThemeRaw = payload.typebot.theme;
  const currentTheme =
    currentThemeRaw && typeof currentThemeRaw === "object"
      ? ({ ...(currentThemeRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const currentChatRaw = currentTheme.chat;
  const currentChat =
    currentChatRaw && typeof currentChatRaw === "object"
      ? ({ ...(currentChatRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const currentButtonsRaw = currentChat.buttons;
  const currentButtons =
    currentButtonsRaw && typeof currentButtonsRaw === "object"
      ? ({ ...(currentButtonsRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  currentButtons.backgroundColor = buttonBgColor;
  currentButtons.color = buttonTextColor;
  currentChat.buttons = currentButtons;
  const currentCss = typeof currentTheme.customCss === "string" ? currentTheme.customCss : "";
  const nextCss = upsertAutoButtonCss(currentCss, buttonBgColor, buttonTextColor);

  const patchResponse = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`, {
    method: "PATCH",
    headers: buildTargetHeaders(),
    body: JSON.stringify({
      typebot: {
        theme: {
          chat: currentChat,
          customCss: nextCss,
        },
      },
    }),
  });
  if (patchResponse.ok) {
    await publishTypebotOnTarget(typebotId);
  }
};

const resolveTenantAvatarValue = (tenant: Tenant): string => {
  const iconRaw = String(tenant.profileImageUrl ?? "").trim();
  const tenantPublicLogoUrl = buildTenantPublicLogoUrl(tenant);
  const iconHttpUrl = normalizeHttpUrl(iconRaw);
  const iconDataImage = normalizeAvatarDataImage(iconRaw);
  return tenantPublicLogoUrl || iconHttpUrl || iconDataImage;
};

const applyTenantAvatarThemeOnTarget = async (typebotId: string, tenant: Tenant): Promise<void> => {
  ensureTargetConfigured();
  const avatarUrl = resolveTenantAvatarValue(tenant);
  if (!avatarUrl) return;
  const patchResponse = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`, {
    method: "PATCH",
    headers: buildTargetHeaders(),
    body: JSON.stringify({
      typebot: {
        theme: {
          chat: {
            hostAvatar: {
              isEnabled: true,
              url: avatarUrl,
            },
          },
        },
      },
    }),
  });
  if (patchResponse.ok) {
    await publishTypebotOnTarget(typebotId);
  }
};

const applyTenantIconOnTarget = async (typebotId: string, tenant: Tenant): Promise<void> => {
  ensureTargetConfigured();
  const rawIcon = String(tenant.profileImageUrl ?? "").trim();
  const iconHttpUrl = normalizeHttpUrl(rawIcon);
  // Segurança de UI do Builder: nunca gravar data:image em `typebot.icon`.
  const safeIcon = buildTenantPublicLogoUrl(tenant) || iconHttpUrl || "";
  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`, {
    method: "PATCH",
    headers: buildTargetHeaders(),
    body: JSON.stringify({
      typebot: {
        icon: safeIcon,
      },
    }),
  });
  if (response.ok) {
    // Evita deixar alterações em draft após patch de ícone.
    await publishTypebotOnTarget(typebotId);
  }
};

const importTypebotIntoTargetWorkspace = async (
  workspaceId: string,
  name: string,
  typebot: Record<string, unknown>,
  tenant: Tenant,
): Promise<string> => {
  ensureTargetConfigured();
  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/import`, {
    method: "POST",
    headers: buildTargetHeaders(),
    body: JSON.stringify({
      workspaceId,
      typebot: applyTenantMetadataToTypebotSchema(
        {
          ...typebot,
          name,
        },
        tenant,
        name,
      ),
    }),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Falha ao importar typebot "${name}" no destino (${response.status})${details ? `: ${details.slice(0, 500)}` : "."}`,
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    typebot?: { id?: string | null };
    id?: string | null;
  };
  const importedId = String(payload.typebot?.id ?? payload.id ?? "").trim();
  if (!importedId) {
    throw new Error(`Typebot "${name}" importado sem ID retornado pela API de destino.`);
  }
  // Regra operacional: fluxo importado deve sair com publicId esperado, publicado e acessível no viewer.
  await ensureTypebotOperationalOnTarget(importedId, name);
  return importedId;
};

type TargetWorkspaceTypebotRow = { id: string; name: string };

const listWorkspaceTypebotsOnTarget = async (workspaceId: string): Promise<TargetWorkspaceTypebotRow[]> => {
  ensureTargetConfigured();
  const response = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots?workspaceId=${encodeURIComponent(workspaceId)}`,
    {
      method: "GET",
      headers: buildTargetHeaders(),
    },
  );
  if (!response.ok) {
    throw new Error(`Falha ao listar typebots do workspace destino ${workspaceId} (${response.status}).`);
  }
  const payload = (await response.json()) as { typebots?: Array<{ id?: string | null; name?: string | null }> };
  const rows: TargetWorkspaceTypebotRow[] = [];
  for (const typebot of payload.typebots ?? []) {
    const id = String(typebot.id ?? "").trim();
    const name = String(typebot.name ?? "").trim();
    if (id && name) rows.push({ id, name });
  }
  return rows;
};

const deleteTypebotOnTarget = async (typebotId: string): Promise<boolean> => {
  ensureTargetConfigured();
  const normalizedId = String(typebotId ?? "").trim();
  if (!normalizedId) return false;
  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(normalizedId)}`, {
    method: "DELETE",
    headers: buildTargetHeaders(),
  });
  return response.ok;
};

/**
 * Nunca apaga typebots criados no workspace do assinante (ex.: Campanha, Drax Sistemas).
 * `strictMode` legado é ignorado — remoção remota só via `removeSystemDefaultFromSubscriberWorkspaces`.
 */
const pruneNonDefaultTypebotsOnTarget = async (
  _workspaceId: string,
  _allowedDefaultNames: Set<string>,
  _strictMode: boolean,
): Promise<string[]> => {
  return [];
};

const publishAllWorkspaceTypebotsOnTarget = async (workspaceId: string): Promise<string[]> => {
  const rows = await listWorkspaceTypebotsOnTarget(workspaceId);
  const publishedNames: string[] = [];
  for (const row of rows) {
    await ensureTypebotOperationalOnTarget(row.id, row.name);
    publishedNames.push(row.name);
  }
  return publishedNames;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const listInactiveTenantLibraryFlows = async (
  tenantId: string,
): Promise<Array<{ id: string; name: string; url: string }>> => {
  const flows = flowRepository
    .listByTenant(tenantId)
    .filter((flow) => Boolean(String(flow.librarySourceId ?? "").trim()))
    .filter((flow) => Boolean(String(flow.url ?? "").trim()));
  const inactive: Array<{ id: string; name: string; url: string }> = [];
  for (const flow of flows) {
    const url = String(flow.url ?? "").trim();
    if (!url) continue;
    const active = await isFlowUrlActive(url);
    if (!active) {
      inactive.push({
        id: flow.id,
        name: String(flow.displayLabel ?? flow.nickname ?? "Fluxo").trim(),
        url,
      });
    }
  }
  return inactive;
};

const forcePublishUntilTenantLinksAreActive = async (
  tenantId: string,
  workspaceId: string,
): Promise<{ recovered: string[]; stillInactive: string[]; attempts: number }> => {
  const recovered = new Set<string>();
  const maxAttempts = 3;
  let attempts = 0;
  let stillInactive: Array<{ id: string; name: string; url: string }> = [];

  for (let i = 0; i < maxAttempts; i += 1) {
    attempts = i + 1;
    stillInactive = await listInactiveTenantLibraryFlows(tenantId);
    if (stillInactive.length === 0) break;

    await publishAllWorkspaceTypebotsOnTarget(workspaceId);
    await refreshTenantFlowViewerUrls(tenantId);

    const afterRetry = await listInactiveTenantLibraryFlows(tenantId);
    const afterIds = new Set(afterRetry.map((flow) => flow.id));
    for (const before of stillInactive) {
      if (!afterIds.has(before.id)) recovered.add(before.name);
    }
    stillInactive = afterRetry;
    if (stillInactive.length === 0) break;
    if (i < maxAttempts - 1) await sleep(1200);
  }

  return {
    recovered: [...recovered],
    stillInactive: stillInactive.map((flow) => flow.name),
    attempts,
  };
};

const pruneTenantLocalLibraryFlows = (
  tenantId: string,
  allowedDefaultNames: Set<string>,
  strictMode: boolean,
): string[] => {
  const removedLocalNames: string[] = [];
  const libraryFlows = flowRepository
    .listByTenant(tenantId)
    .filter((flow) => Boolean(String(flow.librarySourceId ?? "").trim()));
  const grouped = new Map<string, typeof libraryFlows>();
  for (const flow of libraryFlows) {
    const normalizedName = normalizeText(flow.displayLabel ?? flow.nickname);
    if (!normalizedName) continue;
    if (!grouped.has(normalizedName)) grouped.set(normalizedName, []);
    grouped.get(normalizedName)?.push(flow);
  }

  for (const [normalizedName, flows] of grouped.entries()) {
    if (strictMode && !allowedDefaultNames.has(normalizedName)) {
      continue;
    }
    if (flows.length <= 1) continue;
    const sorted = [...flows].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
    const keepId = sorted[0]?.id;
    for (const flow of sorted.slice(1)) {
      if (flow.id === keepId) continue;
      if (flowRepository.removeById(flow.id)) {
        removedLocalNames.push(flow.displayLabel ?? flow.nickname);
      }
    }
  }
  return removedLocalNames;
};

const updateTypebotMetadataOnTarget = async (typebotId: string, name: string, tenant: Tenant): Promise<void> => {
  ensureTargetConfigured();
  const response = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}?migrateToLatestVersion=true`,
    {
      method: "GET",
      headers: buildTargetHeaders(),
    },
  );
  if (!response.ok) return;
  const payload = (await response.json()) as { typebot?: Record<string, unknown> };
  if (!payload.typebot || typeof payload.typebot !== "object") return;
  const updated = applyTenantMetadataToTypebotSchema(payload.typebot, tenant, name);
  // A API do builder pode variar: tentamos payload com `typebot` e fallback sem `icon/image` se houver validação.
  const request = async (body: Record<string, unknown>) =>
    fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`, {
      method: "PATCH",
      headers: buildTargetHeaders(),
      body: JSON.stringify(body),
    });

  const fullBody = {
    typebot: {
      title: updated.title,
      description: updated.description,
      icon: updated.icon,
      image: updated.image,
      theme: updated.theme,
      settings: updated.settings,
    },
  } as Record<string, unknown>;
  const fullResponse = await request(fullBody);
  if (fullResponse.ok) {
    // Toda alteração de fluxo precisa ser publicada para refletir no viewer.
    await publishTypebotOnTarget(typebotId);
    return;
  }

  const fallbackBody = {
    typebot: {
      title: updated.title,
      description: updated.description,
      theme: updated.theme,
      settings: updated.settings,
    },
  } as Record<string, unknown>;
  const fallbackResponse = await request(fallbackBody);
  if (fallbackResponse.ok) {
    // Mantém a regra operacional: alterou fluxo, publica em seguida.
    await publishTypebotOnTarget(typebotId);
  }
};

const patchHandoffWebhookOnTarget = async (typebotId: string, tenant: Tenant): Promise<boolean> => {
  ensureTargetConfigured();
  const typebotPublicId = (await fetchTypebotPublicIdOnTarget(typebotId)) || "";
  const viewerBase = resolveTargetViewerBaseUrl();
  const runtimeViewerUrl = typebotPublicId && viewerBase ? buildViewerUrl(viewerBase, typebotPublicId) : "";
  const runtimeVars: HandoffRuntimeVars = {
    tenantId: String(tenant.id ?? "").trim(),
    sourceFlowLabel: typebotPublicId,
    typebotViewerUrl: runtimeViewerUrl,
  };
  const response = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}?migrateToLatestVersion=true`,
    {
      method: "GET",
      headers: buildTargetHeaders(),
    },
  );
  if (!response.ok) return false;
  const payload = (await response.json()) as { typebot?: Record<string, unknown> };
  if (!payload.typebot || typeof payload.typebot !== "object") return false;
  const patched = patchHandoffWebhookAndRedirectConfig(payload.typebot, tenant, runtimeVars);
  const groups = patched.groups;
  if (!Array.isArray(groups)) return false;
  const patchResponse = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`, {
    method: "PATCH",
    headers: buildTargetHeaders(),
    body: JSON.stringify({
      typebot: {
        groups,
      },
    }),
  });
  if (!patchResponse.ok) return false;
  await publishTypebotOnTarget(typebotId);
  return true;
};

const syncExistingTypebotFromSourceOnTarget = async (
  targetTypebotId: string,
  sourceTypebotId: string,
  targetName: string,
  tenant: Tenant,
): Promise<boolean> => {
  ensureTargetConfigured();
  const sourceSchema = await fetchTypebotSchemaFromSource(sourceTypebotId);
  const updated = applyTenantMetadataToTypebotSchema(
    {
      ...sourceSchema,
      name: targetName,
    },
    tenant,
    targetName,
  );

  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(targetTypebotId)}`, {
    method: "PATCH",
    headers: buildTargetHeaders(),
    body: JSON.stringify({
      typebot: updated,
    }),
  });

  if (!response.ok) return false;
  // Alterou fluxo completo com base na matriz: publica para refletir no viewer.
  await publishTypebotOnTarget(targetTypebotId);
  return true;
};

type SourceTypebotSummary = { id: string; name: string };

const listSourceWorkspaceTypebots = async (sourceWorkspaceId: string): Promise<SourceTypebotSummary[]> => {
  ensureSourceConfigured();
  const response = await fetch(
    `${TYPEBOT_SOURCE_BUILDER_API_BASE_URL}/v1/typebots?workspaceId=${encodeURIComponent(sourceWorkspaceId)}`,
    {
      method: "GET",
      headers: buildSourceHeaders(),
    },
  );
  if (!response.ok) {
    throw new Error(`Falha ao listar typebots do workspace matriz ${sourceWorkspaceId} (${response.status}).`);
  }
  const payload = (await response.json()) as { typebots?: Array<{ id?: string; name?: string | null }> };
  const out: SourceTypebotSummary[] = [];
  for (const row of payload.typebots ?? []) {
    const id = String(row.id ?? "").trim();
    const name = String(row.name ?? "").trim();
    if (id && name) out.push({ id, name });
  }
  return out;
};

export const syncSystemDefaultsToRealTypebotWorkspace = async (
  tenantId: string,
  defaults: SystemMasterLibraryItem[],
  options?: { overwriteExisting?: boolean },
) => {
  const overwriteExisting = Boolean(options?.overwriteExisting);
  if (!TYPEBOT_AUTO_CREATE_WORKSPACE) return;
  if (defaults.length === 0 && !TYPEBOT_SOURCE_MASTER_WORKSPACE_ID) return;

  const tenant = tenantRepository.getById(tenantId);
  if (!tenant) return;

  if (
    TYPEBOT_SOURCE_MASTER_WORKSPACE_ID &&
    TYPEBOT_TYPEBOT_IMPORT_ONLY_ACTIVE &&
    !TYPEBOT_SOURCE_VIEWER_BASE_URL
  ) {
    throw new Error(
      "Import só de fluxos ativos da matriz: defina TYPEBOT_SOURCE_VIEWER_BASE_URL (URL base do viewer público, sem path final do bot).",
    );
  }

  let workspaceId = String(tenant.typebotWorkspaceId ?? "").trim();
  let workspaceName = String(tenant.typebotWorkspaceName ?? "").trim();
  if (!workspaceId) {
    const created = await createWorkspace(tenant);
    workspaceId = created.id;
    workspaceName = created.name;
  }
  await sanitizeWorkspaceIconOnTarget(workspaceId, workspaceName || tenant.name);

  const allowedDefaultNames = new Set<string>(
    defaults.map((item) => normalizeText(item.title)).filter((name) => Boolean(name)),
  );
  const prunedLocalNames = pruneTenantLocalLibraryFlows(tenantId, allowedDefaultNames, false);
  const prunedNames = await pruneNonDefaultTypebotsOnTarget(workspaceId, allowedDefaultNames, false);

  const importedNames: string[] = [];
  const metadataUpdatedNames: string[] = [];
  const skippedNames: string[] = [];
  const skippedInactiveDefaults: string[] = [];
  const alreadyExistsNames: string[] = [];
  const existingWorkspaceTypebots = await listWorkspaceTypebotsOnTarget(workspaceId);
  const existingWorkspaceTypebotNames = new Set(existingWorkspaceTypebots.map((row) => normalizeText(row.name)));
  /** Workspace vazio (ex.: após prune antigo): reimporta padrões mesmo se URL da matriz estiver inativa. */
  const recoverEmptyWorkspace = existingWorkspaceTypebots.length === 0;

  for (const item of defaults) {
    const normalizedTargetName = normalizeText(item.title);
    if (normalizedTargetName && existingWorkspaceTypebotNames.has(normalizedTargetName)) {
      alreadyExistsNames.push(item.title);
      const existing = existingWorkspaceTypebots.find((row) => normalizeText(row.name) === normalizedTargetName);
      if (existing) {
        if (overwriteExisting) {
          const sourceTypebotId = resolveSourceTypebotId(item);
          if (sourceTypebotId) {
            const synced = await syncExistingTypebotFromSourceOnTarget(existing.id, sourceTypebotId, item.title, tenant);
            if (!synced) await updateTypebotMetadataOnTarget(existing.id, item.title, tenant);
          } else {
            await updateTypebotMetadataOnTarget(existing.id, item.title, tenant);
          }
        }
        await applyTenantIconOnTarget(existing.id, tenant);
        await applyTenantAvatarThemeOnTarget(existing.id, tenant);
        await applyTenantButtonThemeCssOnTarget(existing.id, tenant);
        await patchHandoffWebhookOnTarget(existing.id, tenant);
        await ensureTypebotOperationalOnTarget(existing.id, item.title);
        metadataUpdatedNames.push(item.title);
      }
      continue;
    }
    const sourceTypebotId = await resolveSourceTypebotIdWithFallback(item);
    if (!sourceTypebotId) {
      skippedNames.push(item.title);
      continue;
    }
    if (TYPEBOT_TYPEBOT_IMPORT_ONLY_ACTIVE && !recoverEmptyWorkspace) {
      const viewerUrl = String(item.viewerUrl ?? "").trim();
      if (!viewerUrl || !(await isFlowUrlActive(viewerUrl))) {
        skippedInactiveDefaults.push(item.title);
        continue;
      }
    }
    const schema = await fetchTypebotSchemaFromSource(sourceTypebotId);
    const importedId = await importTypebotIntoTargetWorkspace(workspaceId, item.title, schema, tenant);
    await applyTenantIconOnTarget(importedId, tenant);
    await applyTenantAvatarThemeOnTarget(importedId, tenant);
    await applyTenantButtonThemeCssOnTarget(importedId, tenant);
    await patchHandoffWebhookOnTarget(importedId, tenant);
    await ensureTypebotOperationalOnTarget(importedId, item.title);
    importedNames.push(item.title);
    if (normalizedTargetName) existingWorkspaceTypebotNames.add(normalizedTargetName);
  }

  const bulkImported: string[] = [];
  const bulkSkippedExisting: string[] = [];
  const bulkSkippedInactive: string[] = [];
  if (TYPEBOT_SOURCE_MASTER_WORKSPACE_ID && TYPEBOT_IMPORT_FULL_SOURCE_WORKSPACE) {
    const masterBots = await listSourceWorkspaceTypebots(TYPEBOT_SOURCE_MASTER_WORKSPACE_ID);
    for (const bot of masterBots) {
      const normalized = normalizeText(bot.name);
      if (normalized && existingWorkspaceTypebotNames.has(normalized)) {
        bulkSkippedExisting.push(bot.name);
        if (overwriteExisting) {
          const existing = existingWorkspaceTypebots.find((row) => normalizeText(row.name) === normalized);
          if (existing) {
            const synced = await syncExistingTypebotFromSourceOnTarget(existing.id, bot.id, bot.name, tenant);
            if (!synced) await updateTypebotMetadataOnTarget(existing.id, bot.name, tenant);
            await applyTenantIconOnTarget(existing.id, tenant);
            await applyTenantAvatarThemeOnTarget(existing.id, tenant);
            await applyTenantButtonThemeCssOnTarget(existing.id, tenant);
            await patchHandoffWebhookOnTarget(existing.id, tenant);
            await ensureTypebotOperationalOnTarget(existing.id, bot.name);
            metadataUpdatedNames.push(bot.name);
          }
        }
        continue;
      }
      const schema = await fetchTypebotSchemaFromSource(bot.id);
      if (TYPEBOT_TYPEBOT_IMPORT_ONLY_ACTIVE) {
        const publishedUrl = resolvePublishedViewerUrlFromTypebot(schema);
        if (!publishedUrl || !(await isFlowUrlActive(publishedUrl))) {
          bulkSkippedInactive.push(bot.name);
          continue;
        }
      }
      const importedId = await importTypebotIntoTargetWorkspace(workspaceId, bot.name, schema, tenant);
      await applyTenantIconOnTarget(importedId, tenant);
      await applyTenantAvatarThemeOnTarget(importedId, tenant);
      await applyTenantButtonThemeCssOnTarget(importedId, tenant);
      await patchHandoffWebhookOnTarget(importedId, tenant);
      await ensureTypebotOperationalOnTarget(importedId, bot.name);
      bulkImported.push(bot.name);
      if (normalized) existingWorkspaceTypebotNames.add(normalized);
    }
  }

  const summaryParts: string[] = [`Importados (padrão): ${importedNames.join(", ") || "nenhum"}.`];
  if (TYPEBOT_SOURCE_MASTER_WORKSPACE_ID) {
    summaryParts.push(`Importados (matriz): ${bulkImported.join(", ") || "nenhum"}.`);
    if (bulkSkippedExisting.length > 0) {
      summaryParts.push(`Matriz já existentes no destino: ${bulkSkippedExisting.join(", ")}.`);
    }
    if (bulkSkippedInactive.length > 0) {
      summaryParts.push(`Matriz ignorados (inativos ou sem publicId/viewer): ${bulkSkippedInactive.join(", ")}.`);
    }
  }
  if (alreadyExistsNames.length > 0) {
    summaryParts.push(`Já existentes no workspace: ${alreadyExistsNames.join(", ")}.`);
  }
  if (prunedNames.length > 0) {
    summaryParts.push(`Removidos por não estarem mais como padrão: ${prunedNames.join(", ")}.`);
  }
  if (prunedLocalNames.length > 0) {
    summaryParts.push(`Removidos localmente (duplicados/excedentes): ${prunedLocalNames.join(", ")}.`);
  }
  if (metadataUpdatedNames.length > 0) {
    summaryParts.push(`Metadados reaplicados em existentes: ${metadataUpdatedNames.join(", ")}.`);
  }
  if (skippedInactiveDefaults.length > 0) {
    summaryParts.push(`Padrão ignorados (URL inativa ou vazia): ${skippedInactiveDefaults.join(", ")}.`);
  }
  if (skippedNames.length > 0) {
    summaryParts.push(`Ignorados (sem sourceTypebotId no mapa): ${skippedNames.join(", ")}.`);
  }

  try {
    const publishedNames = await publishAllWorkspaceTypebotsOnTarget(workspaceId);
    if (publishedNames.length > 0) {
      summaryParts.push(`Publicação final garantida no workspace: ${publishedNames.join(", ")}.`);
    }
  } catch (publishError) {
    summaryParts.push(
      `Aviso publicação final: ${
        publishError instanceof Error ? publishError.message : "falha ao garantir publicação de todos os fluxos."
      }`,
    );
  }

  try {
    const manualLib = await importManualWorkspaceTypebotsIntoTenantFlows(tenantId);
    if (manualLib.imported > 0) {
      summaryParts.push(
        `Fluxos criados no Typebot incluídos na biblioteca do assinante: ${manualLib.imported}.`,
      );
    }
  } catch {
    // não bloqueia provisionamento
  }

  try {
    const urlSync = await refreshTenantFlowViewerUrls(tenantId);
    if (urlSync.updated > 0) {
      summaryParts.push(`Links do viewer atualizados para o workspace do assinante: ${urlSync.updated}.`);
    }
  } catch {
    // não bloqueia provisionamento se só a atualização de URL falhar
  }

  try {
    const publishCheck = await forcePublishUntilTenantLinksAreActive(tenantId, workspaceId);
    if (publishCheck.recovered.length > 0) {
      summaryParts.push(
        `Acessibilidade recuperada após publicação forçada (${publishCheck.attempts} tentativa(s)): ${publishCheck.recovered.join(", ")}.`,
      );
    }
    if (publishCheck.stillInactive.length > 0) {
      summaryParts.push(
        `Aviso: fluxos ainda inacessíveis após publicação forçada (${publishCheck.attempts} tentativa(s)): ${publishCheck.stillInactive.join(", ")}.`,
      );
    }
  } catch (publishCheckError) {
    summaryParts.push(
      `Aviso checagem pós-publicação: ${
        publishCheckError instanceof Error ? publishCheckError.message : "falha ao validar acessibilidade dos links."
      }`,
    );
  }

  const syncSummary = summaryParts.join(" ");

  tenantRepository.updateTypebotProvision(tenantId, {
    typebotWorkspaceId: workspaceId,
    typebotWorkspaceName: workspaceName || tenant.name,
    typebotAccessUrl: `${TYPEBOT_PUBLIC_BASE_URL}/w/${workspaceId}/typebots`,
    typebotProvisionStatus: "provisioned",
    typebotProvisionError: syncSummary,
    typebotLastSyncAt: new Date().toISOString(),
  });
};

/**
 * Rotina global: sincroniza todos os workspaces de assinantes com os fluxos da matriz.
 * Inclui defaults (Biblioteca Master) e import em massa do workspace matriz quando configurado.
 */
export const syncAllSubscriberWorkspacesFromMaster = async (): Promise<{
  synced: number;
  failed: number;
  skipped: number;
}> => {
  // Primeiro, atualiza a base da master com quaisquer fluxos novos ativos no workspace Walkup.
  await syncSourceWorkspaceFlowsToMasterTenant();
  const tenants = tenantRepository.list();
  const defaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const ownerEmail = normalizeEmail(tenant.ownerEmail);
    if (!tenant.id || ownerEmail === "walkup@walkuptec.com.br") {
      skipped += 1;
      continue;
    }
    try {
      await syncSystemDefaultsToRealTypebotWorkspace(tenant.id, defaults);
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  return { synced, failed, skipped };
};

export const removeSystemDefaultFromSubscriberWorkspaces = async (item: SystemMasterLibraryItem): Promise<void> => {
  ensureTargetConfigured();
  const targetName = normalizeText(item.title);
  if (!targetName) return;
  const tenants = tenantRepository.list();
  for (const tenant of tenants) {
    const ownerEmail = normalizeEmail(tenant.ownerEmail);
    const workspaceId = String(tenant.typebotWorkspaceId ?? "").trim();
    if (!tenant.id || ownerEmail === "walkup@walkuptec.com.br" || !workspaceId) continue;
    try {
      const workspaceTypebots = await listWorkspaceTypebotsOnTarget(workspaceId);
      const matches = workspaceTypebots.filter((tb) => normalizeText(tb.name) === targetName);
      for (const match of matches) {
        await deleteTypebotOnTarget(match.id);
      }
    } catch {
      // segue demais tenants sem bloquear a remoção local
    }
  }
};
