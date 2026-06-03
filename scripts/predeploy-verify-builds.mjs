/**
 * Rode antes de push/deploy: garante builds críticos e arquivos que já quebraram produção.
 * Uso: npm run predeploy:verify
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(label, command, args) {
  console.log(`\n[predeploy:verify] ${label}…`);
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`[predeploy:verify] FALHOU: ${label}`);
    process.exit(result.status ?? 1);
  }
}

const mustExist = [
  "apps/admin/src/lib/publicApiBase.ts",
  "apps/api/src/flows/subscriber-default-flows.service.ts",
];

for (const rel of mustExist) {
  const abs = resolve(repoRoot, rel);
  if (!existsSync(abs)) {
    console.error(`[predeploy:verify] Arquivo obrigatório ausente: ${rel}`);
    process.exit(1);
  }
}

run("admin import gate", "node", ["scripts/check-admin-source-imports.mjs"]);
run("build:api", "npm", ["run", "build:api"]);

if (existsSync(resolve(repoRoot, "node_modules/vite/package.json"))) {
  run("build:admin", "npm", ["run", "build:admin"]);
} else {
  console.warn("[predeploy:verify] node_modules incompleto — pulando build:admin (Easypanel fará npm ci).");
}

console.log("\n[predeploy:verify] OK — seguro para commit/deploy.");
