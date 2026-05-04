/** Normaliza identificadores de login / e-mail para comparação consistente. */
export function normalizeAuthIdentifier(raw: string): string {
  return String(raw ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
}

/** Gmail / Googlemail: o utilizador local ignora pontos (regra da Google). */
function gmailCanonical(email: string): string | null {
  const normalized = normalizeAuthIdentifier(email);
  const at = normalized.lastIndexOf("@");
  if (at < 0) return null;
  const local = normalized.slice(0, at).replace(/\./g, "");
  const domain = normalized.slice(at + 1);
  if (domain === "googlemail.com" || domain === "gmail.com") {
    return `${local}@gmail.com`;
  }
  return null;
}

/** Verifica se dois valores são o mesmo e-mail para efeitos de login/redefinição. */
export function authEmailsEquivalent(a: string, b: string): boolean {
  const na = normalizeAuthIdentifier(a);
  const nb = normalizeAuthIdentifier(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ga = gmailCanonical(na);
  const gb = gmailCanonical(nb);
  return ga !== null && gb !== null && ga === gb;
}

/**
 * Extrai endereços de texto livre (ex.: titular gravado como "Nome <mail>" ou frase com mail).
 */
export function extractEmailsFromLooseText(text: string): string[] {
  const raw = String(text ?? "");
  const matches = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const n = normalizeAuthIdentifier(m);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
