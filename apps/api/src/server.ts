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
import { registerPriorityRoutes } from "./priorities/priority.routes";
import { registerKanbanRoutes } from "./kanban/kanban.routes";
import { flowRepository, tenantRepository } from "./lib/repositories";
import { getDataFilePath } from "./lib/data-path";
import { registerAuthRoutes } from "./auth/auth.routes";
import { registerBillingRoutes } from "./billing/billing.routes";
import { BillingOrderRepository } from "./billing/billing-order.repository";
import { PixAutomaticRenewalService } from "./billing/pix-automatic-renewal.service";
import { syncAllSubscriberWorkspacesFromMaster } from "./typebot/typebot-builder.service";
import { importManualWorkspaceTypebotsIntoTenantFlows } from "./typebot/typebot-flow-viewer-url-sync";
import { listSystemMasterLibrary } from "./flows/system-master-library.repository";
import {
  ensureSubscriberSavedFlowsFromDefaults,
  repairAllSubscriberDefaultsOnBoot,
  repairSubscriberDefaultLibrarySourceIds,
} from "./flows/subscriber-default-flows.service";
import { seedTenantOnEmptyIfConfigured } from "./bootstrap/seed-tenant-on-empty";
import {
  countOperationalSeedFlows,
  seedOperationalDataOnEmptyIfNeeded,
} from "./bootstrap/seed-operational-data-on-empty";
import { ensureSystemMasterAuthIfConfigured } from "./bootstrap/ensure-system-master-auth";
import { ensureSystemMasterBrandingOnBoot } from "./bootstrap/ensure-system-master-branding";
import {
  bootstrapAuthDataFromDatabase,
  enforceProductionAuthEnv,
  logAuthPersistenceMode,
} from "./bootstrap/auth-data-bootstrap";
import { isAuthPostgresEnabled } from "./lib/auth-postgres";
import { API_DEPLOY_MARKER, MASTER_LIBRARY_LOGIC_VERSION } from "./deploy-marker";
import { mailService } from "./mail/mail.service";
import { logTypebotStorageEnvDiagnostics } from "./typebot/typebot-media-sanitize.service";

const app = express();
/** Traefik/Easypanel enviam `X-Forwarded-Proto`; necessário para `req.secure` e cabeçalhos HTTPS. */
app.set("trust proxy", 1);
const port = Number(process.env.PORT ?? 3333);
const host = String(process.env.HOST ?? "0.0.0.0").trim() || "0.0.0.0";
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
let isPixAutomaticRenewalRunning = false;

const billingOrderRepositoryForRenewal = new BillingOrderRepository();
const pixAutomaticRenewalService = new PixAutomaticRenewalService(billingOrderRepositoryForRenewal);
const BILLING_PIX_RENEWAL_INTERVAL_MS = Number(process.env.BILLING_PIX_RENEWAL_INTERVAL_MS ?? 43_200_000);

