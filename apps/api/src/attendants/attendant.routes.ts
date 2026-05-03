import type { Express } from "express";
import { attendantRepository } from "../lib/repositories";
import { tenantRepository } from "../lib/repositories";
import { AttendantService, createAttendantSchema } from "./attendant.service";
import { mailService } from "../mail/mail.service";
import { buildWelcomeCredentialsTemplate } from "../mail/mail.templates";

const attendantService = new AttendantService(attendantRepository);
const SYSTEM_LOGIN_URL = String(process.env.SYSTEM_LOGIN_URL ?? "http://localhost:5173").trim();

export const registerAttendantRoutes = (app: Express) => {
  app.get("/api/master/tenants/:tenantId/attendants", (req, res) => {
    return res.status(200).json(attendantService.listByTenant(req.params.tenantId));
  });

  app.post("/api/master/tenants/:tenantId/attendants", async (req, res) => {
    try {
      const input = createAttendantSchema.parse(req.body);
      const created = attendantService.create(req.params.tenantId, input);
      const persisted = attendantRepository
        .listByTenant(req.params.tenantId)
        .find((row) => row.id === created.id);
      const registeredName = String(persisted?.displayName || created.displayName || created.username).trim();
      let emailDelivery: { status: "sent" | "failed" | "skipped"; message?: string } = {
        status: "skipped",
      };

      if (mailService.isConfigured() && created.email) {
        const tenantName =
          tenantRepository.getById(req.params.tenantId)?.name?.trim() ||
          "Walkup";
        const mail = buildWelcomeCredentialsTemplate({
          recipientName: registeredName || created.username,
          userIdentifier: created.username,
          password: input.password,
          loginUrl: SYSTEM_LOGIN_URL,
          createdByLabel: tenantName,
        });
        try {
          const delivery = await mailService.send({
            to: created.email,
            subject: mail.subject,
            html: mail.html,
          });
          const expectedRecipient = created.email.trim().toLowerCase();
          const acceptedRecipients = delivery.accepted.map((item) => item.trim().toLowerCase());
          const isAccepted = acceptedRecipients.includes(expectedRecipient);
          if (!isAccepted) {
            emailDelivery = {
              status: "failed",
              message: `SMTP não confirmou aceitação do destinatário. messageId=${delivery.messageId || "n/a"} response=${delivery.response || "n/a"}`,
            };
          } else {
            emailDelivery = {
              status: "sent",
              message: `SMTP accepted. messageId=${delivery.messageId || "n/a"}`,
            };
          }
        } catch (emailError) {
          const reason = emailError instanceof Error ? emailError.message : "Falha no envio SMTP.";
          emailDelivery = { status: "failed", message: reason };
          // eslint-disable-next-line no-console
          console.error("Falha ao enviar e-mail de boas-vindas:", emailError);
        }
      } else if (!mailService.isConfigured()) {
        emailDelivery = { status: "skipped", message: "SMTP não configurado." };
      } else if (!created.email) {
        emailDelivery = { status: "skipped", message: "Usuário sem e-mail cadastrado." };
      }

      return res.status(201).json({
        ...created,
        emailDelivery,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Já existe um usuário")) {
        return res.status(409).json({ message: error.message });
      }
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.delete("/api/master/tenants/:tenantId/attendants/:attendantId", (req, res) => {
    const ok = attendantService.delete(req.params.tenantId, req.params.attendantId);
    if (!ok) return res.status(404).json({ message: "Attendant not found" });
    return res.status(204).send();
  });
};
