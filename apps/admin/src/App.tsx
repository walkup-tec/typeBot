import { useEffect, useMemo, useRef, useState } from "react";

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
  contactName: string;
  source: "typebot" | "widget";
  sourceFlowLabel: string;
  leadContext?: Record<string, string | number | boolean>;
  status: "waiting" | "in_service";
  assignedAgentId?: string;
  assignedAgentName?: string;
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
type ScreenId = "master" | "masterLibrary" | "subscribers" | "liveQueue";
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

const apiBase = "http://localhost:3333";
const SYSTEM_MASTER_EMAIL = "walkup@walkuptec.com.br";
/** Builder Typebot da matriz (Master do Sistema): abre em nova aba a partir do header. */
const SYSTEM_MASTER_TYPEBOT_BUILDER_URL =
  "https://soma-typebot-walkup-builder.achpyp.easypanel.host/pt-BR/typebots";
const AUTH_STORAGE_KEY = "typebot-saas-auth-session";
const widgetBaseUrlFromEnv = import.meta.env.VITE_WIDGET_BASE_URL?.trim();
const widgetBaseUrl =
  widgetBaseUrlFromEnv && !widgetBaseUrlFromEnv.includes("loca.lt") ? widgetBaseUrlFromEnv : "http://localhost:5174";
const getAgentViewUrl = (tenantId: string, contactId: string, agent: string, agentName?: string) =>
  `${widgetBaseUrl}/?mode=agent&tenantId=${encodeURIComponent(tenantId)}&contactId=${encodeURIComponent(
    contactId,
  )}&agentId=${encodeURIComponent(agent)}&agentName=${encodeURIComponent(agentName?.trim() || agent)}`;
const getTenantUserTypeLabel = (ownerEmail: string): "Master do Sistema" | "Master Assinante" =>
  ownerEmail.trim().toLowerCase() === SYSTEM_MASTER_EMAIL ? "Master do Sistema" : "Master Assinante";
const getTenantStatusLabel = (status: Tenant["status"]): "Ativo" | "Bloqueado" => (status === "active" ? "Ativo" : "Bloqueado");

/** Workspace Typebot realmente ligado ao assinante (evita mostrar “Provisionado” só pelo estado derivado). */
const isTenantTypebotProvisioned = (tenant: Tenant): boolean =>
  tenant.typebotProvisionStatus === "provisioned" &&
  Boolean(String(tenant.typebotWorkspaceId ?? "").trim());

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

/** Texto curto para a tabela (URL completa em `title` / `href`); parecido com preview de link no editor. */
function abbreviateUrlForDisplay(raw: string, maxLen = 56): string {
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
}

