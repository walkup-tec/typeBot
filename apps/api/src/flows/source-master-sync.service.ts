import { FlowService } from "./flow.service";
import { flowRepository, tenantRepository } from "../lib/repositories";
import { isFlowUrlActive } from "../lib/flow-url-health";

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

const listSourceWorkspaceTypebots = async (): Promise<SourceTypebotRow[]> => {
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

const fetchSourcePublicIdByTypebotId = async (typebotId: string): Promise<string> => {
  if (!TYPEBOT_SOURCE_BUILDER_API_TOKEN) return "";
  for (const root of resolveSourceBuilderRoots()) {
    const url = `${root}/v1/typebots/${encodeURIComponent(typebotId)}?migrateToLatestVersion=true`;
    const response = await fetchWithTimeout(url, { method: "GET", headers: sourceHeaders() });
    if (!response.ok) continue;
    const payload = (await response.json()) as { typebot?: { publicId?: string | null } };
    const publicId = String(payload.typebot?.publicId ?? "").trim();
    if (publicId) return publicId;
  }
  return "";
};

export const syncSourceWorkspaceFlowsToMasterTenant = async (): Promise<{
  created: number;
  active: number;
}> => {
  const sourceTenant = tenantRepository
    .list()
    .find((tenant) => String(tenant.ownerEmail ?? "").trim().toLowerCase() === MASTER_SOURCE_EMAIL);
  if (!sourceTenant) return { created: 0, active: 0 };

  let created = 0;
  if (TYPEBOT_SOURCE_MASTER_WORKSPACE_ID && TYPEBOT_SOURCE_VIEWER_BASE_URL) {
    const sourceBots = await listSourceWorkspaceTypebots();
    const existing = flowService.listByTenant(sourceTenant.id);
    const existingByUrl = new Set(existing.map((flow) => flow.url.trim().toLowerCase()));
    for (const bot of sourceBots) {
      const id = String(bot.id ?? "").trim();
      const name = String(bot.name ?? "").trim();
      const fromList = String(bot.publicId ?? "").trim();
      const publicId = fromList || (id ? await fetchSourcePublicIdByTypebotId(id) : "");
      if (!name || !publicId) continue;
      const viewerUrl = `${TYPEBOT_SOURCE_VIEWER_BASE_URL}/${encodeURIComponent(publicId)}`;
      const normalizedUrl = viewerUrl.trim().toLowerCase();
      if (existingByUrl.has(normalizedUrl)) continue;
      try {
        flowService.create(sourceTenant.id, {
          nickname: name,
          displayLabel: name,
          url: viewerUrl,
        });
        existingByUrl.add(normalizedUrl);
        created += 1;
      } catch {
        // ignora entradas inválidas/duplicadas
      }
    }
  }

  const candidateFlows = flowService.listByTenant(sourceTenant.id);
  const uniqueByUrl = new Map<string, (typeof candidateFlows)[number]>();
  for (const flow of candidateFlows) {
    const key = flow.url.trim().toLowerCase();
    if (!uniqueByUrl.has(key)) uniqueByUrl.set(key, flow);
  }
  const uniqueFlows = [...uniqueByUrl.values()];
  const checks = await Promise.all(uniqueFlows.map(async (flow) => isFlowUrlActive(flow.url)));
  const active = checks.filter(Boolean).length;
  return { created, active };
};

