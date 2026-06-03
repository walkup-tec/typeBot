/**
 * Falha o build do painel se App.tsx importar arquivos inexistentes (ex.: publicApiBase esquecido no git).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adminSrc = resolve(repoRoot, "apps/admin/src");
const appTsx = resolve(adminSrc, "App.tsx");

if (!existsSync(appTsx)) {
  console.error("[admin-build-gate] App.tsx não encontrado.");
  process.exit(1);
}

const required = [
  resolve(adminSrc, "lib/publicApiBase.ts"),
  resolve(adminSrc, "deploy-marker.ts"),
  resolve(adminSrc, "lib/masterLibraryFlows.ts"),
  resolve(adminSrc, "lib/resolveStatusToastTone.ts"),
];

for (const filePath of required) {
  if (!existsSync(filePath)) {
    console.error(`[admin-build-gate] Arquivo obrigatório ausente: ${filePath}`);
    process.exit(1);
  }
}

const source = readFileSync(appTsx, "utf8");
const importRe = /from\s+["'](\.\/[^"']+)["']/g;
const missing = [];
for (const match of source.matchAll(importRe)) {
  const rel = match[1];
  if (!rel.startsWith("./")) continue;
  const base = resolve(adminSrc, rel);
  const candidates = [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")];
  if (!candidates.some((p) => existsSync(p))) {
    missing.push(rel);
  }
}

if (missing.length > 0) {
  console.error("[admin-build-gate] Imports quebrados em App.tsx:");
  for (const rel of [...new Set(missing)]) console.error(`  - ${rel}`);
  process.exit(1);
}

console.log("[admin-build-gate] OK — imports do painel resolvidos.");
