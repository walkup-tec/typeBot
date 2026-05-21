import { useEffect, useMemo, useState } from "react";
import { LabelTag } from "./LabelTag";
import {
  countInboxContacts,
  filterInboxContacts,
  formatInboxRelativeTime,
  resolveCurrentAgentId,
  resolveFlowLabelColor,
  resolveInboxPreviewText,
  resolveInboxStatus,
  type LiveInboxTab,
  type QueueListItem,
} from "./liveInboxUtils";

type LiveInboxScreenProps = {
  apiBase: string;
  tenantId: string;
  contacts: QueueListItem[];
  authUsername?: string;
  authDisplayName?: string;
  agentId: string;
  noSeparateAttendants?: boolean;
  buildAgentChatUrl: (
    tenantId: string,
    contactId: string,
    agent: string,
    agentName?: string,
    contactName?: string,
    sourceFlowLabel?: string,
  ) => string;
  onRefreshQueue: () => Promise<void>;
  onStatusMessage: (message: string) => void;
  onOpenLeadDetail: (item: QueueListItem) => void;
};

export function LiveInboxScreen({
  apiBase,
  tenantId,
  contacts,
  authUsername,
  authDisplayName,
  agentId,
  noSeparateAttendants,
  buildAgentChatUrl,
  onRefreshQueue,
  onStatusMessage,
  onOpenLeadDetail,
}: LiveInboxScreenProps) {
  const [activeTab, setActiveTab] = useState<LiveInboxTab>("mine");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  /** Mantém o iframe aberto entre o clique em "Não atribuídas" e o refresh da fila. */
  const [pendingChatContactId, setPendingChatContactId] = useState<string | null>(null);

  const currentAgentId = useMemo(
    () => resolveCurrentAgentId(authUsername, agentId, noSeparateAttendants === true),
    [agentId, authUsername, noSeparateAttendants],
  );

  const tabCounts = useMemo(() => countInboxContacts(contacts, currentAgentId), [contacts, currentAgentId]);

  const filteredContacts = useMemo(
    () => filterInboxContacts(contacts, activeTab, currentAgentId),
    [activeTab, contacts, currentAgentId],
  );

  const selectedContact = useMemo(
    () => contacts.find((item) => item.contactId === selectedContactId) ?? null,
    [contacts, selectedContactId],
  );

  const chatUrl = useMemo(() => {
    if (!selectedContact) return "";
    const canOpenChat =
      selectedContact.status === "in_service" || pendingChatContactId === selectedContact.contactId;
    if (!canOpenChat) return "";
    return buildAgentChatUrl(
      tenantId,
      selectedContact.contactId,
      currentAgentId,
      authDisplayName || currentAgentId,
      selectedContact.contactName,
      selectedContact.sourceFlowLabel,
    );
  }, [authDisplayName, buildAgentChatUrl, currentAgentId, pendingChatContactId, selectedContact, tenantId]);

  useEffect(() => {
    if (!selectedContactId) return;
    if (filteredContacts.some((item) => item.contactId === selectedContactId)) return;

    const selected = contacts.find((item) => item.contactId === selectedContactId);
    if (!selected) {
      setSelectedContactId(filteredContacts[0]?.contactId ?? null);
      return;
    }

    if (selected.status === "in_service") {
      setActiveTab("mine");
      return;
    }
    if (selected.status === "waiting") {
      setActiveTab("unassigned");
      return;
    }
    if (selected.status === "closed") {
      setActiveTab("all");
    }
  }, [contacts, currentAgentId, filteredContacts, selectedContactId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const messageType = String(event.data?.type ?? "");
      if (messageType === "chattypebot-queue-ended") {
        void onRefreshQueue();
        return;
      }
      if (messageType === "chattypebot-queue-updated") {
        void onRefreshQueue();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onRefreshQueue, onStatusMessage, selectedContactId]);

  async function assignAndOpen(item: QueueListItem) {
    const resolvedAgentName = authDisplayName?.trim() || currentAgentId;
    setSelectedContactId(item.contactId);
    setPendingChatContactId(item.contactId);
    setActiveTab("mine");
    setIsAssigning(true);
    try {
      const response = await fetch(`${apiBase}/api/chat/queue/${encodeURIComponent(item.contactId)}/assign`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({ agentId: currentAgentId, agentName: resolvedAgentName }),
      });
      if (!response.ok) {
        setPendingChatContactId(null);
        onStatusMessage("Não foi possível assumir o atendimento.");
        return;
      }
      await onRefreshQueue();
    } catch {
      setPendingChatContactId(null);
      onStatusMessage("Não foi possível assumir o atendimento.");
    } finally {
      setIsAssigning(false);
      setPendingChatContactId(null);
    }
  }

  async function handleSelectConversation(item: QueueListItem) {
    if (item.status === "closed") {
      setSelectedContactId(item.contactId);
      return;
    }
    if (item.status === "waiting") {
      await assignAndOpen(item);
      return;
    }
    setSelectedContactId(item.contactId);
  }

  const flowTagsForItem = (item: QueueListItem) => {
    const tags: { name: string; color: string }[] = [];
    const flowName = String(item.sourceFlowDisplayName ?? item.sourceFlowLabel ?? "").trim();
    if (flowName) {
      tags.push({
        name: flowName,
        color: resolveFlowLabelColor(item.sourceFlowLabel || flowName),
      });
    }
    return tags;
  };

  const labelTagsForItem = (item: QueueListItem) => {
    if (Array.isArray(item.labels) && item.labels.length > 0) {
      return item.labels.map((label) => ({
        name: label.name,
        color: label.color || "#64748b",
      }));
    }
    if (item.labelName?.trim()) {
      return [{ name: item.labelName.trim(), color: item.labelColor || "#64748b" }];
    }
    return [];
  };

  return (
    <section className="live-inbox" aria-label="Caixa de atendimento">
      <div className="live-inbox-layout">
        <aside className="live-inbox-sidebar">
          <div className="live-inbox-tabs" role="tablist" aria-label="Filtrar conversas">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "mine"}
              className={`live-inbox-tab ${activeTab === "mine" ? "active" : ""}`}
              onClick={() => setActiveTab("mine")}
            >
              Minhas <span className="live-inbox-tab-count">{tabCounts.mine}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "unassigned"}
              className={`live-inbox-tab ${activeTab === "unassigned" ? "active" : ""}`}
              onClick={() => setActiveTab("unassigned")}
            >
              Não atribuídas <span className="live-inbox-tab-count">{tabCounts.unassigned}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "all"}
              className={`live-inbox-tab ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              Todos <span className="live-inbox-tab-count">{tabCounts.all}</span>
            </button>
          </div>

          <div className="live-inbox-list" role="list">
            {filteredContacts.length === 0 ? (
              <p className="live-inbox-empty muted muted-subtle">Nenhuma conversa neste filtro.</p>
            ) : (
              filteredContacts.map((item) => {
                const status = resolveInboxStatus(item);
                const previewText = resolveInboxPreviewText(item);
                const isSelected = item.contactId === selectedContactId;
                const isFinished = item.status === "closed";
                return (
                  <button
                    key={item.contactId}
                    type="button"
                    role="listitem"
                    className={`live-inbox-conversation${isFinished ? " live-inbox-conversation--finished" : ""}${isSelected ? " active" : ""}`}
                    onClick={() => void handleSelectConversation(item)}
                    disabled={isAssigning}
                  >
                    <div className="live-inbox-conversation__head">
                      <span className="live-inbox-avatar" aria-hidden="true">
                        {(item.contactName.trim()[0] ?? "?").toUpperCase()}
                      </span>
                      <div className="live-inbox-conversation__meta">
                        <div className="live-inbox-conversation__title-row">
                          <strong>
                            {item.isPinned ? (
                              <span className="live-inbox-pin" title="Conversa fixada" aria-label="Conversa fixada">
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1.03 1 1.03-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
                                </svg>
                              </span>
                            ) : null}
                            {item.contactName}
                          </strong>
                          <span className="live-inbox-time">{formatInboxRelativeTime(item.updatedAt)}</span>
                        </div>
                        <span className={`live-inbox-status-pill live-inbox-status-pill--${status.tone}`}>
                          {status.label}
                        </span>
                      </div>
                    </div>
                    {previewText ? <p className="live-inbox-preview">{previewText}</p> : null}
                    <div className="live-inbox-tags">
                      {flowTagsForItem(item).map((tag) => (
                        <LabelTag key={`${item.contactId}-flow-${tag.name}`} name={tag.name} color={tag.color} />
                      ))}
                      {labelTagsForItem(item).map((tag) => (
                        <LabelTag key={`${item.contactId}-label-${tag.name}`} name={tag.name} color={tag.color} />
                      ))}
                      {item.priorityName?.trim() ? (
                        <span className="live-inbox-priority-pill">{item.priorityName.trim()}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="live-inbox-chat-pane">
          {selectedContact && chatUrl ? (
            <iframe
              key={selectedContact.contactId}
              className="live-inbox-chat-frame"
              title={`Chat com ${selectedContact.contactName}`}
              src={chatUrl}
            />
          ) : selectedContact && selectedContact.status === "closed" ? (
            <div className="live-inbox-chat-empty">
              <h3>Atendimento finalizado</h3>
              <p className="muted">
                Este lead foi encerrado. O histórico permanece na conversa; novas mensagens não são aceitas.
              </p>
            </div>
          ) : (
            <div className="live-inbox-chat-empty">
              <h3>Selecione uma conversa</h3>
              <p className="muted">
                Escolha um atendimento na lista. Conversas em <strong>Não atribuídas</strong> são assumidas
                automaticamente ao clicar.
              </p>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
