const normalizeDigits = (value: string): string => value.replace(/\D/g, "");

/**
 * Formato esperado pelo Asaas em `mobilePhone`: DDD + número, só dígitos (ex.: 11999999999).
 * @see https://docs.asaas.com/reference/criar-novo-cliente
 */
export const formatBrazilMobileForAsaas = (raw: string): string => {
  let digits = normalizeDigits(raw);
  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.length !== 11 || digits.charAt(2) !== "9") {
    throw new Error("Informe um celular válido com DDD (ex.: (11) 99999-9999).");
  }
  return digits;
};
