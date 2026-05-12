import { ChangeEvent, ReactNode, RefObject, useEffect, useMemo, useState } from "react";
import { LeadInlineFactField } from "./LeadInlineFactField";
import { isLeadCpfContextKey } from "./resolveLeadCpf";

export type LeadAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  content: string;
  createdAt: string;
};

export type LeadAgentNote = {
  id: string;
  text: string;
  createdAt: string;
  authorName?: string;
  authorId?: string;
};

export type AttendantOption = {
  username: string;
  displayName: string;
};

export type LeadDrawerSection = "assign" | "attachments" | "variables" | "notes";

type LeadDrawerPanelProps = {
  open: boolean;
  onClose: () => void;
  focusSection?: LeadDrawerSection | null;
  leadNameDraft: string;
  onLeadNameDraftChange: (value: string) => void;
  leadWhatsappDraft: string;
  onLeadWhatsappDraftChange: (value: string) => void;
  leadCpfDraft: string;
  onLeadCpfDraftChange: (value: string) => void;
  leadNotesDraft: string;
  onLeadNotesDraftChange: (value: string) => void;
  leadNotesHistory: LeadAgentNote[];
  onRegisterLeadNote: () => void;
  leadAssignTo: string;
  onLeadAssignToChange: (value: string) => void;
  leadAttendants: AttendantOption[];
  leadAttachments: LeadAttachment[];
  leadVariables: Array<{ key: string; value: string }>;
  leadDrawerStatus: string;
  onSave: () => void;
  onSaveContactFields: () => void | Promise<void>;
  onFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  leadFilesInputRef: RefObject<HTMLInputElement | null>;
  imageDataUrlPrefix: string;
};

