import { useCallback, useEffect, useState } from "react";

export type TenantPriorityRow = {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
  sortOrder: number;
  isDefault: boolean;
};

type TenantPrioritiesStepProps = {
  apiBase: string;
  tenantId: string;
  onStatusMessage: (message: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function TenantPrioritiesStep({
  apiBase,
  tenantId,
  onStatusMessage,
  onBack,
  onContinue,
}: TenantPrioritiesStepProps) {
  const [priorities, setPriorities] = useState<TenantPriorityRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadPriorities = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const response = await fetch(
        `${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/priorities`,
      );
      if (!response.ok) {
        onStatusMessage("Falha ao carregar prioridades.");
        setPriorities([]);
        return;
      }
      const rows = (await response.json()) as TenantPriorityRow[];
      setPriorities(Array.isArray(rows) ? rows : []);
    } catch {
      onStatusMessage("Falha ao carregar prioridades.");
      setPriorities([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, onStatusMessage, tenantId]);

  useEffect(() => {
    setDraftName("");
    setEditingId(null);
    void loadPriorities();
  }, [loadPriorities, tenantId]);

  async function createPriority() {
    const name = draftName.trim();
    if (name.length < 2) {
      onStatusMessage("Informe um nome com ao menos 2 caracteres.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(
        `${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/priorities`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        onStatusMessage(payload.message ?? "Falha ao criar prioridade.");
        return;
      }
      setDraftName("");
      onStatusMessage("Prioridade adicionada.");
      await loadPriorities();
    } catch {
      onStatusMessage("Falha ao criar prioridade.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(row: TenantPriorityRow) {
    setEditingId(row.id);
    setEditName(row.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(priorityId: string) {
    const name = editName.trim();
    if (name.length < 2) {
      onStatusMessage("Informe um nome com ao menos 2 caracteres.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(
        `${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/priorities/${encodeURIComponent(priorityId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        onStatusMessage(payload.message ?? "Falha ao atualizar prioridade.");
        return;
      }
      cancelEdit();
      onStatusMessage("Prioridade atualizada.");
      await loadPriorities();
    } catch {
      onStatusMessage("Falha ao atualizar prioridade.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removePriority(priorityId: string) {
    setIsSaving(true);
    try {
      const response = await fetch(
        `${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/priorities/${encodeURIComponent(priorityId)}`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 204) {
        onStatusMessage("Falha ao remover prioridade.");
        return;
      }
      if (editingId === priorityId) cancelEdit();
      onStatusMessage("Prioridade removida.");
      await loadPriorities();
    } catch {
      onStatusMessage("Falha ao remover prioridade.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="tenant-profile-card tenant-priorities-step">
      <h4>Etapa 4 — Prioridade</h4>
      <p className="muted muted-subtle">
        O sistema inicia com Alta, Média e Baixa. Edite os nomes padrão ou adicione novas prioridades para a fila e o
        CRM.
      </p>

      <div className="tenant-priorities-form">
        <div className="tenant-priorities-inline-row">
          <div className="tenant-priorities-inline-cell tenant-priorities-inline-cell--name">
            <label className="field-label field-label--primary" htmlFor="priority-name-new">
              Nome da prioridade
            </label>
            <input
              id="priority-name-new"
              placeholder="Ex.: Urgente, Normal, Baixa"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={48}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void createPriority();
                }
              }}
            />
          </div>
          <div className="tenant-priorities-inline-cell tenant-priorities-inline-cell--add">
            <span className="field-label field-label--primary" aria-hidden="true">
              &nbsp;
            </span>
            <button
              type="button"
              className="tenant-priorities-add-btn"
              onClick={() => void createPriority()}
              disabled={isSaving || isLoading}
            >
              {isSaving ? "Salvando…" : "Adicionar"}
            </button>
          </div>
        </div>
      </div>

      <div className="tenant-priorities-list">
        <h5>Prioridades cadastradas</h5>
        {isLoading ? (
          <p className="muted muted-subtle">
            <span className="processing-inline-wrap" aria-live="polite">
              <i className="processing-inline-dot" aria-hidden="true" />
              Carregando prioridades…
            </span>
          </p>
        ) : priorities.length === 0 ? (
          <p className="muted muted-subtle">Nenhuma prioridade cadastrada ainda.</p>
        ) : (
          <div className="saved-flows-table tenant-priorities-table">
            <div className="saved-flows-header tenant-priorities-header">
              <span>Prioridade</span>
              <span>Origem</span>
              <span>Ações</span>
            </div>
            {priorities.map((row) =>
              editingId === row.id ? (
                <div key={row.id} className="saved-flows-row tenant-priorities-row tenant-priorities-row--edit">
                  <input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={48} />
                  <span className="muted muted-subtle">{row.isDefault ? "Padrão do sistema" : "Personalizada"}</span>
                  <span className="flow-row-actions">
                    <button
                      type="button"
                      className="compact-action-btn compact-action-btn-success"
                      onClick={() => void saveEdit(row.id)}
                      disabled={isSaving}
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      className="compact-action-btn compact-action-btn-secondary"
                      onClick={cancelEdit}
                      disabled={isSaving}
                    >
                      Cancelar
                    </button>
                  </span>
                </div>
              ) : (
                <div key={row.id} className="saved-flows-row tenant-priorities-row">
                  <span className="tenant-priority-name">{row.name}</span>
                  <span>
                    {row.isDefault ? (
                      <span className="tenant-priority-badge">Padrão</span>
                    ) : (
                      <span className="muted muted-subtle">Personalizada</span>
                    )}
                  </span>
                  <span className="flow-row-actions">
                    <button
                      type="button"
                      className="compact-action-btn compact-action-btn-secondary"
                      onClick={() => startEdit(row)}
                      disabled={isSaving}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="compact-action-btn compact-action-btn-danger"
                      onClick={() => void removePriority(row.id)}
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
