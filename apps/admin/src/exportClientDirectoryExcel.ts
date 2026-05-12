import { collectClientDirectoryColumnKeys, type ClientDirectoryRow } from "./clientDirectory";

const formatClientDateForExport = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("pt-BR");
};

const buildClientDirectoryExportHeader = (rows: ClientDirectoryRow[]): string[] => {
  const showCpfColumn = rows.some((row) => row.cpf.trim().length > 0);
  const dynamicColumns = collectClientDirectoryColumnKeys(rows);
  const header = ["Nome", "WhatsApp"];
  if (showCpfColumn) header.push("CPF");
  header.push("Fluxo/Produto", "Atendente", "Atualizado em", ...dynamicColumns);
  return header;
};

const buildClientDirectoryExportRows = (rows: ClientDirectoryRow[], headers: string[]): string[][] => {
  const showCpfColumn = headers.includes("CPF");
  const dynamicColumns = headers.slice(showCpfColumn ? 6 : 5);

  return rows.map((row) => {
    const values = [row.contactName || "", row.whatsapp || ""];
    if (showCpfColumn) values.push(row.cpf || "");
    values.push(
      row.sourceFlowLabel || "",
      row.assignedAgentName || "",
      formatClientDateForExport(row.updatedAt),
    );
    for (const column of dynamicColumns) {
      values.push(row.fieldValues[column] ?? "");
    }
    return values;
  });
};

export const downloadClientDirectoryExcel = async (
  rows: ClientDirectoryRow[],
  options?: { usesFilters?: boolean },
): Promise<void> => {
  if (rows.length === 0) return;

  const XLSX = await import("xlsx");
  const headers = buildClientDirectoryExportHeader(rows);
  const data = buildClientDirectoryExportRows(rows, headers);
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

  const datePart = new Date().toISOString().slice(0, 10);
  const suffix = options?.usesFilters ? "-filtrado" : "";
  XLSX.writeFile(workbook, `clientes-${datePart}${suffix}.xlsx`);
};
