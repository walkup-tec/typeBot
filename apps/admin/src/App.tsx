import { useEffect, useMemo, useRef, useState } from "react";
import { ClientsListScreen } from "./ClientsListScreen";
import { LiveInboxScreen } from "./LiveInboxScreen";
import { SchedulingScreen } from "./SchedulingScreen";
import type { ScheduledLeadItem } from "./schedulingUtils";
import { TenantLabelsStep } from "./TenantLabelsStep";
import { TenantPrioritiesStep } from "./TenantPrioritiesStep";
import { TenantKanbanStep } from "./TenantKanbanStep";
import { KanbanScreen } from "./KanbanScreen";
import { copyTextToClipboard } from "./copyToClipboard";
import { LeadDetailModal } from "./LeadDetailModal";
import { resolveAttendantDisplayName } from "./resolveAttendantDisplayName";
import {
  confirmMasterWizardStep,
  loadMasterWizardConfirmedByTenant,
  persistMasterWizardConfirmedByTenant,
  resolveFirstIncompleteWizardStep,
  resolveWizardUnlockedStep,
  type MasterWizardStepCompletion,
  type MasterWizardStepIndex,
} from "./masterWizardProgress";
import { resolveStatusToastTone } from "./lib/resolveStatusToastTone";
import { dedupeMasterLibraryFlows } from "./lib/masterLibraryFlows";
import { ADMIN_BUILD_MARKER } from "./deploy-marker";

type TenantDefaultChatTheme = {
  templateName?: string;
  userBubbleBg?: string;
  pageBg?: string;
  chatBg?: string;
  botBubbleBg?: string;
};
type QueueDistributionMode = "assign_per_incoming" | "shared_pool" | "random";

type Tenant = {
  id: string;
  name: string;
  ownerEmail: string;
  whatsapp: string;
  status: "active" | "blocked";
  profileImageUrl?: string;
  chatDisplayName?: string;
  shareImageUrl?: string;
  useWhatsappSecondOption?: boolean;
  queueDistributionMode?: QueueDistributionMode;
  /** Sem outros atendentes: distribuição e chat tratam só o Master assinante. */
  noSeparateAttendants?: boolean;
  typebotOwnerEmail?: string;
  typebotWorkspaceId?: string;
  typebotWorkspaceName?: string;
  typebotAccessUrl?: string;
  typebotProvisionStatus?: "not_started" | "pending_manual" | "provisioned" | "failed";
  typebotProvisionError?: string;
  typebotLastSyncAt?: string;
  defaultChatTheme?: TenantDefaultChatTheme;
  createdAt: string;
};

type QueueContact = {
  contactId: string;
  tenantId: string;
  tenantName?: string;
  contactName: string;
  source: "typebot" | "widget";
  sourceFlowLabel: string;
  sourceFlowDisplayName?: string;
  leadContext?: Record<string, string | number | boolean>;
  leadWhatsapp?: string;
  status: "waiting" | "in_service" | "closed";
  assignedAgentId?: string;
  assignedAgentName?: string;
  priorityId?: string;
  priorityName?: string;
  kanbanColumnId?: string;
  kanbanColumnName?: string;
  labelIds?: string[];
  labels?: Array<{ id: string; name: string; color: string }>;
  labelName?: string;
  labelColor?: string;
  isPinned?: boolean;
  scheduledAt?: string;
  updatedAt: string;
};

type SavedFlow = {
  id: string;
  tenantId?: string;
  createdAt: string;
  nickname: string;
  displayLabel?: string;
  /** Id do typebot na Builder API (fluxo criado no workspace). */
  typebotRemoteId?: string;
  /** Alias / publicId do Typebot (viewer); enviado em `source-flows`. */
  typebotPublicId?: string;
  shortShareCode?: string;
  librarySourceId?: string;
  url: string;
  /** Preenchido em `source-flows` quando a URL do viewer foi testada. */
  viewerUrlActive?: boolean;
  /** Publicado (Live) no Typebot builder — workspace matriz. */
  typebotPublished?: boolean;
  /** Proprietário do fluxo (retorno de source-flows com fallback multi-tenant). */
  ownerEmail?: string;
  ownerName?: string;
};

type FlowLibraryItem = {
  id: string;
  title: string;
  description: string;
  suggestedNickname: string;
  viewerUrl: string;
};

type SystemMasterLibraryItem = {
  id: string;
  sourceFlowId: string;
  title: string;
  description: string;
  suggestedNickname: string;
  viewerUrl: string;
  isSystemDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type AttendantRow = {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  role: "master" | "manager" | "attendant";
  createdAt: string;
};

type CreateAttendantResponse = AttendantRow & {
  emailDelivery?: {
    status: "sent" | "failed" | "skipped";
    message?: string;
  };
};

type FlowStatus = "active" | "inactive" | "checking";

type MasterProfile = "system_master" | "subscriber_master";
type ScreenId =
  | "master"
  | "masterLibrary"
  | "subscribers"
  | "kanban"
  | "liveQueue"
  | "scheduling"
  | "clientList";
type AuthSession = {
  user: {
    id: string;
    tenantId: string;
    username: string;
    email: string;
    displayName: string;
    role: "master" | "manager" | "attendant";
  };
  tenant: {
    id: string;
    name: string;
    ownerEmail: string;
  };
  masterProfile: MasterProfile;
};

const resolveSessionUserDisplayName = (user?: AuthSession["user"] | null): string => {
  if (!user) return "";
  return resolveAttendantDisplayName(
    { username: user.username, displayName: user.displayName },
    { sessionAgentId: user.username, sessionAgentName: user.displayName },
  );
};

const resolveQueueItemAssignedAgentName = (
  item: Pick<QueueContact, "assignedAgentId" | "assignedAgentName">,
  attendantRows: AttendantRow[],
): string => {
  const assignedAgentId = String(item.assignedAgentId ?? "").trim();
  if (!assignedAgentId) return "";

  const attendant = attendantRows.find(
    (row) => String(row.username ?? "").trim().toLowerCase() === assignedAgentId.toLowerCase(),
  );

  return resolveAttendantDisplayName(
    attendant ?? { username: assignedAgentId, displayName: item.assignedAgentName },
    { assignedAgentId, assignedAgentName: item.assignedAgentName },
  );
};

/** API pública quando o build não injetou VITE_API_BASE_URL (Easypanel). */
const PRODUCTION_API_BASE_BY_PAINEL_HOST: Record<string, string> = {
  "painel.chattypebot.com": "https://app.chattypebot.com",
};

/**
 * Base da API usada pelo painel.
 * 1) Runtime: `window.__TYPEBOT_SAAS_API_BASE__` (override no HTML servido).
 * 2) Build: `VITE_API_BASE_URL` (obrigatório no Easypanel — fase de build do painel).
 * 3) Host conhecido do painel em produção (fallback se o build ficou em localhost).
 */
function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const injected = String(
      (window as Window & { __TYPEBOT_SAAS_API_BASE__?: string }).__TYPEBOT_SAAS_API_BASE__ ?? "",
    ).trim();
    if (injected) return injected.replace(/\/$/, "");
  }
  const fromVite = import.meta.env.VITE_API_BASE_URL?.trim();
  if (fromVite) return fromVite.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const host = window.location.hostname.trim().toLowerCase();
    const fromHost = PRODUCTION_API_BASE_BY_PAINEL_HOST[host];
    if (fromHost) return fromHost.replace(/\/$/, "");
  }
  return "http://localhost:3333";
}

const apiBase = resolveApiBase();

function formatApiConnectionError(error: unknown): string {
  const detail = error instanceof Error ? error.message.trim() : "";
  const base = `Sem ligação à API em ${apiBase}. Confirme rede, TLS e se esta URL é mesmo o serviço Node (ex.: /health).`;
  return detail ? `${base} (${detail})` : base;
}

const SYSTEM_MASTER_EMAIL = "walkup@walkuptec.com.br";
/** Builder Typebot da matriz (Master do Sistema): abre em nova aba a partir do header. */
const systemMasterTypebotBuilderUrlFromEnv = import.meta.env.VITE_SYSTEM_MASTER_TYPEBOT_BUILDER_URL?.trim();
/** URL canónica do builder (projeto Easypanel `typebot`, migração 2026-05). */
const TYPEBOT_BUILDER_PUBLIC_BASE_URL =
  "https://typebot-typebot-walkup-builder.achpyp.easypanel.host";
const SYSTEM_MASTER_TYPEBOT_BUILDER_URL =
  systemMasterTypebotBuilderUrlFromEnv || `${TYPEBOT_BUILDER_PUBLIC_BASE_URL}/pt-BR/typebots`;
const AUTH_STORAGE_KEY = "typebot-saas-auth-session";
const widgetBaseUrlFromEnv = import.meta.env.VITE_WIDGET_BASE_URL?.trim();
const widgetBaseUrl =
  widgetBaseUrlFromEnv &&
  !/localhost|127\.0\.0\.1|loca\.lt/i.test(widgetBaseUrlFromEnv)
    ? widgetBaseUrlFromEnv.replace(/\/$/, "")
    : "";
const buildHandoffAgentViewUrl = (
  tenantId: string,
  contactId: string,
  agent: string,
  agentName?: string,
  contactName?: string,
  sourceFlowLabel?: string,
) => {
  const encodedContactName = encodeURIComponent(contactName?.trim() || "Visitante");
  const flowQuery = sourceFlowLabel?.trim()
    ? `&flow=${encodeURIComponent(sourceFlowLabel.trim())}`
    : "";
  return `${apiBase}/handoff-view?mode=agent&embed=inbox&tenantId=${encodeURIComponent(tenantId)}&contactId=${encodeURIComponent(
    contactId,
  )}&contactName=${encodedContactName}&agentId=${encodeURIComponent(agent)}&agentName=${encodeURIComponent(
    agentName?.trim() || agent,
  )}${flowQuery}`;
};

/** Fila ao vivo: iframe na API (frame-ancestors). Evita widget em host separado sem DNS/headers. */
const getAgentViewUrl = buildHandoffAgentViewUrl;

/** Nova aba: pode usar widget público quando configurado. */
const getAgentViewUrlNewTab = (
  tenantId: string,
  contactId: string,
  agent: string,
  agentName?: string,
  contactName?: string,
) => {
  const encodedContactName = encodeURIComponent(contactName?.trim() || "Visitante");
  if (widgetBaseUrl) {
    return `${widgetBaseUrl}/?mode=agent&tenantId=${encodeURIComponent(tenantId)}&contactId=${encodeURIComponent(
      contactId,
    )}&contactName=${encodedContactName}&agentId=${encodeURIComponent(agent)}&agentName=${encodeURIComponent(
      agentName?.trim() || agent,
    )}&apiBase=${encodeURIComponent(apiBase)}`;
  }
  return buildHandoffAgentViewUrl(tenantId, contactId, agent, agentName, contactName);
};
const getTenantUserTypeLabel = (ownerEmail: string): "Master do Sistema" | "Master Assinante" =>
  ownerEmail.trim().toLowerCase() === SYSTEM_MASTER_EMAIL ? "Master do Sistema" : "Master Assinante";
const getTenantStatusLabel = (status: Tenant["status"]): "Ativo" | "Bloqueado" => (status === "active" ? "Ativo" : "Bloqueado");

/** Workspace Typebot realmente ligado ao assinante (evita mostrar “Provisionado” só pelo estado derivado). */
const isTenantTypebotProvisioned = (tenant: Tenant): boolean =>
  tenant.typebotProvisionStatus === "provisioned" &&
  Boolean(String(tenant.typebotWorkspaceId ?? "").trim());

const isSystemMasterTenant = (tenant: Tenant | null | undefined): boolean =>
  Boolean(tenant && tenant.ownerEmail.trim().toLowerCase() === SYSTEM_MASTER_EMAIL);

async function extractDominantHexFromImageSrc(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 40;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const buckets = new Map<string, number>();
        const weightedBuckets = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] ?? 255;
          if (a < 40) continue;
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          // Ignora extremos que distorcem branding (fundo preto/branco).
          if (r + g + b < 90) continue;
          if (r > 248 && g > 248 && b > 248) continue;
          const rq = Math.round(r / 28) * 28;
          const gq = Math.round(g / 28) * 28;
          const bq = Math.round(b / 28) * 28;
          const key = `${rq},${gq},${bq}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          const brightness = (r + g + b) / 765;
          const weight = Math.max(0.2, saturation * 2.4 + brightness * 0.4);
          weightedBuckets.set(key, (weightedBuckets.get(key) ?? 0) + weight);
        }
        let bestKey = "";
        let maxWeight = 0;
        for (const [key, count] of buckets) {
          const weight = (weightedBuckets.get(key) ?? 0) * (1 + count * 0.05);
          if (weight > maxWeight) {
            maxWeight = weight;
            bestKey = key;
          }
        }
        if (!bestKey) return resolve(null);
        const [r0, g0, b0] = bestKey.split(",").map((n) => Number(n));
        const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
        resolve(`#${toHex(r0)}${toHex(g0)}${toHex(b0)}`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function resizeImageForShare(file: File, targetWidth = 1200, targetHeight = 630): Promise<string> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Falha ao carregar imagem."));
      el.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");

    // Cover: preenche todo o frame 1200x630 sem bordas.
    const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const dx = (targetWidth - drawWidth) / 2;
    const dy = (targetHeight - drawHeight) / 2;
    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function resizeImageForLogo(file: File, targetSize = 500): Promise<string> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Falha ao carregar logo."));
      el.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const scale = Math.max(targetSize / img.width, targetSize / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const dx = (targetSize - drawWidth) / 2;
    const dy = (targetSize - drawHeight) / 2;
    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

const formatWhatsapp = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
};

const abbreviateUrlForDisplay = (raw: string, maxLen = 56): string => {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length <= maxLen) return trimmed;
  try {
    const u = new URL(trimmed);
    const origin = `${u.protocol}//${u.host}`;
    const rest = `${u.pathname}${u.search}${u.hash}` || "/";
    const full = origin + rest;
    if (full.length <= maxLen) return full;
    const sep = "…";
    const suffixChars = maxLen - origin.length - sep.length;
    if (suffixChars >= 6 && rest.length > suffixChars) {
      return `${origin}${sep}${rest.slice(-suffixChars)}`;
    }
    const headChars = Math.max(16, maxLen - 10 - sep.length);
    return `${trimmed.slice(0, headChars)}${sep}${trimmed.slice(-9)}`;
  } catch {
    return `${trimmed.slice(0, maxLen - 1)}…`;
  }
};

type SidebarMenuIconName =
  | "master"
  | "library"
  | "subscribers"
  | "liveQueue"
  | "clientList"
  | "kanban"
  | "scheduling";

