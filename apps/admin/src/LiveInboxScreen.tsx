import { useCallback, useEffect, useMemo, useState } from "react";
import { LabelTag } from "./LabelTag";
import type { TenantLabelRow } from "./TenantLabelsStep";
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
  const [tenantLabels, setTenantLabels] = useState<TenantLabelRow[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);

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
    if (!selectedContact || selectedContact.status !== "in_service") return "";
    return buildAgentChatUrl(
      tenantId,
      selectedContact.contactId,
      currentAgentId,
      authDisplayName || currentAgentId,
      selectedContact.contactName,
      selectedContact.sourceFlowLabel,
    );
  }, [authDisplayName, buildAgentChatUrl, currentAgentId, selectedContact, tenantId]);

  const loadLabels = useCallback(async () => {
    if (!tenantId) return;
    try {
      const response = await fetch(`${apiBase}/api/master/tenants/${encodeURIComponent(tenantId)}/labels`);
      if (!response.ok) return;
      const rows = (await response.json()) as TenantLabelRow[];
      setTenantLabels(Array.isArray(rows) ? rows : []);
    } catch {
      setTenantLabels([]);
    }
  }, [apiBase, tenantId]);

  useEffect(() => {
    void loadLabels();
  }, [loadLabels]);

  useEffect(() => {
    if (!selectedContactId) return;
    if (!filteredContacts.some((item) => item.contactId === selectedContactId)) {
      setSelectedContactId(filteredContacts[0]?.contactId ?? null);
    }
  }, [filteredContacts, selectedContactId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "chattypebot-queue-ended") return;
      const endedId = String(event.data?.contactId ?? "").trim();
      if (!endedId) return;
      if (selectedContactId === endedId) {
        setSelectedContactId(null);
      }
      void onRefreshQueue();
      onStatusMessage("Atendimento encerrado.");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onRefreshQueue, onStatusMessage, selectedContactId]);

  async function assignAndOpen(item: QueueListItem) {
    const resolvedAgentName = authDisplayName?.trim() || currentAgentId;
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
        onStatusMessage("Não foi possível assumir o atendimento.");
        return;
      }
      setSelectedContactId(item.contactId);
      onStatusMessage("Atendimento assumido.");
      await onRefreshQueue();
    } catch {
      onStatusMessage("Não foi possível assumir o atendimento.");
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleSelectConversation(item: QueueListItem) {
    if (item.status === "waiting") {
      await assignAndOpen(item);
      return;
    }
    setSelectedContactId(item.contactId);
  }

  const flowTagsForItem = (item: QueueListItem) => {
    const tags: { name: string; color: string }[] = [];
    if (item.sourceFlowLabel?.trim()) {
      tags.push({
        name: item.sourceFlowLabel.trim(),
        color: resolveFlowLabelColor(item.sourceFlowLabel),
      });
    }
    return tags;
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
                const isSelected = item.contactId === selectedContactId;
                return (
                  <button
                    key={item.contactId}
                    type="button"
                    role="listitem"
                    className={`live-inbox-conversation ${isSelected ? "active" : ""}`}
                    onClick={() => void handleSelectConversation(item)}
                    disabled={isAssigning}
                  >
                    <div className="live-inbox-conversation__head">
                      <span className="live-inbox-avatar" aria-hidden="true">
                        {(item.contactName.trim()[0] ?? "?").toUpperCase()}
                      </span>
                      <div className="live-inbox-conversation__meta">
                        <div className="live-inbox-conversation__title-row">
                          <strong>{item.contactName}</strong>
                          <span className="live-inbox-time">{formatInboxRelativeTime(item.updatedAt)}</span>
                        </div>
                        <span className={`live-inbox-status-pill live-inbox-status-pill--${status.tone}`}>
                          {status.label}
                        </span>
                      </div>
                    </div>
                    <p className="live-inbox-preview">{resolveInboxPreviewText(item)}</p>
                    <div className="live-inbox-tags">
                      {flowTagsForItem(item).map((tag) => (
                        <LabelTag key={`${item.contactId}-${tag.name}`} name={tag.name} color={tag.color} />
                      ))}
                      {tenantLabels.length > 0 && flowTagsForItem(item).length === 0 ? (
                        <span className="live-inbox-tags-hint muted-subtle">Sem etiqueta</span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="live-inbox-chat-pane">
          {selectedContact && selectedContact.status === "in_service" && chatUrl ? (
            <iframe
              key={selectedContact.contactId}
              className="live-inbox-chat-frame"
              title={`Chat com ${selectedContact.contactName}`}
              src={chatUrl}
            />
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
