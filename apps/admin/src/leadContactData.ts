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
export const LEAD_CPF_CONTEXT_KEY = "CPF";
const CPF_CONTEXT_KEYS = ["cpf", "documento", "doc", "identificacao", "document"];

const normalizeLeadContextKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const isLeadCpfContextKey = (key: string): boolean => {
  const normalizedKey = normalizeLeadContextKey(key);
  return CPF_CONTEXT_KEYS.some((candidate) => normalizedKey.includes(candidate));
};

export const normalizeCpfDigits = (value: string): string => value.replace(/\D/g, "").slice(0, 11);

export const formatBrazilianCpf = (value: string): string => {
  const digits = normalizeCpfDigits(value);
  if (!digits) return "";

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

export const resolveLeadCpf = (leadContext?: Record<string, string | number | boolean>): string => {
  if (!leadContext) return "";

  const canonical = String(leadContext[LEAD_CPF_CONTEXT_KEY] ?? "").trim();
  if (hasLeadContextValue(canonical)) return canonical;

  for (const [key, value] of Object.entries(leadContext)) {
    if (key === LEAD_CPF_CONTEXT_KEY) continue;
    if (!isLeadCpfContextKey(key)) continue;
    const resolved = String(value ?? "").trim();
    if (hasLeadContextValue(resolved)) return resolved;
  }

  return "";
};

export const formatLeadCpfDisplay = (
  leadContext?: Record<string, string | number | boolean>,
  fallback = "Não informado",
): string => {
  const resolved = resolveLeadCpf(leadContext);
  if (!resolved) return fallback;
  const masked = formatBrazilianCpf(resolved);
  return masked || fallback;
};

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

const PLACEHOLDER_CONTACT_NAMES = new Set(["-", "lead", "visitante", "lead typebot"]);

export const LEAD_CONTACT_NAME_OVERRIDE_KEY = "contactNameOverride";
export const LEAD_CONTACT_NAME_CONTEXT_KEY = "nome_contato";

const compactLeadContextKey = (key: string): string => normalizeLeadContextKey(key).replace(/[_\s]/g, "");

const isContactNameOverrideKey = (key: string): boolean =>
  normalizeLeadContextKey(key) === normalizeLeadContextKey(LEAD_CONTACT_NAME_OVERRIDE_KEY);

const isNomeContatoKey = (key: string): boolean => {
  const compact = compactLeadContextKey(key);
  return compact === "nomecontato" || compact === "contactnameoverride";
};

const isNomeCompletoKey = (key: string): boolean => {
  const compact = compactLeadContextKey(key);
  return compact === "nomecompleto" || compact === "nomecompeto";
};

const isMeaningfulLeadContactName = (value: unknown): boolean => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return false;
  return !PLACEHOLDER_CONTACT_NAMES.has(normalized.toLowerCase());
};

const pickContactNameFromSource = (
  source: Record<string, unknown> | undefined,
  matchesKey: (key: string) => boolean,
): string => {
  if (!source) return "";

  for (const [key, value] of Object.entries(source)) {
    if (!matchesKey(key)) continue;
    const resolved = String(value ?? "").trim();
    if (isMeaningfulLeadContactName(resolved)) return resolved;
  }

  return "";
};

const pickContactNameFromSources = (
  sources: Array<Record<string, unknown> | undefined>,
  matchesKey: (key: string) => boolean,
): string => {
  for (const source of sources) {
    const resolved = pickContactNameFromSource(source, matchesKey);
    if (resolved) return resolved;
  }
  return "";
};

const pickFallbackContactName = (sources: Array<Record<string, unknown> | undefined>): string => {
  const fallbackKeys = ["contactName", "Nome", "nome", "name"];

  for (const source of sources) {
    if (!source) continue;
    for (const key of fallbackKeys) {
      const resolved = String(source[key] ?? "").trim();
      if (isMeaningfulLeadContactName(resolved)) return resolved;
    }
  }

  return "";
};

export const resolveLeadContactName = (
  contactName?: string,
  leadContext?: Record<string, string | number | boolean>,
  extraSources: Array<Record<string, unknown> | undefined> = [],
): string => {
  const sources = [...extraSources, leadContext];
  const fromOverride = pickContactNameFromSources(sources, isContactNameOverrideKey);
  if (fromOverride) return fromOverride;

  const fromNomeContato = pickContactNameFromSources(sources, isNomeContatoKey);
  if (fromNomeContato) return fromNomeContato;

  const direct = String(contactName ?? "").trim();
  if (isMeaningfulLeadContactName(direct)) return direct;

  const fromNomeCompleto = pickContactNameFromSources(sources, isNomeCompletoKey);
  if (fromNomeCompleto) return fromNomeCompleto;

  const fallback = pickFallbackContactName(sources);
  if (fallback) return fallback;

  return direct || "Lead";
};
