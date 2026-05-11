import { randomUUID } from "node:crypto";
import { z } from "zod";
import { QueueRepository } from "./queue.repository";
import type { QueueDistributionMode } from "../tenants/tenant.repository";

export const enqueueSchema = z.object({
  contactName: z.string().min(2).max(120),
  source: z.enum(["typebot", "widget"]).default("widget"),
  sourceFlowLabel: z.string().min(2).max(150).default("Fluxo sem identificação"),
  leadContext: z.record(z.string().min(1).max(80), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const assignSchema = z.object({
  agentId: z.string().min(2).max(80),
  agentName: z.string().min(2).max(120).optional(),
});

export const sendLiveMessageSchema = z.object({
  sender: z.enum(["agent", "visitor"]),
  content: z.string().min(1).max(300000),
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
      leadContext: input.leadContext,
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

  list(tenantId: string) {
    return this.queueRepository
      .listByTenant(tenantId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  backfillAssignedAgentNames(tenantId: string, resolveName: (agentId: string) => string | undefined) {
    this.queueRepository.hydrateAssignedAgentNames(tenantId, resolveName);
  }

  getContact(tenantId: string, contactId: string) {
    return this.queueRepository.getByTenantAndContactId(tenantId, contactId);
  }

  getContactById(contactId: string) {
    return this.queueRepository.getByContactId(contactId);
  }

  assign(tenantId: string, contactId: string, input: z.infer<typeof assignSchema>) {
    return this.queueRepository.assign(tenantId, contactId, input.agentId, input.agentName);
  }

  getMessages(tenantId: string, contactId: string) {
    return this.queueRepository.getMessages(tenantId, contactId);
  }

  sendMessage(tenantId: string, contactId: string, input: z.infer<typeof sendLiveMessageSchema>) {
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
}