const SIDEBAR_MENU_ICON_PATHS: Record<SidebarMenuIconName, string> = {
  master:
    "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  library:
    "M6 4h9l3 3v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm8 1.5V8h2.5L14 5.5ZM8 11h8v1.5H8V11Zm0 3.5h8V16H8v-1.5Z",
  subscribers:
    "M16 11c1.7 0 3-1.3 3-3S17.7 5 16 5s-3 1.3-3 3 1.3 3 3 3Zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3Zm0 2c-2.3 0-7 1.2-7 3.5V18h8v-2.5C9 15.2 8.3 14.4 8 14Zm8 0c-.3 0-1.2.4-2 2.5V18h7v-2.5C21 14.2 16.3 13 14 13Z",
  liveQueue:
    "M6.5 5A4.5 4.5 0 0 0 2 9.5v5A4.5 4.5 0 0 0 6.5 19H8v2.25c0 .4.44.64.77.42L12.7 19H17.5a4.5 4.5 0 0 0 4.5-4.5v-5A4.5 4.5 0 0 0 17.5 5h-11Z",
  clientList:
    "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z",
  kanban: "M4 6h5v14H4V6Zm6 0h5v10h-5V6Zm6 0h5v7h-5V6Z",
  scheduling: "M7 3h2v2H7V3Zm8 0h2v2h-2V3ZM5 7h14v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7Zm2 2v10h10V9H7Z",
};

const SCREEN_PAGE_HEADER: Partial<Record<ScreenId, { title: string; subtitle: string }>> = {
  kanban: {
    title: "Kanban",
    subtitle: "Leads atribuídos às colunas do funil. Clique no card para ver o contato.",
  },
  liveQueue: {
    title: "Fila ao vivo",
    subtitle: "Atenda contatos em tempo real na fila de espera.",
  },
  scheduling: {
    title: "Agendamento",
    subtitle: "Gerencie compromissos e retornos agendados com clientes.",
  },
  clientList: {
    title: "Lista de Clientes",
    subtitle: "Consulte o histórico e detalhes dos contatos atendidos.",
  },
};

function SidebarMenuIcon({ name }: { name: SidebarMenuIconName }) {
  return (
    <svg className="menu-btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={SIDEBAR_MENU_ICON_PATHS[name]} fill="currentColor" />
    </svg>
  );
}

const readSidebarCollapsedPreference = (): boolean => {
  try {
    return window.localStorage.getItem("drax-admin-sidebar-collapsed") === "1";
  } catch {
    return false;
  }
};

const MASTER_CONSOLE_WIZARD_STEPS = [
  { step: 1, label: "Perfil Assinante" },
  { step: 2, label: "Atendente" },
  { step: 3, label: "Etiquetas" },
  { step: 4, label: "Prioridade" },
  { step: 5, label: "Kanban" },
  { step: 6, label: "Biblioteca de Fluxos" },
] as const;

const MASTER_WIZARD_FLOWS_STEP = 6;

