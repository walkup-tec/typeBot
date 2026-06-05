/**
 * Repara webhook + Redirect handoff nos typebots do workspace de um assinante (builder alvo).
 */
import { tenantRepository } from "../lib/repositories";
import {
  diagnoseHandoffSchema,
  listWorkspaceTypebotsOnTarget,
  repairHandoffForTypebotOnTarget,
} from "./typebot-builder.service";
import { fetchTypebotRecordOnTarget } from "./typebot-share-metadata.service";

const normalizeText = (value: string): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

export type RepairSubscriberHandoffTypebotResult = {
  typebotId: string;
  name: string;
  publicId: string;
  handoffPatched: boolean;
  before: ReturnType<typeof diagnoseHandoffSchema>;
  after: ReturnType<typeof diagnoseHandoffSchema>;
};

export type RepairSubscriberHandoffResult = {
  status: "ok" | "partial" | "failed";
  tenantId: string;
  workspaceId: string;
  scanned: number;
  patched: number;
  typebots: RepairSubscriberHandoffTypebotResult[];
  message: string;
};

const typebotMatchesFilter = (
  name: string,
  publicId: string,
  preferredPublicId: string,
): boolean => {
  const needle = normalizeText(preferredPublicId);
  if (needle) {
    const pid = normalizeText(publicId);
    if (pid && pid === needle) return true;
    const normalizedName = normalizeText(name);
    if (normalizedName.includes(needle.replace(/-/g, " ")) || normalizedName.includes(needle)) return true;
  }
  const normalizedName = normalizeText(name);
  return normalizedName.includes("emprestimo") && normalizedName.includes("clt");
};

export const repairSubscriberTenantHandoff = async (
  tenantId: string,
  preferredPublicId = "",
): Promise<RepairSubscriberHandoffResult> => {
  const tenant = tenantRepository.getById(String(tenantId ?? "").trim());
  if (!tenant?.id) {
    throw new Error("Assinante não encontrado.");
  }
  const workspaceId = String(tenant.typebotWorkspaceId ?? "").trim();
  if (!workspaceId) {
    throw new Error("Workspace Typebot do assinante não configurado.");
  }

  const rows = await listWorkspaceTypebotsOnTarget(workspaceId);
  const scoped: Array<{ id: string; name: string; publicId: string }> = [];
  for (const row of rows) {
    const typebotId = String(row.id ?? "").trim();
    if (!typebotId) continue;
    const schema = await fetchTypebotRecordOnTarget(typebotId);
    const publicId = String(schema?.publicId ?? "").trim();
    const name = String(schema?.name ?? schema?.title ?? row.name ?? "").trim();
    if (preferredPublicId.trim() && !typebotMatchesFilter(name, publicId, preferredPublicId)) {
      continue;
    }
    if (!preferredPublicId.trim() && !typebotMatchesFilter(name, publicId, "")) {
      continue;
    }
    scoped.push({ id: typebotId, name, publicId });
  }

  const targets =
    scoped.length > 0
      ? scoped
      : (
          await Promise.all(
            rows.map(async (row) => {
              const typebotId = String(row.id ?? "").trim();
              if (!typebotId) return null;
              const schema = await fetchTypebotRecordOnTarget(typebotId);
              return {
                id: typebotId,
                name: String(schema?.name ?? schema?.title ?? row.name ?? "").trim(),
                publicId: String(schema?.publicId ?? "").trim(),
              };
            }),
          )
        ).filter((row): row is { id: string; name: string; publicId: string } => Boolean(row));

  const typebots: RepairSubscriberHandoffTypebotResult[] = [];
  let patched = 0;

  for (const row of targets) {
    const schemaBefore = await fetchTypebotRecordOnTarget(row.id);
    const before =
      schemaBefore && typeof schemaBefore === "object"
        ? diagnoseHandoffSchema(schemaBefore)
        : diagnoseHandoffSchema({});
    const handoffPatched = await repairHandoffForTypebotOnTarget(row.id, tenant, {
      aggressiveSubscriber: true,
    });
    if (handoffPatched) patched += 1;
    const schemaAfter = await fetchTypebotRecordOnTarget(row.id);
    const after =
      schemaAfter && typeof schemaAfter === "object"
        ? diagnoseHandoffSchema(schemaAfter)
        : before;
    typebots.push({
      typebotId: row.id,
      name: row.name,
      publicId: row.publicId,
      handoffPatched,
      before,
      after,
    });
  }

  const status: RepairSubscriberHandoffResult["status"] =
    patched === 0 ? "failed" : patched < targets.length ? "partial" : "ok";

  return {
    status,
    tenantId: tenant.id,
    workspaceId,
    scanned: targets.length,
    patched,
    typebots,
    message:
      patched > 0
        ? `Handoff reparado em ${patched} typebot(s). Redirect deve usar {{url_direct}}; teste o viewer após limpar cache.`
        : "Nenhum typebot foi patchado. Verifique TYPEBOT_TARGET_BUILDER_API_* e se o fluxo tem blocos HTTP + Redirect.",
  };
};
