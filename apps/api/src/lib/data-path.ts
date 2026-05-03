import { resolve } from "node:path";

/**
 * Resolve arquivos de dados sempre dentro de `apps/api/data`,
 * independentemente do diretório em que o processo foi iniciado.
 */
export const getDataFilePath = (filename: string) => {
  return resolve(__dirname, "..", "..", "data", filename);
};
