import { useMemo, useState } from "react";
import {
  buildClientDirectoryRow,
  matchesClientDirectorySearch,
  matchesClientFlowFilter,
  matchesClientWhatsappFilter,
  type ClientDirectoryContact,
  type ClientWhatsappFilter,
} from "./clientDirectory";
import { LabelTag } from "./LabelTag";
import { ClientsTableScrollArea } from "./ClientsTableScrollArea";
import { LeadWhatsappOpenButton } from "./LeadWhatsappOpenButton";
import { downloadClientDirectoryExcel } from "./exportClientDirectoryExcel";

type ClientsListScreenProps = {
  contacts: ClientDirectoryContact[];
  onOpenContact: (contactId: string) => void;
};

const TABLE_COLUMNS = ["Nome", "CPF", "Fluxo/Produto", "Atualizado em", "Ações"] as const;

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
      if (row.flowProductName.trim()) labels.add(row.flowProductName);
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

  const hasActiveFilters = searchQuery.trim().length > 0 || flowFilter !== "all" || whatsappFilter !== "all";

  const handleExportClients = () => {
    void downloadClientDirectoryExcel(filteredRows, { usesFilters: hasActiveFilters });
  };

  return (
    <section className="card clients-list-card" data-build="20260520-clients-labels-v4">
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
          placeholder="Pesquisar por Nome, CPF, Fluxo/Produto ou Etiqueta"
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

      <ClientsTableScrollArea>
        <table className="clients-table">
          <thead>
            <tr>
              {TABLE_COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={column === "Ações" ? "clients-table-col-actions" : undefined}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.contactId}>
                <td className="clients-table-cell-name">
                  <div className="clients-table-name-cell">
                    <span className="clients-table-name">{row.contactName || "-"}</span>
                    {row.leadLabels.length > 0 ? (
                      <span className="clients-table-labels">
                        {row.leadLabels.map((label) => (
                          <LabelTag key={`${row.contactId}-${label.id}`} name={label.name} color={label.color} />
                        ))}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>{row.cpf || "-"}</td>
                <td>{row.flowProductName || "-"}</td>
                <td>{formatClientDate(row.updatedAt)}</td>
                <td className="clients-table-col-actions">
                  <div className="clients-table-actions">
                    {row.whatsapp ? (
                      <LeadWhatsappOpenButton
                        phoneRaw={row.whatsapp}
                        contactName={row.contactName}
                        className="clients-table-whatsapp-btn"
                      />
                    ) : (
                      <span className="clients-table-action-spacer" aria-hidden="true" />
                    )}
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ClientsTableScrollArea>

      {filteredRows.length === 0 ? (
        <p className="muted">Nenhum cliente encontrado para os filtros aplicados.</p>
      ) : null}
    </section>
  );
}
