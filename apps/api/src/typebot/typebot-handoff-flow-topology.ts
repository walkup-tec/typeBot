/**
 * Diagnóstico e correções de topologia do fluxo handoff no Typebot (ordem de blocos, tipo HTTP vs Webhook pausado).
 */
import type { Tenant } from "../tenants/tenant.repository";

const HANDOFF_API_NEEDLE = "api/typebot/handoff";

/** Bloco lógico que **pausa** até callback (Typebot `LogicBlockType.WEBHOOK`). */
export const isPauseWebhookBlockType = (type: string): boolean => String(type ?? "").trim() === "webhook";

/**
 * Integração HTTP Request no Typebot — o `type` no JSON é `"Webhook"` (não confundir com pausa).
 * @see IntegrationBlockType.HTTP_REQUEST = "Webhook"
 */
export const isIntegrationHttpRequestBlockType = (type: string): boolean => String(type ?? "").trim() === "Webhook";

export const isRedirectBlockType = (type: string): boolean =>
  String(type ?? "").trim().toLowerCase() === "redirect";

export const isHandoffIntegrationOrHttpBlock = (type: string): boolean =>
  isIntegrationHttpRequestBlockType(type) || String(type ?? "").trim().toLowerCase() === "http request";

const blockSortRank = (type: string): number => {
  const raw = String(type ?? "").trim();
  const lower = raw.toLowerCase();
  if (lower === "set variable") return 10;
  if (isIntegrationHttpRequestBlockType(raw) || lower === "http request") return 20;
  if (isRedirectBlockType(raw)) return 90;
  return 50;
};

export type HandoffBlockSnapshot = {
  groupId: string;
  groupTitle: string;
  blockId: string;
  blockIndex: number;
  type: string;
  redirectUrl?: string;
  httpUrl?: string;
};

export type HandoffFlowTopologyDiagnostics = {
  blocks: HandoffBlockSnapshot[];
  issues: string[];
  usesPauseWebhookBlock: boolean;
  redirectBeforeHttpInGroup: boolean;
};

const readHttpUrlFromBlock = (block: Record<string, unknown>): string => {
  const options = block.options;
  if (!options || typeof options !== "object") return "";
  const record = options as Record<string, unknown>;
  const webhook = record.webhook;
  if (webhook && typeof webhook === "object") {
    return String((webhook as Record<string, unknown>).url ?? "").trim();
  }
  return String(record.url ?? "").trim();
};

export const diagnoseHandoffFlowTopology = (schema: Record<string, unknown>): HandoffFlowTopologyDiagnostics => {
  const blocks: HandoffBlockSnapshot[] = [];
  const issues: string[] = [];
  let usesPauseWebhookBlock = false;
  let redirectBeforeHttpInGroup = false;

  const groups = Array.isArray(schema.groups) ? schema.groups : [];
  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const groupRecord = group as Record<string, unknown>;
    const groupId = String(groupRecord.id ?? "").trim();
    const groupTitle = String(groupRecord.title ?? "").trim();
    const blocksRaw = groupRecord.blocks;
    if (!Array.isArray(blocksRaw)) continue;

    let httpIndex = -1;
    let redirectIndex = -1;
    let pauseWebhookWithHandoff = false;

    blocksRaw.forEach((block, blockIndex) => {
      if (!block || typeof block !== "object") return;
      const blockRecord = block as Record<string, unknown>;
      const type = String(blockRecord.type ?? "").trim();
      const blockId = String(blockRecord.id ?? "").trim();
      const httpUrl = readHttpUrlFromBlock(blockRecord);
      const isHandoffHttp = httpUrl.toLowerCase().includes(HANDOFF_API_NEEDLE);

      if (isPauseWebhookBlockType(type)) {
        usesPauseWebhookBlock = true;
        if (isHandoffHttp) pauseWebhookWithHandoff = true;
      }
      if (isHandoffIntegrationOrHttpBlock(type) && isHandoffHttp) {
        httpIndex = blockIndex;
        blocks.push({
          groupId,
          groupTitle,
          blockId,
          blockIndex,
          type,
          httpUrl,
        });
      }
      if (isRedirectBlockType(type)) {
        redirectIndex = blockIndex;
        const options = blockRecord.options;
        const redirectUrl =
          options && typeof options === "object"
            ? String((options as Record<string, unknown>).url ?? "").trim()
            : "";
        blocks.push({
          groupId,
          groupTitle,
          blockId,
          blockIndex,
          type,
          redirectUrl,
        });
      }
    });

    if (pauseWebhookWithHandoff) {
      issues.push(
        `Grupo "${groupTitle || groupId}": bloco webhook (pausa) — não chama API handoff; use integração Webhook (HTTP Request).`,
      );
    }
    if (redirectIndex >= 0 && httpIndex >= 0 && redirectIndex < httpIndex) {
      redirectBeforeHttpInGroup = true;
      issues.push(
        `Grupo "${groupTitle || groupId}": Redirect vem ANTES do HTTP/Webhook — url_direct fica vazio.`,
      );
    }
  }

  if (blocks.length === 0) {
    issues.push("Nenhum bloco HTTP/Webhook ou Redirect de handoff encontrado no schema.");
  }

  return {
    blocks,
    issues,
    usesPauseWebhookBlock,
    redirectBeforeHttpInGroup,
  };
};

