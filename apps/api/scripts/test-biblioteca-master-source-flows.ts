import { seedOperationalDataOnEmptyIfNeeded } from "../src/bootstrap/seed-operational-data-on-empty";
import { listMasterLibrarySourceFlows } from "../src/flows/source-master-sync.service";
import { flowRepository } from "../src/lib/repositories";

async function main(): Promise<void> {
  const seed = await seedOperationalDataOnEmptyIfNeeded();
  const flows = flowRepository.listAll();
  const rows = await listMasterLibrarySourceFlows();
  const owners = [...new Set(rows.map((row) => row.ownerEmail).filter(Boolean))];

  const payload = {
    restored: seed.restored,
    flowsSavedCount: flows.length,
    sourceFlowsCount: rows.length,
    owners,
  };
  console.log(JSON.stringify(payload));

  if (!seed.restored) throw new Error("Seed não restaurou (restored=false)");
  if (flows.length < 1) throw new Error("flowsSavedCount esperado >= 1");
  if (rows.length < 1) throw new Error("sourceFlowsCount esperado >= 1");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
