import { typebotPublicIdFromViewerUrl } from "../lib/typebot-public-id";
import { flowRepository, tenantRepository } from "../lib/repositories";
import { syncWorkspaceTypebotFlowsForTenant } from "../flows/tenant-workspace-flows.service";
import { listSystemMasterLibrary } from "../flows/system-master-library.repository";
import {
  syncSystemDefaultsToRealTypebotWorkspace,
} from "./typebot-builder.service";
import { isWalkupMasterTenant } from "./tenant-master-scope";

const TYPEBOT_BUILDER_API_BASE_URL = String(process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "").trim();
const TYPEBOT_TARGET_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_BASE_URL ?? TYPEBOT_BUILDER_API_BASE_URL,
).trim();
const TYPEBOT_SOURCE_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_SOURCE_BUILDER_API_BASE_URL ?? TYPEBOT_BUILDER_API_BASE_URL,
).trim();
const TYPEBOT_TARGET_BUILDER_API_TOKEN = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_TOKEN ?? process.env.TYPEBOT_BUILDER_API_TOKEN ?? "",
).trim();
const TYPEBOT_SOURCE_BUILDER_API_TOKEN = String(
  process.env.TYPEBOT_SOURCE_BUILDER_API_TOKEN ?? process.env.TYPEBOT_BUILDER_API_TOKEN ?? "",
).trim();
const TYPEBOT_TARGET_VIEWER_BASE_URL = String(process.env.TYPEBOT_TARGET_VIEWER_BASE_URL ?? "").trim();

/** Vestígios conhecidos do fluxo Drax (backup maio/2026 + docs). */
const DRAX_KNOWN_REMOTE_IDS = ["cmopzmivk0025ru1czpx5k4a3"];
const DRAX_KNOWN_PUBLIC_IDS = ["drax-sistemas-d3hpop9", "drax-sistemas-px5k4a3"];
const normalizeText = (value: string | undefined): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

const buildTargetHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  Authorization: `Bearer ${TYPEBOT_TARGET_BUILDER_API_TOKEN}`,
});

const buildSourceHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  Authorization: `Bearer ${TYPEBOT_SOURCE_BUILDER_API_TOKEN}`,
});

export type RecoverWorkspaceTypebotsResult = {
  tenantId: string;
  workspaceId: string;
  scannedWorkspaces: number;
  globalHits: number;
  imported: Array<{ name: string; typebotId: string; publicId: string; viewerUrl: string; source: string }>;
  alreadyInWorkspace: string[];
  notFound: string[];
  errors: string[];
};

type GlobalTypebotHit = {
  typebotId: string;
  name: string;
  publicId: string;
  workspaceId: string;
  workspaceName: string;
};

type RecoveryCandidate = {
  sourceTypebotId: string;
  name: string;
  desiredPublicId?: string;
  source: string;
};

const listTargetWorkspaces = async (): Promise<Array<{ id: string; name: string }>> => {
  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/workspaces`, {
    method: "GET",
    headers: buildTargetHeaders(),
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { workspaces?: Array<{ id?: string; name?: string }> };
  const out: Array<{ id: string; name: string }> = [];
  for (const row of payload.workspaces ?? []) {
    const id = String(row.id ?? "").trim();
    const name = String(row.name ?? "").trim();
    if (id && name) out.push({ id, name });
  }
  return out;
};

const listWorkspaceTypebotRows = async (workspaceId: string): Promise<Array<{ id: string; name: string }>> => {
  const response = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots?workspaceId=${encodeURIComponent(workspaceId)}&limit=200`,
    { method: "GET", headers: buildTargetHeaders() },
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as { typebots?: Array<{ id?: string; name?: string }> };
  const rows: Array<{ id: string; name: string }> = [];
  for (const row of payload.typebots ?? []) {
    const id = String(row.id ?? "").trim();
    const name = String(row.name ?? "").trim();
    if (id && name) rows.push({ id, name });
  }
  return rows;
};

