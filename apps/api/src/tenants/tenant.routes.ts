import type { Express } from "express";
import {
  attendantRepository,
  flowRepository,
  labelRepository,
  priorityRepository,
  kanbanRepository,
  queueRepository,
  tenantRepository,
} from "../lib/repositories";
import {
  TenantService,
  createTenantSchema,
  updateTenantSchema,
  updateTenantProfileImageSchema,
  updateTenantStatusSchema,
  updateTenantChatThemeSchema,
} from "./tenant.service";
import { deliverTenantWelcomeEmail } from "../mail/tenant-welcome-delivery";
import { z } from "zod";
import { FlowService } from "../flows/flow.service";
import { listSystemMasterLibrary } from "../flows/system-master-library.repository";
import { ensureSubscriberSavedFlowsFromDefaults } from "../flows/subscriber-default-flows.service";
import { syncSystemDefaultsToRealTypebotWorkspace } from "../typebot/typebot-builder.service";
import { recoverTenantWorkspaceTypebotsFromVestiges } from "../typebot/recover-tenant-workspace-typebots.service";
import { repairTenantTypebotMediaOnTarget } from "../typebot/typebot-media-repair.service";
import {
  importManualWorkspaceTypebotsIntoTenantFlows,
  refreshTenantFlowViewerUrls,
  refreshTenantWorkspaceFlowUrlsFromTypebot,
} from "../typebot/typebot-flow-viewer-url-sync";
import { isAuthPostgresEnabled, loadTenantsFromPostgres } from "../lib/auth-postgres";

const tenantService = new TenantService(
  tenantRepository,
  attendantRepository,
  flowRepository,
  queueRepository,
  labelRepository,
  priorityRepository,
  kanbanRepository,
);
const flowService = new FlowService(flowRepository);

