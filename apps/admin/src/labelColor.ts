const HEX_COLOR_PATTERN = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

export const normalizeLabelColorInput = (value: string): string | null => {
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null;
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return trimmed.toUpperCase();
};

/** Valor aceito pelo `<input type="color">` (#RRGGBB). */
export const toColorPickerValue = (value: string): string => {
  const normalized = normalizeLabelColorInput(value);
  if (!normalized) return "#14B8A6";
  if (normalized.length === 9) return normalized.slice(0, 7);
  return normalized;
};
