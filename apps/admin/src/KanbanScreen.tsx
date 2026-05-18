import { useCallback, useEffect, useMemo, useState } from "react";
import { KanbanBoardPreview } from "./KanbanBoardPreview";
import type { TenantLabelRow } from "./TenantLabelsStep";
import type { TenantPriorityRow } from "./TenantPrioritiesStep";
import {
  KANBAN_ORGANIZE_OPTIONS,
  type TenantKanbanConfig,
  defaultKanbanConfig,
  resolveKanbanColumnTitles,
} from "./kanbanConfig";

type KanbanScreenProps = {
  apiBase: string;
  tenantId: string;
};

export function KanbanScreen({ apiBase, tenantId }: KanbanScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<TenantKanbanConfig>(() => defaultKanbanConfig(tenantId));
  const [priorities, setPriorities] = useState<TenantPriorityRow[]>([]);
  const [labels, setLabels] = useState<TenantLabelRow[]>([]);

  const loadBoard = useCallback(async () => {
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

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const columnTitles = useMemo(() => {
    const customNames =
      config.organizeBy === "custom" ? config.customColumns.map((col) => col.name) : [];
    return resolveKanbanColumnTitles(config.organizeBy, customNames, priorities, labels);
  }, [config, priorities, labels]);

  const organizeLabel =
    KANBAN_ORGANIZE_OPTIONS.find((option) => option.value === config.organizeBy)?.label ?? config.organizeBy;

  return (
    <section className="card kanban-screen">
      <header className="kanban-screen__header">
        <div>
          <h3>Kanban</h3>
          <p className="muted muted-subtle">
            Organização atual: <strong>{organizeLabel}</strong>. Os cards de leads serão exibidos aqui conforme a
            configuração definida no Master Console.
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={() => void loadBoard()} disabled={isLoading}>
          Atualizar
        </button>
      </header>

      {isLoading ? (
        <p className="muted muted-subtle">
          <span className="processing-inline-wrap" aria-live="polite">
            <i className="processing-inline-dot" aria-hidden="true" />
            Carregando quadro…
          </span>
        </p>
      ) : (
        <KanbanBoardPreview columnTitles={columnTitles} organizeBy={config.organizeBy} />
      )}
    </section>
  );
}
