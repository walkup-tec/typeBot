import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { attendantRepository, tenantRepository } from "../lib/repositories";
import { hashAttendantPassword, verifyAttendantPassword } from "../attendants/attendant.service";
import { mailService } from "../mail/mail.service";
import { buildPasswordResetNoticeTemplate } from "../mail/mail.templates";
import type { Attendant } from "../attendants/attendant.repository";

const SYSTEM_MASTER_EMAIL = "walkup@walkuptec.com.br";

const loginSchema = z.object({
  username: z.string().min(2).max(80),
  password: z.string().min(4).max(200),
});

const resetPasswordSchema = z.object({
  email: z.string().email().max(160),
  newPassword: z.string().min(4).max(200),
});

const resolveAttendantForResetByEmail = (emailRaw: string) => {
  const emailKey = emailRaw.trim().toLowerCase();
  const byAttendantEmail = attendantRepository.findByEmailGlobal(emailKey);
  if (byAttendantEmail) return byAttendantEmail;
  for (const tenant of tenantRepository.list()) {
    if (tenant.ownerEmail.trim().toLowerCase() !== emailKey) continue;
    const inTenant = attendantRepository.listByTenant(tenant.id);
    const master = inTenant.find((a) => a.role === "master");
    if (master) return master;
    if (inTenant[0]) return inTenant[0];
  }
  return null;
};

/** Login com e-mail do titular mesmo quando o master não tem esse e-mail no registo do atendente. */
const resolveAttendantForLogin = (identifierRaw: string): Attendant | null => {
  const byCredential = attendantRepository.findByUsernameOrEmailGlobal(identifierRaw);
  if (byCredential) return byCredential;
  const emailKey = identifierRaw.trim().toLowerCase();
  if (!emailKey) return null;
  for (const tenant of tenantRepository.list()) {
    if (tenant.ownerEmail.trim().toLowerCase() !== emailKey) continue;
    const inTenant = attendantRepository.listByTenant(tenant.id);
    const master = inTenant.find((a) => a.role === "master");
    if (master) return master;
    if (inTenant[0]) return inTenant[0];
  }
  return null;
};

const ensureMasterAttendantForOwnerEmail = (emailRaw: string, newPassword: string): Attendant | null => {
  const emailKey = emailRaw.trim().toLowerCase();
  for (const tenant of tenantRepository.list()) {
    if (tenant.ownerEmail.trim().toLowerCase() !== emailKey) continue;
    const existing = attendantRepository.listByTenant(tenant.id);
    const existingMaster = existing.find((a) => a.role === "master");
    if (existingMaster) return existingMaster;

    // Recupera acesso do titular quando a base de atendentes foi perdida no servidor.
    const created: Attendant = {
      id: randomUUID(),
      tenantId: tenant.id,
      username: emailKey,
      email: emailKey,
      displayName: tenant.name?.trim() || "Master",
      passwordHash: hashAttendantPassword(newPassword),
      role: "master",
      createdAt: new Date().toISOString(),
    };
    attendantRepository.create(created);
    return created;
  }
  return null;
};

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
      const attendant = resolveAttendantForLogin(input.username);
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
      const attendant =
        resolveAttendantForResetByEmail(input.email) ?? ensureMasterAttendantForOwnerEmail(input.email, input.newPassword);
      if (!attendant) {
        return res.status(404).json({ message: "E-mail não encontrado." });
      }
      const tenant = tenantRepository.getById(attendant.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Assinante não encontrado para este usuário." });
      }

      const providedEmail = input.email.trim().toLowerCase();
      const attendantEmail = (attendant.email ?? "").trim().toLowerCase();
      const ownerEmailKey = (tenant.ownerEmail ?? "").trim().toLowerCase();
      const emailAllowed =
        (attendantEmail.length > 0 && providedEmail === attendantEmail) ||
        (ownerEmailKey.length > 0 && providedEmail === ownerEmailKey);
      if (!emailAllowed) {
        return res.status(400).json({ message: "O e-mail informado não corresponde ao cadastro do usuário." });
      }

      const updated = attendantRepository.updateById(attendant.id, {
        passwordHash: hashAttendantPassword(input.newPassword),
        email: providedEmail,
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
            to: providedEmail,
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
