/**
 * Teste local: seed operacional + listagem Biblioteca Master (source-flows).
 * Uso: node scripts/test-biblioteca-master-source-flows.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = resolve(root, "apps/api/data");
const savedFlowsPath = resolve(dataDir, "saved-flows.json");

mkdirSync(dataDir, { recursive: true });
const backupPath = resolve(dataDir, "saved-flows.backup-test.json");
if (existsSync(savedFlowsPath)) {
  writeFileSync(backupPath, readFileSync(savedFlowsPath));
}
writeFileSync(savedFlowsPath, "[]", "utf-8");

const env = { ...process.env, NODE_ENV: "production" };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

try {
  const result = spawnSync(
    npx,
    ["tsx", "scripts/test-biblioteca-master-source-flows.ts"],
    { encoding: "utf-8", env, cwd: resolve(root, "apps/api"), shell: true },
  );
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    console.error(out || "Falha ao executar teste tsx");
    process.exit(1);
  }
  const line = out.split("\n").filter((row) => row.startsWith("{")).pop();
  const payload = JSON.parse(line ?? "{}");
  console.log("[test] Resultado:", payload);
  console.log("[test] OK — biblioteca master com fluxos por proprietário.");
} finally {
  if (existsSync(backupPath)) {
    writeFileSync(savedFlowsPath, readFileSync(backupPath));
  }
}
