import type { Express } from "express";
import { attendantRepository, flowRepository, queueRepository, tenantRepository } from "../lib/repositories";
import {
  TenantService,
  createTenantSchema,
  updateTenantSchema,
  updateTenantProfileImageSchema,
  updateTenantStatusSchema,
  updateTenantChatThemeSchema,
} from "./tenant.service";
import { mailService } from "../mail/mail.service";
import { buildTenantWelcomeTemplate } from "../mail/mail.templates";
import { FlowService } from "../flows/flow.service";
import { listSystemMasterLibrary } from "../flows/system-master-library.repository";
import { syncSystemDefaultsToRealTypebotWorkspace } from "../typebot/typebot-builder.service";

const tenantService = new TenantService(tenantRepository, attendantRepository, flowRepository, queueRepository);
const flowService = new FlowService(flowRepository);
const SYSTEM_LOGIN_URL = String(process.env.SYSTEM_LOGIN_URL ?? "http://localhost:5173").trim();

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
      let emailDelivery: { status: "sent" | "failed" | "skipped"; message?: string } = {
        status: "skipped",
      };

      if (mailService.isConfigured() && tenant.ownerEmail) {
        const recipientName = String(tenant.name || tenant.ownerEmail).trim();
        const mail = buildTenantWelcomeTemplate({
          recipientName,
          tenantName: tenant.name,
          ownerEmail: tenant.ownerEmail,
          initialPassword: input.initialPassword,
          loginUrl: SYSTEM_LOGIN_URL,
        });
        try {
          const delivery = await mailService.send({
            to: tenant.ownerEmail,
            subject: mail.subject,
            html: mail.html,
          });
          const acceptedRecipients = delivery.accepted.map((item) => item.trim().toLowerCase());
          const expectedRecipient = tenant.ownerEmail.trim().toLowerCase();
          if (acceptedRecipients.includes(expectedRecipient)) {
            emailDelivery = {
              status: "sent",
              message: `SMTP accepted. messageId=${delivery.messageId || "n/a"}`,
            };
          } else {
            emailDelivery = {
              status: "failed",
              message: `SMTP não confirmou aceitação do destinatário. messageId=${delivery.messageId || "n/a"} response=${delivery.response || "n/a"}`,
            };
          }
        } catch (emailError) {
          const reason = emailError instanceof Error ? emailError.message : "Falha no envio SMTP.";
          emailDelivery = { status: "failed", message: reason };
          // eslint-disable-next-line no-console
          console.error("Falha ao enviar e-mail de boas-vindas do assinante:", emailError);
        }
      } else if (!mailService.isConfigured()) {
        emailDelivery = { status: "skipped", message: "SMTP não configurado." };
      }

      return res.status(201).json({
        ...tenant,
        emailDelivery,
      });
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/master/tenants", (_req, res) => {
    return res.status(200).json(tenantService.list());
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
        void syncSystemDefaultsToRealTypebotWorkspace(tenant.id, systemDefaultItems, { overwriteExisting: true }).catch(
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

  app.delete("/api/master/tenants/:id", (req, res) => {
    const ok = tenantService.delete(req.params.id);
    if (!ok) return res.status(404).json({ message: "Tenant not found" });
    return res.status(204).send();
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
      await syncSystemDefaultsToRealTypebotWorkspace(tenant.id, systemDefaultItems, { overwriteExisting: true });
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
