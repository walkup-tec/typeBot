import { useEffect, useMemo, useState } from "react";

type TenantDefaultChatTheme = {
  templateName?: string;
  userBubbleBg?: string;
  pageBg?: string;
  chatBg?: string;
  botBubbleBg?: string;
};

type Tenant = {
  id: string;
  name: string;
  ownerEmail: string;
  whatsapp: string;
  status: "active" | "blocked";
  profileImageUrl?: string;
  chatDisplayName?: string;
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
  status: "waiting" | "in_service";
  assignedAgentId?: string;
  updatedAt: string;
};

type SavedFlow = {
  id: string;
  tenantId?: string;
  createdAt: string;
  nickname: string;
  displayLabel?: string;
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
const publicApiBase = import.meta.env.VITE_PUBLIC_API_BASE_URL?.trim() || apiBase;
const SYSTEM_MASTER_EMAIL = "walkup@walkuptec.com.br";
const AUTH_STORAGE_KEY = "typebot-saas-auth-session";
const widgetBaseUrlFromEnv = import.meta.env.VITE_WIDGET_BASE_URL?.trim();
const widgetBaseUrl =
  widgetBaseUrlFromEnv && !widgetBaseUrlFromEnv.includes("loca.lt") ? widgetBaseUrlFromEnv : "http://localhost:5174";
const getAgentViewUrl = (tenantId: string, contactId: string, agent: string) =>
  `${widgetBaseUrl}/?mode=agent&tenantId=${encodeURIComponent(tenantId)}&contactId=${encodeURIComponent(
    contactId,
  )}&agentId=${encodeURIComponent(agent)}`;
const TYPEBOT_DASHBOARD_URL = "https://app.typebot.io/typebots";
const getTenantUserTypeLabel = (ownerEmail: string): "Master do Sistema" | "Master Assinante" =>
  ownerEmail.trim().toLowerCase() === SYSTEM_MASTER_EMAIL ? "Master do Sistema" : "Master Assinante";
const getTenantStatusLabel = (status: Tenant["status"]): "Ativo" | "Bloqueado" => (status === "active" ? "Ativo" : "Bloqueado");

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
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] ?? 255;
          if (a < 40) continue;
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          if (r > 248 && g > 248 && b > 248) continue;
          const rq = Math.round(r / 28) * 28;
          const gq = Math.round(g / 28) * 28;
          const bq = Math.round(b / 28) * 28;
          const key = `${rq},${gq},${bq}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        let bestKey = "";
        let max = 0;
        for (const [key, count] of buckets) {
          if (count > max) {
            max = count;
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

const formatWhatsapp = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
};

export function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>("master");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [queueItems, setQueueItems] = useState<QueueContact[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantEmail, setNewTenantEmail] = useState("");
  const [newTenantWhatsapp, setNewTenantWhatsapp] = useState("");
  const [isSubscriberModalOpen, setIsSubscriberModalOpen] = useState(false);
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
  const [subscriberStatusFilter, setSubscriberStatusFilter] = useState<"all" | "active" | "blocked">("all");
  const [attendants, setAttendants] = useState<AttendantRow[]>([]);
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
  const [selectedLibraryId, setSelectedLibraryId] = useState("");
  /** Etapa atual (1–3) no fluxo de configuração do workspace. */
  const [masterWizardStep, setMasterWizardStep] = useState(1);
  /** Maior etapa já desbloqueada (avança ao concluir etapa anterior). */
  const [masterWizardUnlocked, setMasterWizardUnlocked] = useState(1);
  /** Exibe botão da etapa 1 somente após upload da imagem nesta sessão da etapa. */
  const [profileImageUploadedInStep, setProfileImageUploadedInStep] = useState(false);
  /** Etapa 2 só conclui quando usuário clica em "Continuar". */
  const [step2ConfirmedByTenant, setStep2ConfirmedByTenant] = useState<Record<string, true>>({});

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
  const allowedScreens = useMemo<ScreenId[]>(
    () => (masterProfile === "system_master" ? ["masterLibrary", "subscribers"] : ["master", "liveQueue"]),
    [masterProfile],
  );
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
  const activeLibraryFlows = useMemo(
    () =>
      libraryLinkedFlows.filter((flow) => {
        const status = flowStatuses[flow.id];
        return status === "active" || status === "checking";
      }),
    [libraryLinkedFlows, flowStatuses],
  );
  const libraryFlowRows = useMemo(
    () =>
      selectableFlowLibrary.map((item) => {
        const linkedFlow =
          libraryLinkedFlows.find((flow) => flow.librarySourceId === item.id) ??
          libraryLinkedFlows.find((flow) => flow.url.trim() === item.viewerUrl.trim()) ??
          null;
        const status = linkedFlow ? (flowStatuses[linkedFlow.id] ?? "checking") : "inactive";
        return {
          item,
          linkedFlow,
          status,
          isIncluded: Boolean(linkedFlow) && status !== "inactive",
        };
      }),
    [selectableFlowLibrary, libraryLinkedFlows, flowStatuses],
  );
  const unpublishedSourceMasterFlows = useMemo(
    () =>
      sourceMasterFlows.filter(
        (flow) => !systemMasterLibrary.some((item) => item.sourceFlowId === flow.id),
      ),
    [sourceMasterFlows, systemMasterLibrary],
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
  const isStep2Completed = Boolean(selectedTenant && step2ConfirmedByTenant[selectedTenant]);
  const isStep3Completed = selectedTenantFlows.length > 0;

  const getTypebotAccessUrl = (tenant: Tenant) => {
    const explicit = String(tenant.typebotAccessUrl ?? "").trim();
    if (explicit) {
      const normalized = explicit
        .replace("https://app.typebot.com", "https://app.typebot.io")
        .replace("http://app.typebot.com", "https://app.typebot.io");
      if (normalized.includes("/signup?")) return TYPEBOT_DASHBOARD_URL;
      return normalized;
    }
    const ownerEmail = String(tenant.typebotOwnerEmail || tenant.ownerEmail || "")
      .trim()
      .toLowerCase();
    if (tenant.typebotProvisionStatus === "pending_manual" && ownerEmail) {
      return TYPEBOT_DASHBOARD_URL;
    }
    return TYPEBOT_DASHBOARD_URL;
  };

  async function loadTenants() {
    const response = await fetch(`${apiBase}/api/master/tenants`);
    const data = (await response.json()) as Tenant[];
    setTenants(data);
    if (!selectedTenant && data[0]) {
      const preferredTenantId = authSession?.tenant?.id;
      const preferred = preferredTenantId ? data.find((tenant) => tenant.id === preferredTenantId) : null;
      setSelectedTenant(preferred?.id ?? data[0].id);
    }
  }

  async function loadQueue(tenantId: string) {
    if (!tenantId) return;
    const response = await fetch(`${apiBase}/api/chat/queue`, {
      headers: { "x-tenant-id": tenantId },
    });
    const data = (await response.json()) as QueueContact[];
    setQueueItems(data);
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
    const response = await fetch(`${apiBase}/api/master/tenants/${tenantId}/attendants`);
    if (!response.ok) return;
    const data = (await response.json()) as AttendantRow[];
    setAttendants(data);
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
    Promise.all([loadQueue(selectedTenant), loadFlows(selectedTenant), loadAttendants(selectedTenant)]).catch(() =>
      setStatusMessage("Falha ao carregar dados do assinante"),
    );
  }, [selectedTenant]);

  useEffect(() => {
    setTenantProfileImageUrl(selectedTenantObject?.profileImageUrl ?? "");
    setLeadChatDisplayName("");
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
    if (!selectedTenant || activeScreen !== "liveQueue") return;
    const timer = window.setInterval(() => {
      loadQueue(selectedTenant).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeScreen, selectedTenant]);

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
    const response = await fetch(`${apiBase}/api/chat/queue/${contactId}/assign`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": selectedTenant,
      },
      body: JSON.stringify({ agentId }),
    });

    if (!response.ok) {
      setStatusMessage("Não foi possível assumir o atendimento");
      return;
    }

    setStatusMessage("Atendimento assumido com sucesso");
    window.open(getAgentViewUrl(selectedTenant, contactId, agentId), "_blank");
    await loadQueue(selectedTenant);
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
    const response = await fetch(`${apiBase}/api/master/tenants/${selectedTenant}/profile-image`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileImageUrl: trimmed }),
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

  function goToAttendantsStepFromProfile() {
    setMasterWizardUnlocked((previous) => Math.max(previous, 2));
    setMasterWizardStep(2);
    void saveLeadChatDisplayName();
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
    if (masterWizardStep !== 2 || !selectedTenant) return;
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

  async function copyFlowShareLink(flowId: string) {
    const codeRes = await fetch(`${apiBase}/api/master/flows/${flowId}/share-code`, { method: "POST" });
    if (!codeRes.ok) {
      setStatusMessage("Falha ao gerar link curto.");
      return;
    }
    const { shortShareCode } = (await codeRes.json()) as { shortShareCode?: string };
    if (!shortShareCode) {
      setStatusMessage("Código curto indisponível.");
      return;
    }
    const url = `${publicApiBase.replace(/\/$/, "")}/r/${shortShareCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatusMessage("Link de divulgação copiado.");
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

  async function promoteFlowToSystemLibrary(flow: SavedFlow) {
    const response = await fetch(`${apiBase}/api/master/system-library/promote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceFlowId: flow.id, title: flow.displayLabel ?? flow.nickname }),
    });
    if (!response.ok) {
      setStatusMessage("Não foi possível promover o fluxo para Padrão Sistema.");
      return;
    }
    setStatusMessage("Fluxo definido como Padrão Sistema.");
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
          {masterProfile === "subscriber_master" ? (
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
            </button>
          ) : null}
        </nav>
      </aside>

      <main className="content">
        <header className="top-header">
          <div>
            <h2>Painel Master</h2>
            <p>Gerencie assinantes, assinatura e bloqueio de acesso</p>
          </div>
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
              <div className="tenant-profile-card">
                <h4>Configuração do perfil</h4>
                <div className="grid-form">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const result = typeof reader.result === "string" ? reader.result : "";
                        setTenantProfileImageUrl(result);
                        void persistProfileImageToServer(result);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Nome a ser exibido no chat do lead"
                    value={leadChatDisplayName}
                    onChange={(event) => setLeadChatDisplayName(event.target.value)}
                  />
                </div>
                {tenantProfileImageUrl ? (
                  <div className="tenant-profile-preview">
                    <img src={tenantProfileImageUrl} alt="Prévia perfil" />
                    <span>Essa imagem será utilizada para identificar o seu negócio no chat de atendimento.</span>
                  </div>
                ) : (
                  <p className="muted">Adicione uma imagem para personalizar o avatar e as cores do chat.</p>
                )}
                <div className="wizard-step-actions">
                  {(Boolean(tenantProfileImageUrl.trim()) || profileImageUploadedInStep || isStep1Completed) &&
                  leadChatDisplayName.trim().length >= 2 ? (
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
                <h4>Etapa 2 — Adicionar atendente</h4>
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
                  {isAutoCreatingAttendant ? (
                    <span className="processing-inline-wrap" aria-live="polite">
                      <i className="processing-inline-dot" aria-hidden="true" />
                      Salvando atendente automaticamente...
                    </span>
                  ) : (
                    "Preencha os campos. Ao completar os dados, o atendente é salvo automaticamente."
                  )}
                </p>
                {visibleAttendants.length > 0 ? (
                  <div className="saved-flows-table attendants-table">
                    <div className="saved-flows-header attendants-header">
                      <span>Usuário</span>
                      <span>Nome no chat</span>
                      <span>Tipo</span>
                      <span />
                    </div>
                    {visibleAttendants.map((row) => (
                      <div key={row.id} className="saved-flows-row attendants-row">
                        <span>{row.username}</span>
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
                ) : (
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
                <div className="grid-form">
                  <select value={selectedLibraryId} onChange={(event) => setSelectedLibraryId(event.target.value)}>
                    <option value="">Selecionar</option>
                    {selectableFlowLibrary.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void activateFlowFromLibrary()} disabled={!selectedLibraryId}>
                    Ativar da biblioteca
                  </button>
                </div>
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
                      {libraryFlowRows.map(({ item, linkedFlow, isIncluded }) => (
                        <div key={item.id} className="saved-flows-row library-active-row">
                          <span>{linkedFlow?.displayLabel ?? linkedFlow?.nickname ?? item.title}</span>
                          <span className={`flow-status ${isIncluded ? "active" : "inactive"}`}>
                            <i />
                            {isIncluded ? "Ativo" : "Inativo"}
                          </span>
                          <span className="flow-url-cell">
                            <a href={linkedFlow?.url ?? item.viewerUrl} target="_blank" rel="noreferrer">
                              {linkedFlow?.url ?? item.viewerUrl}
                            </a>
                          </span>
                          <span className="flow-row-actions">
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
                              disabled={!linkedFlow || !isIncluded}
                              onClick={() => (linkedFlow ? void copyFlowShareLink(linkedFlow.id) : undefined)}
                            >
                              Link curto
                            </button>
                          </span>
                        </div>
                      ))}
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
            <p className="muted">
              Fluxos da conta <strong>walkup@walkuptec.com.br</strong>. Ao marcar como <strong>Padrão Sistema</strong>, o item fica
              disponível para o assinante em "Ativar da biblioteca".
            </p>

            <div className="saved-flows-table master-library-table">
              <div className="saved-flows-header master-library-row">
                <span>Fluxo origem</span>
                <span>URL</span>
                <span>Ação</span>
              </div>
              {unpublishedSourceMasterFlows.map((flow) => {
                return (
                  <div key={flow.id} className="saved-flows-row master-library-row">
                    <span>{flow.displayLabel ?? flow.nickname}</span>
                    <span className="flow-url-cell">
                      <a href={flow.url} target="_blank" rel="noreferrer">
                        {flow.url}
                      </a>
                    </span>
                    <span>
                      <button type="button" onClick={() => void promoteFlowToSystemLibrary(flow)}>
                        Definir como Padrão Sistema
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
              <h4>Fluxos já publicados na Biblioteca Master</h4>
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
                        <a href={item.viewerUrl} target="_blank" rel="noreferrer">
                          {item.viewerUrl}
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
                        <small>
                          Typebot:{" "}
                          {tenant.typebotProvisionStatus === "provisioned"
                            ? "Provisionado"
                            : tenant.typebotProvisionStatus === "pending_manual"
                              ? "Pendente de ativação"
                              : tenant.typebotProvisionStatus === "failed"
                                ? "Falha"
                                : "Não iniciado"}
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
                      <button
                        className="ghost-btn typebot-access-btn"
                        onClick={() => window.open(getTypebotAccessUrl(tenant), "_blank", "noopener,noreferrer")}
                      >
                        Acessar Typebot
                      </button>
                    </span>
                  </div>
                ))}
                {filteredTenants.length === 0 ? <p className="muted">Nenhum assinante encontrado para os filtros aplicados.</p> : null}
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
                <span>Status</span>
                <span>Atualizado em</span>
                <span>Ação</span>
              </div>
              {queueItems.map((item) => (
                <div className="table-row queue-table-row" key={item.contactId}>
                  <span>{item.contactName}</span>
                  <span>{item.sourceFlowLabel}</span>
                  <span>{item.status === "waiting" ? "Aguardando" : `Em atendimento (${item.assignedAgentId})`}</span>
                  <span>{new Date(item.updatedAt).toLocaleString("pt-BR")}</span>
                  <span>
                    {item.status === "waiting" ? (
                      <button onClick={() => assignContact(item.contactId)}>Assumir atendimento</button>
                    ) : (
                      <button
                        onClick={() =>
                          window.open(getAgentViewUrl(selectedTenant, item.contactId, item.assignedAgentId ?? agentId), "_blank")
                        }
                      >
                        Abrir atendimento
                      </button>
                    )}
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
                    required
                  />
                  <input
                    type="email"
                    placeholder="E-mail de cadastro"
                    value={newTenantEmail}
                    onChange={(event) => setNewTenantEmail(event.target.value)}
                    required
                  />
                  <input
                    placeholder="WhatsApp de cadastro"
                    value={newTenantWhatsapp}
                  onChange={(event) => setNewTenantWhatsapp(formatWhatsapp(event.target.value))}
                    required
                  />
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setIsSubscriberModalOpen(false);
                      resetSubscriberForm();
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="submit">{editingTenantId ? "Salvar alterações" : "Criar assinante"}</button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