/** URL para bloco Redirect (GET): API responde 302 → handoff-view (não depende de url_direct). */
export const buildHandoffRedirectGetUrl = (
  tenant: Tenant,
  runtime?: { sourceFlowLabel?: string; typebotViewerUrl?: string },
): string => {
  const tenantId = String(tenant.id ?? "").trim();
  const sourceFlowLabel = String(runtime?.sourceFlowLabel ?? "").trim();
  const typebotViewerUrl = String(runtime?.typebotViewerUrl ?? "").trim();
  const base = String(process.env.TYPEBOT_HANDOFF_WEBHOOK_URL ?? "https://app.chattypebot.com/api/typebot/handoff")
    .trim()
    .split("?")[0];
  const parts = [`${base}?contactName={{Nome}}`, "source=typebot"];
  if (tenantId) parts.push(`tenantId=${encodeURIComponent(tenantId)}`);
  if (sourceFlowLabel) parts.push(`sourceFlowLabel=${encodeURIComponent(sourceFlowLabel)}`);
  if (typebotViewerUrl) parts.push(`typebotViewerUrl=${encodeURIComponent(typebotViewerUrl)}`);
  return parts.join("&");
};

const createTypebotEdgeId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
};

const createTypebotBlockId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
};

/**
 * Alguns fluxos importados só têm HTTP handoff (POST) sem Redirect — o lead entra na fila mas
 * permanece na tela do Typebot. Insere Redirect GET após o bloco HTTP no mesmo grupo.
 */
export const ensureHandoffRedirectBlockPresent = (
  schema: Record<string, unknown>,
  redirectUrl: string,
): Record<string, unknown> => {
  const url = String(redirectUrl ?? "").trim();
  if (!url) return schema;

  const topology = diagnoseHandoffFlowTopology(schema);
  if (topology.blocks.some((block) => isRedirectBlockType(block.type))) {
    return schema;
  }

  const handoffHttp = topology.blocks.find((block) => Boolean(block.httpUrl));
  if (!handoffHttp) return schema;

  const groupsRaw = schema.groups;
  if (!Array.isArray(groupsRaw)) return schema;

  const nextGroups = groupsRaw.map((group) => {
    if (!group || typeof group !== "object") return group;
    const groupRecord = group as Record<string, unknown>;
    if (String(groupRecord.id ?? "").trim() !== handoffHttp.groupId) return groupRecord;

    const blocksRaw = groupRecord.blocks;
    if (!Array.isArray(blocksRaw)) return groupRecord;

    const redirectBlock = {
      id: createTypebotBlockId(),
      type: "Redirect",
      options: {
        url,
        isNewTab: false,
      },
    };

    return {
      ...groupRecord,
      blocks: [...blocksRaw, redirectBlock],
    };
  });

  return { ...schema, groups: nextGroups };
};

/** Garante aresta do bloco HTTP handoff → grupo que contém Redirect. */
export const rewireHandoffHttpOutgoingToRedirect = (schema: Record<string, unknown>): Record<string, unknown> => {
  const topology = diagnoseHandoffFlowTopology(schema);
  const handoffHttp = topology.blocks.find((block) => Boolean(block.httpUrl));
  const redirectBlock = topology.blocks.find((block) => isRedirectBlockType(block.type));
  if (!handoffHttp || !redirectBlock) return schema;
  if (handoffHttp.groupId === redirectBlock.groupId) return schema;

  const edges = Array.isArray(schema.edges) ? [...schema.edges] : [];
  const redirectGroupId = redirectBlock.groupId;

  const alreadyWired = edges.some((edge) => {
    if (!edge || typeof edge !== "object") return false;
    const record = edge as Record<string, unknown>;
    const from = record.from;
    const to = record.to;
    if (!from || typeof from !== "object" || !to || typeof to !== "object") return false;
    const fromBlockId = String((from as Record<string, unknown>).blockId ?? "").trim();
    const toGroupId = String((to as Record<string, unknown>).groupId ?? "").trim();
    return fromBlockId === handoffHttp.blockId && toGroupId === redirectGroupId;
  });
  if (alreadyWired) return schema;

  edges.push({
    id: createTypebotEdgeId(),
    from: { blockId: handoffHttp.blockId, groupId: handoffHttp.groupId },
    to: { groupId: redirectGroupId },
  });

  return { ...schema, edges };
};

