import "./load-env";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { registerTenantRoutes } from "./tenants/tenant.routes";
import { registerQueueRoutes } from "./queue/queue.routes";
import { registerTypebotRoutes } from "./typebot/typebot.routes";
import { registerFlowRoutes } from "./flows/flow.routes";
import { registerAttendantRoutes } from "./attendants/attendant.routes";
import { flowRepository } from "./lib/repositories";
import { registerAuthRoutes } from "./auth/auth.routes";
import { syncAllSubscriberWorkspacesFromMaster } from "./typebot/typebot-builder.service";

const app = express();
/** Traefik/Easypanel enviam `X-Forwarded-Proto`; necessário para `req.secure` e cabeçalhos HTTPS. */
app.set("trust proxy", 1);
const port = Number(process.env.PORT ?? 3333);
const TYPEBOT_AUTO_SYNC_ACTIVE_MASTER_FLOWS =
  String(process.env.TYPEBOT_AUTO_SYNC_ACTIVE_MASTER_FLOWS ?? "true").trim().toLowerCase() !== "false";
const TYPEBOT_AUTO_SYNC_INTERVAL_MS = Number(process.env.TYPEBOT_AUTO_SYNC_INTERVAL_MS ?? 20000);
let isMasterAutoSyncRunning = false;

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
  res.status(200).json({ status: "ok", service: "typebot-saas-api" });
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
});
