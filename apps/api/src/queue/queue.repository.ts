import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getDataFilePath } from "../lib/data-path";

export interface LeadAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  content: string;
  createdAt: string;
}

export interface LeadAgentNote {
  id: string;
  text: string;
  createdAt: string;
  authorName?: string;
  authorId?: string;
}

export interface QueueContact {
  contactId: string;
  tenantId: string;
  contactName: string;
  source: "typebot" | "widget";
  sourceFlowLabel: string;
  leadContext?: Record<string, string | number | boolean>;
  leadWhatsapp?: string;
  agentNotes?: string;
  agentNotesHistory?: LeadAgentNote[];
  attachments?: LeadAttachment[];
  status: "waiting" | "in_service" | "closed";
  assignedAgentId?: string;
  assignedAgentName?: string;
  priorityId?: string;
  priorityName?: string;
  /** Compatibilidade: primeira etiqueta quando há apenas uma. */
  labelId?: string;
  labelName?: string;
  labelColor?: string;
  labelIds?: string[];
  labels?: Array<{ id: string; name: string; color: string }>;
  /** Data/hora ISO do próximo agendamento com o lead. */
  scheduledAt?: string;
  /** Conversa fixada no topo da fila ao vivo. */
  isPinned?: boolean;
  updatedAt: string;
}

export interface LiveMessage {
  id: string;
  contactId: string;
  sender: "system" | "agent" | "visitor";
  content: string;
  createdAt: string;
}

type PersistedQueueState = {
  contacts: QueueContact[];
  messages: Record<string, LiveMessage[]>;
};

const QUEUE_STATE_FILE_PATH = getDataFilePath("queue-state.json");

const ensureQueueStorage = () => {
  const folder = dirname(QUEUE_STATE_FILE_PATH);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  if (!existsSync(QUEUE_STATE_FILE_PATH)) {
    const initial: PersistedQueueState = { contacts: [], messages: {} };
    writeFileSync(QUEUE_STATE_FILE_PATH, JSON.stringify(initial, null, 2), "utf-8");
  }
};

