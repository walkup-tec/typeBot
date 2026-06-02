import { FlowService } from "./flow.service";
import type { SavedFlow } from "./flow.repository";
import { flowRepository, tenantRepository } from "../lib/repositories";
import { isFlowUrlActive } from "../lib/flow-url-health";
import { typebotPublicIdFromViewerUrl } from "../lib/typebot-public-id";
import { resolveFlowActiveStatus } from "../lib/typebot-flow-publish-status";

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

const isTypebotPublishedInBuilder = (detail: SourceTypebotDetail | null, publicId: string): boolean => {
  if (!publicId) return false;
  const publishedAt = String(detail?.publishedAt ?? "").trim();
  if (publishedAt.length > 0) return true;
  // Na matriz com publicId definido: considerado ativo no builder mesmo se o probe HTTP do viewer falhar (502/500).
  return true;
};

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

const flowToSourceRow = async (
  flow: SavedFlow,
  owners: Map<string, { email: string; name: string }>,
  options?: { preferSourceBuilder?: boolean },
): Promise<MasterLibrarySourceFlowRow> => {
  const url = String(flow.url ?? "").trim();
  const remoteId = String(flow.typebotRemoteId ?? "").trim();
  let detail = null;
  if (options?.preferSourceBuilder && remoteId) {
    detail = await fetchSourceTypebotDetail(remoteId);
  }
  const publicId =
    String(flow.typebotPublicId ?? "").trim() ||
    typebotPublicIdFromViewerUrl(url) ||
    String(detail?.publicId ?? "").trim() ||
    (options?.preferSourceBuilder && remoteId ? await fetchSourcePublicIdByTypebotId(remoteId) : "");
  const status = await resolveFlowActiveStatus({
    url,
    typebotRemoteId: remoteId,
    typebotPublicId: publicId,
  });
  const owner = owners.get(flow.tenantId);
  return {
    ...flow,
    typebotPublicId: publicId || flow.typebotPublicId,
    typebotRemoteId: remoteId || flow.typebotRemoteId,
    viewerReachable: status.viewerReachable,
    typebotPublished: status.typebotPublished,
    viewerUrlActive: status.viewerUrlActive,
    ownerEmail: owner?.email ?? "",
    ownerName: owner?.name ?? "",
  };
};

const mapSavedFlowsToSourceRows = async (savedFlows: SavedFlow[]): Promise<MasterLibrarySourceFlowRow[]> => {
  const owners = tenantOwnerLookup();
  const rows: MasterLibrarySourceFlowRow[] = [];
  for (const flow of savedFlows) {
    if (!String(flow.url ?? "").trim()) continue;
    rows.push(await flowToSourceRow(flow, owners, { preferSourceBuilder: true }));
  }
  return rows;
};

/**
 * Fallback histórico: inclui fluxos de todos os assinantes (dedupe por URL).
 * Necessário quando a matriz walkup@ não tem fluxos mas drax/outros têm, ou Typebot não responde.
 */
export const appendPersistedFlowsFallback = async (
  primary: MasterLibrarySourceFlowRow[],
): Promise<MasterLibrarySourceFlowRow[]> => {
  const owners = tenantOwnerLookup();
  const byUrl = new Map<string, MasterLibrarySourceFlowRow>();
  const byId = new Map<string, MasterLibrarySourceFlowRow>();

  const add = (row: MasterLibrarySourceFlowRow) => {
    byId.set(row.id, row);
    const urlKey = normalizeKey(row.url);
    if (urlKey) byUrl.set(urlKey, row);
  };

  for (const row of primary) add(row);

  for (const flow of flowRepository.listAll()) {
    const url = String(flow.url ?? "").trim();
    if (!url) continue;
    const urlKey = normalizeKey(url);
    if (urlKey && byUrl.has(urlKey)) continue;
    if (byId.has(flow.id)) continue;
    add(await flowToSourceRow(flow, owners));
  }

  return [...byId.values()].sort((a, b) => {
    const ownerA = normalizeKey(a.ownerEmail || a.ownerName);
    const ownerB = normalizeKey(b.ownerEmail || b.ownerName);
    if (ownerA !== ownerB) return ownerA.localeCompare(ownerB);
    const labelA = normalizeKey(a.displayLabel ?? a.nickname);
    const labelB = normalizeKey(b.displayLabel ?? b.nickname);
    return labelA.localeCompare(labelB);
  });
};

/** Lista somente fluxos do workspace matriz (TYPEBOT_SOURCE_MASTER_WORKSPACE_ID). */
export const listMasterLibrarySourceFlows = async (): Promise<MasterLibrarySourceFlowRow[]> => {
  const sourceTenant = tenantRepository
    .list()
    .find((tenant) => normalizeKey(tenant.ownerEmail) === normalizeKey(MASTER_SOURCE_EMAIL));

  const savedFlowsOnDisk = sourceTenant?.id ? flowService.listByTenant(sourceTenant.id) : [];

  if (!sourceTenant?.id) {
    return appendPersistedFlowsFallback([]);
  }

  if (!TYPEBOT_SOURCE_MASTER_WORKSPACE_ID || !TYPEBOT_SOURCE_VIEWER_BASE_URL) {
    return appendPersistedFlowsFallback(await mapSavedFlowsToSourceRows(savedFlowsOnDisk));
  }

  const matrixBots = await listSourceWorkspaceTypebots();
  let savedFlows = flowService.listByTenant(sourceTenant.id);
  const rows: MasterLibrarySourceFlowRow[] = [];
  const owners = tenantOwnerLookup();

  for (const bot of matrixBots) {
    const typebotId = String(bot.id ?? "").trim();
    const name = String(bot.name ?? "").trim();
    if (!typebotId || !name) continue;

    const fromList = String(bot.publicId ?? "").trim();
    const detail = await fetchSourceTypebotDetail(typebotId);
    const publicId = fromList || String(detail?.publicId ?? "").trim() || (await fetchSourcePublicIdByTypebotId(typebotId));
    if (!publicId) continue;

    const viewerUrl = `${TYPEBOT_SOURCE_VIEWER_BASE_URL}/${encodeURIComponent(publicId)}`;
    let flow: SavedFlow;
    try {
      flow = upsertMatrixFlowOnTenant(sourceTenant.id, typebotId, name, publicId, viewerUrl, savedFlows);
      savedFlows = flowService.listByTenant(sourceTenant.id);
    } catch {
      continue;
    }

    const viewerReachable = await isFlowUrlActive(viewerUrl);
    const typebotPublished = isTypebotPublishedInBuilder(detail, publicId);

    const owner = owners.get(flow.tenantId);
    rows.push({
      ...flow,
      typebotPublicId: publicId,
      typebotRemoteId: typebotId,
      viewerReachable,
      typebotPublished,
      viewerUrlActive: typebotPublished || viewerReachable,
      ownerEmail: owner?.email ?? MASTER_SOURCE_EMAIL,
      ownerName: owner?.name ?? "Drax Sistemas",
    });
  }

  const primary =
    rows.length > 0 ? rows : await mapSavedFlowsToSourceRows(savedFlowsOnDisk);
  return appendPersistedFlowsFallback(primary);
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
