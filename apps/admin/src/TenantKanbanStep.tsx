import { useCallback, useEffect, useMemo, useState } from "react";
import { KanbanBoardPreview } from "./KanbanBoardPreview";
import type { TenantLabelRow } from "./TenantLabelsStep";
import type { TenantPriorityRow } from "./TenantPrioritiesStep";
import {
  KANBAN_CUSTOM_COLUMN_MAX,
  KANBAN_CUSTOM_COLUMN_MIN,
  KANBAN_ORGANIZE_OPTIONS,
  type KanbanOrganizeBy,
  type TenantKanbanConfig,
  defaultKanbanConfig,
  resizeCustomColumnNames,
  resolveKanbanColumnTitles,
} from "./kanbanConfig";

type TenantKanbanStepProps = {
  apiBase: string;
  tenantId: string;
  onStatusMessage: (message: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function TenantKanbanStep({ apiBase, tenantId, onStatusMessage, onBack, onContinue }: TenantKanbanStepProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [organizeBy, setOrganizeBy] = useState<KanbanOrganizeBy>("priority");
  const [customColumnCount, setCustomColumnCount] = useState(3);
  const [customColumnNames, setCustomColumnNames] = useState<string[]>(["Novo lead", "Em atendimento", "Fechado"]);
  const [priorities, setPriorities] = useState<TenantPriorityRow[]>([]);
  const [labels, setLabels] = useState<TenantLabelRow[]>([]);

  const loadReferenceData = useCallback(async () => {
    const [prioritiesRes, labelsRes, configRes] = await Promise.all([
      fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/priorities`),
      fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/labels`),
      fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/kanban-config`),
    ]);

    if (prioritiesRes.ok) {
      const rows = (await prioritiesRes.json()) as TenantPriorityRow[];
      setPriorities(Array.isArray(rows) ? rows : []);
    } else {
      setPriorities([]);
    }

    if (labelsRes.ok) {
      const rows = (await labelsRes.json()) as TenantLabelRow[];
      setLabels(Array.isArray(rows) ? rows : []);
    } else {
      setLabels([]);
    }

    if (configRes.ok) {
      const config = (await configRes.json()) as TenantKanbanConfig;
      setOrganizeBy(config.organizeBy ?? "priority");
      if (config.organizeBy === "custom" && config.customColumns.length > 0) {
        setCustomColumnNames(config.customColumns.map((col) => col.name));
        setCustomColumnCount(config.customColumns.length);
      }
    } else {
      setOrganizeBy(defaultKanbanConfig(tenantId).organizeBy);
    }
  }, [apiBase, tenantId]);

  useEffect(() => {
    setIsLoading(true);
    void loadReferenceData()
      .catch(() => onStatusMessage("Falha ao carregar configuração do Kanban."))
      .finally(() => setIsLoading(false));
  }, [loadReferenceData, onStatusMessage]);

  const previewColumns = useMemo(
    () => resolveKanbanColumnTitles(organizeBy, customColumnNames, priorities, labels),
    [organizeBy, customColumnNames, priorities, labels],
  );

  function handleOrganizeChange(next: KanbanOrganizeBy) {
    setOrganizeBy(next);
    if (next === "custom" && customColumnNames.length < KANBAN_CUSTOM_COLUMN_MIN) {
      setCustomColumnNames(resizeCustomColumnNames([], customColumnCount));
    }
  }

  function handleColumnCountChange(raw: string) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    const safe = Math.max(KANBAN_CUSTOM_COLUMN_MIN, Math.min(KANBAN_CUSTOM_COLUMN_MAX, parsed));
    setCustomColumnCount(safe);
    setCustomColumnNames((current) => resizeCustomColumnNames(current, safe));
  }

  function updateCustomColumnName(index: number, value: string) {
    setCustomColumnNames((current) => current.map((name, i) => (i === index ? value : name)));
  }

  async function saveConfig(): Promise<boolean> {
    if (organizeBy === "custom") {
      const trimmed = customColumnNames.map((name) => name.trim());
      if (trimmed.some((name) => name.length < 2)) {
        onStatusMessage("Cada coluna personalizada precisa de ao menos 2 caracteres.");
        return false;
      }
      const keys = trimmed.map((name) => name.toLowerCase());
      if (new Set(keys).size !== keys.length) {
        onStatusMessage("Os nomes das colunas personalizadas devem ser únicos.");
        return false;
      }
    }

    setIsSaving(true);
    try {
      const body =
        organizeBy === "custom"
          ? {
              organizeBy,
              customColumns: customColumnNames.map((name, index) => ({
                name: name.trim(),
                sortOrder: index,
              })),
            }
          : { organizeBy, customColumns: [] };

      const response = await fetch(
        `${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/kanban-config`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        onStatusMessage(payload.message ?? "Falha ao salvar configuração do Kanban.");
        return false;
      }
      onStatusMessage("Configuração do Kanban salva.");
      return true;
    } catch {
      onStatusMessage("Falha ao salvar configuração do Kanban.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleContinue() {
    const saved = await saveConfig();
    if (!saved) return;
    onContinue();
  }

  return (
    <div className="tenant-profile-card tenant-kanban-step">
      <h4>Etapa 5 — Kanban</h4>
      <p className="muted muted-subtle">
        Escolha como as colunas do quadro serão organizadas. A prévia abaixo reflete a configuração em tempo real.
      </p>

      {isLoading ? (
        <p className="muted muted-subtle">
          <span className="processing-inline-wrap" aria-live="polite">
            <i className="processing-inline-dot" aria-hidden="true" />
            Carregando configuração…
          </span>
        </p>
      ) : (
        <>
          <fieldset className="kanban-organize-fieldset">
            <legend className="field-label field-label--primary">Organizar o Kanban por</legend>
            <div className="kanban-organize-options">
              {KANBAN_ORGANIZE_OPTIONS.map((option) => (
                <label key={option.value} className="kanban-organize-option">
                  <input
                    type="radio"
                    name="kanban-organize-by"
                    value={option.value}
                    checked={organizeBy === option.value}
                    onChange={() => handleOrganizeChange(option.value)}
                  />
                  <span className="kanban-organize-option__body">
                    <strong>{option.label}</strong>
                    <span className="muted muted-subtle">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {organizeBy === "custom" ? (
            <div className="kanban-custom-config">
              <div className="kanban-custom-count">
                <label className="field-label field-label--primary" htmlFor="kanban-column-count">
                  Quantidade de colunas
                </label>
                <select
                  id="kanban-column-count"
                  value={customColumnCount}
                  onChange={(event) => handleColumnCountChange(event.target.value)}
                >
                  {Array.from({ length: KANBAN_CUSTOM_COLUMN_MAX - KANBAN_CUSTOM_COLUMN_MIN + 1 }, (_, offset) => {
                    const value = KANBAN_CUSTOM_COLUMN_MIN + offset;
                    return (
                      <option key={value} value={value}>
                        {value} colunas
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="kanban-custom-names">
                <span className="field-label field-label--primary">Nome de cada coluna</span>
                <div className="kanban-custom-names-grid">
                  {customColumnNames.map((name, index) => (
                    <label key={`col-${index}`} className="kanban-custom-name-field">
                      <span className="kanban-custom-name-field__label">Coluna {index + 1}</span>
                      <input
                        value={name}
                        onChange={(event) => updateCustomColumnName(index, event.target.value)}
                        placeholder={`Etapa ${index + 1}`}
                        maxLength={48}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <KanbanBoardPreview columnTitles={previewColumns} organizeBy={organizeBy} compact />

          <div className="kanban-step-secondary-actions">
            <button type="button" className="ghost-btn" onClick={() => void saveConfig()} disabled={isSaving}>
              {isSaving ? "Salvando…" : "Salvar configuração"}
            </button>
          </div>
        </>
      )}

      <div className="wizard-step-actions">
        <button type="button" className="ghost-btn" onClick={onBack} disabled={isSaving}>
          Voltar
        </button>
        <button type="button" onClick={() => void handleContinue()} disabled={isSaving || isLoading}>
          Continuar
        </button>
      </div>
    </div>
  );
}
