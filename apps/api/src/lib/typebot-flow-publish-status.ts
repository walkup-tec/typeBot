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

export const isTypebotPublishedInBuilder = (detail: TypebotDetail | null, publicId: string): boolean => {
  if (!publicId) return false;
  const publishedAt = String(detail?.publishedAt ?? "").trim();
  return publishedAt.length > 0;
};

export const resolveFlowActiveStatus = async (flow: {
  url: string;
  typebotRemoteId?: string;
  typebotPublicId?: string;
}): Promise<FlowActiveStatus> => {
  const url = String(flow.url ?? "").trim();
  const remoteId = String(flow.typebotRemoteId ?? "").trim();
  let publicId = String(flow.typebotPublicId ?? "").trim() || typebotPublicIdFromViewerUrl(url);

  let detail: TypebotDetail | null = null;
  if (remoteId) {
    detail = await fetchTypebotDetailById(remoteId);
    const fromDetail = String(detail?.publicId ?? "").trim();
    if (fromDetail) publicId = fromDetail;
  }

  const typebotPublished = isTypebotPublishedInBuilder(detail, publicId);
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
}>(
  flows: T[],
): Promise<Array<T & FlowActiveStatus>> =>
  Promise.all(
    flows.map(async (flow) => ({
      ...flow,
      ...(await resolveFlowActiveStatus(flow)),
    })),
  );
