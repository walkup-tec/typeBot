/**
 * Garante que settings.metadata do Typebot (título, descrição, imagem, ícone)
 * use URLs públicas HTTPS e que a versão publicada no viewer reflita o builder.
 */
import { tenantRepository } from "../lib/repositories";
import { normalizeTypebotMediaUrl } from "./typebot-media-sanitize.service";

const TYPEBOT_BUILDER_API_BASE_URL = String(process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "").trim();
const TYPEBOT_TARGET_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_BASE_URL ?? TYPEBOT_BUILDER_API_BASE_URL,
).trim();
const TYPEBOT_TARGET_BUILDER_API_TOKEN = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_TOKEN ?? process.env.TYPEBOT_BUILDER_API_TOKEN ?? "",
).trim();

const buildTargetHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  Authorization: `Bearer ${TYPEBOT_TARGET_BUILDER_API_TOKEN}`,
});

const builderApiRoots = (): string[] => {
  const raw = TYPEBOT_TARGET_BUILDER_API_BASE_URL.replace(/\/$/, "");
  if (!raw) return [];
  const roots = new Set<string>();
  if (raw.endsWith("/api")) {
    roots.add(raw);
    roots.add(raw.replace(/\/api$/, ""));
  } else {
    roots.add(`${raw}/api`);
    roots.add(raw);
  }
  return [...roots];
};

const normalizeShareAssetUrl = (raw: string): string => normalizeTypebotMediaUrl(raw);

const publishTypebotOnTarget = async (typebotId: string): Promise<void> => {
  const normalizedId = String(typebotId ?? "").trim();
  if (!normalizedId || !TYPEBOT_TARGET_BUILDER_API_TOKEN) return;

  const attempts: Array<{ method: "POST" | "PATCH"; url: string; body?: Record<string, unknown> }> = [
    {
      method: "POST",
      url: `${TYPEBOT_TARGET_BUILDER_API_BASE_URL.replace(/\/$/, "")}/v1/typebots/${encodeURIComponent(normalizedId)}/publish`,
    },
    {
      method: "POST",
      url: `${TYPEBOT_TARGET_BUILDER_API_BASE_URL.replace(/\/$/, "")}/v1/typebots/${encodeURIComponent(normalizedId)}/publications`,
    },
    {
      method: "PATCH",
      url: `${TYPEBOT_TARGET_BUILDER_API_BASE_URL.replace(/\/$/, "")}/v1/typebots/${encodeURIComponent(normalizedId)}`,
      body: { published: true },
    },
  ];

  for (const attempt of attempts) {
    const response = await fetch(attempt.url, {
      method: attempt.method,
      headers: buildTargetHeaders(),
      body: attempt.body ? JSON.stringify(attempt.body) : undefined,
    });
    if (response.ok) return;
  }
};

const fetchTypebotRecord = async (typebotId: string): Promise<Record<string, unknown> | null> => {
  for (const root of builderApiRoots()) {
    const url = `${root.replace(/\/$/, "")}/v1/typebots/${encodeURIComponent(typebotId)}?migrateToLatestVersion=true`;
    const response = await fetch(url, { method: "GET", headers: buildTargetHeaders() });
    if (!response.ok) continue;
    const payload = (await response.json()) as { typebot?: Record<string, unknown> };
    if (payload.typebot && typeof payload.typebot === "object") return payload.typebot;
  }
  return null;
};

