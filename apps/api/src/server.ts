import "./load-env";
import { dirname } from "node:path";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { registerTenantRoutes } from "./tenants/tenant.routes";
import { registerQueueRoutes } from "./queue/queue.routes";
import { registerTypebotRoutes } from "./typebot/typebot.routes";
import { registerFlowRoutes } from "./flows/flow.routes";
import { registerAttendantRoutes } from "./attendants/attendant.routes";
import { registerLabelRoutes } from "./labels/label.routes";
import { flowRepository, tenantRepository } from "./lib/repositories";
import { getDataFilePath } from "./lib/data-path";
import { registerAuthRoutes } from "./auth/auth.routes";
import { syncAllSubscriberWorkspacesFromMaster } from "./typebot/typebot-builder.service";
import { importManualWorkspaceTypebotsIntoTenantFlows } from "./typebot/typebot-flow-viewer-url-sync";
import { seedTenantOnEmptyIfConfigured } from "./bootstrap/seed-tenant-on-empty";
import { ensureSystemMasterAuthIfConfigured } from "./bootstrap/ensure-system-master-auth";
import {
  bootstrapAuthDataFromDatabase,
  enforceProductionAuthEnv,
  logAuthPersistenceMode,
} from "./bootstrap/auth-data-bootstrap";
import { isAuthPostgresEnabled } from "./lib/auth-postgres";

const app = express();
/** Traefik/Easypanel enviam `X-Forwarded-Proto`; necessário para `req.secure` e cabeçalhos HTTPS. */
app.set("trust proxy", 1);
const port = Number(process.env.PORT ?? 3333);
const TYPEBOT_AUTO_SYNC_ACTIVE_MASTER_FLOWS =
  String(process.env.TYPEBOT_AUTO_SYNC_ACTIVE_MASTER_FLOWS ?? "true").trim().toLowerCase() !== "false";
const TYPEBOT_AUTO_SYNC_INTERVAL_MS = Number(process.env.TYPEBOT_AUTO_SYNC_INTERVAL_MS ?? 20000);
const TYPEBOT_TENANT_FLOW_WATCHER_ENABLED =
  String(process.env.TYPEBOT_TENANT_FLOW_WATCHER_ENABLED ?? "true").trim().toLowerCase() !== "false";
const TYPEBOT_TENANT_FLOW_WATCHER_INTERVAL_MS = Number(process.env.TYPEBOT_TENANT_FLOW_WATCHER_INTERVAL_MS ?? 7000);
const TYPEBOT_TARGET_BUILDER_API_TOKEN = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_TOKEN ?? process.env.TYPEBOT_BUILDER_API_TOKEN ?? "",
).trim();
let isMasterAutoSyncRunning = false;
let isTenantFlowWatcherRunning = false;

const runMasterAutoSync = async () => {
  if (isMasterAutoSyncRunning) return;
  isMasterAutoSyncRunning = true;
  try {
    const result = await syncAllSubscriberWorkspacesFromMaster();
    // eslint-disable-next-line no-console
    console.log(
      `[typebot-auto-sync] synced=${result.synced} failed=${result.failed} skipped=${result.skipped}`,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[typebot-auto-sync] failed:", error);
  } finally {
    isMasterAutoSyncRunning = false;
  }
};

const runTenantFlowWatcher = async () => {
  if (isTenantFlowWatcherRunning) return;
  isTenantFlowWatcherRunning = true;
  try {
    let imported = 0;
    let scannedTenants = 0;
    const tenants = tenantRepository.list();
    for (const tenant of tenants) {
      if (!tenant.id) continue;
      scannedTenants += 1;
      try {
        const result = await importManualWorkspaceTypebotsIntoTenantFlows(tenant.id);
        imported += result.imported;
        if (result.imported === 0 && result.skipReason) {
          // eslint-disable-next-line no-console
          console.warn(
            `[typebot-tenant-flow-sync] tenant=${tenant.id} imported=0 reason=${result.skipReason} candidates=${result.workspaceCandidates} workspaceId=${result.workspaceId || "none"}`,
          );
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[typebot-tenant-flow-sync] tenant=${tenant.id} failed:`, error);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[typebot-tenant-flow-sync] tenants=${scannedTenants} imported=${imported}`);
  } finally {
    isTenantFlowWatcherRunning = false;
  }
};

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

/**
 * Reforço HTTPS no browser: HSTS (após visita HTTPS válida), CSP upgrade-insecure-requests,
 * cabeçalhos básicos. Não substitui certificado TLS nem remove avisos de conteúdo misto no HTML de outros hosts.
 */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", "upgrade-insecure-requests");

  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    .trim();
  const isHttps = req.secure || forwardedProto === "https";
  if (isHttps) {
    const maxAge = Number(process.env.HSTS_MAX_AGE_SEC ?? "31536000");
    const safeMaxAge = Number.isFinite(maxAge) && maxAge > 0 ? Math.min(maxAge, 63072000) : 31536000;
    const includeSubdomains = String(process.env.HSTS_INCLUDE_SUBDOMAINS ?? "").trim() === "1";
    const hsts = includeSubdomains
      ? `max-age=${safeMaxAge}; includeSubDomains`
      : `max-age=${safeMaxAge}`;
    res.setHeader("Strict-Transport-Security", hsts);
  }
  next();
});

app.use(express.json({ limit: "8mb" }));

app.get("/health", (_req, res) => {
  const flowsTotal = flowRepository.listAll().length;
  const tenantsTotal = tenantRepository.list().length;
  const savedFlowsPath = getDataFilePath("saved-flows.json");
  const operationalDataDirectory = dirname(savedFlowsPath);
  res.status(200).json({
    status: "ok",
    service: "typebot-saas-api",
    authTenantsAttendants: isAuthPostgresEnabled() ? "postgres" : "json",
    /** Postgres cobre só login/assinantes/atendentes. Fluxos, fila e bibliotecas continuam em JSON no disco. */
    flowsSavedCount: flowsTotal,
    tenantsCount: tenantsTotal,
    operationalDataBackend: "json_filesystem",
    /** Caminho absoluto no servidor/container — monte o volume nesta pasta (contém saved-flows.json). */
    operationalDataDirectory,
    operationalSavedFlowsFile: savedFlowsPath,
    operationalDataHint:
      "Montar volume persistente no diretório de dados da API (operationalDataDirectory). Sem volume, cada redeploy recria disco e pode esvaziar a biblioteca de fluxos.",
    typebotTenantFlowWatcherEnabled: TYPEBOT_TENANT_FLOW_WATCHER_ENABLED,
    typebotTenantFlowImportConfigured: Boolean(TYPEBOT_TARGET_BUILDER_API_TOKEN),
  });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    service: "typebot-saas-api",
    message: "Use /health for readiness or the documented API routes.",
  });
});

