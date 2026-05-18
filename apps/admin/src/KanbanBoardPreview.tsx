import type { KanbanOrganizeBy } from "./kanbanConfig";

type KanbanBoardPreviewProps = {
  columnTitles: string[];
  organizeBy: KanbanOrganizeBy;
  compact?: boolean;
};

const ORGANIZE_SUBTITLE: Record<KanbanOrganizeBy, string> = {
  priority: "Colunas geradas pelas prioridades do assinante",
  labels: "Colunas geradas pelas etiquetas do assinante",
  custom: "Colunas definidas por você",
};

export function KanbanBoardPreview({ columnTitles, organizeBy, compact = false }: KanbanBoardPreviewProps) {
  const titles = columnTitles.length > 0 ? columnTitles : ["Configure as colunas acima"];

  return (
    <div className={`kanban-preview${compact ? " kanban-preview--compact" : ""}`} aria-label="Prévia do quadro Kanban">
      <div className="kanban-preview__meta">
        <span className="kanban-preview__eyebrow">Prévia do Kanban</span>
        <span className="kanban-preview__subtitle">{ORGANIZE_SUBTITLE[organizeBy]}</span>
      </div>
      <div className="kanban-preview__board" role="presentation">
        {titles.map((title, index) => (
          <article key={`${title}-${index}`} className="kanban-preview__column">
            <header className="kanban-preview__column-header">
              <span className="kanban-preview__column-title">{title}</span>
              <span className="kanban-preview__column-count">0</span>
            </header>
            <div className="kanban-preview__cards">
              <div className="kanban-preview__card kanban-preview__card--ghost" />
              <div className="kanban-preview__card kanban-preview__card--ghost kanban-preview__card--short" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
