/**
 * Repara handoff do fluxo matriz emprestimo-clt na API em produção.
 * Uso: node scripts/repair-matrix-emprestimo-clt.cjs
 */
const API_BASE = String(process.env.API_BASE ?? "https://app.chattypebot.com").replace(/\/$/, "");

async function main() {
  const health = await fetch(`${API_BASE}/health`).then((r) => r.json());
  console.log("deployMarker:", health.deployMarker);

  const res = await fetch(`${API_BASE}/api/master/system-library/repair-matrix-handoff`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ publicId: "emprestimo-clt" }),
  });
  const body = await res.json().catch(() => ({}));
  console.log("status:", res.status);
  console.log(JSON.stringify(body, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
