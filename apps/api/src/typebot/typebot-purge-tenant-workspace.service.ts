/**
 * Remove todos os typebots do workspace Typebot do assinante e apaga registros locais de fluxos.
 * Marca o tenant como `workspace_cleared` para não reimportar via auto-sync até sync manual.
 */
import { flowRepository, queueRepository, tenantRepository } from "../lib/repositories";
import type { Tenant } from "../tenants/tenant.repository";

const TYPEBOT_TARGET_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_BASE_URL ?? process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "",
).trim();
const TYPEBOT_TARGET_BUILDER_API_TOKEN = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_TOKEN ?? process.env.TYPEBOT_BUILDER_API_TOKEN ?? "",
).trim();

const buildTargetHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  Authorization: `Bearer ${TYPEBOT_TARGET_BUILDER_API_TOKEN}`,
});

const ensureTargetConfigured = (): void => {
  if (!TYPEBOT_TARGET_BUILDER_API_BASE_URL || !TYPEBOT_TARGET_BUILDER_API_TOKEN) {
    throw new Error("Typebot destino não configurado (TYPEBOT_TARGET_BUILDER_API_*).");
  }
};

type WorkspaceTypebotRow = { id: string; name: string };

const listWorkspaceTypebotsOnTarget = async (workspaceId: string): Promise<WorkspaceTypebotRow[]> => {
  ensureTargetConfigured();
  const normalizedWorkspaceId = String(workspaceId ?? "").trim();
  if (!normalizedWorkspaceId) return [];

  const response = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots?workspaceId=${encodeURIComponent(normalizedWorkspaceId)}`,
    { method: "GET", headers: buildTargetHeaders() },
  );
  if (!response.ok) {
    throw new Error(`Falha ao listar typebots do workspace (${response.status}).`);
  }
  const payload = (await response.json()) as { typebots?: Array<{ id?: string | null; name?: string | null }> };
  const rows: WorkspaceTypebotRow[] = [];
  for (const typebot of payload.typebots ?? []) {
    const id = String(typebot.id ?? "").trim();
    const name = String(typebot.name ?? "").trim();
    if (id && name) rows.push({ id, name });
  }
  return rows;
};

const deleteTypebotOnTarget = async (typebotId: string): Promise<boolean> => {
  ensureTargetConfigured();
  const normalizedId = String(typebotId ?? "").trim();
  if (!normalizedId) return false;
  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(normalizedId)}`, {
    method: "DELETE",
    headers: buildTargetHeaders(),
  });
  return response.ok;
};

export type PurgeTenantWorkspaceFlowsResult = {
  tenantId: string;
  workspaceId: string;
  workspaceName: string;
  deletedRemote: Array<{ id: string; name: string }>;
  failedRemote: Array<{ id: string; name: string }>;
  removedLocalFlows: number;
  clearedQueue: boolean;
};

export const isTenantWorkspaceClearedForSync = (tenant: Tenant | null | undefined): boolean =>
  String(tenant?.typebotProvisionStatus ?? "").trim() === "workspace_cleared";

export const clearTenantWorkspaceClearedFlag = (tenantId: string): void => {
  const tenant = tenantRepository.getById(tenantId);
  if (!tenant || !isTenantWorkspaceClearedForSync(tenant)) return;
  tenantRepository.updateTypebotProvision(tenantId, {
    typebotProvisionStatus: "provisioned",
    typebotProvisionError: "Workspace pronto para nova sincronização de fluxos.",
    typebotLastSyncAt: new Date().toISOString(),
  });
};

export const purgeTenantWorkspaceFlowsCompletely = async (
  tenantId: string,
  options?: { clearQueue?: boolean },
): Promise<PurgeTenantWorkspaceFlowsResult> => {
  ensureTargetConfigured();
  const normalizedTenantId = String(tenantId ?? "").trim();
  if (!normalizedTenantId) {
    throw new Error("tenantId é obrigatório.");
  }

  const tenant = tenantRepository.getById(normalizedTenantId);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const workspaceId = String(tenant.typebotWorkspaceId ?? "").trim();
  if (!workspaceId) {
    throw new Error("Workspace Typebot não vinculado a este assinante.");
  }

  const workspaceName = String(tenant.typebotWorkspaceName ?? tenant.name ?? "").trim();
  const rows = await listWorkspaceTypebotsOnTarget(workspaceId);

  const deletedRemote: Array<{ id: string; name: string }> = [];
  const failedRemote: Array<{ id: string; name: string }> = [];

  for (const row of rows) {
    const ok = await deleteTypebotOnTarget(row.id);
    if (ok) {
      deletedRemote.push({ id: row.id, name: row.name });
    } else {
      failedRemote.push({ id: row.id, name: row.name });
    }
  }

  const removedLocalFlows = flowRepository.deleteByTenantId(normalizedTenantId);

  const clearQueue = options?.clearQueue !== false;
  if (clearQueue) {
    queueRepository.deleteByTenantId(normalizedTenantId);
  }

  const summary = [
    `Workspace limpo manualmente.`,
    `Remotos apagados: ${deletedRemote.length}.`,
    failedRemote.length > 0 ? `Falha remota: ${failedRemote.length}.` : "",
    `Registros locais de fluxo: ${removedLocalFlows}.`,
    clearQueue ? "Fila de atendimento do tenant zerada." : "",
    "Auto-sync pausado até Etapa 6 → Atualizar lista ou sync-workspace.",
  ]
    .filter(Boolean)
    .join(" ");

  tenantRepository.updateTypebotProvision(normalizedTenantId, {
    typebotProvisionStatus: "workspace_cleared",
    typebotProvisionError: summary,
    typebotLastSyncAt: new Date().toISOString(),
  });

  return {
    tenantId: normalizedTenantId,
    workspaceId,
    workspaceName,
    deletedRemote,
    failedRemote,
    removedLocalFlows,
    clearedQueue: clearQueue,
  };
};
