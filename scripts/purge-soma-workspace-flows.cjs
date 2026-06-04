/**
 * Limpa workspace Typebot + saved-flows do tenant Soma Promotora (produção).
 * Requer API com rota purge deployada (marker DEPLOY-2026-06-04-purge-tenant-workspace-flows).
 *
 * Uso: node scripts/purge-soma-workspace-flows.cjs
 * Opcional: API_BASE=https://app.chattypebot.com
 */
const API_BASE = String(process.env.API_BASE ?? "https://app.chattypebot.com").replace(/\/$/, "");
const SOMA_TENANT_ID = "1f992ff8-741b-451d-b3c8-bb08ec1ba92a";

async function main() {
  const healthUrl = `${API_BASE}/health`;
  const purgeUrl = `${API_BASE}/api/master/tenants/${SOMA_TENANT_ID}/typebot/purge-workspace-flows`;

  const healthRes = await fetch(healthUrl);
  const health = await healthRes.json().catch(() => ({}));
  console.log("health.deployMarker:", health.deployMarker ?? healthRes.status);

  const purgeRes = await fetch(purgeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clearQueue: true }),
  });
  const text = await purgeRes.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 500);
  }
  console.log("purge.status:", purgeRes.status);
  console.log(JSON.stringify(body, null, 2));
  if (!purgeRes.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
