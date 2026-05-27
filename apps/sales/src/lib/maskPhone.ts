/** Mantém só dígitos (máx. 11: DDD + celular BR). */
export const digitsFromPhone = (value: string): string => value.replace(/\D/g, "").slice(0, 11);

/** Máscara (XX) 9XXXX-XXXX */
export const maskBrazilMobileInput = (value: string): string => {
  const digits = digitsFromPhone(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const isValidBrazilMobileDigits = (digits: string): boolean =>
  digits.length === 11 && digits.charAt(2) === "9";