const fetchTypebotDetailOnTarget = async (
  typebotId: string,
): Promise<{ publicId: string; name: string; schema: Record<string, unknown> } | null> => {
  const response = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}?migrateToLatestVersion=true`,
    { method: "GET", headers: buildTargetHeaders() },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as { typebot?: Record<string, unknown> & { publicId?: string; name?: string } };
  const schema = payload.typebot;
  if (!schema || typeof schema !== "object") return null;
  return {
    publicId: String(schema.publicId ?? "").trim(),
    name: String(schema.name ?? "").trim(),
    schema: { ...schema },
  };
};

const fetchTypebotSchemaFromSource = async (typebotId: string): Promise<Record<string, unknown> | null> => {
  if (!TYPEBOT_SOURCE_BUILDER_API_BASE_URL || !TYPEBOT_SOURCE_BUILDER_API_TOKEN) return null;
  const response = await fetch(
    `${TYPEBOT_SOURCE_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}?migrateToLatestVersion=true`,
    { method: "GET", headers: buildSourceHeaders() },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as { typebot?: Record<string, unknown> };
  return payload.typebot && typeof payload.typebot === "object" ? { ...payload.typebot } : null;
};

const scanAllTargetTypebots = async (): Promise<GlobalTypebotHit[]> => {
  const hits: GlobalTypebotHit[] = [];
  const workspaces = await listTargetWorkspaces();
  for (const workspace of workspaces) {
    const rows = await listWorkspaceTypebotRows(workspace.id);
    for (const row of rows) {
      const detail = await fetchTypebotDetailOnTarget(row.id);
      const publicId = detail?.publicId || "";
      hits.push({
        typebotId: row.id,
        name: detail?.name || row.name,
        publicId,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      });
    }
  }
  return hits;
};

const collectRecoveryCandidates = (tenantId: string, includeDraxVestiges: boolean): RecoveryCandidate[] => {
  const byId = new Map<string, RecoveryCandidate>();

  const add = (candidate: RecoveryCandidate): void => {
    const id = candidate.sourceTypebotId.trim();
    if (!id) return;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, candidate);
      return;
    }
    if (!existing.desiredPublicId && candidate.desiredPublicId) {
      byId.set(id, { ...existing, desiredPublicId: candidate.desiredPublicId });
    }
  };

  for (const flow of flowRepository.listByTenant(tenantId)) {
    const remoteId = String(flow.typebotRemoteId ?? "").trim();
    const publicId =
      String(flow.typebotPublicId ?? "").trim() || typebotPublicIdFromViewerUrl(flow.url) || "";
    const name = String(flow.displayLabel ?? flow.nickname ?? "").trim() || "Fluxo";
    if (!includeDraxVestiges && normalizeText(name) === normalizeText("Drax Sistemas")) {
      continue;
    }
    if (remoteId) {
      add({ sourceTypebotId: remoteId, name, desiredPublicId: publicId || undefined, source: "saved-flows" });
    }
  }

  if (includeDraxVestiges) {
    for (const remoteId of DRAX_KNOWN_REMOTE_IDS) {
      add({
        sourceTypebotId: remoteId,
        name: "Drax Sistemas",
        desiredPublicId: "drax-sistemas-d3hpop9",
        source: "known-backup",
      });
    }
  }

  return [...byId.values()];
};

const publishTypebotOnTarget = async (typebotId: string): Promise<void> => {
  const attempts: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [
    {
      method: "POST",
      url: `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}/publish`,
    },
    {
      method: "PATCH",
      url: `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`,
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
};

const patchPublicIdOnTarget = async (typebotId: string, publicId: string): Promise<boolean> => {
  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`, {
    method: "PATCH",
    headers: buildTargetHeaders(),
    body: JSON.stringify({ typebot: { publicId } }),
  });
  return response.ok;
};

const importSchemaIntoWorkspace = async (
  workspaceId: string,
  name: string,
  schema: Record<string, unknown>,
  desiredPublicId?: string,
): Promise<string> => {
  const clean = { ...schema };
  delete clean.id;
  clean.name = name;

  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/import`, {
    method: "POST",
    headers: buildTargetHeaders(),
    body: JSON.stringify({ workspaceId, typebot: clean }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Import falhou (${response.status}): ${detail.slice(0, 300)}`);
  }
  const payload = (await response.json()) as { typebot?: { id?: string }; id?: string };
  const importedId = String(payload.typebot?.id ?? payload.id ?? "").trim();
  if (!importedId) throw new Error("Import sem ID retornado.");

  if (desiredPublicId) {
    await patchPublicIdOnTarget(importedId, desiredPublicId);
  }
  await publishTypebotOnTarget(importedId);
  return importedId;
};

