/**
 * Reparo em lote de mídia corrompida nos typebots do workspace do assinante.
 */
import { tenantRepository } from "../lib/repositories";
import type { Tenant } from "../tenants/tenant.repository";
import { ensureTypebotShareMetadataPublished } from "./typebot-share-metadata.service";
import { ensureTenantBrandLogoOnMinio } from "./typebot-brand-logo-minio.service";
import {
  applyTenantBrandMediaToTypebotSchema,
  buildTenantPublicLogoUrl,
  diagnoseTypebotStorageEnv,
  isBrokenTypebotMediaUrl,
  resolveTenantBrandIconUrl,
  sanitizeTypebotSchemaMedia,
} from "./typebot-media-sanitize.service";

const TYPEBOT_TARGET_BUILDER_API_BASE_URL = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_BASE_URL ?? process.env.TYPEBOT_BUILDER_API_BASE_URL ?? "",
).trim();
const TYPEBOT_TARGET_BUILDER_API_TOKEN = String(
  process.env.TYPEBOT_TARGET_BUILDER_API_TOKEN ?? process.env.TYPEBOT_BUILDER_API_TOKEN ?? "",
).trim();

const buildTargetHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  Authorization: `Bearer ${TYPEBOT_TARGET_BUILDER_API_TOKEN}`,
});

const sanitizeWorkspaceIconOnTarget = async (
  workspaceId: string,
  fallbackName: string,
  tenant: Tenant,
): Promise<boolean> => {
  if (!TYPEBOT_TARGET_BUILDER_API_BASE_URL || !TYPEBOT_TARGET_BUILDER_API_TOKEN) return false;
  const normalizedWorkspaceId = String(workspaceId ?? "").trim();
  if (!normalizedWorkspaceId) return false;

  const response = await fetch(`${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/workspaces`, {
    method: "GET",
    headers: buildTargetHeaders(),
  });
  if (!response.ok) return false;

  const payload = (await response.json()) as {
    workspaces?: Array<{ id?: string | null; name?: string | null; icon?: string | null }>;
  };
  const workspace = (payload.workspaces ?? []).find(
    (item) => String(item?.id ?? "").trim() === normalizedWorkspaceId,
  );
  if (!workspace) return false;

  const icon = String(workspace.icon ?? "").trim();
  const needsFix = /^data:image\//i.test(icon) || isBrokenTypebotMediaUrl(icon);
  if (!needsFix) return false;

  const safeName = String(workspace.name ?? fallbackName ?? "Workspace").trim() || "Workspace";
  const replacementIcon = resolveTenantBrandIconUrl(tenant) || buildTenantPublicLogoUrl(tenant) || "";
  const patch = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/workspaces/${encodeURIComponent(normalizedWorkspaceId)}`,
    {
      method: "PATCH",
      headers: buildTargetHeaders(),
      body: JSON.stringify({ name: safeName, icon: replacementIcon }),
    },
  );
  return patch.ok;
};

const listWorkspaceTypebotIds = async (workspaceId: string): Promise<Array<{ id: string; name: string }>> => {
  if (!TYPEBOT_TARGET_BUILDER_API_BASE_URL || !TYPEBOT_TARGET_BUILDER_API_TOKEN) return [];
  const response = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: "GET", headers: buildTargetHeaders() },
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    typebots?: Array<{ id?: string | null; name?: string | null }>;
  };
  return (payload.typebots ?? [])
    .map((row) => ({
      id: String(row?.id ?? "").trim(),
      name: String(row?.name ?? "").trim() || "Fluxo",
    }))
    .filter((row) => Boolean(row.id));
};

const publishTypebotOnTarget = async (typebotId: string): Promise<void> => {
  const attempts: Array<{ method: "POST" | "PATCH"; url: string; body?: Record<string, unknown> }> = [
    {
      method: "POST",
      url: `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}/publish`,
    },
    {
      method: "POST",
      url: `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}/publications`,
    },
    {
      method: "PATCH",
      url: `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`,
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

const repairSingleTypebotOnTarget = async (
  typebotId: string,
  tenant: Tenant,
): Promise<{ patched: boolean; published: boolean; shareMetadata: boolean }> => {
  const getResponse = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}?migrateToLatestVersion=true`,
    { method: "GET", headers: buildTargetHeaders() },
  );
  if (!getResponse.ok) {
    return { patched: false, published: false, shareMetadata: false };
  }

  const payload = (await getResponse.json()) as { typebot?: Record<string, unknown> };
  if (!payload.typebot || typeof payload.typebot !== "object") {
    return { patched: false, published: false, shareMetadata: false };
  }

  let preferredIconUrl = "";
  try {
    preferredIconUrl = (await ensureTenantBrandLogoOnMinio(tenant)) || resolveTenantBrandIconUrl(tenant);
  } catch (error) {
    console.warn(
      "[typebot-repair-media] upload logo MinIO falhou:",
      error instanceof Error ? error.message : error,
    );
    preferredIconUrl = resolveTenantBrandIconUrl(tenant);
  }

  let sanitized = sanitizeTypebotSchemaMedia(payload.typebot, tenant);
  if (preferredIconUrl) {
    sanitized = applyTenantBrandMediaToTypebotSchema(sanitized, tenant, {
      preferredIconUrl,
      force: true,
    });
  }

  const patchResponse = await fetch(
    `${TYPEBOT_TARGET_BUILDER_API_BASE_URL}/v1/typebots/${encodeURIComponent(typebotId)}`,
    {
      method: "PATCH",
      headers: buildTargetHeaders(),
      body: JSON.stringify({
        typebot: {
          title: sanitized.title,
          description: sanitized.description,
          icon: sanitized.icon,
          image: sanitized.image,
          theme: sanitized.theme,
          settings: sanitized.settings,
          groups: sanitized.groups,
        },
      }),
    },
  );

  let published = false;
  if (patchResponse.ok) {
    try {
      await publishTypebotOnTarget(typebotId);
      published = true;
    } catch {
      published = false;
    }
  }

  const shareResult = await ensureTypebotShareMetadataPublished(typebotId);

  return {
    patched: patchResponse.ok,
    published,
    shareMetadata: shareResult.metadataPatched || shareResult.published,
  };
};

