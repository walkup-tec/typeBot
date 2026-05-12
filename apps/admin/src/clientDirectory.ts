import {
  formatBrazilianCpf,
  getLeadContextEntries,
  isLeadCpfContextKey,
  resolveLeadContactName,
  resolveLeadCpf,
  resolveLeadWhatsapp,
} from "./leadContactData";

export type ClientDirectoryContact = {
  contactId: string;
  tenantId: string;
  contactName: string;
  sourceFlowLabel: string;
  leadContext?: Record<string, string | number | boolean>;
  leadWhatsapp?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  updatedAt: string;
};

export type ClientDirectoryRow = {
  contactId: string;
  contactName: string;
  whatsapp: string;
  cpf: string;
  sourceFlowLabel: string;
  assignedAgentName: string;
  updatedAt: string;
  fieldValues: Record<string, string>;
};

export type ClientWhatsappFilter = "all" | "with" | "without";

const WHATSAPP_CONTEXT_KEYS = new Set([
  "whatsapp",
  "whats app",
  "telefone",
  "celular",
  "phone",
  "fone",
]);
const RESERVED_CONTEXT_KEYS = new Set([...WHATSAPP_CONTEXT_KEYS, "nome", "name", "nome_contato", "nome completo", "nome_completo"]);

export const normalizeSearchDigits = (value: string): string => value.replace(/\D/g, "");

const normalizeKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isReservedContextKey = (key: string): boolean => {
  const normalizedKey = normalizeKey(key);
  if (RESERVED_CONTEXT_KEYS.has(normalizedKey)) return true;
  return isLeadCpfContextKey(key);
};

const normalizeComparableValue = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const pickLeadContextValue = (
  leadContext: ClientDirectoryContact["leadContext"],
  matchesKey: (key: string) => boolean,
): string => {
  for (const [key, value] of getLeadContextEntries(leadContext)) {
    if (!matchesKey(key)) continue;
    return String(value).trim();
  }
  return "";
};

const shouldSkipDuplicateContactNameField = (
  key: string,
  value: string,
  contactName: string,
  nomeValue: string,
): boolean => {
  const normalizedKey = normalizeKey(key);
  const normalizedValue = normalizeComparableValue(value);
  if (!normalizedValue) return false;

  const normalizedContactName = normalizeComparableValue(contactName);
  if (normalizedKey === "nome_contato") {
    if (normalizedValue === normalizedContactName) return true;
    if (nomeValue && normalizedValue === normalizeComparableValue(nomeValue)) return true;
  }

  if ((normalizedKey === "nome" || normalizedKey === "name") && normalizedValue === normalizedContactName) {
    return true;
  }

  return false;
};

export const buildClientDirectoryRow = (contact: ClientDirectoryContact): ClientDirectoryRow => {
  const contactName = resolveLeadContactName(contact.contactName, contact.leadContext);
  const whatsapp = resolveLeadWhatsapp(contact.leadWhatsapp, contact.leadContext);
  const rawCpf = resolveLeadCpf(contact.leadContext);
  const cpf = rawCpf ? formatBrazilianCpf(rawCpf) || rawCpf : "";
  const nomeValue = pickLeadContextValue(contact.leadContext, (key) => normalizeKey(key) === "nome");
  const fieldValues: Record<string, string> = {};

  for (const [key, value] of getLeadContextEntries(contact.leadContext)) {
    if (isReservedContextKey(key)) continue;
    const text = String(value).trim();
    if (shouldSkipDuplicateContactNameField(key, text, contactName, nomeValue)) continue;
    fieldValues[key] = text;
  }

  const assignedAgentName =
    String(contact.assignedAgentName ?? "").trim() || String(contact.assignedAgentId ?? "").trim();

  return {
    contactId: contact.contactId,
    contactName,
    whatsapp,
    cpf,
    sourceFlowLabel: String(contact.sourceFlowLabel ?? "").trim() || "Fluxo sem identificação",
    assignedAgentName,
    updatedAt: contact.updatedAt,
    fieldValues,
  };
};

export const collectClientDirectoryColumnKeys = (rows: ClientDirectoryRow[]): string[] => {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.fieldValues)) {
      keys.add(key);
    }
  }
  return [...keys].sort((left, right) => left.localeCompare(right, "pt-BR", { sensitivity: "base" }));
};

export const matchesClientDirectorySearch = (row: ClientDirectoryRow, query: string): boolean => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return true;

  const loweredQuery = normalizedQuery.toLowerCase();
  const queryDigits = normalizeSearchDigits(normalizedQuery);

  if (row.contactName.toLowerCase().includes(loweredQuery)) return true;

  if (row.whatsapp) {
    if (row.whatsapp.toLowerCase().includes(loweredQuery)) return true;
    if (queryDigits && normalizeSearchDigits(row.whatsapp).includes(queryDigits)) return true;
  }

  if (row.cpf) {
    if (row.cpf.toLowerCase().includes(loweredQuery)) return true;
    if (queryDigits && normalizeSearchDigits(row.cpf).includes(queryDigits)) return true;
  }

  for (const value of Object.values(row.fieldValues)) {
    if (value.toLowerCase().includes(loweredQuery)) return true;
    if (queryDigits && normalizeSearchDigits(value).includes(queryDigits)) return true;
  }

  return false;
};

export const matchesClientWhatsappFilter = (row: ClientDirectoryRow, filter: ClientWhatsappFilter): boolean => {
  if (filter === "all") return true;
  const hasWhatsapp = Boolean(row.whatsapp.trim());
  return filter === "with" ? hasWhatsapp : !hasWhatsapp;
};

export const matchesClientFlowFilter = (row: ClientDirectoryRow, flowFilter: string): boolean => {
  const normalizedFilter = flowFilter.trim();
  if (!normalizedFilter || normalizedFilter === "all") return true;
  return row.sourceFlowLabel === normalizedFilter;
};
