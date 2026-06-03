import { FlowService } from "./flow.service";
import type { SavedFlow } from "./flow.repository";
import { listSystemMasterLibrary } from "./system-master-library.repository";
import { flowRepository, tenantRepository } from "../lib/repositories";
import { isFlowUrlActive } from "../lib/flow-url-health";
import { typebotPublicIdFromViewerUrl } from "../lib/typebot-public-id";
import { attachFlowActiveStatus } from "../lib/typebot-flow-publish-status";

const flowService = new FlowService(flowRepository);
const MASTER_SOURCE_EMAIL = "walkup@walkuptec.com.br";
const TYPEBOT_BUILDER_API_BASE_URL = String(process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "").trim();
const TYPEBOT_SOURCE_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_SOURCE_BUILDER_API_BASE_URL ?? TYPEBOT_BUILDER_API_BASE_URL,
).trim();
const TYPEBOT_SOURCE_BUILDER_API_TOKEN = String(
  process.env.TYPEBOT_SOURCE_BUILDER_API_TOKEN ?? process.env.TYPEBOT_BUILDER_API_TOKEN ?? "",
).trim();
const TYPEBOT_SOURCE_MASTER_WORKSPACE_ID = String(process.env.TYPEBOT_SOURCE_MASTER_WORKSPACE_ID ?? "").trim();
const TYPEBOT_SOURCE_VIEWER_BASE_URL = String(
  process.env.TYPEBOT_SOURCE_VIEWER_BASE_URL ??
    process.env.TYPEBOT_TARGET_VIEWER_BASE_URL ??
    "",
)
  .trim()
  .replace(/\/$/, "");

type SourceTypebotRow = {
  id?: string;
  name?: string | null;
  publicId?: string | null;
  /** Typebot 3.x: indica versão publicada (Live) no workspace. */
  publishedTypebotId?: string | null;
};

type SourceTypebotDetail = {
  publicId?: string | null;
  publishedAt?: string | null;
};

export type MasterLibrarySourceFlowRow = SavedFlow & {
  typebotPublicId?: string;
  typebotRemoteId?: string;
  viewerUrlActive: boolean;
  typebotPublished?: boolean;
  viewerReachable?: boolean;
  /** Proprietário (assinante) do fluxo no disco. */
  ownerEmail?: string;
  ownerName?: string;
};

const normalizeKey = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();

const sourceHeaders = () => ({
  "content-type": "application/json",
  Authorization: `Bearer ${TYPEBOT_SOURCE_BUILDER_API_TOKEN}`,
});

const FETCH_TIMEOUT_MS = 12_000;

