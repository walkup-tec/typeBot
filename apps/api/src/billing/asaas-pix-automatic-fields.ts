/**
 * Limites Asaas — Pix Automático (OpenAPI v3).
 * @see https://docs.asaas.com/reference/create-an-automatic-pix-authorization
 * contractId maxLength 35 | description maxLength 35 (opcional)
 */
export const ASAAS_PIX_AUTOMATIC_TEXT_MAX_LENGTH = 35;

export const ASAAS_PIX_AUTOMATIC_DEFAULT_DESCRIPTION = "Drax Business mensal";

const normalize = (value: string, fallback: string): string => {
  const base = String(value ?? "").trim() || fallback;
  if (base.length <= ASAAS_PIX_AUTOMATIC_TEXT_MAX_LENGTH) return base;
  return base.slice(0, ASAAS_PIX_AUTOMATIC_TEXT_MAX_LENGTH);
};

/** contractId: identificador interno (UUID sem hífen = 32 chars). */
export const buildAsaasPixAutomaticContractId = (orderId: string): string => {
  const compact = String(orderId ?? "")
    .trim()
    .replace(/-/g, "");
  if (!compact) {
    throw new Error("Pedido sem ID para contrato Pix Automático.");
  }
  return normalize(compact, compact);
};

export const buildAsaasPixAutomaticDescription = (cycle: "MONTHLY" | "YEARLY"): string =>
  normalize(
    cycle === "MONTHLY" ? ASAAS_PIX_AUTOMATIC_DEFAULT_DESCRIPTION : "Drax Business anual",
    ASAAS_PIX_AUTOMATIC_DEFAULT_DESCRIPTION,
  );

export const orderMatchesAsaasPixAutomaticContractId = (
  orderId: string,
  contractId: string,
): boolean =>
  buildAsaasPixAutomaticContractId(orderId) === buildAsaasPixAutomaticContractId(contractId);

type PixAutomaticPayload = {
  contractId: string;
  description?: string;
  immediateQrCode?: { description?: string; originalValue?: number; expirationSeconds?: number };
};

export const assertAsaasPixAutomaticFieldLengths = (payload: PixAutomaticPayload): void => {
  const fields: Array<[string, string | undefined]> = [
    ["contractId", payload.contractId],
    ["description", payload.description],
    ["immediateQrCode.description", payload.immediateQrCode?.description],
  ];
  for (const [name, value] of fields) {
    if (!value) continue;
    if (value.length > ASAAS_PIX_AUTOMATIC_TEXT_MAX_LENGTH) {
      throw new Error(
        `Asaas Pix Automático: "${name}" tem ${value.length} caracteres (máx. ${ASAAS_PIX_AUTOMATIC_TEXT_MAX_LENGTH}).`,
      );
    }
  }
};

/** Texto genérico com limite Asaas (ex.: description em /payments). */
export const clampAsaasPixAutomaticText = (value: string, fallback: string): string =>
  normalize(value, fallback);
