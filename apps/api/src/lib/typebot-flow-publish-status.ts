import { isFlowUrlActive } from "./flow-url-health";
import { typebotPublicIdFromViewerUrl } from "./typebot-public-id";
import { listSystemMasterLibrary } from "../flows/system-master-library.repository";

const TYPEBOT_BUILDER_API_BASE_URL = String(process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "").trim();
const TYPEBOT_TARGET_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_BASE_URL ?? TYPEBOT_BUILDER_API_BASE_URL,
).trim();
const TYPEBOT_TARGET_BUILDER_API_TOKEN = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_TOKEN ?? process.env.TYPEBOT_BUILDER_API_TOKEN ?? "",
).trim();

const FETCH_TIMEOUT_MS = 12_000;
const WORKSPACE_LIST_CACHE_TTL_MS = 45_000;

export type FlowActiveStatus = {
  viewerUrlActive: boolean;
  viewerReachable: boolean;
  typebotPublished: boolean;
};

type TypebotDetail = {
  publicId?: string | null;
  publishedAt?: string | null;
  publishedTypebotId?: string | null;
  workspaceId?: string | null;
};

type TypebotListRow = {
  id?: string;
  name?: string | null;
  publicId?: string | null;
  publishedTypebotId?: string | null;
};

type WorkspaceLiveIndex = {
  byRemoteId: Map<string, TypebotListRow>;
  byPublicKey: Map<string, TypebotListRow>;
  byLabelKey: Map<string, TypebotListRow>;
};

const workspaceListCache = new Map<string, { rows: TypebotListRow[]; at: number }>();

const builderApiRoots = (): string[] => {
  const raw = TYPEBOT_TARGET_BUILDER_API_BASE_URL.replace(/\/$/, "");
  if (!raw) return [];
  if (raw.endsWith("/api")) return [raw, raw.slice(0, -4)];
  return [`${raw}/api`, raw];
};

const buildHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  Authorization: `Bearer ${TYPEBOT_TARGET_BUILDER_API_TOKEN}`,
});

const fetchWithTimeout = async (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const extractTypebotArray = (payload: unknown): TypebotListRow[] => {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.typebots)) return record.typebots as TypebotListRow[];
  if (Array.isArray(record.results)) return record.results as TypebotListRow[];
  return [];
};

export const invalidateWorkspaceListCache = (workspaceId?: string): void => {
  const id = String(workspaceId ?? "").trim();
  if (id) {
    workspaceListCache.delete(id);
    return;
  }
  workspaceListCache.clear();
};

const listWorkspaceTypebotRows = async (workspaceId: string): Promise<TypebotListRow[]> => {
  if (!TYPEBOT_TARGET_BUILDER_API_TOKEN || !workspaceId) return [];
  const qs = `workspaceId=${encodeURIComponent(workspaceId)}&limit=200`;
  for (const root of builderApiRoots()) {
    const url = `${root.replace(/\/$/, "")}/v1/typebots?${qs}`;
    const response = await fetchWithTimeout(url, { method: "GET", headers: buildHeaders() });
    if (!response.ok) continue;
    return extractTypebotArray(await response.json());
  }
  return [];
};

export const getCachedWorkspaceTypebotRows = async (workspaceId: string): Promise<TypebotListRow[]> => {
  const id = String(workspaceId ?? "").trim();
  if (!id) return [];
  const hit = workspaceListCache.get(id);
  if (hit && Date.now() - hit.at < WORKSPACE_LIST_CACHE_TTL_MS) return hit.rows;
  const rows = await listWorkspaceTypebotRows(id);
  workspaceListCache.set(id, { rows, at: Date.now() });
  return rows;
};

export const fetchTypebotDetailById = async (typebotId: string): Promise<TypebotDetail | null> => {
  if (!TYPEBOT_TARGET_BUILDER_API_TOKEN || !typebotId) return null;
  for (const root of builderApiRoots()) {
    const url = `${root.replace(/\/$/, "")}/v1/typebots/${encodeURIComponent(typebotId)}?migrateToLatestVersion=true`;
    const response = await fetchWithTimeout(url, { method: "GET", headers: buildHeaders() });
    if (!response.ok) continue;
    const payload = (await response.json()) as { typebot?: TypebotDetail };
    return payload.typebot ?? null;
  }
  return null;
};

const normalizeFlowKey = (value: string | undefined): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const buildWorkspaceLiveIndex = (rows: TypebotListRow[]): WorkspaceLiveIndex => {
  const byRemoteId = new Map<string, TypebotListRow>();
  const byPublicKey = new Map<string, TypebotListRow>();
  const byLabelKey = new Map<string, TypebotListRow>();

  for (const row of rows) {
    const remoteId = String(row.id ?? "").trim();
    if (remoteId) byRemoteId.set(remoteId, row);

    const publicId = normalizeFlowKey(String(row.publicId ?? ""));
    if (publicId) byPublicKey.set(publicId, row);

    const label = normalizeFlowKey(String(row.name ?? ""));
    if (label) byLabelKey.set(label, row);

    if (remoteId.length >= 7) {
      const suffix = remoteId.slice(-7).toLowerCase();
      if (!byPublicKey.has(suffix)) byPublicKey.set(suffix, row);
    }
  }

  return { byRemoteId, byPublicKey, byLabelKey };
};

