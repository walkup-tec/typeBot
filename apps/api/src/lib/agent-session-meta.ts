import type { LiveMessage } from "../queue/queue.repository";
import { resolveKnownAttendantDisplayName } from "./known-attendant-display-name";

type AttendantLabelInput = {
  username: string;
  displayName?: string;
};

type AttendantLabelHints = {
  assignedAgentId?: string;
  assignedAgentName?: string;
  sessionAgentId?: string;
  sessionAgentName?: string;
};

type QueueContactLike = {
  status?: string;
  updatedAt?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
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

export const resolveQueueContactAssignedAgentName = (
  contact: Pick<QueueContactLike, "assignedAgentId" | "assignedAgentName">,
  attendants?: ReadonlyArray<AttendantLabelInput>,
): string => {
  const assignedAgentId = String(contact.assignedAgentId ?? "").trim();
  if (!assignedAgentId) return "";

  const attendant = attendants?.find(
    (row) => String(row.username ?? "").trim().toLowerCase() === assignedAgentId.toLowerCase(),
  );

  return resolveAttendantDisplayName(
    {
      username: attendant?.username ?? assignedAgentId,
      displayName: attendant?.displayName ?? contact.assignedAgentName,
    },
    {
      assignedAgentId,
      assignedAgentName: contact.assignedAgentName,
    },
  );
};

export const resolveServiceStartedAt = (
  messages: LiveMessage[] | null | undefined,
  contact?: QueueContactLike | null,
): string => {
  const assignmentMessage = (messages ?? []).find(
    (item) =>
      item.sender === "system" && String(item.content ?? "").toLowerCase().includes("atendimento assumido"),
  );
  if (assignmentMessage?.createdAt) return assignmentMessage.createdAt;
  if (contact?.status === "in_service" && contact.updatedAt) return contact.updatedAt;
  return String(contact?.updatedAt ?? "").trim();
};

export const formatLocalizedDateTime = (value: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR");
};

export const formatAgentSessionMeta = (startedAt: string, agentName: string): string => {
  const formattedDate = formatLocalizedDateTime(startedAt);
  const normalizedAgent = String(agentName ?? "").trim();
  if (!formattedDate && !normalizedAgent) return "";
  if (!formattedDate) return `Atendente: ${normalizedAgent}`;
  if (!normalizedAgent) return `Atendimento iniciado em ${formattedDate}`;
  return `Atendimento iniciado em ${formattedDate} | Atendente: ${normalizedAgent}`;
};
