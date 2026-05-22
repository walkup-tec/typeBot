import { randomUUID } from "node:crypto";
import { z } from "zod";
import { resolveLeadAgentNotes, withNormalizedQueueContact } from "../lib/lead-agent-notes";
import { resolveAttendantDisplayName } from "../lib/agent-session-meta";
import { LEAD_ATTACHMENT_DOCUMENT_MAX_CONTENT_LENGTH } from "../lib/lead-attachment-limits";
import { normalizeScheduledAtStorage } from "../lib/scheduled-at";
import { mergeLeadContactNameIntoContext } from "../lib/lead-contact-name";
import { mergeLeadCpfIntoContext } from "../lib/lead-cpf";
import { pruneLeadContext } from "../lib/lead-context";
import { resolveKanbanColumnAssignment } from "../lib/kanban-column-options";
import { kanbanRepository, labelRepository, priorityRepository } from "../lib/repositories";
import { QueueRepository } from "./queue.repository";
import type { QueueDistributionMode } from "../tenants/tenant.repository";

export const enqueueSchema = z.object({
  contactName: z.string().min(2).max(120),
  source: z.enum(["typebot", "widget"]).default("widget"),
  sourceFlowLabel: z.string().min(2).max(150).default("Fluxo sem identificação"),
  leadContext: z.record(z.string().min(1).max(80), z.union([z.string(), z.number(), z.boolean()])).optional(),
  leadWhatsapp: z.string().max(24).optional(),
});

export const assignSchema = z.object({
  agentId: z.string().min(2).max(80),
  agentName: z.string().min(2).max(120).optional(),
});

export const sendLiveMessageSchema = z.object({
  sender: z.enum(["agent", "visitor"]),
  content: z.string().min(1).max(300000),
});

const optionalUuidOrClear = z.union([z.string().uuid(), z.literal(""), z.null()]).optional();

export const updateQueueContactSchema = z.object({
  contactName: z.string().min(2).max(120).optional(),
  leadWhatsapp: z.string().max(24).optional(),
  leadCpf: z.string().max(20).optional(),
  priorityId: optionalUuidOrClear,
  labelId: optionalUuidOrClear,
  labelIds: z.array(z.string().uuid()).optional(),
  isPinned: z.boolean().optional(),
  scheduledAt: z.union([z.string().min(1).max(40), z.literal(""), z.null()]).optional(),
  kanbanColumnId: z.union([z.string().min(1).max(64), z.literal(""), z.null()]).optional(),
});

export const addAgentNoteSchema = z.object({
  text: z.string().min(1).max(4000),
  authorName: z.string().min(1).max(120).optional(),
  authorId: z.string().min(1).max(80).optional(),
});

export const addLeadAttachmentSchema = z.object({
  fileName: z.string().min(1).max(180),
  mimeType: z.string().min(3).max(120),
  content: z.string().min(1).max(LEAD_ATTACHMENT_DOCUMENT_MAX_CONTENT_LENGTH),
});

export class QueueService {
  private readonly roundRobinCursorByTenant = new Map<string, number>();

  constructor(private readonly queueRepository: QueueRepository) {}

  enqueue(
    tenantId: string,
    input: z.infer<typeof enqueueSchema>,
    options?: {
      distributionMode?: QueueDistributionMode;
      attendants?: Array<{ username: string; displayName: string }>;
    },
  ) {
    const created = this.queueRepository.enqueue({
      contactId: randomUUID(),
      tenantId,
      contactName: input.contactName,
      source: input.source,
      sourceFlowLabel: input.sourceFlowLabel,
      leadContext: pruneLeadContext(input.leadContext),
      leadWhatsapp: input.leadWhatsapp,
      status: "waiting",
      updatedAt: new Date().toISOString(),
    });

    const distributionMode = options?.distributionMode ?? "shared_pool";
    if (distributionMode === "shared_pool") return created;

    const attendants = (options?.attendants ?? []).filter((attendant) => String(attendant.username).trim());
    if (attendants.length === 0) return created;

    let selectedIndex = 0;
    if (distributionMode === "random") {
      selectedIndex = Math.floor(Math.random() * attendants.length);
    } else {
      const previousCursor = this.roundRobinCursorByTenant.get(tenantId) ?? -1;
      selectedIndex = (previousCursor + 1) % attendants.length;
      this.roundRobinCursorByTenant.set(tenantId, selectedIndex);
    }
    const selected = attendants[selectedIndex];
    if (!selected) return created;

    const autoAssigned = this.queueRepository.assign(tenantId, created.contactId, selected.username, selected.displayName);
    return autoAssigned ?? created;
  }

