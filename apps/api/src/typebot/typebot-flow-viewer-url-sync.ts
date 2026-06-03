import { randomUUID } from "node:crypto";
import { typebotPublicIdFromViewerUrl } from "../lib/typebot-public-id";
import { flowRepository, tenantRepository } from "../lib/repositories";
import { ensureTypebotShareMetadataPublished } from "./typebot-share-metadata.service";
import { getFlowLibraryItem } from "../flows/flow-library.repository";
import { listSystemMasterLibrary } from "../flows/system-master-library.repository";
import type { SavedFlow } from "../flows/flow.repository";

const normalizeText = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();
const MASTER_SOURCE_EMAIL = "walkup@walkuptec.com.br";
const PUBLIC_ID_OVERRIDE_BY_LIBRARY_SOURCE_ID: Record<string, string> = {
  // Cartão Consignado (Walkup master source flow id)
  "b2ad8248-3fe8-4fcd-88e5-41bf45582b38": "cart-o-consignado-0yjx8jh",
};

const TYPEBOT_BUILDER_API_BASE_URL = String(process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "").trim();
const TYPEBOT_SOURCE_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_SOURCE_BUILDER_API_BASE_URL ?? TYPEBOT_BUILDER_API_BASE_URL,
).trim();
const TYPEBOT_TARGET_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_BASE_URL ?? TYPEBOT_BUILDER_API_BASE_URL,
).trim();
const targetTokenFromEnv = process.env.TYPEBOT_TARGET_BUILDER_API_TOKEN;
const TYPEBOT_TARGET_BUILDER_API_TOKEN = String(
  targetTokenFromEnv ?? process.env.TYPEBOT_BUILDER_API_TOKEN ?? "",
).trim();

/** Raízes da Builder API (`...` e `.../api`) para montar `/v1/typebots`. */
const builderApiRoots = (): string[] => {
  const raw = TYPEBOT_TARGET_BUILDER_API_BASE_URL.replace(/\/$/, "");
  if (!raw) return [];
  const roots = new Set<string>();
  if (raw.endsWith("/api")) {
    roots.add(raw);
    roots.add(raw.replace(/\/api$/, ""));
  } else {
    roots.add(`${raw}/api`);
    roots.add(raw);
  }
  return [...roots];
};

const buildTargetHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  Authorization: `Bearer ${TYPEBOT_TARGET_BUILDER_API_TOKEN}`,
});

const normalizeWorkspaceText = (value: string | undefined): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const compactWorkspaceText = (value: string | undefined): string =>
  normalizeWorkspaceText(value).replace(/[^a-z0-9]+/g, "");

const sanitizeWorkspaceLabel = (value: string | undefined, fallback = "Workspace"): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  if (/^data:image\//i.test(normalized)) return fallback;
  return normalized;
};

type WorkspaceRow = { id: string; name: string };

const MASTER_WORKSPACE_ID = String(process.env.TYPEBOT_SOURCE_MASTER_WORKSPACE_ID ?? "").trim();

const excludeMasterWorkspace = (workspaces: WorkspaceRow[]): WorkspaceRow[] => {
  if (!MASTER_WORKSPACE_ID) return workspaces;
  return workspaces.filter((workspace) => workspace.id !== MASTER_WORKSPACE_ID);
};

type WorkspaceListProbe = {
  workspaces: WorkspaceRow[];
  lastHttpStatus: number;
  builderApiBaseUrl: string;
};

const listTargetWorkspacesWithProbe = async (): Promise<WorkspaceListProbe> => {
  const builderApiBaseUrl = TYPEBOT_TARGET_BUILDER_API_BASE_URL.replace(/\/$/, "");
  if (!TYPEBOT_TARGET_BUILDER_API_TOKEN) {
    return { workspaces: [], lastHttpStatus: 0, builderApiBaseUrl };
  }
  let lastStatus = 0;
  for (const root of builderApiRoots()) {
    const base = root.replace(/\/$/, "");
    const url = `${base}/v1/workspaces`;
    let response: Response | null = null;
    try {
      response = await fetch(url, { method: "GET", headers: buildTargetHeaders() });
    } catch {
      continue;
    }
    lastStatus = response.status;
    if (!response.ok) continue;
    const payload = (await response.json()) as { workspaces?: Array<{ id?: string | null; name?: string | null }> };
    const rows: WorkspaceRow[] = [];
    for (const row of payload.workspaces ?? []) {
      const id = String(row.id ?? "").trim();
      const name = String(row.name ?? "").trim();
      if (id && name) rows.push({ id, name });
    }
    if (rows.length > 0) {
      return { workspaces: rows, lastHttpStatus: response.status, builderApiBaseUrl };
    }
  }
  if (lastStatus > 0 && process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.warn(`[typebot-flow-viewer-url-sync] list workspaces failed lastStatus=${lastStatus}`);
  }
  return { workspaces: [], lastHttpStatus: lastStatus, builderApiBaseUrl };
};

const listTargetWorkspaces = async (): Promise<WorkspaceRow[]> => {
  const probe = await listTargetWorkspacesWithProbe();
  return probe.workspaces;
};

