export type LeadAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  content: string;
  createdAt: string;
};

export type LeadAgentNote = {
  id: string;
  text: string;
  createdAt: string;
  authorName?: string;
  authorId?: string;
};

export type LeadContactDetail = {
  contactId: string;
  tenantId: string;
  contactName: string;
  sourceFlowLabel: string;
  leadContext?: Record<string, string | number | boolean>;
  leadWhatsapp?: string;
  agentNotesHistory?: LeadAgentNote[];
  attachments?: LeadAttachment[];
  assignedAgentId?: string;
  assignedAgentName?: string;
  status?: string;
  updatedAt?: string;
};

const PLACEHOLDER_LEAD_CONTEXT_VALUES = new Set(["-", "—", "null", "undefined", "n/a", "na"]);
const WHATSAPP_CONTEXT_KEYS = ["WhatsApp", "Whatsapp", "whatsapp", "telefone", "celular", "phone", "fone"];

export const hasLeadContextValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  const normalized = String(value).trim();
  if (!normalized) return false;
  return !PLACEHOLDER_LEAD_CONTEXT_VALUES.has(normalized.toLowerCase());
};

export const getLeadContextEntries = (context?: Record<string, string | number | boolean> | null) =>
  Object.entries(context ?? {}).filter(([key, value]) => String(key).trim() && hasLeadContextValue(value));

export const resolveLeadWhatsapp = (
  leadWhatsapp: string | undefined,
  leadContext?: Record<string, string | number | boolean>,
): string => {
  const direct = String(leadWhatsapp ?? "").trim();
  if (direct) return direct;
  if (!leadContext) return "";

  for (const key of WHATSAPP_CONTEXT_KEYS) {
    const value = String(leadContext[key] ?? "").trim();
    if (value) return value;
  }

  for (const [key, value] of Object.entries(leadContext)) {
    const normalized = key.trim().toLowerCase();
    if (!WHATSAPP_CONTEXT_KEYS.includes(normalized)) continue;
    const resolved = String(value ?? "").trim();
    if (resolved) return resolved;
  }

  return "";
};

export const getLeadInitials = (label: string): string =>
  String(label ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "L";