const patchTypebotRecord = async (typebotId: string, typebot: Record<string, unknown>): Promise<boolean> => {
  const body = {
    typebot: {
      title: typebot.title,
      description: typebot.description,
      icon: typebot.icon,
      image: typebot.image,
      settings: typebot.settings,
    },
  };
  const response = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL.replace(/\/$/, "")}/v1/typebots/${encodeURIComponent(typebotId)}`,
    {
      method: "PATCH",
      headers: buildTargetHeaders(),
      body: JSON.stringify(body),
    },
  );
  return response.ok;
};

type ShareMetadataSnapshot = {
  title: string;
  description: string;
  imageUrl: string;
  favIconUrl: string;
  allowIndexing: boolean;
};

/** Mescla patch em settings.metadata sem apagar título, descrição ou imagem OG já salvos no builder. */
export const mergeTypebotSettingsMetadata = (
  existingSettings: unknown,
  metadataPatch: Record<string, unknown>,
): Record<string, unknown> => {
  const settings =
    existingSettings && typeof existingSettings === "object"
      ? ({ ...(existingSettings as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const metadata =
    settings.metadata && typeof settings.metadata === "object"
      ? ({ ...(settings.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  settings.metadata = { ...metadata, ...metadataPatch };
  return settings;
};

export const fetchTypebotRecordOnTarget = async (typebotId: string): Promise<Record<string, unknown> | null> =>
  fetchTypebotRecord(typebotId);

const readShareMetadataSnapshot = (typebot: Record<string, unknown>): ShareMetadataSnapshot => {
  const settingsRaw = typebot.settings;
  const settings =
    settingsRaw && typeof settingsRaw === "object"
      ? ({ ...(settingsRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const metadataRaw = settings.metadata;
  const metadata =
    metadataRaw && typeof metadataRaw === "object"
      ? ({ ...(metadataRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const title = String(metadata.title ?? typebot.title ?? "").trim();
  const description = String(metadata.description ?? typebot.description ?? "").trim();
  const imageUrl = String(metadata.imageUrl ?? "").trim();
  const favIconUrl = String(metadata.favIconUrl ?? "").trim();
  const allowIndexing = metadata.allowIndexing === true;

  return { title, description, imageUrl, favIconUrl, allowIndexing };
};

const applyShareMetadataSnapshot = (
  typebot: Record<string, unknown>,
  snapshot: ShareMetadataSnapshot,
): { typebot: Record<string, unknown>; changed: boolean } => {
  const settingsRaw = typebot.settings;
  const settings =
    settingsRaw && typeof settingsRaw === "object"
      ? ({ ...(settingsRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const metadata =
    settings.metadata && typeof settings.metadata === "object"
      ? ({ ...(settings.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  let changed = false;

  if (snapshot.title && String(typebot.title ?? "") !== snapshot.title) {
    typebot.title = snapshot.title;
    changed = true;
  }
  if (snapshot.description && String(typebot.description ?? "") !== snapshot.description) {
    typebot.description = snapshot.description;
    changed = true;
  }

  if (snapshot.title && String(metadata.title ?? "") !== snapshot.title) {
    metadata.title = snapshot.title;
    changed = true;
  }
  if (snapshot.description && String(metadata.description ?? "") !== snapshot.description) {
    metadata.description = snapshot.description;
    changed = true;
  }

  const normalizedImage = normalizeShareAssetUrl(snapshot.imageUrl);
  if (normalizedImage && String(metadata.imageUrl ?? "") !== normalizedImage) {
    metadata.imageUrl = normalizedImage;
    changed = true;
  }
  const normalizedIcon = normalizeShareAssetUrl(snapshot.favIconUrl);
  if (normalizedIcon && String(metadata.favIconUrl ?? "") !== normalizedIcon) {
    metadata.favIconUrl = normalizedIcon;
    changed = true;
  }

  // Sem isso o viewer injeta <meta name="robots" content="noindex"> e vários apps ignoram preview rico.
  if (metadata.allowIndexing !== true) {
    metadata.allowIndexing = true;
    changed = true;
  }

  if (changed) {
    settings.metadata = metadata;
    typebot.settings = settings;
  }

  return { typebot, changed };
};

/** Lê metadados atuais do typebot no builder (diagnóstico / painel). */
export const getTypebotShareMetadataSnapshot = async (
  typebotId: string,
): Promise<ShareMetadataSnapshot | null> => {
  const typebot = await fetchTypebotRecord(String(typebotId ?? "").trim());
  if (!typebot) return null;
  return readShareMetadataSnapshot(typebot);
};

/**
 * Garante título, descrição e imagem em settings.metadata + allowIndexing, depois republica.
 */
export const ensureTypebotShareMetadataPublished = async (
  typebotId: string,
): Promise<{ published: boolean; metadataPatched: boolean; snapshot: ShareMetadataSnapshot | null }> => {
  const normalizedId = String(typebotId ?? "").trim();
  if (!normalizedId || !TYPEBOT_TARGET_BUILDER_API_TOKEN) {
    return { published: false, metadataPatched: false, snapshot: null };
  }

  const typebot = await fetchTypebotRecord(normalizedId);
  if (!typebot) return { published: false, metadataPatched: false, snapshot: null };

  const snapshot = readShareMetadataSnapshot(typebot);
  const { typebot: patched, changed } = applyShareMetadataSnapshot(typebot, snapshot);

  if (changed) {
    await patchTypebotRecord(normalizedId, patched);
  }

  await publishTypebotOnTarget(normalizedId);
  return { published: true, metadataPatched: changed, snapshot };
};

/** Republica metadados de todos os typebots informados (workspace do assinante). */
export const republishTenantWorkspaceFlowsMetadata = async (
  tenantId: string,
  typebotRemoteIds: string[],
): Promise<{ republished: number; metadataPatched: number }> => {
  const tenant = tenantRepository.getById(tenantId);
  if (!tenant) return { republished: 0, metadataPatched: 0 };

  let republished = 0;
  let metadataPatched = 0;
  for (const id of typebotRemoteIds) {
    const result = await ensureTypebotShareMetadataPublished(id);
    if (result.published) republished += 1;
    if (result.metadataPatched) metadataPatched += 1;
  }
  return { republished, metadataPatched };
};
