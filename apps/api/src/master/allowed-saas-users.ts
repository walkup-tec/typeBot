import { normalizeAuthIdentifier } from "../lib/auth-email";

/** Únicos assinantes/login permitidos no SaaS (painel master). */
export const ALLOWED_SAAS_OWNER_EMAILS = [
  "walkup@walkuptec.com.br",
  "draxsistemas@gmail.com",
] as const;

const ALLOWED_SET = new Set(
  ALLOWED_SAAS_OWNER_EMAILS.map((email) => normalizeAuthIdentifier(email)).filter(Boolean),
);

export const isAllowedSaasOwnerEmail = (emailRaw: string | undefined): boolean => {
  const key = normalizeAuthIdentifier(emailRaw ?? "");
  if (!key) return false;
  return ALLOWED_SET.has(key);
};

export const isAllowedSaasLoginIdentifier = (raw: string | undefined): boolean => {
  const key = normalizeAuthIdentifier(raw ?? "");
  if (!key) return false;
  return ALLOWED_SET.has(key);
};
