import type { Express } from "express";
import { z } from "zod";
import { syncSourceWorkspaceFlowsToMasterTenant } from "../flows/source-master-sync.service";
import { probeFlowUrlStatus } from "../lib/flow-url-health";

const flowStatusSchema = z.object({
  url: z.string().url(),
});

export const registerTypebotRoutes = (app: Express) => {
  const webhookSecret = String(process.env.TYPEBOT_MASTER_FLOWS_WEBHOOK_SECRET ?? "").trim();

  app.post("/api/typebot/webhooks/master-active-flows", async (req, res) => {
    if (webhookSecret) {
      const token = String(req.headers["x-webhook-secret"] ?? req.query?.secret ?? "").trim();
      if (!token || token !== webhookSecret) {
        return res.status(401).json({ message: "Webhook unauthorized." });
      }
    }

    const result = await syncSourceWorkspaceFlowsToMasterTenant();
    return res.status(200).json({
      status: "ok",
      syncedToMasterLibrary: result.created,
      activeCount: result.active,
      checkedAt: new Date().toISOString(),
    });
  });

  app.get("/api/typebot/flow-status", async (req, res) => {
    try {
      const { url } = flowStatusSchema.parse(req.query);
      const probe = await probeFlowUrlStatus(url);
      return res.status(200).json({
        status: probe.status,
        httpStatus: probe.httpStatus,
        resolvedUrl: probe.resolvedUrl,
        fallbackUrl: probe.fallbackUrl,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(200).json({
        status: "inactive",
        httpStatus: null,
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
