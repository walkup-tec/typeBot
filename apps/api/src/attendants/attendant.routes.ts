import type { Express } from "express";
import { z } from "zod";
import { attendantRepository, tenantRepository } from "../lib/repositories";
import { deliverAttendantWelcomeEmail } from "../mail/attendant-welcome-delivery";
import { AttendantService, createAttendantSchema, hashAttendantPassword } from "./attendant.service";

const attendantService = new AttendantService(attendantRepository);

const resendAttendantWelcomeSchema = z.object({
  password: z.string().min(4).max(200),
});

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
      const tenantName = tenantRepository.getById(req.params.tenantId)?.name?.trim() || "Walkup";
      const toEmail = String(persisted?.email ?? created.email ?? "").trim();
      const emailDelivery = await deliverAttendantWelcomeEmail({
        toEmail,
        recipientName: registeredName || created.username,
        userIdentifier: created.username,
        password: input.password,
        createdByLabel: tenantName,
      });

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

  app.post("/api/master/tenants/:tenantId/attendants/:attendantId/resend-welcome", async (req, res) => {
    try {
      const tenantId = String(req.params.tenantId ?? "").trim();
      const attendantId = String(req.params.attendantId ?? "").trim();
      const tenant = tenantRepository.getById(tenantId);
      if (!tenant) return res.status(404).json({ message: "Assinante não encontrado." });

      const attendant = attendantRepository.listByTenant(tenantId).find((row) => row.id === attendantId);
      if (!attendant) return res.status(404).json({ message: "Atendente não encontrado." });

      const input = resendAttendantWelcomeSchema.parse(req.body);
      attendantRepository.updateById(attendant.id, {
        passwordHash: hashAttendantPassword(input.password),
      });

      const emailDelivery = await deliverAttendantWelcomeEmail({
        toEmail: String(attendant.email ?? "").trim(),
        recipientName: String(attendant.displayName || attendant.username).trim(),
        userIdentifier: attendant.username,
        password: input.password,
        createdByLabel: tenant.name,
      });

      return res.status(200).json({
        ok: true,
        email: attendant.email ?? null,
        username: attendant.username,
        emailDelivery,
      });
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.delete("/api/master/tenants/:tenantId/attendants/:attendantId", (req, res) => {
    const ok = attendantService.delete(req.params.tenantId, req.params.attendantId);
    if (!ok) return res.status(404).json({ message: "Attendant not found" });
    return res.status(204).send();
  });
};
