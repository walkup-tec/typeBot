const PLACEHOLDER_VALUES = new Set(["-", "—", "null", "undefined", "n/a", "na"]);

export const hasMeaningfulLeadContextValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);

  const normalized = String(value).trim();
  if (!normalized) return false;
  return !PLACEHOLDER_VALUES.has(normalized.toLowerCase());
};

export const pruneLeadContext = (
  leadContext?: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> | undefined => {
  if (!leadContext || typeof leadContext !== "object") return undefined;

  const next = Object.fromEntries(
    Object.entries(leadContext).filter(
      ([key, value]) => String(key).trim() && hasMeaningfulLeadContextValue(value),
    ),
  );

  return Object.keys(next).length > 0 ? next : undefined;
};

export const getLeadContextEntries = (
  leadContext?: Record<string, string | number | boolean>,
): Array<[string, string | number | boolean]> => Object.entries(pruneLeadContext(leadContext) ?? {});