const getLeadInitials = (label: string): string =>
  String(label ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "L";

const AccordionSection = ({
  section,
  label,
  open,
  onToggle,
  children,
}: {
  section: LeadDrawerSection;
  label: string;
  open: boolean;
  onToggle: (section: LeadDrawerSection) => void;
  children: ReactNode;
}) => (
  <section className={`lead-accordion-item${open ? " open" : ""}`} data-lead-section={section}>
    <button
      type="button"
      className="lead-accordion-trigger"
      aria-expanded={open}
      onClick={() => onToggle(section)}
    >
      <span className="lead-accordion-label">{label}</span>
      <span className="lead-accordion-icon" aria-hidden="true">
        +
      </span>
    </button>
    <div className="lead-accordion-panel">{children}</div>
  </section>
);

export function LeadDrawerPanel({
  open,
  onClose,
  focusSection = null,
  leadNameDraft,
  onLeadNameDraftChange,
  leadWhatsappDraft,
  onLeadWhatsappDraftChange,
  leadCpfDraft,
  onLeadCpfDraftChange,
  leadNotesDraft,
  onLeadNotesDraftChange,
  leadNotesHistory,
  onRegisterLeadNote,
  leadAssignTo,
  onLeadAssignToChange,
  leadAttendants,
  leadAttachments,
  leadVariables,
  leadDrawerStatus,
  onSave,
  onSaveContactFields,
  onFilesSelected,
  leadFilesInputRef,
  imageDataUrlPrefix,
}: LeadDrawerPanelProps) {
  const [openSections, setOpenSections] = useState<Record<LeadDrawerSection, boolean>>({
    assign: false,
    attachments: false,
    variables: false,
    notes: false,
  });

  const visibleLeadVariables = useMemo(
    () => leadVariables.filter((item) => !isLeadCpfContextKey(item.key)),
    [leadVariables],
  );
  const hasAttachments = leadAttachments.length > 0;
  const hasNotes = leadNotesHistory.length > 0;

  useEffect(() => {
    if (!open || !focusSection) return;
    setOpenSections((current) => ({ ...current, [focusSection]: true }));
  }, [open, focusSection]);

  const toggleSection = (section: LeadDrawerSection) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  return (
    <div
      className={`lead-drawer-overlay${open ? " open" : ""}`}
      aria-hidden={!open}
    >
      <aside className="lead-drawer-panel" role="dialog" aria-labelledby="leadDrawerTitle">
        <div className="lead-drawer-head">
          <strong id="leadDrawerTitle">Contato</strong>
          <button type="button" className="lead-drawer-close" aria-label="Fechar painel" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="lead-drawer-body">
          <div className="lead-profile-card">
            <div className="lead-profile-avatar" aria-hidden="true">
              {getLeadInitials(leadNameDraft)}
            </div>
            <div className="lead-profile-meta">
              <strong>{leadNameDraft.trim() || "Visitante"}</strong>
              <span className="lead-profile-sub">Lead em atendimento ao vivo</span>
            </div>
          </div>

          <ul className="lead-fact-list">
            <LeadInlineFactField
              label="Nome do lead"
              value={leadNameDraft}
              onChange={onLeadNameDraftChange}
              onCommit={onSaveContactFields}
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
              onChange={onLeadWhatsappDraftChange}
              onCommit={onSaveContactFields}
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
              onChange={onLeadCpfDraftChange}
              onCommit={onSaveContactFields}
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

          <div className="lead-toolbar">
            <button
              type="button"
              className="lead-toolbar-button"
              aria-label="Atribuir atendente"
              title="Atribuir atendente"
              onClick={() => toggleSection("assign")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M16 11c1.7 0 3-1.3 3-3S17.7 5 16 5s-3 1.3-3 3 1.3 3 3 3Zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3Zm0 2c-2.3 0-7 1.2-7 3.5V18h8v-2.5C9 15.2 8.3 14.4 8 14Zm8 0c-.3 0-1.2.4-2 2.5V18h7v-2.5C21 14.2 16.3 13 14 13Z" />
              </svg>
            </button>
            <button
              type="button"
              className={`lead-toolbar-button${hasAttachments ? " lead-toolbar-button--active" : ""}`}
              aria-label="Anexos"
              title="Anexos"
              onClick={() => toggleSection("attachments")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M16.5 6.5v9a4.5 4.5 0 0 1-9 0v-10a3 3 0 0 1 6 0v9a1.5 1.5 0 0 1-3 0V7h-1.5v8.5a3 3 0 0 0 6 0v-10a4.5 4.5 0 0 0-9 0v10a6 6 0 0 0 12 0V6.5h-1.5Z" />
              </svg>
            </button>
            <button
              type="button"
              className={`lead-toolbar-button${hasNotes ? " lead-toolbar-button--active" : ""}`}
              aria-label="Observações"
              title="Observações"
              onClick={() => toggleSection("notes")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L18.5 9H14V4.5ZM8 13h8v1.5H8V13Zm0 3.5h8V18H8v-1.5Z" />
              </svg>
            </button>
          </div>

          <div className="lead-accordion">
            <AccordionSection section="assign" label="Atribuição" open={openSections.assign} onToggle={toggleSection}>
              <label className="lead-field">
                <span>Atribuir para outro atendente</span>
                <select value={leadAssignTo} onChange={(event) => onLeadAssignToChange(event.target.value)}>
                  <option value="">Manter atendente atual</option>
                  {leadAttendants.map((attendant) => (
                    <option key={attendant.username} value={attendant.username}>
                      {attendant.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </AccordionSection>

            <AccordionSection
              section="variables"
              label="Informações do Typebot"
              open={openSections.variables}
              onToggle={toggleSection}
            >
              <div className="lead-variables-list">
                {visibleLeadVariables.length === 0 ? (
                  <div className="lead-variable-chip">
                    <strong>Sem variáveis registradas</strong>
                  </div>
                ) : (
                  visibleLeadVariables.map((item) => (
                    <div className="lead-variable-chip" key={item.key}>
                      <strong>{item.key}</strong>
                      {item.value}
                    </div>
                  ))
                )}
              </div>
            </AccordionSection>

            <AccordionSection
              section="notes"
              label="Observações do atendimento"
              open={openSections.notes}
              onToggle={toggleSection}
            >
              <label className="lead-field">
                <span>Registro interno</span>
                <textarea
                  rows={5}
                  value={leadNotesDraft}
                  placeholder="Descreva a observação..."
                  onChange={(event) => onLeadNotesDraftChange(event.target.value)}
                />
              </label>
              <button type="button" className="lead-note-register-button" onClick={onRegisterLeadNote}>
                Registrar observação
              </button>
              <div className="lead-notes-history">
                {leadNotesHistory.length === 0 ? (
                  <div className="lead-note-empty">Nenhuma observação registrada ainda.</div>
                ) : (
                  leadNotesHistory.map((note) => (
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
              section="attachments"
              label="Anexos"
              open={openSections.attachments}
              onToggle={toggleSection}
            >
              <label className="lead-field">
                <span>Imagens e documentos</span>
                <input
                  ref={leadFilesInputRef}
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                  multiple
                  onChange={onFilesSelected}
                />
              </label>
              <div className="lead-attachments-list">
                {leadAttachments.map((item) => (
                  <div className="lead-attachment-item" key={item.id}>
                    <strong>{item.fileName}</strong>
                    {item.mimeType.startsWith("image/") || item.content.startsWith(imageDataUrlPrefix) ? (
                      <img className="live-message-image" src={item.content} alt={item.fileName} />
                    ) : (
                      <a href={item.content} download={item.fileName}>
                        Baixar
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </AccordionSection>
          </div>
        </div>

        <div className="lead-drawer-footer">
          <button type="button" className="lead-save-button" onClick={onSave}>
            Salvar alterações
          </button>
          {leadDrawerStatus ? <small className="lead-drawer-status">{leadDrawerStatus}</small> : null}
        </div>
      </aside>
    </div>
  );
}
