import { useCallback, useEffect, useState } from "react";
import { normalizeLabelColorInput, toColorPickerValue } from "./labelColor";

export type TenantLabelRow = {
  id: string;
  tenantId: string;
  name: string;
  color: string;
  createdAt: string;
  sortOrder: number;
};

type TenantLabelsStepProps = {
  apiBase: string;
  tenantId: string;
  onStatusMessage: (message: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

const DEFAULT_NEW_COLOR = "#14B8A6";

export function TenantLabelsStep({ apiBase, tenantId, onStatusMessage, onBack, onContinue }: TenantLabelsStepProps) {
  const [labels, setLabels] = useState<TenantLabelRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState(DEFAULT_NEW_COLOR);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(DEFAULT_NEW_COLOR);

  const loadLabels = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/labels`);
      if (!response.ok) {
        onStatusMessage("Falha ao carregar etiquetas.");
        setLabels([]);
        return;
      }
      const rows = (await response.json()) as TenantLabelRow[];
      setLabels(Array.isArray(rows) ? rows : []);
    } catch {
      onStatusMessage("Falha ao carregar etiquetas.");
      setLabels([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, onStatusMessage, tenantId]);

  useEffect(() => {
    setDraftName("");
    setDraftColor(DEFAULT_NEW_COLOR);
    setEditingId(null);
    void loadLabels();
  }, [loadLabels, tenantId]);

  const applyDraftColor = (raw: string) => {
    const normalized = normalizeLabelColorInput(raw);
    if (normalized) {
      setDraftColor(normalized);
    }
  };

  const applyEditColor = (raw: string) => {
    const normalized = normalizeLabelColorInput(raw);
    if (normalized) {
      setEditColor(normalized);
    }
  };

  async function createLabel() {
    const name = draftName.trim();
    const color = normalizeLabelColorInput(draftColor);
    if (name.length < 2) {
      onStatusMessage("Informe um nome com ao menos 2 caracteres.");
      return;
    }
    if (!color) {
      onStatusMessage("Selecione uma cor válida para a etiqueta.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/labels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        onStatusMessage(payload.message ?? "Falha ao criar etiqueta.");
        return;
      }
      setDraftName("");
      setDraftColor(DEFAULT_NEW_COLOR);
      onStatusMessage("Etiqueta criada.");
      await loadLabels();
    } catch {
      onStatusMessage("Falha ao criar etiqueta.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(row: TenantLabelRow) {
    setEditingId(row.id);
    setEditName(row.name);
    setEditColor(row.color);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditColor(DEFAULT_NEW_COLOR);
  }

  async function saveEdit(labelId: string) {
    const name = editName.trim();
    const color = normalizeLabelColorInput(editColor);
    if (name.length < 2) {
      onStatusMessage("Informe um nome com ao menos 2 caracteres.");
      return;
    }
    if (!color) {
      onStatusMessage("Selecione uma cor válida para a etiqueta.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(
        `${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/labels/${encodeURIComponent(labelId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, color }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        onStatusMessage(payload.message ?? "Falha ao atualizar etiqueta.");
        return;
      }
      cancelEdit();
      onStatusMessage("Etiqueta atualizada.");
      await loadLabels();
    } catch {
      onStatusMessage("Falha ao atualizar etiqueta.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeLabel(labelId: string) {
    setIsSaving(true);
    try {
      const response = await fetch(
        `${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/labels/${encodeURIComponent(labelId)}`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 204) {
        onStatusMessage("Falha ao remover etiqueta.");
        return;
      }
      if (editingId === labelId) cancelEdit();
      onStatusMessage("Etiqueta removida.");
      await loadLabels();
    } catch {
      onStatusMessage("Falha ao remover etiqueta.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="tenant-profile-card tenant-labels-step">
      <h4>Etapa 3 — Etiquetas</h4>
      <p className="muted muted-subtle">
        Defina o nome e a cor de cada etiqueta. Use o seletor visual ou informe qualquer cor em hexadecimal.
      </p>

      <div className="tenant-labels-form">
        <label className="field-label field-label--primary" htmlFor="label-name-new">
          Nome da etiqueta
        </label>
        <input
          id="label-name-new"
          placeholder="Ex.: Urgente, Retorno, VIP"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          maxLength={48}
        />

        <span className="field-label field-label--primary">Cor da etiqueta</span>
        <div className="label-color-picker-row">
          <label className="label-color-picker-wrap" title="Abrir seletor de cores">
            <input
              type="color"
              className="label-color-picker-input"
              value={toColorPickerValue(draftColor)}
              onChange={(event) => applyDraftColor(event.target.value)}
              aria-label="Seletor de cor da etiqueta"
            />
            <span className="label-color-picker-swatch" style={{ backgroundColor: toColorPickerValue(draftColor) }} />
            <span className="label-color-picker-hint">Escolher cor</span>
          </label>
          <div className="label-color-hex-field">
            <label className="sr-only" htmlFor="label-color-hex-new">
              Código hexadecimal
            </label>
            <input
              id="label-color-hex-new"
              value={draftColor}
              onChange={(event) => setDraftColor(event.target.value)}
              onBlur={() => applyDraftColor(draftColor)}
              placeholder="#14B8A6"
              spellCheck={false}
              maxLength={9}
            />
          </div>
          <span
            className="label-preview-chip"
            style={{
              backgroundColor: toColorPickerValue(draftColor),
              color: "#0f172a",
            }}
          >
            {draftName.trim() || "Prévia"}
          </span>
        </div>

        <button type="button" onClick={() => void createLabel()} disabled={isSaving || isLoading}>
          {isSaving ? "Salvando…" : "Adicionar etiqueta"}
        </button>
      </div>

      <div className="tenant-labels-list">
        <h5>Etiquetas cadastradas</h5>
        {isLoading ? (
          <p className="muted muted-subtle">
            <span className="processing-inline-wrap" aria-live="polite">
              <i className="processing-inline-dot" aria-hidden="true" />
              Carregando etiquetas…
            </span>
          </p>
        ) : labels.length === 0 ? (
          <p className="muted muted-subtle">Nenhuma etiqueta cadastrada ainda.</p>
        ) : (
          <div className="saved-flows-table tenant-labels-table">
            <div className="saved-flows-header tenant-labels-header">
              <span>Cor</span>
              <span>Nome</span>
              <span>Ações</span>
            </div>
            {labels.map((row) =>
              editingId === row.id ? (
                <div key={row.id} className="saved-flows-row tenant-labels-row tenant-labels-row--edit">
                  <span className="label-color-picker-row label-color-picker-row--compact">
                    <label className="label-color-picker-wrap" title="Alterar cor">
                      <input
                        type="color"
                        className="label-color-picker-input"
                        value={toColorPickerValue(editColor)}
                        onChange={(event) => applyEditColor(event.target.value)}
                        aria-label={`Cor da etiqueta ${row.name}`}
                      />
                      <span
                        className="label-color-picker-swatch"
                        style={{ backgroundColor: toColorPickerValue(editColor) }}
                      />
                    </label>
                    <input
                      value={editColor}
                      onChange={(event) => setEditColor(event.target.value)}
                      onBlur={() => applyEditColor(editColor)}
                      className="label-color-hex-inline"
                      maxLength={9}
                      spellCheck={false}
                    />
                  </span>
                  <input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={48} />
                  <span className="flow-row-actions">
                    <button type="button" className="compact-action-btn compact-action-btn-success" onClick={() => void saveEdit(row.id)} disabled={isSaving}>
                      Salvar
                    </button>
                    <button type="button" className="compact-action-btn compact-action-btn-secondary" onClick={cancelEdit} disabled={isSaving}>
                      Cancelar
                    </button>
                  </span>
                </div>
              ) : (
                <div key={row.id} className="saved-flows-row tenant-labels-row">
                  <span>
                    <span className="label-swatch-dot" style={{ backgroundColor: row.color }} title={row.color} />
                    <code className="label-hex-code">{row.color}</code>
                  </span>
                  <span>
                    <span className="label-preview-chip label-preview-chip--table" style={{ backgroundColor: row.color }}>
                      {row.name}
                    </span>
                  </span>
                  <span className="flow-row-actions">
                    <button type="button" className="compact-action-btn compact-action-btn-secondary" onClick={() => startEdit(row)} disabled={isSaving}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="compact-action-btn compact-action-btn-danger"
                      onClick={() => void removeLabel(row.id)}
                      disabled={isSaving}
                    >
                      Remover
                    </button>
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <div className="wizard-step-actions">
        <button type="button" className="ghost-btn" onClick={onBack}>
          Voltar
        </button>
        <button type="button" onClick={onContinue}>
          Continuar
        </button>
      </div>
    </div>
  );
}
