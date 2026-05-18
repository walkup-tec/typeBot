import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TenantRepository, type QueueDistributionMode, type TenantStatus } from "./tenant.repository";
import type { AttendantRepository } from "../attendants/attendant.repository";
import type { LabelRepository } from "../labels/label.repository";
import type { PriorityRepository } from "../priorities/priority.repository";
import type { FlowRepository } from "../flows/flow.repository";
import type { QueueRepository } from "../queue/queue.repository";
import { hashAttendantPassword } from "../attendants/attendant.service";

const SYSTEM_MASTER_OWNER_EMAIL = "walkup@walkuptec.com.br";
const TYPEBOT_TENANT_URL_TEMPLATE = String(process.env.TYPEBOT_TENANT_URL_TEMPLATE ?? "").trim();
const TYPEBOT_DEFAULT_DASHBOARD_URL = String(process.env.TYPEBOT_DEFAULT_DASHBOARD_URL ?? "").trim();
const TYPEBOT_SYSTEM_MASTER_URL = String(process.env.TYPEBOT_SYSTEM_MASTER_URL ?? "").trim();
const TYPEBOT_BUILDER_API_BASE_URL = String(process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "").trim();
const TYPEBOT_DASHBOARD_FALLBACK =
  TYPEBOT_DEFAULT_DASHBOARD_URL ||
  TYPEBOT_SYSTEM_MASTER_URL ||
  TYPEBOT_BUILDER_API_BASE_URL.replace(/\/api\/?$/, "");
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

const resolveAutoProvisionedTypebotState = (
  tenant: {
    id: string;
    name: string;
    ownerEmail: string;
    typebotAccessUrl?: string;
    typebotWorkspaceId?: string;
    typebotProvisionStatus?: "not_started" | "pending_manual" | "provisioned" | "failed";
    typebotProvisionError?: string;
    typebotLastSyncAt?: string;
  },
) => {
  const normalizedOwnerEmail = normalizeEmail(tenant.ownerEmail);
  const isSystemMasterTenant = isSystemMasterTenantEmail(normalizedOwnerEmail);
  const directAccessUrl = tenant.typebotAccessUrl?.trim() || resolveTypebotAccessUrl(tenant);
  const fallbackAccessUrl = isSystemMasterTenant ? TYPEBOT_SYSTEM_MASTER_URL || TYPEBOT_DASHBOARD_FALLBACK : "";
  const hasWorkspace = Boolean(String(tenant.typebotWorkspaceId ?? "").trim());
  const hasDirectAccess = Boolean(String(directAccessUrl ?? "").trim());
  const currentStatus = tenant.typebotProvisionStatus;
  const derivedStatus: "not_started" | "pending_manual" | "provisioned" | "failed" =
    currentStatus && currentStatus !== "provisioned"
      ? currentStatus
      : hasWorkspace || hasDirectAccess
        ? "provisioned"
        : "not_started";
  return {
    typebotOwnerEmail: normalizedOwnerEmail,
    typebotProvisionStatus: derivedStatus,
    typebotAccessUrl: directAccessUrl || fallbackAccessUrl,
    typebotProvisionError: tenant.typebotProvisionError ?? "",
    typebotLastSyncAt: tenant.typebotLastSyncAt,
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
  initialPassword: z.string().min(4).max(200),
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
    shareImageUrl: z
      .union([z.string().url().max(2048), imageDataUrlSchema, z.literal("")])
      .nullable()
      .optional(),
    shareDescription: z.union([z.string().max(200), z.literal("")]).optional(),
    whatsapp: z.string().min(8).max(30).optional(),
    useWhatsappSecondOption: z.boolean().optional(),
    queueDistributionMode: z.enum(["assign_per_incoming", "shared_pool", "random"]).optional(),
    noSeparateAttendants: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.profileImageUrl !== undefined ||
      body.chatDisplayName !== undefined ||
      body.shareImageUrl !== undefined ||
      body.shareDescription !== undefined ||
      body.whatsapp !== undefined ||
      body.useWhatsappSecondOption !== undefined ||
      body.queueDistributionMode !== undefined ||
      body.noSeparateAttendants !== undefined,
    {
      message:
        "Informe profileImageUrl, chatDisplayName, shareImageUrl, shareDescription, whatsapp, useWhatsappSecondOption, queueDistributionMode e/ou noSeparateAttendants.",
    },
  );

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
  typebotWorkspaceId: z.string().max(200).optional(),
  typebotAccessUrl: z.union([z.string().url().max(2048), z.literal("")]).optional(),
});

