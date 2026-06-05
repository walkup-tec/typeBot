import { typebotPublicIdFromViewerUrl } from "../lib/typebot-public-id";

/** URLs do viewer self-host Walkup (host compartilhado — matriz e assinantes). */
export const isWalkupMatrixViewerUrl = (url: string): boolean => {
  const normalized = String(url ?? "").trim().toLowerCase();
  if (!normalized || normalized.includes("soma-typebot")) return false;
  return (
    normalized.includes("typebot-typebot-walkup-viewer") ||
    normalized.includes("typebot-walkup-viewer.achpyp")
  );
};

/** Slug canônico do fluxo matriz no viewer (não confundir com cópias dos assinantes, ex.: …-bxn7orp). */
export const isCanonicalWalkupMatrixViewerPublicId = (publicId: string | undefined): boolean => {
  const pid = String(publicId ?? "").trim().toLowerCase();
  return pid === "emprestimo-clt";
};

/** Handoff deve ir para tenant matriz só quando o publicId é o slug matriz, não qualquer URL no host Walkup. */
export const shouldHandoffResolveToMasterTenant = (viewerUrl: string | undefined): boolean => {
  const url = String(viewerUrl ?? "").trim();
  if (!url || !isWalkupMatrixViewerUrl(url)) return false;
  const publicId = typebotPublicIdFromViewerUrl(url);
  return isCanonicalWalkupMatrixViewerPublicId(publicId);
};

export const resolveWalkupMatrixViewerBaseUrl = (): string => {
  const explicit = String(process.env.TYPEBOT_SOURCE_VIEWER_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const target = String(process.env.TYPEBOT_TARGET_VIEWER_BASE_URL ?? "").trim();
  if (target && isWalkupMatrixViewerUrl(target)) return target.replace(/\/$/, "");
  return "https://typebot-typebot-walkup-viewer.achpyp.easypanel.host";
};

export const buildWalkupMatrixViewerUrl = (publicId: string): string => {
  const base = resolveWalkupMatrixViewerBaseUrl();
  const pid = String(publicId ?? "").trim();
  if (!base || !pid) return "";
  return `${base}/${encodeURIComponent(pid)}`;
};
