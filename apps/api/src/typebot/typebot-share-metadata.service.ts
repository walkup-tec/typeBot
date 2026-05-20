/**
 * Garante que settings.metadata do Typebot (título, descrição, imagem, ícone)
 * use URLs públicas HTTPS e que a versão publicada no viewer reflita o builder.
 */
import { tenantRepository } from "../lib/repositories";

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

const resolveS3PublicBaseUrl = (): string => {
  const explicit = String(process.env.TYPEBOT_S3_PUBLIC_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const endpoint = String(process.env.S3_ENDPOINT ?? process.env.TYPEBOT_S3_ENDPOINT ?? "").trim();
  const bucket = String(process.env.S3_BUCKET ?? "typebot").trim() || "typebot";
  if (!endpoint) return "";
  const host = endpoint.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return `https://${host}/${bucket}/public`;
};

const normalizeShareAssetUrl = (raw: string): string => {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^data:image\//i.test(value)) return "";
  if (/^https?:\/\//i.test(value)) {
    if (/localhost|127\.0\.0\.1/i.test(value)) {
      const publicBase = resolveS3PublicBaseUrl();
      if (!publicBase) return "";
      try {
        const parsed = new URL(value);
        const path = parsed.pathname.replace(/^\/+/, "");
        const idx = path.indexOf("public/");
        if (idx >= 0) return `${publicBase}/${path.slice(idx + "public/".length)}`;
      } catch {
        return "";
      }
    }
    return value;
  }
  if (value.startsWith("//")) return `https:${value}`;
  const publicBase = resolveS3PublicBaseUrl();
  if (value.startsWith("/") && publicBase) {
    const path = value.replace(/^\/+/, "");
    if (path.startsWith("public/")) return `${publicBase}/${path.slice("public/".length)}`;
    return `${publicBase}/${path}`;
  }
  return "";
};

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

/**
 * Preserva metadados definidos no builder; só normaliza URLs para HTTPS público e republica.
 */
export const ensureTypebotShareMetadataPublished = async (typebotId: string): Promise<{ published: boolean; metadataPatched: boolean }> => {
  const normalizedId = String(typebotId ?? "").trim();
  if (!normalizedId || !TYPEBOT_TARGET_BUILDER_API_TOKEN) {
    return { published: false, metadataPatched: false };
  }

  const typebot = await fetchTypebotRecord(normalizedId);
  if (!typebot) return { published: false, metadataPatched: false };

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

  let metadataPatched = false;
  for (const key of ["imageUrl", "favIconUrl"] as const) {
    const current = String(metadata[key] ?? "").trim();
    if (!current) continue;
    const normalized = normalizeShareAssetUrl(current);
    if (normalized && normalized !== current) {
      metadata[key] = normalized;
      metadataPatched = true;
    }
  }

  if (metadataPatched) {
    settings.metadata = metadata;
    typebot.settings = settings;
    await patchTypebotRecord(normalizedId, typebot);
  }

  await publishTypebotOnTarget(normalizedId);
  return { published: true, metadataPatched };
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
