/** Tenant matriz Walkup e fluxos que não devem ser replicados em assinantes. */

export const WALKUP_MASTER_OWNER_EMAIL = "walkup@walkuptec.com.br";

export const normalizeScopeText = (value: string | undefined): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

export const isWalkupMasterTenant = (tenant: { ownerEmail?: string | null } | undefined): boolean =>
  normalizeScopeText(tenant?.ownerEmail ?? undefined) === normalizeScopeText(WALKUP_MASTER_OWNER_EMAIL);

/** Fluxo exclusivo do workspace Drax/Walkup — não importar em assinantes (ex.: Soma). */
export const isMasterExclusiveTypebotLabel = (name: string | undefined): boolean => {
  const normalized = normalizeScopeText(name);
  return normalized === "drax sistemas" || normalized === "drax systems";
};

export const isMasterExclusiveTypebotPublicId = (publicId: string | undefined): boolean => {
  const id = String(publicId ?? "").trim().toLowerCase();
  return id.startsWith("drax-sistemas");
};
