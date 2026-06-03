/** URL pública da API Node (serviço Easypanel `api`, domínio `app`). */
export const PRODUCTION_API_BASE_URL = "https://app.chattypebot.com";

const DEPRECATED_API_HOST = /^https?:\/\/api\.chattypebot\.com\/?$/i;

/** Normaliza bases legadas (`api.chattypebot.com`) para o host ativo. */
export const normalizePublicApiBaseUrl = (raw: string): string => {
  const trimmed = String(raw ?? "").trim().replace(/\/$/, "");
  if (!trimmed) return "";
  if (DEPRECATED_API_HOST.test(trimmed)) return PRODUCTION_API_BASE_URL;
  return trimmed;
};
