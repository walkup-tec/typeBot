/**
 * Corre antes de `vite build`: VITE_API_BASE_URL / VITE_PAINEL_URL não podem
 * ficar vazios nem apontar para localhost no bundle de produção.
 *
 * Merge: `.env.production` + `process.env` (o ambiente do Easypanel sobrepõe o ficheiro).
 * Escape: `SALES_SKIP_VITE_ENV_CHECK=1` (só exceção pontual).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.SALES_SKIP_VITE_ENV_CHECK === "1") {
  process.exit(0);
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = parseEnvFile(resolve(appRoot, ".env.production"));
const merged = { ...fileEnv, ...process.env };

const api = String(merged.VITE_API_BASE_URL ?? "").trim();
const painel = String(merged.VITE_PAINEL_URL ?? "").trim();

if (!api) {
  console.error(
    "[apps/sales] VITE_API_BASE_URL vazio no build. Defina no Easypanel (passo de build) ou em .env.production (HTTPS da API, sem barra no fim).",
  );
  process.exit(1);
}

if (/localhost|127\.0\.0\.1/i.test(api)) {
  console.error(
    "[apps/sales] VITE_API_BASE_URL não pode ser localhost no build de produção. Valor efetivo:",
    api,
  );
  console.error(
    "No Easypanel: uma só linha por chave; remova duplicados com http://localhost — veja apps/sales/.env.example",
  );
  process.exit(1);
}

if (painel && /localhost|127\.0\.0\.1/i.test(painel)) {
  console.error(
    "[apps/sales] VITE_PAINEL_URL não pode ser localhost no build. Valor efetivo:",
    painel,
  );
  process.exit(1);
}