export class TenantService {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly attendantRepository: AttendantRepository,
    private readonly flowRepository: FlowRepository,
    private readonly queueRepository: QueueRepository,
    private readonly labelRepository?: LabelRepository,
    private readonly priorityRepository?: PriorityRepository,
  ) {}

  create(input: z.infer<typeof createTenantSchema>) {
    const ownerEmail = normalizeEmail(input.ownerEmail);
    const existingMasterLogin = this.attendantRepository.findByUsernameGlobal(ownerEmail);
    if (existingMasterLogin) {
      throw new Error("Já existe um usuário com este e-mail. Use outro e-mail para criar o assinante.");
    }
    const tenantBase = {
      id: input.id ?? randomUUID(),
      name: input.name,
      ownerEmail,
    };
    const typebotProvision = {
      typebotOwnerEmail: ownerEmail,
      typebotProvisionStatus: "not_started" as const,
      typebotAccessUrl: resolveTypebotAccessUrl(tenantBase),
      typebotProvisionError: "",
      typebotLastSyncAt: undefined,
    };
    const tenant = this.tenantRepository.create({
      ...tenantBase,
      whatsapp: input.whatsapp,
      accessRole: "master",
      profileImageUrl: input.profileImageUrl?.trim() || undefined,
      ...typebotProvision,
      status: "active",
      createdAt: new Date().toISOString(),
    });
    try {
      this.attendantRepository.create({
        id: randomUUID(),
        tenantId: tenant.id,
        username: ownerEmail,
        email: ownerEmail,
        displayName: input.name.trim(),
        passwordHash: hashAttendantPassword(input.initialPassword),
        role: "master",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      this.tenantRepository.deleteById(tenant.id);
      throw error;
    }
    return tenant;
  }

  list() {
    return this.tenantRepository.list().map((tenant) => {
      const typebotProvision = resolveAutoProvisionedTypebotState({
        id: tenant.id,
        name: tenant.name,
        ownerEmail: tenant.ownerEmail,
        typebotAccessUrl: tenant.typebotAccessUrl,
        typebotWorkspaceId: tenant.typebotWorkspaceId,
        typebotProvisionStatus: tenant.typebotProvisionStatus,
        typebotProvisionError: tenant.typebotProvisionError,
        typebotLastSyncAt: tenant.typebotLastSyncAt,
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
    const patch: {
      profileImageUrl?: string | null;
      chatDisplayName?: string | null;
      shareImageUrl?: string | null;
      shareDescription?: string | null;
      whatsapp?: string | null;
      useWhatsappSecondOption?: boolean;
      queueDistributionMode?: QueueDistributionMode;
      noSeparateAttendants?: boolean;
    } = {};
    if (input.profileImageUrl !== undefined) {
      patch.profileImageUrl = input.profileImageUrl;
    }
    if (input.chatDisplayName !== undefined) {
      patch.chatDisplayName = input.chatDisplayName === "" ? null : input.chatDisplayName;
    }
    if (input.shareImageUrl !== undefined) {
      patch.shareImageUrl = input.shareImageUrl;
    }
    if (input.shareDescription !== undefined) {
      patch.shareDescription = input.shareDescription === "" ? null : input.shareDescription;
    }
    if (input.whatsapp !== undefined) {
      patch.whatsapp = input.whatsapp;
    }
    if (input.useWhatsappSecondOption !== undefined) {
      patch.useWhatsappSecondOption = input.useWhatsappSecondOption;
    }
    if (input.queueDistributionMode !== undefined) {
      patch.queueDistributionMode = input.queueDistributionMode;
    }
    if (input.noSeparateAttendants !== undefined) {
      patch.noSeparateAttendants = input.noSeparateAttendants;
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
    const workspaceId = String(input.typebotWorkspaceId ?? "").trim();
    if (input.typebotWorkspaceId !== undefined) {
      payload.typebotWorkspaceId = workspaceId || undefined;
    }
    if (input.typebotAccessUrl !== undefined) {
      const accessUrl = String(input.typebotAccessUrl ?? "").trim();
      payload.typebotAccessUrl = accessUrl || undefined;
    }
    if (workspaceId) {
      payload.typebotProvisionStatus = "provisioned";
      payload.typebotProvisionError = "";
      payload.typebotLastSyncAt = new Date().toISOString();
    }
    return this.tenantRepository.update(id, payload);
  }

  delete(id: string): boolean {
    if (!this.tenantRepository.getById(id)) return false;
    this.attendantRepository.deleteByTenantId(id);
    this.flowRepository.deleteByTenantId(id);
    this.queueRepository.deleteByTenantId(id);
    this.labelRepository?.deleteByTenantId(id);
    this.priorityRepository?.deleteByTenantId(id);
    return this.tenantRepository.deleteById(id);
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
