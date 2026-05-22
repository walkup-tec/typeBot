import { useEffect, useRef, useState, type ReactNode } from "react";
import { copyTextToClipboard } from "./copyToClipboard";

type LeadInlineFactFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void | Promise<void>;
  copyValue?: string;
  copyLabel: string;
  onCopyResult?: (ok: boolean) => void;
  inputMode?: "text" | "tel" | "numeric";
  placeholder?: string;
  icon: ReactNode;
};

export function LeadInlineFactField({
  label,
  value,
  onChange,
  onCommit,
  copyValue,
  copyLabel,
  onCopyResult,
  inputMode = "text",
  placeholder,
  icon,
}: LeadInlineFactFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const committedValueRef = useRef(value);

  useEffect(() => {
    committedValueRef.current = value;
  }, [value]);

  const startEditing = () => {
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const commitIfChanged = () => {
    setEditing(false);
    if (value.trim() === committedValueRef.current.trim()) return;
    committedValueRef.current = value;
    void onCommit();
  };

  const copyFieldValue = async () => {
    const normalized = String(copyValue ?? value ?? "").trim();
    if (!normalized) return;
    const ok = await copyTextToClipboard(normalized);
    onCopyResult?.(ok);
  };

  return (
    <li className="lead-inline-fact-field">
      <span className="lead-fact-icon" aria-hidden="true">
        {icon}
      </span>
      <label className="lead-inline-fact-field-main">
        <small>{label}</small>
        <span className={`lead-inline-fact-input-wrap${editing ? " is-editing" : ""}`}>
          <input
            ref={inputRef}
            className="lead-inline-fact-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={commitIfChanged}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            readOnly={!editing}
            inputMode={inputMode}
            placeholder={placeholder}
            aria-label={label}
          />
          <button
            type="button"
            className="lead-inline-fact-edit"
            aria-label={`Editar ${label}`}
            title={`Editar ${label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={startEditing}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm18-11.5a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13Z" />
            </svg>
          </button>
        </span>
      </label>
      <button
        type="button"
        className="lead-fact-copy"
        aria-label={copyLabel}
        title={copyLabel}
        onClick={(event) => {
          event.stopPropagation();
          void copyFieldValue();
        }}
        disabled={!String(copyValue ?? value ?? "").trim()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v16h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 18H8V7h11v16Z" />
        </svg>
      </button>
    </li>
  );
}