const pickWorkspaceForTenant = (
  tenant: { name?: string | null; ownerEmail?: string | null },
  workspaces: WorkspaceRow[],
): WorkspaceRow | null => {
  if (workspaces.length === 0) return null;

  const tenantName = normalizeWorkspaceText(sanitizeWorkspaceLabel(tenant?.name ?? undefined));
  if (tenantName) {
    const exact = workspaces.find((workspace) => normalizeWorkspaceText(workspace.name) === tenantName);
    if (exact) return exact;
  }

  const tenantCompact = compactWorkspaceText(sanitizeWorkspaceLabel(tenant?.name ?? undefined));
  if (tenantCompact) {
    const compactMatches = workspaces.filter((workspace) => compactWorkspaceText(workspace.name) === tenantCompact);
    if (compactMatches.length === 1) return compactMatches[0];
  }

  const ownerEmail = normalizeText(tenant?.ownerEmail ?? undefined);
  if (ownerEmail) {
    const localPart = ownerEmail.split("@")[0] ?? "";
    const ownerNeedle = normalizeWorkspaceText(localPart.replace(/[._-]+/g, " "));
    const ownerCompact = compactWorkspaceText(localPart.replace(/[._-]+/g, " "));
    if (ownerNeedle) {
      const byOwner = workspaces.filter((workspace) => {
        const workspaceName = normalizeWorkspaceText(workspace.name);
        return workspaceName.includes(ownerNeedle) || ownerNeedle.includes(workspaceName);
      });
      if (byOwner.length === 1) return byOwner[0];
    }
    if (ownerCompact) {
      const byOwnerCompact = workspaces.filter((workspace) => {
        const workspaceCompact = compactWorkspaceText(workspace.name);
        return workspaceCompact.includes(ownerCompact) || ownerCompact.includes(workspaceCompact);
      });
      if (byOwnerCompact.length === 1) return byOwnerCompact[0];
    }
  }

  if (workspaces.length === 1) return workspaces[0];

  return null;
};

const resolveTenantWorkspaceId = async (
  tenantId: string,
  workspaceCandidates?: WorkspaceRow[],
): Promise<string> => {
  const tenant = tenantRepository.getById(tenantId);
  const current = String(tenant?.typebotWorkspaceId ?? "").trim();
  if (current) return current;
  if (!tenant) return "";

  const workspaces = workspaceCandidates ?? excludeMasterWorkspace(await listTargetWorkspaces());
  const matched = pickWorkspaceForTenant(tenant, workspaces);
  if (!matched) return "";

  tenantRepository.updateTypebotProvision(tenantId, {
    typebotWorkspaceId: matched.id,
    typebotWorkspaceName: matched.name,
    typebotProvisionStatus: "provisioned",
    typebotProvisionError: "",
    typebotLastSyncAt: new Date().toISOString(),
  });
  return matched.id;
};

const viewerOriginFromUrl = (rawUrl: string): string | null => {
  const s = rawUrl.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
};

/** Base do viewer: env → derivada de qualquer fluxo do tenant (mesmo host da matriz, path novo). */
const resolveTargetViewerBaseUrl = (tenantId?: string): string => {
  const explicit = String(process.env.TYPEBOT_TARGET_VIEWER_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const sourceViewer = String(process.env.TYPEBOT_SOURCE_VIEWER_BASE_URL ?? "").trim();
  if (sourceViewer) return sourceViewer.replace(/\/$/, "");
  if (tenantId) {
    for (const f of flowRepository.listByTenant(tenantId)) {
      const o = viewerOriginFromUrl(f.url);
      if (o) return o.replace(/\/$/, "");
    }
  }
  return "";
};

type TypebotListRow = { id?: string; name?: string | null; publicId?: string | null };

const slugifyForTypebotPublicId = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
};

const derivePublicIdFromRowName = (row: TypebotListRow): string => {
  const rawName = String(row.name ?? "").trim();
  const rawId = String(row.id ?? "").trim();
  if (!rawName || !rawId || rawId.length < 7) return "";
  const slug = slugifyForTypebotPublicId(rawName);
  if (!slug) return "";
  const suffix = rawId.slice(-7).toLowerCase();
  return `${slug}-${suffix}`;
};

const derivePublicIdFromFlowLabel = (flow: SavedFlow, row: TypebotListRow): string => {
  const label = String(flow.displayLabel ?? flow.nickname ?? "").trim();
  const targetId = String(row.id ?? "").trim();
  if (!label || !targetId || targetId.length < 7) return "";
  const normalizedLabel = normalizeText(label);
  let slug = slugifyForTypebotPublicId(label);
  // Compatibilidade com slug legado esperado no viewer para "Cartão Consignado".
  if (normalizedLabel.includes("cart") && normalizedLabel.includes("consignado") && slug.startsWith("cartao-consignado")) {
    slug = slug.replace(/^cartao-consignado/, "cart-o-consignado");
  }
  if (!slug) return "";
  const suffix = targetId.slice(-7).toLowerCase();
  return `${slug}-${suffix}`;
};

const derivePublicIdFromMasterPattern = (masterPublicId: string, row: TypebotListRow): string => {
  const sourcePid = String(masterPublicId ?? "").trim();
  const targetId = String(row.id ?? "").trim();
  if (!sourcePid || !targetId || targetId.length < 7) return "";
  const idx = sourcePid.lastIndexOf("-");
  if (idx <= 0 || idx >= sourcePid.length - 1) return "";
  const prefix = sourcePid.slice(0, idx);
  const suffix = targetId.slice(-7).toLowerCase();
  return `${prefix}-${suffix}`;
};

