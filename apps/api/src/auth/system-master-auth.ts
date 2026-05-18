import { randomUUID } from "node:crypto";
import { normalizeAuthIdentifier } from "../lib/auth-email";
import {
  attendantRepository,
  flowRepository,
  labelRepository,
  queueRepository,
  tenantRepository,
} from "../lib/repositories";
import { hashAttendantPassword } from "../attendants/attendant.service";
import type { Attendant } from "../attendants/attendant.repository";
import type { Tenant } from "../tenants/tenant.repository";
import { TenantService } from "../tenants/tenant.service";

export const SYSTEM_MASTER_OWNER_EMAIL = "walkup@walkuptec.com.br";

const normalizeEmail = (value: string | undefined): string => (value ?? "").trim().toLowerCase();

export const isSystemMasterEmail = (emailRaw: string): boolean =>
  normalizeEmail(emailRaw) === normalizeEmail(SYSTEM_MASTER_OWNER_EMAIL);

export const allowSystemMasterResetProvision = (): boolean =>
  String(process.env.API_ALLOW_SYSTEM_MASTER_RESET_PROVISION ?? "").trim().toLowerCase() === "true";

export const allowSystemMasterEnsureOnBoot = (): boolean =>
  String(process.env.API_ENSURE_SYSTEM_MASTER ?? "").trim().toLowerCase() === "true";

export const shouldResetSystemMasterPasswordOnBoot = (): boolean =>
  String(process.env.API_SYSTEM_MASTER_RESET_PASSWORD ?? "").trim().toLowerCase() === "true";

export const findSystemMasterTenant = (): Tenant | null =>
  tenantRepository.list().find((tenant) => normalizeEmail(tenant.ownerEmail) === normalizeEmail(SYSTEM_MASTER_OWNER_EMAIL)) ??
  null;

const resolveSystemMasterWhatsapp = (): string => {
  const fromEnv = String(process.env.API_SYSTEM_MASTER_WHATSAPP ?? "").trim();
  if (fromEnv.length >= 8 && fromEnv.length <= 30) return fromEnv;
  return "5500000000000";
};

const resolveSystemMasterTenantName = (): string => {
  const fromEnv = String(process.env.API_SYSTEM_MASTER_TENANT_NAME ?? "Drax Sistemas").trim();
  return fromEnv.length >= 2 ? fromEnv : "Drax Sistemas";
};

const findSystemMasterAttendant = (tenantId: string): Attendant | null => {
  const inTenant = attendantRepository.listByTenant(tenantId);
  const master = inTenant.find((row) => row.role === "master");
  if (master) return master;
  return attendantRepository.listLoginCandidates(SYSTEM_MASTER_OWNER_EMAIL).find((row) => row.tenantId === tenantId) ?? null;
};

const createSystemMasterAttendant = (tenant: Tenant, password: string): Attendant => {
  const emailKey = normalizeAuthIdentifier(SYSTEM_MASTER_OWNER_EMAIL);
  const created: Attendant = {
    id: randomUUID(),
    tenantId: tenant.id,
    username: emailKey,
    email: emailKey,
    displayName: tenant.name?.trim() || "Master do Sistema",
    passwordHash: hashAttendantPassword(password),
    role: "master",
    createdAt: new Date().toISOString(),
  };
  attendantRepository.create(created);
  return created;
};

export const ensureSystemMasterAuth = (
  password: string,
  options?: { resetExistingPassword?: boolean },
): Attendant | null => {
  if (password.trim().length < 4) return null;

  let tenant = findSystemMasterTenant();
  if (!tenant) {
    const tenantService = new TenantService(
      tenantRepository,
      attendantRepository,
      flowRepository,
      queueRepository,
      labelRepository,
    );
    try {
      tenantService.create({
        name: resolveSystemMasterTenantName(),
        ownerEmail: SYSTEM_MASTER_OWNER_EMAIL,
        whatsapp: resolveSystemMasterWhatsapp(),
        initialPassword: password,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[auth] Falha ao criar tenant do Master do Sistema:", error);
      return null;
    }
    tenant = findSystemMasterTenant();
    if (!tenant) return null;
    return findSystemMasterAttendant(tenant.id);
  }

  const existing = findSystemMasterAttendant(tenant.id);
  if (!existing) {
    return createSystemMasterAttendant(tenant, password);
  }

  if (options?.resetExistingPassword) {
    const updated = attendantRepository.updateById(existing.id, {
      passwordHash: hashAttendantPassword(password),
      email: normalizeAuthIdentifier(SYSTEM_MASTER_OWNER_EMAIL),
    });
    return updated ?? existing;
  }

  return existing;
};

export const provisionSystemMasterForPasswordReset = (emailRaw: string, newPassword: string): Attendant | null => {
  if (!isSystemMasterEmail(emailRaw) || !allowSystemMasterResetProvision()) return null;
  return ensureSystemMasterAuth(newPassword, { resetExistingPassword: true });
};
