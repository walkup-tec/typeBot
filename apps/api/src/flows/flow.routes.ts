import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { loadFlowLibrary } from "./flow-library.repository";
import {
  listMasterLibrarySourceFlows,
  resolveMasterSourceFlowForPromote,
  syncSourceWorkspaceFlowsToMasterTenant,
} from "./source-master-sync.service";
import { flowRepository, queueRepository, tenantRepository } from "../lib/repositories";
import {
  getSystemMasterLibraryById,
  getSystemMasterLibraryBySourceFlowId,
  listSystemMasterLibrary,
  removeSystemMasterLibraryById,
  upsertSystemMasterLibrary,
} from "./system-master-library.repository";
import {
  FlowService,
  createFlowSchema,
  createFlowFromLibrarySchema,
  updateFlowThemeSchema,
  updateFlowDisplayLabelSchema,
} from "./flow.service";
import { isFlowUrlActive, probeFlowUrlStatus } from "../lib/flow-url-health";
import { attachFlowActiveStatus, invalidateWorkspaceListCache } from "../lib/typebot-flow-publish-status";
import { typebotPublicIdFromViewerUrl } from "../lib/typebot-public-id";
import {
  ensureTenantFlowsLinkedToWorkspace,
  refreshFlowViewerUrlFromTypebot,
  refreshTenantFlowViewerUrls,
  refreshTenantWorkspaceFlowUrlsFromTypebot,
} from "../typebot/typebot-flow-viewer-url-sync";
import { recoverTenantWorkspaceTypebotsFromVestiges } from "../typebot/recover-tenant-workspace-typebots.service";
import { isWalkupMasterTenant } from "../typebot/tenant-master-scope";
import { repairTenantTypebotMediaOnTarget } from "../typebot/typebot-media-repair.service";
import {
  listSubscriberTenantFlowsForMaster,
  propagateDefaultsToSubscriberWorkspacesInBackground,
  repairSubscriberTenantFlowsOnDisk,
  syncSubscriberFlowsForListing,
  propagateSystemDefaultFlowToAllTenants,
  repairAllSubscriberDefaultsOnBoot,
} from "./subscriber-default-flows.service";
import {
  ensureTypebotShareMetadataPublished,
  getTypebotShareMetadataSnapshot,
} from "../typebot/typebot-share-metadata.service";
import {
  removeSystemDefaultFromSubscriberWorkspaces,
  syncSystemDefaultsToRealTypebotWorkspace,
} from "../typebot/typebot-builder.service";
import { findSystemMasterTenant, SYSTEM_MASTER_OWNER_EMAIL } from "../auth/system-master-auth";
import { purgeExtraSaasUsers } from "../master/purge-extra-users.service";

const flowService = new FlowService(flowRepository);
const MASTER_SOURCE_EMAIL = SYSTEM_MASTER_OWNER_EMAIL;
const normalizeText = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();
const isMasterSourceTenant = (ownerEmail: string | undefined): boolean =>
  normalizeText(ownerEmail) === normalizeText(MASTER_SOURCE_EMAIL);

const slugifyFlowNickname = (value: string): string =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 120);

