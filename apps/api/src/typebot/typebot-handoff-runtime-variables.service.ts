/**
 * Preenche blocos "Set variable" do Typebot com tenantId, sourceFlowLabel e URL do viewer
 * do assinante alvo (após cópia da matriz).
 */

export type HandoffRuntimeVariableValues = {
  tenantId?: string;
  sourceFlowLabel?: string;
  typebotViewerUrl?: string;
};

const SET_VARIABLE_BLOCK_TYPE = "Set variable";

const HANDOFF_SET_VARIABLE_FIELD_BY_NORMALIZED_NAME: Record<string, keyof HandoffRuntimeVariableValues> = {
  tenantid: "tenantId",
  sourceflowlabel: "sourceFlowLabel",
  viewerurl: "typebotViewerUrl",
  typebotviewerurl: "typebotViewerUrl",
};

const normalizeHandoffVariableNameKey = (name: string): string =>
  String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const escapeForSingleQuotedJs = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const formatHandoffSetVariableExpression = (value: string, isCode?: boolean): string => {
  const literal = String(value ?? "").trim();
  if (!literal) return "";
  if (isCode) {
    return `return '${escapeForSingleQuotedJs(literal)}'`;
  }
  return literal;
};

export const buildTypebotVariableNameById = (schema: Record<string, unknown>): Map<string, string> => {
  const map = new Map<string, string>();
  const variables = schema.variables;
  if (!Array.isArray(variables)) return map;
  for (const variable of variables) {
    if (!variable || typeof variable !== "object") continue;
    const record = variable as { id?: unknown; name?: unknown };
    const id = String(record.id ?? "").trim();
    const name = String(record.name ?? "").trim();
    if (!id || !name) continue;
    map.set(id, name);
  }
  return map;
};

const resolveHandoffValueForVariableName = (
  variableName: string,
  runtime: HandoffRuntimeVariableValues,
): string => {
  const field = HANDOFF_SET_VARIABLE_FIELD_BY_NORMALIZED_NAME[normalizeHandoffVariableNameKey(variableName)];
  if (!field) return "";
  return String(runtime[field] ?? "").trim();
};

const patchSetVariableBlock = (
  block: Record<string, unknown>,
  nameById: Map<string, string>,
  runtime: HandoffRuntimeVariableValues,
): Record<string, unknown> | null => {
  const optionsRaw = block.options;
  if (!optionsRaw || typeof optionsRaw !== "object") return null;
  const options = { ...(optionsRaw as Record<string, unknown>) };
  const variableId = String(options.variableId ?? "").trim();
  if (!variableId) return null;
  const variableName = nameById.get(variableId) ?? "";
  const value = resolveHandoffValueForVariableName(variableName, runtime);
  if (!value) return null;

  const isCode = options.isCode === true;
  const nextExpression = formatHandoffSetVariableExpression(value, isCode);
  const previousExpression = String(options.expressionToEvaluate ?? "").trim();
  if (previousExpression === nextExpression.trim()) return null;

  options.expressionToEvaluate = nextExpression;
  if (!isCode) {
    options.isCode = false;
  }
  return { ...block, options };
};

/**
 * Atualiza todos os blocos Set variable cujo nome da variável é tenantId, sourceFlowLabel ou viewer_url/typebotViewerUrl.
 */
export const patchHandoffRuntimeSetVariableBlocks = (
  schema: Record<string, unknown>,
  runtime: HandoffRuntimeVariableValues,
): Record<string, unknown> => {
  const tenantId = String(runtime.tenantId ?? "").trim();
  const sourceFlowLabel = String(runtime.sourceFlowLabel ?? "").trim();
  const typebotViewerUrl = String(runtime.typebotViewerUrl ?? "").trim();
  if (!tenantId && !sourceFlowLabel && !typebotViewerUrl) {
    return schema;
  }

  const effectiveRuntime: HandoffRuntimeVariableValues = {
    tenantId: tenantId || undefined,
    sourceFlowLabel: sourceFlowLabel || undefined,
    typebotViewerUrl: typebotViewerUrl || undefined,
  };

  const nameById = buildTypebotVariableNameById(schema);
  const groupsRaw = schema.groups;
  if (!Array.isArray(groupsRaw)) return schema;

  let patchedAny = false;
  const nextGroups = groupsRaw.map((group) => {
    if (!group || typeof group !== "object") return group;
    const groupRecord = { ...(group as Record<string, unknown>) };
    const blocksRaw = groupRecord.blocks;
    if (!Array.isArray(blocksRaw)) return groupRecord;
    groupRecord.blocks = blocksRaw.map((block) => {
      if (!block || typeof block !== "object") return block;
      const blockRecord = block as Record<string, unknown>;
      if (String(blockRecord.type ?? "").trim() !== SET_VARIABLE_BLOCK_TYPE) return block;
      const patched = patchSetVariableBlock(blockRecord, nameById, effectiveRuntime);
      if (patched) {
        patchedAny = true;
        return patched;
      }
      return block;
    });
    return groupRecord;
  });

  if (!patchedAny) return schema;
  return { ...schema, groups: nextGroups };
};
