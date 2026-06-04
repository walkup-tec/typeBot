/**
 * Sanitização de URLs de mídia no Typebot (ícone, metadados, blocos, workspace).
 * Corrige regressões documentadas: data:image no icon, localhost no MinIO, S3 mal configurado.
 */
import type { Tenant } from "../tenants/tenant.repository";
import { buildTenantBrandLogoMinioPublicUrl } from "./typebot-brand-logo-minio.service";

const DEFAULT_SAAS_PUBLIC_API_BASE = "https://app.chattypebot.com";

const isDataImageValue = (value: string): boolean => /^data:image\//i.test(String(value ?? "").trim());

/** URL inutilizável no builder remoto (localhost, vazia ou path MinIO sem base pública na API). */
export const isBrokenTypebotMediaUrl = (raw: string): boolean => {
  const value = String(raw ?? "").trim();
  if (!value) return true;
  if (isDataImageValue(value)) return false;
  if (/localhost|127\.0\.0\.1/i.test(value)) return true;
  if (/^https?:\/\//i.test(value)) {
    const rewritten = normalizeTypebotMediaUrl(value);
    return !rewritten;
  }
  return !normalizeTypebotMediaUrl(value);
};

export const resolveS3PublicBaseUrl = (): string => {
  const explicit = String(process.env.TYPEBOT_S3_PUBLIC_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const endpoint = String(process.env.S3_ENDPOINT ?? process.env.TYPEBOT_S3_ENDPOINT ?? "").trim();
  const bucket = String(process.env.S3_BUCKET ?? "typebot").trim() || "typebot";
  if (!endpoint) return "";
  const host = endpoint.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return `https://${host}/${bucket}/public`;
};

/** Base HTTPS da API SaaS para servir /api/public/tenants/:id/logo|share-image. */
export const resolveAvatarPublicBaseUrl = (): string => {
  const candidates = [
    process.env.TYPEBOT_AVATAR_PUBLIC_BASE_URL,
    process.env.API_PUBLIC_BASE_URL,
    process.env.PUBLIC_API_BASE_URL,
    process.env.SAAS_PUBLIC_BASE_URL,
  ];
  for (const raw of candidates) {
    const value = String(raw ?? "")
      .trim()
      .replace(/\/$/, "");
    if (!/^https?:\/\//i.test(value)) continue;
    if (/localhost|127\.0\.0\.1/i.test(value)) continue;
    return value;
  }
  return DEFAULT_SAAS_PUBLIC_API_BASE;
};

export const buildTenantPublicLogoUrl = (tenant: Tenant): string => {
  const logo = String(tenant.profileImageUrl ?? "").trim();
  if (!logo) return "";
  if (/^https?:\/\//i.test(logo) && !/localhost|127\.0\.0\.1/i.test(logo)) return logo;
  if (!isDataImageValue(logo)) return "";
  const tenantId = String(tenant.id ?? "").trim();
  if (!tenantId) return "";
  return `${resolveAvatarPublicBaseUrl()}/api/public/tenants/${encodeURIComponent(tenantId)}/logo`;
};

/** Preferência: MinIO (mesmo host das imagens do fluxo), depois API /logo. */
export const resolveTenantBrandIconUrl = (tenant: Tenant): string => {
  const minioUrl = buildTenantBrandLogoMinioPublicUrl(tenant);
  if (minioUrl) return minioUrl;
  return buildTenantPublicLogoUrl(tenant);
};

export const buildTenantPublicShareImageUrl = (tenant: Tenant): string => {
  const shareImage = String(tenant.shareImageUrl ?? "").trim();
  if (!shareImage) return "";
  if (/^https?:\/\//i.test(shareImage) && !/localhost|127\.0\.0\.1/i.test(shareImage)) return shareImage;
  if (!isDataImageValue(shareImage)) return "";
  const tenantId = String(tenant.id ?? "").trim();
  if (!tenantId) return "";
  return `${resolveAvatarPublicBaseUrl()}/api/public/tenants/${encodeURIComponent(tenantId)}/share-image`;
};

const MEDIA_URL_KEYS = new Set([
  "url",
  "imageurl",
  "faviconurl",
  "icon",
  "src",
  "backgroundimage",
  "image",
]);

export const normalizeTypebotMediaUrl = (raw: string): string => {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (isDataImageValue(value)) return "";

  const rewriteLocalOrRelative = (pathAfterPublic: string): string => {
    const publicBase = resolveS3PublicBaseUrl();
    if (!publicBase) return "";
    const clean = pathAfterPublic.replace(/^\/+/, "");
    return `${publicBase}/${clean}`;
  };

  if (/^https?:\/\//i.test(value)) {
    if (!/localhost|127\.0\.0\.1/i.test(value)) return value;
    try {
      const parsed = new URL(value);
      const path = parsed.pathname.replace(/^\/+/, "");
      const idx = path.indexOf("public/");
      if (idx >= 0) return rewriteLocalOrRelative(path.slice(idx + "public/".length));
    } catch {
      return "";
    }
    return "";
  }

  if (value.startsWith("//")) return `https:${value}`;

  const publicBase = resolveS3PublicBaseUrl();
  if (!publicBase) return "";

  const path = value.replace(/^\/+/, "");
  if (path.startsWith("public/")) return `${publicBase}/${path.slice("public/".length)}`;
  return `${publicBase}/${path}`;
};

const sanitizeMediaString = (key: string, raw: unknown, allowDataImageForAvatar: boolean): unknown => {
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const keyNorm = key.trim().toLowerCase();
  if (isDataImageValue(trimmed)) {
    if (allowDataImageForAvatar && keyNorm === "url") return trimmed;
    return "";
  }
  if (!MEDIA_URL_KEYS.has(keyNorm)) return raw;
  const normalized = normalizeTypebotMediaUrl(trimmed);
  return normalized || (isDataImageValue(trimmed) ? "" : raw);
};

const walkAndSanitizeMedia = (node: unknown, parentKey: string, depth: number): unknown => {
  if (depth > 24 || node === null || node === undefined) return node;
  if (Array.isArray(node)) {
    return node.map((item) => walkAndSanitizeMedia(item, parentKey, depth + 1));
  }
  if (typeof node !== "object") return node;

  const record = { ...(node as Record<string, unknown>) };
  const allowDataInHostAvatar =
    parentKey.toLowerCase() === "hostavatar" || parentKey.toLowerCase() === "guestavatar";

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      record[key] = sanitizeMediaString(key, value, allowDataInHostAvatar);
      continue;
    }
    record[key] = walkAndSanitizeMedia(value, key, depth + 1);
  }
  return record;
};

const asWorkingTypebotMediaUrl = (raw: string): string => {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || isDataImageValue(trimmed)) return "";
  const normalized = normalizeTypebotMediaUrl(trimmed) || trimmed;
  if (isBrokenTypebotMediaUrl(normalized)) return "";
  return normalized;
};

/** Ícone/favicon já válidos no schema (upload do builder em Metadados). */
export const extractWorkingBrandIconUrl = (schema: Record<string, unknown>): string => {
  const icon = asWorkingTypebotMediaUrl(String(schema.icon ?? ""));
  if (icon) return icon;

  const settingsRaw = schema.settings;
  const settings =
    settingsRaw && typeof settingsRaw === "object"
      ? (settingsRaw as Record<string, unknown>)
      : null;
  const metadataRaw = settings?.metadata;
  const metadata =
    metadataRaw && typeof metadataRaw === "object"
      ? (metadataRaw as Record<string, unknown>)
      : null;
  const favIcon = asWorkingTypebotMediaUrl(String(metadata?.favIconUrl ?? ""));
  if (favIcon) return favIcon;

  return "";
};

/**
 * Metadados (icon/favIcon) e preview do chat (hostAvatar) são campos distintos no Typebot.
 * Quando o ícone já carrega no menu lateral mas a bolha quebra, copia a mesma URL para hostAvatar.
 */
export const alignHostAvatarFromBrandIcon = (
  schema: Record<string, unknown>,
  options?: { force?: boolean },
): Record<string, unknown> => {
  const brandIcon = extractWorkingBrandIconUrl(schema);
  if (!brandIcon) return schema;

  const force = options?.force === true;
  const next = { ...schema };
  const themeRaw = next.theme;
  const theme =
    themeRaw && typeof themeRaw === "object"
      ? ({ ...(themeRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const chatRaw = theme.chat;
  const chat =
    chatRaw && typeof chatRaw === "object"
      ? ({ ...(chatRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const hostAvatarRaw = chat.hostAvatar;
  const hostAvatar =
    hostAvatarRaw && typeof hostAvatarRaw === "object"
      ? ({ ...(hostAvatarRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const hostUrlRaw = String(hostAvatar.url ?? "").trim();
  const hostUrl = asWorkingTypebotMediaUrl(hostUrlRaw);
  const hostBroken = !hostUrlRaw || isBrokenTypebotMediaUrl(hostUrlRaw) || !hostUrl;

  if (!force && !hostBroken && hostUrl === brandIcon) {
    if (hostAvatar.isEnabled !== true) {
      hostAvatar.isEnabled = true;
      chat.hostAvatar = hostAvatar;
      theme.chat = chat;
      next.theme = theme;
    }
    return next;
  }

  if (force || hostBroken || hostUrl !== brandIcon) {
    hostAvatar.isEnabled = true;
    hostAvatar.url = brandIcon;
    chat.hostAvatar = hostAvatar;
    theme.chat = chat;
    next.theme = theme;
  }

  return next;
};

const resolveTenantIconAndAvatarUrls = (
  tenant: Tenant,
  preferredIconUrl?: string,
): { iconUrl: string; avatarUrl: string } => {
  const iconRaw = String(tenant.profileImageUrl ?? "").trim();
  const brandUrl = String(preferredIconUrl ?? "").trim() || resolveTenantBrandIconUrl(tenant);
  const iconHttpUrl =
    /^https?:\/\//i.test(iconRaw) && !/localhost|127\.0\.0\.1/i.test(iconRaw) ? iconRaw : "";
  const iconUrl = brandUrl || iconHttpUrl;
  const avatarUrl = iconUrl || (isDataImageValue(iconRaw) ? iconRaw : "");
  return { iconUrl, avatarUrl };
};

/** Reaplica logo do tenant em icon, hostAvatar e favIconUrl. */
export const applyTenantBrandMediaToTypebotSchema = (
  schema: Record<string, unknown>,
  tenant: Tenant,
  options?: { preferredIconUrl?: string; force?: boolean },
): Record<string, unknown> => {
  const next = { ...schema };
  const { iconUrl, avatarUrl } = resolveTenantIconAndAvatarUrls(tenant, options?.preferredIconUrl);
  if (!iconUrl && !avatarUrl) return next;

  const force = options?.force === true;
  const currentIcon = String(next.icon ?? "").trim();
  if (iconUrl && (force || isBrokenTypebotMediaUrl(currentIcon) || isDataImageValue(currentIcon))) {
    next.icon = iconUrl;
  }

  const settingsRaw = next.settings;
  const settings =
    settingsRaw && typeof settingsRaw === "object"
      ? ({ ...(settingsRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const metadataRaw = settings.metadata;
  const metadata =
    metadataRaw && typeof metadataRaw === "object"
      ? ({ ...(metadataRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const favRaw = String(metadata.favIconUrl ?? "").trim();
  if (iconUrl && (force || isBrokenTypebotMediaUrl(favRaw) || isDataImageValue(favRaw) || !favRaw)) {
    metadata.favIconUrl = iconUrl;
  }
  settings.metadata = metadata;
  next.settings = settings;

  const themeRaw = next.theme;
  const theme =
    themeRaw && typeof themeRaw === "object"
      ? ({ ...(themeRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const chatRaw = theme.chat;
  const chat =
    chatRaw && typeof chatRaw === "object"
      ? ({ ...(chatRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const hostAvatarRaw = chat.hostAvatar;
  const hostAvatar =
    hostAvatarRaw && typeof hostAvatarRaw === "object"
      ? ({ ...(hostAvatarRaw as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const hostUrl = String(hostAvatar.url ?? "").trim();
  if (avatarUrl && (force || isBrokenTypebotMediaUrl(hostUrl) || !hostUrl)) {
    hostAvatar.isEnabled = true;
    hostAvatar.url = avatarUrl.startsWith("http") ? avatarUrl : iconUrl || avatarUrl;
  }
  chat.hostAvatar = hostAvatar;
  theme.chat = chat;
  next.theme = theme;

  return next;
};

/** Remove data:image de icon/top-level e reescreve URLs localhost em groups/theme/settings. */
export const sanitizeTypebotSchemaMedia = (
  schema: Record<string, unknown>,
  tenant?: Tenant,
): Record<string, unknown> => {
  let next = walkAndSanitizeMedia({ ...schema }, "", 0) as Record<string, unknown>;

  const iconRaw = String(next.icon ?? "").trim();
  if (isDataImageValue(iconRaw)) {
    const replacement = tenant ? buildTenantPublicLogoUrl(tenant) : "";
    next.icon = replacement || null;
  } else if (iconRaw) {
    const normalizedIcon = normalizeTypebotMediaUrl(iconRaw);
    next.icon = normalizedIcon || null;
  }

  const imageRaw = String(next.image ?? "").trim();
  if (isDataImageValue(imageRaw)) {
    next.image = null;
  } else if (imageRaw) {
    const normalizedImage = normalizeTypebotMediaUrl(imageRaw);
    next.image = normalizedImage || null;
  }

  const titleRaw = String(next.title ?? "").trim();
  if (isDataImageValue(titleRaw)) next.title = "";

  const descriptionRaw = String(next.description ?? "").trim();
  if (isDataImageValue(descriptionRaw)) next.description = "";

  if (tenant) {
    next = applyTenantBrandMediaToTypebotSchema(next, tenant);
  }

  return alignHostAvatarFromBrandIcon(next);
};

export type TypebotStorageEnvDiagnostic = {
  level: "ok" | "warn" | "error";
  code: string;
  message: string;
};

/** Checklist para Easypanel (S3 no builder/viewer); API só documenta TYPEBOT_S3_PUBLIC_BASE_URL opcional. */
export const diagnoseTypebotStorageEnv = (): TypebotStorageEnvDiagnostic[] => {
  const items: TypebotStorageEnvDiagnostic[] = [];

  const avatarBase = resolveAvatarPublicBaseUrl();
  items.push({
    level: "ok",
    code: "avatar_public_base",
    message: `URLs públicas de logo: ${avatarBase}`,
  });

  const s3Public = resolveS3PublicBaseUrl();
  if (s3Public) {
    items.push({ level: "ok", code: "s3_public_base", message: `Reescrita MinIO: ${s3Public}` });
  } else {
    items.push({
      level: "warn",
      code: "s3_public_base_missing",
      message:
        "Defina TYPEBOT_S3_PUBLIC_BASE_URL ou S3_ENDPOINT na API para reescrever URLs localhost dos fluxos.",
    });
  }

  const customDomain = String(process.env.S3_PUBLIC_CUSTOM_DOMAIN ?? "").trim();
  if (customDomain) {
    items.push({
      level: "error",
      code: "s3_public_custom_domain",
      message: "Remova S3_PUBLIC_CUSTOM_DOMAIN do builder/viewer (causou 500 em generateUploadUrl).",
    });
  }

  const accessKey = String(process.env.S3_ACCESS_KEY ?? "").trim();
  if (accessKey.includes("@")) {
    items.push({
      level: "error",
      code: "s3_access_key_email",
      message: "S3_ACCESS_KEY não pode conter @ (invalid hostname no upload). Use key dedicada no MinIO.",
    });
  }

  return items;
};

export const logTypebotStorageEnvDiagnostics = (): void => {
  const diagnostics = diagnoseTypebotStorageEnv();
  for (const item of diagnostics) {
    const prefix = `[typebot-media] ${item.code}:`;
    if (item.level === "error") console.error(prefix, item.message);
    else if (item.level === "warn") console.warn(prefix, item.message);
    else console.log(prefix, item.message);
  }
};