const inferViewerBaseUrl = (tenantId: string): string => {
  const explicit = String(process.env.TYPEBOT_TARGET_VIEWER_BASE_URL ?? process.env.TYPEBOT_SOURCE_VIEWER_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const fromTenantFlow = flowRepository.listByTenant(tenantId).map((flow) => flow.url).find((url) => /^https?:\/\//i.test(url));
  if (fromTenantFlow) {
    try {
      const parsed = new URL(fromTenantFlow);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // noop
    }
  }
  return "";
};

const ensureTenantFlowLibraryFromQueue = (tenantId: string): void => {
  const queueItems = queueRepository.listByTenant(tenantId);
  if (queueItems.length === 0) return;
  const current = flowRepository.listByTenant(tenantId);
  const viewerBase = inferViewerBaseUrl(tenantId);
  const normalize = (value: string) => normalizeText(value);

  for (const item of queueItems) {
    const label = String(item.sourceFlowLabel ?? "").trim();
    if (label.length < 2) continue;
    const labelToken = normalize(label);
    const exists = current.some((flow) => {
      const publicIdFromUrl = typebotPublicIdFromViewerUrl(flow.url);
      return (
        normalize(flow.nickname) === labelToken ||
        normalize(flow.displayLabel ?? "") === labelToken ||
        normalize(flow.typebotPublicId ?? "") === labelToken ||
        normalize(publicIdFromUrl) === labelToken
      );
    });
    if (exists) continue;

    let nickname = slugifyFlowNickname(label);
    if (nickname.length < 2) nickname = `fluxo-${Date.now()}`;
    if (current.some((flow) => normalize(flow.nickname) === normalize(nickname))) {
      nickname = `${nickname}-${Date.now().toString().slice(-4)}`;
    }
    const looksLikePublicId = !/^https?:\/\//i.test(label) && !/\s/.test(label);
    const url = looksLikePublicId && viewerBase ? `${viewerBase}/${encodeURIComponent(label)}` : `https://placeholder.local/${encodeURIComponent(label)}`;
    const created = flowRepository.create({
      id: randomUUID(),
      tenantId,
      createdAt: new Date().toISOString(),
      nickname,
      displayLabel: label,
      url,
      typebotPublicId: looksLikePublicId ? label : undefined,
    });
    current.push(created);
  }
};

const selfHealTenantFlowViewerUrls = async (tenantId: string): Promise<void> => {
  const flows = flowRepository.listByTenant(tenantId);
  for (const flow of flows) {
    const currentUrl = String(flow.url ?? "").trim();
    if (!currentUrl) continue;
    const probe = await probeFlowUrlStatus(currentUrl);
    if (probe.status !== "active") continue;
    if (!probe.fallbackUrl || probe.resolvedUrl === currentUrl) continue;
    const patch: { url: string; typebotPublicId?: string } = { url: probe.resolvedUrl };
    const publicId = typebotPublicIdFromViewerUrl(probe.resolvedUrl);
    if (publicId) patch.typebotPublicId = publicId;
    flowRepository.updateById(flow.id, patch);
  }
};
const applyTenantLogoAsBotAvatar = <T extends { tenantId: string; redirectTheme?: { profileImageUrl?: string } }>(flow: T): T => {
  const tenant = tenantRepository.getById(flow.tenantId);
  const tenantLogo = String(tenant?.profileImageUrl ?? "").trim();
  if (!tenantLogo) return flow;
  return {
    ...flow,
    redirectTheme: {
      ...(flow.redirectTheme ?? {}),
      profileImageUrl: tenantLogo,
    },
  };
};

const removeSystemDefaultFlowFromAllTenants = async (payload: {
  sourceFlowId: string;
  sourceFlowUrl: string;
  title: string;
}) => {
  const tenants = tenantRepository.list();
  for (const tenant of tenants) {
    const ownerEmail = normalizeText(tenant.ownerEmail);
    if (!tenant.id || ownerEmail === MASTER_SOURCE_EMAIL) continue;
    const flows = flowService.listByTenant(tenant.id);
    const toRemove = flows.filter(
      (flow) =>
        normalizeText(flow.librarySourceId) === normalizeText(payload.sourceFlowId) ||
        normalizeText(flow.url) === normalizeText(payload.sourceFlowUrl) ||
        normalizeText(flow.displayLabel) === normalizeText(payload.title),
    );
    for (const flow of toRemove) {
      flowService.remove(flow.id);
    }
  }
  await removeSystemDefaultFromSubscriberWorkspaces({
    id: "",
    sourceFlowId: payload.sourceFlowId,
    title: payload.title,
    description: "",
    suggestedNickname: "",
    viewerUrl: payload.sourceFlowUrl,
    isSystemDefault: true,
    createdAt: "",
    updatedAt: "",
  });
};

export const registerFlowRoutes = (app: Express) => {
  const handleSourceFlowsRequest = async (_req: Request, res: Response) => {
    try {
      const withTypebotAlias = await listMasterLibrarySourceFlows();

      // Regra operacional: todo fluxo ativo da matriz deve ser importado para workspaces dos assinantes.
      try {
        const tenants = tenantRepository.list();
        const defaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
        const subscribers = tenants.filter((tenant) => normalizeText(tenant.ownerEmail) !== MASTER_SOURCE_EMAIL);
        void Promise.allSettled(subscribers.map((tenant) => syncSystemDefaultsToRealTypebotWorkspace(tenant.id, defaults)));
      } catch {
        // Não impede a listagem dos fluxos da master.
      }

      return res.status(200).json(withTypebotAlias);
    } catch {
      return res.status(200).json([]);
    }
  };

  app.get("/api/master/system-library/source-flows", handleSourceFlowsRequest);

  app.post("/api/master/system-library/repair-matrix-handoff", async (req, res) => {
    const preferredPublicId = String(req.body?.publicId ?? req.query?.publicId ?? "emprestimo-clt").trim();
    try {
      const { repairMatrixEmprestimoCltHandoff } = await import("../typebot/typebot-matrix-handoff-repair.service.js");
      const result = await repairMatrixEmprestimoCltHandoff(preferredPublicId || "emprestimo-clt");
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({
        status: "failed",
        message: error instanceof Error ? error.message : "Falha ao reparar handoff da matriz CLT.",
      });
    }
  });

  app.post("/api/master/system-library/sync-source", async (_req, res) => {
    try {
      const result = await syncSourceWorkspaceFlowsToMasterTenant();
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Falha ao sincronizar matriz Typebot.",
      });
    }
  });

  app.get("/api/master/system-library", (_req, res) => {
    return res.status(200).json(listSystemMasterLibrary());
  });

  app.post("/api/master/system/purge-extra-users", async (_req, res) => {
    try {
      const result = await purgeExtraSaasUsers();
      return res.status(200).json({ status: "ok", ...result });
    } catch (error) {
      return res.status(500).json({
        status: "failed",
        message: error instanceof Error ? error.message : "Falha ao purgar usuários extras.",
      });
    }
  });

  app.post("/api/master/system/repair-walkup-master-media", async (_req, res) => {
    const masterTenant = findSystemMasterTenant();
    if (!masterTenant?.id) {
      return res.status(404).json({
        status: "failed",
        message: "Assinante matriz Walkup (walkup@walkuptec.com.br) não encontrado.",
      });
    }
    const masterWorkspaceId = String(process.env.TYPEBOT_SOURCE_MASTER_WORKSPACE_ID ?? "").trim();
    if (!masterWorkspaceId) {
      return res.status(400).json({
        status: "failed",
        message:
          "Defina TYPEBOT_SOURCE_MASTER_WORKSPACE_ID na API (Easypanel) com o ID do workspace Walkup no builder.",
      });
    }
    try {
      const result = await repairTenantTypebotMediaOnTarget(masterTenant.id);
      return res.status(200).json({
        status: "ok",
        ownerEmail: masterTenant.ownerEmail,
        masterWorkspaceId,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({
        status: "failed",
        message: error instanceof Error ? error.message : "Falha ao reparar mídia do workspace matriz Walkup.",
      });
    }
  });

  app.post("/api/master/system-library/repair-subscriber-defaults", async (_req, res) => {
    try {
      const result = await repairAllSubscriberDefaultsOnBoot();
      return res.status(200).json({ status: "ok", ...result });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Falha ao reparar fluxos padrão nos assinantes.",
      });
    }
  });

  app.post("/api/master/system-library/promote", async (req, res) => {
    const sourceFlowId = String(req.body?.sourceFlowId ?? "").trim();
    if (!sourceFlowId) {
      return res.status(400).json({ message: "sourceFlowId é obrigatório." });
    }
    const promoteTitle = String(req.body?.title ?? "").trim();
    const sourceFlow = await resolveMasterSourceFlowForPromote(sourceFlowId, {
      typebotRemoteId: String(req.body?.typebotRemoteId ?? "").trim() || undefined,
      typebotPublicId: String(req.body?.typebotPublicId ?? "").trim() || undefined,
      url: String(req.body?.url ?? "").trim() || undefined,
      displayName: promoteTitle.length >= 2 ? promoteTitle : undefined,
    });
    if (!sourceFlow) {
      return res.status(404).json({
        message:
          "Fluxo de origem não encontrado. Clique em Atualizar lista na Biblioteca Master e tente novamente.",
      });
    }
    const resolvedSourceFlowId = sourceFlow.id;
    const existing = getSystemMasterLibraryBySourceFlowId(resolvedSourceFlowId);
    const title = promoteTitle;
    if (title.length < 2) {
      return res.status(400).json({ message: "Informe um título com pelo menos 2 caracteres para definir como padrão." });
    }
    const description = String(req.body?.description ?? "Fluxo padrão disponibilizado pela Biblioteca Master.").trim();
    const row = upsertSystemMasterLibrary({
      id: existing?.id ?? randomUUID(),
      sourceFlowId: resolvedSourceFlowId,
      title,
      description: description || "Fluxo padrão disponibilizado pela Biblioteca Master.",
      suggestedNickname: sourceFlow.nickname,
      viewerUrl: sourceFlow.url,
      isSystemDefault: true,
    });
    // Preserva o título definido como padrão no fluxo de origem para reaproveito ao remover/publicar novamente.
    flowRepository.updateById(sourceFlow.id, { displayLabel: title });
    propagateSystemDefaultFlowToAllTenants({
      libraryItemId: row.id,
      sourceFlowId: sourceFlow.id,
      title: row.title,
      sourceFlowNickname: sourceFlow.nickname,
      sourceFlowUrl: sourceFlow.url,
    });
    const defaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
    propagateDefaultsToSubscriberWorkspacesInBackground(defaults);
    return res.status(200).json(row);
  });

  app.delete("/api/master/system-library/:id", async (req, res) => {
    const current = getSystemMasterLibraryById(req.params.id);
    if (!current) return res.status(404).json({ message: "Item não encontrado." });
    const ok = removeSystemMasterLibraryById(req.params.id);
    if (!ok) return res.status(404).json({ message: "Item não encontrado." });
    await removeSystemDefaultFlowFromAllTenants({
      sourceFlowId: current.sourceFlowId,
      sourceFlowUrl: current.viewerUrl,
      title: current.title,
    });
    return res.status(204).send();
  });

  app.get("/api/master/flow-library", (_req, res) => {
    return res.status(200).json(loadFlowLibrary());
  });

  app.post("/api/master/tenants/:tenantId/flows/sync-workspace", async (req, res) => {
    const tenantId = String(req.params.tenantId ?? "").trim();
    if (!tenantId) {
      return res.status(400).json({ message: "tenantId obrigatório." });
    }
    try {
      const tenant = tenantRepository.getById(tenantId);
      const recovery = tenant && isWalkupMasterTenant(tenant)
        ? await recoverTenantWorkspaceTypebotsFromVestiges(tenantId)
        : { skipped: true, reason: "recovery_only_for_walkup_master_tenant" };
      await syncSubscriberFlowsForListing(tenantId);
      const dedupe = await repairSubscriberTenantFlowsOnDisk(tenantId);
      let typebotMediaRepair: Awaited<ReturnType<typeof repairTenantTypebotMediaOnTarget>> | null = null;
      try {
        typebotMediaRepair = await repairTenantTypebotMediaOnTarget(tenantId);
      } catch (repairError) {
        console.warn(
          "[sync-workspace] repair typebot media:",
          repairError instanceof Error ? repairError.message : repairError,
        );
      }
      const tenantAfter = tenantRepository.getById(tenantId);
      invalidateWorkspaceListCache(String(tenantAfter?.typebotWorkspaceId ?? "").trim());
      const flowCount = flowService.listByTenant(tenantId).length;
      return res.status(200).json({ status: "ok", flowCount, dedupe, recovery, typebotMediaRepair });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Falha ao sincronizar workspace Typebot.",
      });
    }
  });

  app.get("/api/master/flows/:flowId/share-preview", async (req, res) => {
    const flow = flowRepository.getById(String(req.params.flowId ?? "").trim());
    if (!flow) return res.status(404).json({ message: "Flow not found" });
    const remoteId = String(flow.typebotRemoteId ?? "").trim();
    const viewerUrl = String(flow.url ?? "").trim();

    let builderMetadata: Awaited<ReturnType<typeof getTypebotShareMetadataSnapshot>> = null;
    if (remoteId) {
      try {
        builderMetadata = await getTypebotShareMetadataSnapshot(remoteId);
      } catch {
        builderMetadata = null;
      }
    }

    let viewerOg: Record<string, string> = {};
    if (viewerUrl) {
      try {
        const response = await fetch(viewerUrl, {
          method: "GET",
          headers: { "user-agent": "facebookexternalhit/1.1" },
          redirect: "follow",
        });
        const html = await response.text();
        const pick = (prop: string): string => {
          const re = new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, "i");
          const match = html.match(re);
          return match?.[1] ? match[1].trim() : "";
        };
        viewerOg = {
          httpStatus: String(response.status),
          title: pick("og:title"),
          description: pick("og:description"),
          image: pick("og:image"),
          robotsNoindex: /<meta[^>]+name="robots"[^>]+content="noindex"/i.test(html) ? "yes" : "no",
        };
      } catch (error) {
        viewerOg = {
          error: error instanceof Error ? error.message : "Falha ao ler viewer",
        };
      }
    }

    return res.status(200).json({
      flowId: flow.id,
      viewerUrl,
      builderMetadata,
      viewerOg,
      hint:
        builderMetadata && !builderMetadata.allowIndexing
          ? "Ative 'Permitir indexação' no Typebot ou rode sync-workspace após deploy da API."
          : undefined,
    });
  });

  app.post("/api/master/flows/:flowId/publish-share-metadata", async (req, res) => {
    const flow = flowRepository.getById(String(req.params.flowId ?? "").trim());
    if (!flow) return res.status(404).json({ message: "Flow not found" });
    const remoteId = String(flow.typebotRemoteId ?? "").trim();
    if (!remoteId) {
      return res.status(400).json({ message: "Fluxo sem vínculo com typebot no workspace." });
    }
    try {
      const result = await ensureTypebotShareMetadataPublished(remoteId);
      return res.status(200).json({ flowId: flow.id, ...result });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Falha ao republicar metadados.",
      });
    }
  });

  app.get("/api/master/tenants/:tenantId/flows", async (req, res) => {
    const tenantId = String(req.params.tenantId ?? "").trim();
    const quick =
      String(req.query.quick ?? "").trim() === "1" || String(req.query.quick ?? "").toLowerCase() === "true";
    const forceSync =
      String(req.query.sync ?? "").trim() === "1" || String(req.query.sync ?? "").toLowerCase() === "true";
    const tenant = tenantRepository.getById(tenantId);
    const hasTypebotWorkspace = Boolean(String(tenant?.typebotWorkspaceId ?? "").trim());

    if (!quick) {
      try {
        await refreshTenantWorkspaceFlowUrlsFromTypebot(tenantId);
      } catch {
        // realinha publicId após renomear bot no Typebot
      }
    }

    if (!hasTypebotWorkspace) {
      if (!quick) {
        try {
          await refreshTenantFlowViewerUrls(tenantId);
        } catch {
          // listagem ainda entrega; URLs podem ser corrigidas no "Copiar link" ou após sync
        }
      }
      ensureTenantFlowLibraryFromQueue(tenantId);
    }

    if (!quick) {
      try {
        await selfHealTenantFlowViewerUrls(tenantId);
      } catch {
        // auto-heal best-effort: não bloqueia listagem de fluxos
      }
    }

    let flows = flowService.listByTenant(tenantId);
    if (hasTypebotWorkspace && !isMasterSourceTenant(tenant?.ownerEmail)) {
      try {
        flows = await listSubscriberTenantFlowsForMaster(tenantId, {
          forceSync: forceSync || !quick,
        });
      } catch {
        flows = flowService.listByTenant(tenantId);
      }
    } else if (hasTypebotWorkspace) {
      try {
        await ensureTenantFlowsLinkedToWorkspace(tenantId);
      } catch {
        // best-effort
      }
    }
    const withAvatar = flows.map(applyTenantLogoAsBotAvatar);
    const workspaceId = String(tenant?.typebotWorkspaceId ?? "").trim();
    if (forceSync && workspaceId) {
      invalidateWorkspaceListCache(workspaceId);
    }
    const withStatus = await attachFlowActiveStatus(withAvatar, { workspaceId, fast: true });
    return res.status(200).json(withStatus);
  });

  app.post("/api/master/tenants/:tenantId/flows", (req, res) => {
    try {
      const input = createFlowSchema.parse(req.body);
      const tenant = tenantRepository.getById(req.params.tenantId);
      const tenantLogo = String(tenant?.profileImageUrl ?? "").trim();
      const flow = flowService.create(req.params.tenantId, {
        ...input,
        redirectTheme: {
          ...(input.redirectTheme ?? {}),
          ...(tenantLogo ? { profileImageUrl: tenantLogo } : {}),
        },
      });
      return res.status(201).json(flow);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/master/tenants/:tenantId/flows/from-library", async (req, res) => {
    try {
      const input = createFlowFromLibrarySchema.parse(req.body);
      const flow = flowService.createFromLibrary(req.params.tenantId, input);
      try {
        await refreshFlowViewerUrlFromTypebot(flow.id);
        const after = flowRepository.getById(flow.id) ?? flow;
        return res.status(201).json(after);
      } catch {
        return res.status(201).json(flow);
      }
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.delete("/api/master/flows/:flowId", (req, res) => {
    const removed = flowService.remove(req.params.flowId);
    if (!removed) {
      return res.status(404).json({ message: "Flow not found" });
    }
    return res.status(204).send();
  });

  app.patch("/api/master/flows/:flowId/display-label", (req, res) => {
    try {
      const input = updateFlowDisplayLabelSchema.parse(req.body);
      const flow = flowService.updateDisplayLabel(req.params.flowId, input);
      if (!flow) {
        return res.status(404).json({ message: "Flow not found" });
      }
      return res.status(200).json(flow);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/master/flows/:flowId/share-code", async (req, res) => {
    try {
      await refreshFlowViewerUrlFromTypebot(req.params.flowId);
    } catch {
      // mantém URL já persistida se o Builder não estiver disponível
    }
    const flow = flowService.ensureShortShareCode(req.params.flowId);
    if (!flow) {
      return res.status(404).json({ message: "Flow not found" });
    }
    return res.status(200).json({ shortShareCode: flow.shortShareCode, flowId: flow.id });
  });

  app.patch("/api/master/flows/:flowId/theme", (req, res) => {
    try {
      const input = updateFlowThemeSchema.parse(req.body);
      const current = flowRepository.getById(req.params.flowId);
      if (!current) {
        return res.status(404).json({ message: "Flow not found" });
      }
      const tenant = tenantRepository.getById(current.tenantId);
      const tenantLogo = String(tenant?.profileImageUrl ?? "").trim();
      const flow = flowService.updateTheme(req.params.flowId, {
        redirectTheme: {
          ...(input.redirectTheme ?? {}),
          ...(tenantLogo ? { profileImageUrl: tenantLogo } : {}),
        },
      });
      if (!flow) {
        return res.status(404).json({ message: "Flow not found" });
      }
      return res.status(200).json(flow);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });
};
