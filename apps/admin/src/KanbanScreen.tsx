import { useCallback, useEffect, useMemo, useState } from "react";
import { KanbanBoard } from "./KanbanBoard";
import type { TenantLabelRow } from "./TenantLabelsStep";
import type { TenantPriorityRow } from "./TenantPrioritiesStep";
import {
  KANBAN_ORGANIZE_OPTIONS,
  type TenantKanbanConfig,
  defaultKanbanConfig,
} from "./kanbanConfig";
import {
  buildKanbanBoard,
  countKanbanPlacedLeads,
  kanbanOrganizeSubtitle,
  resolveKanbanColumnDefs,
  type KanbanBoardContact,
} from "./kanbanBoardUtils";

type KanbanScreenProps = {
  apiBase: string;
  tenantId: string;
  contacts: KanbanBoardContact[];
  onOpenContact: (contactId: string) => void;
  onRefresh: () => Promise<void>;
};

export function KanbanScreen({ apiBase, tenantId, contacts, onOpenContact, onRefresh }: KanbanScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<TenantKanbanConfig>(() => defaultKanbanConfig(tenantId));
  const [priorities, setPriorities] = useState<TenantPriorityRow[]>([]);
  const [labels, setLabels] = useState<TenantLabelRow[]>([]);

  const loadBoardMeta = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const [configRes, prioritiesRes, labelsRes] = await Promise.all([
        fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/kanban-config`),
        fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/priorities`),
        fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/labels`),
      ]);

      if (configRes.ok) {
        setConfig((await configRes.json()) as TenantKanbanConfig);
      } else {
        setConfig(defaultKanbanConfig(tenantId));
      }

      if (prioritiesRes.ok) {
        const rows = (await prioritiesRes.json()) as TenantPriorityRow[];
        setPriorities(Array.isArray(rows) ? rows : []);
      }

      if (labelsRes.ok) {
        const rows = (await labelsRes.json()) as TenantLabelRow[];
        setLabels(Array.isArray(rows) ? rows : []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, tenantId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadBoardMeta(), onRefresh()]);
  }, [loadBoardMeta, onRefresh]);

  useEffect(() => {
    void loadBoardMeta();
  }, [loadBoardMeta]);

  const columnDefs = useMemo(
    () => resolveKanbanColumnDefs(config, priorities, labels),
    [config, priorities, labels],
  );

  const boardColumns = useMemo(
    () => buildKanbanBoard(columnDefs, contacts, config.organizeBy),
    [columnDefs, contacts, config.organizeBy],
  );

  const placedCount = useMemo(
    () => countKanbanPlacedLeads(columnDefs, contacts, config.organizeBy),
    [columnDefs, contacts, config.organizeBy],
  );

  const organizeLabel =
    KANBAN_ORGANIZE_OPTIONS.find((option) => option.value === config.organizeBy)?.label ?? config.organizeBy;

  return (
    <section className="kanban-screen" data-build="20260520-kanban-by-label-v2">
      <header className="kanban-screen__toolbar">
        <p className="muted muted-subtle kanban-screen__summary">
          <strong>{organizeLabel}</strong> — {kanbanOrganizeSubtitle[config.organizeBy]}.{" "}
          <span>
            {placedCount} lead(s) no quadro · {contacts.length} na fila
          </span>
        </p>
        <button type="button" className="ghost-btn" onClick={() => void refreshAll()} disabled={isLoading}>
          Atualizar
        </button>
      </header>

      {isLoading ? (
        <p className="muted muted-subtle kanban-screen__loading">
          <span className="processing-inline-wrap" aria-live="polite">
            <i className="processing-inline-dot" aria-hidden="true" />
            Carregando quadro…
          </span>
        </p>
      ) : (
        <KanbanBoard columns={boardColumns} onOpenContact={onOpenContact} />
      )}
    </section>
  );
}