const extractTypebotArray = (payload: unknown): TypebotListRow[] => {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.typebots)) return p.typebots as TypebotListRow[];
  if (Array.isArray(p.results)) return p.results as TypebotListRow[];
  const data = p.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.typebots)) return d.typebots as TypebotListRow[];
  }
  return [];
};

const fetchTypebotDetailById = async (
  typebotId: string,
): Promise<{ publicId: string | null; workspaceId: string | null }> => {
  if (!TYPEBOT_TARGET_BUILDER_API_TOKEN) return { publicId: null, workspaceId: null };
  for (const root of builderApiRoots()) {
    const url = `${root.replace(/\/$/, "")}/v1/typebots/${encodeURIComponent(typebotId)}`;
    let response: Response | null = null;
    try {
      response = await fetch(url, { method: "GET", headers: buildTargetHeaders() });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const body = (await response.json()) as {
      typebot?: { publicId?: string | null; workspaceId?: string | null };
    };
    const publicIdRaw = body?.typebot?.publicId;
    const workspaceIdRaw = body?.typebot?.workspaceId;
    const publicId = typeof publicIdRaw === "string" ? publicIdRaw.trim() : "";
    const workspaceId = typeof workspaceIdRaw === "string" ? workspaceIdRaw.trim() : "";
    return {
      publicId: publicId || null,
      workspaceId: workspaceId || null,
    };
  }
  return { publicId: null, workspaceId: null };
};

const fetchTypebotPublicIdById = async (typebotId: string): Promise<string | null> => {
  const detail = await fetchTypebotDetailById(typebotId);
  return detail.publicId;
};

type WorkspaceTypebotListResult = {
  rows: TypebotListRow[];
  listOk: boolean;
};

const listWorkspaceTypebotsRaw = async (workspaceId: string): Promise<WorkspaceTypebotListResult> => {
  if (!TYPEBOT_TARGET_BUILDER_API_TOKEN) return { rows: [], listOk: false };
  const qs = `workspaceId=${encodeURIComponent(workspaceId)}&limit=200`;
  const qsShort = `workspaceId=${encodeURIComponent(workspaceId)}`;
  for (const root of builderApiRoots()) {
    const base = root.replace(/\/$/, "");
    for (const suffix of [`/v1/typebots?${qs}`, `/v1/typebots?${qsShort}`]) {
      const url = `${base}${suffix}`;
      let response: Response | null = null;
      try {
        response = await fetch(url, { method: "GET", headers: buildTargetHeaders() });
      } catch {
        continue;
      }
      if (!response.ok) {
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.warn(`[typebot-flow-viewer-url-sync] list ${response.status} ${url.split("?")[0]}`);
        }
        continue;
      }
      const list = extractTypebotArray(await response.json());
      return { rows: list, listOk: true };
    }
  }
  return { rows: [], listOk: false };
};

/** Lista typebots confirmando `workspaceId` no detalhe (evita vazar bots de outros workspaces). */
const listWorkspaceTypebots = async (workspaceId: string): Promise<TypebotListRow[]> => {
  const normalizedWorkspaceId = String(workspaceId ?? "").trim();
  if (!normalizedWorkspaceId) return [];
  const raw = await listWorkspaceTypebotsRaw(normalizedWorkspaceId);
  if (!raw.listOk) return [];

  const filtered: TypebotListRow[] = [];
  for (const row of raw.rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const detail = await fetchTypebotDetailById(id);
    if (detail.workspaceId === normalizedWorkspaceId) {
      filtered.push(row);
    }
  }
  return filtered;
};

type WorkspaceTypebotCatalog = {
  remoteIds: Set<string>;
  publicIds: Set<string>;
  listOk: boolean;
};

const resolveWorkspaceTypebotCatalog = async (workspaceId: string): Promise<WorkspaceTypebotCatalog> => {
  const normalizedWorkspaceId = String(workspaceId ?? "").trim();
  if (!normalizedWorkspaceId) return { remoteIds: new Set(), publicIds: new Set(), listOk: false };

  const raw = await listWorkspaceTypebotsRaw(normalizedWorkspaceId);
  if (!raw.listOk) return { remoteIds: new Set(), publicIds: new Set(), listOk: false };

  const remoteIds = new Set<string>();
  const publicIds = new Set<string>();
  for (const row of raw.rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const detail = await fetchTypebotDetailById(id);
    if (detail.workspaceId !== normalizedWorkspaceId) continue;
    remoteIds.add(id);
    let publicId = (await resolvePublicIdForRow(row)) ?? "";
    if (!publicId) publicId = derivePublicIdFromRowName(row);
    if (publicId) publicIds.add(normalizeText(publicId));
  }
  return { remoteIds, publicIds, listOk: true };
};

const flowPublicIdKey = (flow: SavedFlow): string => {
  const fromField = String(flow.typebotPublicId ?? "").trim();
  const fromUrl = typebotPublicIdFromViewerUrl(flow.url) ?? "";
  return normalizeText(fromField || fromUrl);
};

const flowBelongsToWorkspaceCatalog = (flow: SavedFlow, catalog: WorkspaceTypebotCatalog): boolean => {
  const remoteId = String(flow.typebotRemoteId ?? "").trim();
  if (remoteId && catalog.remoteIds.has(remoteId)) return true;
  const publicId = flowPublicIdKey(flow);
  return Boolean(publicId && catalog.publicIds.has(publicId));
};

