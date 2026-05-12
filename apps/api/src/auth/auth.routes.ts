import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { authEmailsEquivalent, extractEmailsFromLooseText, normalizeAuthIdentifier } from "../lib/auth-email";
import { attendantRepository, tenantRepository } from "../lib/repositories";
import { hashAttendantPassword, verifyAttendantPassword } from "../attendants/attendant.service";
import { mailService } from "../mail/mail.service";
import { buildPasswordResetNoticeTemplate } from "../mail/mail.templates";
import type { Attendant } from "../attendants/attendant.repository";
import type { Tenant } from "../tenants/tenant.repository";
import {
  isSystemMasterEmail,
  provisionSystemMasterForPasswordReset,
  SYSTEM_MASTER_OWNER_EMAIL,
} from "./system-master-auth";

const loginSchema = z.object({
  username: z.string().min(2).max(160),
  password: z.string().min(4).max(200),
});

const resetPasswordSchema = z.preprocess((raw: unknown) => {
  if (!raw || typeof raw !== "object") return raw;
  const body = raw as Record<string, unknown>;
  const emailRaw = body.email ?? body.username;
  return { ...body, email: typeof emailRaw === "string" ? emailRaw : body.email };
}, z.object({
  email: z.string().email().max(160),
  newPassword: z.string().min(4).max(200),
}));

const tenantOwnerLoginKeys = (tenant: Tenant): string[] => {
  const sources = [tenant.ownerEmail ?? "", tenant.typebotOwnerEmail ?? ""];
  const keys: string[] = [];
  for (const src of sources) {
    const norm = normalizeAuthIdentifier(src);
    if (norm) keys.push(norm);
    keys.push(...extractEmailsFromLooseText(src));
  }
  return [...new Set(keys.filter(Boolean))];
};

const tenantMatchesLoginKey = (tenant: Tenant, key: string): boolean => {
  const nk = normalizeAuthIdentifier(key);
  if (!nk) return false;
  return tenantOwnerLoginKeys(tenant).some((tenantKey) => authEmailsEquivalent(tenantKey, nk));
};

const resolveAttendantForResetByEmail = (emailRaw: string): Attendant | null => {
  const emailKey = normalizeAuthIdentifier(emailRaw);
  if (!emailKey) return null;

  const byStrictEmail = attendantRepository.findByEmailGlobal(emailKey);
  if (byStrictEmail) return byStrictEmail;

  const byRelaxedEmail = attendantRepository.findByEmailGlobalRelaxed(emailRaw);
  if (byRelaxedEmail) return byRelaxedEmail;

  const byUsername = attendantRepository.findByUsernameGlobal(emailKey);
  if (byUsername) return byUsername;

  const byUsernameRelaxed = attendantRepository.findByUsernameGlobalRelaxed(emailRaw);
  if (byUsernameRelaxed) return byUsernameRelaxed;

  const candidates = attendantRepository.listLoginCandidates(emailRaw);
  const masterCand = candidates.find((a) => a.role === "master");
  if (masterCand) return masterCand;
  if (candidates[0]) return candidates[0];

  for (const tenant of tenantRepository.list()) {
    if (!tenantMatchesLoginKey(tenant, emailKey)) continue;
    const inTenant = attendantRepository.listByTenant(tenant.id);
    const master = inTenant.find((a) => a.role === "master");
    if (master) return master;
    if (inTenant[0]) return inTenant[0];
  }
  return null;
};

/**
 * Candidatos ao login: contas por e-mail/username e master do assinante cujo titular (owner/typebot) coincide.
 * A palavra-passe válida escolhe entre várias linhas (ex.: username igual ao e-mail mas hash antigo + master correto).
 */
const resolveAttendantsForLogin = (identifierRaw: string): Attendant[] => {
  const key = normalizeAuthIdentifier(identifierRaw);
  if (!key) return [];

  const seen = new Set<string>();
  const out: Attendant[] = [];
  const push = (row: Attendant | undefined | null) => {
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    out.push(row);
  };

  for (const row of attendantRepository.listLoginCandidates(identifierRaw)) {
    push(row);
  }

  for (const tenant of tenantRepository.list()) {
    if (!tenantMatchesLoginKey(tenant, key)) continue;
    const inTenant = attendantRepository.listByTenant(tenant.id);
    const master = inTenant.find((a) => a.role === "master");
    if (master) push(master);
    else push(inTenant[0]);
  }

  return out;
};

const ensureMasterAttendantForOwnerEmail = (emailRaw: string, newPassword: string): Attendant | null => {
  const emailKey = normalizeAuthIdentifier(emailRaw);
  for (const tenant of tenantRepository.list()) {
    if (!tenantMatchesLoginKey(tenant, emailKey)) continue;
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
  if (email === SYSTEM_MASTER_OWNER_EMAIL) return "system_master";
  return "subscriber_master";
};

export const registerAuthRoutes = (app: Express) => {
  app.post("/api/auth/login", async (req, res) => {
    try {
      await attendantRepository.reloadFromStorage();
      const input = loginSchema.parse(req.body);
      const candidates = resolveAttendantsForLogin(input.username);
      const attendant =
        candidates.find((row) => verifyAttendantPassword(input.password, row.passwordHash)) ?? null;
      if (!attendant) {
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
      await attendantRepository.reloadFromStorage();
      const input = resetPasswordSchema.parse(req.body);
      const attendant =
        resolveAttendantForResetByEmail(input.email) ??
        ensureMasterAttendantForOwnerEmail(input.email, input.newPassword) ??
        provisionSystemMasterForPasswordReset(input.email, input.newPassword);
      if (!attendant) {
        if (isSystemMasterEmail(input.email)) {
          return res.status(404).json({
            message:
              "Master do Sistema não está cadastrado na base de autenticação. Ative API_ALLOW_SYSTEM_MASTER_RESET_PROVISION na API ou configure API_ENSURE_SYSTEM_MASTER no Easypanel.",
          });
        }
        return res.status(404).json({ message: "E-mail não encontrado." });
      }
      const tenant = tenantRepository.getById(attendant.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Assinante não encontrado para este usuário." });
      }

      const providedEmail = normalizeAuthIdentifier(input.email);
      const attendantEmail = normalizeAuthIdentifier(attendant.email ?? "");
      const usernameKey = normalizeAuthIdentifier(attendant.username);
      const tenantKeys = tenantOwnerLoginKeys(tenant);
      const emailAllowed =
        (attendantEmail.length > 0 && authEmailsEquivalent(attendantEmail, providedEmail)) ||
        tenantKeys.some((tk) => authEmailsEquivalent(tk, providedEmail)) ||
        (usernameKey.length > 0 && authEmailsEquivalent(usernameKey, providedEmail));
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
