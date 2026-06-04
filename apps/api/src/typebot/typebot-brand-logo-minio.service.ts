/**
 * Publica logo do tenant no MinIO (prefixo public/) para o Typebot carregar icon/avatar.
 * Imagens do fluxo já usam typebot-minio; icon em app.chattypebot.com costuma falhar no builder.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Tenant } from "../tenants/tenant.repository";
import { resolveS3PublicBaseUrl } from "./typebot-media-sanitize.service";

const LOGO_OBJECT_PREFIX = "public/branding";

const parseDataImage = (raw: string): { buffer: Buffer; contentType: string } | null => {
  const match = String(raw ?? "")
    .trim()
    .match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/i);
  if (!match) return null;
  try {
    return {
      contentType: match[1],
      buffer: Buffer.from(match[2].replace(/\s/g, ""), "base64"),
    };
  } catch {
    return null;
  }
};

const resolveS3Client = (): S3Client | null => {
  const accessKey = String(process.env.S3_ACCESS_KEY ?? process.env.TYPEBOT_S3_ACCESS_KEY ?? "").trim();
  const secretKey = String(process.env.S3_SECRET_KEY ?? process.env.TYPEBOT_S3_SECRET_KEY ?? "").trim();
  const endpointRaw = String(process.env.S3_ENDPOINT ?? process.env.TYPEBOT_S3_ENDPOINT ?? "").trim();
  if (!accessKey || !secretKey || !endpointRaw) return null;

  const host = endpointRaw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const port = String(process.env.S3_PORT ?? "443").trim();
  const ssl = String(process.env.S3_SSL ?? "true").toLowerCase() !== "false";
  const protocol = ssl ? "https" : "http";
  const endpoint =
    port && port !== "443" && port !== "80" ? `${protocol}://${host}:${port}` : `${protocol}://${host}`;

  return new S3Client({
    region: String(process.env.S3_REGION ?? process.env.MINIO_REGION ?? "us-east-1"),
    endpoint,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: true,
  });
};

const logoObjectKey = (tenantId: string, contentType: string): string => {
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : contentType.includes("gif")
        ? "gif"
        : "jpg";
  return `${LOGO_OBJECT_PREFIX}/${tenantId}/logo.${ext}`;
};

export const buildTenantBrandLogoMinioPublicUrl = (tenant: Tenant): string => {
  const publicBase = resolveS3PublicBaseUrl();
  const tenantId = String(tenant.id ?? "").trim();
  if (!publicBase || !tenantId) return "";
  const logo = String(tenant.profileImageUrl ?? "").trim();
  if (!logo) return "";
  const parsed = parseDataImage(logo);
  const ext = parsed
    ? parsed.contentType.includes("png")
      ? "png"
      : parsed.contentType.includes("webp")
        ? "webp"
        : parsed.contentType.includes("gif")
          ? "gif"
          : "jpg"
    : "png";
  return `${publicBase}/branding/${tenantId}/logo.${ext}`;
};

/** Envia logo do tenant ao MinIO; retorna URL pública no mesmo host das imagens do fluxo. */
export const ensureTenantBrandLogoOnMinio = async (tenant: Tenant): Promise<string> => {
  const publicUrl = buildTenantBrandLogoMinioPublicUrl(tenant);
  if (!publicUrl) return "";

  const client = resolveS3Client();
  const bucket = String(process.env.S3_BUCKET ?? "typebot").trim() || "typebot";
  if (!client) {
    console.warn("[typebot-brand-logo] S3 não configurado na API — usando fallback /api/public/tenants/.../logo");
    return "";
  }

  const logo = String(tenant.profileImageUrl ?? "").trim();
  const parsed = parseDataImage(logo);
  if (!parsed) {
    return "";
  }

  const key = logoObjectKey(tenant.id, parsed.contentType);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: parsed.buffer,
      ContentType: parsed.contentType,
      CacheControl: "public, max-age=300",
    }),
  );

  return publicUrl;
};