/** Vincula fluxos locais órfãos (sem `typebotRemoteId`) ao bot correto do workspace por publicId/nome. */
const linkTenantFlowsToWorkspaceRows = async (
  tenantId: string,
  rows: TypebotListRow[],
  viewerBase: string,
): Promise<number> => {
  if (rows.length === 0) return 0;
  const allFlows = flowRepository.listByTenant(tenantId);
  let linked = 0;

  for (const flow of allFlows) {
    const remoteId = String(flow.typebotRemoteId ?? "").trim();
    const alreadyInWorkspace = remoteId && rows.some((row) => String(row.id ?? "").trim() === remoteId);
    if (alreadyInWorkspace) continue;

    const row = await pickTypebotRowForFlow(flow, rows, allFlows);
    if (!row) {
      const flowPid = flowPublicIdKey(flow);
      if (!flowPid) continue;
      const byPublicId = rows.find((candidate) => {
        const candidatePid = normalizeText(
          String(candidate.publicId ?? "").trim() ||
            derivePublicIdFromRowName(candidate) ||
            "",
        );
        return candidatePid === flowPid;
      });
      if (!byPublicId) continue;
      await applyWorkspaceRowToFlow(flow, byPublicId, viewerBase);
      linked += 1;
      continue;
    }

    await applyWorkspaceRowToFlow(flow, row, viewerBase);
    linked += 1;
  }

  return linked;
};

const applyWorkspaceRowToFlow = async (flow: SavedFlow, row: TypebotListRow, viewerBase: string): Promise<void> => {
  const typebotId = String(row.id ?? "").trim();
  const displayName = String(row.name ?? "").trim();
  if (!typebotId) return;

  let publicId = (await resolvePublicIdForRow(row)) ?? "";
  if (!publicId) publicId = derivePublicIdFromRowName(row);
  if (!publicId) return;

  const viewerUrl = buildViewerUrl(viewerBase, publicId);
  const patch: Partial<SavedFlow> = {
    typebotRemoteId: typebotId,
    typebotPublicId: publicId,
    url: viewerUrl,
  };
  if (displayName) patch.displayLabel = displayName;
  flowRepository.updateById(flow.id, patch);
};

/** Resposta da API: só fluxos cujo typebot está no workspace vinculado ao assinante. */
export const filterTenantFlowsForWorkspace = async (
  tenantId: string,
  flows: SavedFlow[],
): Promise<SavedFlow[]> => {
  const tenant = tenantRepository.getById(tenantId);
  const workspaceId = String(tenant?.typebotWorkspaceId ?? "").trim();
  if (!workspaceId || !TYPEBOT_TARGET_BUILDER_API_TOKEN) return flows;

  const catalog = await resolveWorkspaceTypebotCatalog(workspaceId);
  if (!catalog.listOk) return flows;

  return flows.filter((flow) => flowBelongsToWorkspaceCatalog(flow, catalog));
};

/** Garante vínculo builder antes de filtrar/prunar (fluxos criados só com URL pública). */
export const ensureTenantFlowsLinkedToWorkspace = async (tenantId: string): Promise<number> => {
  const tenant = tenantRepository.getById(tenantId);
  const workspaceId = String(tenant?.typebotWorkspaceId ?? "").trim();
  if (!workspaceId || !TYPEBOT_TARGET_BUILDER_API_TOKEN) return 0;

  const viewerBase = resolveTargetViewerBaseUrl(tenantId);
  if (!viewerBase) return 0;

  const rows = await listWorkspaceTypebots(workspaceId);
  if (rows.length === 0) return 0;
  return linkTenantFlowsToWorkspaceRows(tenantId, rows, viewerBase);
};

const resolveMasterCatalogViewerUrl = (flow: SavedFlow): string => {
  const libId = String(flow.librarySourceId ?? "").trim();
  if (!libId) return "";
  const fileItem = getFlowLibraryItem(libId);
  if (fileItem?.viewerUrl?.trim()) return fileItem.viewerUrl.trim();
  const sysRows = listSystemMasterLibrary();
  const row = sysRows.find((r) => r.id === libId || r.sourceFlowId === libId);
  if (row?.viewerUrl?.trim()) return row.viewerUrl.trim();
  // Fallback: quando librarySourceId é id do fluxo origem da master.
  const sourceFlow = flowRepository.getById(libId);
  if (sourceFlow?.url?.trim()) return sourceFlow.url.trim();

  // Último fallback: procurar fluxo equivalente no tenant master por título/apelido.
  const masterTenant = tenantRepository
    .list()
    .find((tenant) => normalizeText(tenant.ownerEmail) === MASTER_SOURCE_EMAIL);
  if (!masterTenant?.id) return "";
  const label = normalizeText(flow.displayLabel ?? flow.nickname);
  if (!label) return "";
  const masterMatch = flowRepository
    .listByTenant(masterTenant.id)
    .find((f) => normalizeText(f.displayLabel ?? f.nickname) === label || normalizeText(f.nickname) === label);
  return masterMatch?.url?.trim() ?? "";
};