export function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>("master");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [queueItems, setQueueItems] = useState<QueueContact[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantEmail, setNewTenantEmail] = useState("");
  const [newTenantWhatsapp, setNewTenantWhatsapp] = useState("");
  const [newTenantPassword, setNewTenantPassword] = useState("");
  const [isSubscriberModalOpen, setIsSubscriberModalOpen] = useState(false);
  const [isLeadContextModalOpen, setIsLeadContextModalOpen] = useState(false);
  const [selectedLeadContext, setSelectedLeadContext] = useState<Record<string, string | number | boolean> | null>(null);
  const [selectedLeadContextContactName, setSelectedLeadContextContactName] = useState("");
  const [isSavingSubscriber, setIsSavingSubscriber] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("atendente-01");
  const [savedFlowsByTenant, setSavedFlowsByTenant] = useState<Record<string, SavedFlow[]>>({});
  const [flowStatuses, setFlowStatuses] = useState<Record<string, FlowStatus>>({});
  const [isFlowModalOpen, setIsFlowModalOpen] = useState(false);
  const [newFlowNickname, setNewFlowNickname] = useState("");
  const [newFlowUrl, setNewFlowUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
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
    if (role === "attendant") return ["liveQueue"];
    return masterProfile === "system_master" ? ["masterLibrary", "subscribers"] : ["master", "liveQueue"];
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
  const selectableFlowLibrary = useMemo(
    () => flowLibrary.filter((item) => item.id !== "template-placeholder" && item.title !== "Modelo (substitua a URL)"),
    [flowLibrary],
  );
  const libraryLinkedFlows = useMemo(
    () => selectedTenantFlows.filter((flow) => Boolean(flow.librarySourceId)),
    [selectedTenantFlows],
  );
  /** Fluxos criados no builder Typebot do workspace (sem item da Biblioteca Master). */
  const workspaceOnlyFlows = useMemo(
    () => selectedTenantFlows.filter((flow) => Boolean(flow.typebotRemoteId)),
    [selectedTenantFlows],
  );
  const activeLibraryFlows = useMemo(
    () =>
      libraryLinkedFlows.filter((flow) => {
        const status = flowStatuses[flow.id];
        return status === "active" || status === "checking";
      }),
    [libraryLinkedFlows, flowStatuses],
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
        const healthStatus = linkedFlow ? (flowStatuses[linkedFlow.id] ?? "checking") : "inactive";
        const status: FlowStatus = linkedFlow ? "active" : "inactive";
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
  const unpublishedSourceMasterFlows = useMemo(
    () =>
      sourceMasterFlows.filter((flow) => {
        const flowUrl = flow.url.trim().toLowerCase();
        return !systemMasterLibrary.some((item) => {
          const bySourceId = item.sourceFlowId === flow.id;
          const byViewerUrl = item.viewerUrl.trim().toLowerCase() === flowUrl;
          return bySourceId || byViewerUrl;
        });
      }),
    [sourceMasterFlows, systemMasterLibrary],
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
  const isStep3Completed = selectedTenantFlows.length > 0;
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
    const attendantByUsername = new Map(
      attendants.map((row) => [String(row.username ?? "").trim().toLowerCase(), row.displayName]),
    );
    const normalized = data.map((item) => {
      const assignedAgentId = String(item.assignedAgentId ?? "").trim();
      const assignedAgentName =
        String(item.assignedAgentName ?? "").trim() ||
        (assignedAgentId && attendantByUsername.has(assignedAgentId.toLowerCase())
          ? attendantByUsername.get(assignedAgentId.toLowerCase())
          : undefined);
      return {
        ...item,
        assignedAgentName,
      };
    });
    setQueueItems(normalized);
  }

  async function loadFlows(tenantId: string) {
    if (!tenantId) return;
    const response = await fetch(`${apiBase}/api/master/tenants/${tenantId}/flows`);
    if (!response.ok) {
      throw new Error("Falha ao carregar fluxos");
    }
    const data = (await response.json()) as SavedFlow[];
    setSavedFlowsByTenant((current) => ({ ...current, [tenantId]: data }));
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

  async function loadMasterLibrarySourceFlows() {
    const response = await fetch(`${apiBase}/api/master/system-library/source-flows`);
    if (!response.ok) return;
    const data = (await response.json()) as SavedFlow[];
    setSourceMasterFlows(data);
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
    if (!authSession) return;
    loadTenants().catch(() => setStatusMessage("Falha ao carregar assinantes"));
  }, [authSession]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("master-step2-confirmed-by-tenant");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, true>;
      if (parsed && typeof parsed === "object") {
        setStep2ConfirmedByTenant(parsed);
      }
    } catch {
      // ignore localStorage parsing errors
    }
  }, []);

  useEffect(() => {
    if (!authSession) return;
    loadFlowLibrary().catch(() => undefined);
    loadMasterLibrarySourceFlows().catch(() => undefined);
    loadSystemMasterLibrary().catch(() => undefined);
  }, [authSession]);

  useEffect(() => {
    if (activeScreen !== "masterLibrary") return;
    void loadMasterLibrarySourceFlows();
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

  /** Na etapa 3, inclui automaticamente na biblioteca do assinante cada fluxo marcado como padrão na Master. */
  useEffect(() => {
    if (masterWizardStep !== 3 || !selectedTenant || masterProfile !== "subscriber_master") return;
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
    setMasterWizardStep(1);
    setMasterWizardUnlocked(1);
    setProfileImageUploadedInStep(false);
  }, [selectedTenant]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(""), 3800);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!selectedTenant) return;
    if (!isStep1Completed) {
      setMasterWizardUnlocked(1);
      setMasterWizardStep(1);
      return;
    }
    if (!isStep2Completed) {
      setMasterWizardUnlocked(2);
      setMasterWizardStep(2);
      return;
    }
    if (!isStep3Completed) {
      setMasterWizardUnlocked(3);
      setMasterWizardStep(3);
      return;
    }
    setMasterWizardUnlocked(3);
    setMasterWizardStep(3);
  }, [selectedTenant, isStep1Completed, isStep2Completed, isStep3Completed]);

  useEffect(() => {
    if (!selectedTenant) return;
    const timer = window.setInterval(() => {
      loadQueue(selectedTenant).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [selectedTenant, attendants]);

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

  useEffect(() => {
    if (!selectedTenant) return;
    const flows = savedFlowsByTenant[selectedTenant] ?? [];
    if (flows.length === 0) return;

    const checkStatuses = async () => {
      setFlowStatuses((current) => {
        const next = { ...current };
        for (const flow of flows) next[flow.id] = "checking";
        return next;
      });

      const results = await Promise.all(
        flows.map(async (flow) => {
          try {
            const response = await fetch(`${apiBase}/api/typebot/flow-status?url=${encodeURIComponent(flow.url)}`);
            const data = (await response.json()) as { status: "active" | "inactive" };
            return { flowId: flow.id, status: data.status as FlowStatus };
          } catch {
            return { flowId: flow.id, status: "inactive" as FlowStatus };
          }
        }),
      );

      setFlowStatuses((current) => {
        const next = { ...current };
        for (const item of results) next[item.flowId] = item.status;
        return next;
      });
    };

    checkStatuses();
  }, [selectedTenant, savedFlowsByTenant]);

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

  async function assignContact(contactId: string) {
    const useMasterOnly = selectedTenantObject?.noSeparateAttendants === true;
    const masterUsername = authSession?.user?.username?.trim();
    const resolvedAgentId =
      useMasterOnly && masterUsername ? masterUsername : agentId;
    const loggedAgentName = authSession?.user?.displayName?.trim() || resolvedAgentId;
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
    window.open(getAgentViewUrl(selectedTenant, contactId, resolvedAgentId, loggedAgentName), "_blank");
    await loadQueue(selectedTenant);
  }

  function openLeadContextModal(item: QueueContact) {
    setSelectedLeadContext(item.leadContext ?? null);
    setSelectedLeadContextContactName(item.contactName);
    setIsLeadContextModalOpen(true);
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
    setMasterWizardUnlocked((previous) => Math.max(previous, 2));
    setMasterWizardStep(2);
    void saveLeadChatDisplayName();
    void saveShareMetadata();
  }

  function continueMasterWizard(fromStep: number) {
    if (fromStep === 2 && selectedTenant) {
      setStep2ConfirmedByTenant((current) => {
        const nextMap = { ...current, [selectedTenant]: true as const };
        try {
          localStorage.setItem("master-step2-confirmed-by-tenant", JSON.stringify(nextMap));
        } catch {
          // ignore localStorage write errors
        }
        return nextMap;
      });
    }
    const next = fromStep + 1;
    if (next > 3) return;
    setMasterWizardUnlocked((previous) => Math.max(previous, next));
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
    try {
      await navigator.clipboard.writeText(url);
      setStatusMessage("Link copiado.");
    } catch {
      setStatusMessage(url);
    }
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
    const response = await fetch(`${apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const payload = (await response.json().catch(() => ({}))) as AuthSession & { message?: string };
    if (!response.ok) {
      setStatusMessage(payload.message ?? "Falha ao autenticar.");
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
    setStatusMessage(`Bem-vindo, ${nextSession.user.displayName}.`);
  }

  async function resetUserPassword() {
    const username = resetUsername.trim();
    const email = resetEmail.trim().toLowerCase();
    const nextPassword = resetPassword.trim();
    if (!username || !email || !nextPassword) {
      setStatusMessage("Informe usuário, e-mail e nova senha.");
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
    const response = await fetch(`${apiBase}/api/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username,
        email,
        newPassword: nextPassword,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setStatusMessage(payload.message ?? "Falha ao redefinir senha.");
      return;
    }
    setShowResetPassword(false);
    setResetUsername("");
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

  const statusToneClass = useMemo(() => {
    const message = statusMessage.trim().toLowerCase();
    if (!message) return "error";
    const successPattern =
      /(sucesso|bem-vindo|copiado|iniciado|atualizado|cadastrado|salvo|inclu[ií]do|removido|encerrada|definido)/i;
    return successPattern.test(message) ? "success" : "error";
  }, [statusMessage]);

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
                placeholder="Usuário"
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
                placeholder="Usuário"
                value={resetUsername}
                onChange={(event) => setResetUsername(event.target.value)}
              />
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
    <div className="layout">
      <aside className="sidebar">
        <div className="brand-block">
          <img src="/drax-logo-footer.png" alt="DRAX" className="brand-logo" />
          <p>Type Bot e Chat de atendimento</p>
        </div>
        <nav className="menu-nav">
          {masterProfile === "subscriber_master" && authSession?.user?.role !== "attendant" ? (
            <button
              className={`menu-btn ${activeScreen === "master" ? "active" : ""}`}
              onClick={() => setActiveScreen("master")}
            >
              Master Console
            </button>
          ) : null}
          {masterProfile === "system_master" ? (
            <button
              className={`menu-btn ${activeScreen === "masterLibrary" ? "active" : ""}`}
              onClick={() => setActiveScreen("masterLibrary")}
            >
              Biblioteca Master
            </button>
          ) : null}
          {masterProfile === "system_master" ? (
            <button
              className={`menu-btn ${activeScreen === "subscribers" ? "active" : ""}`}
              onClick={() => setActiveScreen("subscribers")}
            >
              Assinantes
            </button>
          ) : null}
          {masterProfile === "subscriber_master" ? (
            <button
              className={`menu-btn ${activeScreen === "liveQueue" ? "active" : ""}`}
              onClick={() => setActiveScreen("liveQueue")}
            >
              Fila ao vivo
              {pendingQueueCount > 0 ? <span className="menu-badge">{pendingQueueCount}</span> : null}
            </button>
          ) : null}
        </nav>
      </aside>

      <main className="content">
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
            <h2>Painel Master</h2>
            <p>Gerencie assinantes, assinatura e bloqueio de acesso</p>
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
                <strong>{authSession.user.displayName}</strong>
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
                {(
                  [
                    { step: 1, label: "Perfil de atendimento" },
                    { step: 2, label: "Atendentes" },
                    { step: 3, label: "Biblioteca de fluxos" },
                  ] as const
                ).map(({ step, label }) => (
                  <button
                    key={step}
                    type="button"
                    className={`wizard-step-chip ${masterWizardStep === step ? "active" : ""} ${step < masterWizardUnlocked ? "done" : ""}`}
                    disabled={step > masterWizardUnlocked}
                    onClick={() => {
                      if (step <= masterWizardUnlocked) setMasterWizardStep(step);
                    }}
                  >
                    <span className="wizard-step-num" aria-hidden="true">
                      {step < masterWizardUnlocked ? "✓" : step}
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
                <h4>Etapa 2 — Atendentes</h4>
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
                        <span>{row.displayName}</span>
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
                  <button type="button" className="ghost-btn" onClick={() => setMasterWizardStep(1)}>
                    Voltar
                  </button>
                  <button type="button" onClick={() => continueMasterWizard(2)}>
                    Continuar
                  </button>
                </div>
              </div>
            ) : null}

            {selectedTenant && masterWizardStep === 3 ? (
              <div className="tenant-profile-card">
                <h4>Etapa 3 — Biblioteca de fluxos</h4>
                <p className="muted muted-subtle">
                  Fluxos definidos como <strong>padrão</strong> na Biblioteca Master são incluídos aqui automaticamente; use{" "}
                  <strong>Copiar link</strong> para o link de compartilhamento do workspace deste assinante.
                </p>
                {selectableFlowLibrary.some((item) => !systemDefaultLibraryIds.has(item.id)) ? (
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
                <div className="tenant-profile-card">
                  <h4>Fluxos ativos na biblioteca</h4>
                  {libraryFlowRows.length === 0 ? (
                    <p className="muted muted-subtle">Nenhum fluxo disponível na biblioteca.</p>
                  ) : (
                    <div className="saved-flows-table">
                      <div className="saved-flows-header library-active-row">
                        <span>Nome</span>
                        <span>Status</span>
                        <span>URL</span>
                        <span>Ações</span>
                      </div>
                      {libraryFlowRows.map(({ item, linkedFlow, isIncluded, healthStatus }) => {
                        const isSystemDefaultRow = systemDefaultLibraryIds.has(item.id);
                        const canCopyLink = Boolean(linkedFlow) && isIncluded && healthStatus === "active";
                        return (
                          <div key={item.id} className="saved-flows-row library-active-row">
                            <span>{linkedFlow?.displayLabel ?? linkedFlow?.nickname ?? item.title}</span>
                            <span className={`flow-status ${isIncluded ? "active" : "inactive"}`}>
                              <i />
                              {isIncluded ? "Ativo" : "Inativo"}
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
                <div className="tenant-profile-card">
                  <h4>Fluxos do workspace Typebot</h4>
                  <p className="muted muted-subtle">
                    Criados direto no builder no workspace deste assinante; aparecem aqui para copiar o link público.
                  </p>
                  {workspaceOnlyFlows.length === 0 ? (
                    <p className="muted muted-subtle">Nenhum fluxo apenas do workspace.</p>
                  ) : (
                    <div className="saved-flows-table">
                      <div className="saved-flows-header library-active-row">
                        <span>Nome</span>
                        <span>Status</span>
                        <span>URL</span>
                        <span>Ações</span>
                      </div>
                      {workspaceOnlyFlows.map((flow) => {
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
                <div className="wizard-step-actions">
                  <button type="button" className="ghost-btn" onClick={() => setMasterWizardStep(2)}>
                    Voltar
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeScreen === "masterLibrary" ? (
          <section className="card">
            <h3>Biblioteca Master</h3>

            <div className="saved-flows-table master-library-table">
              <div className="saved-flows-header master-library-row">
                <span>Título</span>
                <span>Fluxo origem</span>
                <span>URL</span>
                <span>Ação</span>
              </div>
              {unpublishedSourceMasterFlows.map((flow) => {
                const promoteTitle = masterPromoteTitles[flow.id] ?? flow.displayLabel ?? "";
                const canPromote = promoteTitle.trim().length >= 2;
                const flowOriginAlias =
                  flow.typebotPublicId?.trim() || flow.displayLabel?.trim() || flow.nickname;
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
                    <span className="flow-url-cell">
                      <a href={flow.url} title={flow.url} target="_blank" rel="noreferrer">
                        {abbreviateUrlForDisplay(flow.url)}
                      </a>
                    </span>
                    <span>
                      <button
                        type="button"
                        disabled={!canPromote}
                        onClick={() => void promoteFlowToSystemLibrary(flow, promoteTitle)}
                      >
                        Definir como Padrão
                      </button>
                    </span>
                  </div>
                );
              })}
              {unpublishedSourceMasterFlows.length === 0 ? (
                <p className="muted">Nenhum fluxo encontrado para a conta master de origem.</p>
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

        {activeScreen === "liveQueue" ? (
          <section className="card">
            <h3>Fila de atendimento</h3>
            <div className="table">
              <div className="table-row table-header queue-table-row">
                <span>Contato</span>
                <span>Fluxo de origem</span>
                <span>Atendente</span>
                <span>Atualizado em</span>
                <span>Ação</span>
              </div>
              {queueItems.map((item) => (
                <div className="table-row queue-table-row" key={item.contactId}>
                  <span>{item.contactName}</span>
                  <span>{item.sourceFlowLabel}</span>
                  <span>{item.status === "in_service" ? item.assignedAgentName ?? item.assignedAgentId ?? "-" : "-"}</span>
                  <span>{new Date(item.updatedAt).toLocaleString("pt-BR")}</span>
                  <span className="queue-actions">
                    <button
                      className="queue-icon-btn queue-icon-btn--lead"
                      onClick={() => openLeadContextModal(item)}
                      title="Ver dados do Lead"
                      aria-label="Ver dados do Lead"
                      disabled={!item.leadContext || Object.keys(item.leadContext).length === 0}
                    >
                      <svg className="queue-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M11 4a7 7 0 1 0 4.384 12.46l3.578 3.579a1 1 0 0 0 1.414-1.415l-3.578-3.578A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                    <button
                      className={`queue-icon-btn queue-chat-icon ${item.status === "waiting" ? "queue-chat-icon--pulse" : ""}`}
                      onClick={() => assignContact(item.contactId)}
                      title={item.status === "waiting" ? "Iniciar atendimento" : "Atendimento já iniciado"}
                      aria-label={item.status === "waiting" ? "Iniciar atendimento" : "Atendimento já iniciado"}
                      disabled={item.status !== "waiting"}
                    >
                      <svg className="queue-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M6.5 5A4.5 4.5 0 0 0 2 9.5v5A4.5 4.5 0 0 0 6.5 19H8v2.25c0 .4.44.64.77.42L12.7 19H17.5a4.5 4.5 0 0 0 4.5-4.5v-5A4.5 4.5 0 0 0 17.5 5h-11Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </span>
                </div>
              ))}
            </div>
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

        {isLeadContextModalOpen ? (
          <div
            className="modal-overlay"
            onClick={() => {
              setIsLeadContextModalOpen(false);
              setSelectedLeadContext(null);
              setSelectedLeadContextContactName("");
            }}
          >
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <h3>Dados informados pelo Lead</h3>
              <p className="muted">Contato: {selectedLeadContextContactName || "-"}</p>
              {selectedLeadContext && Object.keys(selectedLeadContext).length > 0 ? (
                <div className="lead-context-list">
                  {Object.entries(selectedLeadContext).map(([key, value]) => (
                    <div className="lead-context-row" key={key}>
                      <span>{key}</span>
                      <strong>{String(value ?? "")}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Este contato não possui dados estruturados salvos.</p>
              )}
              <div className="modal-actions">
                <button
                  className="ghost-btn"
                  onClick={() => {
                    setIsLeadContextModalOpen(false);
                    setSelectedLeadContext(null);
                    setSelectedLeadContextContactName("");
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        ) : null}

      </main>
    </div>
  );
}