export const registerTenantRoutes = (app: Express) => {
  app.get("/api/public/tenants/:id/logo", (req, res) => {
    const tenant = tenantRepository.getById(String(req.params.id ?? "").trim());
    if (!tenant?.profileImageUrl) return res.status(404).send("Logo not found");
    const raw = String(tenant.profileImageUrl).trim();
    const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      // Se já for URL pública, redireciona.
      if (/^https?:\/\//i.test(raw)) return res.redirect(302, raw);
      return res.status(400).send("Invalid logo format");
    }
    const [, mime, payload] = match;
    try {
      const buffer = Buffer.from(payload, "base64");
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).send(buffer);
    } catch {
      return res.status(400).send("Invalid logo payload");
    }
  });

  app.get("/api/public/tenants/:id/share-image", (req, res) => {
    const tenant = tenantRepository.getById(String(req.params.id ?? "").trim());
    if (!tenant?.shareImageUrl) return res.status(404).send("Share image not found");
    const raw = String(tenant.shareImageUrl).trim();
    const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      // Se já for URL pública, redireciona.
      if (/^https?:\/\//i.test(raw)) return res.redirect(302, raw);
      return res.status(400).send("Invalid share image format");
    }
    const [, mime, payload] = match;
    try {
      const buffer = Buffer.from(payload, "base64");
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).send(buffer);
    } catch {
      return res.status(400).send("Invalid share image payload");
    }
  });

  app.get("/api/master/typebot/capabilities", (_req, res) => {
    return res.status(200).json(tenantService.getTypebotCapabilities());
  });

  app.post("/api/master/tenants", async (req, res) => {
    try {
      const input = createTenantSchema.parse(req.body);
      const tenant = tenantService.create(input);
      const systemDefaultItems = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
      for (const item of systemDefaultItems) {
        try {
          flowService.create(tenant.id, {
            nickname: item.suggestedNickname.trim(),
            displayLabel: item.title.trim(),
            url: item.viewerUrl.trim(),
            librarySourceId: item.id,
          });
        } catch {
          // ignora item duplicado/inválido para não bloquear criação do assinante
        }
      }
      try {
        await syncSystemDefaultsToRealTypebotWorkspace(tenant.id, systemDefaultItems);
      } catch (syncError) {
        tenantRepository.updateTypebotProvision(tenant.id, {
          typebotProvisionStatus: "failed",
          typebotProvisionError: syncError instanceof Error ? syncError.message : "Falha ao sincronizar Typebot real.",
          typebotLastSyncAt: new Date().toISOString(),
        });
      }
      const emailDelivery = await deliverTenantWelcomeEmail({
        ownerEmail: tenant.ownerEmail,
        recipientName: tenant.name,
        initialPassword: input.initialPassword,
      });

      return res.status(201).json({
        ...tenant,
        emailDelivery,
      });
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/master/tenants", async (_req, res) => {
    let tenants = tenantService.list();
    if (tenants.length === 0) {
      if (isAuthPostgresEnabled()) {
        try {
          const rows = await loadTenantsFromPostgres();
          tenantRepository.hydrate(rows);
          tenants = tenantService.list();
        } catch {
          // best-effort: segue para fallback por attendants
        }
      }
    }
    if (tenants.length === 0) {
      try {
        await attendantRepository.reloadFromStorage();
      } catch {
        // best-effort: tenta reconstruir com snapshot já em memória
      }
      const fallbackMasters = attendantRepository
        .listAll()
        .filter((attendant) => attendant.role === "master" && String(attendant.tenantId ?? "").trim().length > 0);

      for (const attendant of fallbackMasters) {
        const tenantId = String(attendant.tenantId ?? "").trim();
        if (!tenantId || tenantRepository.getById(tenantId)) continue;
        const ownerEmail = String(attendant.email ?? attendant.username ?? "").trim().toLowerCase();
        tenantRepository.create({
          id: tenantId,
          name: attendant.displayName?.trim() || tenantId,
          ownerEmail,
          whatsapp: "",
          accessRole: "master",
          status: "active",
          createdAt: attendant.createdAt || new Date().toISOString(),
        });
      }
      tenants = tenantService.list();
    }
    return res.status(200).json(tenants);
  });

  app.patch("/api/master/tenants/:id/status", (req, res) => {
    const input = updateTenantStatusSchema.parse(req.body);
    const tenant = tenantService.updateStatus(req.params.id, input.status);

    if (!tenant) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    return res.status(200).json(tenant);
  });

  app.patch("/api/master/tenants/:id/profile-image", (req, res) => {
    try {
      const input = updateTenantProfileImageSchema.parse(req.body);
      const tenant = tenantService.patchLeadChatProfile(req.params.id, input);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      // Sempre que a logo for definida/alterada, reaplica tema/avatar nos flows padrão do tenant.
      if (input.profileImageUrl !== undefined) {
        const systemDefaultItems = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
        void syncSystemDefaultsToRealTypebotWorkspace(tenant.id, systemDefaultItems, { overwriteExisting: false }).catch(
          (syncError) => {
            // eslint-disable-next-line no-console
            console.error("Falha ao reaplicar avatar/metadata após update de logo do tenant:", syncError);
          },
        );
      }
      return res.status(200).json(tenant);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.patch("/api/master/tenants/:id/chat-theme", (req, res) => {
    try {
      const input = updateTenantChatThemeSchema.parse(req.body);
      const tenant = tenantService.updateChatTheme(req.params.id, input);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      return res.status(200).json(tenant);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.patch("/api/master/tenants/:id", (req, res) => {
    const input = updateTenantSchema.parse(req.body);
    const tenant = tenantService.update(req.params.id, input);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    return res.status(200).json(tenant);
  });

  app.post("/api/master/tenants/:id/resend-welcome", async (req, res) => {
    try {
      const tenant = tenantRepository.getById(String(req.params.id ?? "").trim());
      if (!tenant) return res.status(404).json({ message: "Assinante não encontrado." });
      const masterAttendant = attendantRepository
        .listByTenant(tenant.id)
        .find((row) => row.role === "master");
      const storedPassword = String(masterAttendant?.welcomePassword ?? "").trim();
      if (!storedPassword) {
        return res.status(409).json({
          message:
            "Senha original não está registrada para este assinante. Cadastre novamente ou use redefinir senha no login.",
          emailDelivery: {
            status: "skipped",
            message: "Senha original indisponível no cadastro.",
          },
        });
      }
      const emailDelivery = await deliverTenantWelcomeEmail({
        ownerEmail: tenant.ownerEmail,
        recipientName: tenant.name,
        initialPassword: storedPassword,
      });
      return res.status(200).json({
        ok: true,
        ownerEmail: tenant.ownerEmail,
        emailDelivery,
      });
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.delete("/api/master/tenants/:id", (req, res) => {
    const ok = tenantService.delete(req.params.id);
    if (!ok) return res.status(404).json({ message: "Tenant not found" });
    return res.status(204).send();
  });

  const syncWorkspaceFlowsHandler = async (req: { params: { id?: string } }, res: import("express").Response) => {
    const tenant = tenantRepository.getById(String(req.params.id ?? "").trim());
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    try {
      const recovery = await recoverTenantWorkspaceTypebotsFromVestiges(tenant.id);
      const systemDefaultItems = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
      if (systemDefaultItems.length > 0) {
        await syncSystemDefaultsToRealTypebotWorkspace(tenant.id, systemDefaultItems, { overwriteExisting: false });
      }
      const importResult = await importManualWorkspaceTypebotsIntoTenantFlows(tenant.id);
      await ensureSubscriberSavedFlowsFromDefaults(tenant.id, systemDefaultItems);
      await refreshTenantWorkspaceFlowUrlsFromTypebot(tenant.id);
      await refreshTenantFlowViewerUrls(tenant.id);
      let typebotMediaRepair: Awaited<ReturnType<typeof repairTenantTypebotMediaOnTarget>> | null = null;
      try {
        typebotMediaRepair = await repairTenantTypebotMediaOnTarget(tenant.id);
      } catch (repairError) {
        console.warn(
          "[sync-workspace-flows] repair typebot media:",
          repairError instanceof Error ? repairError.message : repairError,
        );
      }
      const refreshed = tenantRepository.getById(tenant.id);
      const flows = flowService.listByTenant(tenant.id);
      const hint =
        importResult.skipReason === "workspaces_list_empty"
          ? "A Builder API nao retornou workspaces. Confira TYPEBOT_BUILDER_API_BASE_URL (com /api), TYPEBOT_BUILDER_API_TOKEN e acesso ao workspace do assinante."
          : importResult.skipReason === "workspace_not_matched"
            ? "Workspaces listados, mas nenhum casou com o nome/e-mail do assinante."
            : importResult.skipReason === "viewer_base_url_missing"
              ? "Defina TYPEBOT_TARGET_VIEWER_BASE_URL (ou TYPEBOT_SOURCE_VIEWER_BASE_URL)."
              : undefined;
      return res.status(200).json({
        status: importResult.skipReason && importResult.imported === 0 ? "partial" : "ok",
        tenantId: tenant.id,
        typebotProvisionStatus: refreshed?.typebotProvisionStatus ?? null,
        flowCount: flows.length,
        hint,
        recovery,
        typebotMediaRepair,
        ...importResult,
        workspaceId: refreshed?.typebotWorkspaceId ?? importResult.workspaceId ?? null,
        workspaceName: refreshed?.typebotWorkspaceName ?? importResult.workspaceName ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sincronizar fluxos do workspace Typebot.";
      return res.status(500).json({
        status: "failed",
        message,
      });
    }
  };

  app.get("/api/master/tenants/:id/typebot/sync-workspace-flows", syncWorkspaceFlowsHandler);
  app.post("/api/master/tenants/:id/typebot/sync-workspace-flows", syncWorkspaceFlowsHandler);

  app.post("/api/master/tenants/:id/typebot/recover-workspace-flows", async (req, res) => {
    const tenant = tenantRepository.getById(String(req.params.id ?? "").trim());
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    try {
      const recovery = await recoverTenantWorkspaceTypebotsFromVestiges(tenant.id);
      const flows = flowService.listByTenant(tenant.id);
      return res.status(200).json({ status: "ok", flowCount: flows.length, recovery });
    } catch (error) {
      return res.status(500).json({
        status: "failed",
        message: error instanceof Error ? error.message : "Falha na recuperação de fluxos Typebot.",
      });
    }
  });

  app.post("/api/master/tenants/:id/typebot/repair-media", async (req, res) => {
    const tenant = tenantRepository.getById(String(req.params.id ?? "").trim());
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    try {
      const result = await repairTenantTypebotMediaOnTarget(tenant.id);
      return res.status(200).json({ status: "ok", ...result });
    } catch (error) {
      return res.status(500).json({
        status: "failed",
        message: error instanceof Error ? error.message : "Falha ao reparar mídia Typebot.",
      });
    }
  });

  app.post("/api/master/tenants/:id/typebot/sync-defaults", async (req, res) => {
    const tenant = tenantRepository.getById(req.params.id);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    const systemDefaultItems = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
    const masterWorkspaceSync = String(process.env.TYPEBOT_SOURCE_MASTER_WORKSPACE_ID ?? "").trim();
    if (systemDefaultItems.length === 0 && !masterWorkspaceSync) {
      return res.status(200).json({
        status: "skipped",
        message:
          "Nenhum fluxo padrão na Biblioteca Master e TYPEBOT_SOURCE_MASTER_WORKSPACE_ID não configurado.",
      });
    }
    try {
      await syncSystemDefaultsToRealTypebotWorkspace(tenant.id, systemDefaultItems, { overwriteExisting: false });
      await ensureSubscriberSavedFlowsFromDefaults(tenant.id, systemDefaultItems);
      const refreshed = tenantRepository.getById(tenant.id);
      return res.status(200).json({
        status: "ok",
        tenantId: tenant.id,
        workspaceId: refreshed?.typebotWorkspaceId ?? null,
        accessUrl: refreshed?.typebotAccessUrl ?? null,
        syncAt: refreshed?.typebotLastSyncAt ?? null,
        syncSummary: refreshed?.typebotProvisionError ?? "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sincronizar Typebot real.";
      tenantRepository.updateTypebotProvision(tenant.id, {
        typebotProvisionStatus: "failed",
        typebotProvisionError: message,
        typebotLastSyncAt: new Date().toISOString(),
      });
      return res.status(500).json({
        status: "failed",
        message,
      });
    }
  });

};
