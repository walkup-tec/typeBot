import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TenantRepository, type TenantStatus } from "./tenant.repository";

const SYSTEM_MASTER_OWNER_EMAIL = "walkup@walkuptec.com.br";
const TYPEBOT_TENANT_URL_TEMPLATE = String(process.env.TYPEBOT_TENANT_URL_TEMPLATE ?? "").trim();
const TYPEBOT_DEFAULT_DASHBOARD_URL = String(process.env.TYPEBOT_DEFAULT_DASHBOARD_URL ?? "").trim();
const TYPEBOT_SYSTEM_MASTER_URL = String(process.env.TYPEBOT_SYSTEM_MASTER_URL ?? "").trim();
const TYPEBOT_DASHBOARD_FALLBACK = TYPEBOT_DEFAULT_DASHBOARD_URL || "https://app.typebot.io/typebots";
const TYPEBOT_AUTH_MODE_RAW = String(process.env.TYPEBOT_AUTH_MODE ?? "manual").trim().toLowerCase();

export type TypebotAuthMode = "manual" | "magic_link" | "sso";
export type TypebotCapabilities = {
  authMode: TypebotAuthMode;
  canBypassLogin: boolean;
  note: string;
};

const normalizeEmail = (value: string | undefined): string => (value ?? "").trim().toLowerCase();

const isSystemMasterTenantEmail = (email: string | undefined): boolean => {
  return normalizeEmail(email) === SYSTEM_MASTER_OWNER_EMAIL;
};

const slugifyTenantName = (name: string): string => {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const resolveTypebotAccessUrl = (tenant: { id: string; name: string; ownerEmail: string }): string => {
  const tenantSlug = slugifyTenantName(tenant.name);
  if (TYPEBOT_TENANT_URL_TEMPLATE) {
    return TYPEBOT_TENANT_URL_TEMPLATE.replace(/\{tenantSlug\}/g, tenantSlug)
      .replace(/\{tenantId\}/g, tenant.id)
      .replace(/\{ownerEmail\}/g, encodeURIComponent(normalizeEmail(tenant.ownerEmail)));
  }
  if (TYPEBOT_DEFAULT_DASHBOARD_URL) return TYPEBOT_DEFAULT_DASHBOARD_URL;
  return "";
};

const resolveAutoProvisionedTypebotState = (tenant: { id: string; name: string; ownerEmail: string; typebotAccessUrl?: string }) => {
  const normalizedOwnerEmail = normalizeEmail(tenant.ownerEmail);
  const isSystemMasterTenant = isSystemMasterTenantEmail(normalizedOwnerEmail);
  const directAccessUrl = tenant.typebotAccessUrl?.trim() || resolveTypebotAccessUrl(tenant);
  const fallbackAccessUrl = isSystemMasterTenant
    ? TYPEBOT_SYSTEM_MASTER_URL || TYPEBOT_DASHBOARD_FALLBACK
    : TYPEBOT_DASHBOARD_FALLBACK;
  return {
    typebotOwnerEmail: normalizedOwnerEmail,
    typebotProvisionStatus: "provisioned" as const,
    typebotAccessUrl: directAccessUrl || fallbackAccessUrl,
    typebotProvisionError: "",
    typebotLastSyncAt: new Date().toISOString(),
  };
};

const resolveTypebotAuthMode = (): TypebotAuthMode => {
  if (TYPEBOT_AUTH_MODE_RAW === "sso") return "sso";
  if (TYPEBOT_AUTH_MODE_RAW === "magic_link") return "magic_link";
  return "manual";
};

export const createTenantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  ownerEmail: z.string().email(),
  whatsapp: z.string().min(8).max(30),
  profileImageUrl: z.string().max(5000000).optional(),
});

export const updateTenantStatusSchema = z.object({
  status: z.enum(["active", "blocked"]),
});

const imageDataUrlSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i)
  .max(5_000_000);

