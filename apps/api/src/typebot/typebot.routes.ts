import type { Express } from "express";
import { z } from "zod";
import { syncSourceWorkspaceFlowsToMasterTenant } from "../flows/source-master-sync.service";
import { probeFlowUrlStatus } from "../lib/flow-url-health";
import { isTypebotPublishedInBuilder, fetchTypebotDetailById } from "../lib/typebot-flow-publish-status";
import { typebotPublicIdFromViewerUrl } from "../lib/typebot-public-id";

const flowStatusSchema = z.object({
  url: z.string().url(),
  typebotRemoteId: z.string().max(120).optional(),
  typebotPublicId: z.string().max(200).optional(),
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
      const { url, typebotRemoteId, typebotPublicId } = flowStatusSchema.parse(req.query);
      const probe = await probeFlowUrlStatus(url);
      let publicId = String(typebotPublicId ?? "").trim() || typebotPublicIdFromViewerUrl(url);
      let detail = null;
      const remoteId = String(typebotRemoteId ?? "").trim();
      if (remoteId) {
        detail = await fetchTypebotDetailById(remoteId);
        const fromDetail = String(detail?.publicId ?? "").trim();
        if (fromDetail) publicId = fromDetail;
      }
      const typebotPublished = isTypebotPublishedInBuilder(detail, publicId);
      const status = typebotPublished || probe.status === "active" ? "active" : "inactive";
      return res.status(200).json({
        status,
        httpStatus: probe.httpStatus,
        resolvedUrl: probe.resolvedUrl,
        fallbackUrl: probe.fallbackUrl,
        typebotPublished,
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
