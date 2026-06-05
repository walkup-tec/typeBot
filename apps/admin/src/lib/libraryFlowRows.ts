type LinkedFlowLike = {
  id?: string;
  typebotRemoteId?: string;
  typebotPublicId?: string;
  librarySourceId?: string;
  url?: string;
  displayLabel?: string;
  nickname?: string;
};

export type LibraryFlowRowLike = {
  item: { id: string; title?: string; viewerUrl?: string };
  linkedFlow: LinkedFlowLike | null;
  isIncluded?: boolean;
};

const normalizeText = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();

const publicIdFromViewerUrl = (url: string | undefined): string => {
  const normalized = String(url ?? "").trim();
  if (!normalized) return "";
  try {
    const pathname = new URL(normalized).pathname.replace(/\/+$/, "");
    const segment = pathname.split("/").filter(Boolean).pop() ?? "";
    return normalizeText(segment);
  } catch {
    const segment = normalized.split("/").filter(Boolean).pop() ?? "";
    return normalizeText(segment);
  }
};

/** Chave estável para o mesmo bot (workspace ou biblioteca). */
export const libraryFlowRowDedupeKey = (row: LibraryFlowRowLike): string => {
  const linked = row.linkedFlow;
  const remoteId = String(linked?.typebotRemoteId ?? "").trim();
  if (remoteId) return `rid:${remoteId.toLowerCase()}`;
  const publicId = String(linked?.typebotPublicId ?? "").trim();
  if (publicId) return `pid:${publicId.toLowerCase()}`;
  const urlPublicId = publicIdFromViewerUrl(linked?.url ?? row.item.viewerUrl);
  if (urlPublicId) return `pid:${urlPublicId}`;
  if (linked?.id) return `flow:${linked.id}`;
  const urlKey = normalizeText(linked?.url ?? row.item.viewerUrl);
  if (urlKey) return `url:${urlKey}`;
  const titleKey = normalizeText(linked?.displayLabel ?? linked?.nickname ?? row.item.title);
  if (titleKey) return `title:${titleKey}`;
  return `item:${row.item.id}`;
};

const rowPreferenceScore = (
  row: LibraryFlowRowLike,
  systemDefaultLibraryIds: ReadonlySet<string>,
): number => {
  let score = 0;
  if (systemDefaultLibraryIds.has(row.item.id)) score += 20;
  if (row.linkedFlow?.librarySourceId === row.item.id) score += 10;
  if (row.isIncluded) score += 5;
  if (row.linkedFlow?.typebotRemoteId?.trim()) score += 2;
  return score;
};

/** Um catálogo pode casar com o mesmo fluxo salvo — mantém a melhor linha por bot. */
export const dedupeLibraryFlowRows = <T extends LibraryFlowRowLike>(
  rows: T[],
  systemDefaultLibraryIds: ReadonlySet<string> = new Set(),
): T[] => {
  const bestByKey = new Map<string, T>();
  for (const row of rows) {
    const key = libraryFlowRowDedupeKey(row);
    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, row);
      continue;
    }
    if (
      rowPreferenceScore(row, systemDefaultLibraryIds) >
      rowPreferenceScore(existing, systemDefaultLibraryIds)
    ) {
      bestByKey.set(key, row);
    }
  }
  return [...bestByKey.values()];
};