/** Resolve títulos / apelidos usados no import (nome do typebot no workspace) a partir de librarySourceId. */
const resolveNameMatchCandidates = (flow: SavedFlow): string[] => {
  const out = new Set<string>();
  const add = (v: string | undefined) => {
    const n = normalizeText(v);
    if (n.length >= 2) out.add(n);
  };
  add(flow.displayLabel);
  add(flow.nickname);
  const libId = String(flow.librarySourceId ?? "").trim();
  if (!libId) return [...out];
  const fileItem = getFlowLibraryItem(libId);
  if (fileItem) {
    add(fileItem.title);
    add(fileItem.suggestedNickname);
    return [...out];
  }
  const sysRows = listSystemMasterLibrary();
  const byLibId = sysRows.find((row) => row.id === libId);
  if (byLibId) {
    add(byLibId.title);
    add(byLibId.suggestedNickname);
    return [...out];
  }
  const bySource = sysRows.find((row) => row.sourceFlowId === libId);
  if (bySource) {
    add(bySource.title);
    add(bySource.suggestedNickname);
  }
  return [...out];
};

const buildViewerUrl = (viewerBase: string, publicId: string): string => {
  const id = publicId.trim();
  const path = /^[\w.-]+$/.test(id) ? id : encodeURIComponent(id);
  return `${viewerBase.replace(/\/$/, "")}/${path}`;
};

const slugifyFlowNickname = (value: string): string => {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 80);
};

const deriveUniqueFlowNickname = (flows: SavedFlow[], displayName: string, typebotId: string): string => {
  const tail = typebotId.slice(-6).toLowerCase().replace(/[^a-z0-9]/g, "") || "bot";
  let base = slugifyFlowNickname(displayName);
  if (base.length < 2) base = "fluxo";
  let nickname = `${base}-${tail}`;
  let n = 0;
  while (flows.some((f) => normalizeText(f.nickname) === normalizeText(nickname))) {
    n += 1;
    nickname = `${base}-${tail}-${n}`;
  }
  return nickname.slice(0, 120);
};

const flowAlreadyLinkedToWorkspaceTypebot = (
  flows: SavedFlow[],
  typebotId: string,
  publicId: string,
  viewerUrl: string,
): boolean => {
  const nu = normalizeText(viewerUrl);
  const np = normalizeText(publicId);
  for (const f of flows) {
    if (String(f.typebotRemoteId ?? "").trim() === typebotId) return true;
    if (nu && normalizeText(f.url) === nu) return true;
    const pid = typebotPublicIdFromViewerUrl(f.url);
    if (np && pid && normalizeText(pid) === np) return true;
    if (np && f.typebotPublicId && normalizeText(f.typebotPublicId) === np) return true;
  }
  return false;
};

export type TenantWorkspaceFlowImportResult = {
  imported: number;
  pruned: number;
  metadataRepublished: number;
  workspaceId: string;
  workspaceName?: string;
  workspaceCandidates: number;
  typebotsScanned: number;
  skipReason?: string;
  builderApiBaseUrl?: string;
  workspaceListHttpStatus?: number;
  workspaceNames?: string[];
};

/**
 * Biblioteca local do assinante = espelho estrito do workspace Typebot.
 * Mantém só registros cujo `typebotRemoteId` existe no builder; remove o resto (fila, URL antiga, duplicata).
 */
const pruneTenantFlowsToMatchWorkspace = async (
  tenantId: string,
  rows: TypebotListRow[],
): Promise<number> => {
  const remoteIds = new Set<string>();
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (id) remoteIds.add(id);
  }

  const viewerBase = resolveTargetViewerBaseUrl(tenantId);
  if (viewerBase) {
    await linkTenantFlowsToWorkspaceRows(tenantId, rows, viewerBase);
  }

  const flows = flowRepository.listByTenant(tenantId);
  const keptRemoteIds = new Set<string>();
  const toRemove: string[] = [];

  for (const flow of flows) {
    const remoteId = String(flow.typebotRemoteId ?? "").trim();
    if (!remoteId || !remoteIds.has(remoteId)) {
      const publicId = flowPublicIdKey(flow);
      let keepByPublicId = false;
      if (publicId) {
        for (const row of rows) {
          let pid = (await resolvePublicIdForRow(row)) ?? "";
          if (!pid) pid = derivePublicIdFromRowName(row);
          if (normalizeText(pid) === publicId) {
            keepByPublicId = true;
            break;
          }
        }
      }
      if (keepByPublicId) continue;
      toRemove.push(flow.id);
      continue;
    }
    if (keptRemoteIds.has(remoteId)) {
      toRemove.push(flow.id);
    } else {
      keptRemoteIds.add(remoteId);
    }
  }

  for (const id of toRemove) {
    flowRepository.removeById(id);
  }
  return toRemove.length;
};

/** Atualiza nome/URL/publicId dos fluxos locais a partir do workspace Typebot. */
const alignTenantFlowsWithWorkspaceRows = async (
  tenantId: string,
  rows: TypebotListRow[],
  viewerBase: string,
): Promise<void> => {
  for (const row of rows) {
    const typebotId = String(row.id ?? "").trim();
    const displayName = String(row.name ?? "").trim();
    if (!typebotId || !displayName) continue;

    let publicId = (await resolvePublicIdForRow(row)) ?? "";
    if (!publicId) publicId = derivePublicIdFromRowName(row);
    if (!publicId) continue;

    const viewerUrl = buildViewerUrl(viewerBase, publicId);
    const tenantFlows = flowRepository.listByTenant(tenantId);
    const match =
      tenantFlows.find((f) => String(f.typebotRemoteId ?? "").trim() === typebotId) ??
      tenantFlows.find((f) => flowPublicIdKey(f) === normalizeText(publicId));
    if (!match) continue;

    const patch: Partial<SavedFlow> = {
      displayLabel: displayName,
      url: viewerUrl,
      typebotPublicId: publicId,
      typebotRemoteId: typebotId,
    };
    const sameLabel = normalizeText(match.displayLabel ?? "") === normalizeText(displayName);
    const sameUrl = normalizeText(match.url) === normalizeText(viewerUrl);
    const samePid = normalizeText(match.typebotPublicId ?? "") === normalizeText(publicId);
    if (!sameLabel || !sameUrl || !samePid) {
      flowRepository.updateById(match.id, patch);
    }
  }
};

