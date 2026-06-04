import type { Express } from "express";
import { z } from "zod";
import { syncSourceWorkspaceFlowsToMasterTenant } from "../flows/source-master-sync.service";
import { probeFlowUrlStatus } from "../lib/flow-url-health";
import { resolveFlowActiveStatus } from "../lib/typebot-flow-publish-status";

const flowStatusSchema = z.object({
  url: z.string().url(),
  typebotRemoteId: z.string().max(120).optional(),
  typebotPublicId: z.string().max(200).optional(),
  typebotWorkspaceId: z.string().max(120).optional(),
  librarySourceId: z.string().max(120).optional(),
  displayLabel: z.string().max(200).optional(),
  nickname: z.string().max(200).optional(),
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
      const { url, typebotRemoteId, typebotPublicId, typebotWorkspaceId, librarySourceId, displayLabel, nickname } =
        flowStatusSchema.parse(req.query);
      const probe = await probeFlowUrlStatus(url);
      const activeStatus = await resolveFlowActiveStatus({
        url,
        typebotRemoteId,
        typebotPublicId,
        typebotWorkspaceId,
        librarySourceId,
        displayLabel,
        nickname,
      });
      const typebotPublished = activeStatus.typebotPublished;
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