export const updateTenantProfileImageSchema = z
  .object({
    profileImageUrl: z
      .union([z.string().url().max(2048), imageDataUrlSchema, z.literal("")])
      .nullable()
      .optional(),
    chatDisplayName: z.union([z.string().min(2).max(120), z.literal("")]).optional(),
  })
  .refine((body) => body.profileImageUrl !== undefined || body.chatDisplayName !== undefined, {
    message: "Informe profileImageUrl e/ou chatDisplayName.",
  });

export const updateTenantChatThemeSchema = z.object({
  templateName: z.string().min(2).max(120).optional(),
  userBubbleBg: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  pageBg: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  chatBg: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  botBubbleBg: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(120),
  ownerEmail: z.string().email(),
  whatsapp: z.string().min(8).max(30),
  profileImageUrl: z.string().max(5000000).optional(),
});

export class TenantService {
  constructor(private readonly tenantRepository: TenantRepository) {}

  create(input: z.infer<typeof createTenantSchema>) {
    const ownerEmail = normalizeEmail(input.ownerEmail);
    const tenantBase = {
      id: input.id ?? randomUUID(),
      name: input.name,
      ownerEmail,
    };
    const typebotProvision = resolveAutoProvisionedTypebotState(tenantBase);
    return this.tenantRepository.create({
      ...tenantBase,
      whatsapp: input.whatsapp,
      accessRole: "master",
      profileImageUrl: input.profileImageUrl?.trim() || undefined,
      ...typebotProvision,
      status: "active",
      createdAt: new Date().toISOString(),
    });
  }

  list() {
    return this.tenantRepository.list().map((tenant) => {
      const typebotProvision = resolveAutoProvisionedTypebotState({
        id: tenant.id,
        name: tenant.name,
        ownerEmail: tenant.ownerEmail,
        typebotAccessUrl: tenant.typebotAccessUrl,
      });
      return {
        ...tenant,
        accessRole: tenant.accessRole ?? "master",
        ...typebotProvision,
      };
    });
  }

  updateStatus(id: string, status: TenantStatus) {
    return this.tenantRepository.updateStatus(id, status);
  }

  updateProfileImage(id: string, profileImageUrl: string | null) {
    return this.tenantRepository.updateProfileImage(id, profileImageUrl);
  }

  patchLeadChatProfile(id: string, input: z.infer<typeof updateTenantProfileImageSchema>) {
    const patch: { profileImageUrl?: string | null; chatDisplayName?: string | null } = {};
    if (input.profileImageUrl !== undefined) {
      patch.profileImageUrl = input.profileImageUrl;
    }
    if (input.chatDisplayName !== undefined) {
      patch.chatDisplayName = input.chatDisplayName === "" ? null : input.chatDisplayName;
    }
    return this.tenantRepository.patchLeadChatProfile(id, patch);
  }

  updateChatTheme(id: string, input: z.infer<typeof updateTenantChatThemeSchema>) {
    return this.tenantRepository.updateDefaultChatTheme(id, {
      ...input,
      templateName: input.templateName ?? "Padrão Sistema",
    });
  }

  update(id: string, input: z.infer<typeof updateTenantSchema>) {
    const ownerEmail = normalizeEmail(input.ownerEmail);
    const payload: Parameters<TenantRepository["update"]>[1] = {
      name: input.name,
      ownerEmail,
      whatsapp: input.whatsapp,
    };
    if (input.profileImageUrl !== undefined) {
      payload.profileImageUrl = input.profileImageUrl.trim() || undefined;
    }
    return this.tenantRepository.update(id, payload);
  }

  getTypebotCapabilities(): TypebotCapabilities {
    const authMode = resolveTypebotAuthMode();
    if (authMode === "sso") {
      return {
        authMode,
        canBypassLogin: true,
        note: "SSO ativo: acesso direto com sessão federada.",
      };
    }
    if (authMode === "magic_link") {
      return {
        authMode,
        canBypassLogin: false,
        note: "Magic link ativo: primeiro acesso pode exigir validação por e-mail.",
      };
    }
    return {
      authMode: "manual",
      canBypassLogin: false,
      note: "Sem SSO/magic link: o Typebot exigirá autenticação no domínio deles.",
    };
  }

}
