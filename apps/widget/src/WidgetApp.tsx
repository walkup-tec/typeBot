import { CSSProperties, ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

const defaultApiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3333";
const tenantId = import.meta.env.VITE_TENANT_ID ?? "demo-tenant";
const typebotPublicUrl = import.meta.env.VITE_TYPEBOT_PUBLIC_URL ?? "";

type LiveMessage = {
  id: string;
  contactId: string;
  sender: "system" | "agent" | "visitor";
  content: string;
  createdAt: string;
};

type LeadAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  content: string;
  createdAt: string;
};

type QueueContactProfile = {
  contactName?: string;
  leadWhatsapp?: string;
  agentNotes?: string;
  leadContext?: Record<string, string | number | boolean>;
  attachments?: LeadAttachment[];
  assignedAgentId?: string;
};

type AttendantOption = {
  username: string;
  displayName: string;
};

type TenantBranding = {
  displayName: string;
  logoUrl: string;
  bubbleColor: string;
};

const DEFAULT_BRANDING: TenantBranding = {
  displayName: "Atendente",
  logoUrl: "",
  bubbleColor: "#2f6ca3",
};

const normalizeHexColor = (raw: string | undefined): string => {
  const value = String(raw ?? "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "";
};

const getReadableTextColor = (hexColor: string): string => {
  const color = normalizeHexColor(hexColor);
  if (!color) return "#ffffff";
  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  // Limite mais conservador para tons médios/fortes (ex.: laranja da Ideal Cred)
  // manterem fonte clara e melhor legibilidade visual no chat.
  return luminance > 0.74 ? "#111827" : "#f8fafc";
};

const getInitials = (label: string): string =>
  String(label ?? "")
    .split(" ")
    .map((token) => token.trim()[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

const buildTenantBubbleStyle = (bubbleColor: string, textColor: string): CSSProperties =>
  ({
    backgroundColor: bubbleColor,
    borderColor: bubbleColor,
    color: textColor,
    "--tenant-bubble-fg": textColor,
  }) as CSSProperties;

const IMAGE_DATA_URL_PREFIX = "data:image/";
const MAX_IMAGE_SIDE = 900;
const IMAGE_JPEG_QUALITY = 0.78;
const MAX_IMAGE_PAYLOAD_LENGTH = 260000;

const isImageMessage = (content: string): boolean => String(content ?? "").trim().startsWith(IMAGE_DATA_URL_PREFIX);

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Falha ao ler imagem."));
    reader.readAsDataURL(file);
  });

const compressImageDataUrl = (dataUrl: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
      const targetWidth = Math.max(1, Math.round(image.width * ratio));
      const targetHeight = Math.max(1, Math.round(image.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("Falha ao processar imagem."));
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY));
    };
    image.onerror = () => reject(new Error("Arquivo de imagem inválido."));
    image.src = dataUrl;
  });

