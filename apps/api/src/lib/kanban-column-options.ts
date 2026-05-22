import type { KanbanRepository } from "../kanban/kanban.repository";
import { KanbanService } from "../kanban/kanban.service";
import type { LabelRepository } from "../labels/label.repository";
import type { PriorityRepository } from "../priorities/priority.repository";

export type KanbanColumnOption = { id: string; name: string };

export function listKanbanColumnOptions(
  tenantId: string,
  deps: {
    kanbanRepository: KanbanRepository;
    priorityRepository: PriorityRepository;
    labelRepository: LabelRepository;
  },
): KanbanColumnOption[] {
  const config = new KanbanService(deps.kanbanRepository).getByTenant(tenantId);
  if (config.organizeBy === "custom") {
    return [...config.customColumns]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((column) => ({ id: column.id, name: column.name }));
  }
  if (config.organizeBy === "labels") {
    return deps.labelRepository.listByTenant(tenantId).map((row) => ({ id: row.id, name: row.name }));
  }
  return deps.priorityRepository.listByTenant(tenantId).map((row) => ({ id: row.id, name: row.name }));
}

export function resolveKanbanColumnAssignment(
  tenantId: string,
  columnId: string,
  deps: {
    kanbanRepository: KanbanRepository;
    priorityRepository: PriorityRepository;
    labelRepository: LabelRepository;
  },
): { kanbanColumnId: string; kanbanColumnName: string } | null {
  const normalizedId = String(columnId ?? "").trim();
  if (!normalizedId) return null;
  const match = listKanbanColumnOptions(tenantId, deps).find((row) => row.id === normalizedId);
  if (!match) return null;
  return { kanbanColumnId: match.id, kanbanColumnName: match.name };
}
