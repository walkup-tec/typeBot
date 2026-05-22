import { randomUUID } from "node:crypto";
import type { LeadAgentNote, QueueContact } from "../queue/queue.repository";
import { labelRepository, priorityRepository } from "./repositories";
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

const normalizeQueuePriority = (
  contact: QueueContact,
): Pick<QueueContact, "priorityId" | "priorityName"> => {
  const priorityId = String(contact.priorityId ?? "").trim();
  if (!priorityId) {
    return { priorityId: undefined, priorityName: undefined };
  }
  const current = priorityRepository.findById(contact.tenantId, priorityId);
  if (current) {
    return { priorityId, priorityName: current.name };
  }
  const fallback = String(contact.priorityName ?? "").trim();
  return { priorityId, priorityName: fallback || undefined };
};

const normalizeQueueLabels = (contact: QueueContact): QueueContact => {
  const storedById = new Map(
    (Array.isArray(contact.labels) ? contact.labels : [])
      .map((row) => {
        const id = String(row.id ?? "").trim();
        if (!id) return null;
        return [
          id,
          {
            id,
            name: String(row.name ?? "").trim(),
            color: String(row.color ?? "#64748b").trim() || "#64748b",
          },
        ] as const;
      })
      .filter((entry): entry is [string, { id: string; name: string; color: string }] => Boolean(entry)),
  );

  const labelIds = Array.isArray(contact.labelIds)
    ? contact.labelIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (labelIds.length === 0 && contact.labelId) {
    const legacyId = String(contact.labelId).trim();
    if (legacyId) labelIds.push(legacyId);
  }

  const labels = labelIds
    .map((id) => {
      const fromCatalog = labelRepository.findById(contact.tenantId, id);
      if (fromCatalog) {
        return { id: fromCatalog.id, name: fromCatalog.name, color: fromCatalog.color };
      }
      const fallback = storedById.get(id);
      if (fallback?.name) return fallback;
      if (id === String(contact.labelId ?? "").trim() && contact.labelName) {
        return {
          id,
          name: String(contact.labelName).trim(),
          color: String(contact.labelColor ?? "#64748b").trim() || "#64748b",
        };
      }
      return null;
    })
    .filter((row): row is { id: string; name: string; color: string } => Boolean(row));

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
  const withPriority = normalizeQueuePriority(contact);
  return normalizeQueueLabels({
    ...withResolvedLeadAgentNotes(contact),
    ...withPriority,
    leadContext,
    contactName: resolveLeadContactName(contact.contactName, leadContext),
  });
};
