/** Formata data local em YYYY-MM-DD (sem conversão UTC). */
export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const addCalendarDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const addCalendarMonths = (date: Date, months: number): Date => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const isBrazilianHoliday = (date: Date): boolean => {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const fixed = new Set([
    "1-1",
    "4-21",
    "5-1",
    "9-7",
    "10-12",
    "11-2",
    "11-15",
    "12-25",
  ]);
  return fixed.has(`${month}-${day}`);
};

export const isBusinessDay = (date: Date): boolean => {
  const weekDay = date.getDay();
  if (weekDay === 0 || weekDay === 6) return false;
  return !isBrazilianHoliday(date);
};

export const addBusinessDays = (date: Date, businessDays: number): Date => {
  const cursor = new Date(date);
  let remaining = businessDays;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor)) remaining -= 1;
  }
  return cursor;
};

export const countBusinessDaysBetween = (from: Date, to: Date): number => {
  const start = new Date(from);
  const end = new Date(to);
  if (end <= start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor)) count += 1;
  }
  return count;
};

/** Asaas exige criar cobrança Pix Automático entre 2 e 10 dias úteis antes do vencimento. */
export const isWithinPixAutomaticInstructionWindow = (dueDate: Date, now = new Date()): boolean => {
  const businessDays = countBusinessDaysBetween(now, dueDate);
  return businessDays >= 2 && businessDays <= 10;
};

export const formatDueDateDaysAhead = (daysAhead: number): string =>
  formatLocalDate(addCalendarDays(new Date(), daysAhead));
