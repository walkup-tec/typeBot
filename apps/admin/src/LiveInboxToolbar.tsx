import { useMemo } from "react";
import { LabelTag } from "./LabelTag";
import type { TenantLabelRow } from "./TenantLabelsStep";
import type { TenantPriorityRow } from "./TenantPrioritiesStep";
import {
  createEmptyInboxListFilters,
  hasActiveInboxListFilters,
  type LiveInboxListFilters,
} from "./liveInboxUtils";

type FlowOption = { key: string; name: string };

type LiveInboxToolbarProps = {
  filters: LiveInboxListFilters;
  onChange: (next: LiveInboxListFilters) => void;
  priorities: TenantPriorityRow[];
  labels: TenantLabelRow[];
  flowOptions: FlowOption[];
};

export function LiveInboxToolbar({
  filters,
  onChange,
  priorities,
  labels,
  flowOptions,
}: LiveInboxToolbarProps) {
  const active = useMemo(() => hasActiveInboxListFilters(filters), [filters]);

  const toggleId = (field: "priorityIds" | "labelIds", id: string) => {
    const current = filters[field];
    const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    onChange({ ...filters, [field]: next });
  };

  const toggleFlow = (key: string) => {
    const next = filters.flowKeys.includes(key)
      ? filters.flowKeys.filter((value) => value !== key)
      : [...filters.flowKeys, key];
    onChange({ ...filters, flowKeys: next });
  };

  return (
    <div className="live-inbox-toolbar" role="search">
      <label className="live-inbox-search">
        <span className="sr-only">Buscar leads</span>
        <input
          type="search"
          value={filters.searchQuery}
          placeholder="Buscar nome, WhatsApp, CPF..."
          onChange={(event) => onChange({ ...filters, searchQuery: event.target.value })}
        />
      </label>

      <div className="live-inbox-filter-groups">
        <div className="live-inbox-filter-group">
          <span className="live-inbox-filter-label">Propriedades</span>
          <div className="live-inbox-filter-chips">
            {priorities.length === 0 ? (
              <span className="muted muted-subtle live-inbox-filter-empty">Nenhuma</span>
            ) : (
              priorities.map((row) => {
                const activeChip = filters.priorityIds.includes(row.id);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`live-inbox-filter-chip${activeChip ? " active" : ""}`}
                    aria-pressed={activeChip}
                    onClick={() => toggleId("priorityIds", row.id)}
                  >
                    {row.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="live-inbox-filter-group">
          <span className="live-inbox-filter-label">Etiquetas</span>
          <div className="live-inbox-filter-chips">
            {labels.length === 0 ? (
              <span className="muted muted-subtle live-inbox-filter-empty">Nenhuma</span>
            ) : (
              labels.map((row) => {
                const activeChip = filters.labelIds.includes(row.id);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`live-inbox-filter-chip${activeChip ? " active" : ""}`}
                    aria-pressed={activeChip}
                    onClick={() => toggleId("labelIds", row.id)}
                  >
                    <LabelTag name={row.name} color={row.color} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="live-inbox-filter-group">
          <span className="live-inbox-filter-label">Produtos (fluxos)</span>
          <div className="live-inbox-filter-chips">
            {flowOptions.length === 0 ? (
              <span className="muted muted-subtle live-inbox-filter-empty">Nenhum</span>
            ) : (
              flowOptions.map((row) => {
                const activeChip = filters.flowKeys.includes(row.key);
                return (
                  <button
                    key={row.key}
                    type="button"
                    className={`live-inbox-filter-chip${activeChip ? " active" : ""}`}
                    aria-pressed={activeChip}
                    onClick={() => toggleFlow(row.key)}
                  >
                    {row.name}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="ghost-btn live-inbox-clear-filters"
        disabled={!active}
        onClick={() => onChange(createEmptyInboxListFilters())}
      >
        Limpar filtros
      </button>
    </div>
  );
}