export function WidgetApp() {
  const search = new URLSearchParams(window.location.search);
  const apiBase = (search.get("apiBase") ?? defaultApiBase).trim().replace(/\/$/, "");
  const mode = search.get("mode") ?? "visitor";
  const sessionContactId = search.get("contactId") ?? "";
  const sessionTenantIdFromQuery = search.get("tenantId") ?? "";
  const sessionTenantId = sessionTenantIdFromQuery || tenantId;
  const sessionAgentId = search.get("agentId") ?? "atendente-01";
  const sessionAgentName = search.get("agentName") ?? sessionAgentId;
  const sessionContactNameFromQuery = search.get("contactName") ?? "";
  const bootstrapContactName = search.get("contactName") ?? "Lead Typebot";
  const bootstrapFlowLabel = search.get("flow") ?? "clt-soma";

  const [status, setStatus] = useState("");
  const [botLoaded, setBotLoaded] = useState(false);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [agentMessage, setAgentMessage] = useState("");
  const [resolvedAgentName, setResolvedAgentName] = useState(sessionAgentName);
  const [leadDisplayName, setLeadDisplayName] = useState(
    () => sessionContactNameFromQuery.trim() || "Visitante",
  );
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [leadNameDraft, setLeadNameDraft] = useState("");
  const [leadWhatsappDraft, setLeadWhatsappDraft] = useState("");
  const [leadNotesDraft, setLeadNotesDraft] = useState("");
  const [leadAssignTo, setLeadAssignTo] = useState("");
  const [leadVariables, setLeadVariables] = useState<Array<{ key: string; value: string }>>([]);
  const [leadAttachments, setLeadAttachments] = useState<LeadAttachment[]>([]);
  const [leadAttendants, setLeadAttendants] = useState<AttendantOption[]>([]);
  const [leadAssignedAgentId, setLeadAssignedAgentId] = useState("");
  const [leadDrawerStatus, setLeadDrawerStatus] = useState("");
  const [resolvedSessionTenantId, setResolvedSessionTenantId] = useState(sessionTenantIdFromQuery || "");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const agentImageInputRef = useRef<HTMLInputElement | null>(null);
  const leadFilesInputRef = useRef<HTMLInputElement | null>(null);
  const visitorImageInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const botUrl = useMemo(() => typebotPublicUrl.trim(), []);
  const isAgentMode = mode === "agent" && sessionContactId;
  const isVisitorLiveMode = mode === "visitorLive" && sessionContactId && sessionTenantId;
  const isVisitorBootstrapMode = mode === "visitorLiveBootstrap";
  const [bootstrappedContactId, setBootstrappedContactId] = useState("");
  const [tenantBranding, setTenantBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const activeVisitorContactId = sessionContactId || bootstrappedContactId;
  const rightBubbleTextColor = useMemo(
    () => getReadableTextColor(tenantBranding.bubbleColor),
    [tenantBranding.bubbleColor],
  );
  const sendButtonStyle = useMemo(
    () =>
      ({
        backgroundColor: tenantBranding.bubbleColor,
        borderColor: tenantBranding.bubbleColor,
        color: rightBubbleTextColor,
      }) as CSSProperties,
    [tenantBranding.bubbleColor, rightBubbleTextColor],
  );

  const scrollChatToBottom = () => {
    const chatEl = chatScrollRef.current;
    if (!chatEl) return;
    chatEl.scrollTop = chatEl.scrollHeight;
  };

  useEffect(() => {
    setResolvedAgentName(sessionAgentName);
  }, [sessionAgentName]);

  const buildTenantHeaders = (includeJsonContentType = false): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (includeJsonContentType) headers["content-type"] = "application/json";
    const tenantHeaderValue = resolvedSessionTenantId || sessionTenantId;
    if (tenantHeaderValue) headers["x-tenant-id"] = tenantHeaderValue;
    return headers;
  };

  const captureResolvedTenantId = (response: Response) => {
    const resolvedHeader = String(response.headers.get("x-resolved-tenant-id") ?? "").trim();
    if (resolvedHeader) setResolvedSessionTenantId((current) => current || resolvedHeader);
  };

  async function askForHumanAgent() {
    const visitorName = `Lead-${new Date().getHours()}${new Date().getMinutes()}`;
    const response = await fetch(`${apiBase}/api/chat/queue`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({ contactName: visitorName }),
    });

    if (!response.ok) {
      setStatus("Não foi possível entrar na fila de atendimento.");
      return;
    }

    setStatus("Você entrou na fila de atendimento. Aguarde um atendente assumir.");
  }

  async function loadMessages(contactId: string) {
    if (!contactId) return;
    const response = await fetch(`${apiBase}/api/chat/sessions/${contactId}/messages`, {
      headers: buildTenantHeaders(),
    });
    captureResolvedTenantId(response);
    if (!response.ok) {
      if (response.status === 404) {
        setStatus("Sessão não encontrada para este tenant. Reabra o atendimento pela Fila ao vivo.");
      } else {
        setStatus("Não foi possível carregar as mensagens da sessão.");
      }
      return;
    }
    setStatus("");
    const data = (await response.json()) as LiveMessage[];
    setMessages(data);
  }

  async function sendAgentMessage(event: FormEvent) {
    event.preventDefault();
    if (!agentMessage.trim()) return;

    const response = await fetch(`${apiBase}/api/chat/sessions/${sessionContactId}/messages`, {
      method: "POST",
      headers: buildTenantHeaders(true),
      body: JSON.stringify({ sender: "agent", content: agentMessage }),
    });
    captureResolvedTenantId(response);

    if (!response.ok) {
      setStatus("Não foi possível enviar mensagem para a sessão.");
      return;
    }

    setAgentMessage("");
    await loadMessages(sessionContactId);
  }

  async function sendLiveContent(contactId: string, sender: "agent" | "visitor", content: string) {
    const response = await fetch(`${apiBase}/api/chat/sessions/${contactId}/messages`, {
      method: "POST",
      headers: buildTenantHeaders(true),
      body: JSON.stringify({ sender, content }),
    });
    captureResolvedTenantId(response);
    return response.ok;
  }

  const applyLeadContactToForm = (contact: QueueContactProfile) => {
    const nextName = String(contact.contactName ?? "").trim();
    setLeadNameDraft(nextName);
    setLeadWhatsappDraft(String(contact.leadWhatsapp ?? "").trim());
    setLeadNotesDraft(String(contact.agentNotes ?? "").trim());
    setLeadAssignedAgentId(String(contact.assignedAgentId ?? "").trim().toLowerCase());
    if (nextName) setLeadDisplayName(nextName);
    const variables = Object.entries(contact.leadContext ?? {})
      .filter(([key, value]) => key && String(value ?? "").trim())
      .map(([key, value]) => ({ key, value: String(value) }));
    setLeadVariables(variables);
    setLeadAttachments(Array.isArray(contact.attachments) ? contact.attachments : []);
  };

  const refreshLeadDrawer = async () => {
    if (!sessionContactId) return;
    setLeadDrawerStatus("Carregando dados do lead...");
    try {
      const response = await fetch(`${apiBase}/api/chat/queue/${encodeURIComponent(sessionContactId)}`, {
        headers: buildTenantHeaders(),
      });
      captureResolvedTenantId(response);
      if (!response.ok) {
        setLeadDrawerStatus("Não foi possível carregar os dados do lead.");
        return;
      }
      const contact = (await response.json()) as QueueContactProfile;
      applyLeadContactToForm(contact);
      const tenantForLookup = resolvedSessionTenantId || sessionTenantId;
      if (tenantForLookup) {
        const attendantsResponse = await fetch(
          `${apiBase}/api/master/tenants/${encodeURIComponent(tenantForLookup)}/attendants`,
        );
        if (attendantsResponse.ok) {
          const rows = (await attendantsResponse.json()) as Array<{ username?: string; displayName?: string }>;
          setLeadAttendants(
            rows
              .map((row) => ({
                username: String(row.username ?? "").trim(),
                displayName: String(row.displayName ?? row.username ?? "").trim(),
              }))
              .filter((row) => row.username),
          );
        }
      }
      setLeadAssignTo("");
      setLeadDrawerStatus("");
    } catch {
      setLeadDrawerStatus("Não foi possível carregar os dados do lead.");
    }
  };

  const saveLeadProfile = async () => {
    if (!sessionContactId) return;
    setLeadDrawerStatus("Salvando...");
    const payload: { contactName?: string; leadWhatsapp: string; agentNotes: string } = {
      leadWhatsapp: leadWhatsappDraft.trim(),
      agentNotes: leadNotesDraft.trim(),
    };
    const nextName = leadNameDraft.trim();
    if (nextName.length >= 2) payload.contactName = nextName;
    try {
      const response = await fetch(`${apiBase}/api/chat/queue/${encodeURIComponent(sessionContactId)}/profile`, {
        method: "PATCH",
        headers: buildTenantHeaders(true),
        body: JSON.stringify(payload),
      });
      captureResolvedTenantId(response);
      if (!response.ok) {
        setLeadDrawerStatus("Falha ao salvar dados do lead.");
        return;
      }
      const updated = (await response.json()) as QueueContactProfile;
      applyLeadContactToForm(updated);
      const assignTo = leadAssignTo.trim();
      if (assignTo) {
        const attendant = leadAttendants.find((row) => row.username === assignTo);
        const assignResponse = await fetch(`${apiBase}/api/chat/queue/${encodeURIComponent(sessionContactId)}/assign`, {
          method: "PATCH",
          headers: buildTenantHeaders(true),
          body: JSON.stringify({
            agentId: assignTo,
            agentName: attendant?.displayName || assignTo,
          }),
        });
        captureResolvedTenantId(assignResponse);
        if (!assignResponse.ok) {
          setLeadDrawerStatus("Dados salvos, mas a transferência falhou.");
          return;
        }
        applyLeadContactToForm((await assignResponse.json()) as QueueContactProfile);
      }
      setLeadDrawerStatus("Dados do lead salvos.");
    } catch {
      setLeadDrawerStatus("Falha ao salvar dados do lead.");
    }
  };

  const uploadLeadAttachment = async (file: File) => {
    const fileName = String(file.name || "anexo").trim();
    const mimeType = String(file.type || "application/octet-stream").trim();
    let content = "";
    if (mimeType.startsWith("image/")) {
      const raw = await readFileAsDataUrl(file);
      content = await compressImageDataUrl(raw);
    } else {
      content = await readFileAsDataUrl(file);
    }
    if (content.length > MAX_IMAGE_PAYLOAD_LENGTH) throw new Error("Arquivo grande demais.");
    const response = await fetch(`${apiBase}/api/chat/queue/${encodeURIComponent(sessionContactId)}/attachments`, {
      method: "POST",
      headers: buildTenantHeaders(true),
      body: JSON.stringify({ fileName, mimeType, content }),
    });
    captureResolvedTenantId(response);
    if (!response.ok) throw new Error("Falha no upload.");
    applyLeadContactToForm((await response.json()) as QueueContactProfile);
  };

  const handleLeadFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? [...event.target.files] : [];
    event.target.value = "";
    if (files.length === 0) return;
    setLeadDrawerStatus("Enviando anexos...");
    try {
      for (const file of files) {
        await uploadLeadAttachment(file);
      }
      setLeadDrawerStatus("Anexos enviados.");
    } catch {
      setLeadDrawerStatus("Falha ao enviar um ou mais anexos.");
    }
  };

  useEffect(() => {
    if (!isAgentMode || !leadDrawerOpen) return;
    void refreshLeadDrawer();
  }, [isAgentMode, leadDrawerOpen, sessionContactId, resolvedSessionTenantId, sessionTenantId]);

  useEffect(() => {
    if (!isAgentMode) return;
    loadMessages(sessionContactId);
    const interval = setInterval(() => loadMessages(sessionContactId), 2500);
    return () => clearInterval(interval);
  }, [isAgentMode, sessionContactId, resolvedSessionTenantId, sessionTenantId]);

  useEffect(() => {
    if (!isAgentMode || !sessionContactId) return;
    const fromQuery = sessionContactNameFromQuery.trim();
    if (fromQuery) {
      setLeadDisplayName(fromQuery);
      return;
    }
    const run = async () => {
      try {
        const response = await fetch(`${apiBase}/api/chat/queue/${encodeURIComponent(sessionContactId)}`, {
          headers: buildTenantHeaders(),
        });
        captureResolvedTenantId(response);
        if (!response.ok) return;
        const data = (await response.json()) as { contactName?: string };
        const resolved = String(data.contactName ?? "").trim();
        if (resolved) setLeadDisplayName(resolved);
      } catch {
        // Mantém fallback local quando a fila não estiver acessível.
      }
    };
    void run();
  }, [isAgentMode, sessionContactId, sessionContactNameFromQuery, resolvedSessionTenantId, sessionTenantId]);

  useEffect(() => {
    const run = async () => {
      const tenantForLookup = resolvedSessionTenantId || sessionTenantId;
      if (!isAgentMode || !tenantForLookup || !sessionAgentId) return;
      if (sessionAgentName && sessionAgentName !== sessionAgentId) return;
      try {
        const response = await fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantForLookup)}/attendants`);
        if (!response.ok) return;
        const rows = (await response.json()) as Array<{
          id?: string;
          username?: string;
          displayName?: string;
        }>;
        const match = rows.find((row) => {
          const rowUsername = String(row.username ?? "").trim().toLowerCase();
          const rowId = String(row.id ?? "").trim();
          return rowUsername === sessionAgentId.trim().toLowerCase() || rowId === sessionAgentId;
        });
        const nextName = String(match?.displayName ?? "").trim();
        if (nextName) setResolvedAgentName(nextName);
      } catch {
        // mantém fallback com agentId quando não conseguir resolver displayName
      }
    };
    run();
  }, [isAgentMode, resolvedSessionTenantId, sessionTenantId, sessionAgentId, sessionAgentName]);

  useEffect(() => {
    const run = async () => {
      const tenantForBranding = resolvedSessionTenantId || sessionTenantId;
      if (!tenantForBranding) return;
      try {
        const response = await fetch(`${apiBase}/api/master/tenants`);
        if (!response.ok) return;
        const rows = (await response.json()) as Array<{
          id?: string;
          name?: string;
          chatDisplayName?: string;
          profileImageUrl?: string;
          defaultChatTheme?: { userBubbleBg?: string };
        }>;
        const tenant = rows.find((row) => String(row.id ?? "").trim() === tenantForBranding);
        if (!tenant) return;
        const displayName = String(tenant.chatDisplayName ?? tenant.name ?? "").trim() || "Atendente";
        const logoUrl = String(tenant.profileImageUrl ?? "").trim();
        const bubbleColor = normalizeHexColor(tenant.defaultChatTheme?.userBubbleBg) || DEFAULT_BRANDING.bubbleColor;
        setTenantBranding({
          displayName,
          logoUrl,
          bubbleColor,
        });
      } catch {
        // mantém fallback local quando branding não carregar
      }
    };
    run();
  }, [resolvedSessionTenantId, sessionTenantId]);

  useEffect(() => {
    if (!isVisitorBootstrapMode || bootstrappedContactId) return;

    const run = async () => {
      const response = await fetch(`${apiBase}/api/typebot/handoff`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantId: sessionTenantId,
          contactName: bootstrapContactName,
          source: "typebot",
          sourceFlowLabel: bootstrapFlowLabel,
          initialMessage: "Cliente solicitou falar com atendente",
        }),
      });

      if (!response.ok) {
        setStatus("Não foi possível iniciar atendimento ao vivo.");
        return;
      }

      const payload = (await response.json()) as { contactId: string };
      setBootstrappedContactId(payload.contactId);
      const next = new URL(window.location.href);
      next.searchParams.set("mode", "visitorLive");
      next.searchParams.set("contactId", payload.contactId);
      window.history.replaceState({}, "", next.toString());
    };

    run();
  }, [isVisitorBootstrapMode, bootstrappedContactId, sessionTenantId, bootstrapContactName, bootstrapFlowLabel]);

  useEffect(() => {
    if (!(isVisitorLiveMode || (isVisitorBootstrapMode && activeVisitorContactId))) return;
    loadMessages(activeVisitorContactId);
    const interval = setInterval(() => loadMessages(activeVisitorContactId), 2500);
    return () => clearInterval(interval);
  }, [isVisitorLiveMode, isVisitorBootstrapMode, activeVisitorContactId, sessionTenantId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      scrollChatToBottom();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    const chatEl = chatScrollRef.current;
    if (!chatEl) return;
    const imageNodes = Array.from(chatEl.querySelectorAll("img.live-message-image"));
    if (imageNodes.length === 0) return;

    let cancelled = false;
    const cleanupFns: Array<() => void> = [];
    const safeScroll = () => {
      if (cancelled) return;
      scrollChatToBottom();
    };

    imageNodes.forEach((img) => {
      if (img.complete) {
        safeScroll();
        return;
      }
      const onLoad = () => safeScroll();
      img.addEventListener("load", onLoad, { once: true });
      cleanupFns.push(() => img.removeEventListener("load", onLoad));
    });

    return () => {
      cancelled = true;
      cleanupFns.forEach((fn) => fn());
    };
  }, [messages]);

  async function sendVisitorMessage(event: FormEvent) {
    event.preventDefault();
    if (!agentMessage.trim()) return;

    const response = await fetch(`${apiBase}/api/chat/sessions/${activeVisitorContactId}/messages`, {
      method: "POST",
      headers: buildTenantHeaders(true),
      body: JSON.stringify({ sender: "visitor", content: agentMessage }),
    });
    captureResolvedTenantId(response);

    if (!response.ok) {
      setStatus("Não foi possível enviar sua mensagem para o atendente.");
      return;
    }

    setAgentMessage("");
    await loadMessages(activeVisitorContactId);
  }

  const openImagePicker = (context: "agent" | "visitor") => {
    const targetRef = context === "agent" ? agentImageInputRef : visitorImageInputRef;
    targetRef.current?.click();
  };

  async function handleImageSelected(event: ChangeEvent<HTMLInputElement>, sender: "agent" | "visitor", contactId: string) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Selecione um arquivo de imagem válido.");
      return;
    }
    try {
      setIsUploadingImage(true);
      const rawDataUrl = await readFileAsDataUrl(file);
      const compressedDataUrl = await compressImageDataUrl(rawDataUrl);
      if (compressedDataUrl.length > MAX_IMAGE_PAYLOAD_LENGTH) {
        setStatus("Imagem muito grande. Escolha uma imagem menor.");
        return;
      }
      const ok = await sendLiveContent(contactId, sender, compressedDataUrl);
      if (!ok) {
        setStatus("Não foi possível enviar a imagem.");
        return;
      }
      await loadMessages(contactId);
      setStatus("");
    } catch {
      setStatus("Não foi possível processar a imagem selecionada.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  if (isVisitorBootstrapMode && !bootstrappedContactId) {
    return (
      <div className="widget-shell">
        <div className="widget-header">
          <strong>Atendimento ao vivo</strong>
          <span>Estamos conectando voce com um atendente...</span>
        </div>
        <div className="widget-chat agent-chat" ref={chatScrollRef}>
          <div className="loading-hint">Criando sessao de atendimento, aguarde alguns segundos.</div>
        </div>
      </div>
    );
  }

  if (isAgentMode) {
    return (
      <div className="widget-shell">
        <div className="widget-header widget-header--agent">
          <div className="lead-header-main">
            <strong>{leadDisplayName}</strong>
            <span>Você está conversando com o visitante em tempo real</span>
          </div>
          <button
            type="button"
            className="lead-info-button"
            title="Dados do lead"
            aria-label="Abrir dados do lead"
            onClick={() => setLeadDrawerOpen(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
            </svg>
          </button>
        </div>

        <div className="widget-chat agent-chat">
          {messages.length === 0 ? <div className="loading-hint">Aguardando mensagens da sessão...</div> : null}
          {messages.map((message) => (
            <div className={`live-message-row ${message.sender === "agent" ? "mine" : "other"}`} key={message.id}>
              {message.sender === "agent" ? (
                <span className="message-avatar message-avatar--right" aria-hidden="true">
                  {tenantBranding.logoUrl ? (
                    <img src={tenantBranding.logoUrl} alt={tenantBranding.displayName} />
                  ) : (
                    <span>{getInitials(tenantBranding.displayName)}</span>
                  )}
                </span>
              ) : message.sender === "visitor" ? (
                <span className="message-avatar message-avatar--lead" aria-hidden="true">
                  <span className="message-avatar-icon">
                    <span className="message-avatar-icon-head" />
                    <span className="message-avatar-icon-body" />
                  </span>
                </span>
              ) : null}
              <div
                className={`live-message ${message.sender} ${message.sender === "agent" ? "mine" : "other"}`}
                style={
                  message.sender === "agent"
                    ? buildTenantBubbleStyle(tenantBranding.bubbleColor, rightBubbleTextColor)
                    : undefined
                }
              >
                <strong>{message.sender === "agent" ? tenantBranding.displayName : message.sender === "visitor" ? "Cliente" : "Sistema"}</strong>
                {isImageMessage(message.content) ? (
                  <img
                    className="live-message-image"
                    src={message.content}
                    alt="Imagem enviada no chat"
                    onLoad={scrollChatToBottom}
                  />
                ) : (
                  <p>{message.content}</p>
                )}
                <small>
                  {new Date(message.createdAt).toLocaleString("pt-BR")}
                </small>
              </div>
            </div>
          ))}
        </div>

        <form className="widget-input" onSubmit={sendAgentMessage}>
          <input
            ref={agentImageInputRef}
            className="image-picker-input"
            type="file"
            accept="image/*"
            onChange={(event) => handleImageSelected(event, "agent", sessionContactId)}
          />
          <button
            type="button"
            className="attach-button"
            onClick={() => openImagePicker("agent")}
            title="Enviar imagem"
            disabled={isUploadingImage}
            style={sendButtonStyle}
          >
            <span className="attach-button-symbol">+</span>
          </button>
          <input
            placeholder="Digite sua resposta..."
            value={agentMessage}
            onChange={(event) => setAgentMessage(event.target.value)}
          />
          <button type="submit" style={sendButtonStyle} disabled={isUploadingImage}>Enviar</button>
        </form>

        <small className="session-meta">
          Sessão: {sessionContactId} | Atendente: {resolvedAgentName}
        </small>

        {status ? <small>{status}</small> : null}

        <div
          className={`lead-drawer-overlay${leadDrawerOpen ? " open" : ""}`}
          aria-hidden={!leadDrawerOpen}
          onClick={(event) => {
            if (event.target === event.currentTarget) setLeadDrawerOpen(false);
          }}
        >
          <aside className="lead-drawer-panel" role="dialog" aria-labelledby="leadDrawerTitle">
            <div className="lead-drawer-head">
              <strong id="leadDrawerTitle">Dados do lead</strong>
              <button
                type="button"
                className="lead-drawer-close"
                aria-label="Fechar painel"
                onClick={() => setLeadDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="lead-drawer-body">
              <label className="lead-field">
                <span>Nome do lead</span>
                <input value={leadNameDraft} onChange={(event) => setLeadNameDraft(event.target.value)} />
              </label>
              <label className="lead-field">
                <span>WhatsApp</span>
                <input
                  value={leadWhatsappDraft}
                  onChange={(event) => setLeadWhatsappDraft(event.target.value)}
                  inputMode="tel"
                />
              </label>
              <label className="lead-field">
                <span>Atribuir para outro atendente</span>
                <select value={leadAssignTo} onChange={(event) => setLeadAssignTo(event.target.value)}>
                  <option value="">Manter atendente atual</option>
                  {leadAttendants.map((attendant) => (
                    <option key={attendant.username} value={attendant.username}>
                      {attendant.displayName} ({attendant.username})
                    </option>
                  ))}
                </select>
              </label>
              <label className="lead-field">
                <span>Anexos (imagens e documentos)</span>
                <input
                  ref={leadFilesInputRef}
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                  multiple
                  onChange={handleLeadFilesSelected}
                />
              </label>
              <div className="lead-attachments-list">
                {leadAttachments.map((item) => (
                  <div className="lead-attachment-item" key={item.id}>
                    <strong>{item.fileName}</strong>
                    {item.mimeType.startsWith("image/") || item.content.startsWith(IMAGE_DATA_URL_PREFIX) ? (
                      <img className="live-message-image" src={item.content} alt={item.fileName} />
                    ) : (
                      <a href={item.content} download={item.fileName}>
                        Baixar
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <label className="lead-field">
                <span>Variáveis do Typebot</span>
              </label>
              <div className="lead-variables-list">
                {leadVariables.length === 0 ? (
                  <div className="lead-variable-chip">
                    <strong>Sem variáveis registradas</strong>
                  </div>
                ) : (
                  leadVariables.map((item) => (
                    <div className="lead-variable-chip" key={item.key}>
                      <strong>{item.key}</strong>
                      {item.value}
                    </div>
                  ))
                )}
              </div>
              <label className="lead-field">
                <span>Observações do atendimento</span>
                <textarea
                  rows={5}
                  value={leadNotesDraft}
                  onChange={(event) => setLeadNotesDraft(event.target.value)}
                />
              </label>
              <button type="button" className="lead-save-button" onClick={() => void saveLeadProfile()}>
                Salvar dados do lead
              </button>
              {leadDrawerStatus ? <small className="lead-drawer-status">{leadDrawerStatus}</small> : null}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (isVisitorLiveMode || (isVisitorBootstrapMode && activeVisitorContactId)) {
    return (
      <div className="widget-shell">
        <div className="widget-header">
          <strong>Atendimento ao vivo</strong>
          <span>Você está conversando com um atendente humano</span>
        </div>

        <div className="widget-chat agent-chat" ref={chatScrollRef}>
          {messages.length === 0 ? <div className="loading-hint">Aguardando atendente...</div> : null}
          {messages.map((message) => (
            <div className={`live-message-row ${message.sender === "visitor" ? "mine" : "other"}`} key={message.id}>
              {message.sender === "visitor" ? (
                <span className="message-avatar message-avatar--right" aria-hidden="true">
                  {tenantBranding.logoUrl ? (
                    <img src={tenantBranding.logoUrl} alt={tenantBranding.displayName} />
                  ) : (
                    <span>{getInitials(tenantBranding.displayName)}</span>
                  )}
                </span>
              ) : null}
              <div
                className={`live-message ${message.sender} ${
                  message.sender === "visitor" ? "mine" : message.sender === "agent" ? "other" : ""
                }`}
                style={
                  message.sender === "visitor"
                    ? buildTenantBubbleStyle(tenantBranding.bubbleColor, rightBubbleTextColor)
                    : undefined
                }
              >
                <strong>{message.sender === "agent" ? "Atendente" : message.sender === "visitor" ? "Você" : "Sistema"}</strong>
                {isImageMessage(message.content) ? (
                  <img
                    className="live-message-image"
                    src={message.content}
                    alt="Imagem enviada no chat"
                    onLoad={scrollChatToBottom}
                  />
                ) : (
                  <p>{message.content}</p>
                )}
                <small>
                  {new Date(message.createdAt).toLocaleString("pt-BR")}
                </small>
              </div>
            </div>
          ))}
        </div>

        <form className="widget-input" onSubmit={sendVisitorMessage}>
          <input
            ref={visitorImageInputRef}
            className="image-picker-input"
            type="file"
            accept="image/*"
            onChange={(event) => handleImageSelected(event, "visitor", activeVisitorContactId)}
          />
          <button
            type="button"
            className="attach-button"
            onClick={() => openImagePicker("visitor")}
            title="Enviar imagem"
            disabled={isUploadingImage}
            style={sendButtonStyle}
          >
            <span className="attach-button-symbol">+</span>
          </button>
          <input placeholder="Digite sua mensagem para o atendente..." value={agentMessage} onChange={(event) => setAgentMessage(event.target.value)} />
          <button type="submit" style={sendButtonStyle} disabled={isUploadingImage}>Enviar</button>
        </form>

        {status ? <small>{status}</small> : null}
      </div>
    );
  }

  return (
    <div className="widget-shell">
      <div className="widget-header">
        <strong>Fluxo Teste (Typebot integrado)</strong>
        <span>Typebot real + handoff humano na fila SaaS</span>
      </div>

      <div className="widget-chat typebot-frame-wrapper">
        {botUrl ? (
          <>
            {!botLoaded ? <div className="loading-hint">Carregando Typebot...</div> : null}
            <iframe
              title="typebot-live"
              src={botUrl}
              className="typebot-frame"
              onLoad={() => setBotLoaded(true)}
              allow="clipboard-write; microphone"
            />
          </>
        ) : (
          <div className="loading-hint">
            Configure <code>VITE_TYPEBOT_PUBLIC_URL</code> no widget para carregar seu Typebot publicado.
          </div>
        )}
      </div>

      <div className="widget-actions">
        <button onClick={askForHumanAgent}>Falar com atendente ao vivo</button>
      </div>

      {status ? <small>{status}</small> : null}
    </div>
  );
}
