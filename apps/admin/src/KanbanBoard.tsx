import type { KanbanBoardColumn, KanbanLeadCard } from "./kanbanBoardUtils";

type KanbanBoardProps = {
  columns: KanbanBoardColumn[];
  onOpenContact: (contactId: string) => void;
};

const STATUS_LABEL: Record<string, string> = {
  waiting: "Aguardando",
  in_service: "Em atendimento",
  closed: "Encerrado",
};

function KanbanLeadCardView({
  card,
  onOpen,
}: {
  card: KanbanLeadCard;
  onOpen: (contactId: string) => void;
}) {
  const statusLabel = STATUS_LABEL[card.status] ?? card.status;
  const statusClass =
    card.status === "in_service" ? "kanban-card__status--active" : card.status === "closed" ? "kanban-card__status--closed" : "";

  return (
    <button type="button" className="kanban-card" onClick={() => onOpen(card.contactId)}>
      <strong className="kanban-card__name">{card.contactName}</strong>
      {card.leadWhatsapp ? <span className="kanban-card__meta">{card.leadWhatsapp}</span> : null}
      <div className="kanban-card__footer">
        {card.assignedAgentName ? <span className="kanban-card__meta">{card.assignedAgentName}</span> : null}
        <span className={`kanban-card__status ${statusClass}`.trim()}>{statusLabel}</span>
      </div>
    </button>
  );
}

export function KanbanBoard({ columns, onOpenContact }: KanbanBoardProps) {
  if (columns.length === 0) {
    return (
      <p className="muted muted-subtle">
        Configure as colunas do Kanban no Master Console (etapa Kanban) para exibir o quadro.
      </p>
    );
  }

  return (
    <div className="kanban-board" role="region" aria-label="Quadro Kanban de leads">
      {columns.map(({ column, cards }) => (
        <article key={column.id} className="kanban-board__column">
          <header className="kanban-board__column-header">
            <span className="kanban-board__column-title">{column.name}</span>
            <span className="kanban-board__column-count">{cards.length}</span>
          </header>
          <div className="kanban-board__cards">
            {cards.length === 0 ? (
              <p className="kanban-board__empty muted-subtle">Nenhum lead nesta coluna</p>
            ) : (
              cards.map((card) => <KanbanLeadCardView key={card.contactId} card={card} onOpen={onOpenContact} />)
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
