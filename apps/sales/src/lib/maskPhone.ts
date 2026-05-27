const digitsOnly = (value: string): string => value.replace(/\D/g, "");

/** Extrai até 11 dígitos (DDD + celular), removendo código do país 55 se colado. */
export const digitsFromPhone = (value: string): string => {
  let digits = digitsOnly(value);
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 11);
};

/**
 * Máscara celular BR: (XX) 9XXXX-XXXX
 * Aceita colar com ou sem +55 / pontuação.
 */
export function maskBrazilMobileInput(raw: string): string {
  const d = digitsFromPhone(raw);
  if (d.length === 0) return "";
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const isValidBrazilMobileDigits = (digits: string): boolean =>
  digits.length === 11 && digits.charAt(2) === "9";
