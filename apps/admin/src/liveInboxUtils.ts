import { formatBrazilianCpf, resolveLeadCpf, resolveLeadWhatsapp } from "./leadContactData";

export type LiveInboxTab = "today" | "mine" | "unassigned" | "all";

export type LiveInboxListFilters = {
  searchQuery: string;
  priorityIds: string[];
  labelIds: string[];
  flowKeys: string[];
};

const BRAZIL_TIMEZONE = "America/Sao_Paulo";

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
  sourceFlowDisplayName?: string;
  status: "waiting" | "in_service" | "closed";
  assignedAgentId?: string;
  assignedAgentName?: string;
  priorityId?: string;
  priorityName?: string;
  kanbanColumnId?: string;
  kanbanColumnName?: string;
  labelId?: string;
  labelIds?: string[];
  labels?: QueueLabelTag[];
  labelName?: string;
  labelColor?: string;
  isPinned?: boolean;
  scheduledAt?: string;
  updatedAt: string;
  leadContext?: Record<string, string | number | boolean>;
  leadWhatsapp?: string;
};

const toBrazilDateKey = (value: Date): string =>
  value.toLocaleDateString("en-CA", { timeZone: BRAZIL_TIMEZONE });

export const isScheduledForToday = (scheduledAt?: string): boolean => {
  const raw = String(scheduledAt ?? "").trim();
  if (!raw) return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  return toBrazilDateKey(date) === toBrazilDateKey(new Date());
};

export const formatInboxScheduleTime = (scheduledAt?: string): string => {
  const raw = String(scheduledAt ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    timeZone: BRAZIL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sortInboxByPinnedAndDate = (items: QueueListItem[]) =>
  [...items].sort((left, right) => {
    const leftPinned = left.isPinned === true ? 1 : 0;
    const rightPinned = right.isPinned === true ? 1 : 0;
    if (leftPinned !== rightPinned) return rightPinned - leftPinned;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

const sortInboxByPinnedAndSchedule = (items: QueueListItem[]) =>
  [...items].sort((left, right) => {
    const leftPinned = left.isPinned === true ? 1 : 0;
    const rightPinned = right.isPinned === true ? 1 : 0;
    if (leftPinned !== rightPinned) return rightPinned - leftPinned;
    const leftSchedule = new Date(left.scheduledAt ?? 0).getTime();
    const rightSchedule = new Date(right.scheduledAt ?? 0).getTime();
    if (leftSchedule !== rightSchedule) return leftSchedule - rightSchedule;
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

export const createEmptyInboxListFilters = (): LiveInboxListFilters => ({
  searchQuery: "",
  priorityIds: [],
  labelIds: [],
  flowKeys: [],
});

export function resolveInboxFlowKey(item: QueueListItem): string {
  const name = String(item.sourceFlowDisplayName ?? item.sourceFlowLabel ?? "").trim();
  return name.toLowerCase();
}

export function resolveInboxFlowLabel(item: QueueListItem): string {
  return String(item.sourceFlowDisplayName ?? item.sourceFlowLabel ?? "").trim();
}

export function collectInboxFlowOptions(items: QueueListItem[]): Array<{ key: string; name: string }> {
  const map = new Map<string, string>();
  for (const item of items) {
    const name = resolveInboxFlowLabel(item);
    if (!name) continue;
    const key = resolveInboxFlowKey(item);
    if (!map.has(key)) map.set(key, name);
  }
  return [...map.entries()]
    .map(([key, name]) => ({ key, name }))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

const resolveItemLabelIds = (item: QueueListItem): string[] => {
  if (Array.isArray(item.labelIds) && item.labelIds.length > 0) {
    return item.labelIds.map((id) => String(id).trim()).filter(Boolean);
  }
  if (item.labelId) return [String(item.labelId).trim()].filter(Boolean);
  return [];
};

export function buildInboxSearchHaystack(item: QueueListItem): string {
  const parts: string[] = [
    item.contactName,
    resolveLeadWhatsapp(item.leadWhatsapp, item.leadContext),
    resolveLeadCpf(item.leadContext),
    formatBrazilianCpf(resolveLeadCpf(item.leadContext)),
    String(item.priorityName ?? ""),
    String(item.kanbanColumnName ?? ""),
    String(item.assignedAgentName ?? ""),
    resolveInboxFlowLabel(item),
    String(item.labelName ?? ""),
    ...(item.labels?.map((label) => label.name) ?? []),
  ];
  if (item.leadContext) {
    for (const [key, value] of Object.entries(item.leadContext)) {
      parts.push(key, String(value));
    }
  }
  return parts
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesInboxSearch(item: QueueListItem, searchQuery: string): boolean {
  const query = String(searchQuery ?? "").trim().toLowerCase();
  if (!query) return true;
  const haystack = buildInboxSearchHaystack(item);
  if (haystack.includes(query)) return true;
  const queryDigits = query.replace(/\D/g, "");
  if (queryDigits.length >= 3) {
    const hayDigits = haystack.replace(/\D/g, "");
    if (hayDigits.includes(queryDigits)) return true;
  }
  return false;
}

export function applyInboxListFilters(items: QueueListItem[], filters: LiveInboxListFilters): QueueListItem[] {
  const priorityIds = filters.priorityIds.map((id) => id.trim()).filter(Boolean);
  const labelIds = filters.labelIds.map((id) => id.trim()).filter(Boolean);
  const flowKeys = filters.flowKeys.map((key) => key.trim().toLowerCase()).filter(Boolean);

  return items.filter((item) => {
    if (!matchesInboxSearch(item, filters.searchQuery)) return false;
    if (priorityIds.length > 0 && !priorityIds.includes(String(item.priorityId ?? "").trim())) return false;
    if (labelIds.length > 0) {
      const itemLabelIds = resolveItemLabelIds(item);
      if (!labelIds.some((id) => itemLabelIds.includes(id))) return false;
    }
    if (flowKeys.length > 0 && !flowKeys.includes(resolveInboxFlowKey(item))) return false;
    return true;
  });
}

export function hasActiveInboxListFilters(filters: LiveInboxListFilters): boolean {
  return (
    String(filters.searchQuery ?? "").trim().length > 0 ||
    filters.priorityIds.length > 0 ||
    filters.labelIds.length > 0 ||
    filters.flowKeys.length > 0
  );
}

export function filterInboxContacts(
  items: QueueListItem[],
  tab: LiveInboxTab,
  currentAgentId: string,
): QueueListItem[] {
  const agentKey = currentAgentId.trim().toLowerCase();

  if (tab === "today") {
    return sortInboxByPinnedAndSchedule(items.filter((item) => isScheduledForToday(item.scheduledAt)));
  }
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
    today: filterInboxContacts(items, "today", currentAgentId).length,
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
  return "";
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
