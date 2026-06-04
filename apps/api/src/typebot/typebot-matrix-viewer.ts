/** URLs do viewer self-host Walkup (fluxo matriz). */
export const isWalkupMatrixViewerUrl = (url: string): boolean => {
  const normalized = String(url ?? "").trim().toLowerCase();
  if (!normalized || normalized.includes("soma-typebot")) return false;
  return (
    normalized.includes("typebot-typebot-walkup-viewer") ||
    normalized.includes("typebot-walkup-viewer.achpyp")
  );
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
