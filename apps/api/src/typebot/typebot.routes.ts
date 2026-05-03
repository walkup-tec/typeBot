import type { Express } from "express";
import { z } from "zod";
import { syncSourceWorkspaceFlowsToMasterTenant } from "../flows/source-master-sync.service";

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

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
        });

        // Em alguns hosts o viewer pode responder 3xx/401/403 para bots/healthcheck,
        // mas ainda estar funcional para uso humano no link público.
        const isActive =
          (response.status >= 200 && response.status < 400) ||
          response.status === 401 ||
          response.status === 403 ||
          response.status === 405;
        return res.status(200).json({
          status: isActive ? "active" : "inactive",
          httpStatus: response.status,
          checkedAt: new Date().toISOString(),
        });
      } finally {
        clearTimeout(timeout);
      }
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