const loadQueueState = (): PersistedQueueState => {
  ensureQueueStorage();
  try {
    const raw = readFileSync(QUEUE_STATE_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as PersistedQueueState;
    return {
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      messages: parsed.messages && typeof parsed.messages === "object" ? parsed.messages : {},
    };
  } catch {
    return { contacts: [], messages: {} };
  }
};

const saveQueueState = (contacts: Map<string, QueueContact>, messages: Map<string, LiveMessage[]>) => {
  ensureQueueStorage();
  const payload: PersistedQueueState = {
    contacts: [...contacts.values()],
    messages: Object.fromEntries([...messages.entries()]),
  };
  writeFileSync(QUEUE_STATE_FILE_PATH, JSON.stringify(payload, null, 2), "utf-8");
};

const waitingQueue = new Map<string, QueueContact>();
const liveMessages = new Map<string, LiveMessage[]>();

export class QueueRepository {
  constructor() {
    const initial = loadQueueState();
    for (const contact of initial.contacts) {
      waitingQueue.set(contact.contactId, contact);
    }
    for (const [contactId, messages] of Object.entries(initial.messages)) {
      liveMessages.set(contactId, Array.isArray(messages) ? messages : []);
    }
  }

  enqueue(contact: QueueContact) {
    waitingQueue.set(contact.contactId, contact);
    saveQueueState(waitingQueue, liveMessages);
    return contact;
  }

  listByTenant(tenantId: string, options?: { includeClosed?: boolean }) {
    const includeClosed = options?.includeClosed === true;
    return [...waitingQueue.values()].filter(
      (item) => item.tenantId === tenantId && (includeClosed || item.status !== "closed"),
    );
  }

  listAll(options?: { includeClosed?: boolean }) {
    const includeClosed = options?.includeClosed === true;
    return [...waitingQueue.values()].filter((item) => includeClosed || item.status !== "closed");
  }

  hydrateAssignedAgentNames(tenantId: string, resolveName: (agentId: string) => string | undefined) {
    let changed = false;
    for (const [contactId, contact] of waitingQueue.entries()) {
      if (contact.tenantId !== tenantId) continue;
      if (!contact.assignedAgentId) continue;
      if (String(contact.assignedAgentName ?? "").trim()) continue;
      const resolved = String(resolveName(contact.assignedAgentId) ?? "").trim();
      if (!resolved) continue;
      waitingQueue.set(contactId, {
        ...contact,
        assignedAgentName: resolved,
      });
      changed = true;
    }
    if (changed) saveQueueState(waitingQueue, liveMessages);
  }

  getByTenantAndContactId(tenantId: string, contactId: string) {
    const contact = waitingQueue.get(contactId);
    if (!contact || contact.tenantId !== tenantId) return null;
    return contact;
  }

  getByContactId(contactId: string) {
    return waitingQueue.get(contactId) ?? null;
  }

  propagatePriorityRename(tenantId: string, priorityId: string, priorityName: string): number {
    const normalizedId = String(priorityId).trim();
    const normalizedName = String(priorityName).trim();
    if (!normalizedId || !normalizedName) return 0;

    let changed = 0;
    for (const [contactId, contact] of waitingQueue) {
      if (contact.tenantId !== tenantId) continue;
      if (String(contact.priorityId ?? "").trim() !== normalizedId) continue;
      if (String(contact.priorityName ?? "").trim() === normalizedName) continue;
      waitingQueue.set(contactId, {
        ...contact,
        priorityName: normalizedName,
        updatedAt: new Date().toISOString(),
      });
      changed += 1;
    }
    if (changed > 0) saveQueueState(waitingQueue, liveMessages);
    return changed;
  }

  propagateLabelRename(
    tenantId: string,
    labelId: string,
    patch: { name: string; color: string },
  ): number {
    const normalizedId = String(labelId).trim();
    const normalizedName = String(patch.name).trim();
    const normalizedColor = String(patch.color).trim() || "#64748b";
    if (!normalizedId || !normalizedName) return 0;

    let changed = 0;
    for (const [contactId, contact] of waitingQueue) {
      if (contact.tenantId !== tenantId) continue;

      const ids = Array.isArray(contact.labelIds)
        ? contact.labelIds.map((id) => String(id).trim()).filter(Boolean)
        : contact.labelId
          ? [String(contact.labelId).trim()]
          : [];
      if (!ids.includes(normalizedId)) continue;

      const labels = Array.isArray(contact.labels)
        ? contact.labels.map((row) => {
            if (String(row.id ?? "").trim() !== normalizedId) return row;
            return { ...row, name: normalizedName, color: normalizedColor };
          })
        : [];

      const firstId = ids[0];
      const next: QueueContact = {
        ...contact,
        labels: labels.length > 0 ? labels : contact.labels,
        updatedAt: new Date().toISOString(),
      };
      if (firstId === normalizedId) {
        next.labelName = normalizedName;
        next.labelColor = normalizedColor;
      }
      waitingQueue.set(contactId, next);
      changed += 1;
    }
    if (changed > 0) saveQueueState(waitingQueue, liveMessages);
    return changed;
  }

  updateContact(
    tenantId: string,
    contactId: string,
    patch: Partial<
      Pick<
        QueueContact,
        | "contactName"
        | "leadWhatsapp"
        | "agentNotes"
        | "agentNotesHistory"
        | "leadContext"
        | "attachments"
        | "priorityId"
        | "priorityName"
        | "labelId"
        | "labelName"
        | "labelColor"
        | "labelIds"
        | "labels"
        | "scheduledAt"
        | "isPinned"
      >
    >,
  ): QueueContact | null {
    const contact = waitingQueue.get(contactId);
    if (!contact || contact.tenantId !== tenantId) return null;

    const updated: QueueContact = {
      ...contact,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    for (const key of [
      "priorityId",
      "priorityName",
      "labelId",
      "labelName",
      "labelColor",
      "labelIds",
      "labels",
      "scheduledAt",
      "isPinned",
    ] as const) {
      if (key in patch && patch[key] === undefined) {
        delete updated[key];
      }
    }
    waitingQueue.set(contactId, updated);
    saveQueueState(waitingQueue, liveMessages);
    return updated;
  }

  assign(tenantId: string, contactId: string, agentId: string, agentName?: string): QueueContact | null {
    const contact = waitingQueue.get(contactId);
    if (!contact || contact.tenantId !== tenantId) return null;

    const nextAgentId = String(agentId ?? "").trim();
    const previousAgentId = String(contact.assignedAgentId ?? "").trim();
    const agentChanged = nextAgentId.toLowerCase() !== previousAgentId.toLowerCase();

    const updated: QueueContact = {
      ...contact,
      status: "in_service",
      assignedAgentId: nextAgentId,
      assignedAgentName: String(agentName ?? "").trim() || contact.assignedAgentName,
      updatedAt: new Date().toISOString(),
    };
    waitingQueue.set(contactId, updated);
    if (agentChanged) {
      const history = liveMessages.get(contactId) ?? [];
      history.push({
        id: `${contactId}-assigned-${Date.now()}`,
        contactId,
        sender: "system",
        content: `Atendimento assumido por ${String(agentName ?? "").trim() || nextAgentId}.`,
        createdAt: new Date().toISOString(),
      });
      liveMessages.set(contactId, history);
    }
    saveQueueState(waitingQueue, liveMessages);
    return updated;
  }

  complete(tenantId: string, contactId: string, closedByLabel: string): QueueContact | null {
    const contact = waitingQueue.get(contactId);
    if (!contact || contact.tenantId !== tenantId) return null;
    if (contact.status === "closed") return contact;

    const updated: QueueContact = {
      ...contact,
      status: "closed",
      updatedAt: new Date().toISOString(),
    };
    delete updated.isPinned;
    waitingQueue.set(contactId, updated);

    const history = liveMessages.get(contactId) ?? [];
    history.push({
      id: `${contactId}-closed-${Date.now()}`,
      contactId,
      sender: "system",
      content: `Atendimento encerrado por ${closedByLabel}`,
      createdAt: new Date().toISOString(),
    });
    liveMessages.set(contactId, history);
    saveQueueState(waitingQueue, liveMessages);
    return updated;
  }

  addMessage(message: LiveMessage) {
    const history = liveMessages.get(message.contactId) ?? [];
    history.push(message);
    liveMessages.set(message.contactId, history);
    saveQueueState(waitingQueue, liveMessages);
    return message;
  }

  getMessages(tenantId: string, contactId: string) {
    const contact = waitingQueue.get(contactId);
    if (!contact || contact.tenantId !== tenantId) return null;
    return liveMessages.get(contactId) ?? [];
  }

  /** Remove contactos e mensagens da fila deste assinante (ao apagar o tenant). */
  deleteByTenantId(tenantId: string): void {
    const toRemove: string[] = [];
    for (const [contactId, contact] of waitingQueue.entries()) {
      if (contact.tenantId === tenantId) toRemove.push(contactId);
    }
    if (toRemove.length === 0) return;
    for (const contactId of toRemove) {
      waitingQueue.delete(contactId);
      liveMessages.delete(contactId);
    }
    saveQueueState(waitingQueue, liveMessages);
  }
}
