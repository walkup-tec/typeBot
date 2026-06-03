import { FlowService } from "./flow.service";
import type { SavedFlow } from "./flow.repository";
import { listSystemMasterLibrary } from "./system-master-library.repository";
import { flowRepository, tenantRepository } from "../lib/repositories";
import { isFlowUrlActive } from "../lib/flow-url-health";
import { typebotPublicIdFromViewerUrl } from "../lib/typebot-public-id";

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

type SourceTypebotRow = { id?: string; name?: string | null; publicId?: string | null };

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

export const listSourceWorkspaceTypebots = async (): Promise<SourceTypebotRow[]> => {
  if (!TYPEBOT_SOURCE_MASTER_WORKSPACE_ID || !TYPEBOT_SOURCE_BUILDER_API_TOKEN) return [];
  for (const root of resolveSourceBuilderRoots()) {
    const url = `${root}/v1/typebots?workspaceId=${encodeURIComponent(TYPEBOT_SOURCE_MASTER_WORKSPACE_ID)}&limit=200`;
    const response = await fetchWithTimeout(url, { method: "GET", headers: sourceHeaders() });
    if (!response.ok) continue;
    const payload = (await response.json()) as { typebots?: SourceTypebotRow[]; results?: SourceTypebotRow[] };
    if (Array.isArray(payload.typebots) && payload.typebots.length > 0) return payload.typebots;
    if (Array.isArray(payload.results) && payload.results.length > 0) return payload.results;
  }
  return [];
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
const isTypebotPublishedInBuilder = (detail: SourceTypebotDetail | null, publicId: string): boolean => {
  if (!publicId) return false;
  const publishedAt = String(detail?.publishedAt ?? "").trim();
  return publishedAt.length > 0;
};

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

const pruneStaleMasterTenantFlows = (
  savedFlows: SavedFlow[],
  activeRemoteIds: Set<string>,
  protectedFlowIds: Set<string>,
): void => {
  for (const flow of savedFlows) {
    if (protectedFlowIds.has(flow.id)) continue;
    const remoteId = String(flow.typebotRemoteId ?? "").trim();
    if (remoteId && activeRemoteIds.has(remoteId)) continue;
    flowRepository.removeById(flow.id);
  }
};

/** Lista somente fluxos Live do workspace matriz Walkup (tenant walkup@). */
export const listMasterLibrarySourceFlows = async (): Promise<MasterLibrarySourceFlowRow[]> => {
  const sourceTenant = tenantRepository
    .list()
    .find((tenant) => normalizeKey(tenant.ownerEmail) === normalizeKey(MASTER_SOURCE_EMAIL));

  if (!sourceTenant?.id) {
    return [];
  }

  const protectedFlowIds = new Set(
    listSystemMasterLibrary()
      .map((item) => String(item.sourceFlowId ?? "").trim())
      .filter(Boolean),
  );

  let savedFlows = flowService.listByTenant(sourceTenant.id);
  const activeRemoteIds = new Set<string>();
  const rows: MasterLibrarySourceFlowRow[] = [];

  if (!TYPEBOT_SOURCE_MASTER_WORKSPACE_ID || !TYPEBOT_SOURCE_VIEWER_BASE_URL) {
    pruneStaleMasterTenantFlows(savedFlows, activeRemoteIds, protectedFlowIds);
    return [];
  }

  const matrixBots = await listSourceWorkspaceTypebots();
  const owners = tenantOwnerLookup();

  for (const bot of matrixBots) {
    const typebotId = String(bot.id ?? "").trim();
    const name = String(bot.name ?? "").trim();
    if (!typebotId || !name) continue;

    const fromList = String(bot.publicId ?? "").trim();
    const detail = await fetchSourceTypebotDetail(typebotId);
    const publicId = fromList || String(detail?.publicId ?? "").trim() || (await fetchSourcePublicIdByTypebotId(typebotId));
    if (!publicId) continue;

    const typebotPublished = isTypebotPublishedInBuilder(detail, publicId);
    if (!typebotPublished) continue;

    const viewerUrl = `${TYPEBOT_SOURCE_VIEWER_BASE_URL}/${encodeURIComponent(publicId)}`;
    if (!isWalkupMatrixViewerUrl(viewerUrl)) continue;

    let flow: SavedFlow;
    try {
      flow = upsertMatrixFlowOnTenant(sourceTenant.id, typebotId, name, publicId, viewerUrl, savedFlows);
      savedFlows = flowService.listByTenant(sourceTenant.id);
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

  pruneStaleMasterTenantFlows(savedFlows, activeRemoteIds, protectedFlowIds);

  const byKey = new Map<string, MasterLibrarySourceFlowRow>();
  for (const row of filterActiveWalkupMatrixRows(rows)) {
    if (row.tenantId !== sourceTenant.id) continue;
    const key =
      normalizeKey(row.typebotRemoteId) ||
      normalizeKey(row.typebotPublicId) ||
      normalizeKey(row.url);
    if (key) byKey.set(key, row);
  }
  return [...byKey.values()];
};

export const syncSourceWorkspaceFlowsToMasterTenant = async (): Promise<{
  created: number;
  active: number;
}> => {
  const sourceTenant = tenantRepository
    .list()
    .find((tenant) => normalizeKey(tenant.ownerEmail) === normalizeKey(MASTER_SOURCE_EMAIL));
  if (!sourceTenant) return { created: 0, active: 0 };

  const savedBefore = flowService.listByTenant(sourceTenant.id).length;
  const rows = await listMasterLibrarySourceFlows();
  const savedAfter = flowService.listByTenant(sourceTenant.id).length;
  return {
    created: Math.max(0, savedAfter - savedBefore),
    active: rows.filter((row) => row.viewerUrlActive).length,
  };
};
