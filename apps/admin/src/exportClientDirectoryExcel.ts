import { collectClientDirectoryColumnKeys, type ClientDirectoryRow } from "./clientDirectory";

const formatClientDateForExport = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("pt-BR");
};

const buildClientDirectoryExportHeader = (rows: ClientDirectoryRow[]): string[] => {
  const showTenantColumn = rows.some((row) => row.tenantName.trim().length > 0);
  const showCpfColumn = rows.some((row) => row.cpf.trim().length > 0);
  const dynamicColumns = collectClientDirectoryColumnKeys(rows);
  const header = ["Nome"];
  if (showTenantColumn) header.push("Assinante");
  header.push("WhatsApp");
  if (showCpfColumn) header.push("CPF");
  header.push("Fluxo/Produto", "Atendente", "Atualizado em", ...dynamicColumns);
  return header;
};

const buildClientDirectoryExportRows = (rows: ClientDirectoryRow[], headers: string[]): string[][] => {
  const showTenantColumn = headers.includes("Assinante");
  const showCpfColumn = headers.includes("CPF");
  const dynamicColumns = headers.slice((showTenantColumn ? 1 : 0) + (showCpfColumn ? 1 : 0) + 5);

  return rows.map((row) => {
    const values = [row.contactName || ""];
    if (showTenantColumn) values.push(row.tenantName || "");
    values.push(row.whatsapp || "");
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

const createClientDirectoryExportFileName = (usesFilters?: boolean): string => {
  const datePart = new Date().toISOString().slice(0, 10);
  const uniqueId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const filterPart = usesFilters ? "-filtrado" : "";
  return `clientes-${datePart}-${uniqueId}${filterPart}.xlsx`;
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

  XLSX.writeFile(workbook, createClientDirectoryExportFileName(options?.usesFilters));
};