const fetchWithTimeout = async (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const resolveSourceBuilderRoots = (): string[] => {
  const raw = TYPEBOT_SOURCE_BUILDER_API_BASE_URL.replace(/\/$/, "");
  if (!raw) return [];
  if (raw.endsWith("/api")) return [raw, raw.slice(0, -4)];
  return [`${raw}/api`, raw];
};

type MatrixWorkspaceScan = {
  typebots: SourceTypebotRow[];
  /** Builder respondeu HTTP OK ao listar o workspace matriz. */
  reachable: boolean;
};

const fetchMatrixWorkspaceTypebots = async (): Promise<MatrixWorkspaceScan> => {
  if (!TYPEBOT_SOURCE_MASTER_WORKSPACE_ID || !TYPEBOT_SOURCE_BUILDER_API_TOKEN) {
    return { typebots: [], reachable: false };
  }
  for (const root of resolveSourceBuilderRoots()) {
    const url = `${root}/v1/typebots?workspaceId=${encodeURIComponent(TYPEBOT_SOURCE_MASTER_WORKSPACE_ID)}&limit=200`;
    let response: Response | null = null;
    try {
      response = await fetchWithTimeout(url, { method: "GET", headers: sourceHeaders() });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const payload = (await response.json()) as { typebots?: SourceTypebotRow[]; results?: SourceTypebotRow[] };
    if (Array.isArray(payload.typebots)) return { typebots: payload.typebots, reachable: true };
    if (Array.isArray(payload.results)) return { typebots: payload.results, reachable: true };
    return { typebots: [], reachable: true };
  }
  return { typebots: [], reachable: false };
};

export const listSourceWorkspaceTypebots = async (): Promise<SourceTypebotRow[]> => {
  const scan = await fetchMatrixWorkspaceTypebots();
  return scan.typebots;
};

const fetchSourceTypebotDetail = async (typebotId: string): Promise<SourceTypebotDetail | null> => {
  if (!TYPEBOT_SOURCE_BUILDER_API_TOKEN || !typebotId) return null;
  for (const root of resolveSourceBuilderRoots()) {
    const url = `${root}/v1/typebots/${encodeURIComponent(typebotId)}?migrateToLatestVersion=true`;
    const response = await fetchWithTimeout(url, { method: "GET", headers: sourceHeaders() });
    if (!response.ok) continue;
    const payload = (await response.json()) as { typebot?: SourceTypebotDetail };
    return payload.typebot ?? null;
  }
  return null;
};

const fetchSourcePublicIdByTypebotId = async (typebotId: string): Promise<string> => {
  const detail = await fetchSourceTypebotDetail(typebotId);
  return String(detail?.publicId ?? "").trim();
};

/** Alinhado ao badge "Live" do Typebot: só fluxo com publicação real no builder. */
const isTypebotPublishedInBuilder = (
  detail: SourceTypebotDetail | null,
  publicId: string,
  publishedTypebotId: string,
): boolean => {
  if (publishedTypebotId) return true;
  if (!publicId) return false;
  const publishedAt = String(detail?.publishedAt ?? "").trim();
  if (publishedAt.length > 0) return true;
  const detailPublicId = String(detail?.publicId ?? "").trim();
  return detailPublicId.length > 0 && detailPublicId === publicId;
};

const resolveMatrixTypebotPublicId = async (
  typebotId: string,
  fromList: string,
  publishedTypebotId: string,
): Promise<string> => {
  if (fromList) return fromList;
  const fromDraft = await fetchSourcePublicIdByTypebotId(typebotId);
  if (fromDraft) return fromDraft;
  if (publishedTypebotId) {
    return fetchSourcePublicIdByTypebotId(publishedTypebotId);
  }
  return "";
};

const resolveMatrixViewerBaseUrl = (): string => TYPEBOT_SOURCE_VIEWER_BASE_URL;

const isWalkupMatrixViewerUrl = (url: string): boolean => {
  const normalized = normalizeKey(url);
  if (!normalized || normalized.includes("soma-typebot")) return false;
  return (
    normalized.includes("typebot-typebot-walkup-viewer") ||
    normalized.includes("typebot-walkup-viewer.achpyp")
  );
};

const filterActiveWalkupMatrixRows = (rows: MasterLibrarySourceFlowRow[]): MasterLibrarySourceFlowRow[] =>
  rows.filter(
    (row) =>
      row.typebotPublished === true &&
      row.viewerUrlActive !== false &&
      isWalkupMatrixViewerUrl(String(row.url ?? "")),
  );

const findSavedFlowForMatrixBot = (
  savedFlows: SavedFlow[],
  typebotId: string,
  publicId: string,
  viewerUrl: string,
): SavedFlow | undefined => {
  const pid = normalizeKey(publicId);
  const urlKey = normalizeKey(viewerUrl);
  const byRemote = savedFlows.find((flow) => normalizeKey(flow.typebotRemoteId) === normalizeKey(typebotId));
  if (byRemote) return byRemote;
  const byUrl = savedFlows.find((flow) => normalizeKey(flow.url) === urlKey);
  if (byUrl) return byUrl;
  return savedFlows.find((flow) => {
    const fromUrl = normalizeKey(typebotPublicIdFromViewerUrl(flow.url));
    const fromField = normalizeKey(flow.typebotPublicId);
    return (fromUrl && fromUrl === pid) || (fromField && fromField === pid);
  });
};

const upsertMatrixFlowOnTenant = (
  sourceTenantId: string,
  typebotId: string,
  name: string,
  publicId: string,
  viewerUrl: string,
  savedFlows: SavedFlow[],
): SavedFlow => {
  const existing = findSavedFlowForMatrixBot(savedFlows, typebotId, publicId, viewerUrl);
  if (existing) {
    const patch: Partial<SavedFlow> = {
      typebotRemoteId: typebotId,
      typebotPublicId: publicId,
      url: viewerUrl,
      displayLabel: name,
    };
    const needsPatch =
      normalizeKey(existing.typebotRemoteId) !== normalizeKey(typebotId) ||
      normalizeKey(existing.typebotPublicId) !== normalizeKey(publicId) ||
      normalizeKey(existing.url) !== normalizeKey(viewerUrl);
    if (needsPatch) {
      flowRepository.updateById(existing.id, patch);
      return { ...existing, ...patch };
    }
    return existing;
  }

  try {
    const created = flowService.create(sourceTenantId, {
      nickname: name,
      displayLabel: name,
      url: viewerUrl,
    });
    flowRepository.updateById(created.id, { typebotRemoteId: typebotId, typebotPublicId: publicId });
    return { ...created, typebotRemoteId: typebotId, typebotPublicId: publicId };
  } catch {
    const retry = findSavedFlowForMatrixBot(savedFlows, typebotId, publicId, viewerUrl);
    if (retry) return retry;
    throw new Error(`Não foi possível gravar fluxo da matriz: ${name}`);
  }
};

const tenantOwnerLookup = (): Map<string, { email: string; name: string }> => {
  const map = new Map<string, { email: string; name: string }>();
  for (const tenant of tenantRepository.list()) {
    if (!tenant.id) continue;
    map.set(tenant.id, {
      email: String(tenant.ownerEmail ?? "").trim(),
      name: String(tenant.name ?? "").trim(),
    });
  }
  return map;
};

const pruneLegacySomaUrlsOnMasterTenant = (
  savedFlows: SavedFlow[],
  protectedFlowIds: Set<string>,
): number => {
  let pruned = 0;
  for (const flow of savedFlows) {
    if (protectedFlowIds.has(flow.id)) continue;
    const url = normalizeKey(flow.url);
    if (!url.includes("soma-typebot")) continue;
    flowRepository.removeById(flow.id);
    pruned += 1;
  }
  return pruned;
};

const pruneStaleMasterTenantFlows = (
  savedFlows: SavedFlow[],
  activeRemoteIds: Set<string>,
  protectedFlowIds: Set<string>,
): number => {
  let pruned = 0;
  for (const flow of savedFlows) {
    if (protectedFlowIds.has(flow.id)) continue;
    const remoteId = String(flow.typebotRemoteId ?? "").trim();
    if (remoteId && activeRemoteIds.has(remoteId)) continue;
    flowRepository.removeById(flow.id);
    pruned += 1;
  }
  return pruned;
};

export type MasterLibrarySyncResult = {
  rows: MasterLibrarySourceFlowRow[];
  active: number;
  created: number;
  pruned: number;
  skipReason?: "master_env_missing" | "builder_unreachable" | "workspace_empty";
  /** Diagnóstico quando active=0 (sem segredos). */
  debug?: {
    matrixListed: number;
    viewerBaseUsed: string;
    skippedNoPublicId: number;
    skippedNotPublished: number;
    skippedViewerUrl: number;
  };
};

const syncMasterLibraryFromTypebot = async (sourceTenantId: string): Promise<MasterLibrarySyncResult> => {
  const protectedFlowIds = new Set(
    listSystemMasterLibrary()
      .map((item) => String(item.sourceFlowId ?? "").trim())
      .filter(Boolean),
  );

  let savedFlows = flowService.listByTenant(sourceTenantId);
  const savedBefore = savedFlows.length;
  let pruned = pruneLegacySomaUrlsOnMasterTenant(savedFlows, protectedFlowIds);
  if (pruned > 0) savedFlows = flowService.listByTenant(sourceTenantId);

  const viewerBase = resolveMatrixViewerBaseUrl();
  if (!TYPEBOT_SOURCE_MASTER_WORKSPACE_ID || !viewerBase) {
    return {
      rows: [],
      active: 0,
      created: 0,
      pruned,
      skipReason: "master_env_missing",
    };
  }

  const matrixScan = await fetchMatrixWorkspaceTypebots();
  if (!matrixScan.reachable) {
    return {
      rows: [],
      active: 0,
      created: 0,
      pruned,
      skipReason: "builder_unreachable",
    };
  }

  const activeRemoteIds = new Set<string>();
  const rows: MasterLibrarySourceFlowRow[] = [];
  const owners = tenantOwnerLookup();
  let skippedNoPublicId = 0;
  let skippedNotPublished = 0;
  let skippedViewerUrl = 0;

  for (const bot of matrixScan.typebots) {
    const typebotId = String(bot.id ?? "").trim();
    const name = String(bot.name ?? "").trim();
    if (!typebotId || !name) continue;

    const publishedTypebotId = String(bot.publishedTypebotId ?? "").trim();
    const fromList = String(bot.publicId ?? "").trim();
    const detail = await fetchSourceTypebotDetail(typebotId);
    const publicId = await resolveMatrixTypebotPublicId(typebotId, fromList, publishedTypebotId);
    if (!publicId) {
      skippedNoPublicId += 1;
      continue;
    }

    const typebotPublished = isTypebotPublishedInBuilder(detail, publicId, publishedTypebotId);
    if (!typebotPublished) {
      skippedNotPublished += 1;
      continue;
    }

    const viewerUrl = `${viewerBase}/${encodeURIComponent(publicId)}`;
    if (!isWalkupMatrixViewerUrl(viewerUrl)) {
      skippedViewerUrl += 1;
      continue;
    }

    let flow: SavedFlow;
    try {
      flow = upsertMatrixFlowOnTenant(sourceTenantId, typebotId, name, publicId, viewerUrl, savedFlows);
      savedFlows = flowService.listByTenant(sourceTenantId);
    } catch {
      continue;
    }

    activeRemoteIds.add(typebotId);
    const viewerReachable = await isFlowUrlActive(viewerUrl);
    const owner = owners.get(flow.tenantId);
    rows.push({
      ...flow,
      typebotPublicId: publicId,
      typebotRemoteId: typebotId,
      viewerReachable,
      typebotPublished: true,
      viewerUrlActive: true,
      ownerEmail: owner?.email ?? MASTER_SOURCE_EMAIL,
      ownerName: owner?.name ?? "Drax Sistemas",
    });
  }

  pruned += pruneStaleMasterTenantFlows(savedFlows, activeRemoteIds, protectedFlowIds);

  const byKey = new Map<string, MasterLibrarySourceFlowRow>();
  for (const row of filterActiveWalkupMatrixRows(rows)) {
    if (row.tenantId !== sourceTenantId) continue;
    const key =
      normalizeKey(row.typebotRemoteId) ||
      normalizeKey(row.typebotPublicId) ||
      normalizeKey(row.url);
    if (key) byKey.set(key, row);
  }
  const deduped = [...byKey.values()];
  const savedAfter = flowService.listByTenant(sourceTenantId).length;

  const debug =
    deduped.length === 0
      ? {
          matrixListed: matrixScan.typebots.length,
          viewerBaseUsed: viewerBase,
          skippedNoPublicId,
          skippedNotPublished,
          skippedViewerUrl,
        }
      : undefined;

  return {
    rows: deduped,
    active: deduped.length,
    created: Math.max(0, savedAfter - savedBefore),
    pruned,
    skipReason: deduped.length === 0 ? "workspace_empty" : undefined,
    debug,
  };
};

/** Lista fluxos gravados do tenant matriz (sem sync destrutivo — IDs estáveis para promote). */
export const listPersistedMasterLibrarySourceFlows = async (
  sourceTenantId: string,
): Promise<MasterLibrarySourceFlowRow[]> => {
  const savedFlows = flowService.listByTenant(sourceTenantId).filter((flow) => {
    const url = String(flow.url ?? "").trim();
    return isWalkupMatrixViewerUrl(url) || Boolean(String(flow.typebotRemoteId ?? "").trim());
  });

  const withStatus = await attachFlowActiveStatus(savedFlows, {
    workspaceId: TYPEBOT_SOURCE_MASTER_WORKSPACE_ID,
    fast: true,
  });
  const owners = tenantOwnerLookup();
  const rows: MasterLibrarySourceFlowRow[] = withStatus.map((flow) => {
    const owner = owners.get(flow.tenantId);
    return {
      ...flow,
      typebotPublicId:
        String(flow.typebotPublicId ?? "").trim() || typebotPublicIdFromViewerUrl(flow.url),
      viewerUrlActive: flow.viewerUrlActive !== false,
      typebotPublished: flow.typebotPublished !== false,
      ownerEmail: owner?.email ?? MASTER_SOURCE_EMAIL,
      ownerName: owner?.name ?? "Master Walkup",
    };
  });
  return filterActiveWalkupMatrixRows(rows);
};

export type ResolveMasterSourceFlowHints = {
  typebotRemoteId?: string;
  typebotPublicId?: string;
  url?: string;
};

const resolveMasterTenant = () =>
  tenantRepository
    .list()
    .find((tenant) => normalizeKey(tenant.ownerEmail) === normalizeKey(MASTER_SOURCE_EMAIL));

/** Grava fluxo matriz no disco a partir dos hints do painel (promote sem depender só do UUID da lista). */
const ensureMasterSourceFlowFromPromoteHints = (
  sourceTenantId: string,
  hints: ResolveMasterSourceFlowHints & { displayName?: string },
): SavedFlow | null => {
  const remote = String(hints.typebotRemoteId ?? "").trim();
  const publicId = String(hints.typebotPublicId ?? "").trim();
  let viewerUrl = String(hints.url ?? "").trim();
  if (!viewerUrl && publicId && TYPEBOT_SOURCE_VIEWER_BASE_URL) {
    viewerUrl = `${TYPEBOT_SOURCE_VIEWER_BASE_URL.replace(/\/$/, "")}/${encodeURIComponent(publicId)}`;
  }
  if (!isWalkupMatrixViewerUrl(viewerUrl)) return null;
  if (!remote && !publicId) return null;

  flowRepository.reloadFromStorage();
  const savedFlows = flowService.listByTenant(sourceTenantId);
  const resolvedPublicId = publicId || typebotPublicIdFromViewerUrl(viewerUrl);
  const name =
    String(hints.displayName ?? "").trim() ||
    resolvedPublicId ||
    "Fluxo matriz";

  try {
    return upsertMatrixFlowOnTenant(
      sourceTenantId,
      remote || String(savedFlows.find((f) => normalizeKey(f.url) === normalizeKey(viewerUrl))?.typebotRemoteId ?? "").trim(),
      name,
      resolvedPublicId,
      viewerUrl,
      savedFlows,
    );
  } catch {
    return findSavedFlowForMatrixBot(savedFlows, remote, resolvedPublicId, viewerUrl) ?? null;
  }
};

/** Resolve fluxo da matriz para promote (id, remoteId, publicId ou URL). */
export const resolveMasterSourceFlowForPromote = async (
  sourceFlowId: string,
  hints?: ResolveMasterSourceFlowHints & { displayName?: string },
): Promise<SavedFlow | null> => {
  const findInStorage = (): SavedFlow | null => {
    flowRepository.reloadFromStorage();
    const direct = flowRepository.getById(sourceFlowId);
    if (direct) return direct;

    const masterTenant = resolveMasterTenant();
    if (!masterTenant?.id) return null;

    const remote = String(hints?.typebotRemoteId ?? "").trim();
    const publicId = String(hints?.typebotPublicId ?? "").trim();
    const urlKey = normalizeKey(hints?.url ?? "");

    return (
      flowRepository.listByTenant(masterTenant.id).find((flow) => {
        if (flow.id === sourceFlowId) return true;
        if (remote && normalizeKey(flow.typebotRemoteId) === normalizeKey(remote)) return true;
        const flowPublicId = normalizeKey(
          flow.typebotPublicId ?? typebotPublicIdFromViewerUrl(flow.url),
        );
        if (publicId && flowPublicId === normalizeKey(publicId)) return true;
        if (urlKey && normalizeKey(flow.url) === urlKey) return true;
        return false;
      }) ?? null
    );
  };

  let flow = findInStorage();
  if (flow) return flow;

  const sourceTenant = resolveMasterTenant();
  if (!sourceTenant?.id) return null;

  if (hints) {
    flow = ensureMasterSourceFlowFromPromoteHints(sourceTenant.id, hints);
    if (flow) return flow;
  }

  await syncMasterLibraryFromTypebot(sourceTenant.id);
  flow = findInStorage();
  if (flow) return flow;

  if (hints) {
    return ensureMasterSourceFlowFromPromoteHints(sourceTenant.id, hints);
  }
  return null;
};

/**
 * Lista fluxos Live da matriz.
 * `syncFirst: true` — sincroniza com Typebot (POST sync-source). GET deve usar `false`.
 */
export const listMasterLibrarySourceFlows = async (options?: {
  syncFirst?: boolean;
}): Promise<MasterLibrarySourceFlowRow[]> => {
  const sourceTenant = tenantRepository
    .list()
    .find((tenant) => normalizeKey(tenant.ownerEmail) === normalizeKey(MASTER_SOURCE_EMAIL));

  if (!sourceTenant?.id) {
    return [];
  }

  if (options?.syncFirst) {
    const result = await syncMasterLibraryFromTypebot(sourceTenant.id);
    return result.rows;
  }

  return listPersistedMasterLibrarySourceFlows(sourceTenant.id);
};

export const syncSourceWorkspaceFlowsToMasterTenant = async (): Promise<MasterLibrarySyncResult> => {
  const sourceTenant = tenantRepository
    .list()
    .find((tenant) => normalizeKey(tenant.ownerEmail) === normalizeKey(MASTER_SOURCE_EMAIL));
  if (!sourceTenant?.id) {
    return { rows: [], created: 0, active: 0, pruned: 0, skipReason: "master_env_missing" };
  }

  return syncMasterLibraryFromTypebot(sourceTenant.id);
};
