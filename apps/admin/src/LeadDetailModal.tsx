import { ReactNode, useEffect, useMemo, useState } from "react";
import { LeadInlineFactField } from "./LeadInlineFactField";
import {
  getLeadContextEntries,
  getLeadInitials,
  isLeadCpfContextKey,
  resolveLeadContactName,
  resolveLeadCpf,
  resolveLeadWhatsapp,
  type LeadContactDetail,
} from "./leadContactData";

type LeadDetailSection = "assign" | "variables" | "notes" | "attachments";

type LeadDetailModalProps = {
  open: boolean;
  onClose: () => void;
  apiBase: string;
  tenantId: string;
  contactId: string;
};

const AccordionSection = ({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => (
  <section className={`lead-accordion-item${open ? " open" : ""}`}>
    <button type="button" className="lead-accordion-trigger" aria-expanded={open} onClick={onToggle}>
      <span className="lead-accordion-label">{label}</span>
      <span className="lead-accordion-icon" aria-hidden="true">
        +
      </span>
    </button>
    <div className="lead-accordion-panel">{children}</div>
  </section>
);

export function LeadDetailModal({ open, onClose, apiBase, tenantId, contactId }: LeadDetailModalProps) {
  const [contact, setContact] = useState<LeadContactDetail | null>(null);
  const [status, setStatus] = useState("");
  const [openSections, setOpenSections] = useState<Record<LeadDetailSection, boolean>>({
    assign: false,
    variables: false,
    notes: false,
    attachments: false,
  });
  const [leadNameDraft, setLeadNameDraft] = useState("");
  const [leadWhatsappDraft, setLeadWhatsappDraft] = useState("");
  const [leadCpfDraft, setLeadCpfDraft] = useState("");

  useEffect(() => {
    if (!open || !contactId || !tenantId) return;

    let cancelled = false;
    setStatus("Carregando dados do lead...");
    setContact(null);

    void fetch(`${apiBase}/api/chat/queue/${encodeURIComponent(contactId)}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "x-tenant-id": tenantId },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        return (await response.json()) as LeadContactDetail;
      })
      .then((loaded) => {
        if (cancelled) return;
        setContact(loaded);
        setLeadNameDraft(resolveLeadContactName(loaded.contactName, loaded.leadContext));
        setLeadWhatsappDraft(resolveLeadWhatsapp(loaded.leadWhatsapp, loaded.leadContext));
        setLeadCpfDraft(resolveLeadCpf(loaded.leadContext));
        setStatus("");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("Não foi possível carregar os dados do lead.");
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase, contactId, open, tenantId]);

  const leadName = useMemo(
    () => leadNameDraft.trim() || resolveLeadContactName(contact?.contactName, contact?.leadContext),
    [contact?.contactName, contact?.leadContext, leadNameDraft],
  );
  const leadVariables = useMemo(
    () => getLeadContextEntries(contact?.leadContext).filter(([key]) => !isLeadCpfContextKey(key)),
    [contact?.leadContext],
  );
  const assignedLabel =
    String(contact?.assignedAgentName ?? "").trim() ||
    String(contact?.assignedAgentId ?? "").trim() ||
    "Não atribuído";
  const notes = Array.isArray(contact?.agentNotesHistory) ? contact.agentNotesHistory : [];
  const attachments = Array.isArray(contact?.attachments) ? contact.attachments : [];

  const toggleSection = (section: LeadDetailSection) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const saveLeadContactFields = async () => {
    if (!contactId || !tenantId) return;
    setStatus("Salvando...");
    const payload: { contactName?: string; leadWhatsapp: string; leadCpf: string } = {
      leadWhatsapp: leadWhatsappDraft.trim(),
      leadCpf: leadCpfDraft.trim(),
    };
    const nextName = leadNameDraft.trim();
    if (nextName.length >= 2) payload.contactName = nextName;
    try {
      const response = await fetch(`${apiBase}/api/chat/queue/${encodeURIComponent(contactId)}/profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("save failed");
      const updated = (await response.json()) as LeadContactDetail;
      setContact(updated);
      setLeadNameDraft(resolveLeadContactName(updated.contactName, updated.leadContext));
      setLeadWhatsappDraft(resolveLeadWhatsapp(updated.leadWhatsapp, updated.leadContext));
      setLeadCpfDraft(resolveLeadCpf(updated.leadContext));
      setStatus("Dados do lead salvos.");
    } catch {
      setStatus("Falha ao salvar dados do lead.");
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <aside
        className="modal-card lead-detail-modal"
        role="dialog"
        aria-labelledby="leadDetailModalTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lead-drawer-head">
          <strong id="leadDetailModalTitle">Contato</strong>
          <button type="button" className="lead-drawer-close" aria-label="Fechar painel" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="lead-drawer-body">
          <div className="lead-profile-card">
            <div className="lead-profile-avatar" aria-hidden="true">
              {getLeadInitials(leadName)}
            </div>
            <div className="lead-profile-meta">
              <strong>{leadName || "Visitante"}</strong>
              <span className="lead-profile-sub">Lead em atendimento ao vivo</span>
            </div>
          </div>

          <ul className="lead-fact-list">
            <LeadInlineFactField
              label="Nome do lead"
              value={leadNameDraft}
              onChange={setLeadNameDraft}
              onCommit={() => void saveLeadContactFields()}
              copyLabel="Copiar nome"
              icon={
                <svg viewBox="0 0 24 24">
                  <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
                </svg>
              }
            />
            <LeadInlineFactField
              label="WhatsApp"
              value={leadWhatsappDraft}
              onChange={setLeadWhatsappDraft}
              onCommit={() => void saveLeadContactFields()}
              copyLabel="Copiar WhatsApp"
              inputMode="tel"
              icon={
                <svg viewBox="0 0 24 24">
                  <path d="M6.6 10.8a15.9 15.9 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.24 1Z" />
                </svg>
              }
            />
            <LeadInlineFactField
              label="CPF"
              value={leadCpfDraft}
              onChange={setLeadCpfDraft}
              onCommit={() => void saveLeadContactFields()}
              copyLabel="Copiar CPF"
              inputMode="numeric"
              placeholder="000.000.000-00"
              icon={
                <svg viewBox="0 0 24 24">
                  <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v12h16V6H4Zm3 4h10v1.5H7V10Zm0 3h7v1.5H7V13Z" />
                </svg>
              }
            />
          </ul>

          <div className="lead-accordion">
            <AccordionSection
              label="Atribuição"
              open={openSections.assign}
              onToggle={() => toggleSection("assign")}
            >
              <div className="lead-field">
                <span>Atendente atual</span>
                <p className="lead-field-value">{assignedLabel}</p>
              </div>
            </AccordionSection>

            <AccordionSection
              label="Informações do Typebot"
              open={openSections.variables}
              onToggle={() => toggleSection("variables")}
            >
              <div className="lead-variables-list">
                {leadVariables.length === 0 ? (
                  <div className="lead-variable-chip">
                    <strong>Sem variáveis registradas</strong>
                  </div>
                ) : (
                  leadVariables.map(([key, value]) => (
                    <div className="lead-variable-chip" key={key}>
                      <strong>{key}</strong>
                      {String(value)}
                    </div>
                  ))
                )}
              </div>
            </AccordionSection>

            <AccordionSection
              label="Observações do atendimento"
              open={openSections.notes}
              onToggle={() => toggleSection("notes")}
            >
              <div className="lead-notes-history">
                {notes.length === 0 ? (
                  <div className="lead-note-empty">Nenhuma observação registrada ainda.</div>
                ) : (
                  notes.map((note) => (
                    <article className="lead-note-item" key={note.id}>
                      <small>
                        {new Date(note.createdAt).toLocaleString("pt-BR")}
                        {note.authorName ? ` · ${note.authorName}` : ""}
                      </small>
                      <p>{note.text}</p>
                    </article>
                  ))
                )}
              </div>
            </AccordionSection>

            <AccordionSection
              label="Anexos"
              open={openSections.attachments}
              onToggle={() => toggleSection("attachments")}
            >
              <div className="lead-attachments-list">
                {attachments.length === 0 ? (
                  <div className="lead-note-empty">Nenhum anexo registrado.</div>
                ) : (
                  attachments.map((item) => (
                    <div className="lead-attachment-item" key={item.id}>
                      <strong>{item.fileName}</strong>
                      {item.mimeType.startsWith("image/") || item.content.startsWith("data:image/") ? (
                        <img className="live-message-image" src={item.content} alt={item.fileName} />
                      ) : (
                        <a href={item.content} download={item.fileName}>
                          Baixar
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </AccordionSection>
          </div>

          {status ? <small className="lead-drawer-status">{status}</small> : null}
        </div>
      </aside>
    </div>
  );
}
