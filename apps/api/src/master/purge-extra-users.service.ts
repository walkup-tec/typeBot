import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { TenantService } from "../tenants/tenant.service";
import {
  attendantRepository,
  flowRepository,
  kanbanRepository,
  labelRepository,
  priorityRepository,
  queueRepository,
  tenantRepository,
} from "../lib/repositories";
import { getDataFilePath } from "../lib/data-path";
import { isAuthPostgresEnabled, loadTenantsFromPostgres } from "../lib/auth-postgres";
import { isAllowedSaasLoginIdentifier, isAllowedSaasOwnerEmail } from "./allowed-saas-users";

export type PurgeExtraUsersResult = {
  keptTenantIds: string[];
  keptOwnerEmails: string[];
  removedTenants: Array<{ id: string; name: string; ownerEmail: string }>;
  removedAttendants: Array<{ id: string; username: string; tenantId: string }>;
  removedFlows: number;
  removedBillingOrders: number;
  purgedTenantIds: string[];
};

const purgeBillingOrdersFile = (keptTenantIds: Set<string>): number => {
  const path = getDataFilePath("billing-orders.json");
  if (!existsSync(path)) return 0;
  let orders: Array<{ ownerEmail?: string; tenantId?: string }> = [];
  try {
    orders = JSON.parse(readFileSync(path, "utf-8")) as typeof orders;
    if (!Array.isArray(orders)) return 0;
  } catch {
    return 0;
  }
  const before = orders.length;
  const next = orders.filter((order) => {
    const ownerOk = isAllowedSaasOwnerEmail(order.ownerEmail);
    const tenantId = String(order.tenantId ?? "").trim();
    const tenantOk = !tenantId || keptTenantIds.has(tenantId);
    return ownerOk && tenantOk;
  });
  if (next.length !== before) {
    writeFileSync(path, JSON.stringify(next, null, 2), "utf-8");
  }
  return before - next.length;
};

const purgeFlowLibraryFile = (): void => {
  const path = getDataFilePath("flow-library.json");
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (!Array.isArray(raw)) return;
    writeFileSync(path, "[]", "utf-8");
  } catch {
    /* ignore */
  }
};

const purgeOperationalTenantSlice = (tenantId: string): void => {
  labelRepository.deleteByTenantId(tenantId);
  priorityRepository.deleteByTenantId(tenantId);
  kanbanRepository.deleteByTenantId(tenantId);
  queueRepository.deleteByTenantId(tenantId);
};

export const purgeExtraSaasUsers = async (): Promise<PurgeExtraUsersResult> => {
  await attendantRepository.reloadFromStorage();
  if (isAuthPostgresEnabled()) {
    const rows = await loadTenantsFromPostgres();
    tenantRepository.hydrate(rows);
  }

  const tenantService = new TenantService(
    tenantRepository,
    attendantRepository,
    flowRepository,
    queueRepository,
    labelRepository,
    priorityRepository,
    kanbanRepository,
  );

  flowRepository.reloadFromStorage();

  const allTenants = tenantService.list();
  const keptTenants = allTenants.filter((tenant) => isAllowedSaasOwnerEmail(tenant.ownerEmail));
  const keptTenantIds = new Set(keptTenants.map((tenant) => tenant.id));
  const removedTenants: PurgeExtraUsersResult["removedTenants"] = [];

  for (const tenant of allTenants) {
    if (isAllowedSaasOwnerEmail(tenant.ownerEmail)) continue;
    removedTenants.push({ id: tenant.id, name: tenant.name, ownerEmail: tenant.ownerEmail });
    purgeOperationalTenantSlice(tenant.id);
    tenantService.delete(tenant.id);
    keptTenantIds.delete(tenant.id);
  }

  const purgedTenantIds = new Set<string>(removedTenants.map((row) => row.id));

  const removedAttendants: PurgeExtraUsersResult["removedAttendants"] = [];
  for (const attendant of attendantRepository.listAll()) {
    const login = attendant.email ?? attendant.username;
    const tenantOk = keptTenantIds.has(attendant.tenantId);
    const loginOk = isAllowedSaasLoginIdentifier(login);
    if (tenantOk && loginOk) continue;
    removedAttendants.push({
      id: attendant.id,
      username: attendant.username,
      tenantId: attendant.tenantId,
    });
    attendantRepository.deleteById(attendant.id);
  }

  for (const flow of flowRepository.listAll()) {
    if (keptTenantIds.has(flow.tenantId)) continue;
    purgedTenantIds.add(flow.tenantId);
    flowRepository.removeById(flow.id);
  }

  for (const orphanTenantId of purgedTenantIds) {
    if (keptTenantIds.has(orphanTenantId)) continue;
    purgeOperationalTenantSlice(orphanTenantId);
    flowRepository.deleteByTenantId(orphanTenantId);
  }

  let removedFlows = 0;
  flowRepository.reloadFromStorage();
  for (const flow of [...flowRepository.listAll()]) {
    if (keptTenantIds.has(flow.tenantId)) continue;
    flowRepository.removeById(flow.id);
    removedFlows += 1;
  }

  const removedBillingOrders = purgeBillingOrdersFile(keptTenantIds);
  purgeFlowLibraryFile();

  return {
    keptTenantIds: [...keptTenantIds],
    keptOwnerEmails: keptTenants.map((tenant) => tenant.ownerEmail),
    removedTenants,
    removedAttendants,
    removedFlows,
    removedBillingOrders,
    purgedTenantIds: [...purgedTenantIds],
  };
};
