/**
 * Audita blocos do fluxo publicado emprestimo-clt (builder Walkup).
 * Requer: TYPEBOT_BUILDER_API_BASE_URL e TYPEBOT_BUILDER_API_TOKEN no ambiente.
 *
 * Uso: node scripts/audit-emprestimo-clt-blocks.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const API_BASE = String(
  process.env.TYPEBOT_BUILDER_API_BASE_URL ??
    process.env.TYPEBOT_SOURCE_BUILDER_API_BASE_URL ??
    "https://typebot-typebot-walkup-builder.achpyp.easypanel.host/api",
).replace(/\/$/, "");
const TOKEN = String(
  process.env.TYPEBOT_BUILDER_API_TOKEN ?? process.env.TYPEBOT_SOURCE_BUILDER_API_TOKEN ?? "",
).trim();
const WORKSPACE_ID = String(process.env.TYPEBOT_SOURCE_MASTER_WORKSPACE_ID ?? "").trim();
const PREFERRED_PUBLIC_ID = String(process.env.PUBLIC_ID ?? "emprestimo-clt").trim();
const HANDOFF_URL = String(process.env.TYPEBOT_HANDOFF_WEBHOOK_URL ?? "https://app.chattypebot.com/api/typebot/handoff").trim();
const MASTER_TENANT_ID = "07d245ea-48b9-4eda-a4a0-b8be573eb4bf";
const VIEWER_URL = `https://typebot-typebot-walkup-viewer.achpyp.easypanel.host/${PREFERRED_PUBLIC_ID}`;

const headers = {
  "content-type": "application/json",
  Authorization: `Bearer ${TOKEN}`,
};

const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const buildVarMap = (variables) => {
  const map = new Map();
  for (const v of variables ?? []) {
    if (v?.id && v?.name) map.set(v.id, v.name);
  }
  return map;
};

const isWrongRedirect = (url) => {
  const u = String(url ?? "").trim();
  if (!u) return true;
  const lower = u.toLowerCase();
  if (lower.includes("handoff-view")) return false;
  if (/\{\{\s*url_direct\s*\}\}/i.test(u)) return false;
  if (/typebot\/typebot\/public|us-east-\w{12,}/i.test(u)) return true;
  if (/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(u)) return true;
  if (/\/public\//i.test(u) && /minio|easypanel/i.test(u)) return true;
  return false;
};

async function listTypebots() {
  const qs = WORKSPACE_ID
    ? `?workspaceId=${encodeURIComponent(WORKSPACE_ID)}&limit=200`
    : "?limit=200";
  const res = await fetch(`${API_BASE}/v1/typebots${qs}`, { headers });
  if (!res.ok) throw new Error(`List typebots ${res.status}`);
  const data = await res.json();
  return data.typebots ?? [];
}

async function getTypebotDetail(id) {
  const res = await fetch(`${API_BASE}/v1/typebots/${encodeURIComponent(id)}?migrateToLatestVersion=true`, { headers });
  if (!res.ok) throw new Error(`GET typebot ${res.status}`);
  const data = await res.json();
  return data.typebot;
}

function auditBlocks(typebot) {
  const varMap = buildVarMap(typebot.variables);
  const issues = [];
  let blockIndex = 0;

  for (const group of typebot.groups ?? []) {
    const groupTitle = String(group.title ?? group.id ?? "Grupo").trim();
    for (const block of group.blocks ?? []) {
      blockIndex += 1;
      const type = String(block.type ?? "").trim();
      const blockLabel = `${groupTitle} → ${type} (#${blockIndex})`;
      const opts = block.options ?? {};

      if (type === "Set variable") {
        const varName = varMap.get(opts.variableId) ?? opts.variableId ?? "?";
        const expr = String(opts.expressionToEvaluate ?? "").trim();
        const expected = {
          tenantid: MASTER_TENANT_ID,
          sourceflowlabel: PREFERRED_PUBLIC_ID,
          viewer_url: VIEWER_URL,
          typebotviewerurl: VIEWER_URL,
        };
        const key = normalize(varName).replace(/[\s_-]+/g, "");
        const want = expected[key];
        if (want && normalize(expr) !== normalize(want)) {
          issues.push({
            block: blockLabel,
            variable: varName,
            fix: `Valor deve ser exatamente: ${want}`,
            current: expr.slice(0, 120),
          });
        }
      }

      if (type === "Webhook" || type === "HTTP request") {
        const wh = opts.webhook ?? opts;
        const url = String(wh.url ?? opts.url ?? "").trim();
        const body = String(wh.body ?? opts.body ?? "").trim();
        if (normalize(url) !== normalize(HANDOFF_URL)) {
          issues.push({
            block: blockLabel,
            fix: `URL do webhook deve ser: ${HANDOFF_URL}`,
            current: url || "(vazio)",
          });
        }
        if (!/tenantId|tenant_id/i.test(body)) {
          issues.push({
            block: blockLabel,
            fix: "Body JSON deve incluir tenantId (ex.: {{tenantId}})",
            current: body.slice(0, 100) || "(vazio)",
          });
        }
        if (!/sourceFlowLabel|source_flow_label/i.test(body)) {
          issues.push({
            block: blockLabel,
            fix: "Body JSON deve incluir sourceFlowLabel (ex.: {{sourceFlowLabel}})",
            current: body.slice(0, 100) || "(vazio)",
          });
        }
        const mapping = opts.responseVariableMapping ?? [];
        const hasUrlDirect = mapping.some((m) => String(m.bodyPath ?? "").toLowerCase().includes("url_direct"));
        if (!hasUrlDirect) {
          issues.push({
            block: blockLabel,
            fix: "Mapear resposta do webhook para variável com bodyPath url_direct",
            current: JSON.stringify(mapping).slice(0, 120) || "(sem mapeamento)",
          });
        }
      }

      if (type === "Redirect") {
        const url = String(opts.url ?? "").trim();
        if (isWrongRedirect(url)) {
          issues.push({
            block: blockLabel,
            fix: "URL do Redirect deve ser {{url_direct}} (não MinIO nem imagem)",
            current: url.slice(0, 120) || "(vazio)",
          });
        }
      }
    }
  }

  return issues;
}

async function main() {
  if (!TOKEN) {
    console.error("Defina TYPEBOT_BUILDER_API_TOKEN no ambiente.");
    process.exit(1);
  }

  const list = await listTypebots();
  let matchId = null;
  let matchName = "";
  for (const row of list) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const detail = await getTypebotDetail(id);
    const pid = String(detail.publicId ?? "").trim();
    if (normalize(pid) === normalize(PREFERRED_PUBLIC_ID)) {
      matchId = id;
      matchName = String(detail.name ?? row.name ?? "");
      fs.writeFileSync(
        path.join(__dirname, "../agent-tools/emprestimo-clt-builder-schema.json"),
        JSON.stringify(detail, null, 2),
      );
      const issues = auditBlocks(detail);
      const outPath = path.join(__dirname, "../agent-tools/emprestimo-clt-audit-issues.json");
      fs.writeFileSync(outPath, JSON.stringify({ typebotId: id, name: matchName, publicId: pid, issues }, null, 2));
      console.log(JSON.stringify({ typebotId: id, name: matchName, publicId: pid, issueCount: issues.length, first: issues[0] ?? null }, null, 2));
      return;
    }
  }
  console.error("Typebot com publicId", PREFERRED_PUBLIC_ID, "não encontrado.");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