const resolveLibraryTitleForFlow = (flow: {
  librarySourceId?: string;
  displayLabel?: string;
  nickname?: string;
}): string => {
  const libId = String(flow.librarySourceId ?? "").trim();
  if (!libId) return "";
  const item = listSystemMasterLibrary().find((row) => row.id === libId || row.sourceFlowId === libId);
  return String(item?.title ?? "").trim();
};

const pickWorkspaceRowForFlow = (
  index: WorkspaceLiveIndex,
  keys: { remoteId: string; publicId: string; label: string },
): TypebotListRow | null => {
  const remoteId = keys.remoteId.trim();
  if (remoteId) {
    const hit = index.byRemoteId.get(remoteId);
    if (hit) return hit;
  }

  const publicKey = normalizeFlowKey(keys.publicId);
  if (publicKey) {
    const byPublic = index.byPublicKey.get(publicKey);
    if (byPublic) return byPublic;
  }

  const labelKey = normalizeFlowKey(keys.label);
  if (labelKey) {
    const byLabel = index.byLabelKey.get(labelKey);
    if (byLabel) return byLabel;
  }

  if (publicKey.length >= 7) {
    const suffix = publicKey.slice(-7);
    const bySuffix = index.byPublicKey.get(suffix);
    if (bySuffix) return bySuffix;
  }

  return null;
};

/** Alinhado ao badge Live do Typebot 3.x (publishedTypebotId ou publishedAt). */
export const isTypebotPublishedInBuilder = (
  detail: TypebotDetail | null,
  publicId: string,
  publishedTypebotId = "",
): boolean => {
  if (publishedTypebotId) return true;
  const publishedAt = String(detail?.publishedAt ?? "").trim();
  if (publishedAt.length > 0) return true;
  if (!publicId) return false;
  const detailPublicId = String(detail?.publicId ?? "").trim();
  return detailPublicId.length > 0 && detailPublicId === publicId;
};

const resolveFlowActiveStatusFromIndex = (
  flow: {
    url: string;
    typebotRemoteId?: string;
    typebotPublicId?: string;
    displayLabel?: string;
    nickname?: string;
    librarySourceId?: string;
  },
  index: WorkspaceLiveIndex | null,
  options?: { probeViewerUrl?: boolean },
): FlowActiveStatus => {
  const url = String(flow.url ?? "").trim();
  const remoteId = String(flow.typebotRemoteId ?? "").trim();
  const publicId = String(flow.typebotPublicId ?? "").trim() || typebotPublicIdFromViewerUrl(url);
  const libraryTitle = resolveLibraryTitleForFlow(flow);
  const label = libraryTitle || String(flow.displayLabel ?? flow.nickname ?? "").trim();

  let row = index ? pickWorkspaceRowForFlow(index, { remoteId, publicId, label }) : null;
  if (!row && index && libraryTitle) {
    row = pickWorkspaceRowForFlow(index, { remoteId: "", publicId: "", label: libraryTitle });
  }

  const publishedTypebotId = String(row?.publishedTypebotId ?? "").trim();
  const rowPublicId = normalizeFlowKey(String(row?.publicId ?? ""));
  const effectivePublicId = rowPublicId || publicId;
  let typebotPublished = isTypebotPublishedInBuilder(null, effectivePublicId, publishedTypebotId);

  if (!typebotPublished && row && String(flow.librarySourceId ?? "").trim()) {
    typebotPublished = Boolean(publishedTypebotId || remoteId || libraryTitle);
  }
  if (!typebotPublished && row) {
    typebotPublished = Boolean(remoteId || libraryTitle);
  }

  return {
    typebotPublished,
    viewerReachable: false,
    viewerUrlActive: typebotPublished,
  };
};

const isSystemDefaultLibraryFlow = (flow: { librarySourceId?: string }): boolean => {
  const libId = String(flow.librarySourceId ?? "").trim();
  if (!libId) return false;
  return listSystemMasterLibrary().some(
    (item) => item.isSystemDefault && (item.id === libId || item.sourceFlowId === libId),
  );
};