export function App() {
  const QUEUE_REFRESH_INTERVAL_MS = 3000;
  const FLOW_LIBRARY_REFRESH_INTERVAL_MS = 7000;
  const [activeScreen, setActiveScreen] = useState<ScreenId>("master");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [queueItems, setQueueItems] = useState<QueueContact[]>([]);
  const [masterClientContacts, setMasterClientContacts] = useState<QueueContact[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantEmail, setNewTenantEmail] = useState("");
  const [newTenantWhatsapp, setNewTenantWhatsapp] = useState("");
  const [newTenantTypebotWorkspaceId, setNewTenantTypebotWorkspaceId] = useState("");
  const [newTenantTypebotAccessUrl, setNewTenantTypebotAccessUrl] = useState("");
  const [newTenantPassword, setNewTenantPassword] = useState("");
  const [isSubscriberModalOpen, setIsSubscriberModalOpen] = useState(false);
  const [isLeadDetailModalOpen, setIsLeadDetailModalOpen] = useState(false);
  const [selectedLeadContactId, setSelectedLeadContactId] = useState("");
  const [selectedLeadTenantId, setSelectedLeadTenantId] = useState("");
  const [isSavingSubscriber, setIsSavingSubscriber] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("atendente-01");
  const [savedFlowsByTenant, setSavedFlowsByTenant] = useState<Record<string, SavedFlow[]>>({});
  const [flowStatuses, setFlowStatuses] = useState<Record<string, FlowStatus>>({});
  const [isFlowModalOpen, setIsFlowModalOpen] = useState(false);
  const [newFlowNickname, setNewFlowNickname] = useState("");
  const [newFlowUrl, setNewFlowUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readSidebarCollapsedPreference);
  const [didMigrateLocalFlows, setDidMigrateLocalFlows] = useState(false);
  const [tenantProfileImageUrl, setTenantProfileImageUrl] = useState("");
  const [leadChatDisplayName, setLeadChatDisplayName] = useState("");
  const [shareImageUrl, setShareImageUrl] = useState("");
  const [primaryWhatsapp, setPrimaryWhatsapp] = useState("");
  const [useWhatsappSecondOption, setUseWhatsappSecondOption] = useState(true);
  const [queueDistributionMode, setQueueDistributionMode] = useState<QueueDistributionMode>("shared_pool");
  const [noSeparateAttendants, setNoSeparateAttendants] = useState(false);
  const [subscriberStatusFilter, setSubscriberStatusFilter] = useState<"all" | "active" | "blocked">("all");
  const [isLoadingTenants, setIsLoadingTenants] = useState(false);
  const [attendants, setAttendants] = useState<AttendantRow[]>([]);
  const [isLoadingAttendants, setIsLoadingAttendants] = useState(false);
  const [attendantUsername, setAttendantUsername] = useState("");
  const [attendantEmail, setAttendantEmail] = useState("");
  const [attendantDisplayName, setAttendantDisplayName] = useState("");
  const [attendantPassword, setAttendantPassword] = useState("");
  const [attendantRole, setAttendantRole] = useState<AttendantRow["role"] | "">("");
  const [isAutoCreatingAttendant, setIsAutoCreatingAttendant] = useState(false);
  const [lastAutoAttendantDraftKey, setLastAutoAttendantDraftKey] = useState("");
  const [flowLibrary, setFlowLibrary] = useState<FlowLibraryItem[]>([]);
  const [sourceMasterFlows, setSourceMasterFlows] = useState<SavedFlow[]>([]);
  const [systemMasterLibrary, setSystemMasterLibrary] = useState<SystemMasterLibraryItem[]>([]);
  /** Títulos digitados na Biblioteca Master antes de promover cada fluxo ativo (obrigatório ≥2 caracteres). */
  const [masterPromoteTitles, setMasterPromoteTitles] = useState<Record<string, string>>({});
  const [editingMasterTitleFlowId, setEditingMasterTitleFlowId] = useState<string | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState("");
  /** Etapa atual (1–3) no fluxo de configuração do workspace. */
  const [masterWizardStep, setMasterWizardStep] = useState(1);
  /** Maior etapa já desbloqueada (avança ao concluir etapa anterior). */
  const [masterWizardUnlocked, setMasterWizardUnlocked] = useState(1);
  /** Exibe botão da etapa 1 somente após upload da imagem nesta sessão da etapa. */
  const [profileImageUploadedInStep, setProfileImageUploadedInStep] = useState(false);
  /** Etapa 2 só conclui quando usuário clica em "Continuar". */
  const [step2ConfirmedByTenant, setStep2ConfirmedByTenant] = useState<Record<string, true>>({});
  const [masterWizardConfirmedByTenant, setMasterWizardConfirmedByTenant] = useState(() =>
    loadMasterWizardConfirmedByTenant(),
  );
  const [wizardWorkspaceSnapshot, setWizardWorkspaceSnapshot] = useState({
    labelsCount: 0,
    prioritiesCount: 0,
    kanbanPersisted: false,
    loaded: false,
  });
  const wizardStepUserPinnedRef = useRef(false);
  const lastPendingCountRef = useRef(0);
  const isPendingCountBootstrappedRef = useRef(false);

  const selectedTenantObject = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenant),
    [selectedTenant, tenants],
  );
  const masterProfile = useMemo<MasterProfile>(() => {
    if (authSession?.masterProfile) return authSession.masterProfile;
    const currentEmail = selectedTenantObject?.ownerEmail?.trim().toLowerCase();
    if (currentEmail && currentEmail === SYSTEM_MASTER_EMAIL) {
      return "system_master";
    }
    return "subscriber_master";
  }, [authSession, selectedTenantObject]);
  const allowedScreens = useMemo<ScreenId[]>(() => {
    const role = authSession?.user?.role;
    if (role === "attendant") return ["kanban", "liveQueue", "scheduling", "clientList"];
    return masterProfile === "system_master"
      ? ["masterLibrary", "subscribers", "kanban", "scheduling", "clientList"]
      : ["master", "kanban", "liveQueue", "scheduling", "clientList"];
  }, [masterProfile, authSession]);
  const filteredTenants = useMemo(
    () =>
      tenants.filter((tenant) => {
        const statusMatch = subscriberStatusFilter === "all" ? true : tenant.status === subscriberStatusFilter;
        return statusMatch;
      }),
    [tenants, subscriberStatusFilter],
  );

  const editingTenant = useMemo(
    () => (editingTenantId ? (tenants.find((t) => t.id === editingTenantId) ?? null) : null),
    [editingTenantId, tenants],
  );
  const selectedTenantFlows = useMemo(
    () => (selectedTenant ? (savedFlowsByTenant[selectedTenant] ?? []) : []),
    [savedFlowsByTenant, selectedTenant],
  );
  const selectableFlowLibrary = useMemo(() => {
    const directLibrary = flowLibrary.filter(
      (item) => item.id !== "template-placeholder" && item.title !== "Modelo (substitua a URL)",
    );
    const fromSystemDefaults = systemMasterLibrary
      .filter((item) => item.isSystemDefault)
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        suggestedNickname: item.suggestedNickname,
        viewerUrl: item.viewerUrl,
      }));
    const fromActiveMatrix = dedupeMasterLibraryFlows(sourceMasterFlows).map((flow) => ({
        id: flow.librarySourceId?.trim() || flow.id,
        title: flow.displayLabel?.trim() || flow.nickname,
        description: "Fluxo ativo no workspace matriz",
        suggestedNickname: flow.nickname,
        viewerUrl: flow.url,
      }));
    const base = directLibrary.length > 0 ? directLibrary : fromSystemDefaults;
    const byId = new Map<string, FlowLibraryItem>();
    for (const item of [...base, ...fromActiveMatrix]) byId.set(item.id, item);
    return [...byId.values()];
  }, [flowLibrary, systemMasterLibrary, sourceMasterFlows]);
  const libraryLinkedFlows = useMemo(
    () => selectedTenantFlows.filter((flow) => Boolean(flow.librarySourceId)),
    [selectedTenantFlows],
  );
  /** Fluxos do assinante sem vínculo ao catálogo da Biblioteca Master (builder Typebot ou URL manual na API). */
  const workspaceOnlyFlows = useMemo(
    () => selectedTenantFlows.filter((flow) => !flow.librarySourceId),
    [selectedTenantFlows],
  );
  /** Com Typebot provisionado (ou conta matriz), a etapa 6 lista todos os fluxos retornados pela API. */
  const tenantWorkspaceFlowsForStep6 = useMemo(() => {
    if (
      selectedTenantObject &&
      (isSystemMasterTenant(selectedTenantObject) || isTenantTypebotProvisioned(selectedTenantObject))
    ) {
      return selectedTenantFlows;
    }
    return workspaceOnlyFlows;
  }, [selectedTenantFlows, selectedTenantObject, workspaceOnlyFlows]);
  const activeWorkspaceOnlyFlows = useMemo(
    () =>
      workspaceOnlyFlows.filter((flow) => {
        const status = flowStatuses[flow.id];
        return status === "active" || status === "checking";
      }),
    [workspaceOnlyFlows, flowStatuses],
  );
  const normalizeFlowText = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();
  const libraryFlowRows = useMemo(
    () =>
      selectableFlowLibrary.map((item) => {
        const normalizedTitle = normalizeFlowText(item.title);
        const normalizedSuggestedNickname = normalizeFlowText(item.suggestedNickname);
        const matchingFlows = libraryLinkedFlows.filter((flow) => {
          const flowLabel = normalizeFlowText(flow.displayLabel ?? flow.nickname);
          const flowNickname = normalizeFlowText(flow.nickname);
          const byLibraryId = flow.librarySourceId === item.id;
          const byLabel =
            (normalizedTitle && flowLabel === normalizedTitle) ||
            (normalizedSuggestedNickname && flowNickname === normalizedSuggestedNickname);
          const byMasterViewer = flow.url.trim() === item.viewerUrl.trim();
          return byLibraryId || byLabel || byMasterViewer;
        });
        const linkedFlow =
          matchingFlows.find((flow) => flow.url.trim() !== item.viewerUrl.trim()) ??
          matchingFlows.find((flow) => flow.librarySourceId === item.id) ??
          matchingFlows.find((flow) => flow.url.trim() === item.viewerUrl.trim()) ??
          null;
        const healthStatus = linkedFlow
          ? flowStatuses[linkedFlow.id] ??
            (linkedFlow.viewerUrlActive !== false ? "active" : "inactive")
          : "inactive";
        const status: FlowStatus =
          healthStatus === "active" || healthStatus === "checking" ? "active" : "inactive";
        return {
          item,
          linkedFlow,
          status,
          healthStatus,
          isIncluded: Boolean(linkedFlow),
        };
      }),
    [selectableFlowLibrary, libraryLinkedFlows, flowStatuses],
  );
  /** Fluxos ativos no catálogo (etapa 6). Se vazio, a UI mostra o catálogo completo como fallback. */
  const activeLibraryFlowRows = useMemo(
    () => libraryFlowRows.filter((row) => row.healthStatus === "active"),
    [libraryFlowRows],
  );
  const visibleLibraryFlowRows =
    activeLibraryFlowRows.length > 0 ? activeLibraryFlowRows : libraryFlowRows;
  /** Biblioteca Master: só fluxos Live do tenant matriz Walkup (typebotRemoteId + owner walkup). */
  const walkupMasterLibraryFlows = useMemo(
    () => dedupeMasterLibraryFlows(sourceMasterFlows),
    [sourceMasterFlows],
  );
  const activeMatrixSourceFlows = walkupMasterLibraryFlows;
  const hasAnyFlowListedInStep6 =
    visibleLibraryFlowRows.length > 0 ||
    tenantWorkspaceFlowsForStep6.length > 0 ||
    activeMatrixSourceFlows.length > 0;
  const unpublishedSourceMasterFlows = useMemo(
    () =>
      walkupMasterLibraryFlows.filter((flow) => {
        const flowUrl = flow.url.trim().toLowerCase();
        return !systemMasterLibrary.some((item) => {
          const bySourceId = item.sourceFlowId === flow.id;
          const byViewerUrl = item.viewerUrl.trim().toLowerCase() === flowUrl;
          return bySourceId || byViewerUrl;
        });
      }),
    [walkupMasterLibraryFlows, systemMasterLibrary],
  );
  const systemDefaultLibraryIds = useMemo(
    () => new Set(systemMasterLibrary.filter((item) => item.isSystemDefault).map((item) => item.id)),
    [systemMasterLibrary],
  );
  const activeCreatedFlows = useMemo(
    () => selectedTenantFlows.filter((flow) => flowStatuses[flow.id] === "active"),
    [selectedTenantFlows, flowStatuses],
  );
  const visibleAttendants = useMemo(() => {
    const currentUsername = String(authSession?.user?.username ?? "")
      .trim()
      .toLowerCase();
    const currentEmail = String(authSession?.user?.email ?? "")
      .trim()
      .toLowerCase();
    if (!currentUsername && !currentEmail) return attendants;
    return attendants.filter((row) => {
      const rowUsername = String(row.username ?? "")
        .trim()
        .toLowerCase();
      const rowEmail = String(row.email ?? "")
        .trim()
        .toLowerCase();
      return rowUsername !== currentUsername && rowEmail !== currentEmail;
    });
  }, [attendants, authSession]);
  const isStep1Completed = useMemo(
    () =>
      Boolean(
        selectedTenantObject?.profileImageUrl?.trim() &&
          (selectedTenantObject?.chatDisplayName?.trim().length ?? 0) >= 2,
      ),
    [selectedTenantObject],
  );
  const isStep1FormReady = useMemo(
    () =>
      Boolean(
        tenantProfileImageUrl.trim() &&
          shareImageUrl.trim() &&
          primaryWhatsapp.trim() &&
          leadChatDisplayName.trim().length >= 2,
      ),
    [tenantProfileImageUrl, shareImageUrl, primaryWhatsapp, leadChatDisplayName],
  );
  const isStep2Completed = Boolean(
    selectedTenant &&
      (step2ConfirmedByTenant[selectedTenant] === true || selectedTenantObject?.noSeparateAttendants === true),
  );
  const isFlowsWizardStepCompleted = selectedTenantFlows.length > 0;
  const wizardStepCompletion = useMemo((): MasterWizardStepCompletion => {
    const confirmed = selectedTenant ? masterWizardConfirmedByTenant[selectedTenant] : undefined;
    return {
      step1: isStep1Completed,
      step2: isStep2Completed,
      step3: wizardWorkspaceSnapshot.labelsCount > 0 || Boolean(confirmed?.step3),
      step4: wizardWorkspaceSnapshot.prioritiesCount > 0 || Boolean(confirmed?.step4),
      step5: wizardWorkspaceSnapshot.kanbanPersisted || Boolean(confirmed?.step5),
      step6: isFlowsWizardStepCompleted,
    };
  }, [
    isStep1Completed,
    isStep2Completed,
    isFlowsWizardStepCompleted,
    masterWizardConfirmedByTenant,
    selectedTenant,
    wizardWorkspaceSnapshot,
  ]);
  const firstIncompleteWizardStep = useMemo(
    () => resolveFirstIncompleteWizardStep(wizardStepCompletion),
    [wizardStepCompletion],
  );
  const pendingQueueCount = useMemo(
    () => queueItems.filter((item) => item.status === "waiting").length,
    [queueItems],
  );
  function playPendingLeadAlertTone(repeats = 1) {
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const audioContext = new AudioContextCtor();
      const now = audioContext.currentTime;
      const totalRepeats = Math.max(1, Math.min(3, repeats));
      for (let i = 0; i < totalRepeats; i += 1) {
        const start = now + i * 0.24;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(880, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.2);
      }
      window.setTimeout(() => {
        void audioContext.close().catch(() => undefined);
      }, 1200);
    } catch {
      // ignore audio restrictions
    }
  }

  async function loadTenants() {
    setIsLoadingTenants(true);
    try {
      const response = await fetch(`${apiBase}/api/master/tenants`);
      if (!response.ok) {
        throw new Error("Falha ao carregar assinantes");
      }
      const data = (await response.json()) as Tenant[];
      setTenants(data);
      if (!selectedTenant && data[0]) {
        const preferredTenantId = authSession?.tenant?.id;
        const preferred = preferredTenantId ? data.find((tenant) => tenant.id === preferredTenantId) : null;
        setSelectedTenant(preferred?.id ?? data[0].id);
      }
    } finally {
      setIsLoadingTenants(false);
    }
  }

  async function loadQueue(tenantId: string) {
    if (!tenantId) return;
    const response = await fetch(`${apiBase}/api/chat/queue`, {
      headers: { "x-tenant-id": tenantId },
    });
    const data = (await response.json()) as QueueContact[];
    const normalized = data.map((item) => ({
      ...item,
      assignedAgentName: resolveQueueItemAssignedAgentName(item, attendants),
    }));
    setQueueItems(normalized);
  }

  async function loadWizardWorkspaceSnapshot(tenantId: string) {
    if (!tenantId) {
      setWizardWorkspaceSnapshot({ labelsCount: 0, prioritiesCount: 0, kanbanPersisted: false, loaded: false });
      return;
    }
    try {
      const [labelsRes, prioritiesRes, kanbanRes] = await Promise.all([
        fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/labels`),
        fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/priorities`),
        fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/kanban-config`),
      ]);
      let labelsCount = 0;
      let prioritiesCount = 0;
      let kanbanPersisted = false;
      if (labelsRes.ok) {
        const rows = (await labelsRes.json()) as unknown[];
        labelsCount = Array.isArray(rows) ? rows.length : 0;
      }
      if (prioritiesRes.ok) {
        const rows = (await prioritiesRes.json()) as unknown[];
        prioritiesCount = Array.isArray(rows) ? rows.length : 0;
      }
      if (kanbanRes.ok) {
        const payload = (await kanbanRes.json()) as { isPersisted?: boolean };
        kanbanPersisted = Boolean(payload.isPersisted);
      }
      setWizardWorkspaceSnapshot({ labelsCount, prioritiesCount, kanbanPersisted, loaded: true });
    } catch {
      setWizardWorkspaceSnapshot({ labelsCount: 0, prioritiesCount: 0, kanbanPersisted: false, loaded: true });
    }
  }

  function goToWizardStep(step: MasterWizardStepIndex, options?: { userPinned?: boolean }) {
    if (options?.userPinned !== false) {
      wizardStepUserPinnedRef.current = true;
    }
    const unlocked = resolveWizardUnlockedStep(wizardStepCompletion);
    if (step > unlocked) return;
    setMasterWizardStep(step);
    setMasterWizardUnlocked(unlocked);
  }

  async function loadMasterClientDirectory() {
    const response = await fetch(`${apiBase}/api/master/queue/contacts`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Falha ao carregar lista global de clientes");
    }
    const data = (await response.json()) as QueueContact[];
    setMasterClientContacts(data);
  }

  const flowListSignature = (flows: SavedFlow[]) =>
    flows
      .map(
        (flow) =>
          `${flow.id}|${flow.url}|${flow.nickname}|${flow.displayLabel ?? ""}|${flow.librarySourceId ?? ""}`,
      )
      .sort()
      .join("\n");

  function applyFlowStatusesFromList(flows: SavedFlow[]) {
    if (flows.length === 0) return;
    setFlowStatuses((current) => {
      const next = { ...current };
      let changed = false;
      for (const flow of flows) {
        const status: FlowStatus = flow.viewerUrlActive !== false ? "active" : "inactive";
        if (next[flow.id] !== status) {
          next[flow.id] = status;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  async function refreshFlowStatuses(flows: SavedFlow[]) {
    if (flows.length === 0) return;
    const results = await Promise.all(
      flows.map(async (flow) => {
        try {
          const params = new URLSearchParams({ url: flow.url });
          const remoteId = flow.typebotRemoteId?.trim();
          const publicId = flow.typebotPublicId?.trim();
          if (remoteId) params.set("typebotRemoteId", remoteId);
          if (publicId) params.set("typebotPublicId", publicId);
          const response = await fetch(`${apiBase}/api/typebot/flow-status?${params.toString()}`);
          const data = (await response.json()) as { status: "active" | "inactive" };
          return { flowId: flow.id, status: data.status as FlowStatus };
        } catch {
          return { flowId: flow.id, status: "inactive" as FlowStatus };
        }
      }),
    );
    setFlowStatuses((current) => {
      const next = { ...current };
      let changed = false;
      for (const flow of flows) {
        if (!(flow.id in next)) {
          next[flow.id] = "checking";
          changed = true;
        }
      }
      for (const item of results) {
        if (next[item.flowId] !== item.status) {
          next[item.flowId] = item.status;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  async function syncFlowsFromTypebotWorkspace(tenantId: string) {
    if (!tenantId) return;
    setStatusMessage("Sincronizando fluxos do workspace Typebot…");
    const response = await fetch(`${apiBase}/api/master/tenants/${tenantId}/flows/sync-workspace`, {
      method: "POST",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      imported?: number;
      pruned?: number;
      skipReason?: string;
    };
    if (!response.ok) {
      setStatusMessage(payload.message ?? "Falha ao sincronizar fluxos do Typebot.");
      return;
    }
    const parts: string[] = [];
    if (payload.imported && payload.imported > 0) {
      parts.push(`${payload.imported} importado(s)`);
    }
    if (payload.pruned && payload.pruned > 0) {
      parts.push(`${payload.pruned} removido(s) (fora do workspace)`);
    }
    if (parts.length > 0) {
      setStatusMessage(`Sincronização: ${parts.join("; ")}.`);
    } else if (payload.skipReason) {
      setStatusMessage(`Nenhuma alteração (${payload.skipReason}).`);
    } else {
      setStatusMessage("Sincronização concluída. Lista alinhada ao workspace Typebot.");
    }
    await loadFlows(tenantId);
  }

  async function loadFlows(tenantId: string, options?: { silentList?: boolean }) {
    if (!tenantId) return;
    const response = await fetch(`${apiBase}/api/master/tenants/${tenantId}/flows`);
    if (!response.ok) {
      throw new Error("Falha ao carregar fluxos");
    }
    const data = (await response.json()) as SavedFlow[];
    setSavedFlowsByTenant((current) => {
      const previous = current[tenantId] ?? [];
      if (options?.silentList && flowListSignature(previous) === flowListSignature(data)) {
        return current;
      }
      return { ...current, [tenantId]: data };
    });
    applyFlowStatusesFromList(data);
    const needsProbe = data.some((flow) => flow.viewerUrlActive === undefined);
    if (needsProbe) {
      await refreshFlowStatuses(data);
    }
  }

  async function loadAttendants(tenantId: string) {
    if (!tenantId) return;
    setIsLoadingAttendants(true);
    try {
      const response = await fetch(`${apiBase}/api/master/tenants/${tenantId}/attendants`);
      if (!response.ok) {
        throw new Error("Falha ao carregar atendentes");
      }
      const data = (await response.json()) as AttendantRow[];
      setAttendants(data);
    } finally {
      setIsLoadingAttendants(false);
    }
  }

  async function loadFlowLibrary() {
    const response = await fetch(`${apiBase}/api/master/flow-library`);
    if (!response.ok) return;
    const data = (await response.json()) as FlowLibraryItem[];
    setFlowLibrary(data);
    setSelectedLibraryId((current) => (current && data.some((item) => item.id === current) ? current : ""));
  }

  async function loadMasterLibrarySourceFlows(options?: { silent?: boolean }) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const syncResponse = await fetch(`${apiBase}/api/master/system-library/sync-source`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!syncResponse.ok && !options?.silent) {
        setStatusMessage("Não foi possível sincronizar com o Typebot. Tente novamente.");
      }

      const response = await fetch(`${apiBase}/api/master/system-library/source-flows`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        if (!options?.silent) setStatusMessage("Falha ao carregar fluxos da matriz (API).");
        return;
      }
      const data = (await response.json()) as SavedFlow[];
      const filtered = dedupeMasterLibraryFlows(data);
      setSourceMasterFlows(filtered);
      if (!options?.silent) {
        if (filtered.length > 0) {
          setStatusMessage(`Lista atualizada: ${filtered.length} fluxo(s) Live.`);
        }
      }
    } catch {
      if (!options?.silent) {
        setStatusMessage("Falha ao atualizar lista. Tente novamente.");
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function refreshTenantFlowList(tenantId: string) {
    if (!tenantId) return;
    setStatusMessage("Atualizando lista de fluxos…");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const syncResponse = await fetch(`${apiBase}/api/master/tenants/${tenantId}/flows/sync-workspace`, {
        method: "POST",
        signal: controller.signal,
      });
      const syncPayload = (await syncResponse.json().catch(() => ({}))) as {
        message?: string;
        imported?: number;
        pruned?: number;
        metadataRepublished?: number;
        skipReason?: string;
        typebotsScanned?: number;
      };
      if (!syncResponse.ok) {
        setStatusMessage(syncPayload.message ?? "Falha ao sincronizar fluxos do Typebot.");
        return;
      }
      const parts: string[] = [];
      if (syncPayload.imported && syncPayload.imported > 0) parts.push(`${syncPayload.imported} importado(s)`);
      if (syncPayload.pruned && syncPayload.pruned > 0) parts.push(`${syncPayload.pruned} removido(s)`);
      if (syncPayload.metadataRepublished && syncPayload.metadataRepublished > 0) {
        parts.push(`${syncPayload.metadataRepublished} republicado(s) para compartilhamento`);
      }
      await loadFlows(tenantId);
      const imported = Number(syncPayload.imported ?? 0);
      const scanned = Number(syncPayload.typebotsScanned ?? 0);
      if (imported > 0) {
        setStatusMessage(`Lista atualizada: ${imported} fluxo(s) importado(s).`);
      } else if (syncPayload.skipReason === "builder_api_token_missing") {
        setStatusMessage("Token da API Typebot ausente no servidor. Configure TYPEBOT_TARGET_BUILDER_API_TOKEN na API.");
      } else if (syncPayload.skipReason === "workspace_not_matched") {
        setStatusMessage("Workspace Typebot não encontrado para este assinante. Confira o vínculo em Assinantes.");
      } else if (syncPayload.skipReason === "workspace_typebots_empty" && scanned === 0) {
        setStatusMessage("Nenhum typebot no workspace. Crie e publique um fluxo no builder Typebot e clique em Atualizar lista.");
      } else if (syncPayload.skipReason) {
        setStatusMessage(`Lista atualizada (${syncPayload.skipReason}).`);
      } else {
        setStatusMessage("Lista de fluxos atualizada.");
      }
    } catch {
      setStatusMessage("Falha ao atualizar lista. Tente novamente.");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function loadSystemMasterLibrary() {
    const response = await fetch(`${apiBase}/api/master/system-library`);
    if (!response.ok) return;
    const data = (await response.json()) as SystemMasterLibraryItem[];
    setSystemMasterLibrary(data);
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AuthSession;
      if (parsed?.user?.id && parsed?.tenant?.id) {
        setAuthSession(parsed);
        setSelectedTenant(parsed.tenant.id);
      }
    } catch {
      // ignore storage parsing errors
    }
  }, []);

  useEffect(() => {
    if (authSession) {
      setApiReachable(null);
      return;
    }
    let cancelled = false;
    const probeApi = async () => {
      try {
        const response = await fetch(`${apiBase}/health`, { cache: "no-store" });
        if (!cancelled) setApiReachable(response.ok);
      } catch {
        if (!cancelled) setApiReachable(false);
      }
    };
    void probeApi();
    return () => {
      cancelled = true;
    };
  }, [authSession]);

  useEffect(() => {
    if (!authSession) return;
    loadTenants().catch(() => setStatusMessage("Falha ao carregar assinantes"));
  }, [authSession]);

  useEffect(() => {
    setStep2ConfirmedByTenant((current) => {
      const fromWizard = loadMasterWizardConfirmedByTenant();
      const merged = { ...current };
      for (const [tenantId, steps] of Object.entries(fromWizard)) {
        if (steps.step2) merged[tenantId] = true;
      }
      return merged;
    });
    setMasterWizardConfirmedByTenant(loadMasterWizardConfirmedByTenant());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("drax-admin-sidebar-collapsed", isSidebarCollapsed ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!authSession) return;
    loadFlowLibrary().catch(() => undefined);
    loadMasterLibrarySourceFlows({ silent: true }).catch(() => undefined);
    loadSystemMasterLibrary().catch(() => undefined);
  }, [authSession]);

  useEffect(() => {
    if (activeScreen !== "masterLibrary") return;
    void loadMasterLibrarySourceFlows({ silent: true });
    void loadSystemMasterLibrary();
  }, [activeScreen]);

  useEffect(() => {
    if (!selectedTenant) return;
    const run = async () => {
      await loadAttendants(selectedTenant);
      await loadQueue(selectedTenant);
      await loadFlows(selectedTenant);
    };
    run().catch(() => setStatusMessage("Falha ao carregar dados do assinante"));
  }, [selectedTenant]);

  /** Na etapa Biblioteca de Fluxos, inclui automaticamente cada fluxo padrão da Biblioteca Master. */
  useEffect(() => {
    if (masterWizardStep !== MASTER_WIZARD_FLOWS_STEP || !selectedTenant || masterProfile !== "subscriber_master") return;
    if (selectedTenantObject && isTenantTypebotProvisioned(selectedTenantObject)) return;
    const defaultIds = systemMasterLibrary.filter((item) => item.isSystemDefault).map((item) => item.id);
    if (defaultIds.length === 0) return;
    const flows = savedFlowsByTenant[selectedTenant] ?? [];
    const missingId = defaultIds.find((libId) => !flows.some((flow) => flow.librarySourceId === libId));
    if (!missingId) return;

    void (async () => {
      const response = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/flows/from-library`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ libraryItemId: missingId }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { message?: string };
        setStatusMessage(err.message ?? "Falha ao incluir fluxo padrão na biblioteca do assinante.");
        return;
      }
      const created = (await response.json()) as SavedFlow;
      setFlowStatuses((current) => ({ ...current, [created.id]: "active" }));
      setStatusMessage("Fluxo padrão incluído na biblioteca.");
      await loadFlows(selectedTenant);
    })();
  }, [
    masterWizardStep,
    selectedTenant,
    masterProfile,
    systemMasterLibrary,
    savedFlowsByTenant,
  ]);

  useEffect(() => {
    setTenantProfileImageUrl(selectedTenantObject?.profileImageUrl ?? "");
    setLeadChatDisplayName(selectedTenantObject?.chatDisplayName ?? "");
    setShareImageUrl(selectedTenantObject?.shareImageUrl ?? "");
    setPrimaryWhatsapp(selectedTenantObject?.whatsapp ?? "");
    setUseWhatsappSecondOption(selectedTenantObject?.useWhatsappSecondOption !== false);
    setQueueDistributionMode(selectedTenantObject?.queueDistributionMode ?? "shared_pool");
    setNoSeparateAttendants(selectedTenantObject?.noSeparateAttendants === true);
  }, [selectedTenantObject]);

  useEffect(() => {
    if (!selectedTenant) return;
    wizardStepUserPinnedRef.current = false;
    setProfileImageUploadedInStep(false);
    setWizardWorkspaceSnapshot({ labelsCount: 0, prioritiesCount: 0, kanbanPersisted: false, loaded: false });
    void loadWizardWorkspaceSnapshot(selectedTenant);
  }, [selectedTenant]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(""), 3800);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!selectedTenant || !wizardWorkspaceSnapshot.loaded) return;
    const unlocked = resolveWizardUnlockedStep(wizardStepCompletion);
    setMasterWizardUnlocked(unlocked);
    if (wizardStepUserPinnedRef.current) return;
    setMasterWizardStep(resolveFirstIncompleteWizardStep(wizardStepCompletion));
  }, [selectedTenant, wizardWorkspaceSnapshot.loaded, wizardStepCompletion]);

  useEffect(() => {
    if (!selectedTenant || masterProfile === "system_master") return;
    void loadQueue(selectedTenant).catch(() => undefined);
    const timer = window.setInterval(() => {
      loadQueue(selectedTenant).catch(() => undefined);
    }, QUEUE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [selectedTenant, attendants, masterProfile]);

  useEffect(() => {
    if (!authSession || masterProfile !== "system_master" || (activeScreen !== "clientList" && activeScreen !== "scheduling")) return;
    void loadMasterClientDirectory().catch(() => setStatusMessage("Falha ao carregar lista global de clientes"));
    const timer = window.setInterval(() => {
      loadMasterClientDirectory().catch(() => undefined);
    }, QUEUE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [authSession, masterProfile, activeScreen]);

  useEffect(() => {
    if (!selectedTenant || activeScreen !== "master") return;
    if (masterWizardStep === 3 || masterWizardStep === 4 || masterWizardStep === 5) {
      void loadWizardWorkspaceSnapshot(selectedTenant);
    }
  }, [selectedTenant, activeScreen, masterWizardStep]);

  useEffect(() => {
    if (!selectedTenant || activeScreen !== "master" || masterWizardStep !== MASTER_WIZARD_FLOWS_STEP) return;
    const refreshLibrary = async () => {
      await loadFlows(selectedTenant, { silentList: true });
    };
    void refreshLibrary().catch(() => undefined);
    const libraryTimer = window.setInterval(() => {
      void refreshLibrary().catch(() => undefined);
    }, FLOW_LIBRARY_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(libraryTimer);
  }, [selectedTenant, activeScreen, masterWizardStep]);

  useEffect(() => {
    if (!isPendingCountBootstrappedRef.current) {
      lastPendingCountRef.current = pendingQueueCount;
      isPendingCountBootstrappedRef.current = true;
      return;
    }
    if (pendingQueueCount > lastPendingCountRef.current) {
      playPendingLeadAlertTone(pendingQueueCount - lastPendingCountRef.current);
    }
    lastPendingCountRef.current = pendingQueueCount;
  }, [pendingQueueCount]);

  useEffect(() => {
    if (allowedScreens.includes(activeScreen)) return;
    setActiveScreen(allowedScreens[0] ?? "master");
  }, [allowedScreens, activeScreen]);

  useEffect(() => {
    if (didMigrateLocalFlows || tenants.length === 0) return;
    const raw = localStorage.getItem("typebot-saas-saved-flows");
    if (!raw) {
      setDidMigrateLocalFlows(true);
      return;
    }

    const migrate = async () => {
      try {
        const localFlows = JSON.parse(raw) as Record<string, SavedFlow[]>;
        for (const tenant of tenants) {
          const tenantFlows = localFlows[tenant.id] ?? [];
          for (const flow of tenantFlows) {
            await fetch(`${apiBase}/api/master/tenants/${tenant.id}/flows`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ nickname: flow.nickname, url: flow.url }),
            });
          }
          await loadFlows(tenant.id);
        }
      } catch {
        setStatusMessage("Falha ao migrar fluxos locais antigos.");
      } finally {
        setDidMigrateLocalFlows(true);
      }
    };

    migrate().catch(() => {
      setStatusMessage("Falha ao migrar fluxos locais antigos.");
      setDidMigrateLocalFlows(true);
    });
  }, [didMigrateLocalFlows, tenants]);

  async function createTenant() {
    const response = await fetch(`${apiBase}/api/master/tenants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: newTenantName,
        ownerEmail: newTenantEmail,
        whatsapp: newTenantWhatsapp,
        initialPassword: newTenantPassword,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({ message: "Não foi possível criar assinante" }))) as {
        message?: string;
      };
      setStatusMessage(errorData.message ?? "Não foi possível criar assinante");
      return false;
    }

    setStatusMessage("Assinante criado. Defina a imagem da marca no Master Console (Perfil de atendimento).");
    resetSubscriberForm();
    await loadTenants();
    return true;
  }

  function resetSubscriberForm() {
    setNewTenantName("");
    setNewTenantEmail("");
    setNewTenantWhatsapp("");
    setNewTenantTypebotWorkspaceId("");
    setNewTenantTypebotAccessUrl("");
    setNewTenantPassword("");
    setEditingTenantId(null);
  }

  function openCreateSubscriberModal() {
    resetSubscriberForm();
    setIsSubscriberModalOpen(true);
  }

  function openEditSubscriberModal(tenant: Tenant) {
    setEditingTenantId(tenant.id);
    setNewTenantName(tenant.name);
    setNewTenantEmail(tenant.ownerEmail);
    setNewTenantWhatsapp(tenant.whatsapp ?? "");
    setNewTenantTypebotWorkspaceId(String(tenant.typebotWorkspaceId ?? "").trim());
    setNewTenantTypebotAccessUrl(String(tenant.typebotAccessUrl ?? "").trim());
    setIsSubscriberModalOpen(true);
  }

  async function saveSubscriber() {
    if (!newTenantName.trim() || !newTenantEmail.trim() || !newTenantWhatsapp.trim()) {
      setStatusMessage("Preencha nome, e-mail e WhatsApp do assinante.");
      return;
    }
    if (!editingTenantId && newTenantPassword.trim().length < 4) {
      setStatusMessage("Informe a senha inicial com no mínimo 4 caracteres.");
      return;
    }

    setIsSavingSubscriber(true);
    try {
      if (!editingTenantId) {
        const created = await createTenant();
        if (created) {
          setIsSubscriberModalOpen(false);
        }
        return;
      }

      const response = await fetch(`${apiBase}/api/master/tenants/${editingTenantId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newTenantName,
          ownerEmail: newTenantEmail,
          whatsapp: newTenantWhatsapp,
          typebotWorkspaceId: newTenantTypebotWorkspaceId.trim(),
          typebotAccessUrl: newTenantTypebotAccessUrl.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({ message: "Não foi possível atualizar assinante" }))) as {
          message?: string;
        };
        setStatusMessage(errorData.message ?? "Não foi possível atualizar assinante");
        return;
      }

      setStatusMessage("Assinante atualizado com sucesso");
      setIsSubscriberModalOpen(false);
      resetSubscriberForm();
      await loadTenants();
    } finally {
      setIsSavingSubscriber(false);
    }
  }

  async function toggleStatus(tenant: Tenant) {
    const nextStatus = tenant.status === "active" ? "blocked" : "active";
    const response = await fetch(`${apiBase}/api/master/tenants/${tenant.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!response.ok) {
      setStatusMessage("Falha ao atualizar status");
      return;
    }

    setStatusMessage(`Status atualizado para ${nextStatus}`);
    await loadTenants();
  }

  async function assignContact(contactId: string, contactName: string) {
    const useMasterOnly = selectedTenantObject?.noSeparateAttendants === true;
    const masterUsername = authSession?.user?.username?.trim();
    const resolvedAgentId =
      useMasterOnly && masterUsername ? masterUsername : agentId;
    const loggedAgentName =
      resolveSessionUserDisplayName(authSession?.user) || resolvedAgentId;
    const response = await fetch(`${apiBase}/api/chat/queue/${contactId}/assign`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": selectedTenant,
      },
      body: JSON.stringify({ agentId: resolvedAgentId, agentName: loggedAgentName }),
    });

    if (!response.ok) {
      setStatusMessage("Não foi possível assumir o atendimento");
      return;
    }

    setStatusMessage("Atendimento assumido com sucesso");
    window.open(
      getAgentViewUrlNewTab(selectedTenant, contactId, resolvedAgentId, loggedAgentName, contactName),
      "_blank",
    );
    await loadQueue(selectedTenant);
  }

  function openLeadDetailModal(item: QueueContact) {
    setSelectedLeadContactId(item.contactId);
    setSelectedLeadTenantId(item.tenantId);
    setIsLeadDetailModalOpen(true);
  }

  function openLeadDetailByContactId(contactId: string) {
    const source = masterProfile === "system_master" ? masterClientContacts : queueItems;
    const item = source.find((row) => row.contactId === contactId);
    if (!item) return;
    openLeadDetailModal(item);
  }

  async function saveTenantFlow() {
    if (!selectedTenant) {
      setStatusMessage("Selecione um assinante antes de salvar o fluxo.");
      return;
    }
    if (!newFlowNickname.trim()) {
      setStatusMessage("Informe um apelido para o fluxo.");
      return;
    }
    if (!newFlowUrl.trim()) {
      setStatusMessage("Informe a URL do fluxo para salvar.");
      return;
    }

    const response = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/flows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nickname: newFlowNickname.trim(),
        url: newFlowUrl.trim(),
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({ message: "Falha ao salvar fluxo" }))) as {
        message?: string;
      };
      setStatusMessage(errorData.message ?? "Falha ao salvar fluxo");
      return;
    }

    await loadFlows(selectedTenant);
    setStatusMessage("Fluxo salvo com sucesso.");
    setNewFlowNickname("");
    setNewFlowUrl("");
    setIsFlowModalOpen(false);
  }

  /** Grava imagem no servidor e aplica tema (chamado automaticamente ao escolher ficheiro). */
  async function persistProfileImageToServer(imageData: string): Promise<boolean> {
    if (!selectedTenant) {
      setStatusMessage("Selecione um assinante.");
      return false;
    }
    const trimmed = imageData.trim();
    if (!trimmed) return false;
    /** Mantém no mesmo PATCH dados já preenchidos no formulário para não perder preview ao recarregar o tenant. */
    const profilePatch: Record<string, unknown> = { profileImageUrl: trimmed };
    const shareTrimmed = shareImageUrl.trim();
    if (shareTrimmed) profilePatch.shareImageUrl = shareTrimmed;
    const whatsappTrimmed = primaryWhatsapp.trim();
    if (whatsappTrimmed.length >= 8) profilePatch.whatsapp = whatsappTrimmed;
    const chatNameTrimmed = leadChatDisplayName.trim();
    if (chatNameTrimmed.length >= 2) profilePatch.chatDisplayName = chatNameTrimmed;
    profilePatch.useWhatsappSecondOption = useWhatsappSecondOption;
    profilePatch.queueDistributionMode = queueDistributionMode;
    profilePatch.noSeparateAttendants = noSeparateAttendants;

    const response = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/profile-image`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profilePatch),
    });
    if (!response.ok) {
      setStatusMessage("Falha ao guardar imagem de perfil.");
      return false;
    }
    if (trimmed.startsWith("data:image/") || trimmed.startsWith("http")) {
      const hex = await extractDominantHexFromImageSrc(trimmed);
      if (hex) {
        const themeRes = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/chat-theme`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            templateName: "Padrão Sistema",
            userBubbleBg: hex,
          }),
        });
        if (themeRes.ok) {
          const flows = savedFlowsByTenant[selectedTenant] ?? [];
          for (const flow of flows) {
            await fetch(`${apiBase}/api/master/flows/${flow.id}/theme`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                redirectTheme: {
                  userBubbleBg: hex,
                  profileImageUrl: trimmed.startsWith("http") ? trimmed : undefined,
                },
              }),
            });
          }
        }
      }
    }
    setStatusMessage("");
    await loadTenants();
    await loadFlows(selectedTenant);
    setProfileImageUploadedInStep(true);
    return true;
  }

  async function saveLeadChatDisplayName(): Promise<boolean> {
    if (!selectedTenant) return false;
    const v = leadChatDisplayName.trim();
    if (v.length === 1) {
      setStatusMessage("Nome no chat: use pelo menos 2 caracteres ou deixe vazio para usar o nome do assinante.");
      return false;
    }
    const body =
      v.length === 0 ? { chatDisplayName: "" } : { chatDisplayName: v };
    const response = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/profile-image`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setStatusMessage("Falha ao guardar nome exibido no chat.");
      return false;
    }
    await loadTenants().catch(() => undefined);
    return true;
  }

  async function saveShareMetadata(): Promise<boolean> {
    if (!selectedTenant) return false;
    const response = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/profile-image`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shareImageUrl: shareImageUrl.trim(),
        whatsapp: primaryWhatsapp.trim(),
        useWhatsappSecondOption,
        queueDistributionMode,
        noSeparateAttendants,
      }),
    });
    if (!response.ok) {
      setStatusMessage("Falha ao salvar metadados de compartilhamento.");
      return false;
    }
    await loadTenants().catch(() => undefined);
    return true;
  }

  async function saveNoSeparateAttendantsFlag(next: boolean): Promise<void> {
    if (!selectedTenant) {
      setStatusMessage("Selecione um assinante.");
      return;
    }
    const response = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/profile-image`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ noSeparateAttendants: next }),
    });
    if (!response.ok) {
      setStatusMessage("Falha ao salvar opção de atendimento.");
      return;
    }
    if (next) {
      setStep2ConfirmedByTenant((current) => {
        const nextMap = { ...current, [selectedTenant]: true as const };
        try {
          localStorage.setItem("master-step2-confirmed-by-tenant", JSON.stringify(nextMap));
        } catch {
          // ignore localStorage write errors
        }
        return nextMap;
      });
      setStatusMessage("Novos atendimentos serão direcionados ao Master assinante.");
    } else {
      setStatusMessage("Opção atualizada: você pode cadastrar outros atendentes.");
    }
    await loadTenants().catch(() => undefined);
  }

  function goToAttendantsStepFromProfile() {
    goToWizardStep(2, { userPinned: true });
    void saveLeadChatDisplayName();
    void saveShareMetadata();
  }

  function continueMasterWizard(fromStep: MasterWizardStepIndex) {
    if (!selectedTenant) return;
    if (fromStep === 2) {
      setStep2ConfirmedByTenant((current) => {
        const nextMap = { ...current, [selectedTenant]: true as const };
        try {
          localStorage.setItem("master-step2-confirmed-by-tenant", JSON.stringify(nextMap));
        } catch {
          // ignore localStorage write errors
        }
        return nextMap;
      });
      setMasterWizardConfirmedByTenant((current) => {
        const next = confirmMasterWizardStep(current, selectedTenant, 2);
        persistMasterWizardConfirmedByTenant(next);
        return next;
      });
    }
    if (fromStep === 3 || fromStep === 4 || fromStep === 5) {
      setMasterWizardConfirmedByTenant((current) => {
        const next = confirmMasterWizardStep(current, selectedTenant, fromStep);
        persistMasterWizardConfirmedByTenant(next);
        return next;
      });
      void loadWizardWorkspaceSnapshot(selectedTenant);
    }
    const next = (fromStep + 1) as MasterWizardStepIndex;
    if (next > MASTER_WIZARD_FLOWS_STEP) return;
    wizardStepUserPinnedRef.current = true;
    setMasterWizardUnlocked(resolveWizardUnlockedStep(wizardStepCompletion));
    setMasterWizardStep(next);
  }

  async function registerAttendant(): Promise<boolean> {
    if (!selectedTenant) {
      setStatusMessage("Selecione um assinante.");
      return false;
    }
    if (!attendantUsername.trim() || !attendantEmail.trim() || !attendantDisplayName.trim() || !attendantPassword.trim() || !attendantRole) {
      setStatusMessage("Preencha usuário, e-mail, nome no chat, senha e tipo do atendente.");
      return false;
    }
    const response = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/attendants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: attendantUsername.trim(),
        email: attendantEmail.trim().toLowerCase(),
        displayName: attendantDisplayName.trim(),
        password: attendantPassword,
        role: attendantRole as AttendantRow["role"],
      }),
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string };
      const rawMessage = String(err.message ?? "");
      if (rawMessage.includes("password") && (rawMessage.includes("at least 6") || rawMessage.includes("at least 4"))) {
        setStatusMessage("A senha do atendente precisa ter no mínimo 4 caracteres.");
      } else {
        setStatusMessage(rawMessage && !rawMessage.startsWith("[") ? rawMessage : "Falha ao cadastrar atendente.");
      }
      return false;
    }
    const payload = (await response.json().catch(() => ({}))) as CreateAttendantResponse;
    const delivery = payload.emailDelivery;
    setAttendantUsername("");
    setAttendantEmail("");
    setAttendantDisplayName("");
    setAttendantPassword("");
    setAttendantRole("");
    if (delivery?.status === "sent") {
      setStatusMessage("Atendente cadastrado e e-mail enviado.");
    } else if (delivery?.status === "failed") {
      setStatusMessage(delivery.message ?? "Atendente cadastrado, mas o envio de e-mail falhou.");
    } else if (delivery?.status === "skipped") {
      setStatusMessage(delivery.message ?? "Atendente cadastrado sem envio de e-mail.");
    } else {
      setStatusMessage("Atendente cadastrado.");
    }
    await loadAttendants(selectedTenant);
    return true;
  }

  useEffect(() => {
    if (masterWizardStep !== 2 || !selectedTenant || noSeparateAttendants) return;
    const username = attendantUsername.trim();
    const email = attendantEmail.trim().toLowerCase();
    const display = attendantDisplayName.trim();
    const password = attendantPassword.trim();
    if (!username || !email || !display || !password || !attendantRole) return;
    if (password.length < 4) return;
    if (isAutoCreatingAttendant) return;

    const draftKey = `${selectedTenant}|${username}|${email}|${display}|${attendantRole}|${password}`;
    if (draftKey === lastAutoAttendantDraftKey) return;

    const timer = window.setTimeout(() => {
      setLastAutoAttendantDraftKey(draftKey);
      setIsAutoCreatingAttendant(true);
      void (async () => {
        const ok = await registerAttendant();
        setIsAutoCreatingAttendant(false);
        if (!ok) {
          setLastAutoAttendantDraftKey("");
        }
      })();
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    masterWizardStep,
    selectedTenant,
    attendantUsername,
    attendantEmail,
    attendantDisplayName,
    attendantPassword,
    attendantRole,
    isAutoCreatingAttendant,
    lastAutoAttendantDraftKey,
    noSeparateAttendants,
  ]);

  async function removeAttendant(id: string) {
    if (!selectedTenant) return;
    const response = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/attendants/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setStatusMessage("Falha ao remover atendente.");
      return;
    }
    setStatusMessage("Atendente removido.");
    await loadAttendants(selectedTenant);
  }

  async function activateFlowFromLibrary() {
    if (!selectedTenant || !selectedLibraryId) {
      setStatusMessage("Selecione assinante e um fluxo da biblioteca.");
      return;
    }
    const response = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/flows/from-library`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ libraryItemId: selectedLibraryId }),
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string };
      setStatusMessage(err.message ?? "Falha ao ativar fluxo da biblioteca.");
      return;
    }
    const created = (await response.json()) as SavedFlow;
    setFlowStatuses((current) => ({ ...current, [created.id]: "active" }));
    setStatusMessage("Fluxo adicionado a partir da biblioteca.");
    await loadFlows(selectedTenant);
  }

  async function persistFlowDisplayLabel(flowId: string, displayLabel: string) {
    if (!displayLabel.trim()) return;
    const response = await fetch(`${apiBase}/api/master/flows/${flowId}/display-label`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayLabel: displayLabel.trim() }),
    });
    if (!response.ok) {
      setStatusMessage("Falha ao salvar nome exibido do fluxo.");
      return;
    }
    if (selectedTenant) await loadFlows(selectedTenant);
  }

  async function copyFlowShareLink(flowUrl: string, flowId?: string) {
    if (flowId) {
      const currentStatus = flowStatuses[flowId] ?? "checking";
      if (currentStatus !== "active") {
        setStatusMessage("Link indisponível no momento: fluxo ainda não está ativo no viewer.");
        return;
      }
    }
    const url = flowUrl.trim();
    if (!url) {
      setStatusMessage("URL do fluxo indisponível para cópia.");
      return;
    }
    const copied = await copyTextToClipboard(url);
    setStatusMessage(copied ? "Link copiado." : url);
    if (selectedTenant) await loadFlows(selectedTenant);
  }

  async function removeLibraryFlow(flowId: string) {
    if (!selectedTenant) return;
    const response = await fetch(`${apiBase}/api/master/flows/${flowId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setStatusMessage("Falha ao remover fluxo da biblioteca.");
      return;
    }
    setStatusMessage("Fluxo removido da biblioteca.");
    await loadFlows(selectedTenant);
  }

  async function toggleLibraryFlow(itemId: string, linkedFlowId?: string) {
    if (linkedFlowId) {
      await removeLibraryFlow(linkedFlowId);
      return;
    }
    setSelectedLibraryId(itemId);
    const response = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/flows/from-library`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ libraryItemId: itemId }),
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string };
      setStatusMessage(err.message ?? "Falha ao incluir fluxo da biblioteca.");
      return;
    }
    setStatusMessage("Fluxo incluído na biblioteca.");
    await loadFlows(selectedTenant);
  }

  async function promoteFlowToSystemLibrary(flow: SavedFlow, fallbackTitle?: string) {
    const title = (masterPromoteTitles[flow.id] ?? fallbackTitle ?? "").trim();
    if (title.length < 2) {
      setStatusMessage("Informe um título com pelo menos 2 caracteres ao lado do fluxo.");
      return;
    }
    const response = await fetch(`${apiBase}/api/master/system-library/promote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceFlowId: flow.id, title }),
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string };
      setStatusMessage(err.message ?? "Não foi possível definir o fluxo como padrão.");
      return;
    }
    setStatusMessage("Fluxo definido como padrão e disponibilizado aos assinantes.");
    setMasterPromoteTitles((current) => {
      const next = { ...current };
      delete next[flow.id];
      return next;
    });
    await Promise.all([loadSystemMasterLibrary(), loadFlowLibrary()]);
  }

  async function removeFromSystemLibrary(id: string) {
    const response = await fetch(`${apiBase}/api/master/system-library/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setStatusMessage("Não foi possível remover da Biblioteca Master.");
      return;
    }
    setStatusMessage("Fluxo removido da Biblioteca Master.");
    await Promise.all([loadSystemMasterLibrary(), loadFlowLibrary()]);
  }

  async function login() {
    const username = loginUsername.trim();
    const password = loginPassword;
    if (!username || !password) {
      setStatusMessage("Informe usuário e senha.");
      return;
    }
    let response: Response;
    try {
      response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } catch (error) {
      setApiReachable(false);
      setStatusMessage(formatApiConnectionError(error));
      return;
    }
    setApiReachable(true);
    const payload = (await response.json().catch(() => ({}))) as AuthSession & { message?: string };
    if (!response.ok) {
      const hint = ` [HTTP ${response.status} · ${apiBase}]`;
      setStatusMessage(`${payload.message ?? "Falha ao autenticar."}${hint}`);
      return;
    }
    const nextSession: AuthSession = {
      user: payload.user,
      tenant: payload.tenant,
      masterProfile: payload.masterProfile,
    };
    setAuthSession(nextSession);
    setSelectedTenant(nextSession.tenant.id);
    setLoginPassword("");
    setShowResetPassword(false);
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
    } catch {
      // ignore storage write errors
    }
    setStatusMessage(`Bem-vindo, ${resolveSessionUserDisplayName(nextSession.user)}.`);
  }

  async function resetUserPassword() {
    const email = resetEmail.trim().toLowerCase();
    const nextPassword = resetPassword.trim();
    if (!email || !nextPassword) {
      setStatusMessage("Informe e-mail e nova senha.");
      return;
    }
    if (nextPassword.length < 4) {
      setStatusMessage("A nova senha precisa ter no mínimo 4 caracteres.");
      return;
    }
    if (nextPassword !== resetPasswordConfirm.trim()) {
      setStatusMessage("A confirmação da nova senha não confere.");
      return;
    }
    let response: Response;
    try {
      response = await fetch(`${apiBase}/api/auth/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: email,
          email,
          newPassword: nextPassword,
        }),
      });
    } catch (error) {
      setApiReachable(false);
      setStatusMessage(formatApiConnectionError(error));
      return;
    }
    setApiReachable(true);
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      const hint = ` [HTTP ${response.status} · ${apiBase}]`;
      setStatusMessage(`${payload.message ?? "Falha ao redefinir senha."}${hint}`);
      return;
    }
    setShowResetPassword(false);
    setResetEmail("");
    setResetPassword("");
    setResetPasswordConfirm("");
    setStatusMessage(payload.message ?? "Senha redefinida com sucesso.");
  }

  function logout() {
    setAuthSession(null);
    setTenants([]);
    setSelectedTenant("");
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setStatusMessage("Sessão encerrada.");
  }

  function openSystemMasterTypebotBuilder() {
    window.open(SYSTEM_MASTER_TYPEBOT_BUILDER_URL, "_blank", "noopener,noreferrer");
  }

  const statusToneClass = useMemo(
    () => resolveStatusToastTone(statusMessage),
    [statusMessage],
  );

  if (!authSession) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <img src="/drax-logo-footer.png" alt="DRAX" className="brand-logo auth-logo" />
          <p className="auth-subtitle">Type Bot e Chat de atendimento</p>
          <h2>Acesso ao sistema</h2>
          {!showResetPassword ? (
            <div className="grid-form auth-login-form">
              <input
                placeholder="Usuário ou e-mail"
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
              />
              <input
                type="password"
                placeholder="Senha"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void login();
                }}
              />
              <button type="button" onClick={() => void login()}>
                Entrar
              </button>
            </div>
          ) : (
            <div className="grid-form auth-login-form">
              <input
                type="email"
                placeholder="E-mail cadastrado"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
              />
              <input
                type="password"
                placeholder="Nova senha"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
              />
              <input
                type="password"
                placeholder="Confirmar nova senha"
                value={resetPasswordConfirm}
                onChange={(event) => setResetPasswordConfirm(event.target.value)}
              />
              <button type="button" onClick={() => void resetUserPassword()}>
                Confirmar redefinição
              </button>
              <button type="button" className="ghost-btn" onClick={() => setShowResetPassword(false)}>
                Voltar ao login
              </button>
            </div>
          )}
          {!showResetPassword ? (
            <button type="button" className="auth-text-link" onClick={() => setShowResetPassword(true)}>
              Redefinir senha
            </button>
          ) : null}
          <p
            className={`auth-api-endpoint-hint${
              apiReachable === true
                ? " auth-api-endpoint-hint--ok"
                : apiReachable === false
                  ? " auth-api-endpoint-hint--error"
                  : ""
            }`}
            title="URL usada nas chamadas /api/auth/*"
          >
            API: {apiBase}
            {apiReachable === true
              ? " · ligação OK"
              : apiReachable === false
                ? " · sem ligação (teste /health no browser)"
                : " · a verificar ligação…"}
          </p>
        </section>
        {statusMessage ? (
          <div className={`status-toast ${statusToneClass}`} role="status" aria-live="polite">
            <span>{statusMessage}</span>
            <button type="button" className="status-toast-close" onClick={() => setStatusMessage("")} aria-label="Fechar alerta">
              ×
            </button>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <div className={`layout${isSidebarCollapsed ? " layout--sidebar-collapsed" : ""}`}>
      <aside className={`sidebar${isSidebarCollapsed ? " sidebar--collapsed" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-head">
            <img src="/drax-logo-footer.png" alt="DRAX" className="brand-logo" />
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setIsSidebarCollapsed((current) => !current)}
              aria-label={isSidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
              title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            >
              <svg className="sidebar-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d={isSidebarCollapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <p className="brand-tagline">Type Bot e Chat de atendimento</p>
        </div>
        <nav className="menu-nav" aria-label="Menu principal">
          {masterProfile === "subscriber_master" && authSession?.user?.role !== "attendant" ? (
            <button
              className={`menu-btn ${activeScreen === "master" ? "active" : ""}`}
              onClick={() => setActiveScreen("master")}
            >
              <span className="menu-btn-inner">
                <SidebarMenuIcon name="master" />
                <span className="menu-btn-label">Master Console</span>
              </span>
            </button>
          ) : null}
          {masterProfile === "system_master" ? (
            <button
              className={`menu-btn ${activeScreen === "masterLibrary" ? "active" : ""}`}
              onClick={() => setActiveScreen("masterLibrary")}
            >
              <span className="menu-btn-inner">
                <SidebarMenuIcon name="library" />
                <span className="menu-btn-label">Biblioteca Master</span>
              </span>
            </button>
          ) : null}
          {masterProfile === "system_master" ? (
            <button
              className={`menu-btn ${activeScreen === "subscribers" ? "active" : ""}`}
              onClick={() => setActiveScreen("subscribers")}
            >
              <span className="menu-btn-inner">
                <SidebarMenuIcon name="subscribers" />
                <span className="menu-btn-label">Assinantes</span>
              </span>
            </button>
          ) : null}
          {allowedScreens.includes("kanban") ? (
            <button
              className={`menu-btn ${activeScreen === "kanban" ? "active" : ""}`}
              onClick={() => setActiveScreen("kanban")}
            >
              <span className="menu-btn-inner">
                <SidebarMenuIcon name="kanban" />
                <span className="menu-btn-label">Kanban</span>
              </span>
            </button>
          ) : null}
          {masterProfile === "subscriber_master" ? (
            <button
              className={`menu-btn ${activeScreen === "liveQueue" ? "active" : ""}`}
              onClick={() => setActiveScreen("liveQueue")}
            >
              <span className="menu-btn-inner">
                <SidebarMenuIcon name="liveQueue" />
                <span className="menu-btn-label">Fila ao vivo</span>
                {pendingQueueCount > 0 ? <span className="menu-badge">{pendingQueueCount}</span> : null}
              </span>
            </button>
          ) : null}
          {allowedScreens.includes("scheduling") ? (
            <button
              className={`menu-btn ${activeScreen === "scheduling" ? "active" : ""}`}
              onClick={() => setActiveScreen("scheduling")}
            >
              <span className="menu-btn-inner">
                <SidebarMenuIcon name="scheduling" />
                <span className="menu-btn-label">Agendamento</span>
              </span>
            </button>
          ) : null}
          {allowedScreens.includes("clientList") ? (
            <button
              className={`menu-btn ${activeScreen === "clientList" ? "active" : ""}`}
              onClick={() => setActiveScreen("clientList")}
            >
              <span className="menu-btn-inner">
                <SidebarMenuIcon name="clientList" />
                <span className="menu-btn-label">Lista de Clientes</span>
              </span>
            </button>
          ) : null}
        </nav>
      </aside>

      <main
        className={`content${activeScreen === "liveQueue" ? " content--live-inbox" : ""}${activeScreen === "kanban" ? " content--kanban" : ""}${activeScreen === "clientList" ? " content--client-list" : ""}`}
      >
        {pendingQueueCount > 0 ? (
          <section className="pending-summary-alert" role="status" aria-live="polite">
            <div className="pending-summary-alert__content">
              <strong>{pendingQueueCount} atendimento(s) pendente(s)</strong>
              <span>Lead aguardando atendimento na fila ao vivo.</span>
            </div>
            {activeScreen !== "liveQueue" ? (
              <button type="button" className="pending-summary-alert__action" onClick={() => setActiveScreen("liveQueue")}>
                Ir para Fila ao Vivo
              </button>
            ) : null}
          </section>
        ) : null}
        <header className="top-header">
          <div>
            <h2>{SCREEN_PAGE_HEADER[activeScreen]?.title ?? "Painel Master"}</h2>
            <p>
              {SCREEN_PAGE_HEADER[activeScreen]?.subtitle ??
                "Gerencie assinantes, assinatura e bloqueio de acesso"}
            </p>
          </div>
          <div className="top-header-actions">
            {masterProfile === "system_master" ? (
              <button type="button" className="ghost-btn top-typebot-link-btn" onClick={openSystemMasterTypebotBuilder}>
                Acesso Typebot
              </button>
            ) : null}
            <div className="user-menu-wrap">
            <button
              type="button"
              className="user-menu-btn"
              aria-label="Abrir menu do usuário"
              onClick={() => setIsUserMenuOpen((current) => !current)}
            >
              {selectedTenantObject?.profileImageUrl ? (
                <img
                  src={selectedTenantObject.profileImageUrl}
                  alt={selectedTenantObject.name}
                  className="user-avatar-img"
                />
              ) : (
                <svg className="user-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5Zm0 2c-4.42 0-8 2.69-8 6v1h16v-1c0-3.31-3.58-6-8-6Z"
                    fill="currentColor"
                  />
                </svg>
              )}
            </button>
            {isUserMenuOpen ? (
              <div className="user-menu-panel">
                <strong>{resolveSessionUserDisplayName(authSession.user)}</strong>
                <span>{authSession.user.email}</span>
                <button
                  type="button"
                  className="user-menu-logout"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                >
                  Sair
                </button>
              </div>
            ) : null}
            </div>
          </div>
        </header>

        {activeScreen === "master" ? (
          <section className="card">
            <h3>Workspace do assinante</h3>
            {selectedTenant ? (
              <>
              <div className="master-wizard-progress" role="navigation" aria-label="Etapas de configuração">
                {MASTER_CONSOLE_WIZARD_STEPS.map(({ step, label }) => (
                  <button
                    key={step}
                    type="button"
                    className={`wizard-step-chip ${masterWizardStep === step ? "active" : ""} ${
                      wizardStepCompletion[`step${step}` as keyof MasterWizardStepCompletion] ? "done" : ""
                    }`}
                    disabled={step > masterWizardUnlocked}
                    onClick={() => {
                      if (step <= masterWizardUnlocked) goToWizardStep(step as MasterWizardStepIndex);
                    }}
                  >
                    <span className="wizard-step-num" aria-hidden="true">
                      {wizardStepCompletion[`step${step}` as keyof MasterWizardStepCompletion] ? "✓" : step}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
              </>
            ) : (
              <p className="muted">Nenhum assinante carregado para este acesso.</p>
            )}
            {selectedTenantObject && masterWizardStep === 1 ? (
              <div className="tenant-profile-card tenant-profile-card--profile">
                <div className="profile-step">
                  <header className="profile-step__header">
                    <h4>Configuração do perfil</h4>
                    <p>Configure como sua marca aparece no chat e nos compartilhamentos.</p>
                  </header>

                  <div className="profile-grid">
                    <article className="profile-card profile-card--share">
                      <div className="profile-card__top">
                        <label className="field-label field-label--primary">Logo da marca</label>
                        <span className="field-help">500×500 px recomendado</span>
                      </div>
                      <label className="upload-dropzone">
                        {tenantProfileImageUrl ? (
                          <img src={tenantProfileImageUrl} alt="Preview da logo" className="upload-preview" />
                        ) : (
                          <div className="upload-placeholder">
                            <span className="upload-icon">+</span>
                            <strong>Enviar logo</strong>
                            <small>Clique para selecionar</small>
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          className="sr-only"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            try {
                              const optimized = await resizeImageForLogo(file);
                              setTenantProfileImageUrl(optimized);
                              void persistProfileImageToServer(optimized);
                            } catch {
                              const reader = new FileReader();
                              reader.onload = () => {
                                const result = typeof reader.result === "string" ? reader.result : "";
                                setTenantProfileImageUrl(result);
                                void persistProfileImageToServer(result);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      <div className="file-feedback">
                        <span className={tenantProfileImageUrl ? "file-ok" : "file-muted"}>
                          {tenantProfileImageUrl ? "Arquivo carregado com sucesso." : "Nenhum arquivo selecionado."}
                        </span>
                      </div>
                    </article>

                    <article className="profile-card">
                      <div className="profile-card__top">
                        <label className="field-label field-label--secondary">Imagem de compartilhamento</label>
                        <span className="field-help">1200x630 recomendado</span>
                      </div>
                      <label className="upload-dropzone upload-dropzone--share">
                        {shareImageUrl ? (
                          <img src={shareImageUrl} alt="Preview compartilhamento" className="upload-preview upload-preview--share" />
                        ) : (
                          <div className="upload-placeholder">
                            <span className="upload-icon">+</span>
                            <strong>Enviar imagem</strong>
                            <small>Usada em compartilhamentos</small>
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            void (async () => {
                              try {
                                const optimized = await resizeImageForShare(file, 1200, 630);
                                setShareImageUrl(optimized);
                              } catch {
                                setStatusMessage("Falha ao processar imagem de compartilhamento.");
                              }
                            })();
                          }}
                        />
                      </label>
                      <div className="file-feedback">
                        <span className={shareImageUrl ? "file-ok" : "file-muted"}>
                          {shareImageUrl ? "Arquivo carregado com sucesso." : "Nenhum arquivo selecionado."}
                        </span>
                      </div>
                    </article>

                    <article className="profile-card profile-card--text">
                      <div className="profile-card__top">
                        <label className="field-label field-label--secondary">WhatsApp Principal</label>
                        <span className="field-help">Telefone com DDD</span>
                      </div>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="(00) 00000-0000"
                        value={primaryWhatsapp}
                        onChange={(event) => setPrimaryWhatsapp(formatWhatsapp(event.target.value))}
                      />
                      <div className="profile-card__top profile-card__top--spaced">
                        <label className="field-label field-label--secondary">Nome no chat</label>
                        <span className="field-help">Mín. 2 caracteres</span>
                      </div>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="Nome exibido no chat do lead"
                        value={leadChatDisplayName}
                        onChange={(event) => setLeadChatDisplayName(event.target.value)}
                      />
                      <div className="profile-card__top profile-card__top--spaced">
                        <label className="field-label field-label--secondary">Ordem para fila de atendimento</label>
                        <span className="field-help">Selecione como os atendimentos serão distribuídos</span>
                      </div>
                      <div className="queue-distribution-options">
                        <label className={`queue-distribution-choice ${queueDistributionMode === "assign_per_incoming" ? "is-selected" : ""}`}>
                          <input
                            type="radio"
                            name="queue-distribution-mode"
                            checked={queueDistributionMode === "assign_per_incoming"}
                            onChange={() => setQueueDistributionMode("assign_per_incoming")}
                          />
                          <span>Cada atendimento entrante é distribuído para um atendente</span>
                        </label>
                        <label className={`queue-distribution-choice ${queueDistributionMode === "shared_pool" ? "is-selected" : ""}`}>
                          <input
                            type="radio"
                            name="queue-distribution-mode"
                            checked={queueDistributionMode === "shared_pool"}
                            onChange={() => setQueueDistributionMode("shared_pool")}
                          />
                          <span>Os atendimentos ficam disponíveis para todos os atendentes</span>
                        </label>
                        <label className={`queue-distribution-choice ${queueDistributionMode === "random" ? "is-selected" : ""}`}>
                          <input
                            type="radio"
                            name="queue-distribution-mode"
                            checked={queueDistributionMode === "random"}
                            onChange={() => setQueueDistributionMode("random")}
                          />
                          <span>Os atendimentos são distribuídos aleatoriamente</span>
                        </label>
                      </div>
                    </article>
                    <article className="profile-card profile-card--full profile-card--whatsapp-option">
                      <div className="profile-card__top">
                        <label className="field-label field-label--secondary">Utilizar WhatsApp como segunda opção de atendimento?</label>
                      </div>
                      <p className="field-tip field-tip--intro">
                        Essas telas abaixo mostram como é a tela de atendimento ao vivo que aparece para o seu Lead. Após ele responder o fluxo do typebot, ele é direcionado para essa tela. Nela você tem a opção do seu Lead acessar o WhatsApp. Selecione a melhor opção para você.
                      </p>
                      <div className="whatsapp-layout-options">
                        <label className={`whatsapp-layout-choice ${useWhatsappSecondOption ? "is-selected" : ""}`}>
                          <span className="whatsapp-layout-choice__head">
                            <input
                              type="radio"
                              name="whatsapp-second-option"
                              checked={useWhatsappSecondOption}
                              onChange={() => setUseWhatsappSecondOption(true)}
                            />
                            <strong>Com WhatsApp</strong>
                          </span>
                          <div className="whatsapp-preview">
                            <span className="whatsapp-preview__badge">Atendimento ao vivo ativo</span>
                            <strong className="whatsapp-preview__title">Você está na fila e um atendente já está com o seu atendimento.</strong>
                            <p className="whatsapp-preview__subtitle">Aguarde nesta tela para continuar o atendimento.</p>
                            <div className="whatsapp-preview__alert">Não feche esta página para não perder sua posição na fila.</div>
                            <div className="whatsapp-preview__chips">
                              <span>Nome: Lead</span>
                              <span>WhatsApp: +55...</span>
                            </div>
                            <div className="whatsapp-preview__button">Quero atendimento imediato no WhatsApp</div>
                          </div>
                        </label>

                        <label className={`whatsapp-layout-choice ${!useWhatsappSecondOption ? "is-selected" : ""}`}>
                          <span className="whatsapp-layout-choice__head">
                            <input
                              type="radio"
                              name="whatsapp-second-option"
                              checked={!useWhatsappSecondOption}
                              onChange={() => setUseWhatsappSecondOption(false)}
                            />
                            <strong>Sem WhatsApp</strong>
                          </span>
                          <div className="whatsapp-preview">
                            <span className="whatsapp-preview__badge">Atendimento ao vivo ativo</span>
                            <strong className="whatsapp-preview__title">Você está na fila e um atendente já está com o seu atendimento.</strong>
                            <p className="whatsapp-preview__subtitle">Aguarde nesta tela para continuar o atendimento.</p>
                            <div className="whatsapp-preview__alert">Não feche esta página para não perder sua posição na fila.</div>
                            <div className="whatsapp-preview__chips">
                              <span>Nome: Lead</span>
                              <span>WhatsApp: +55...</span>
                            </div>
                          </div>
                        </label>
                      </div>
                    </article>
                  </div>
                </div>
                <div className="wizard-step-actions">
                  {isStep1FormReady ? (
                    <button
                      type="button"
                      onClick={() => void goToAttendantsStepFromProfile()}
                    >
                      Próxima Etapa
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {selectedTenant && masterWizardStep === 2 ? (
              <div className="tenant-profile-card">
                <h4>Etapa 2 — Atendente</h4>
                <label className="queue-distribution-choice" style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={noSeparateAttendants}
                    onChange={(event) => void saveNoSeparateAttendantsFlag(event.target.checked)}
                    style={{ marginTop: "4px" }}
                  />
                  <span>
                    <strong>Não tenho atendente</strong>
                    <span className="muted muted-subtle" style={{ display: "block", marginTop: "6px", fontWeight: 400 }}>
                      Com esta opção, quem responde no chat ao vivo é o próprio Master assinante (login do titular). Novos contatos na fila são
                      distribuídos só para usuários com perfil Master deste workspace.
                    </span>
                  </span>
                </label>
                {!noSeparateAttendants ? (
                  <>
                    <div className="grid-form">
                      <input
                        placeholder="Nome usuário (login)"
                        value={attendantUsername}
                        onChange={(event) => setAttendantUsername(event.target.value)}
                      />
                      <input
                        type="email"
                        placeholder="E-mail do usuário"
                        value={attendantEmail}
                        onChange={(event) => setAttendantEmail(event.target.value)}
                      />
                      <input
                        placeholder="Nome exibição no chat"
                        value={attendantDisplayName}
                        onChange={(event) => setAttendantDisplayName(event.target.value)}
                      />
                      <input
                        type="password"
                        placeholder="Senha"
                        value={attendantPassword}
                        onChange={(event) => setAttendantPassword(event.target.value)}
                      />
                      <select value={attendantRole} onChange={(event) => setAttendantRole(event.target.value as AttendantRow["role"] | "")}>
                        <option value="">Selecione</option>
                        <option value="master">Master</option>
                        <option value="manager">Gerente</option>
                        <option value="attendant">Atendente</option>
                      </select>
                    </div>
                    <p className="muted muted-subtle">
                      {isLoadingAttendants ? (
                        <span className="processing-inline-wrap" aria-live="polite">
                          <i className="processing-inline-dot" aria-hidden="true" />
                          Carregando atendentes...
                        </span>
                      ) : isAutoCreatingAttendant ? (
                        <span className="processing-inline-wrap" aria-live="polite">
                          <i className="processing-inline-dot" aria-hidden="true" />
                          Salvando atendente automaticamente...
                        </span>
                      ) : (
                        "Preencha os campos. Ao completar os dados, o atendente é salvo automaticamente."
                      )}
                    </p>
                  </>
                ) : (
                  <p className="muted muted-subtle" style={{ marginTop: "12px" }}>
                    Cadastro de novos atendentes está oculto. Para incluir equipe, desmarque a opção acima.
                  </p>
                )}
                {!isLoadingAttendants && visibleAttendants.length > 0 ? (
                  <div className="saved-flows-table attendants-table">
                    <div className="saved-flows-header attendants-header">
                      <span>Usuário</span>
                        <span>E-mail</span>
                      <span>Nome no chat</span>
                      <span>Tipo</span>
                      <span />
                    </div>
                    {visibleAttendants.map((row) => (
                      <div key={row.id} className="saved-flows-row attendants-row">
                        <span>{row.username}</span>
                          <span>{row.email?.trim() || "—"}</span>
                        <span>
                          {resolveAttendantDisplayName(
                            { username: row.username, displayName: row.displayName },
                            { sessionAgentId: row.username, sessionAgentName: row.displayName },
                          )}
                        </span>
                        <span>
                          {row.role === "master" ? "Master" : row.role === "manager" ? "Gerente" : "Atendente"}
                        </span>
                        <span>
                          <button type="button" className="ghost-btn danger-btn" onClick={() => void removeAttendant(row.id)}>
                            Remover
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : isLoadingAttendants ? (
                  <p className="muted muted-subtle">
                    <span className="processing-inline-wrap" aria-live="polite">
                      <i className="processing-inline-dot" aria-hidden="true" />
                      Processando dados dos atendentes...
                    </span>
                  </p>
                ) : noSeparateAttendants ? null : (
                  <p className="muted muted-subtle">Nenhum atendente cadastrado para este assinante.</p>
                )}
                <div className="wizard-step-actions">
                  <button type="button" className="ghost-btn" onClick={() => goToWizardStep(1)}>
                    Voltar
                  </button>
                  <button type="button" onClick={() => continueMasterWizard(2)}>
                    Continuar
                  </button>
                </div>
              </div>
            ) : null}

            {selectedTenant && masterWizardStep === 3 ? (
              <TenantLabelsStep
                apiBase={apiBase}
                tenantId={selectedTenant}
                onStatusMessage={setStatusMessage}
                onBack={() => goToWizardStep(2)}
                onContinue={() => continueMasterWizard(3)}
              />
            ) : null}

            {selectedTenant && masterWizardStep === 4 ? (
              <TenantPrioritiesStep
                apiBase={apiBase}
                tenantId={selectedTenant}
                onStatusMessage={setStatusMessage}
                onBack={() => goToWizardStep(3)}
                onContinue={() => continueMasterWizard(4)}
              />
            ) : null}

            {selectedTenant && masterWizardStep === 5 ? (
              <TenantKanbanStep
                apiBase={apiBase}
                tenantId={selectedTenant}
                onStatusMessage={setStatusMessage}
                onBack={() => goToWizardStep(4)}
                onContinue={() => continueMasterWizard(5)}
              />
            ) : null}

            {selectedTenant && masterWizardStep === 6 ? (
              <div className="tenant-profile-card">
                <div className="card-section-heading card-section-heading--h4">
                  <h4>Etapa 6 — Biblioteca de Fluxos</h4>
                  <button
                    type="button"
                    className="ghost-btn flow-list-refresh-btn flow-list-refresh-btn--compact"
                    onClick={() => void refreshTenantFlowList(selectedTenant)}
                  >
                    Atualizar lista
                  </button>
                </div>
                <p className="muted muted-subtle">
                  {selectedTenantObject &&
                (isSystemMasterTenant(selectedTenantObject) ||
                  isTenantTypebotProvisioned(selectedTenantObject)) ? (
                    <>
                      Nesta conta, a lista reflete os <strong>fluxos ativos do workspace Typebot</strong> vinculado
                      {isSystemMasterTenant(selectedTenantObject) ? " à matriz" : " ao assinante"}.
                      Use <strong>Atualizar lista</strong> após criar ou publicar um fluxo no builder.
                    </>
                  ) : (
                    <>
                      Fluxos definidos como <strong>padrão</strong> na Biblioteca Master são incluídos aqui automaticamente; use{" "}
                      <strong>Copiar link</strong> para o link de compartilhamento do workspace deste assinante.
                    </>
                  )}
                </p>
                {selectedTenantObject && isTenantTypebotProvisioned(selectedTenantObject) ? null : selectableFlowLibrary.some(
                    (item) => !systemDefaultLibraryIds.has(item.id),
                  ) ? (
                  <div className="grid-form">
                    <select value={selectedLibraryId} onChange={(event) => setSelectedLibraryId(event.target.value)}>
                      <option value="">Selecionar</option>
                      {selectableFlowLibrary
                        .filter((item) => !systemDefaultLibraryIds.has(item.id))
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                    </select>
                    <button type="button" onClick={() => void activateFlowFromLibrary()} disabled={!selectedLibraryId}>
                      Ativar da biblioteca
                    </button>
                  </div>
                ) : null}
                {selectedTenantObject && isTenantTypebotProvisioned(selectedTenantObject) ? null : (
                <div className="tenant-profile-card">
                  <h4>Fluxos ativos na biblioteca</h4>
                  {visibleLibraryFlowRows.length === 0 ? (
                    <p className="muted muted-subtle">Nenhum fluxo disponível na biblioteca.</p>
                  ) : (
                    <div className="saved-flows-table">
                      <div className="saved-flows-header library-active-row">
                        <span>Nome</span>
                        <span>Status</span>
                        <span>URL</span>
                        <span>Ações</span>
                      </div>
                      {visibleLibraryFlowRows.map(({ item, linkedFlow, isIncluded, healthStatus }) => {
                        const isSystemDefaultRow = systemDefaultLibraryIds.has(item.id);
                        const canCopyLink = Boolean(linkedFlow) && isIncluded && healthStatus === "active";
                        return (
                          <div key={item.id} className="saved-flows-row library-active-row">
                            <span>{linkedFlow?.displayLabel ?? linkedFlow?.nickname ?? item.title}</span>
                            <span className={`flow-status ${healthStatus === "active" ? "active" : "inactive"}`}>
                              <i />
                              {healthStatus === "checking" ? "Verificando…" : healthStatus === "active" ? "Ativo" : "Inativo"}
                            </span>
                            <span className="flow-url-cell">
                              <a
                                href={linkedFlow?.url ?? item.viewerUrl}
                                title={linkedFlow?.url ?? item.viewerUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {abbreviateUrlForDisplay(linkedFlow?.url ?? item.viewerUrl)}
                              </a>
                            </span>
                            <span className="flow-row-actions">
                              {isSystemDefaultRow ? (
                                <button
                                  type="button"
                                  className={`compact-action-btn ${
                                    isIncluded ? "compact-action-btn-success" : "compact-action-btn-secondary"
                                  }`}
                                  disabled={!canCopyLink}
                                  onClick={() => (linkedFlow ? void copyFlowShareLink(linkedFlow.url, linkedFlow.id) : undefined)}
                                >
                                  Copiar link
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className={`compact-action-btn ${
                                      isIncluded ? "compact-action-btn-danger" : "compact-action-btn-success"
                                    }`}
                                    onClick={() => void toggleLibraryFlow(item.id, linkedFlow?.id)}
                                  >
                                    {isIncluded ? "Remover" : "Incluir"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`compact-action-btn ${
                                      isIncluded ? "compact-action-btn-success" : "compact-action-btn-secondary"
                                    }`}
                                    disabled={!canCopyLink}
                                    onClick={() => (linkedFlow ? void copyFlowShareLink(linkedFlow.url, linkedFlow.id) : undefined)}
                                  >
                                    Copiar link
                                  </button>
                                </>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                )}
                <div className="tenant-profile-card">
                  <h4>Fluxos do workspace Typebot</h4>
                  <p className="muted muted-subtle">
                    Inclui fluxos criados no builder Typebot e fluxos adicionados por URL (sem item na Biblioteca Master). Copie o link público abaixo.
                  </p>
                  {tenantWorkspaceFlowsForStep6.length === 0 ? (
                    <p className="muted muted-subtle">
                      {selectedTenantObject && isTenantTypebotProvisioned(selectedTenantObject)
                        ? "Nenhum fluxo no workspace Typebot. Crie ou publique no builder e use Atualizar lista."
                        : "Nenhum fluxo fora do catálogo da biblioteca neste assinante."}
                    </p>
                  ) : (
                    <div className="saved-flows-table">
                      <div className="saved-flows-header library-active-row">
                        <span>Nome</span>
                        <span>Status</span>
                        <span>URL</span>
                        <span>Ações</span>
                      </div>
                      {tenantWorkspaceFlowsForStep6.map((flow) => {
                        const healthStatus = flowStatuses[flow.id] ?? "checking";
                        const canCopyLink = healthStatus === "active";
                        return (
                          <div key={flow.id} className="saved-flows-row library-active-row">
                            <span>{flow.displayLabel ?? flow.nickname}</span>
                            <span className={`flow-status ${healthStatus === "active" ? "active" : "inactive"}`}>
                              <i />
                              {healthStatus === "checking" ? "Verificando…" : healthStatus === "active" ? "Ativo" : "Inativo"}
                            </span>
                            <span className="flow-url-cell">
                              <a href={flow.url} title={flow.url} target="_blank" rel="noreferrer">
                                {abbreviateUrlForDisplay(flow.url)}
                              </a>
                            </span>
                            <span className="flow-row-actions">
                              <button
                                type="button"
                                className={`compact-action-btn ${canCopyLink ? "compact-action-btn-success" : "compact-action-btn-secondary"}`}
                                disabled={!canCopyLink}
                                onClick={() => void copyFlowShareLink(flow.url, flow.id)}
                              >
                                Copiar link
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {!hasAnyFlowListedInStep6 && selectedTenantFlows.length > 0 ? (
                  <div className="tenant-profile-card">
                    <h4>Fluxos salvos deste assinante</h4>
                    <p className="muted muted-subtle">
                      Listagem direta da API ({selectedTenantFlows.length} registro
                      {selectedTenantFlows.length === 1 ? "" : "s"}).
                    </p>
                    <div className="saved-flows-table">
                      <div className="saved-flows-header library-active-row">
                        <span>Nome</span>
                        <span>Status</span>
                        <span>URL</span>
                        <span>Ações</span>
                      </div>
                      {selectedTenantFlows.map((flow) => {
                        const healthStatus = flowStatuses[flow.id] ?? "checking";
                        const canCopyLink = healthStatus === "active";
                        return (
                          <div key={flow.id} className="saved-flows-row library-active-row">
                            <span>{flow.displayLabel ?? flow.nickname}</span>
                            <span className={`flow-status ${healthStatus === "active" ? "active" : "inactive"}`}>
                              <i />
                              {healthStatus === "checking" ? "Verificando…" : healthStatus === "active" ? "Ativo" : "Inativo"}
                            </span>
                            <span className="flow-url-cell">
                              <a href={flow.url} title={flow.url} target="_blank" rel="noreferrer">
                                {abbreviateUrlForDisplay(flow.url)}
                              </a>
                            </span>
                            <span className="flow-row-actions">
                              <button
                                type="button"
                                className={`compact-action-btn ${canCopyLink ? "compact-action-btn-success" : "compact-action-btn-secondary"}`}
                                disabled={!canCopyLink}
                                onClick={() => void copyFlowShareLink(flow.url, flow.id)}
                              >
                                Copiar link
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {!hasAnyFlowListedInStep6 && selectedTenantFlows.length === 0 ? (
                  <p className="muted muted-subtle flow-sync-hint">
                    Nenhum fluxo na API para este assinante. Use <strong>Atualizar lista</strong> ou verifique o volume da API.
                  </p>
                ) : null}
                <div className="wizard-step-actions">
                  <button type="button" className="ghost-btn" onClick={() => goToWizardStep(5)}>
                    Voltar
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeScreen === "masterLibrary" ? (
          <section className="card">
            <div className="card-section-heading">
              <h3>Biblioteca Master</h3>
              <button
                type="button"
                className="ghost-btn flow-list-refresh-btn flow-list-refresh-btn--compact"
                onClick={() => void loadMasterLibrarySourceFlows()}
              >
                Atualizar lista
              </button>
            </div>
            <p className="muted muted-subtle">
              Fluxos <strong>Live</strong> do workspace <strong>Walkup</strong> no Typebot Builder.
              <span className="master-library-build-marker" hidden aria-hidden="true">
                {ADMIN_BUILD_MARKER}
              </span>
            </p>
            <div className="saved-flows-table master-library-table">
              <div className="saved-flows-header master-library-row">
                <span>Título</span>
                <span>Fluxo origem</span>
                <span>Status</span>
                <span>URL</span>
                <span>Ação</span>
              </div>
              {walkupMasterLibraryFlows.map((flow) => {
                const flowUrl = flow.url.trim().toLowerCase();
                const alreadyInLibrary = systemMasterLibrary.some(
                  (item) =>
                    item.sourceFlowId === flow.id ||
                    item.viewerUrl.trim().toLowerCase() === flowUrl,
                );
                const promoteTitle = masterPromoteTitles[flow.id] ?? flow.displayLabel ?? "";
                const canPromote = !alreadyInLibrary && promoteTitle.trim().length >= 2;
                const flowOriginAlias =
                  flow.typebotPublicId?.trim() || flow.displayLabel?.trim() || flow.nickname;
                const urlActive = flow.viewerUrlActive !== false;
                return (
                  <div key={flow.id} className="saved-flows-row master-library-row">
                    <span>
                      {editingMasterTitleFlowId === flow.id ? (
                        <input
                          type="text"
                          className="master-promote-title-input master-promote-title-input-inline"
                          placeholder="Mín. 2 caracteres"
                          value={promoteTitle}
                          autoFocus
                          onChange={(event) =>
                            setMasterPromoteTitles((current) => ({ ...current, [flow.id]: event.target.value }))
                          }
                          onBlur={() => setEditingMasterTitleFlowId(null)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === "Escape") {
                              setEditingMasterTitleFlowId(null);
                            }
                          }}
                          aria-label={`Título para promover ${flowOriginAlias}`}
                        />
                      ) : (
                        <span className="master-title-display-row">
                          <span className="master-title-display">{promoteTitle || "Sem título"}</span>
                          <button
                            type="button"
                            className="master-title-edit-btn"
                            onClick={() => setEditingMasterTitleFlowId(flow.id)}
                            aria-label={`Editar título de ${flowOriginAlias}`}
                            title="Editar título"
                          >
                            ✎
                          </button>
                        </span>
                      )}
                    </span>
                    <span className="master-flow-origin-alias" title={flow.displayLabel ?? flow.nickname}>
                      {flowOriginAlias}
                    </span>
                    <span className={`flow-status ${urlActive ? "active" : "inactive"}`}>
                      <i />
                      {urlActive ? "Ativo" : "Inativo"}
                    </span>
                    <span className="flow-url-cell">
                      <a href={flow.url} title={flow.url} target="_blank" rel="noreferrer">
                        {abbreviateUrlForDisplay(flow.url)}
                      </a>
                    </span>
                    <span className="master-library-action-cell">
                      {alreadyInLibrary ? (
                        <span className="muted">Já na biblioteca</span>
                      ) : (
                        <button
                          type="button"
                          className="compact-action-btn compact-action-btn-success"
                          disabled={!canPromote}
                          onClick={() => void promoteFlowToSystemLibrary(flow, promoteTitle)}
                        >
                          Definir como Padrão
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
              {walkupMasterLibraryFlows.length === 0 ? (
                <p className="muted">Nenhum fluxo Live no workspace Walkup. Publique no Typebot e clique em Atualizar lista.</p>
              ) : null}
            </div>

            <div className="tenant-profile-card">
              <h4>Fluxos compartilhados</h4>
              {systemMasterLibrary.length === 0 ? (
                <p className="muted">Nenhum fluxo padrão publicado ainda.</p>
              ) : (
                <div className="saved-flows-table master-library-table">
                  <div className="saved-flows-header master-library-published-row">
                    <span>Título</span>
                    <span>URL</span>
                    <span>Atualizado</span>
                    <span>Ação</span>
                  </div>
                  {systemMasterLibrary.map((item) => (
                    <div className="saved-flows-row master-library-published-row" key={item.id}>
                      <span>{item.title}</span>
                      <span className="flow-url-cell">
                        <a href={item.viewerUrl} title={item.viewerUrl} target="_blank" rel="noreferrer">
                          {abbreviateUrlForDisplay(item.viewerUrl)}
                        </a>
                      </span>
                      <span>{new Date(item.updatedAt).toLocaleString("pt-BR")}</span>
                      <span>
                        <button
                          type="button"
                          className="ghost-btn danger-btn"
                          onClick={() => void removeFromSystemLibrary(item.id)}
                        >
                          Remover
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeScreen === "subscribers" ? (
          <>
            <section className="card">
              <div className="section-title-row">
                <h3>Gerenciamento de assinantes</h3>
                <div className="subscriber-toolbar">
                  <button
                    className={`filter-btn ${subscriberStatusFilter === "active" ? "active" : ""}`}
                    onClick={() => setSubscriberStatusFilter((current) => (current === "active" ? "all" : "active"))}
                  >
                    Ativo
                  </button>
                  <button
                    className={`filter-btn ${subscriberStatusFilter === "blocked" ? "active" : ""}`}
                    onClick={() => setSubscriberStatusFilter((current) => (current === "blocked" ? "all" : "blocked"))}
                  >
                    Bloqueado
                  </button>
                  <button
                    className="filter-btn clear"
                    onClick={() => {
                      setSubscriberStatusFilter("all");
                    }}
                  >
                    Limpar filtros
                  </button>
                  <button className="add-subscriber-btn compact" onClick={openCreateSubscriberModal}>
                    <span className="add-icon">+</span>
                    <span>Novo Assinante</span>
                  </button>
                </div>
              </div>
            </section>

            <section className="card">
              <h3>Assinantes</h3>
              {isLoadingTenants ? (
                <p className="muted muted-subtle">
                  <span className="processing-inline-wrap" aria-live="polite">
                    <i className="processing-inline-dot" aria-hidden="true" />
                    Carregando assinantes...
                  </span>
                </p>
              ) : null}
              <div className="table">
                <div className="table-row table-header subscribers-table-row">
                  <span>Assinante</span>
                  <span>Tipo de usuário</span>
                  <span>Status</span>
                  <span>Ações</span>
                </div>
                {filteredTenants.map((tenant) => (
                  <div key={tenant.id} className="table-row subscribers-table-row">
                    <span className="subscriber-cell">
                      {tenant.profileImageUrl ? <img src={tenant.profileImageUrl} alt={tenant.name} /> : <i>{tenant.name.slice(0, 1)}</i>}
                      <span>
                        <strong>{tenant.name}</strong>
                        <small>{tenant.ownerEmail}</small>
                        <small>{tenant.whatsapp || "Sem WhatsApp"}</small>
                        <small
                          className={
                            isTenantTypebotProvisioned(tenant) ? "subscriber-typebot-ready" : "subscriber-typebot-pending"
                          }
                          title={
                            isTenantTypebotProvisioned(tenant)
                              ? undefined
                              : (tenant.typebotProvisionError?.trim() ||
                                  "Workspace Typebot pendente ou com erro na criação.") ||
                                undefined
                          }
                        >
                          Typebot: {isTenantTypebotProvisioned(tenant) ? "Provisionado" : "Pendente"}
                        </small>
                      </span>
                    </span>
                    <span>{getTenantUserTypeLabel(tenant.ownerEmail)}</span>
                    <span>{getTenantStatusLabel(tenant.status)}</span>
                    <span className="subscriber-actions">
                      <button
                        className={tenant.status === "active" ? "danger-btn" : ""}
                        onClick={() => toggleStatus(tenant)}
                      >
                        {tenant.status === "active" ? "Bloquear" : "Reativar"}
                      </button>
                      <button className="ghost-btn" onClick={() => openEditSubscriberModal(tenant)}>
                        Editar
                      </button>
                    </span>
                  </div>
                ))}
                {filteredTenants.length === 0 ? (
                  <p className="muted">
                    {isLoadingTenants ? "Buscando assinantes..." : "Nenhum assinante encontrado para os filtros aplicados."}
                  </p>
                ) : null}
              </div>
            </section>
          </>
        ) : null}

        {activeScreen === "liveQueue" && selectedTenant ? (
          <LiveInboxScreen
            apiBase={apiBase}
            tenantId={selectedTenant}
            contacts={queueItems}
            authUsername={authSession?.user?.username}
            authDisplayName={resolveSessionUserDisplayName(authSession?.user)}
            agentId={agentId}
            noSeparateAttendants={selectedTenantObject?.noSeparateAttendants}
            buildAgentChatUrl={getAgentViewUrl}
            onRefreshQueue={async () => loadQueue(selectedTenant)}
            onStatusMessage={setStatusMessage}
            onOpenLeadDetail={openLeadDetailModal}
          />
        ) : null}

        {activeScreen === "clientList" ? (
          <ClientsListScreen
            contacts={masterProfile === "system_master" ? masterClientContacts : queueItems}
            onOpenContact={openLeadDetailByContactId}
          />
        ) : null}

        {activeScreen === "kanban" && selectedTenant ? (
          <KanbanScreen
            apiBase={apiBase}
            tenantId={selectedTenant}
            contacts={queueItems}
            onOpenContact={openLeadDetailByContactId}
            onRefresh={async () => loadQueue(selectedTenant)}
          />
        ) : null}

        {activeScreen === "scheduling" && selectedTenant ? (
          <SchedulingScreen
            apiBase={apiBase}
            tenantId={selectedTenant}
            contacts={
              (masterProfile === "system_master" ? masterClientContacts : queueItems) as ScheduledLeadItem[]
            }
            onOpenContact={openLeadDetailByContactId}
            onRefresh={async () => {
              if (masterProfile === "system_master") {
                await loadMasterClientDirectory();
                return;
              }
              await loadQueue(selectedTenant);
            }}
          />
        ) : null}

        {activeScreen === "scheduling" && !selectedTenant ? (
          <section className="card">
            <p className="muted">Selecione um assinante para visualizar a agenda de retornos.</p>
          </section>
        ) : null}

        {statusMessage ? (
          <div className={`status-toast ${statusToneClass}`} role="status" aria-live="polite">
            <span>{statusMessage}</span>
            <button type="button" className="status-toast-close" onClick={() => setStatusMessage("")} aria-label="Fechar alerta">
              ×
            </button>
          </div>
        ) : null}

        {isFlowModalOpen ? (
          <div className="modal-overlay" onClick={() => setIsFlowModalOpen(false)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <h3>Cadastrar fluxo</h3>
              <div className="grid-form">
                <input
                  placeholder="Apelido do fluxo"
                  value={newFlowNickname}
                  onChange={(event) => setNewFlowNickname(event.target.value)}
                />
                <input placeholder="URL do fluxo" value={newFlowUrl} onChange={(event) => setNewFlowUrl(event.target.value)} />
              </div>
              <div className="modal-actions">
                <button className="ghost-btn" onClick={() => setIsFlowModalOpen(false)}>
                  Cancelar
                </button>
                <button onClick={saveTenantFlow}>Salvar fluxo</button>
              </div>
            </div>
          </div>
        ) : null}

        {isSubscriberModalOpen ? (
          <div className="modal-overlay" onClick={() => setIsSubscriberModalOpen(false)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <h3>{editingTenantId ? "Editar assinante" : "Adicionar assinante"}</h3>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (isSavingSubscriber) return;
                  saveSubscriber().catch(() => setStatusMessage("Falha ao salvar assinante."));
                }}
              >
                <div className="grid-form">
                  <div className="upload-block subscriber-brand-hint">
                    <p className="muted">
                      A <strong>imagem do assinante</strong> (lista, avatar no chat, etc.) é sempre a definida no{" "}
                      <strong>Master Console</strong>, em <strong>Perfil de atendimento</strong>, para o assinante
                      selecionado. Aqui não é possível trocar a imagem para evitar divergência.
                    </p>
                    {editingTenantId ? (
                      editingTenant?.profileImageUrl ? (
                        <img src={editingTenant.profileImageUrl} alt="Imagem atual da marca" className="upload-preview" />
                      ) : (
                        <p className="muted">Nenhuma imagem ainda — defina no Master Console após selecionar este assinante.</p>
                      )
                    ) : (
                      <p className="muted">Após criar o assinante, selecione-o no Master Console e envie a imagem de perfil.</p>
                    )}
                  </div>
                  <input
                    placeholder="Nome do assinante"
                    value={newTenantName}
                    onChange={(event) => setNewTenantName(event.target.value)}
                    disabled={isSavingSubscriber}
                    required
                  />
                  <input
                    type="email"
                    placeholder="E-mail de cadastro"
                    value={newTenantEmail}
                    onChange={(event) => setNewTenantEmail(event.target.value)}
                    disabled={isSavingSubscriber}
                    required
                  />
                  <input
                    placeholder="WhatsApp de cadastro"
                    value={newTenantWhatsapp}
                  onChange={(event) => setNewTenantWhatsapp(formatWhatsapp(event.target.value))}
                    disabled={isSavingSubscriber}
                    required
                  />
                  {editingTenantId ? (
                    <>
                      <input
                        placeholder="Typebot Workspace ID (obrigatório para autoimport)"
                        value={newTenantTypebotWorkspaceId}
                        onChange={(event) => setNewTenantTypebotWorkspaceId(event.target.value)}
                        disabled={isSavingSubscriber}
                      />
                      <input
                        placeholder="Typebot Access URL (opcional)"
                        value={newTenantTypebotAccessUrl}
                        onChange={(event) => setNewTenantTypebotAccessUrl(event.target.value)}
                        disabled={isSavingSubscriber}
                      />
                    </>
                  ) : null}
                  {!editingTenantId ? (
                    <input
                      type="password"
                      placeholder="Senha inicial de acesso"
                      value={newTenantPassword}
                      onChange={(event) => setNewTenantPassword(event.target.value)}
                      disabled={isSavingSubscriber}
                      minLength={4}
                      required
                    />
                  ) : null}
                </div>
                {isSavingSubscriber ? (
                  <p className="muted muted-subtle">
                    <span className="processing-inline-wrap" aria-live="polite">
                      <i className="processing-inline-dot" aria-hidden="true" />
                      Processando cadastro do assinante...
                    </span>
                  </p>
                ) : null}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={isSavingSubscriber}
                    onClick={() => {
                      setIsSubscriberModalOpen(false);
                      resetSubscriberForm();
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={isSavingSubscriber}>
                    {isSavingSubscriber
                      ? editingTenantId
                        ? "Salvando..."
                        : "Criando..."
                      : editingTenantId
                        ? "Salvar alterações"
                        : "Criar assinante"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        <LeadDetailModal
          open={isLeadDetailModalOpen}
          onClose={() => {
            setIsLeadDetailModalOpen(false);
            setSelectedLeadContactId("");
            setSelectedLeadTenantId("");
          }}
          apiBase={apiBase}
          tenantId={selectedLeadTenantId}
          contactId={selectedLeadContactId}
          showWhatsappHeaderAction={activeScreen !== "liveQueue"}
        />

      </main>
    </div>
  );
}
