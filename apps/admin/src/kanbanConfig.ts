import type { TenantLabelRow } from "./TenantLabelsStep";
import type { TenantPriorityRow } from "./TenantPrioritiesStep";

export type KanbanOrganizeBy = "priority" | "labels" | "custom";

export type KanbanCustomColumn = {
  id: string;
  name: string;
  sortOrder: number;
};

export type TenantKanbanConfig = {
  tenantId: string;
  organizeBy: KanbanOrganizeBy;
  customColumns: KanbanCustomColumn[];
  updatedAt: string;
};

export const KANBAN_ORGANIZE_OPTIONS: { value: KanbanOrganizeBy; label: string; hint: string }[] = [
  {
    value: "priority",
    label: "Ordem de Prioridade",
    hint: "Uma coluna para cada prioridade cadastrada (Alta, Média, Baixa, etc.).",
  },
  {
    value: "labels",
    label: "Ordem de etiquetas",
    hint: "Uma coluna para cada etiqueta cadastrada, na ordem definida.",
  },
  {
    value: "custom",
    label: "Personalizada",
    hint: "Defina quantas colunas quiser e o nome de cada etapa do funil.",
  },
];

export const KANBAN_CUSTOM_COLUMN_MIN = 2;
export const KANBAN_CUSTOM_COLUMN_MAX = 12;

export function buildEmptyCustomColumnNames(count: number): string[] {
  const safe = Math.max(KANBAN_CUSTOM_COLUMN_MIN, Math.min(KANBAN_CUSTOM_COLUMN_MAX, count));
  return Array.from({ length: safe }, (_, index) => `Coluna ${index + 1}`);
}

export function resizeCustomColumnNames(current: string[], count: number): string[] {
  const safe = Math.max(KANBAN_CUSTOM_COLUMN_MIN, Math.min(KANBAN_CUSTOM_COLUMN_MAX, count));
  if (current.length === safe) return current;
  if (current.length > safe) return current.slice(0, safe);
  const next = [...current];
  while (next.length < safe) {
    next.push(`Coluna ${next.length + 1}`);
  }
  return next;
}

export function resolveKanbanColumnTitles(
  organizeBy: KanbanOrganizeBy,
  customColumnNames: string[],
  priorities: TenantPriorityRow[],
  labels: TenantLabelRow[],
): string[] {
  if (organizeBy === "custom") {
    return customColumnNames.map((name) => name.trim()).filter((name) => name.length > 0);
  }
  if (organizeBy === "labels") {
    if (labels.length === 0) return ["Sem etiquetas"];
    return labels.map((row) => row.name);
  }
  if (priorities.length === 0) return ["Sem prioridades"];
  return priorities.map((row) => row.name);
}

export function defaultKanbanConfig(tenantId: string): TenantKanbanConfig {
  return {
    tenantId,
    organizeBy: "priority",
    customColumns: [],
    updatedAt: new Date().toISOString(),
  };
}