/** Garante aresta do bloco integração handoff → grupos Redirect (senão url_direct nunca é preenchido). */
export const ensureHandoffEdgesToRedirectGroups = (schema: Record<string, unknown>): Record<string, unknown> => {
  const groups = Array.isArray(schema.groups) ? schema.groups : [];
  const edges = Array.isArray(schema.edges) ? [...schema.edges] : [];

  let handoffBlockId = "";
  let handoffGroupId = "";
  const redirectGroupIds: string[] = [];

  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const groupRecord = group as Record<string, unknown>;
    const groupId = String(groupRecord.id ?? "").trim();
    const blocksRaw = groupRecord.blocks;
    if (!Array.isArray(blocksRaw)) continue;
    for (const block of blocksRaw) {
      if (!block || typeof block !== "object") continue;
      const blockRecord = block as Record<string, unknown>;
      const type = String(blockRecord.type ?? "").trim();
      const blockId = String(blockRecord.id ?? "").trim();
      const httpUrl = readHttpUrlFromBlock(blockRecord);
      if (isHandoffIntegrationOrHttpBlock(type) && httpUrl.toLowerCase().includes(HANDOFF_API_NEEDLE)) {
        handoffBlockId = blockId;
        handoffGroupId = groupId;
      }
      if (isRedirectBlockType(type) && groupId) {
        redirectGroupIds.push(groupId);
      }
    }
  }

  if (!handoffBlockId || redirectGroupIds.length === 0) {
    return schema;
  }

  const hasEdgeToRedirect = (redirectGroupId: string): boolean =>
    edges.some((edge) => {
      if (!edge || typeof edge !== "object") return false;
      const record = edge as Record<string, unknown>;
      const to = record.to;
      const from = record.from;
      if (!to || typeof to !== "object" || !from || typeof from !== "object") return false;
      const toGroupId = String((to as Record<string, unknown>).groupId ?? "").trim();
      const fromBlockId = String((from as Record<string, unknown>).blockId ?? "").trim();
      return toGroupId === redirectGroupId && fromBlockId === handoffBlockId;
    });

  for (const redirectGroupId of redirectGroupIds) {
    if (redirectGroupId === handoffGroupId) continue;
    if (hasEdgeToRedirect(redirectGroupId)) continue;
    edges.push({
      id: createTypebotEdgeId(),
      from: { blockId: handoffBlockId, groupId: handoffGroupId },
      to: { groupId: redirectGroupId },
    });
  }

  return { ...schema, edges };
};

export const normalizeHandoffBlockOrderInGroups = (schema: Record<string, unknown>): Record<string, unknown> => {
  const groupsRaw = schema.groups;
  if (!Array.isArray(groupsRaw)) return schema;

  const nextGroups = groupsRaw.map((group) => {
    if (!group || typeof group !== "object") return group;
    const groupRecord = { ...(group as Record<string, unknown>) };
    const blocksRaw = groupRecord.blocks;
    if (!Array.isArray(blocksRaw)) return groupRecord;

    const sorted = [...blocksRaw].sort((a, b) => {
      const aType = a && typeof a === "object" ? String((a as Record<string, unknown>).type ?? "") : "";
      const bType = b && typeof b === "object" ? String((b as Record<string, unknown>).type ?? "") : "";
      return blockSortRank(aType) - blockSortRank(bType);
    });

    groupRecord.blocks = sorted;
    return groupRecord;
  });

  return { ...schema, groups: nextGroups };
};

export const applyHandoffTopologyFixes = (
  schema: Record<string, unknown>,
  options?: { redirectUrl?: string },
): Record<string, unknown> => {
  let next = normalizeHandoffBlockOrderInGroups(schema);
  if (options?.redirectUrl) {
    next = ensureHandoffRedirectBlockPresent(next, options.redirectUrl);
  }
  next = ensureHandoffEdgesToRedirectGroups(next);
  next = rewireHandoffHttpOutgoingToRedirect(next);
  return next;
};
