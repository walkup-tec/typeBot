import { resolveKnownAttendantDisplayName } from "./knownAttendantDisplayName";

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

const finalizeAttendantLabel = (value: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return resolveKnownAttendantDisplayName(normalized) || normalized;
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
  if (direct) return finalizeAttendantLabel(direct);

  if (usernameKey && usernameKey === assignedAgentId) {
    const fromAssigned = useHumanName(assignedAgentName);
    if (fromAssigned) return finalizeAttendantLabel(fromAssigned);
  }

  if (usernameKey && usernameKey === sessionAgentId) {
    const fromSession = useHumanName(sessionAgentName);
    if (fromSession) return finalizeAttendantLabel(fromSession);
  }

  const knownFromUsername = resolveKnownAttendantDisplayName(username);
  if (knownFromUsername) return knownFromUsername;

  if (looksLikeEmail(username)) {
    const prefix = username.split("@")[0]?.trim();
    if (prefix) return finalizeAttendantLabel(prefix);
  }

  return finalizeAttendantLabel(username);
};
