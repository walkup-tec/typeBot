/** Conta matriz do sistema — workspace Walkup no Typebot Builder. */
export const MASTER_SOURCE_EMAIL = "walkup@walkuptec.com.br";

export type MasterLibraryFlowLike = {
  url?: string;
  ownerEmail?: string;
  typebotRemoteId?: string;
  typebotPublished?: boolean;
  viewerUrlActive?: boolean;
};

export const isWalkupMatrixViewerUrl = (url: string): boolean => {
  const normalized = url.trim().toLowerCase();
  if (!normalized || normalized.includes("soma-typebot")) return false;
  return (
    normalized.includes("typebot-typebot-walkup-viewer") ||
    normalized.includes("typebot-walkup-viewer.achpyp")
  );
};

/**
 * Fluxo elegível na Biblioteca Master: Live no workspace matriz Walkup,
 * URL do viewer atual e vínculo real com o Typebot (typebotRemoteId).
 * Rejeita lixo multi-tenant retornado por APIs antigas.
 */
export const isMasterLibrarySourceFlow = (flow: MasterLibraryFlowLike): boolean => {
  if (!isWalkupMatrixViewerUrl(String(flow.url ?? ""))) return false;
  if (flow.viewerUrlActive === false) return false;
  if (flow.typebotPublished === false) return false;

  const remoteId = String(flow.typebotRemoteId ?? "").trim();
  if (!remoteId) return false;

  const owner = String(flow.ownerEmail ?? "").trim().toLowerCase();
  const masterOwner = MASTER_SOURCE_EMAIL.toLowerCase();
  if (owner && owner !== masterOwner) return false;

  return true;
};

export const dedupeMasterLibraryFlows = <T extends MasterLibraryFlowLike & { id?: string; typebotPublicId?: string }>(
  flows: T[],
): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const flow of flows) {
    if (!isMasterLibrarySourceFlow(flow)) continue;
    const key =
      String(flow.typebotRemoteId ?? "").trim() ||
      String(flow.typebotPublicId ?? "").trim() ||
      String(flow.url ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(flow);
  }
  return result;
};
