export type LeadCpfContext = Record<string, string | number | boolean> | undefined;

export const LEAD_CPF_CONTEXT_KEY = "CPF";

const PLACEHOLDER_LEAD_CONTEXT_VALUES = new Set(["-", "—", "null", "undefined", "n/a", "na"]);
const CPF_CONTEXT_KEYS = ["cpf", "documento", "doc", "identificacao", "document"];

const normalizeLeadContextKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const hasLeadContextValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  const normalized = String(value).trim();
  if (!normalized) return false;
  return !PLACEHOLDER_LEAD_CONTEXT_VALUES.has(normalized.toLowerCase());
};

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

export const resolveLeadCpf = (leadContext?: LeadCpfContext): string => {
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
  leadContext?: LeadCpfContext,
  fallback = "Não informado",
): string => {
  const resolved = resolveLeadCpf(leadContext);
  if (!resolved) return fallback;
  const masked = formatBrazilianCpf(resolved);
  return masked || fallback;
};

export const formatLeadCpfValue = (value: string, fallback = "Não informado"): string => {
  const resolved = String(value ?? "").trim();
  if (!resolved) return fallback;
  const masked = formatBrazilianCpf(resolved);
  return masked || fallback;
};
