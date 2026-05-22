import { useEffect, useMemo, useRef, useState } from "react";
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

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M4 6h16v2H4V6Zm2 5h12v2H6v-2Zm3 5h6v2H9v-2Z" />
    </svg>
  );
}

export function LiveInboxToolbar({
  filters,
  onChange,
  priorities,
  labels,
  flowOptions,
}: LiveInboxToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const hasFilters = useMemo(() => hasActiveInboxListFilters(filters), [filters]);
  const selectionCount = useMemo(
    () => filters.priorityIds.length + filters.labelIds.length + filters.flowKeys.length,
    [filters],
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

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

  const clearSelectionFilters = () => {
    onChange({ ...filters, priorityIds: [], labelIds: [], flowKeys: [] });
  };

  return (
    <div className="live-inbox-toolbar" ref={wrapRef} role="search">
      <div className="live-inbox-toolbar__row">
        <label className="live-inbox-search">
          <span className="sr-only">Buscar leads</span>
          <input
            type="search"
            value={filters.searchQuery}
            placeholder="Pesquisar nome, WhatsApp, CPF..."
            onChange={(event) => onChange({ ...filters, searchQuery: event.target.value })}
          />
        </label>

        <div className="live-inbox-filter-menu-wrap">
          <button
            type="button"
            className={`live-inbox-filter-btn${menuOpen ? " active" : ""}${selectionCount > 0 ? " has-selection" : ""}`}
            aria-label="Filtrar conversas"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <FilterIcon />
            {selectionCount > 0 ? (
              <span className="live-inbox-filter-btn__badge" aria-hidden="true">
                {selectionCount}
              </span>
            ) : null}
          </button>

          {menuOpen ? (
            <div className="live-inbox-filter-dropdown" role="menu" aria-label="Filtros da fila">
              <div className="live-inbox-filter-dropdown__section">
                <span className="live-inbox-filter-dropdown__title">Propriedades</span>
                <div className="live-inbox-filter-dropdown__options">
                  {priorities.length === 0 ? (
                    <span className="muted muted-subtle live-inbox-filter-empty">Nenhuma cadastrada</span>
                  ) : (
                    priorities.map((row) => {
                      const checked = filters.priorityIds.includes(row.id);
                      return (
                        <button
                          key={row.id}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={checked}
                          className={`live-inbox-filter-option${checked ? " active" : ""}`}
                          onClick={() => toggleId("priorityIds", row.id)}
                        >
                          <span className="live-inbox-filter-option__check" aria-hidden="true">
                            {checked ? "✓" : ""}
                          </span>
                          <span>{row.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="live-inbox-filter-dropdown__section">
                <span className="live-inbox-filter-dropdown__title">Etiquetas</span>
                <div className="live-inbox-filter-dropdown__options">
                  {labels.length === 0 ? (
                    <span className="muted muted-subtle live-inbox-filter-empty">Nenhuma cadastrada</span>
                  ) : (
                    labels.map((row) => {
                      const checked = filters.labelIds.includes(row.id);
                      return (
                        <button
                          key={row.id}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={checked}
                          className={`live-inbox-filter-option${checked ? " active" : ""}`}
                          onClick={() => toggleId("labelIds", row.id)}
                        >
                          <span className="live-inbox-filter-option__check" aria-hidden="true">
                            {checked ? "✓" : ""}
                          </span>
                          <LabelTag name={row.name} color={row.color} />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="live-inbox-filter-dropdown__section">
                <span className="live-inbox-filter-dropdown__title">Produtos (fluxos)</span>
                <div className="live-inbox-filter-dropdown__options">
                  {flowOptions.length === 0 ? (
                    <span className="muted muted-subtle live-inbox-filter-empty">Nenhum fluxo na fila</span>
                  ) : (
                    flowOptions.map((row) => {
                      const checked = filters.flowKeys.includes(row.key);
                      return (
                        <button
                          key={row.key}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={checked}
                          className={`live-inbox-filter-option${checked ? " active" : ""}`}
                          onClick={() => toggleFlow(row.key)}
                        >
                          <span className="live-inbox-filter-option__check" aria-hidden="true">
                            {checked ? "✓" : ""}
                          </span>
                          <span>{row.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="live-inbox-filter-dropdown__footer">
                <button
                  type="button"
                  className="ghost-btn live-inbox-filter-dropdown__clear"
                  disabled={!hasFilters}
                  onClick={() => {
                    onChange(createEmptyInboxListFilters());
                    setMenuOpen(false);
                  }}
                >
                  Limpar tudo
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={selectionCount === 0}
                  onClick={clearSelectionFilters}
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