/**
 * Typebots que existem só no workspace Typebot (criação manual no builder) passam a ter registro na biblioteca local do assinante.
 * Só inclui fluxos com URL de viewer publicada e respondendo (evita rascunhos).
 */
export const importManualWorkspaceTypebotsIntoTenantFlows = async (
  tenantId: string,
): Promise<TenantWorkspaceFlowImportResult> => {
  const empty = (
    skipReason: string,
    workspaceCandidates = 0,
    probe?: WorkspaceListProbe,
  ): TenantWorkspaceFlowImportResult => ({
    imported: 0,
    pruned: 0,
    metadataRepublished: 0,
    workspaceId: "",
    workspaceCandidates,
    typebotsScanned: 0,
    skipReason,
    builderApiBaseUrl: probe?.builderApiBaseUrl,
    workspaceListHttpStatus: probe?.lastHttpStatus,
    workspaceNames: probe?.workspaces.map((workspace) => workspace.name),
  });

  if (!TYPEBOT_TARGET_BUILDER_API_TOKEN) return empty("builder_api_token_missing");

  const linkedTenantEarly = tenantRepository.getById(tenantId);
  const persistedWorkspaceId = String(linkedTenantEarly?.typebotWorkspaceId ?? "").trim();

  const workspaceProbe = await listTargetWorkspacesWithProbe();
  const workspaceCandidates = excludeMasterWorkspace(workspaceProbe.workspaces);
  let workspaceId = await resolveTenantWorkspaceId(tenantId, workspaceCandidates);
  if (!workspaceId && persistedWorkspaceId) {
    workspaceId = persistedWorkspaceId;
  }
  if (!workspaceId) {
    return empty(
      workspaceCandidates.length === 0 ? "workspaces_list_empty" : "workspace_not_matched",
      workspaceCandidates.length,
      workspaceProbe,
    );
  }

  const linkedTenant = tenantRepository.getById(tenantId);
  const workspaceName = String(linkedTenant?.typebotWorkspaceName ?? "").trim() || undefined;

  const viewerBase = resolveTargetViewerBaseUrl(tenantId);
  if (!viewerBase) {
    return {
      imported: 0,
      pruned: 0,
      metadataRepublished: 0,
      workspaceId,
      workspaceName,
      workspaceCandidates: workspaceCandidates.length,
      typebotsScanned: 0,
      skipReason: "viewer_base_url_missing",
      builderApiBaseUrl: workspaceProbe.builderApiBaseUrl,
      workspaceListHttpStatus: workspaceProbe.lastHttpStatus,
      workspaceNames: workspaceProbe.workspaces.map((workspace) => workspace.name),
    };
  }

  const rawList = await listWorkspaceTypebotsRaw(workspaceId);
  if (!rawList.listOk) {
    return {
      imported: 0,
      pruned: 0,
      metadataRepublished: 0,
      workspaceId,
      workspaceName,
      workspaceCandidates: workspaceCandidates.length,
      typebotsScanned: 0,
      skipReason: "typebot_list_failed",
      builderApiBaseUrl: workspaceProbe.builderApiBaseUrl,
      workspaceListHttpStatus: workspaceProbe.lastHttpStatus,
      workspaceNames: workspaceProbe.workspaces.map((workspace) => workspace.name),
    };
  }

  const rows: TypebotListRow[] = [];
  for (const row of rawList.rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const detail = await fetchTypebotDetailById(id);
    if (detail.workspaceId === workspaceId) rows.push(row);
  }

  let pruned = await pruneTenantFlowsToMatchWorkspace(tenantId, rows);
  const existingFlows = [...flowRepository.listByTenant(tenantId)];
  let imported = 0;

  if (rows.length === 0) {
    return {
      imported: 0,
      pruned,
      metadataRepublished: 0,
      workspaceId,
      workspaceName,
      workspaceCandidates: workspaceCandidates.length,
      typebotsScanned: 0,
      skipReason: "workspace_typebots_empty",
      builderApiBaseUrl: workspaceProbe.builderApiBaseUrl,
      workspaceListHttpStatus: workspaceProbe.lastHttpStatus,
      workspaceNames: workspaceProbe.workspaces.map((workspace) => workspace.name),
    };
  }

  for (const row of rows) {
    const typebotId = String(row.id ?? "").trim();
    const displayName = String(row.name ?? "").trim();
    if (!typebotId || !displayName) continue;

    let publicId = (await resolvePublicIdForRow(row)) ?? "";
    if (!publicId) {
      publicId = derivePublicIdFromRowName(row);
    }
    if (!publicId) continue;

    const viewerUrl = buildViewerUrl(viewerBase, publicId);
    if (flowAlreadyLinkedToWorkspaceTypebot(existingFlows, typebotId, publicId, viewerUrl)) continue;

    // Inclui mesmo com viewer temporariamente fora (502); o painel mostra status Inativo até o viewer voltar.
    const nickname = deriveUniqueFlowNickname(existingFlows, displayName, typebotId);
    const created = flowRepository.create({
      id: randomUUID(),
      tenantId,
      createdAt: new Date().toISOString(),
      nickname,
      displayLabel: displayName,
      url: viewerUrl,
      typebotPublicId: publicId,
      typebotRemoteId: typebotId,
    });
    existingFlows.push(created);
    imported += 1;
  }

  pruned += await pruneTenantFlowsToMatchWorkspace(tenantId, rows);
  await alignTenantFlowsWithWorkspaceRows(tenantId, rows, viewerBase);

  let metadataRepublished = 0;
  for (const row of rows) {
    const typebotId = String(row.id ?? "").trim();
    if (!typebotId) continue;
    const result = await ensureTypebotShareMetadataPublished(typebotId);
    if (result.published) metadataRepublished += 1;
  }

  return {
    imported,
    pruned,
    metadataRepublished,
    workspaceId,
    workspaceName,
    workspaceCandidates: workspaceCandidates.length,
    typebotsScanned: rows.length,
    skipReason: imported === 0 && pruned === 0 ? "no_new_active_typebots" : undefined,
    builderApiBaseUrl: workspaceProbe.builderApiBaseUrl,
    workspaceListHttpStatus: workspaceProbe.lastHttpStatus,
    workspaceNames: workspaceProbe.workspaces.map((workspace) => workspace.name),
  };
};