/** Quando o índice do workspace não casa (URL da matriz, publicId diferente), revalida padrões e URL. */
const enrichFlowActiveStatusAfterIndex = async (
  flow: {
    url: string;
    typebotRemoteId?: string;
    typebotPublicId?: string;
    displayLabel?: string;
    nickname?: string;
    librarySourceId?: string;
  },
  index: WorkspaceLiveIndex | null,
  base: FlowActiveStatus,
): Promise<FlowActiveStatus> => {
  if (base.typebotPublished) return base;

  const libraryTitle = resolveLibraryTitleForFlow(flow);
  const label = libraryTitle || String(flow.displayLabel ?? flow.nickname ?? "").trim();

  if (index && label) {
    const row = pickWorkspaceRowForFlow(index, { remoteId: "", publicId: "", label });
    if (row) {
      const publishedTypebotId = String(row.publishedTypebotId ?? "").trim();
      const rowPublicId = normalizeFlowKey(String(row.publicId ?? ""));
      const publicId =
        rowPublicId ||
        String(flow.typebotPublicId ?? "").trim() ||
        typebotPublicIdFromViewerUrl(String(flow.url ?? ""));
      const published = isTypebotPublishedInBuilder(null, publicId, publishedTypebotId);
      if (published || publishedTypebotId || String(flow.librarySourceId ?? "").trim()) {
        return { typebotPublished: true, viewerReachable: base.viewerReachable, viewerUrlActive: true };
      }
    }
  }

  const url = String(flow.url ?? "").trim();
  if (url && (isSystemDefaultLibraryFlow(flow) || String(flow.librarySourceId ?? "").trim())) {
    const viewerReachable = await isFlowUrlActive(url);
    if (viewerReachable) {
      return { typebotPublished: true, viewerReachable: true, viewerUrlActive: true };
    }
  }

  return base;
};

export const resolveFlowActiveStatus = async (flow: {
  url: string;
  typebotRemoteId?: string;
  typebotPublicId?: string;
  typebotWorkspaceId?: string;
  displayLabel?: string;
  nickname?: string;
  librarySourceId?: string;
}): Promise<FlowActiveStatus> => {
  const workspaceId = String(flow.typebotWorkspaceId ?? "").trim();
  if (workspaceId) {
    const rows = await getCachedWorkspaceTypebotRows(workspaceId);
    const index = buildWorkspaceLiveIndex(rows);
    const fast = resolveFlowActiveStatusFromIndex(flow, index, { probeViewerUrl: true });
    if (fast.typebotPublished) return fast;
  }

  const url = String(flow.url ?? "").trim();
  let remoteId = String(flow.typebotRemoteId ?? "").trim();
  let publicId = String(flow.typebotPublicId ?? "").trim() || typebotPublicIdFromViewerUrl(url);
  const libraryTitle = resolveLibraryTitleForFlow(flow);

  let detail: TypebotDetail | null = null;
  let publishedTypebotId = "";
  if (remoteId) {
    detail = await fetchTypebotDetailById(remoteId);
    const fromDetail = String(detail?.publicId ?? "").trim();
    if (fromDetail) publicId = fromDetail;
    publishedTypebotId = String(detail?.publishedTypebotId ?? "").trim();
    if (!publishedTypebotId && workspaceId) {
      const rows = await getCachedWorkspaceTypebotRows(workspaceId);
      const row = rows.find((item) => String(item.id ?? "").trim() === remoteId);
      publishedTypebotId = String(row?.publishedTypebotId ?? "").trim();
    }
  } else if (workspaceId) {
    const rows = await getCachedWorkspaceTypebotRows(workspaceId);
    const index = buildWorkspaceLiveIndex(rows);
    const row = pickWorkspaceRowForFlow(index, {
      remoteId,
      publicId,
      label: libraryTitle || String(flow.displayLabel ?? flow.nickname ?? "").trim(),
    });
    if (row) {
      remoteId = String(row.id ?? "").trim();
      publishedTypebotId = String(row.publishedTypebotId ?? "").trim();
      const rowPublicId = String(row.publicId ?? "").trim();
      if (rowPublicId) publicId = rowPublicId;
    }
  }

  const typebotPublished = isTypebotPublishedInBuilder(detail, publicId, publishedTypebotId);
  const viewerReachable = url ? await isFlowUrlActive(url) : false;

  return {
    typebotPublished,
    viewerReachable,
    viewerUrlActive: typebotPublished,
  };
};

export const attachFlowActiveStatus = async <T extends {
  url: string;
  typebotRemoteId?: string;
  typebotPublicId?: string;
  displayLabel?: string;
  nickname?: string;
  librarySourceId?: string;
}>(
  flows: T[],
  options?: { workspaceId?: string; fast?: boolean },
): Promise<Array<T & FlowActiveStatus>> => {
  const workspaceId = String(options?.workspaceId ?? "").trim();
  const useFast = options?.fast !== false;

  if (useFast && workspaceId && flows.length > 0) {
    const rows = await getCachedWorkspaceTypebotRows(workspaceId);
    const index = buildWorkspaceLiveIndex(rows);
    return Promise.all(
      flows.map(async (flow) => {
        const base = resolveFlowActiveStatusFromIndex(flow, index);
        const status = await enrichFlowActiveStatusAfterIndex(flow, index, base);
        return { ...flow, ...status };
      }),
    );
  }

  return Promise.all(
    flows.map(async (flow) => ({
      ...flow,
      ...(await resolveFlowActiveStatus({
        ...flow,
        typebotWorkspaceId: workspaceId,
      })),
    })),
  );
};