const resolveSchemaForCandidate = async (
  candidate: RecoveryCandidate,
  globalHits: GlobalTypebotHit[],
): Promise<{ schema: Record<string, unknown>; resolvedId: string; source: string } | null> => {
  const targetDetail = await fetchTypebotDetailOnTarget(candidate.sourceTypebotId);
  if (targetDetail) {
    return { schema: targetDetail.schema, resolvedId: candidate.sourceTypebotId, source: candidate.source };
  }

  const sourceSchema = await fetchTypebotSchemaFromSource(candidate.sourceTypebotId);
  if (sourceSchema) {
    return { schema: sourceSchema, resolvedId: candidate.sourceTypebotId, source: `${candidate.source}+source-api` };
  }

  if (candidate.desiredPublicId) {
    const byPublic = globalHits.find((hit) => hit.publicId === candidate.desiredPublicId);
    if (byPublic) {
      const detail = await fetchTypebotDetailOnTarget(byPublic.typebotId);
      if (detail) {
        return { schema: detail.schema, resolvedId: byPublic.typebotId, source: `global-publicId:${byPublic.workspaceName}` };
      }
    }
  }

  const normalizedName = normalizeText(candidate.name);
  const byName = globalHits.find((hit) => normalizeText(hit.name) === normalizedName);
  if (byName) {
    const detail = await fetchTypebotDetailOnTarget(byName.typebotId);
    if (detail) {
      return { schema: detail.schema, resolvedId: byName.typebotId, source: `global-name:${byName.workspaceName}` };
    }
  }

  for (const publicId of DRAX_KNOWN_PUBLIC_IDS) {
    const hit = globalHits.find((row) => row.publicId === publicId);
    if (!hit) continue;
    const detail = await fetchTypebotDetailOnTarget(hit.typebotId);
    if (detail) {
      return { schema: detail.schema, resolvedId: hit.typebotId, source: `known-publicId:${hit.workspaceName}` };
    }
  }

  return null;
};

/**
 * Varre todos os workspaces Typebot, localiza vestígios (saved-flows, IDs conhecidos, publicIds)
 * e reimplanta no workspace do tenant. Usado após prune acidental ou workspace vazio.
 */
