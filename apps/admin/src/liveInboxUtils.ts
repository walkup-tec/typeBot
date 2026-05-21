export type LiveInboxTab = "mine" | "unassigned" | "all";

export type QueueLabelTag = {
  id: string;
  name: string;
  color: string;
};

export type QueueListItem = {
  contactId: string;
  tenantId: string;
  tenantName?: string;
  contactName: string;
  sourceFlowLabel: string;
  status: "waiting" | "in_service" | "closed";
  assignedAgentId?: string;
  assignedAgentName?: string;
  priorityName?: string;
  labelIds?: string[];
  labels?: QueueLabelTag[];
  labelName?: string;
  labelColor?: string;
  isPinned?: boolean;
  updatedAt: string;
  leadContext?: Record<string, string | number | boolean>;
};

const sortInboxByPinnedAndDate = (items: QueueListItem[]) =>
  [...items].sort((left, right) => {
    const leftPinned = left.isPinned === true ? 1 : 0;
    const rightPinned = right.isPinned === true ? 1 : 0;
    if (leftPinned !== rightPinned) return rightPinned - leftPinned;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

export function resolveCurrentAgentId(
  authUsername: string | undefined,
  fallbackAgentId: string,
  useMasterOnly: boolean,
): string {
  const masterUsername = authUsername?.trim();
  if (useMasterOnly && masterUsername) return masterUsername;
  return fallbackAgentId.trim() || masterUsername || "atendente";
}

export function filterInboxContacts(
  items: QueueListItem[],
  tab: LiveInboxTab,
  currentAgentId: string,
): QueueListItem[] {
  const agentKey = currentAgentId.trim().toLowerCase();

  if (tab === "all") return sortInboxByPinnedAndDate(items);
  if (tab === "unassigned") {
    return sortInboxByPinnedAndDate(items.filter((item) => item.status === "waiting"));
  }
  return sortInboxByPinnedAndDate(
    items.filter((item) => {
      const assignedToMe =
        String(item.assignedAgentId ?? "")
          .trim()
          .toLowerCase() === agentKey;
      if (!assignedToMe) return false;
      return item.status === "in_service" || item.status === "closed";
    }),
  );
}

export function countInboxContacts(items: QueueListItem[], currentAgentId: string) {
  return {
    mine: filterInboxContacts(items, "mine", currentAgentId).length,
    unassigned: filterInboxContacts(items, "unassigned", currentAgentId).length,
    all: items.length,
  };
}

export function formatInboxRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function resolveInboxPreviewText(item: QueueListItem): string {
  const context = item.leadContext ?? {};
  const messageKeys = ["mensagem", "message", "ultimaMensagem", "lastMessage", "texto"];
  for (const key of messageKeys) {
    const value = context[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (item.status === "waiting") return "Aguardando atendimento na fila";
  if (item.status === "closed") return "Atendimento finalizado";
  return "Conversa em andamento";
}

export function resolveFlowLabelColor(label: string): string {
  let hash = 0;
  const text = label.trim().toLowerCase();
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 62% 48%)`;
}

export function resolveInboxStatus(item: QueueListItem): { label: string; tone: "open" | "active" | "resolved" } {
  if (item.status === "waiting") {
    return { label: "Aberta", tone: "open" };
  }
  if (item.status === "closed") {
    return { label: "Finalizado", tone: "resolved" };
  }
  return { label: "Em atendimento", tone: "active" };
}
