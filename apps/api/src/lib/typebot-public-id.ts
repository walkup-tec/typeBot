/**
 * Extrai o identificador público do fluxo no Typebot (alias / publicId),
 * normalmente o último segmento do path da URL do viewer publicado.
 */
export function typebotPublicIdFromViewerUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return "";
    let last = decodeURIComponent(segments[segments.length - 1] ?? "");
    if ((last === "public" || last === "view") && segments.length >= 2) {
      last = decodeURIComponent(segments[segments.length - 2] ?? "");
    }
    return last;
  } catch {
    return "";
  }
}