/**
 * Quando o bot é renomeado no Typebot, o `publicId` / URL pública mudam.
 * Para fluxos com `typebotRemoteId`, realinha `url` e `typebotPublicId` com a Builder API.
 */
export const refreshTenantWorkspaceFlowUrlsFromTypebot = async (tenantId: string): Promise<{ updated: number }> => {
  if (!TYPEBOT_TARGET_BUILDER_API_TOKEN) return { updated: 0 };

  const viewerBase = resolveTargetViewerBaseUrl(tenantId);
  if (!viewerBase) return { updated: 0 };

  const flows = flowRepository.listByTenant(tenantId).filter((f) => String(f.typebotRemoteId ?? "").trim());
  let updated = 0;

  for (const flow of flows) {
    const remoteId = String(flow.typebotRemoteId).trim();
    const publicId = (await fetchTypebotPublicIdById(remoteId)) ?? "";
    if (!publicId) continue;

    const nextUrl = buildViewerUrl(viewerBase, publicId);
    const sameUrl = normalizeText(flow.url) === normalizeText(nextUrl);
    const samePid = normalizeText(flow.typebotPublicId ?? "") === normalizeText(publicId);
    if (sameUrl && samePid) continue;

    flowRepository.updateById(flow.id, { url: nextUrl, typebotPublicId: publicId });
    updated += 1;
  }

  return { updated };
};

