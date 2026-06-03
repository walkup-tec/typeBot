import { flowRepository, tenantRepository } from "../lib/repositories";
import {
  ensureTenantFlowsLinkedToWorkspace,
  importManualWorkspaceTypebotsIntoTenantFlows,
  refreshTenantFlowViewerUrls,
} from "../typebot/typebot-flow-viewer-url-sync";
import { FlowService } from "./flow.service";
import { listSystemMasterLibrary, type SystemMasterLibraryItem } from "./system-master-library.repository";

const flowService = new FlowService(flowRepository);

const normalizeText = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();

export const flowMatchesSystemDefaultItem = (
  flow: { librarySourceId?: string; url: string; displayLabel?: string; nickname: string },
  item: Pick<SystemMasterLibraryItem, "id" | "sourceFlowId" | "title" | "viewerUrl">,
): boolean => {
  const lib = normalizeText(flow.librarySourceId);
  return (
    lib === normalizeText(item.id) ||
    lib === normalizeText(item.sourceFlowId) ||
    normalizeText(flow.url) === normalizeText(item.viewerUrl) ||
    normalizeText(flow.displayLabel ?? flow.nickname) === normalizeText(item.title)
  );
};

/** Cria/atualiza fluxos no disco do assinante e vincula ao workspace Typebot. */
export const ensureSubscriberSavedFlowsFromDefaults = async (
  tenantId: string,
  defaults: SystemMasterLibraryItem[] = listSystemMasterLibrary(),
): Promise<void> => {
  const activeDefaults = defaults.filter((item) => item.isSystemDefault);
  if (activeDefaults.length === 0) return;

  for (const item of activeDefaults) {
    const flows = flowService.listByTenant(tenantId);
    if (flows.some((flow) => flowMatchesSystemDefaultItem(flow, item))) continue;
    try {
      flowService.create(tenantId, {
        nickname: item.suggestedNickname.trim() || item.title.trim(),
        displayLabel: item.title.trim(),
        url: item.viewerUrl.trim(),
        librarySourceId: item.id,
      });
    } catch {
      const byUrl = flows.find((flow) => normalizeText(flow.url) === normalizeText(item.viewerUrl));
      if (byUrl) {
        flowRepository.updateById(byUrl.id, {
          librarySourceId: item.id,
          displayLabel: item.title,
        });
      }
    }
  }

  try {
    await ensureTenantFlowsLinkedToWorkspace(tenantId);
  } catch {
    // best-effort
  }

  let flows = flowService.listByTenant(tenantId);
  const stillMissing = activeDefaults.some(
    (item) => !flows.some((flow) => flowMatchesSystemDefaultItem(flow, item)),
  );
  if (stillMissing) {
    try {
      await importManualWorkspaceTypebotsIntoTenantFlows(tenantId);
      await ensureTenantFlowsLinkedToWorkspace(tenantId);
    } catch {
      // best-effort
    }
  }

  try {
    await refreshTenantFlowViewerUrls(tenantId);
  } catch {
    // best-effort
  }
};

export const propagateSystemDefaultFlowToAllTenants = (payload: {
  libraryItemId: string;
  sourceFlowId: string;
  title: string;
  sourceFlowNickname: string;
  sourceFlowUrl: string;
}): void => {
  const MASTER_SOURCE_EMAIL = "walkup@walkuptec.com.br";
  const tenants = tenantRepository.list();
  for (const tenant of tenants) {
    const ownerEmail = normalizeText(tenant.ownerEmail);
    if (!tenant.id || ownerEmail === normalizeText(MASTER_SOURCE_EMAIL)) continue;
    const existingFlows = flowService.listByTenant(tenant.id);
    const hasAlready = existingFlows.some(
      (flow) =>
        normalizeText(flow.url) === normalizeText(payload.sourceFlowUrl) ||
        normalizeText(flow.librarySourceId) === normalizeText(payload.libraryItemId) ||
        normalizeText(flow.librarySourceId) === normalizeText(payload.sourceFlowId),
    );
    if (hasAlready) continue;
    try {
      flowService.create(tenant.id, {
        nickname: payload.sourceFlowNickname,
        displayLabel: payload.title,
        url: payload.sourceFlowUrl,
        librarySourceId: payload.libraryItemId,
      });
    } catch {
      const byUrl = existingFlows.find(
        (flow) => normalizeText(flow.url) === normalizeText(payload.sourceFlowUrl),
      );
      if (byUrl && !String(byUrl.librarySourceId ?? "").trim()) {
        flowRepository.updateById(byUrl.id, {
          librarySourceId: payload.libraryItemId,
          displayLabel: payload.title,
        });
      }
    }
  }
};
