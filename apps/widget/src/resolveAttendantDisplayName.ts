export type AttendantLabelInput = {
  username: string;
  displayName?: string;
};

export type AttendantLabelHints = {
  assignedAgentId?: string;
  assignedAgentName?: string;
  sessionAgentId?: string;
  sessionAgentName?: string;
};

const looksLikeEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const useHumanName = (value: string): string => {
  const normalized = String(value ?? "").trim();
  return normalized && !looksLikeEmail(normalized) ? normalized : "";
};

export const resolveAttendantDisplayName = (
  attendant: AttendantLabelInput,
  hints: AttendantLabelHints = {},
): string => {
  const username = String(attendant.username ?? "").trim();
  const usernameKey = username.toLowerCase();
  const displayName = String(attendant.displayName ?? "").trim();
  const assignedAgentId = String(hints.assignedAgentId ?? "").trim().toLowerCase();
  const assignedAgentName = String(hints.assignedAgentName ?? "").trim();
  const sessionAgentId = String(hints.sessionAgentId ?? "").trim().toLowerCase();
  const sessionAgentName = String(hints.sessionAgentName ?? "").trim();

  const direct = useHumanName(displayName);
  if (direct) return direct;

  if (usernameKey && usernameKey === assignedAgentId) {
    const fromAssigned = useHumanName(assignedAgentName);
    if (fromAssigned) return fromAssigned;
  }

  if (usernameKey && usernameKey === sessionAgentId) {
    const fromSession = useHumanName(sessionAgentName);
    if (fromSession) return fromSession;
  }

  if (looksLikeEmail(username)) {
    const prefix = username.split("@")[0]?.trim();
    if (prefix) return prefix;
  }

  return username;
};
