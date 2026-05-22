import type { TenantLabelRow } from "./TenantLabelsStep";
import type { TenantPriorityRow } from "./TenantPrioritiesStep";
import type { KanbanOrganizeBy, TenantKanbanConfig } from "./kanbanConfig";

export type KanbanColumnDef = {
  id: string;
  name: string;
};

export type KanbanBoardContact = {
  contactId: string;
  contactName: string;
  leadWhatsapp?: string;
  status: "waiting" | "in_service" | "closed" | string;
  assignedAgentName?: string;
  priorityName?: string;
  kanbanColumnId?: string;
  kanbanColumnName?: string;
  updatedAt: string;
};

export type KanbanLeadCard = {
  contactId: string;
  contactName: string;
  leadWhatsapp: string;
  status: string;
  assignedAgentName: string;
  priorityName: string;
  updatedAt: string;
};

export type KanbanBoardColumn = {
  column: KanbanColumnDef;
  cards: KanbanLeadCard[];
};

const UNASSIGNED_COLUMN_ID = "__kanban_unassigned";

export function resolveKanbanColumnDefs(
  config: TenantKanbanConfig,
  priorities: TenantPriorityRow[],
  labels: TenantLabelRow[],
): KanbanColumnDef[] {
  if (config.organizeBy === "custom") {
    return [...config.customColumns]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((column) => ({ id: column.id, name: column.name.trim() }))
      .filter((column) => column.name.length > 0);
  }
  if (config.organizeBy === "labels") {
    if (labels.length === 0) return [];
    return labels.map((row) => ({ id: row.id, name: row.name }));
  }
  if (priorities.length === 0) return [];
  return priorities.map((row) => ({ id: row.id, name: row.name }));
}

function toKanbanLeadCard(contact: KanbanBoardContact): KanbanLeadCard {
  return {
    contactId: contact.contactId,
    contactName: String(contact.contactName || "").trim() || "Visitante",
    leadWhatsapp: String(contact.leadWhatsapp || "").trim(),
    status: String(contact.status || ""),
    assignedAgentName: String(contact.assignedAgentName || "").trim(),
    priorityName: String(contact.priorityName || "").trim(),
    updatedAt: contact.updatedAt,
  };
}

function sortKanbanCards(cards: KanbanLeadCard[]): KanbanLeadCard[] {
  const statusOrder: Record<string, number> = { in_service: 0, waiting: 1, closed: 2 };
  return [...cards].sort((left, right) => {
    const leftStatus = statusOrder[left.status] ?? 3;
    const rightStatus = statusOrder[right.status] ?? 3;
    if (leftStatus !== rightStatus) return leftStatus - rightStatus;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function resolveContactColumnId(
  contact: KanbanBoardContact,
  columns: KanbanColumnDef[],
): string | null {
  const columnId = String(contact.kanbanColumnId || "").trim();
  if (columnId && columns.some((column) => column.id === columnId)) return columnId;

  const columnName = String(contact.kanbanColumnName || "").trim().toLowerCase();
  if (!columnName) return null;

  const byName = columns.find((column) => column.name.trim().toLowerCase() === columnName);
  return byName?.id ?? null;
}

export function hasKanbanAssignment(contact: KanbanBoardContact): boolean {
  return Boolean(String(contact.kanbanColumnId || "").trim() || String(contact.kanbanColumnName || "").trim());
}

export function buildKanbanBoard(
  columns: KanbanColumnDef[],
  contacts: KanbanBoardContact[],
): KanbanBoardColumn[] {
  const buckets = new Map<string, KanbanLeadCard[]>(columns.map((column) => [column.id, []]));
  const orphanCards: KanbanLeadCard[] = [];

  for (const contact of contacts) {
    if (!hasKanbanAssignment(contact)) continue;
    const card = toKanbanLeadCard(contact);
    const columnId = resolveContactColumnId(contact, columns);
    if (columnId && buckets.has(columnId)) {
      buckets.get(columnId)?.push(card);
      continue;
    }
    orphanCards.push(card);
  }

  const board: KanbanBoardColumn[] = columns.map((column) => ({
    column,
    cards: sortKanbanCards(buckets.get(column.id) ?? []),
  }));

  if (orphanCards.length > 0) {
    board.push({
      column: { id: UNASSIGNED_COLUMN_ID, name: "Coluna não encontrada" },
      cards: sortKanbanCards(orphanCards),
    });
  }

  return board;
}

export function countKanbanAssignedLeads(contacts: KanbanBoardContact[]): number {
  return contacts.filter(hasKanbanAssignment).length;
}

export const kanbanOrganizeSubtitle: Record<KanbanOrganizeBy, string> = {
  priority: "Colunas pelas prioridades do assinante",
  labels: "Colunas pelas etiquetas do assinante",
  custom: "Colunas personalizadas do funil",
};
