import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findSystemMasterTenant } from "../auth/system-master-auth";
import { tenantRepository } from "../lib/repositories";

const defaultLogoPath = () => resolve(__dirname, "..", "..", "assets", "logo-walkup.png");

const resolveLogoFilePath = (): string => {
  const fromEnv = String(process.env.API_SYSTEM_MASTER_LOGO_PATH ?? "").trim();
  return fromEnv ? resolve(fromEnv) : defaultLogoPath();
};

const toDataUrl = (filePath: string): string | null => {
  if (!existsSync(filePath)) return null;
  const lower = filePath.toLowerCase();
  const mime = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  const buffer = readFileSync(filePath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
};

/** Aplica LOGO WALKUP como profileImageUrl do assinante matriz (walkup@walkuptec.com.br). */
export async function ensureSystemMasterBrandingOnBoot(): Promise<void> {
  if (String(process.env.API_SYSTEM_MASTER_SKIP_LOGO_BOOT ?? "").trim().toLowerCase() === "true") {
    return;
  }

  const tenant = findSystemMasterTenant();
  if (!tenant?.id) return;

  const dataUrl = toDataUrl(resolveLogoFilePath());
  if (!dataUrl) {
    // eslint-disable-next-line no-console
    console.warn("[branding] Logo do Master do Sistema não encontrada (apps/api/assets/logo-walkup.png).");
    return;
  }

  const force = String(process.env.API_SYSTEM_MASTER_FORCE_LOGO ?? "").trim().toLowerCase() === "true";
  const current = String(tenant.profileImageUrl ?? "").trim();
  if (current.length > 0 && !force) return;

  tenantRepository.updateProfileImage(tenant.id, dataUrl);
  // eslint-disable-next-line no-console
  console.log(`[branding] Logo Walkup aplicada ao assinante matriz (${tenant.ownerEmail ?? tenant.id}).`);
}
