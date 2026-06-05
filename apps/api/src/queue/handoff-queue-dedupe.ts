import { isMeaningfulLeadContactName } from "../lib/lead-contact-name";
import { pruneLeadContext } from "../lib/lead-context";
import type { QueueContact } from "./queue.repository";

const HANDOFF_DEDUPE_WINDOW_MS = 20 * 60 * 1000;

const normalizeText = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();

const normalizeFlowLabelKey = (value: string | undefined): string =>
  normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();

const normalizeWhatsappKey = (value: string | undefined): string =>
  normalizeText(value).replace(/\D/g, "");

const leadContextRichness = (context?: Record<string, string | number | boolean>): number => {
  if (!context) return 0;
  return Object.keys(context).filter((key) => normalizeText(key) !== "resultid").length;
};

const mergeLeadContext = (
  ...layers: Array<Record<string, string | number | boolean> | undefined>
): Record<string, string | number | boolean> => {
  const merged = layers.reduce<Record<string, string | number | boolean>>(
    (acc, layer) => ({ ...acc, ...(layer ?? {}) }),
    {},
  );
  return pruneLeadContext(merged) ?? {};
};

export type HandoffQueueDedupeInput = {
  contactName: string;
  sourceFlowLabel: string;
  leadContext?: Record<string, string | number | boolean>;
  leadWhatsapp?: string;
  resultId?: string;
  isThinRequest: boolean;
};

const contactFlowKey = (contact: QueueContact): string => normalizeFlowLabelKey(contact.sourceFlowLabel);

const contactScore = (contact: QueueContact): number => {
  let score = 0;
  if (isMeaningfulLeadContactName(contact.contactName)) score += 20;
  score += leadContextRichness(contact.leadContext);
  if (contact.leadWhatsapp?.trim()) score += 5;
  if (contact.status === "in_service") score += 3;
  if (contact.status === "waiting") score += 2;
  return score;
};

const isRecentHandoffContact = (contact: QueueContact, nowMs: number): boolean => {
  if (contact.status === "closed") return false;
  const updatedAt = new Date(contact.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) return true;
  return nowMs - updatedAt <= HANDOFF_DEDUPE_WINDOW_MS;
};

/** Evita segundo atendimento "Lead" quando o POST já enfileirou o lead com variáveis do fluxo. */
export const findHandoffQueueDuplicate = (
  contacts: QueueContact[],
  input: HandoffQueueDedupeInput,
  nowMs = Date.now(),
): QueueContact | null => {
  const active = contacts.filter((contact) => isRecentHandoffContact(contact, nowMs));
  if (active.length === 0) return null;

  const resultId = String(input.resultId ?? input.leadContext?.resultId ?? "").trim();
  if (resultId) {
    const byResult = active.find((contact) => String(contact.leadContext?.resultId ?? "").trim() === resultId);
    if (byResult) return byResult;
  }

  const flowKey = normalizeFlowLabelKey(input.sourceFlowLabel);
  const sameFlow = flowKey ? active.filter((contact) => contactFlowKey(contact) === flowKey) : active;
  if (sameFlow.length === 0) return null;

  const whatsappKey = normalizeWhatsappKey(input.leadWhatsapp);
  if (whatsappKey.length >= 8) {
    const byWhatsapp = sameFlow.find((contact) => normalizeWhatsappKey(contact.leadWhatsapp) === whatsappKey);
    if (byWhatsapp) return byWhatsapp;
  }

  const incomingName = String(input.contactName ?? "").trim();
  if (isMeaningfulLeadContactName(incomingName)) {
    const byName = sameFlow.find(
      (contact) => normalizeText(contact.contactName) === normalizeText(incomingName),
    );
    if (byName) return byName;
  }

  if (input.isThinRequest || !isMeaningfulLeadContactName(incomingName)) {
    const richContacts = sameFlow.filter(
      (contact) =>
        isMeaningfulLeadContactName(contact.contactName) || leadContextRichness(contact.leadContext) >= 2,
    );
    if (richContacts.length > 0) {
      return [...richContacts].sort((left, right) => contactScore(right) - contactScore(left))[0] ?? null;
    }
  }

  if (leadContextRichness(input.leadContext) >= 2 || isMeaningfulLeadContactName(incomingName)) {
    return [...sameFlow].sort((left, right) => contactScore(right) - contactScore(left))[0] ?? null;
  }

  return null;
};

export const listPlaceholderHandoffDuplicates = (
  contacts: QueueContact[],
  keeperContactId: string,
  sourceFlowLabel: string,
): string[] => {
  const flowKey = normalizeFlowLabelKey(sourceFlowLabel);
  if (!flowKey) return [];

  return contacts
    .filter((contact) => contact.contactId !== keeperContactId)
    .filter((contact) => contact.status !== "closed")
    .filter((contact) => contactFlowKey(contact) === flowKey)
    .filter((contact) => !isMeaningfulLeadContactName(contact.contactName))
    .map((contact) => contact.contactId);
};

export const mergeHandoffIntoExistingContact = (
  existing: QueueContact,
  input: HandoffQueueDedupeInput,
): {
  contactName: string;
  leadContext: Record<string, string | number | boolean>;
  leadWhatsapp?: string;
} => {
  const mergedContext = mergeLeadContext(existing.leadContext, input.leadContext);
  const mergedName = isMeaningfulLeadContactName(input.contactName)
    ? input.contactName
    : existing.contactName;
  const mergedWhatsapp = String(input.leadWhatsapp ?? "").trim() || existing.leadWhatsapp;
  return {
    contactName: mergedName,
    leadContext: mergedContext,
    ...(mergedWhatsapp ? { leadWhatsapp: mergedWhatsapp } : {}),
  };
};

export const isThinHandoffRequest = (
  method: string,
  leadContext: Record<string, string | number | boolean>,
  contactName: string,
): boolean => {
  if (method !== "GET") return false;
  const thinContext = leadContextRichness(leadContext) < 2;
  const thinName = !isMeaningfulLeadContactName(contactName);
  return thinContext && thinName;
};