  list(tenantId: string, options?: { includeClosed?: boolean }) {
    return this.queueRepository
      .listByTenant(tenantId, options)
      .map((contact) => withNormalizedQueueContact(contact))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /** Fila ao vivo: inclui atendimentos encerrados para exibir status Finalizado no card. */
  listInbox(tenantId: string) {
    return this.list(tenantId, { includeClosed: true });
  }

  listAll() {
    return this.queueRepository
      .listAll()
      .map((contact) => withNormalizedQueueContact(contact))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  backfillAssignedAgentNames(tenantId: string, resolveName: (agentId: string) => string | undefined) {
    this.queueRepository.hydrateAssignedAgentNames(tenantId, resolveName);
  }

  getContact(tenantId: string, contactId: string) {
    const contact = this.queueRepository.getByTenantAndContactId(tenantId, contactId);
    return contact ? withNormalizedQueueContact(contact) : null;
  }

  getContactById(contactId: string) {
    const contact = this.queueRepository.getByContactId(contactId);
    return contact ? withNormalizedQueueContact(contact) : null;
  }

  completeService(tenantId: string, contactId: string, closedByLabel: string) {
    const completed = this.queueRepository.complete(tenantId, contactId, closedByLabel);
    return completed ? withNormalizedQueueContact(completed) : null;
  }

  assign(tenantId: string, contactId: string, input: z.infer<typeof assignSchema>) {
    const assignedAgentName = resolveAttendantDisplayName(
      { username: input.agentId, displayName: input.agentName },
      { assignedAgentId: input.agentId, assignedAgentName: input.agentName },
    );
    const assigned = this.queueRepository.assign(
      tenantId,
      contactId,
      input.agentId,
      assignedAgentName || input.agentName,
    );
    return assigned ? withNormalizedQueueContact(assigned) : null;
  }

  getMessages(tenantId: string, contactId: string) {
    return this.queueRepository.getMessages(tenantId, contactId);
  }

  sendMessage(tenantId: string, contactId: string, input: z.infer<typeof sendLiveMessageSchema>) {
    const contact = this.queueRepository.getByTenantAndContactId(tenantId, contactId);
    if (!contact || contact.status === "closed") return null;
    const messages = this.queueRepository.getMessages(tenantId, contactId);
    if (!messages) return null;

    return this.queueRepository.addMessage({
      id: randomUUID(),
      contactId,
      sender: input.sender,
      content: input.content,
      createdAt: new Date().toISOString(),
    });
  }

  updateContact(tenantId: string, contactId: string, input: z.infer<typeof updateQueueContactSchema>) {
    const contact = this.queueRepository.getByTenantAndContactId(tenantId, contactId);
    if (!contact) return null;

    const patch: Partial<{
      contactName: string;
      leadWhatsapp: string;
      leadContext: Record<string, string | number | boolean> | undefined;
      priorityId: string;
      priorityName: string;
      labelId: string;
      labelName: string;
      labelColor: string;
      labelIds: string[];
      labels: Array<{ id: string; name: string; color: string }>;
      scheduledAt: string;
      isPinned: boolean;
      kanbanColumnId: string;
      kanbanColumnName: string;
    }> = {};
    let nextLeadContext = contact.leadContext;
    if (input.leadCpf !== undefined) {
      nextLeadContext = mergeLeadCpfIntoContext(nextLeadContext, input.leadCpf);
    }
    if (input.contactName !== undefined) {
      patch.contactName = input.contactName;
      nextLeadContext = mergeLeadContactNameIntoContext(nextLeadContext, input.contactName);
    }
    if (input.leadWhatsapp !== undefined) patch.leadWhatsapp = input.leadWhatsapp;
    if (nextLeadContext !== contact.leadContext) {
      patch.leadContext = nextLeadContext;
    }
    if (input.priorityId !== undefined) {
      const raw = input.priorityId;
      if (raw === null || raw === "") {
        patch.priorityId = undefined;
        patch.priorityName = undefined;
      } else {
        const priority = priorityRepository.findById(tenantId, raw);
        if (!priority) throw new Error("Prioridade inválida para este assinante.");
        patch.priorityId = priority.id;
        patch.priorityName = priority.name;
      }
    }
    if (input.labelIds !== undefined) {
      const ids = [...new Set(input.labelIds.map((id) => String(id).trim()).filter(Boolean))];
      if (ids.length === 0) {
        patch.labelIds = undefined;
        patch.labels = undefined;
        patch.labelId = undefined;
        patch.labelName = undefined;
        patch.labelColor = undefined;
      } else {
        const resolved = ids
          .map((id) => labelRepository.findById(tenantId, id))
          .filter((label): label is NonNullable<typeof label> => Boolean(label));
        if (resolved.length !== ids.length) throw new Error("Etiqueta inválida para este assinante.");
        patch.labelIds = resolved.map((label) => label.id);
        patch.labels = resolved.map((label) => ({ id: label.id, name: label.name, color: label.color }));
        patch.labelId = resolved[0]?.id;
        patch.labelName = resolved[0]?.name;
        patch.labelColor = resolved[0]?.color;
      }
    } else if (input.labelId !== undefined) {
      const raw = input.labelId;
      if (raw === null || raw === "") {
        patch.labelIds = undefined;
        patch.labels = undefined;
        patch.labelId = undefined;
        patch.labelName = undefined;
        patch.labelColor = undefined;
      } else {
        const label = labelRepository.findById(tenantId, raw);
        if (!label) throw new Error("Etiqueta inválida para este assinante.");
        patch.labelIds = [label.id];
        patch.labels = [{ id: label.id, name: label.name, color: label.color }];
        patch.labelId = label.id;
        patch.labelName = label.name;
        patch.labelColor = label.color;
      }
    }
    if (input.isPinned !== undefined) {
      patch.isPinned = input.isPinned;
    }
    if (input.scheduledAt !== undefined) {
      const raw = input.scheduledAt;
      if (raw === null || raw === "") {
        patch.scheduledAt = undefined;
      } else {
        patch.scheduledAt = normalizeScheduledAtStorage(raw);
      }
    }
    if (input.kanbanColumnId !== undefined) {
      const raw = input.kanbanColumnId;
      if (raw === null || raw === "") {
        patch.kanbanColumnId = undefined;
        patch.kanbanColumnName = undefined;
      } else {
        const resolved = resolveKanbanColumnAssignment(tenantId, raw, {
          kanbanRepository,
          priorityRepository,
          labelRepository,
        });
        if (!resolved) throw new Error("Coluna do Kanban inválida para este assinante.");
        patch.kanbanColumnId = resolved.kanbanColumnId;
        patch.kanbanColumnName = resolved.kanbanColumnName;
      }
    }
    const updated = this.queueRepository.updateContact(tenantId, contactId, patch);
    return updated ? withNormalizedQueueContact(updated) : null;
  }

  addAgentNote(tenantId: string, contactId: string, input: z.infer<typeof addAgentNoteSchema>) {
    const contact = this.queueRepository.getByTenantAndContactId(tenantId, contactId);
    if (!contact) return null;

    const text = input.text.trim();
    if (!text) return null;

    const note = {
      id: randomUUID(),
      text,
      createdAt: new Date().toISOString(),
      authorName: input.authorName?.trim() || undefined,
      authorId: input.authorId?.trim() || undefined,
    };
    const agentNotesHistory = [...resolveLeadAgentNotes(contact), note];
    const updated = this.queueRepository.updateContact(tenantId, contactId, {
      agentNotesHistory,
      agentNotes: "",
    });
    return updated ? withNormalizedQueueContact(updated) : null;
  }

  addAttachment(tenantId: string, contactId: string, input: z.infer<typeof addLeadAttachmentSchema>) {
    const contact = this.queueRepository.getByTenantAndContactId(tenantId, contactId);
    if (!contact) return null;
    const attachment = {
      id: randomUUID(),
      fileName: input.fileName,
      mimeType: input.mimeType,
      content: input.content,
      createdAt: new Date().toISOString(),
    };
    const attachments = [...(contact.attachments ?? []), attachment];
    const updated = this.queueRepository.updateContact(tenantId, contactId, { attachments });
    return updated ? withNormalizedQueueContact(updated) : null;
  }
}
