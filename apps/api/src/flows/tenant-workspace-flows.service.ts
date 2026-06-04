import { tenantRepository } from "../lib/repositories";
import { reapplyHandoffPatchesForTenantWorkspace } from "../typebot/typebot-builder.service";
import {
  dedupeTenantFlowsCompletely,
  ensureTenantFlowsLinkedToWorkspace,
  filterTenantFlowsForWorkspace,
  importManualWorkspaceTypebotsIntoTenantFlows,
  refreshTenantFlowViewerUrls,
  type TenantWorkspaceFlowImportResult,
} from "../typebot/typebot-flow-viewer-url-sync";
import type { SavedFlow } from "./flow.repository";

/**
 * Regra multi-tenant (obrigatória):
 *
 * Todo fluxo criado no workspace Typebot do assinante X deve:
 * 1) ser importado/sincronizado apenas para o tenant X (`saved-flows.tenantId = X`);
 * 2) aparecer na listagem master apenas em `/api/master/tenants/:tenantId/flows` desse tenant;
 * 3) nunca ser exibido para outro assinante.
 *
 * Workspace YPTO → tenant YPTO. Workspace Drax → tenant Drax. Sem compartilhamento cruzado.
 *
 * Fluxos com `librarySourceId` são cópias do catálogo master no tenant (padrão/biblioteca).
 * Fluxos sem `librarySourceId` são exclusivos do workspace daquele tenant (criados no builder).
 */

export const isTenantWorkspaceExclusiveFlow = (flow: SavedFlow): boolean =>
  !String(flow.librarySourceId ?? "").trim();

/** Garante que nenhum registro de outro tenant vaze na resposta (defesa em profundidade). */
export const assertFlowsBelongToTenant = (flows: SavedFlow[], tenantId: string): SavedFlow[] => {
  const id = String(tenantId ?? "").trim();
  if (!id) return [];
  return flows.filter((flow) => String(flow.tenantId ?? "").trim() === id);
};

export const partitionTenantFlows = (
  flows: SavedFlow[],
): { libraryFlows: SavedFlow[]; workspaceExclusiveFlows: SavedFlow[] } => {
  const libraryFlows: SavedFlow[] = [];
  const workspaceExclusiveFlows: SavedFlow[] = [];
  for (const flow of flows) {
    if (isTenantWorkspaceExclusiveFlow(flow)) {
      workspaceExclusiveFlows.push(flow);
    } else {
      libraryFlows.push(flow);
    }
  }
  return { libraryFlows, workspaceExclusiveFlows };
};

/**
 * Sincroniza typebots do workspace Typebot **deste** tenant para `saved-flows` (somente `tenantId`).
 * Chamado no quick load, sync=1 e sync-workspace.
 */
export const syncWorkspaceTypebotFlowsForTenant = async (
  tenantId: string,
): Promise<TenantWorkspaceFlowImportResult | null> => {
  const id = String(tenantId ?? "").trim();
  if (!id) return null;

  const tenant = tenantRepository.getById(id);
  const workspaceId = String(tenant?.typebotWorkspaceId ?? "").trim();
  if (!workspaceId) return null;

  const result = await importManualWorkspaceTypebotsIntoTenantFlows(id);
  let handoffPatched = 0;
  let handoffScanned = 0;
  try {
    const handoff = await reapplyHandoffPatchesForTenantWorkspace(id);
    handoffPatched = handoff.patched;
    handoffScanned = handoff.scanned;
  } catch {
    // best-effort
  }
  let dedupeByIdentity = 0;
  let dedupeByTitle = 0;
  try {
    const dedupe = dedupeTenantFlowsCompletely(id);
    dedupeByIdentity = dedupe.byIdentity;
    dedupeByTitle = dedupe.byTitle;
  } catch {
    // best-effort
  }
  try {
    await ensureTenantFlowsLinkedToWorkspace(id);
    await refreshTenantFlowViewerUrls(id);
  } catch {
    // best-effort
  }
  return {
    ...result,
    handoffPatched,
    handoffScanned,
    pruned: (result?.pruned ?? 0) + dedupeByIdentity + dedupeByTitle,
  };
};

/** Lista fluxos visíveis do tenant após sync opcional e filtro por workspace do próprio tenant. */
export const listTenantFlowsAfterWorkspaceSync = async (
  tenantId: string,
  flows: SavedFlow[],
): Promise<SavedFlow[]> => {
  const id = String(tenantId ?? "").trim();
  let scoped = assertFlowsBelongToTenant(flows, id);
  const tenant = tenantRepository.getById(id);
  const hasWorkspace = Boolean(String(tenant?.typebotWorkspaceId ?? "").trim());
  if (hasWorkspace) {
    const filtered = await filterTenantFlowsForWorkspace(id, scoped);
    scoped = filtered.length > 0 ? filtered : scoped;
  }
  return assertFlowsBelongToTenant(scoped, id);
};
