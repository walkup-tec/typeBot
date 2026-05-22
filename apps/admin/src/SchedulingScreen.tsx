import { useCallback, useEffect, useMemo, useState } from "react";
import { LabelTag } from "./LabelTag";
import type { TenantLabelRow } from "./TenantLabelsStep";
import type { TenantPriorityRow } from "./TenantPrioritiesStep";
import {
  filterScheduledLeads,
  formatSchedulingDateTime,
  getBrazilTodayKey,
  resolveSchedulingDateRange,
  sortScheduledLeads,
  type ScheduledLeadItem,
  type SchedulingDatePreset,
  type SchedulingViewTab,
} from "./schedulingUtils";
import { resolveFlowLabelColor, resolveInboxStatus } from "./liveInboxUtils";

type SchedulingScreenProps = {
  apiBase: string;
  tenantId: string;
  contacts: ScheduledLeadItem[];
  onOpenContact: (contactId: string) => void;
  onRefresh: () => Promise<void>;
};

export function SchedulingScreen({ apiBase, tenantId, contacts, onOpenContact, onRefresh }: SchedulingScreenProps) {
  const [viewTab, setViewTab] = useState<SchedulingViewTab>("all");
  const [datePreset, setDatePreset] = useState<SchedulingDatePreset>("week");
  const [customStart, setCustomStart] = useState(() => getBrazilTodayKey());
  const [customEnd, setCustomEnd] = useState(() => getBrazilTodayKey());
  const [selectedPriorityId, setSelectedPriorityId] = useState("");
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<TenantPriorityRow[]>([]);
  const [labels, setLabels] = useState<TenantLabelRow[]>([]);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);

  const loadMeta = useCallback(async () => {
    if (!tenantId) return;
    setIsLoadingMeta(true);
    try {
      const [prioritiesRes, labelsRes] = await Promise.all([
        fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/priorities`),
        fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/labels`),
      ]);
      if (prioritiesRes.ok) {
        const rows = (await prioritiesRes.json()) as TenantPriorityRow[];
        setPriorities(Array.isArray(rows) ? rows : []);
      }
      if (labelsRes.ok) {
        const rows = (await labelsRes.json()) as TenantLabelRow[];
        setLabels(Array.isArray(rows) ? rows : []);
      }
    } finally {
      setIsLoadingMeta(false);
    }
  }, [apiBase, tenantId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (selectedPriorityId) return;
    const first = priorities[0];
    if (first?.id) setSelectedPriorityId(first.id);
  }, [priorities, selectedPriorityId]);

  const dateRange = useMemo(
    () => resolveSchedulingDateRange(datePreset, customStart, customEnd),
    [customEnd, customStart, datePreset],
  );

  const scheduledInRange = useMemo(() => filterScheduledLeads(contacts, dateRange), [contacts, dateRange]);

  const displayedLeads = useMemo(
    () =>
      sortScheduledLeads(scheduledInRange, viewTab, {
        priorityId: selectedPriorityId,
        labelIds: selectedLabelIds,
      }),
    [scheduledInRange, selectedLabelIds, selectedPriorityId, viewTab],
  );

  const toggleLabel = (labelId: string) => {
    setSelectedLabelIds((current) => {
      if (current.includes(labelId)) return current.filter((id) => id !== labelId);
      return [...current, labelId];
    });
  };

  const applyCustomPeriod = () => {
    setDatePreset("custom");
  };

  const flowNameFor = (item: ScheduledLeadItem) =>
    String(item.sourceFlowDisplayName ?? item.sourceFlowLabel ?? "").trim();

  return (
    <section className="card scheduling-screen">
      <header className="scheduling-screen__header">
        <div>
          <h3>Agenda de retornos</h3>
          <p className="muted muted-subtle">
            Leads com data de agendamento no período selecionado. Use as abas para priorizar a visualização.
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={() => void onRefresh()}>
          Atualizar
        </button>
      </header>

      <div className="scheduling-toolbar" role="group" aria-label="Filtro de período">
        <button
          type="button"
          className={`scheduling-preset-btn${datePreset === "week" ? " active" : ""}`}
          onClick={() => setDatePreset("week")}
        >
          Essa semana
        </button>
        <button
          type="button"
          className={`scheduling-preset-btn${datePreset === "15days" ? " active" : ""}`}
          onClick={() => setDatePreset("15days")}
        >
          15 dias
        </button>
        <button
          type="button"
          className={`scheduling-preset-btn${datePreset === "30days" ? " active" : ""}`}
          onClick={() => setDatePreset("30days")}
        >
          30 dias
        </button>
        <label className="scheduling-period-field">
          <span>De</span>
          <input
            type="date"
            value={customStart}
            onChange={(event) => {
              setCustomStart(event.target.value);
              setDatePreset("custom");
            }}
          />
        </label>
        <label className="scheduling-period-field">
          <span>Até</span>
          <input
            type="date"
            value={customEnd}
            onChange={(event) => {
              setCustomEnd(event.target.value);
              setDatePreset("custom");
            }}
          />
        </label>
        <button type="button" className="ghost-btn scheduling-period-apply" onClick={applyCustomPeriod}>
          Aplicar período
        </button>
      </div>

      <div className="scheduling-tabs" role="tablist" aria-label="Ordenação da agenda">
        <button
          type="button"
          role="tab"
          className={`scheduling-tab${viewTab === "priorities" ? " active" : ""}`}
          aria-selected={viewTab === "priorities"}
          onClick={() => setViewTab("priorities")}
        >
          Prioridades
        </button>
        <button
          type="button"
          role="tab"
          className={`scheduling-tab${viewTab === "labels" ? " active" : ""}`}
          aria-selected={viewTab === "labels"}
          onClick={() => setViewTab("labels")}
        >
          Etiquetas
        </button>
        <button
          type="button"
          role="tab"
          className={`scheduling-tab${viewTab === "all" ? " active" : ""}`}
          aria-selected={viewTab === "all"}
          onClick={() => setViewTab("all")}
        >
          Todos <span className="scheduling-tab-count">{scheduledInRange.length}</span>
        </button>
      </div>

      {viewTab === "priorities" ? (
        <div className="scheduling-tab-panel">
          <label className="scheduling-filter-select">
            <span>Prioridade em destaque</span>
            <select
              value={selectedPriorityId}
              onChange={(event) => setSelectedPriorityId(event.target.value)}
              disabled={isLoadingMeta || priorities.length === 0}
            >
              {priorities.length === 0 ? <option value="">Nenhuma prioridade cadastrada</option> : null}
              {priorities.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted muted-subtle scheduling-tab-hint">
            Leads com a prioridade selecionada aparecem primeiro; o restante segue por data/hora do agendamento.
          </p>
        </div>
      ) : null}

      {viewTab === "labels" ? (
        <div className="scheduling-tab-panel">
          <span className="scheduling-filter-label">Etiquetas em destaque</span>
          {labels.length === 0 ? (
            <p className="muted muted-subtle">Nenhuma etiqueta cadastrada para este assinante.</p>
          ) : (
            <div className="scheduling-label-picker">
              {labels.map((row) => {
                const active = selectedLabelIds.includes(row.id);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`scheduling-label-toggle${active ? " active" : ""}`}
                    onClick={() => toggleLabel(row.id)}
                    aria-pressed={active}
                  >
                    <LabelTag name={row.name} color={row.color} />
                  </button>
                );
              })}
            </div>
          )}
          <p className="muted muted-subtle scheduling-tab-hint">
            Selecione uma ou mais etiquetas. Leads que possuem alguma delas aparecem primeiro na lista.
          </p>
        </div>
      ) : null}

      <div className="scheduling-list" role="list">
        {displayedLeads.length === 0 ? (
          <p className="scheduling-empty muted muted-subtle">Nenhum lead agendado neste período.</p>
        ) : (
          displayedLeads.map((item) => {
            const status = resolveInboxStatus(item);
            const flowName = flowNameFor(item);
            return (
              <article key={item.contactId} className="scheduling-card" role="listitem">
                <div className="scheduling-card__main">
                  <div className="scheduling-card__title-row">
                    <strong>{item.contactName}</strong>
                    <span className="scheduling-card__datetime">{formatSchedulingDateTime(item.scheduledAt)}</span>
                  </div>
                  <span className={`live-inbox-status-pill live-inbox-status-pill--${status.tone}`}>{status.label}</span>
                  <div className="scheduling-card__meta">
                    {item.priorityName?.trim() ? (
                      <span className="scheduling-meta-pill">{item.priorityName.trim()}</span>
                    ) : null}
                    {item.assignedAgentName?.trim() ? (
                      <span className="scheduling-meta-pill scheduling-meta-pill--muted">
                        {item.assignedAgentName.trim()}
                      </span>
                    ) : null}
                  </div>
                  <div className="live-inbox-tags">
                    {flowName ? (
                      <LabelTag name={flowName} color={resolveFlowLabelColor(item.sourceFlowLabel || flowName)} />
                    ) : null}
                    {Array.isArray(item.labels) && item.labels.length > 0
                      ? item.labels.map((label) => (
                          <LabelTag key={`${item.contactId}-${label.id}`} name={label.name} color={label.color} />
                        ))
                      : item.labelName?.trim()
                        ? (
                            <LabelTag
                              name={item.labelName.trim()}
                              color={item.labelColor || "#64748b"}
                            />
                          )
                        : null}
                  </div>
                </div>
                <button type="button" className="ghost-btn" onClick={() => onOpenContact(item.contactId)}>
                  Ver lead
                </button>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
