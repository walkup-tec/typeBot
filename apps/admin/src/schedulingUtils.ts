import { resolveLeadWhatsapp } from "./leadContactData";
import { formatInboxScheduleTime } from "./liveInboxUtils";

export type SchedulingViewTab = "priorities" | "labels" | "all";

export type SchedulingDatePreset = "week" | "15days" | "30days" | "custom";

export type ScheduledLeadItem = {
  contactId: string;
  tenantId: string;
  contactName: string;
  sourceFlowLabel: string;
  sourceFlowDisplayName?: string;
  status: "waiting" | "in_service" | "closed";
  assignedAgentName?: string;
  priorityId?: string;
  priorityName?: string;
  labelId?: string;
  labelIds?: string[];
  labels?: Array<{ id: string; name: string; color: string }>;
  labelName?: string;
  labelColor?: string;
  scheduledAt: string;
  updatedAt: string;
  leadWhatsapp?: string;
  leadContext?: Record<string, string | number | boolean>;
};

export const normalizeWhatsappPhoneDigits = (value: string): string => {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  return digits.length >= 10 ? digits : "";
};

export const formatWhatsappDisplay = (value: string): string => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 13);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
};

export const resolveScheduledLeadWhatsapp = (item: ScheduledLeadItem): string =>
  resolveLeadWhatsapp(item.leadWhatsapp, item.leadContext);

export const buildWhatsappWebUrl = (phoneDigits: string, contactName?: string): string => {
  const greeting = `Olá${contactName?.trim() ? ` ${contactName.trim()}` : ""}!`;
  return `https://web.whatsapp.com/send?phone=${encodeURIComponent(phoneDigits)}&text=${encodeURIComponent(greeting)}`;
};

export type SchedulingDateRange = {
  startKey: string;
  endKey: string;
};

const BRAZIL_TIMEZONE = "America/Sao_Paulo";

export const toBrazilDateKey = (value: Date | string): string => {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { timeZone: BRAZIL_TIMEZONE });
};

const addDaysToDateKey = (dateKey: string, days: number): string => {
  const base = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(base.getTime())) return dateKey;
  base.setDate(base.getDate() + days);
  return toBrazilDateKey(base);
};

export const getBrazilTodayKey = (): string => toBrazilDateKey(new Date());

export const resolveSchedulingDateRange = (
  preset: SchedulingDatePreset,
  customStart: string,
  customEnd: string,
): SchedulingDateRange => {
  const todayKey = getBrazilTodayKey();
  if (preset === "week") {
    return { startKey: todayKey, endKey: addDaysToDateKey(todayKey, 7) };
  }
  if (preset === "15days") {
    return { startKey: todayKey, endKey: addDaysToDateKey(todayKey, 15) };
  }
  if (preset === "30days") {
    return { startKey: todayKey, endKey: addDaysToDateKey(todayKey, 30) };
  }
  const startKey = String(customStart || "").trim() || todayKey;
  const endKey = String(customEnd || "").trim() || addDaysToDateKey(todayKey, 30);
  if (startKey <= endKey) return { startKey, endKey };
  return { startKey: endKey, endKey: startKey };
};

export const hasScheduledAt = (item: { scheduledAt?: string }): boolean => {
  const raw = String(item.scheduledAt ?? "").trim();
  if (!raw) return false;
  return !Number.isNaN(new Date(raw).getTime());
};

export const isScheduledInRange = (scheduledAt: string, range: SchedulingDateRange): boolean => {
  const scheduleKey = toBrazilDateKey(scheduledAt);
  if (!scheduleKey) return false;
  return scheduleKey >= range.startKey && scheduleKey <= range.endKey;
};

export const formatSchedulingDateTime = (scheduledAt: string): string => {
  const raw = String(scheduledAt ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "-";
  const dateLabel = date.toLocaleDateString("pt-BR", {
    timeZone: BRAZIL_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeLabel = formatInboxScheduleTime(raw);
  return timeLabel ? `${dateLabel} às ${timeLabel}` : dateLabel;
};

const resolveItemLabelIds = (item: ScheduledLeadItem): string[] => {
  if (Array.isArray(item.labelIds) && item.labelIds.length > 0) {
    return item.labelIds.map((id) => String(id).trim()).filter(Boolean);
  }
  if (item.labelId) return [String(item.labelId).trim()].filter(Boolean);
  return [];
};

const matchesSelectedLabels = (item: ScheduledLeadItem, selectedLabelIds: string[]): boolean => {
  if (selectedLabelIds.length === 0) return false;
  const itemLabelIds = resolveItemLabelIds(item);
  return selectedLabelIds.some((id) => itemLabelIds.includes(id));
};

const sortByScheduleAsc = (left: ScheduledLeadItem, right: ScheduledLeadItem): number =>
  new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime();

export const filterScheduledLeads = (
  items: ScheduledLeadItem[],
  range: SchedulingDateRange,
): ScheduledLeadItem[] =>
  items.filter((item) => hasScheduledAt(item) && isScheduledInRange(item.scheduledAt, range));

export const sortScheduledLeads = (
  items: ScheduledLeadItem[],
  tab: SchedulingViewTab,
  options: { priorityId?: string; labelIds?: string[] },
): ScheduledLeadItem[] => {
  const sorted = [...items].sort(sortByScheduleAsc);
  if (tab === "all") return sorted;

  if (tab === "priorities") {
    const priorityId = String(options.priorityId ?? "").trim();
    if (!priorityId) return sorted;
    const preferred: ScheduledLeadItem[] = [];
    const others: ScheduledLeadItem[] = [];
    for (const item of sorted) {
      if (String(item.priorityId ?? "").trim() === priorityId) preferred.push(item);
      else others.push(item);
    }
    return [...preferred, ...others];
  }

  const labelIds = (options.labelIds ?? []).map((id) => String(id).trim()).filter(Boolean);
  if (labelIds.length === 0) return sorted;
  const preferred: ScheduledLeadItem[] = [];
  const others: ScheduledLeadItem[] = [];
  for (const item of sorted) {
    if (matchesSelectedLabels(item, labelIds)) preferred.push(item);
    else others.push(item);
  }
  return [...preferred, ...others];
};
