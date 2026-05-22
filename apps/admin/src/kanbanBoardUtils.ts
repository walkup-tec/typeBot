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
  priorityId?: string;
  priorityName?: string;
  labelId?: string;
  labelIds?: string[];
  labels?: Array<{ id: string; name: string; color?: string }>;
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

const ORPHAN_COLUMN_ID = "__kanban_orphan";
const NO_LABEL_COLUMN_ID = "__kanban_no_label";

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

function findColumnIdByName(columns: KanbanColumnDef[], name: string): string | null {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return null;
  const match = columns.find((column) => column.name.trim().toLowerCase() === normalized);
  return match?.id ?? null;
}

function collectContactLabelIds(contact: KanbanBoardContact): string[] {
  const fromArray = Array.isArray(contact.labelIds)
    ? contact.labelIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const legacy = contact.labelId ? [String(contact.labelId).trim()] : [];
  const fromLabels = Array.isArray(contact.labels)
    ? contact.labels.map((row) => String(row?.id || "").trim()).filter(Boolean)
    : [];
  return [...new Set([...fromArray, ...legacy, ...fromLabels])];
}

function resolveColumnIdFromKanbanFields(
  contact: KanbanBoardContact,
  columns: KanbanColumnDef[],
): string | null {
  const columnId = String(contact.kanbanColumnId || "").trim();
  if (columnId && columns.some((column) => column.id === columnId)) return columnId;
  return findColumnIdByName(columns, String(contact.kanbanColumnName || ""));
}

function resolveContactColumnId(
  contact: KanbanBoardContact,
  columns: KanbanColumnDef[],
  organizeBy: KanbanOrganizeBy,
): string | null {
  if (organizeBy === "labels") {
    for (const labelId of collectContactLabelIds(contact)) {
      if (columns.some((column) => column.id === labelId)) return labelId;
    }
    return resolveColumnIdFromKanbanFields(contact, columns);
  }

  if (organizeBy === "priority") {
    const priorityId = String(contact.priorityId || "").trim();
    if (priorityId && columns.some((column) => column.id === priorityId)) return priorityId;
    const byPriorityName = findColumnIdByName(columns, String(contact.priorityName || ""));
    if (byPriorityName) return byPriorityName;
    return resolveColumnIdFromKanbanFields(contact, columns);
  }

  return resolveColumnIdFromKanbanFields(contact, columns);
}

export function hasManualKanbanAssignment(contact: KanbanBoardContact): boolean {
  return Boolean(String(contact.kanbanColumnId || "").trim() || String(contact.kanbanColumnName || "").trim());
}

function shouldPlaceContactOnBoard(
  contact: KanbanBoardContact,
  columns: KanbanColumnDef[],
  organizeBy: KanbanOrganizeBy,
): boolean {
  if (organizeBy === "custom") return hasManualKanbanAssignment(contact);
  if (organizeBy === "labels") return collectContactLabelIds(contact).length > 0 || hasManualKanbanAssignment(contact);
  const priorityId = String(contact.priorityId || "").trim();
  const priorityName = String(contact.priorityName || "").trim();
  return Boolean(priorityId || priorityName || hasManualKanbanAssignment(contact));
}

export function buildKanbanBoard(
  columns: KanbanColumnDef[],
  contacts: KanbanBoardContact[],
  organizeBy: KanbanOrganizeBy,
): KanbanBoardColumn[] {
  const buckets = new Map<string, KanbanLeadCard[]>(columns.map((column) => [column.id, []]));
  const orphanCards: KanbanLeadCard[] = [];
  const noLabelCards: KanbanLeadCard[] = [];

  for (const contact of contacts) {
    if (!shouldPlaceContactOnBoard(contact, columns, organizeBy)) continue;

    const card = toKanbanLeadCard(contact);
    const columnId = resolveContactColumnId(contact, columns, organizeBy);

    if (columnId && buckets.has(columnId)) {
      buckets.get(columnId)?.push(card);
      continue;
    }

    const labelIds = collectContactLabelIds(contact);

    if (organizeBy === "labels") {
      if (labelIds.length === 0 && !hasManualKanbanAssignment(contact)) {
        noLabelCards.push(card);
      } else {
        orphanCards.push(card);
      }
      continue;
    }

    if (organizeBy === "priority" || organizeBy === "custom") {
      orphanCards.push(card);
    }
  }

  const board: KanbanBoardColumn[] = columns.map((column) => ({
    column,
    cards: sortKanbanCards(buckets.get(column.id) ?? []),
  }));

  if (organizeBy === "labels" && noLabelCards.length > 0) {
    board.push({
      column: { id: NO_LABEL_COLUMN_ID, name: "Sem etiqueta" },
      cards: sortKanbanCards(noLabelCards),
    });
  }

  if (orphanCards.length > 0) {
    board.push({
      column: {
        id: ORPHAN_COLUMN_ID,
        name:
          organizeBy === "custom"
            ? "Coluna não encontrada"
            : "Etapa manual desatualizada",
      },
      cards: sortKanbanCards(orphanCards),
    });
  }

  return board;
}

export function countKanbanPlacedLeads(
  columns: KanbanColumnDef[],
  contacts: KanbanBoardContact[],
  organizeBy: KanbanOrganizeBy,
): number {
  let count = 0;
  for (const contact of contacts) {
    if (!shouldPlaceContactOnBoard(contact, columns, organizeBy)) continue;
    if (resolveContactColumnId(contact, columns, organizeBy)) {
      count += 1;
      continue;
    }
    if (organizeBy === "labels" && collectContactLabelIds(contact).length === 0) count += 1;
    if (organizeBy === "custom" && hasManualKanbanAssignment(contact)) count += 1;
    if (organizeBy === "priority" && (contact.priorityId || contact.priorityName)) count += 1;
  }
  return count;
}

/** @deprecated use countKanbanPlacedLeads */
export function countKanbanAssignedLeads(contacts: KanbanBoardContact[]): number {
  return contacts.filter(hasManualKanbanAssignment).length;
}

export const kanbanOrganizeSubtitle: Record<KanbanOrganizeBy, string> = {
  priority: "Leads agrupados pela prioridade do contato",
  labels: "Leads agrupados pelas etiquetas do contato",
  custom: "Leads na coluna definida manualmente no atendimento",
};