export type RepairTenantTypebotMediaResult = {
  tenantId: string;
  workspaceId: string | null;
  workspaceIconCleared: boolean;
  typebots: Array<{ id: string; name: string; patched: boolean; published: boolean; shareMetadata: boolean }>;
  diagnostics: ReturnType<typeof diagnoseTypebotStorageEnv>;
};

export const repairTenantTypebotMediaOnTarget = async (tenantId: string): Promise<RepairTenantTypebotMediaResult> => {
  const tenant = tenantRepository.getById(String(tenantId ?? "").trim());
  if (!tenant) {
    throw new Error("Tenant não encontrado.");
  }
  if (!TYPEBOT_TARGET_BUILDER_API_BASE_URL || !TYPEBOT_TARGET_BUILDER_API_TOKEN) {
    throw new Error("TYPEBOT_TARGET_BUILDER_API_BASE_URL e token não configurados.");
  }

  const workspaceId = String(tenant.typebotWorkspaceId ?? "").trim();
  const diagnostics = diagnoseTypebotStorageEnv();

  if (!workspaceId) {
    return {
      tenantId: tenant.id,
      workspaceId: null,
      workspaceIconCleared: false,
      typebots: [],
      diagnostics,
    };
  }

  const workspaceIconCleared = await sanitizeWorkspaceIconOnTarget(
    workspaceId,
    String(tenant.typebotWorkspaceName ?? tenant.name ?? "Workspace"),
    tenant,
  );

  const bots = await listWorkspaceTypebotIds(workspaceId);
  const typebots: RepairTenantTypebotMediaResult["typebots"] = [];

  for (const bot of bots) {
    const result = await repairSingleTypebotOnTarget(bot.id, tenant);
    typebots.push({ id: bot.id, name: bot.name, ...result });
  }

  return {
    tenantId: tenant.id,
    workspaceId,
    workspaceIconCleared,
    typebots,
    diagnostics,
  };
};
