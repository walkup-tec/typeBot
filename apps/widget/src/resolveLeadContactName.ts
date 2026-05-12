const PLACEHOLDER_CONTACT_NAMES = new Set(["-", "lead", "visitante", "lead typebot"]);

const normalizeContactNameKey = (key: string): string =>
  key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isNomeContatoKey = (key: string): boolean => normalizeContactNameKey(key) === "nome_contato";

const isNomeCompletoKey = (key: string): boolean => {
  const normalizedKey = normalizeContactNameKey(key);
  return normalizedKey === "nome_completo" || normalizedKey === "nome_competo" || normalizedKey === "nome completo";
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
  const fromNomeContato = pickContactNameFromSources(sources, isNomeContatoKey);
  if (fromNomeContato) return fromNomeContato;

  const fromNomeCompleto = pickContactNameFromSources(sources, isNomeCompletoKey);
  if (fromNomeCompleto) return fromNomeCompleto;

  const direct = String(contactName ?? "").trim();
  if (isMeaningfulLeadContactName(direct)) return direct;

  const fallback = pickFallbackContactName(sources);
  if (fallback) return fallback;

  return direct || "Lead";
};
