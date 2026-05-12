import { useMemo, useState } from "react";
import {
  buildClientDirectoryRow,
  collectClientDirectoryColumnKeys,
  matchesClientDirectorySearch,
  matchesClientFlowFilter,
  matchesClientWhatsappFilter,
  type ClientDirectoryContact,
  type ClientWhatsappFilter,
} from "./clientDirectory";

type ClientsListScreenProps = {
  contacts: ClientDirectoryContact[];
  onOpenContact: (contactId: string) => void;
};

const formatClientDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
};

export function ClientsListScreen({ contacts, onOpenContact }: ClientsListScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [flowFilter, setFlowFilter] = useState("all");
  const [whatsappFilter, setWhatsappFilter] = useState<ClientWhatsappFilter>("all");

  const rows = useMemo(() => contacts.map((contact) => buildClientDirectoryRow(contact)), [contacts]);

  const flowOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const row of rows) {
      if (row.sourceFlowLabel.trim()) labels.add(row.sourceFlowLabel);
    }
    return [...labels].sort((left, right) => left.localeCompare(right, "pt-BR", { sensitivity: "base" }));
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesClientDirectorySearch(row, searchQuery) &&
          matchesClientFlowFilter(row, flowFilter) &&
          matchesClientWhatsappFilter(row, whatsappFilter),
      ),
    [rows, searchQuery, flowFilter, whatsappFilter],
  );

  const dynamicColumns = useMemo(() => collectClientDirectoryColumnKeys(filteredRows), [filteredRows]);
  const showCpfColumn = useMemo(() => rows.some((row) => row.cpf.trim().length > 0), [rows]);

  const tableColumns = useMemo(() => {
    const columns = ["Nome", "WhatsApp"];
    if (showCpfColumn) columns.push("CPF");
    columns.push("Fluxo/Produto", "Atendente", "Atualizado em", ...dynamicColumns, "Ações");
    return columns;
  }, [dynamicColumns, showCpfColumn]);

  const tableGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${tableColumns.length}, minmax(140px, 1fr))`,
    }),
    [tableColumns.length],
  );

  const hasActiveFilters = searchQuery.trim().length > 0 || flowFilter !== "all" || whatsappFilter !== "all";

  return (
    <section className="card clients-list-card">
      <div className="section-title-row">
        <h3>Lista de Clientes</h3>
      </div>

      <div className="clients-list-toolbar">
        <input
          className="clients-list-search"
          type="search"
          placeholder="Pesquisar por Nome, WhatsApp ou CPF"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="Pesquisar clientes"
        />

        <label className="clients-list-filter">
          <span>Fluxo/Produto</span>
          <select value={flowFilter} onChange={(event) => setFlowFilter(event.target.value)}>
            <option value="all">Todos</option>
            {flowOptions.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="clients-list-filter">
          <span>WhatsApp</span>
          <select
            value={whatsappFilter}
            onChange={(event) => setWhatsappFilter(event.target.value as ClientWhatsappFilter)}
          >
            <option value="all">Todos</option>
            <option value="with">Com WhatsApp</option>
            <option value="without">Sem WhatsApp</option>
          </select>
        </label>

        {hasActiveFilters ? (
          <button
            type="button"
            className="filter-btn clear clients-list-clear"
            onClick={() => {
              setSearchQuery("");
              setFlowFilter("all");
              setWhatsappFilter("all");
            }}
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      <p className="muted clients-list-summary">
        {filteredRows.length} cliente(s) exibido(s) de {rows.length} atendido(s).
      </p>

      <div className="clients-table-wrap">
        <div className="table clients-table">
          <div className="table-row table-header clients-table-row" style={tableGridStyle}>
            {tableColumns.map((column) => (
              <span key={column}>{column}</span>
            ))}
          </div>

          {filteredRows.map((row) => (
            <div key={row.contactId} className="table-row clients-table-row" style={tableGridStyle}>
              <span>{row.contactName || "-"}</span>
              <span>{row.whatsapp || "-"}</span>
              {showCpfColumn ? <span>{row.cpf || "-"}</span> : null}
              <span>{row.sourceFlowLabel || "-"}</span>
              <span>{row.assignedAgentName || "-"}</span>
              <span>{formatClientDate(row.updatedAt)}</span>
              {dynamicColumns.map((column) => (
                <span key={`${row.contactId}-${column}`}>{row.fieldValues[column] ?? ""}</span>
              ))}
              <span className="clients-table-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onOpenContact(row.contactId)}
                  aria-label={`Ver detalhes de ${row.contactName || "cliente"}`}
                >
                  Ver detalhes
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <p className="muted">Nenhum cliente encontrado para os filtros aplicados.</p>
      ) : null}
    </section>
  );
}
