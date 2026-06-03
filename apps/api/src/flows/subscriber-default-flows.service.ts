import { flowRepository, tenantRepository } from "../lib/repositories";
import {
  ensureTenantFlowsLinkedToWorkspace,
  filterTenantFlowsForWorkspace,
  importManualWorkspaceTypebotsIntoTenantFlows,
  refreshTenantFlowViewerUrls,
} from "../typebot/typebot-flow-viewer-url-sync";
import type { SavedFlow } from "./flow.repository";
import { syncSystemDefaultsToRealTypebotWorkspace } from "../typebot/typebot-builder.service";
import { FlowService } from "./flow.service";
import { listSystemMasterLibrary, type SystemMasterLibraryItem } from "./system-master-library.repository";

const flowService = new FlowService(flowRepository);
const MASTER_SOURCE_EMAIL = "walkup@walkuptec.com.br";

const normalizeText = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();

const isMasterTenant = (ownerEmail: string | undefined): boolean =>
  normalizeText(ownerEmail) === normalizeText(MASTER_SOURCE_EMAIL);

/** Corrige vínculos antigos que gravaram sourceFlowId em vez do id do item da Biblioteca Master. */
export const repairSubscriberDefaultLibrarySourceIds = (tenantId: string): number => {
  const activeDefaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
  if (activeDefaults.length === 0) return 0;

  const flows = flowService.listByTenant(tenantId);
  let fixed = 0;
  for (const item of activeDefaults) {
    for (const flow of flows) {
      const lib = normalizeText(flow.librarySourceId);
      const shouldBe = normalizeText(item.id);
      if (!lib) {
        if (normalizeText(flow.url) === normalizeText(item.viewerUrl)) {
          flowRepository.updateById(flow.id, {
            librarySourceId: item.id,
            displayLabel: flow.displayLabel?.trim() || item.title,
          });
          fixed += 1;
        }
        continue;
      }
      if (lib === shouldBe) continue;
      const matchesLegacy =
        lib === normalizeText(item.sourceFlowId) ||
        normalizeText(flow.url) === normalizeText(item.viewerUrl) ||
        flowMatchesSystemDefaultItem(flow, item);
      if (matchesLegacy) {
        flowRepository.updateById(flow.id, {
          librarySourceId: item.id,
          displayLabel: flow.displayLabel?.trim() || item.title,
        });
        fixed += 1;
      }
    }
  }
  return fixed;
};

export const repairAllSubscriberDefaultsOnBoot = async (): Promise<{ tenants: number; linksFixed: number }> => {
  const activeDefaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
  if (activeDefaults.length === 0) return { tenants: 0, linksFixed: 0 };

  let linksFixed = 0;
  let tenants = 0;
  for (const tenant of tenantRepository.list()) {
    if (!tenant.id || isMasterTenant(tenant.ownerEmail)) continue;
    tenants += 1;
    linksFixed += repairSubscriberDefaultLibrarySourceIds(tenant.id);
    try {
      await ensureSubscriberSavedFlowsFromDefaults(tenant.id, activeDefaults);
    } catch {
      // best-effort por tenant
    }
  }
  return { tenants, linksFixed };
};

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

/** Só disco + vínculo (rápido). Import completo do workspace fica para sync=1 ou sync-workspace. */
export const ensureSubscriberFlowsQuick = async (tenantId: string): Promise<void> => {
  const activeDefaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
  repairSubscriberDefaultLibrarySourceIds(tenantId);
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
    await importManualWorkspaceTypebotsIntoTenantFlows(tenantId);
    await ensureTenantFlowsLinkedToWorkspace(tenantId);
    await refreshTenantFlowViewerUrls(tenantId);
  } catch {
    // best-effort
  }
};

/** Importa workspace + padrões da Biblioteca Master no saved-flows do assinante (etapa 6). */
export const syncSubscriberFlowsForListing = async (tenantId: string): Promise<void> => {
  const defaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
  if (defaults.length > 0) {
    await ensureSubscriberSavedFlowsFromDefaults(tenantId, defaults);
  }
  try {
    await importManualWorkspaceTypebotsIntoTenantFlows(tenantId);
  } catch {
    // best-effort
  }
  try {
    await ensureTenantFlowsLinkedToWorkspace(tenantId);
    await refreshTenantFlowViewerUrls(tenantId);
  } catch {
    // best-effort
  }
  if (defaults.length === 0) return;
  try {
    await ensureSubscriberSavedFlowsFromDefaults(tenantId, defaults);
    await refreshTenantFlowViewerUrls(tenantId);
  } catch {
    // best-effort
  }
};

