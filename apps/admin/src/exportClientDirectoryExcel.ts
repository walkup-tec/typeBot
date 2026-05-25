import type { ClientDirectoryRow } from "./clientDirectory";

const formatClientDateForExport = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("pt-BR");
};

const CLIENT_DIRECTORY_EXPORT_HEADERS = ["Nome", "CPF", "Fluxo/Produto", "Etiquetas", "Atualizado em"] as const;

const buildClientDirectoryExportRows = (rows: ClientDirectoryRow[]): string[][] =>
  rows.map((row) => [
    row.contactName || "",
    row.cpf || "",
    row.flowProductName || "",
    row.leadLabels.map((label) => label.name).join(", "),
    formatClientDateForExport(row.updatedAt),
  ]);

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
  const headers = [...CLIENT_DIRECTORY_EXPORT_HEADERS];
  const data = buildClientDirectoryExportRows(rows);
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

  XLSX.writeFile(workbook, createClientDirectoryExportFileName(options?.usesFilters));
};
