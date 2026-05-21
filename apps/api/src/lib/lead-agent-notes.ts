import { randomUUID } from "node:crypto";
import type { LeadAgentNote, QueueContact } from "../queue/queue.repository";
import { resolveLeadContactName } from "./lead-contact-name";
import { pruneLeadContext } from "./lead-context";

const sortNotesNewestFirst = (notes: LeadAgentNote[]): LeadAgentNote[] =>
  [...notes].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

export const resolveLeadAgentNotes = (contact: QueueContact): LeadAgentNote[] => {
  const history = Array.isArray(contact.agentNotesHistory)
    ? contact.agentNotesHistory
        .map((note) => ({
          id: String(note.id ?? "").trim() || randomUUID(),
          text: String(note.text ?? "").trim(),
          createdAt: String(note.createdAt ?? "").trim() || new Date().toISOString(),
          authorName: String(note.authorName ?? "").trim() || undefined,
          authorId: String(note.authorId ?? "").trim() || undefined,
        }))
        .filter((note) => note.text)
    : [];

  const legacy = String(contact.agentNotes ?? "").trim();
  if (legacy && history.length === 0) {
    history.push({
      id: randomUUID(),
      text: legacy,
      createdAt: String(contact.updatedAt ?? "").trim() || new Date().toISOString(),
      authorName: undefined,
      authorId: undefined,
    });
  }

  return sortNotesNewestFirst(history);
};

export const withResolvedLeadAgentNotes = (contact: QueueContact): QueueContact => ({
  ...contact,
  agentNotesHistory: resolveLeadAgentNotes(contact),
});

const normalizeQueueLabels = (contact: QueueContact): QueueContact => {
  const labelIds = Array.isArray(contact.labelIds)
    ? contact.labelIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const labels = Array.isArray(contact.labels)
    ? contact.labels
        .map((row) => ({
          id: String(row.id ?? "").trim(),
          name: String(row.name ?? "").trim(),
          color: String(row.color ?? "#64748b").trim() || "#64748b",
        }))
        .filter((row) => row.id && row.name)
    : [];
  if (labelIds.length === 0 && contact.labelId) {
    const legacyId = String(contact.labelId).trim();
    if (legacyId) {
      labelIds.push(legacyId);
      if (labels.length === 0 && contact.labelName) {
        labels.push({
          id: legacyId,
          name: String(contact.labelName).trim(),
          color: String(contact.labelColor ?? "#64748b").trim() || "#64748b",
        });
      }
    }
  }
  const first = labels[0];
  return {
    ...contact,
    labelIds: labelIds.length > 0 ? labelIds : undefined,
    labels: labels.length > 0 ? labels : undefined,
    labelId: first?.id ?? contact.labelId,
    labelName: first?.name ?? contact.labelName,
    labelColor: first?.color ?? contact.labelColor,
    isPinned: contact.isPinned === true,
  };
};

export const withNormalizedQueueContact = (contact: QueueContact): QueueContact => {
  const leadContext = pruneLeadContext(contact.leadContext);
  return normalizeQueueLabels({
    ...withResolvedLeadAgentNotes(contact),
    leadContext,
    contactName: resolveLeadContactName(contact.contactName, leadContext),
  });
};