const isViewerUrlActive = async (url: string): Promise<boolean> => {
  const target = String(url ?? "").trim();
  if (!target) return false;
  try {
    const response = await fetch(target, {
      method: "GET",
      redirect: "manual",
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
};

const nameMatchesCandidates = (typebotName: string, candidates: string[]): boolean => {
  const n = normalizeText(typebotName);
  if (!n) return false;
  for (const c of candidates) {
    if (c.length < 2) continue;
    if (c === n) return true;
    if (c.length >= 3 && n.length >= 3 && (n.includes(c) || c.includes(n))) return true;
  }
  return false;
};

const resolvePublicIdForRow = async (row: TypebotListRow): Promise<string | null> => {
  const fromList = typeof row.publicId === "string" ? row.publicId.trim() : "";
  if (fromList) return fromList;
  const id = String(row.id ?? "").trim();
  if (id) {
    const fromDetail = await fetchTypebotPublicIdById(id);
    if (fromDetail) return fromDetail;
  }
  return null;
};

type RowPid = { row: TypebotListRow; pid: string };

const pickTypebotRowForFlow = async (
  flow: SavedFlow,
  rows: TypebotListRow[],
  allLibraryFlowsInTenant: SavedFlow[],
): Promise<TypebotListRow | null> => {
  if (rows.length === 0) return null;

  const rowsWithPid: RowPid[] = [];
  for (const row of rows) {
    const pid = (await resolvePublicIdForRow(row)) ?? "";
    if (pid) rowsWithPid.push({ row, pid });
  }
  const rowsForMatch: RowPid[] = rowsWithPid.length > 0 ? rowsWithPid : rows.map((row) => ({ row, pid: "" }));

  const candidates = resolveNameMatchCandidates(flow);
  const masterViewer = resolveMasterCatalogViewerUrl(flow);
  const masterPid = masterViewer ? typebotPublicIdFromViewerUrl(masterViewer) : "";
  const currentPid = typebotPublicIdFromViewerUrl(flow.url);
  const libFlowCount = allLibraryFlowsInTenant.filter((f) => Boolean(f.librarySourceId)).length;

  for (const { row, pid } of rowsForMatch) {
    const name = String(row.name ?? "");
    if (candidates.length > 0 && (candidates.includes(normalizeText(name)) || nameMatchesCandidates(name, candidates))) {
      if (!masterPid || pid !== masterPid || currentPid === masterPid) {
        return row;
      }
    }
  }

  if (masterPid && currentPid === masterPid) {
    const notSameSlug = rowsForMatch.filter((x) => x.pid !== masterPid);
    if (notSameSlug.length === 1 && libFlowCount === 1) {
      return notSameSlug[0].row;
    }
    if (notSameSlug.length > 0 && libFlowCount === 1) {
      for (const { row, pid } of notSameSlug) {
        const name = String(row.name ?? "");
        if (candidates.length === 0 || nameMatchesCandidates(name, candidates) || candidates.includes(normalizeText(name))) {
          return row;
        }
      }
      return notSameSlug[0].row;
    }
  }

  if (libFlowCount === 1 && rowsForMatch.length === 1) {
    return rowsForMatch[0].row;
  }

  return null;
};

const tryUpdateFlowViewerUrl = async (
  flow: SavedFlow,
  rows: TypebotListRow[],
  viewerBase: string,
  allLibraryFlowsInTenant: SavedFlow[],
): Promise<boolean> => {
  if (!flow.librarySourceId) return false;
  const overridePublicId = PUBLIC_ID_OVERRIDE_BY_LIBRARY_SOURCE_ID[String(flow.librarySourceId).trim()];
  if (overridePublicId) {
    const overrideUrl = buildViewerUrl(viewerBase, overridePublicId);
    if (normalizeText(overrideUrl) !== normalizeText(flow.url)) {
      flowRepository.updateById(flow.id, { url: overrideUrl });
      return true;
    }
    return false;
  }
  const row = await pickTypebotRowForFlow(flow, rows, allLibraryFlowsInTenant);
  if (!row) return false;
  const publicIdFromApi = await resolvePublicIdForRow(row);
  const masterViewerUrl = resolveMasterCatalogViewerUrl(flow);
  const masterPublicId = masterViewerUrl ? typebotPublicIdFromViewerUrl(masterViewerUrl) : "";
  const publicIdFromMasterPattern = derivePublicIdFromMasterPattern(masterPublicId, row);
  const publicIdFromLabel = derivePublicIdFromFlowLabel(flow, row);
  const forceLabelForConsignado =
    normalizeText(flow.displayLabel ?? flow.nickname).includes("consignado") &&
    publicIdFromLabel.startsWith("cart-o-consignado-");
  const publicId =
    (forceLabelForConsignado ? publicIdFromLabel : "") ||
    publicIdFromLabel ||
    publicIdFromApi ||
    publicIdFromMasterPattern ||
    derivePublicIdFromRowName(row) ||
    null;
  if (!publicId) return false;
  const nextUrl = buildViewerUrl(viewerBase, publicId);
  if (normalizeText(nextUrl) === normalizeText(flow.url)) {
    const currentIsActive = await isViewerUrlActive(flow.url);
    if (currentIsActive) return false;
    const safeFallback = resolveMasterCatalogViewerUrl(flow);
    if (!safeFallback || !(await isViewerUrlActive(safeFallback))) return false;
    if (normalizeText(safeFallback) === normalizeText(flow.url)) return false;
    flowRepository.updateById(flow.id, { url: safeFallback });
    return true;
  }
  const nextIsActive = await isViewerUrlActive(nextUrl);
  if (!nextIsActive) {
    // Nunca persistir URL quebrada (404) no painel do assinante.
    const safeFallback = resolveMasterCatalogViewerUrl(flow);
    if (!safeFallback || !(await isViewerUrlActive(safeFallback))) {
      return false;
    }
    if (normalizeText(safeFallback) === normalizeText(flow.url)) return false;
    flowRepository.updateById(flow.id, { url: safeFallback });
    return true;
  }
  flowRepository.updateById(flow.id, { url: nextUrl });
  return true;
};

/**
 * Atualiza `SavedFlow.url` para o link público do typebot no workspace do assinante (publicId novo após import).
 */
export const refreshFlowViewerUrlFromTypebot = async (flowId: string): Promise<boolean> => {
  const flow = flowRepository.getById(flowId);
  if (!flow?.tenantId || !flow.librarySourceId) return false;

  const viewerBase = resolveTargetViewerBaseUrl(flow.tenantId);
  if (!viewerBase) return false;

  const workspaceId = await resolveTenantWorkspaceId(flow.tenantId);
  if (!workspaceId) return false;

  const rows = await listWorkspaceTypebots(workspaceId);
  const allLibrary = flowRepository.listByTenant(flow.tenantId).filter((f) => Boolean(f.librarySourceId));
  return tryUpdateFlowViewerUrl(flow, rows, viewerBase, allLibrary);
};

export const refreshTenantFlowViewerUrls = async (tenantId: string): Promise<{ updated: number }> => {
  const viewerBase = resolveTargetViewerBaseUrl(tenantId);
  if (!viewerBase) return { updated: 0 };

  const workspaceId = await resolveTenantWorkspaceId(tenantId);
  if (!workspaceId) return { updated: 0 };

  const rows = await listWorkspaceTypebots(workspaceId);
  if (rows.length === 0) return { updated: 0 };

  const flows = flowRepository.listByTenant(tenantId).filter((f) => Boolean(f.librarySourceId));
  if (flows.length === 0) return { updated: 0 };
  let updated = 0;
  for (const flow of flows) {
    const ok = await tryUpdateFlowViewerUrl(flow, rows, viewerBase, flows);
    if (ok) updated += 1;
  }
  return { updated };
};
