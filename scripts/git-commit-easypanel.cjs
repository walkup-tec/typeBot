/**
 * Commit com short SHA no assunto — o Easypanel mostra esse texto como título do deploy.
 *
 * Uso (na raiz do repo, arquivos já em stage):
 *   npm run easypanel:commit -- "fix: resumo da mudança"
 *
 * Assunto final: [abc1234] fix: resumo da mudança
 */
const { execSync } = require("node:child_process");
const process = require("node:process");

const MAX_SUBJECT_HINT = 100;

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function normalizeDeploySubject(raw) {
  let text = String(raw ?? "").trim();
  text = text.replace(/^\[[0-9a-f]{7,40}\]\s*/i, "");
  text = text.replace(/\s\|\s[0-9a-f]{7,40}$/i, "");
  text = text.replace(/\r\n/g, "\n");
  text = text.split("\n")[0] ?? "";
  text = text.replace(/\s*Co-authored-by:\s*.*$/i, "").trim();
  return text;
}

function main() {
  const raw = process.argv.slice(2).join(" ").trim();
  if (!raw) {
    console.error('Uso: npm run easypanel:commit -- "fix: descrição curta"');
    process.exitCode = 1;
    return;
  }

  const body = normalizeDeploySubject(raw);
  if (!body) {
    console.error("Mensagem vazia após normalizar (use uma linha, sem Co-authored-by).");
    process.exitCode = 1;
    return;
  }

  if (body.length > MAX_SUBJECT_HINT) {
    console.warn(
      `Aviso: assunto com ${body.length} caracteres — Easypanel trunca títulos longos. Prefira ≤ ${MAX_SUBJECT_HINT}.`,
    );
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

  const displaySubject = finalSha !== labelSha ? `[${finalSha}] ${body}` : subject;
  console.log(`Título Easypanel (assunto): ${displaySubject}`);
  if (finalSha !== labelSha) {
    console.log(`(amend alterou SHA: era ${labelSha}, final ${finalSha})`);
  }
  console.log("Próximo passo: git push origin master");
}

main();
