import { pruneLeadContext } from "./lead-context";

export const LEAD_CONTACT_NAME_CONTEXT_KEY = "nome_contato";
export const LEAD_CONTACT_NAME_OVERRIDE_KEY = "contactNameOverride";

const PLACEHOLDER_CONTACT_NAMES = new Set(["-", "lead", "visitante", "lead typebot"]);

const normalizeContactNameKey = (key: string): string =>
  key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isNomeContatoKey = (key: string): boolean => {
  const normalizedKey = normalizeContactNameKey(key).replace(/[_\s]/g, "");
  return normalizedKey === "nomecontato" || normalizedKey === "contactnameoverride";
};

const isContactNameOverrideKey = (key: string): boolean =>
  normalizeContactNameKey(key) === normalizeContactNameKey(LEAD_CONTACT_NAME_OVERRIDE_KEY);

const isNomeCompletoKey = (key: string): boolean => {
  const normalizedKey = normalizeContactNameKey(key).replace(/[_\s]/g, "");
  return normalizedKey === "nomecompleto" || normalizedKey === "nomecompeto";
};

export const isMeaningfulLeadContactName = (value: unknown): boolean => {
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

/** Persiste o nome editado no leadContext para não ser sobrescrito por nome_completo do Typebot. */
export const mergeLeadContactNameIntoContext = (
  leadContext: Record<string, string | number | boolean> | undefined,
  contactName: string,
): Record<string, string | number | boolean> | undefined => {
  const trimmed = String(contactName ?? "").trim();
  if (trimmed.length < 2) return pruneLeadContext(leadContext);

  const next: Record<string, string | number | boolean> = { ...(leadContext ?? {}) };
  next[LEAD_CONTACT_NAME_OVERRIDE_KEY] = trimmed;
  next[LEAD_CONTACT_NAME_CONTEXT_KEY] = trimmed;

  for (const key of Object.keys(next)) {
    if (isNomeCompletoKey(key) || isNomeContatoKey(key)) next[key] = trimmed;
  }

  return pruneLeadContext(next);
};
