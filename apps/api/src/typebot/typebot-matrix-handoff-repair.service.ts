/**
 * Repara webhook + Redirect + variáveis handoff no typebot da matriz Walkup (builder fonte).
 */
import { findSystemMasterTenant } from "../auth/system-master-auth";
import { flowRepository } from "../lib/repositories";
import { FlowService } from "../flows/flow.service";
import { listSystemMasterLibrary, upsertSystemMasterLibrary } from "../flows/system-master-library.repository";
import type { Tenant } from "../tenants/tenant.repository";
import { applyHandoffPatchesToTypebotSchema } from "./typebot-builder.service";
import { buildWalkupMatrixViewerUrl, resolveWalkupMatrixViewerBaseUrl } from "./typebot-matrix-viewer";

const TYPEBOT_SOURCE_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_SOURCE_BUILDER_API_BASE_URL ?? process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "",
).trim();
const TYPEBOT_SOURCE_BUILDER_API_TOKEN = String(
  process.env.TYPEBOT_SOURCE_BUILDER_API_TOKEN ?? process.env.TYPEBOT_BUILDER_API_TOKEN ?? "",
).trim();
const TYPEBOT_SOURCE_MASTER_WORKSPACE_ID = String(process.env.TYPEBOT_SOURCE_MASTER_WORKSPACE_ID ?? "").trim();

const buildSourceHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  Authorization: `Bearer ${TYPEBOT_SOURCE_BUILDER_API_TOKEN}`,
});

const ensureSourceConfigured = (): void => {
  if (!TYPEBOT_SOURCE_BUILDER_API_BASE_URL || !TYPEBOT_SOURCE_BUILDER_API_TOKEN) {
    throw new Error("Builder matriz não configurado (TYPEBOT_SOURCE_BUILDER_API_*).");
  }
  if (!TYPEBOT_SOURCE_MASTER_WORKSPACE_ID) {
    throw new Error("Defina TYPEBOT_SOURCE_MASTER_WORKSPACE_ID (workspace Walkup no builder).");
  }
};

const normalizeText = (value: string): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

const publishTypebotOnSource = async (typebotId: string): Promise<void> => {
  ensureSourceConfigured();
  const normalizedId = String(typebotId ?? "").trim();
  const attempts: Array<{ method: "POST" | "PATCH"; url: string; body?: Record<string, unknown> }> = [
    { method: "POST", url: `${TYPEBOT_SOURCE_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(normalizedId)}/publish` },
    { method: "POST", url: `${TYPEBOT_SOURCE_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(normalizedId)}/publications` },
    {
      method: "PATCH",
      url: `${TYPEBOT_SOURCE_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(normalizedId)}`,
      body: { published: true },
    },
  ];
  for (const attempt of attempts) {
    const response = await fetch(attempt.url, {
      method: attempt.method,
      headers: buildSourceHeaders(),
      body: attempt.body ? JSON.stringify(attempt.body) : undefined,
    });
    if (response.ok) return;
  }
  throw new Error(`Falha ao publicar typebot matriz ${normalizedId}.`);
};