const runPixAutomaticRenewal = async () => {
  if (isPixAutomaticRenewalRunning) return;
  isPixAutomaticRenewalRunning = true;
  try {
    const result = await pixAutomaticRenewalService.runRenewalCycle();
    if (result.processed > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[billing-pix-automatic] processed=${result.processed} created=${result.created} skipped=${result.skipped}`,
      );
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[billing-pix-automatic] renewal cycle failed:", error);
  } finally {
    isPixAutomaticRenewalRunning = false;
  }
};

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
        const systemDefaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
        if (systemDefaults.length > 0) {
          repairSubscriberDefaultLibrarySourceIds(tenant.id);
          await ensureSubscriberSavedFlowsFromDefaults(tenant.id, systemDefaults);
        }
        if (result.imported === 0 && result.skipReason && result.skipReason !== "no_new_active_typebots") {
          // eslint-disable-next-line no-console
          console.warn(
            `[typebot-tenant-flow-sync] tenant=${tenant.id} imported=0 reason=${result.skipReason} candidates=${result.workspaceCandidates} workspaceId=${result.workspaceId || "none"}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(`[typebot-tenant-flow-sync] tenant=${tenant.id} skipped: ${message}`);
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

const DEFAULT_FRAME_ANCESTORS = [
  "'self'",
  "https://painel.chattypebot.com",
  "https://app.chattypebot.com",
  "https://chattypebot.com",
  "http://localhost:5173",
  "http://localhost:4173",
];

const resolveFrameAncestorsDirective = (): string => {
  const fromEnv = String(process.env.FRAME_ANCESTORS ?? process.env.HANDOFF_FRAME_ANCESTORS ?? "").trim();
  const list = fromEnv
    ? fromEnv.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)
    : DEFAULT_FRAME_ANCESTORS;
  return list.join(" ");
};

/** Rotas embutidas no iframe do painel (Fila ao vivo). */
const isEmbeddableChatSurface = (path: string) => path === "/handoff-view";

/**
 * Reforço HTTPS no browser: HSTS (após visita HTTPS válida), CSP upgrade-insecure-requests,
 * cabeçalhos básicos. Não substitui certificado TLS nem remove avisos de conteúdo misto no HTML de outros hosts.
 */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  const embeddable = isEmbeddableChatSurface(req.path);
  if (embeddable) {
    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors ${resolveFrameAncestorsDirective()}; upgrade-insecure-requests`,
    );
  } else {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Content-Security-Policy", "upgrade-insecure-requests");
  }

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

const probeTypebotBuilderReachability = async (): Promise<{
  url: string;
  httpStatus: number | null;
  ok: boolean;
}> => {
  const base = String(process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "")
    .trim()
    .replace(/\/api\/?$/i, "");
  const url = base ? `${base}/signin` : "";
  if (!url) return { url: "", httpStatus: null, ok: false };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal });
    clearTimeout(timeout);
    const httpStatus = response.status;
    const ok = httpStatus > 0 && httpStatus < 500;
    return { url, httpStatus, ok };
  } catch {
    return { url, httpStatus: null, ok: false };
  }
};

app.get("/health", async (_req, res) => {
  const flowsTotal = flowRepository.listAll().length;
  const tenantsTotal = tenantRepository.list().length;
  const savedFlowsPath = getDataFilePath("saved-flows.json");
  const operationalDataDirectory = dirname(savedFlowsPath);
  const typebotBuilder = await probeTypebotBuilderReachability();
  res.status(200).json({
    status: "ok",
    service: "typebot-saas-api",
    deployMarker: API_DEPLOY_MARKER,
    masterLibraryLogicVersion: MASTER_LIBRARY_LOGIC_VERSION,
    authTenantsAttendants: isAuthPostgresEnabled() ? "postgres" : "json",
    /** Postgres cobre só login/assinantes/atendentes. Fluxos, fila e bibliotecas continuam em JSON no disco. */
    flowsSavedCount: flowsTotal,
    tenantsCount: tenantsTotal,
    /** Fluxos embutidos em `apps/api/data-seed` (imagem). Se >0 e flowsSavedCount=0, o boot restaura. */
    dataSeedFlowCount: countOperationalSeedFlows(),
    operationalDataBackend: "json_filesystem",
    /** Caminho absoluto no servidor/container — monte o volume nesta pasta (contém saved-flows.json). */
    operationalDataDirectory,
    operationalSavedFlowsFile: savedFlowsPath,
    operationalDataHint:
      "Montar volume persistente no diretório de dados da API (operationalDataDirectory). Sem volume, cada redeploy recria disco e pode esvaziar a biblioteca de fluxos.",
    typebotTenantFlowWatcherEnabled: TYPEBOT_TENANT_FLOW_WATCHER_ENABLED,
    typebotTenantFlowImportConfigured: Boolean(TYPEBOT_TARGET_BUILDER_API_TOKEN),
    typebotBuilderSigninUrl: typebotBuilder.url || null,
    typebotBuilderHttpStatus: typebotBuilder.httpStatus,
    typebotBuilderReachable: typebotBuilder.ok,
    purgeExtraUsersRoute: true,
    typebotSourceMasterWorkspaceConfigured: Boolean(
      String(process.env.TYPEBOT_SOURCE_MASTER_WORKSPACE_ID ?? "").trim(),
    ),
    smtpConfigured: mailService.isConfigured(),
    mailMode: String(process.env.MAIL_MODE ?? "").trim() || null,
    tenantResendWelcomeRoute: true,
    attendantResendWelcomeRoute: true,
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
registerPriorityRoutes(app);
registerKanbanRoutes(app);
registerAuthRoutes(app);
registerBillingRoutes(app);
registerQueueRoutes(app);
registerTypebotRoutes(app);

const SOCIAL_CRAWLER_UA =
  /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Googlebot/i;

const escapeHtmlAttr = (value: string): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

app.get("/r/:code", async (req, res) => {
  const code = String(req.params.code ?? "").trim();
  if (!code) return res.status(404).send("Não encontrado");
  const flow = flowRepository.findByShortShareCode(code);
  if (!flow) return res.status(404).send("Link não encontrado ou expirado.");
  const targetUrl = String(flow.url ?? "").trim();
  if (!targetUrl) return res.status(404).send("Destino indisponível.");

  const userAgent = String(req.headers["user-agent"] ?? "");
  if (SOCIAL_CRAWLER_UA.test(userAgent)) {
    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: { "user-agent": "facebookexternalhit/1.1" },
        redirect: "follow",
      });
      const html = await response.text();
      if (response.ok && html.includes("og:title")) {
        res.setHeader("content-type", "text/html; charset=utf-8");
        return res.status(200).send(html);
      }
    } catch {
      // fallback HTML mínimo abaixo
    }
    const title = escapeHtmlAttr(flow.displayLabel ?? flow.nickname ?? "Chat");
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.status(200).send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><meta property="og:title" content="${title}"/><meta http-equiv="refresh" content="0;url=${escapeHtmlAttr(targetUrl)}"/></head><body><a href="${escapeHtmlAttr(targetUrl)}">Abrir chat</a></body></html>`,
    );
  }

  return res.redirect(302, targetUrl);
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
  const operationalSeed = await seedOperationalDataOnEmptyIfNeeded();
  await ensureSystemMasterAuthIfConfigured();
  await ensureSystemMasterBrandingOnBoot();

  const dataMarker = getDataFilePath("saved-flows.json");
  if (String(process.env.NODE_ENV ?? "").toLowerCase() === "production") {
    const flowsTotal = flowRepository.listAll().length;
    const tenantsTotal = tenantRepository.list().length;
    if (tenantsTotal > 0 && flowsTotal === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[saas-data] AVISO: biblioteca de fluxos vazia (${flowsTotal}) com ${tenantsTotal} assinante(s). Se antes havia fluxos, ` +
          `redeploy sem volume pode ter apagado JSON no contentor. Persistência esperada próximo de: ${dataMarker}. ` +
          `Com v8b+, o boot restaura de apps/api/data-seed quando tenants>0 e flows=0.`,
      );
    }
    if (operationalSeed.restored) {
      // eslint-disable-next-line no-console
      console.log(`[saas-data] Seed operacional aplicado no boot (${operationalSeed.flows} fluxo(s)).`);
    }
    // eslint-disable-next-line no-console
    console.log(
      `[saas-data] Dados operacionais (fluxos/fila/bibliotecas): JSON em disco. Postgres cobre apenas auth/tenants conforme DATABASE_URL. ` +
        `Garantir volume Easypanel na pasta da API onde fica saved-flows.json.`,
    );
  }

  app.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[saas-api] running deployMarker=${API_DEPLOY_MARKER} masterLibrary=${MASTER_LIBRARY_LOGIC_VERSION} smtpConfigured=${mailService.isConfigured()}`,
    );
    // eslint-disable-next-line no-console
    console.log(`API running on http://${host}:${port}`);
    logTypebotStorageEnvDiagnostics();

    if (TYPEBOT_AUTO_SYNC_ACTIVE_MASTER_FLOWS) {
      // Primeiro ciclo pouco após subir a API; depois segue intervalo contínuo.
      setTimeout(() => {
        void runMasterAutoSync();
      }, 5000);
      setInterval(() => {
        void runMasterAutoSync();
      }, Math.max(20000, TYPEBOT_AUTO_SYNC_INTERVAL_MS));
    }

    setTimeout(() => {
      void repairAllSubscriberDefaultsOnBoot()
        .then((result) => {
          if (result.tenants > 0) {
            // eslint-disable-next-line no-console
            console.log(
              `[subscriber-default-flows] boot repair tenants=${result.tenants} linksFixed=${result.linksFixed}`,
            );
          }
        })
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.warn("[subscriber-default-flows] boot repair failed:", error);
        });
    }, 12_000);

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

    if (
      String(process.env.BILLING_PIX_AUTOMATIC_PAYMENT_MODE ?? "SUBSCRIPTION").trim().toUpperCase() ===
      "MANUAL"
    ) {
      setTimeout(() => {
        void runPixAutomaticRenewal();
      }, 10_000);
      setInterval(() => {
        void runPixAutomaticRenewal();
      }, Math.max(3_600_000, BILLING_PIX_RENEWAL_INTERVAL_MS));
      // eslint-disable-next-line no-console
      console.log(
        `[billing-pix-automatic] renewal job enabled intervalMs=${Math.max(3_600_000, BILLING_PIX_RENEWAL_INTERVAL_MS)}`,
      );
    }
  });
}

void startApi().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("API failed to start:", err);
  process.exit(1);
});
