const digitsOnly = (value: string): string => value.replace(/\D/g, "");

/**
 * Máscara dinâmica: até 11 dígitos → CPF; 12–14 → CNPJ.
 * Aceita colar texto com pontuação; limita a 14 dígitos.
 */
export function maskCpfCnpjInput(raw: string): string {
  const d = digitsOnly(raw).slice(0, 14);
  if (d.length === 0) return "";

  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function digitsFromCpfCnpj(formatted: string): string {
  return digitsOnly(formatted);
}