/** Lista fluxos do assinante para a etapa 6 — nunca devolve [] se houver dados no disco após sync. */
export const listSubscriberTenantFlowsForMaster = async (
  tenantId: string,
  options?: { forceSync?: boolean },
): Promise<SavedFlow[]> => {
  const tenant = tenantRepository.getById(tenantId);
  const hasWorkspace = Boolean(String(tenant?.typebotWorkspaceId ?? "").trim());
  const forceSync = Boolean(options?.forceSync);

  try {
    if (hasWorkspace) {
      if (forceSync) {
        await syncSubscriberFlowsForListing(tenantId);
      } else {
        await ensureSubscriberFlowsQuick(tenantId);
      }
    } else {
      await ensureSubscriberFlowsQuick(tenantId);
    }
  } catch {
    // best-effort
  }

  if (hasWorkspace) {
    try {
      await ensureTenantFlowsLinkedToWorkspace(tenantId);
      await refreshTenantFlowViewerUrls(tenantId);
    } catch {
      // best-effort
    }
  }

  let flows = flowService.listByTenant(tenantId);
  if (hasWorkspace) {
    const filtered = await filterTenantFlowsForWorkspace(tenantId, flows);
    flows = filtered.length > 0 ? filtered : flows;
  }
  return flows;
};

export const propagateDefaultsToSubscriberWorkspacesInBackground = (defaults: SystemMasterLibraryItem[]): void => {
  const activeDefaults = defaults.filter((item) => item.isSystemDefault);
  if (activeDefaults.length === 0) return;

  const subscribers = tenantRepository
    .list()
    .filter((tenant) => tenant.id && !isMasterTenant(tenant.ownerEmail));

  void (async () => {
    for (const tenant of subscribers) {
      try {
        await syncSystemDefaultsToRealTypebotWorkspace(tenant.id!, activeDefaults, { overwriteExisting: true });
        await importManualWorkspaceTypebotsIntoTenantFlows(tenant.id!);
        await ensureSubscriberSavedFlowsFromDefaults(tenant.id!, activeDefaults);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `[subscriber-default-flows] background sync failed tenant=${tenant.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  })();
};

/** Cria/atualiza fluxos no disco do assinante e vincula ao workspace Typebot. */
export const ensureSubscriberSavedFlowsFromDefaults = async (
  tenantId: string,
  defaults: SystemMasterLibraryItem[] = listSystemMasterLibrary(),
): Promise<void> => {
  const activeDefaults = defaults.filter((item) => item.isSystemDefault);
  if (activeDefaults.length === 0) return;

  repairSubscriberDefaultLibrarySourceIds(tenantId);

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
  const tenants = tenantRepository.list();
  for (const tenant of tenants) {
    if (!tenant.id || isMasterTenant(tenant.ownerEmail)) continue;
    repairSubscriberDefaultLibrarySourceIds(tenant.id);
    const existingFlows = flowService.listByTenant(tenant.id);
    const existingMatch = existingFlows.find(
      (flow) =>
        normalizeText(flow.url) === normalizeText(payload.sourceFlowUrl) ||
        normalizeText(flow.librarySourceId) === normalizeText(payload.libraryItemId) ||
        normalizeText(flow.librarySourceId) === normalizeText(payload.sourceFlowId) ||
        flowMatchesSystemDefaultItem(flow, {
          id: payload.libraryItemId,
          sourceFlowId: payload.sourceFlowId,
          title: payload.title,
          viewerUrl: payload.sourceFlowUrl,
        }),
    );
    if (existingMatch) {
      const lib = normalizeText(existingMatch.librarySourceId);
      if (lib !== normalizeText(payload.libraryItemId)) {
        flowRepository.updateById(existingMatch.id, {
          librarySourceId: payload.libraryItemId,
          displayLabel: payload.title,
        });
      }
      continue;
    }
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
