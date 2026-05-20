import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { loadFlowLibrary } from "./flow-library.repository";
import { syncSourceWorkspaceFlowsToMasterTenant } from "./source-master-sync.service";
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
import { typebotPublicIdFromViewerUrl } from "../lib/typebot-public-id";
import {
  importManualWorkspaceTypebotsIntoTenantFlows,
  refreshFlowViewerUrlFromTypebot,
  refreshTenantFlowViewerUrls,
  refreshTenantWorkspaceFlowUrlsFromTypebot,
} from "../typebot/typebot-flow-viewer-url-sync";
import {
  removeSystemDefaultFromSubscriberWorkspaces,
  syncSystemDefaultsToRealTypebotWorkspace,
} from "../typebot/typebot-builder.service";

const flowService = new FlowService(flowRepository);
const MASTER_SOURCE_EMAIL = "walkup@walkuptec.com.br";
const normalizeText = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();
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

const propagateSystemDefaultFlowToAllTenants = (payload: {
  sourceFlowId: string;
  title: string;
  sourceFlowNickname: string;
  sourceFlowUrl: string;
}) => {
  const tenants = tenantRepository.list();
  for (const tenant of tenants) {
    const ownerEmail = normalizeText(tenant.ownerEmail);
    if (!tenant.id || ownerEmail === MASTER_SOURCE_EMAIL) continue;
    const existingFlows = flowService.listByTenant(tenant.id);
    const hasAlready = existingFlows.some(
      (flow) =>
        normalizeText(flow.url) === normalizeText(payload.sourceFlowUrl) ||
        normalizeText(flow.librarySourceId) === normalizeText(payload.sourceFlowId),
    );
    if (hasAlready) continue;
    try {
      flowService.create(tenant.id, {
        nickname: payload.sourceFlowNickname,
        displayLabel: payload.title,
        url: payload.sourceFlowUrl,
        librarySourceId: payload.sourceFlowId,
      });
    } catch {
      // ignora tenant específico e segue propagação dos demais
    }
  }
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
    // Sync em background: await no Typebot deixava o GET pendurado e o painel sem lista.
    void syncSourceWorkspaceFlowsToMasterTenant().catch(() => undefined);
    const tenants = tenantRepository.list();
    const sourceTenant = tenants.find((tenant) => normalizeText(tenant.ownerEmail) === MASTER_SOURCE_EMAIL);
    if (!sourceTenant?.id) {
      return res.status(200).json([]);
    }
    const candidateFlows = flowService.listByTenant(sourceTenant.id);

    const uniqueByUrl = new Map<string, (typeof candidateFlows)[number]>();
    for (const flow of candidateFlows) {
      const key = normalizeText(flow.url);
      if (!key) continue;
      if (!uniqueByUrl.has(key)) uniqueByUrl.set(key, flow);
    }
    const uniqueFlows = [...uniqueByUrl.values()];

    const checks = await Promise.all(
      uniqueFlows.map(async (flow) => ({
        flow,
        isActive: await isFlowUrlActive(flow.url),
      })),
    );

    // Inclui fluxos inativos (ex.: viewer 502/500) para a Biblioteca Master não ficar vazia.
    const withTypebotAlias = checks.map(({ flow, isActive }) => ({
      ...flow,
      typebotPublicId: typebotPublicIdFromViewerUrl(flow.url),
      viewerUrlActive: isActive,
    }));

    // Regra operacional: todo fluxo ativo da matriz deve ser importado para workspaces dos assinantes.
    // Dispara o sync ao atualizar a lista da Biblioteca Master (best-effort, sem bloquear resposta).
    try {
      const defaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
      const subscribers = tenants.filter((tenant) => normalizeText(tenant.ownerEmail) !== MASTER_SOURCE_EMAIL);
      void Promise.allSettled(subscribers.map((tenant) => syncSystemDefaultsToRealTypebotWorkspace(tenant.id, defaults)));
    } catch {
      // Não impede a listagem dos fluxos da master.
    }

    return res.status(200).json(withTypebotAlias);
  };

  app.get("/api/master/source-flows", handleSourceFlowsRequest);
  app.get("/api/master/system-library/source-flows", handleSourceFlowsRequest);

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

  app.post("/api/master/system-library/promote", async (req, res) => {
    const sourceFlowId = String(req.body?.sourceFlowId ?? "").trim();
    if (!sourceFlowId) {
      return res.status(400).json({ message: "sourceFlowId é obrigatório." });
    }
    const sourceFlow = flowRepository.getById(sourceFlowId);
    if (!sourceFlow) {
      return res.status(404).json({ message: "Fluxo de origem não encontrado." });
    }
    const existing = getSystemMasterLibraryBySourceFlowId(sourceFlowId);
    const title = String(req.body?.title ?? "").trim();
    if (title.length < 2) {
      return res.status(400).json({ message: "Informe um título com pelo menos 2 caracteres para definir como padrão." });
    }
    const description = String(req.body?.description ?? "Fluxo padrão disponibilizado pela Biblioteca Master.").trim();
    const row = upsertSystemMasterLibrary({
      id: existing?.id ?? randomUUID(),
      sourceFlowId,
      title,
      description: description || "Fluxo padrão disponibilizado pela Biblioteca Master.",
      suggestedNickname: sourceFlow.nickname,
      viewerUrl: sourceFlow.url,
      isSystemDefault: true,
    });
    // Preserva o título definido como padrão no fluxo de origem para reaproveito ao remover/publicar novamente.
    flowRepository.updateById(sourceFlow.id, { displayLabel: title });
    propagateSystemDefaultFlowToAllTenants({
      sourceFlowId: sourceFlow.id,
      title: row.title,
      sourceFlowNickname: sourceFlow.nickname,
      sourceFlowUrl: sourceFlow.url,
    });
    // Ao promover como padrão, dispara importação imediata para os workspaces Typebot dos assinantes.
    const defaults = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
    const subscribers = tenantRepository
      .list()
      .filter((tenant) => normalizeText(tenant.ownerEmail) !== MASTER_SOURCE_EMAIL && Boolean(tenant.id));
    await Promise.allSettled(
      subscribers.map((tenant) => syncSystemDefaultsToRealTypebotWorkspace(tenant.id, defaults, { overwriteExisting: true })),
    );
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
      const result = await importManualWorkspaceTypebotsIntoTenantFlows(tenantId);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Falha ao sincronizar workspace Typebot.",
      });
    }
  });

  app.get("/api/master/tenants/:tenantId/flows", async (req, res) => {
    const tenantId = String(req.params.tenantId ?? "").trim();
    try {
      await importManualWorkspaceTypebotsIntoTenantFlows(tenantId);
    } catch {
      // best-effort: lista do workspace pode falhar sem bloquear o painel
    }
    try {
      await refreshTenantWorkspaceFlowUrlsFromTypebot(tenantId);
    } catch {
      // realinha publicId após renomear bot no Typebot
    }
    try {
      await refreshTenantFlowViewerUrls(tenantId);
    } catch {
      // listagem ainda entrega; URLs podem ser corrigidas no "Copiar link" ou após sync
    }
    ensureTenantFlowLibraryFromQueue(tenantId);
    try {
      await selfHealTenantFlowViewerUrls(tenantId);
    } catch {
      // auto-heal best-effort: não bloqueia listagem de fluxos
    }
    const flows = flowService.listByTenant(tenantId).map(applyTenantLogoAsBotAvatar);
    return res.status(200).json(flows);
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
