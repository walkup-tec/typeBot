const KNOWN_ATTENDANT_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "draxsistemas@gmail.com": "Drax Sistemas",
  draxsistemas: "Drax Sistemas",
  darsistemas: "Drax Sistemas",
};

export const resolveKnownAttendantDisplayName = (value: string): string => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";

  const direct = KNOWN_ATTENDANT_DISPLAY_NAMES[normalized];
  if (direct) return direct;

  if (normalized.includes("@")) {
    const localPart = normalized.split("@")[0] ?? "";
    const fromLocal = KNOWN_ATTENDANT_DISPLAY_NAMES[localPart];
    if (fromLocal) return fromLocal;
  }

  return "";
};
