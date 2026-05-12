import { randomUUID } from "node:crypto";
import type { LeadAgentNote, QueueContact } from "../queue/queue.repository";

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
