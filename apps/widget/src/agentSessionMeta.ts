type ServiceMessage = {
  sender?: string;
  content?: string;
  createdAt?: string;
};

type QueueContactLike = {
  status?: string;
  updatedAt?: string;
};

export const resolveServiceStartedAt = (
  messages: ServiceMessage[] | null | undefined,
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
