import type { Express } from "express";
import { z } from "zod";
import { attendantRepository, tenantRepository } from "../lib/repositories";
import { hashAttendantPassword, verifyAttendantPassword } from "../attendants/attendant.service";
import { mailService } from "../mail/mail.service";
import { buildPasswordResetNoticeTemplate } from "../mail/mail.templates";

const SYSTEM_MASTER_EMAIL = "walkup@walkuptec.com.br";

const loginSchema = z.object({
  username: z.string().min(2).max(80),
  password: z.string().min(4).max(200),
});

const resetPasswordSchema = z.object({
  username: z.string().min(2).max(80),
  email: z.string().email().max(160),
  newPassword: z.string().min(4).max(200),
});

const toMasterProfile = (tenantOwnerEmail: string | undefined): "system_master" | "subscriber_master" => {
  const email = String(tenantOwnerEmail ?? "")
    .trim()
    .toLowerCase();
  if (email === SYSTEM_MASTER_EMAIL) return "system_master";
  return "subscriber_master";
};

export const registerAuthRoutes = (app: Express) => {
  app.post("/api/auth/login", (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      const attendant = attendantRepository.findByUsernameOrEmailGlobal(input.username);
      if (!attendant) {
        return res.status(401).json({ message: "Usuário ou senha inválidos." });
      }
      const isValid = verifyAttendantPassword(input.password, attendant.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Usuário ou senha inválidos." });
      }
      const tenant = tenantRepository.getById(attendant.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Assinante não encontrado para este usuário." });
      }
      return res.status(200).json({
        user: {
          id: attendant.id,
          tenantId: attendant.tenantId,
          username: attendant.username,
          email: attendant.email ?? tenant.ownerEmail,
          displayName: attendant.displayName,
          role: attendant.role,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          ownerEmail: tenant.ownerEmail,
        },
        masterProfile: toMasterProfile(tenant.ownerEmail),
      });
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const input = resetPasswordSchema.parse(req.body);
      const attendant = attendantRepository.findByUsernameOrEmailGlobal(input.username);
      if (!attendant) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }
      const tenant = tenantRepository.getById(attendant.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Assinante não encontrado para este usuário." });
      }

      const providedEmail = input.email.trim().toLowerCase();
      const expectedEmail = (attendant.email || tenant.ownerEmail || "").trim().toLowerCase();
      if (!expectedEmail || providedEmail !== expectedEmail) {
        return res.status(400).json({ message: "O e-mail informado não corresponde ao cadastro do usuário." });
      }

      const updated = attendantRepository.updateById(attendant.id, {
        passwordHash: hashAttendantPassword(input.newPassword),
        email: expectedEmail,
      });
      if (!updated) {
        return res.status(500).json({ message: "Não foi possível redefinir a senha." });
      }

      if (mailService.isConfigured()) {
        const mail = buildPasswordResetNoticeTemplate({
          recipientName: attendant.displayName,
          username: attendant.username,
          tenantName: tenant.name,
        });
        try {
          await mailService.send({
            to: expectedEmail,
            subject: mail.subject,
            html: mail.html,
          });
        } catch (emailError) {
          // eslint-disable-next-line no-console
          console.error("Falha ao enviar e-mail de redefinição:", emailError);
        }
      }

      return res.status(200).json({ message: "Senha redefinida com sucesso." });
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });
};
