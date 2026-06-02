import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { SavedFlow } from "../flows/flow.repository";
import { getDataFilePath } from "../lib/data-path";
import { flowRepository, tenantRepository } from "../lib/repositories";
import { listSystemMasterLibrary } from "../flows/system-master-library.repository";

type TenantIdMapEntry = { id: string; ownerEmail: string };

const normalizeKey = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();

const seedDirectory = (): string => resolve(__dirname, "..", "..", "data-seed");

const readJsonFile = <T>(path: string): T | null => {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
};

const remapFlowTenantIds = (flows: SavedFlow[], seedMap: TenantIdMapEntry[]): SavedFlow[] => {
  const seedIdToEmail = new Map(
    seedMap.map((entry) => [entry.id, normalizeKey(entry.ownerEmail)] as const),
  );
  const emailToCurrentId = new Map(
    tenantRepository.list().map((tenant) => [normalizeKey(tenant.ownerEmail), tenant.id] as const),
  );

  return flows.map((flow) => {
    const ownerEmail = seedIdToEmail.get(flow.tenantId);
    if (!ownerEmail) return flow;
    const currentTenantId = emailToCurrentId.get(ownerEmail);
    if (!currentTenantId) return flow;
    return { ...flow, tenantId: currentTenantId };
  });
};

const shouldRestoreOperationalSeed = (): boolean => {
  const forced = String(process.env.API_RESTORE_OPERATIONAL_SEED_ON_EMPTY ?? "")
    .trim()
    .toLowerCase();
  if (forced === "true" || forced === "1") return true;
  if (forced === "false" || forced === "0") return false;

  const isProduction = String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
  if (!isProduction) return false;

  const flowsTotal = flowRepository.listAll().length;
  const tenantsTotal = tenantRepository.list().length;
  return tenantsTotal > 0 && flowsTotal === 0;
};

/**
 * Quando o volume operacional está vazio (redeploy sem persistência), restaura fluxos/biblioteca
 * a partir de `apps/api/data-seed` e realinha `tenantId` pelo e-mail do proprietário.
 */
export async function seedOperationalDataOnEmptyIfNeeded(): Promise<{ restored: boolean; flows: number }> {
  if (!shouldRestoreOperationalSeed()) {
    return { restored: false, flows: flowRepository.listAll().length };
  }

  const seedDir = seedDirectory();
  const seedFlowsPath = join(seedDir, "saved-flows.json");
  const seedLibraryPath = join(seedDir, "system-master-library.json");
  const seedTenantMapPath = join(seedDir, "tenant-id-map.json");

  const seedFlows = readJsonFile<SavedFlow[]>(seedFlowsPath);
  if (!Array.isArray(seedFlows) || seedFlows.length === 0) {
    // eslint-disable-next-line no-console
    console.warn("[operational-seed] Ignorado: data-seed/saved-flows.json ausente ou vazio.");
    return { restored: false, flows: 0 };
  }

  const seedMap = readJsonFile<TenantIdMapEntry[]>(seedTenantMapPath) ?? [];
  const remappedFlows = remapFlowTenantIds(seedFlows, seedMap);

  const targetFlowsPath = getDataFilePath("saved-flows.json");
  mkdirSync(dirname(targetFlowsPath), { recursive: true });
  writeFileSync(targetFlowsPath, JSON.stringify(remappedFlows, null, 2), "utf-8");
  flowRepository.reloadFromStorage();

  const targetLibraryPath = getDataFilePath("system-master-library.json");
  if (listSystemMasterLibrary().length === 0 && existsSync(seedLibraryPath)) {
    mkdirSync(dirname(targetLibraryPath), { recursive: true });
    copyFileSync(seedLibraryPath, targetLibraryPath);
  }

  const flowsTotal = flowRepository.listAll().length;
  // eslint-disable-next-line no-console
  console.log(
    `[operational-seed] Restaurados ${flowsTotal} fluxo(s) e biblioteca master a partir de data-seed (tenantId realinhado por e-mail).`,
  );
  return { restored: true, flows: flowsTotal };
}
