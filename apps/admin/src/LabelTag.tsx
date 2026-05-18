type LabelTagProps = {
  name: string;
  color: string;
  className?: string;
};

/** Visual padrão da etiqueta: fundo escuro, borda, quadrado de cor + nome. */
export function LabelTag({ name, color, className }: LabelTagProps) {
  const displayName = name.trim() || "Etiqueta";
  return (
    <span className={className ? `label-tag ${className}` : "label-tag"} title={displayName}>
      <span className="label-tag__swatch" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="label-tag__text">{displayName}</span>
    </span>
  );
}
