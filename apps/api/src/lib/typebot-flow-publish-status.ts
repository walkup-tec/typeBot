import { isFlowUrlActive } from "./flow-url-health";
import { typebotPublicIdFromViewerUrl } from "./typebot-public-id";

const TYPEBOT_BUILDER_API_BASE_URL = String(process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "").trim();
const TYPEBOT_TARGET_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_BASE_URL ?? TYPEBOT_BUILDER_API_BASE_URL,
).trim();
const TYPEBOT_TARGET_BUILDER_API_TOKEN = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_TOKEN ?? process.env.TYPEBOT_BUILDER_API_TOKEN ?? "",
).trim();

const FETCH_TIMEOUT_MS = 12_000;

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

const normalizeFlowKey = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();

const fetchPublishedTypebotIdFromWorkspaceList = async (
  typebotId: string,
  workspaceId: string,
): Promise<string> => {
  if (!typebotId || !workspaceId) return "";
  const rows = await listWorkspaceTypebotRows(workspaceId);
  const row = rows.find((item) => String(item.id ?? "").trim() === typebotId);
  return String(row?.publishedTypebotId ?? "").trim();
};

const findWorkspaceRowForFlowKeys = async (
  workspaceId: string,
  keys: { publicId: string; label: string },
): Promise<TypebotListRow | null> => {
  const rows = await listWorkspaceTypebotRows(workspaceId);
  if (rows.length === 0) return null;

  const publicKey = normalizeFlowKey(keys.publicId);
  const labelKey = normalizeFlowKey(keys.label);

  for (const row of rows) {
    const rowPublicId = normalizeFlowKey(String(row.publicId ?? ""));
    if (publicKey && rowPublicId && rowPublicId === publicKey) return row;

    const rowName = normalizeFlowKey(String(row.name ?? ""));
    if (labelKey && rowName && rowName === labelKey) return row;

    const rowId = String(row.id ?? "").trim();
    if (!rowId || rowId.length < 7) continue;
    const suffix = rowId.slice(-7).toLowerCase();
    if (publicKey && (publicKey === suffix || publicKey.endsWith(`-${suffix}`) || publicKey.endsWith(suffix))) {
      return row;
    }
  }
  return null;
};

const resolvePublishedTypebotMarker = async (
  typebotId: string,
  detail: TypebotDetail | null,
  workspaceIdHint?: string,
): Promise<string> => {
  const fromDetail = String(detail?.publishedTypebotId ?? "").trim();
  if (fromDetail) return fromDetail;

  const workspaceId =
    String(workspaceIdHint ?? "").trim() || String(detail?.workspaceId ?? "").trim();
  if (!workspaceId) return "";

  return fetchPublishedTypebotIdFromWorkspaceList(typebotId, workspaceId);
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

export const resolveFlowActiveStatus = async (flow: {
  url: string;
  typebotRemoteId?: string;
  typebotPublicId?: string;
  typebotWorkspaceId?: string;
}): Promise<FlowActiveStatus> => {
  const url = String(flow.url ?? "").trim();
  const remoteId = String(flow.typebotRemoteId ?? "").trim();
  let publicId = String(flow.typebotPublicId ?? "").trim() || typebotPublicIdFromViewerUrl(url);

  let detail: TypebotDetail | null = null;
  let publishedTypebotId = "";
  if (remoteId) {
    detail = await fetchTypebotDetailById(remoteId);
    const fromDetail = String(detail?.publicId ?? "").trim();
    if (fromDetail) publicId = fromDetail;
    publishedTypebotId = await resolvePublishedTypebotMarker(
      remoteId,
      detail,
      flow.typebotWorkspaceId,
    );
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
}>(
  flows: T[],
  options?: { workspaceId?: string },
): Promise<Array<T & FlowActiveStatus>> =>
  Promise.all(
    flows.map(async (flow) => ({
      ...flow,
      ...(await resolveFlowActiveStatus({
        ...flow,
        typebotWorkspaceId: options?.workspaceId,
      })),
    })),
  );
