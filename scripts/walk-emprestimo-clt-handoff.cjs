/**
 * Percorre o fluxo publicado emprestimo-clt até redirect ou fim (teste runtime).
 */
const VIEWER = "https://typebot-typebot-walkup-viewer.achpyp.easypanel.host";

async function startChat() {
  const res = await fetch(`${VIEWER}/api/v1/typebots/emprestimo-clt/startChat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  return res.json();
}

async function continueChat(sessionId, body) {
  const res = await fetch(`${VIEWER}/api/v1/sessions/${encodeURIComponent(sessionId)}/continueChat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: { raw: text.slice(0, 500) } };
  }
}

function describeState(j) {
  const parts = [];
  if (j.messages?.length) {
    for (const m of j.messages) {
      parts.push(`msg:${m.type}`);
    }
  }
  if (j.input) parts.push(`input:${j.input.type}`);
  if (j.clientSideActions) parts.push(`actions:${j.clientSideActions.length}`);
  if (j.redirectUrl) parts.push(`REDIRECT:${j.redirectUrl}`);
  return parts.join(" | ") || JSON.stringify(j).slice(0, 200);
}

async function main() {
  let step = 0;
  const log = [];
  let session = await startChat();
  log.push({ step: ++step, action: "startChat", detail: describeState(session) });

  const replies = [
    { message: "Quer fazer o empréstimo" },
    { message: "João Teste" },
    { message: "11999999999" },
    { message: "joao@teste.com" },
    { message: "5000" },
    { message: "sim" },
    { message: "ok" },
  ];

  for (const body of replies) {
    if (!session.sessionId) break;
    const { status, json } = await continueChat(session.sessionId, body);
    log.push({ step: ++step, action: JSON.stringify(body), status, detail: describeState(json) });
    if (json.redirectUrl) {
      log.push({ redirectUrl: json.redirectUrl });
      break;
    }
    if (json.input?.type === "choice input" && json.input.items?.[0]) {
      const choice = json.input.items[0].content;
      const r2 = await continueChat(session.sessionId, { message: choice });
      log.push({ step: ++step, action: `choice:${choice}`, status: r2.status, detail: describeState(r2.json) });
      if (r2.json.redirectUrl) {
        log.push({ redirectUrl: r2.json.redirectUrl });
        break;
      }
      session = { ...session, ...r2.json };
      continue;
    }
    session = { ...session, ...json };
    if (!json.input && !json.messages?.length && status !== 200) break;
    if (!json.input && !json.redirectUrl) {
      // maybe done
    }
  }

  const fs = require("node:fs");
  const path = require("node:path");
  fs.writeFileSync(path.join(__dirname, "../agent-tools/emprestimo-clt-walk-log.json"), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
}

main().catch(console.error);
