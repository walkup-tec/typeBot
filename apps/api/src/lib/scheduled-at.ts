/** Converte valor de agendamento (ISO ou datetime-local) para ISO UTC persistível. */
export const normalizeScheduledAtStorage = (raw: string): string | undefined => {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return undefined;

  const isDatetimeLocal =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(trimmed) &&
    !trimmed.endsWith("Z") &&
    !/[+-]\d{2}:?\d{2}$/.test(trimmed);

  const parsed = isDatetimeLocal ? new Date(`${trimmed}:00-03:00`) : new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};
