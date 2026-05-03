import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getDataFilePath } from "../lib/data-path";

export type TenantStatus = "active" | "blocked";
export type TypebotProvisionStatus = "not_started" | "pending_manual" | "provisioned" | "failed";
export type QueueDistributionMode = "assign_per_incoming" | "shared_pool" | "random";

/** Tema "Padrão Sistema" aplicado ao chat do lead / parâmetros do redirect Typebot (por tenant). */
export interface TenantDefaultChatTheme {
  templateName?: string;
  userBubbleBg?: string;
  pageBg?: string;
  chatBg?: string;
  botBubbleBg?: string;
}

export interface Tenant {
  id: string;
  name: string;
  ownerEmail: string;
  whatsapp: string;
  /** Papel base do assinante no console do seu tenant. */
  accessRole?: "master";
  status: TenantStatus;
  profileImageUrl?: string;
  /** Título no cabeçalho do chat do lead (handoff); se vazio, usa `name`. */
  chatDisplayName?: string;
  /** Imagem de compartilhamento para metadados dos fluxos do workspace do tenant. */
  shareImageUrl?: string;
  /** Descrição curta da empresa para metadados (limite 200). */
  shareDescription?: string;
  /** Exibe botão de WhatsApp como segunda opção na espera do handoff. */
  useWhatsappSecondOption?: boolean;
  /** Regra de distribuição de novos atendimentos na fila. */
  queueDistributionMode?: QueueDistributionMode;
  /** Se true, apenas o Master assinante atende no chat (sem outros atendentes na distribuição). */
  noSeparateAttendants?: boolean;
  typebotOwnerEmail?: string;
  typebotWorkspaceId?: string;
  typebotWorkspaceName?: string;
  typebotAccessUrl?: string;
  typebotProvisionStatus?: TypebotProvisionStatus;
  typebotProvisionError?: string;
  typebotLastSyncAt?: string;
  defaultChatTheme?: TenantDefaultChatTheme;
  createdAt: string;
}

const TENANTS_FILE_PATH = getDataFilePath("tenants.json");

const ensureStorage = () => {
  const folder = dirname(TENANTS_FILE_PATH);
  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true });
  }
  if (!existsSync(TENANTS_FILE_PATH)) {
    writeFileSync(TENANTS_FILE_PATH, "[]", "utf-8");
  }
};