const fetchTypebotDetailOnSource = async (
  typebotId: string,
): Promise<{ publicId: string; name: string; schema: Record<string, unknown> } | null> => {
  ensureSourceConfigured();
  const response = await fetch(
    `${TYPEBOT_SOURCE_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}?migrateToLatestVersion=true`,
    { method: "GET", headers: buildSourceHeaders() },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as { typebot?: Record<string, unknown> };
  const schema = payload.typebot;
  if (!schema || typeof schema !== "object") return null;
  return {
    publicId: String(schema.publicId ?? "").trim(),
    name: String(schema.name ?? schema.title ?? "").trim(),
    schema,
  };
};

const patchTypebotPublicIdOnSource = async (typebotId: string, publicId: string): Promise<boolean> => {
  ensureSourceConfigured();
  const safePublicId = String(publicId ?? "").trim();
  if (!safePublicId) return false;
  const response = await fetch(`${TYPEBOT_SOURCE_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`, {
    method: "PATCH",
    headers: buildSourceHeaders(),
    body: JSON.stringify({ typebot: { publicId: safePublicId } }),
  });
  return response.ok;
};

const listSourceWorkspaceTypebots = async (): Promise<Array<{ id: string; name: string }>> => {
  ensureSourceConfigured();
  const response = await fetch(
    `${TYPEBOT_SOURCE_BUILDER_API_BASE_URL}/v1/typebots?workspaceId=${encodeURIComponent(TYPEBOT_SOURCE_MASTER_WORKSPACE_ID)}&limit=200`,
    { method: "GET", headers: buildSourceHeaders() },
  );
  if (!response.ok) {
    throw new Error(`Falha ao listar typebots da matriz (${response.status}).`);
  }
  const payload = (await response.json()) as { typebots?: Array<{ id?: string | null; name?: string | null }> };
  const rows: Array<{ id: string; name: string }> = [];
  for (const row of payload.typebots ?? []) {
    const id = String(row.id ?? "").trim();
    const name = String(row.name ?? "").trim();
    if (id && name) rows.push({ id, name });
  }
  return rows;
};

const resolveMatrixTypebotByPublicId = async (
  preferredPublicId: string,
): Promise<{ id: string; name: string; publicId: string } | null> => {
  const preferred = String(preferredPublicId ?? "").trim().toLowerCase();
  const rows = await listSourceWorkspaceTypebots();
  let fallbackClt: { id: string; name: string; publicId: string } | null = null;

  for (const row of rows) {
    const detail = await fetchTypebotDetailOnSource(row.id);
    if (!detail) continue;
    const pid = detail.publicId.toLowerCase();
    if (preferred && pid === preferred) {
      return { id: row.id, name: detail.name || row.name, publicId: detail.publicId };
    }
    const normalizedName = normalizeText(detail.name || row.name);
    if (normalizedName.includes("emprestimo") && normalizedName.includes("clt")) {
      fallbackClt = { id: row.id, name: detail.name || row.name, publicId: detail.publicId || pid };
    }
  }
  return fallbackClt;
};

const patchHandoffOnSourceTypebot = async (
  typebotId: string,
  tenant: { id: string },
  runtime: { sourceFlowLabel: string; typebotViewerUrl: string },
): Promise<boolean> => {
  const detail = await fetchTypebotDetailOnSource(typebotId);
  if (!detail) return false;

  const runtimeVars = {
    tenantId: String(tenant.id ?? "").trim(),
    sourceFlowLabel: runtime.sourceFlowLabel,
    typebotViewerUrl: runtime.typebotViewerUrl,
  };
  const patched = applyHandoffPatchesToTypebotSchema(detail.schema, tenant as Tenant, runtimeVars);
  const groups = patched.groups;
  if (!Array.isArray(groups)) return false;

  const patchResponse = await fetch(`${TYPEBOT_SOURCE_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`, {
    method: "PATCH",
    headers: buildSourceHeaders(),
    body: JSON.stringify({ typebot: { groups } }),
  });
  if (!patchResponse.ok) return false;
  await publishTypebotOnSource(typebotId);
  return true;
};

const upsertMasterSavedFlowRecord = (
  masterTenantId: string,
  typebotId: string,
  displayName: string,
  publicId: string,
  viewerUrl: string,
): void => {
  const flows = flowRepository.listByTenant(masterTenantId);
  const match =
    flows.find((f) => String(f.typebotRemoteId ?? "").trim() === typebotId) ??
    flows.find((f) => normalizeText(f.typebotPublicId ?? "") === normalizeText(publicId)) ??
    flows.find((f) => normalizeText(f.url).endsWith(`/${normalizeText(publicId)}`));

  if (match) {
    flowRepository.updateById(match.id, {
      typebotRemoteId: typebotId,
      typebotPublicId: publicId,
      url: viewerUrl,
      displayLabel: displayName,
    });
    return;
  }

  const flowService = new FlowService(flowRepository);
  try {
    const created = flowService.create(masterTenantId, {
      nickname: displayName,
      displayLabel: displayName,
      url: viewerUrl,
    });
    flowRepository.updateById(created.id, { typebotRemoteId: typebotId, typebotPublicId: publicId });
  } catch {
    // best-effort
  }
};

const syncMasterLibraryViewerUrl = (viewerUrl: string, title: string): void => {
  const items = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
  const match =
    items.find((item) => normalizeText(item.title).includes("emprestimo") && normalizeText(item.title).includes("clt")) ??
    items[0];
  if (!match) return;
  upsertSystemMasterLibrary({
    ...match,
    title: title || match.title,
    viewerUrl,
  });
};

export type RepairMatrixHandoffResult = {
  status: "ok" | "partial" | "failed";
  typebotId: string;
  typebotName: string;
  publicId: string;
  viewerUrl: string;
  masterTenantId: string;
  publicIdPatched: boolean;
  handoffPatched: boolean;
  message: string;
};

/** Repara fluxo matriz CLT (`emprestimo-clt`) para handoff → handoff-view. */
export const repairMatrixEmprestimoCltHandoff = async (
  preferredPublicId = "emprestimo-clt",
): Promise<RepairMatrixHandoffResult> => {
  const masterTenant = findSystemMasterTenant();
  if (!masterTenant?.id) {
    throw new Error("Tenant matriz Walkup (walkup@walkuptec.com.br) não encontrado.");
  }

  const resolved = await resolveMatrixTypebotByPublicId(preferredPublicId);
  if (!resolved) {
    throw new Error(
      `Nenhum typebot CLT no workspace matriz. Confira publicId "${preferredPublicId}" no builder Walkup.`,
    );
  }

  let publicId = resolved.publicId || preferredPublicId;
  let publicIdPatched = false;
  if (normalizeText(publicId) !== normalizeText(preferredPublicId)) {
    publicIdPatched = await patchTypebotPublicIdOnSource(resolved.id, preferredPublicId);
    if (publicIdPatched) publicId = preferredPublicId;
  }

  const viewerUrl = buildWalkupMatrixViewerUrl(publicId);
  const handoffPatched = await patchHandoffOnSourceTypebot(resolved.id, masterTenant, {
    sourceFlowLabel: publicId,
    typebotViewerUrl: viewerUrl,
  });

  upsertMasterSavedFlowRecord(masterTenant.id, resolved.id, resolved.name, publicId, viewerUrl);
  syncMasterLibraryViewerUrl(viewerUrl, resolved.name);

  const base = resolveWalkupMatrixViewerBaseUrl();
  return {
    status: handoffPatched ? "ok" : "partial",
    typebotId: resolved.id,
    typebotName: resolved.name,
    publicId,
    viewerUrl,
    masterTenantId: masterTenant.id,
    publicIdPatched,
    handoffPatched,
    message: handoffPatched
      ? `Matriz publicada. Viewer: ${viewerUrl}. Webhook → ${process.env.TYPEBOT_HANDOFF_WEBHOOK_URL ?? "TYPEBOT_HANDOFF_WEBHOOK_URL"}. Redirect → {{url_direct}}.`
      : `Typebot encontrado mas falha ao patch handoff no builder (${base}).`,
  };
};
