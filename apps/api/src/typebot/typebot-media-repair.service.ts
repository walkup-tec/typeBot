/**
 * Reparo em lote de mídia corrompida nos typebots do workspace do assinante.
 */
import { isSystemMasterEmail } from "../auth/system-master-auth";
import { tenantRepository } from "../lib/repositories";
import type { Tenant } from "../tenants/tenant.repository";
import {
  ensureTypebotShareMetadataPublished,
  readShareMetadataSnapshot,
  restoreShareMetadataExceptIcon,
} from "./typebot-share-metadata.service";
import { ensureTenantBrandLogoOnMinio } from "./typebot-brand-logo-minio.service";
import {
  alignHostAvatarFromBrandIcon,
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
const TYPEBOT_SOURCE_MASTER_WORKSPACE_ID = String(
  process.env.TYPEBOT_SOURCE_MASTER_WORKSPACE_ID ?? "",
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
  const safeName = String(workspace.name ?? fallbackName ?? "Workspace").trim() || "Workspace";

  let replacementIcon = "";
  try {
    replacementIcon = (await ensureTenantBrandLogoOnMinio(tenant)) || "";
  } catch (error) {
    console.warn(
      "[typebot-repair-media] upload logo MinIO (workspace):",
      error instanceof Error ? error.message : error,
    );
  }
  if (!replacementIcon || isBrokenTypebotMediaUrl(replacementIcon)) {
    replacementIcon =
      buildTenantPublicLogoUrl(tenant) || resolveTenantBrandIconUrl(tenant) || replacementIcon;
  }
  if (!replacementIcon) return false;

  const needsFix =
    !icon ||
    /^data:image\//i.test(icon) ||
    isBrokenTypebotMediaUrl(icon) ||
    icon !== replacementIcon;
  if (!needsFix) return false;

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

  const shareMetadataBeforeRepair = readShareMetadataSnapshot(payload.typebot);

  let preferredIconUrl = "";
  try {
    preferredIconUrl = (await ensureTenantBrandLogoOnMinio(tenant)) || "";
  } catch (error) {
    console.warn(
      "[typebot-repair-media] upload logo MinIO falhou:",
      error instanceof Error ? error.message : error,
    );
  }
  if (!preferredIconUrl || isBrokenTypebotMediaUrl(preferredIconUrl)) {
    preferredIconUrl =
      buildTenantPublicLogoUrl(tenant) || resolveTenantBrandIconUrl(tenant) || preferredIconUrl;
  }

  let sanitized = sanitizeTypebotSchemaMedia(payload.typebot, tenant);
  if (preferredIconUrl) {
    sanitized = applyTenantBrandMediaToTypebotSchema(sanitized, tenant, {
      preferredIconUrl,
      force: true,
    });
  }
  sanitized = alignHostAvatarFromBrandIcon(sanitized, { force: true });
  sanitized = restoreShareMetadataExceptIcon(sanitized, shareMetadataBeforeRepair);

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
  /** Workspaces reparados (tenant + matriz Walkup quando aplicável). */
  repairedWorkspaceIds: string[];
  workspaceIconCleared: boolean;
  typebots: Array<{
    id: string;
    name: string;
    workspaceId: string;
    patched: boolean;
    published: boolean;
    shareMetadata: boolean;
  }>;
  diagnostics: ReturnType<typeof diagnoseTypebotStorageEnv>;
};

const resolveWorkspaceIdsForRepair = (tenant: Tenant): string[] => {
  const ids = new Set<string>();
  const tenantWorkspaceId = String(tenant.typebotWorkspaceId ?? "").trim();
  if (tenantWorkspaceId) ids.add(tenantWorkspaceId);
  if (isSystemMasterEmail(tenant.ownerEmail) && TYPEBOT_SOURCE_MASTER_WORKSPACE_ID) {
    ids.add(TYPEBOT_SOURCE_MASTER_WORKSPACE_ID);
  }
  return [...ids];
};

export const repairTenantTypebotMediaOnTarget = async (tenantId: string): Promise<RepairTenantTypebotMediaResult> => {
  const tenant = tenantRepository.getById(String(tenantId ?? "").trim());
  if (!tenant) {
    throw new Error("Tenant não encontrado.");
  }
  if (!TYPEBOT_TARGET_BUILDER_API_BASE_URL || !TYPEBOT_TARGET_BUILDER_API_TOKEN) {
    throw new Error("TYPEBOT_TARGET_BUILDER_API_BASE_URL e token não configurados.");
  }

  const workspaceIds = resolveWorkspaceIdsForRepair(tenant);
  const primaryWorkspaceId = String(tenant.typebotWorkspaceId ?? "").trim() || workspaceIds[0] || null;
  const diagnostics = diagnoseTypebotStorageEnv();

  if (workspaceIds.length === 0) {
    return {
      tenantId: tenant.id,
      workspaceId: null,
      repairedWorkspaceIds: [],
      workspaceIconCleared: false,
      typebots: [],
      diagnostics,
    };
  }

  let workspaceIconCleared = false;
  const typebots: RepairTenantTypebotMediaResult["typebots"] = [];

  for (const workspaceId of workspaceIds) {
    const iconFixed = await sanitizeWorkspaceIconOnTarget(
      workspaceId,
      String(tenant.typebotWorkspaceName ?? tenant.name ?? "Workspace"),
      tenant,
    );
    workspaceIconCleared = workspaceIconCleared || iconFixed;

    const bots = await listWorkspaceTypebotIds(workspaceId);
    for (const bot of bots) {
      const result = await repairSingleTypebotOnTarget(bot.id, tenant);
      typebots.push({ id: bot.id, name: bot.name, workspaceId, ...result });
    }
  }

  return {
    tenantId: tenant.id,
    workspaceId: primaryWorkspaceId,
    repairedWorkspaceIds: workspaceIds,
    workspaceIconCleared,
    typebots,
    diagnostics,
  };
};
