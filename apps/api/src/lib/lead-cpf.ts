import { pruneLeadContext } from "./lead-context";

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

const hasLeadContextValue = (value: unknown): boolean => {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0;
};

export const resolveLeadCpf = (leadContext?: Record<string, string | number | boolean>): string => {
  if (!leadContext) return "";

  const canonical = String(leadContext[LEAD_CPF_CONTEXT_KEY] ?? "").trim();
  if (hasLeadContextValue(canonical)) return canonical;

  for (const [key, value] of Object.entries(leadContext)) {
    if (normalizeLeadContextKey(key) === normalizeLeadContextKey(LEAD_CPF_CONTEXT_KEY)) continue;
    if (!isLeadCpfContextKey(key)) continue;
    const resolved = String(value ?? "").trim();
    if (hasLeadContextValue(resolved)) return resolved;
  }

  return "";
};

export const mergeLeadCpfIntoContext = (
  leadContext: Record<string, string | number | boolean> | undefined,
  leadCpf: string,
): Record<string, string | number | boolean> | undefined => {
  const next: Record<string, string | number | boolean> = { ...(leadContext ?? {}) };

  for (const key of Object.keys(next)) {
    if (isLeadCpfContextKey(key)) delete next[key];
  }

  const trimmed = String(leadCpf ?? "").trim();
  if (trimmed) next[LEAD_CPF_CONTEXT_KEY] = trimmed;

  return pruneLeadContext(next);
};