registerTenantRoutes(app);
registerFlowRoutes(app);
registerAttendantRoutes(app);
registerLabelRoutes(app);
registerAuthRoutes(app);
registerQueueRoutes(app);
registerTypebotRoutes(app);

app.get("/r/:code", (req, res) => {
  const code = String(req.params.code ?? "").trim();
  if (!code) return res.status(404).send("Não encontrado");
  const flow = flowRepository.findByShortShareCode(code);
  if (!flow) return res.status(404).send("Link não encontrado ou expirado.");
  return res.redirect(302, flow.url);
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type?: string }).type === "entity.too.large"
  ) {
    return res.status(413).json({ message: "Payload too large. Reduce image size and try again." });
  }

  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: "Invalid input", issues: err.issues });
  }

  if (err instanceof SyntaxError && "status" in (err as object)) {
    const status = Number((err as unknown as { status?: number }).status ?? 0);
    if (status === 400) {
      return res.status(400).json({ message: "Invalid JSON body in request" });
    }
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
});

async function startApi(): Promise<void> {
  enforceProductionAuthEnv();
  await bootstrapAuthDataFromDatabase();
  logAuthPersistenceMode();
  await seedTenantOnEmptyIfConfigured();
  await ensureSystemMasterAuthIfConfigured();

  const dataMarker = getDataFilePath("saved-flows.json");
  if (String(process.env.NODE_ENV ?? "").toLowerCase() === "production") {
    const flowsTotal = flowRepository.listAll().length;
    const tenantsTotal = tenantRepository.list().length;
    if (tenantsTotal > 0 && flowsTotal === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[saas-data] AVISO: biblioteca de fluxos vazia (${flowsTotal}) com ${tenantsTotal} assinante(s). Se antes havia fluxos, ` +
          `redeploy sem volume pode ter apagado JSON no contentor. Persistência esperada próximo de: ${dataMarker}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `[saas-data] Dados operacionais (fluxos/fila/bibliotecas): JSON em disco. Postgres cobre apenas auth/tenants conforme DATABASE_URL. ` +
        `Garantir volume Easypanel na pasta da API onde fica saved-flows.json.`,
    );
  }

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API running on http://localhost:${port}`);

    if (TYPEBOT_AUTO_SYNC_ACTIVE_MASTER_FLOWS) {
      // Primeiro ciclo pouco após subir a API; depois segue intervalo contínuo.
      setTimeout(() => {
        void runMasterAutoSync();
      }, 5000);
      setInterval(() => {
        void runMasterAutoSync();
      }, Math.max(20000, TYPEBOT_AUTO_SYNC_INTERVAL_MS));
    }

    if (TYPEBOT_TENANT_FLOW_WATCHER_ENABLED) {
      const watcherIntervalMs = Math.min(8000, Math.max(5000, TYPEBOT_TENANT_FLOW_WATCHER_INTERVAL_MS));
      if (!TYPEBOT_TARGET_BUILDER_API_TOKEN) {
        // eslint-disable-next-line no-console
        console.warn(
          "[typebot-tenant-flow-sync] TYPEBOT_TARGET_BUILDER_API_TOKEN ou TYPEBOT_BUILDER_API_TOKEN ausente; importacao automatica de fluxos do workspace fica desativada.",
        );
      }
      // Captura novos fluxos criados/publicados no Typebot do assinante sem depender de ação manual no painel.
      setTimeout(() => {
        void runTenantFlowWatcher();
      }, 5000);
      setInterval(() => {
        void runTenantFlowWatcher();
      }, watcherIntervalMs);
      // eslint-disable-next-line no-console
      console.log(`[typebot-tenant-flow-sync] enabled intervalMs=${watcherIntervalMs}`);
    }
  });
}

void startApi().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("API failed to start:", err);
  process.exit(1);
});