const loadPersistedTenants = (): Tenant[] => {
  ensureStorage();
  try {
    const raw = readFileSync(TENANTS_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Tenant[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const savePersistedTenants = (tenants: Tenant[]) => {
  ensureStorage();
  writeFileSync(TENANTS_FILE_PATH, JSON.stringify(tenants, null, 2), "utf-8");
};

export class TenantRepository {
  private readonly tenants = new Map<string, Tenant>();

  constructor() {
    const initial = loadPersistedTenants();
    for (const tenant of initial) {
      this.tenants.set(tenant.id, tenant);
    }
  }

  create(tenant: Tenant): Tenant {
    this.tenants.set(tenant.id, tenant);
    savePersistedTenants([...this.tenants.values()]);
    return tenant;
  }

  list(): Tenant[] {
    return [...this.tenants.values()];
  }

  getById(id: string): Tenant | null {
    const fromMemory = this.tenants.get(id);
    if (fromMemory) return fromMemory;
    const persisted = loadPersistedTenants().find((tenant) => tenant.id === id);
    if (!persisted) return null;
    this.tenants.set(persisted.id, persisted);
    return persisted;
  }

  updateStatus(id: string, status: TenantStatus): Tenant | null {
    const current = this.tenants.get(id);
    if (!current) return null;

    const updated: Tenant = { ...current, status };
    this.tenants.set(id, updated);
    savePersistedTenants([...this.tenants.values()]);
    return updated;
  }

  updateProfileImage(id: string, profileImageUrl: string | null): Tenant | null {
    return this.patchLeadChatProfile(id, { profileImageUrl });
  }

  patchLeadChatProfile(
    id: string,
    patch: {
      profileImageUrl?: string | null;
      chatDisplayName?: string | null;
      shareImageUrl?: string | null;
      shareDescription?: string | null;
      whatsapp?: string | null;
      useWhatsappSecondOption?: boolean;
      queueDistributionMode?: QueueDistributionMode;
      noSeparateAttendants?: boolean;
    },
  ): Tenant | null {
    const current = this.tenants.get(id) ?? this.getById(id);
    if (!current) return null;
    const updated: Tenant = { ...current };
    if (patch.profileImageUrl !== undefined) {
      const normalizedUrl = patch.profileImageUrl?.trim() ? patch.profileImageUrl.trim() : undefined;
      updated.profileImageUrl = normalizedUrl;
    }
    if (patch.chatDisplayName !== undefined) {
      const label = patch.chatDisplayName === null ? "" : patch.chatDisplayName.trim();
      updated.chatDisplayName = label ? label : undefined;
    }
    if (patch.shareImageUrl !== undefined) {
      const normalizedUrl = patch.shareImageUrl?.trim() ? patch.shareImageUrl.trim() : undefined;
      updated.shareImageUrl = normalizedUrl;
    }
    if (patch.shareDescription !== undefined) {
      const description = patch.shareDescription === null ? "" : patch.shareDescription.trim();
      updated.shareDescription = description ? description : undefined;
    }
    if (patch.whatsapp !== undefined) {
      const whatsapp = patch.whatsapp === null ? "" : patch.whatsapp.trim();
      updated.whatsapp = whatsapp || current.whatsapp;
    }
    if (patch.useWhatsappSecondOption !== undefined) {
      updated.useWhatsappSecondOption = patch.useWhatsappSecondOption;
    }
    if (patch.queueDistributionMode !== undefined) {
      updated.queueDistributionMode = patch.queueDistributionMode;
    }
    if (patch.noSeparateAttendants !== undefined) {
      updated.noSeparateAttendants = patch.noSeparateAttendants;
    }
    this.tenants.set(id, updated);
    savePersistedTenants([...this.tenants.values()]);
    return updated;
  }

  updateDefaultChatTheme(id: string, patch: TenantDefaultChatTheme): Tenant | null {
    const current = this.tenants.get(id) ?? this.getById(id);
    if (!current) return null;
    const nextTheme: TenantDefaultChatTheme = {
      ...current.defaultChatTheme,
      ...patch,
      templateName: patch.templateName ?? current.defaultChatTheme?.templateName ?? "Padrão Sistema",
    };
    const updated: Tenant = { ...current, defaultChatTheme: nextTheme };
    this.tenants.set(id, updated);
    savePersistedTenants([...this.tenants.values()]);
    return updated;
  }

  updateTypebotProvision(
    id: string,
    patch: {
      typebotOwnerEmail?: string;
      typebotWorkspaceId?: string;
      typebotWorkspaceName?: string;
      typebotAccessUrl?: string;
      typebotProvisionStatus?: TypebotProvisionStatus;
      typebotProvisionError?: string;
      typebotLastSyncAt?: string;
    },
  ): Tenant | null {
    const current = this.tenants.get(id) ?? this.getById(id);
    if (!current) return null;
    const updated: Tenant = {
      ...current,
      ...patch,
    };
    this.tenants.set(id, updated);
    savePersistedTenants([...this.tenants.values()]);
    return updated;
  }

  update(
    id: string,
    input: Pick<Tenant, "name" | "ownerEmail" | "whatsapp"> & { profileImageUrl?: string },
  ): Tenant | null {
    const current = this.tenants.get(id) ?? this.getById(id);
    if (!current) return null;
    const updated: Tenant = {
      ...current,
      name: input.name,
      ownerEmail: input.ownerEmail,
      whatsapp: input.whatsapp,
      typebotOwnerEmail: input.ownerEmail,
    };
    if (input.profileImageUrl !== undefined) {
      updated.profileImageUrl = input.profileImageUrl?.trim() ? input.profileImageUrl.trim() : undefined;
    }
    this.tenants.set(id, updated);
    savePersistedTenants([...this.tenants.values()]);
    return updated;
  }

  deleteById(id: string): boolean {
    const deleted = this.tenants.delete(id);
    if (!deleted) return false;
    savePersistedTenants([...this.tenants.values()]);
    return true;
  }
}
