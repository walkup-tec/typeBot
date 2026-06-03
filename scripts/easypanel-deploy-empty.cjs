/**
 * Gera um commit vazio com mensagem única e faz push.
 * O Easypanel (fonte Git) costuma mostrar o último commit como título do deploy;
 * redeploy do mesmo commit sem novo push repete o mesmo nome.
 *
 * Uso (na raiz do repo, com git configurado):
 *   node scripts/easypanel-deploy-empty.cjs "api: correção flow-library"
 *
 * Opcional — nome do serviço no Easypanel (aparece no texto do commit):
 *   set EASYPANEL_SERVICE=api
 *   node scripts/easypanel-deploy-empty.cjs "painel: fallback biblioteca"
 */
const { execSync } = require("node:child_process");
const process = require("node:process");

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function main() {
  const userMsg = process.argv.slice(2).join(" ").trim() || "redeploy";
  const service = String(process.env.EASYPANEL_SERVICE ?? "").trim();
  const iso = new Date().toISOString();
  let shortSha = "";
  try {
    shortSha = sh("git rev-parse --short HEAD");
  } catch {
    shortSha = "no-git";
  }

  const prefix = service ? `deploy[${service}]` : "deploy";
  const title = `${prefix}: ${userMsg} | ${iso} | ${shortSha}`;

  try {
    execSync(`git commit --allow-empty -m ${JSON.stringify(title)}`, { stdio: "inherit" });
  } catch {
    process.exitCode = 1;
    return;
  }
  try {
    execSync("git push", { stdio: "inherit" });
  } catch {
    process.exitCode = 1;
  }
}

main();