export const recoverTenantWorkspaceTypebotsFromVestiges = async (
  tenantId: string,
): Promise<RecoverWorkspaceTypebotsResult> => {
  const empty: RecoverWorkspaceTypebotsResult = {
    tenantId,
    workspaceId: "",
    scannedWorkspaces: 0,
    globalHits: 0,
    imported: [],
    alreadyInWorkspace: [],
    notFound: [],
    errors: [],
  };

  if (!TYPEBOT_TARGET_BUILDER_API_TOKEN || !TYPEBOT_TARGET_BUILDER_API_BASE_URL) {
    empty.errors.push("TYPEBOT_TARGET_BUILDER_API_TOKEN ou TYPEBOT_TARGET_BUILDER_API_BASE_URL ausente.");
    return empty;
  }

  const tenant = tenantRepository.getById(tenantId);
  if (!tenant) {
    empty.errors.push("Tenant não encontrado.");
    return empty;
  }

  const workspaceId = String(tenant.typebotWorkspaceId ?? "").trim();
  if (!workspaceId) {
    empty.errors.push("Tenant sem typebotWorkspaceId.");
    return empty;
  }

  const workspaces = await listTargetWorkspaces();
  const globalHits = await scanAllTargetTypebots();
  const workspaceRows = await listWorkspaceTypebotRows(workspaceId);
  const workspaceRemoteIds = new Set(workspaceRows.map((row) => row.id));
  const workspaceNames = new Set(workspaceRows.map((row) => normalizeText(row.name)));

  const includeDraxVestiges = isWalkupMasterTenant(tenant);
  const candidates = collectRecoveryCandidates(tenantId, includeDraxVestiges);
  const result: RecoverWorkspaceTypebotsResult = {
    tenantId,
    workspaceId,
    scannedWorkspaces: workspaces.length,
    globalHits: globalHits.length,
    imported: [],
    alreadyInWorkspace: [],
    notFound: [],
    errors: [],
  };

  for (const candidate of candidates) {
    const normalizedName = normalizeText(candidate.name);
    if (workspaceRemoteIds.has(candidate.sourceTypebotId)) {
      result.alreadyInWorkspace.push(`${candidate.name} (${candidate.sourceTypebotId})`);
      continue;
    }
    if (normalizedName && workspaceNames.has(normalizedName)) {
      result.alreadyInWorkspace.push(candidate.name);
      continue;
    }

    try {
      const resolved = await resolveSchemaForCandidate(candidate, globalHits);
      if (!resolved) {
        result.notFound.push(`${candidate.name} [${candidate.sourceTypebotId}]`);
        continue;
      }

      if (resolved.resolvedId !== candidate.sourceTypebotId && workspaceRemoteIds.has(resolved.resolvedId)) {
        result.alreadyInWorkspace.push(`${candidate.name} (clone ${resolved.resolvedId})`);
        continue;
      }

      const desiredPublicId =
        candidate.desiredPublicId ||
        (normalizeText(candidate.name) === normalizeText("Drax Sistemas") ? "drax-sistemas-d3hpop9" : undefined);

      const importedId = await importSchemaIntoWorkspace(
        workspaceId,
        candidate.name,
        resolved.schema,
        desiredPublicId,
      );

      const detail = await fetchTypebotDetailOnTarget(importedId);
      const publicId = detail?.publicId || desiredPublicId || "";
      const viewerBase = TYPEBOT_TARGET_VIEWER_BASE_URL.replace(/\/$/, "");
      const viewerUrl = publicId && viewerBase ? `${viewerBase}/${encodeURIComponent(publicId)}` : "";

      result.imported.push({
        name: candidate.name,
        typebotId: importedId,
        publicId,
        viewerUrl,
        source: resolved.source,
      });
      workspaceRemoteIds.add(importedId);
      if (normalizedName) workspaceNames.add(normalizedName);
    } catch (error) {
      result.errors.push(
        `${candidate.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!includeDraxVestiges) {
    try {
      const defaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
      if (defaults.length > 0) {
        await syncSystemDefaultsToRealTypebotWorkspace(tenantId, defaults, { overwriteExisting: false });
      }
    } catch (error) {
      result.errors.push(`sync padrões: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      await syncWorkspaceTypebotFlowsForTenant(tenantId);
    } catch (error) {
      result.errors.push(`sync saved-flows: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  for (const publicId of DRAX_KNOWN_PUBLIC_IDS) {
    if (result.imported.some((row) => row.publicId === publicId)) continue;
    const hit = globalHits.find((row) => row.publicId === publicId && row.workspaceId !== workspaceId);
    if (!hit) continue;
    if (workspaceRemoteIds.has(hit.typebotId)) continue;
    try {
      const detail = await fetchTypebotDetailOnTarget(hit.typebotId);
      if (!detail) continue;
      const importedId = await importSchemaIntoWorkspace(workspaceId, detail.name || hit.name, detail.schema, publicId);
      const viewerBase = TYPEBOT_TARGET_VIEWER_BASE_URL.replace(/\/$/, "");
      result.imported.push({
        name: detail.name || hit.name,
        typebotId: importedId,
        publicId,
        viewerUrl: viewerBase ? `${viewerBase}/${encodeURIComponent(publicId)}` : "",
        source: `orphan-hit:${hit.workspaceName}`,
      });
    } catch (error) {
      result.errors.push(`publicId ${publicId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const defaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
    if (defaults.length > 0) {
      await syncSystemDefaultsToRealTypebotWorkspace(tenantId, defaults, { overwriteExisting: false });
    }
  } catch (error) {
    result.errors.push(`sync padrões: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await syncWorkspaceTypebotFlowsForTenant(tenantId);
  } catch (error) {
    result.errors.push(`sync saved-flows: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
};
