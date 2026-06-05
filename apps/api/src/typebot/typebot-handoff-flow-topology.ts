/**
 * Diagnóstico e correções de topologia do fluxo handoff no Typebot (ordem de blocos, tipo HTTP vs Webhook pausado).
 */
import type { Tenant } from "../tenants/tenant.repository";

const HANDOFF_API_NEEDLE = "api/typebot/handoff";

const normalizeBlockType = (type: string): string => String(type ?? "").trim().toLowerCase();

export const isPauseWebhookBlockType = (type: string): boolean => normalizeBlockType(type) === "webhook";

export const isHttpRequestBlockType = (type: string): boolean => normalizeBlockType(type) === "http request";

export const isRedirectBlockType = (type: string): boolean => normalizeBlockType(type) === "redirect";

const blockSortRank = (type: string): number => {
  const n = normalizeBlockType(type);
  if (n === "set variable") return 10;
  if (n === "http request" || n === "webhook") return 20;
  if (n === "redirect") return 90;
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

      if (isPauseWebhookBlockType(type) && isHandoffHttp) {
        usesPauseWebhookBlock = true;
        pauseWebhookWithHandoff = true;
      }
      if (isHttpRequestBlockType(type) && isHandoffHttp) {
        httpIndex = blockIndex;
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
          httpUrl: httpUrl || undefined,
        });
      }
      if (isHandoffHttp && (isHttpRequestBlockType(type) || isPauseWebhookBlockType(type))) {
        blocks.push({
          groupId,
          groupTitle,
          blockId,
          blockIndex,
          type,
          httpUrl,
        });
      }
    });

    if (pauseWebhookWithHandoff) {
      issues.push(
        `Grupo "${groupTitle || groupId}": bloco Webhook (pausa) com URL handoff — deve ser HTTP request síncrono.`,
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

export const normalizeHandoffBlockTypesAndOrder = (
  schema: Record<string, unknown>,
): Record<string, unknown> => {
  const groupsRaw = schema.groups;
  if (!Array.isArray(groupsRaw)) return schema;

  const nextGroups = groupsRaw.map((group) => {
    if (!group || typeof group !== "object") return group;
    const groupRecord = { ...(group as Record<string, unknown>) };
    const blocksRaw = groupRecord.blocks;
    if (!Array.isArray(blocksRaw)) return groupRecord;

    const nextBlocks = blocksRaw.map((block) => {
      if (!block || typeof block !== "object") return block;
      const blockRecord = { ...(block as Record<string, unknown>) };
      const type = String(blockRecord.type ?? "").trim();
      if (!isPauseWebhookBlockType(type)) return blockRecord;
      const httpUrl = readHttpUrlFromBlock(blockRecord);
      if (!httpUrl.toLowerCase().includes(HANDOFF_API_NEEDLE)) return blockRecord;
      blockRecord.type = "HTTP request";
      return blockRecord;
    });

    const sorted = [...nextBlocks].sort((a, b) => {
      const aType = a && typeof a === "object" ? String((a as Record<string, unknown>).type ?? "") : "";
      const bType = b && typeof b === "object" ? String((b as Record<string, unknown>).type ?? "") : "";
      return blockSortRank(aType) - blockSortRank(bType);
    });

    groupRecord.blocks = sorted;
    return groupRecord;
  });

  return { ...schema, groups: nextGroups };
};
