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
import { downloadClientDirectoryExcel } from "./exportClientDirectoryExcel";
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
  const showTenantColumn = useMemo(() => rows.some((row) => row.tenantName.trim().length > 0), [rows]);

  const tableColumns = useMemo(() => {
    const columns = ["Nome"];
    if (showTenantColumn) columns.push("Assinante");
    columns.push("WhatsApp");
    if (showCpfColumn) columns.push("CPF");
    columns.push("Fluxo/Produto", "Atendente", "Atualizado em", ...dynamicColumns, "Ações");
    return columns;
  }, [dynamicColumns, showCpfColumn, showTenantColumn]);

  const hasActiveFilters = searchQuery.trim().length > 0 || flowFilter !== "all" || whatsappFilter !== "all";

  const handleExportClients = () => {
    void downloadClientDirectoryExcel(filteredRows, { usesFilters: hasActiveFilters });
  };

  return (
    <section className="card clients-list-card">
      <div className="section-title-row">
        <h3>Lista de Clientes</h3>
        <button
          type="button"
          className="filter-btn clients-list-export-btn"
          onClick={handleExportClients}
          disabled={filteredRows.length === 0}
          title={
            hasActiveFilters
              ? "Exportar clientes filtrados para Excel"
              : "Exportar lista completa de clientes para Excel"
          }
        >
          Exportar Excel
        </button>
      </div>
      <div className="clients-list-toolbar">
        <input
          className="clients-list-search"
          type="search"
          placeholder={
            showTenantColumn
              ? "Pesquisar por Nome, Assinante, Atendente, WhatsApp ou CPF"
              : "Pesquisar por Nome, WhatsApp ou CPF"
          }
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
        <table className="clients-table">
          <thead>
            <tr>
              {tableColumns.map((column, columnIndex) => (
                <th
                  key={column}
                  scope="col"
                  className={columnIndex === tableColumns.length - 1 ? "clients-table-col-actions" : undefined}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.contactId}>
                <td>{row.contactName || "-"}</td>
                {showTenantColumn ? <td>{row.tenantName || "-"}</td> : null}
                <td>{row.whatsapp || "-"}</td>
                {showCpfColumn ? <td>{row.cpf || "-"}</td> : null}
                <td>{row.sourceFlowLabel || "-"}</td>
                <td>{row.assignedAgentName || "-"}</td>
                <td>{formatClientDate(row.updatedAt)}</td>
                {dynamicColumns.map((column) => (
                  <td key={`${row.contactId}-${column}`}>{row.fieldValues[column] ?? ""}</td>
                ))}
                <td className="clients-table-col-actions">
                  <button
                    type="button"
                    className="queue-icon-btn clients-table-action-btn"
                    onClick={() => onOpenContact(row.contactId)}
                    title={`Ver detalhes de ${row.contactName || "cliente"}`}
                    aria-label={`Ver detalhes de ${row.contactName || "cliente"}`}
                  >
                    <svg className="queue-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path
                        d="M11 4a7 7 0 1 0 4.384 12.46l3.578 3.579a1 1 0 0 0 1.414-1.415l-3.578-3.578A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredRows.length === 0 ? (
        <p className="muted">Nenhum cliente encontrado para os filtros aplicados.</p>
      ) : null}
    </section>
  );
}
