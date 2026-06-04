/**
 * Commit com short SHA no assunto — o Easypanel mostra esse texto como título do deploy.
 *
 * Uso (na raiz do repo, arquivos já em stage):
 *   node scripts/git-commit-easypanel.cjs "fix: resumo da mudança"
 *
 * Assunto final: [abc1234] fix: resumo da mudança
 * (o prefixo é o SHA logo após o commit; o amend pode alterar o SHA final em 1 caractere — use git log para o hash exato)
 */
const { execSync } = require("node:child_process");
const process = require("node:process");

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function main() {
  const raw = process.argv.slice(2).join(" ").trim();
  if (!raw) {
    console.error("Uso: node scripts/git-commit-easypanel.cjs \"fix: descrição curta\"");
    process.exitCode = 1;
    return;
  }

  const body = raw.replace(/^\[[0-9a-f]{7,40}\]\s*/i, "").replace(/\s\|\s[0-9a-f]{7,40}$/i, "").trim();
  if (!body) {
    console.error("Mensagem vazia após remover prefixo/sufixo de SHA.");
    process.exitCode = 1;
    return;
  }

  try {
    execSync(`git commit -m ${JSON.stringify(body)}`, { stdio: "inherit" });
  } catch {
    process.exitCode = 1;
    return;
  }

  let labelSha = "";
  try {
    labelSha = sh("git rev-parse --short HEAD");
  } catch {
    process.exitCode = 1;
    return;
  }

  const subject = `[${labelSha}] ${body}`;
  try {
    execSync(`git commit --amend -m ${JSON.stringify(subject)}`, { stdio: "inherit" });
  } catch {
    process.exitCode = 1;
    return;
  }

  let finalSha = "";
  try {
    finalSha = sh("git rev-parse --short HEAD");
  } catch {
    finalSha = labelSha;
  }

  console.log(`Título Easypanel (assunto): ${subject}`);
  if (finalSha !== labelSha) {
    console.log(`SHA final do commit (git log -1): ${finalSha}`);
  }
}

main();
