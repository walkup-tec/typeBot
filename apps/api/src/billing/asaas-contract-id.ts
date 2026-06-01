const ASAAS_PIX_AUTOMATIC_FIELD_MAX = 35;

/** Asaas Pix Automático: contractId e description — máx. 35 caracteres. */
export const clampAsaasPixAutomaticText = (value: string, fallback = "Drax Business"): string => {
  const trimmed = String(value ?? "").trim();
  const base = trimmed || fallback;
  if (base.length <= ASAAS_PIX_AUTOMATIC_FIELD_MAX) return base;
  return base.slice(0, ASAAS_PIX_AUTOMATIC_FIELD_MAX).trim();
};

/** Asaas: contractId da autorização (UUID com hífen = 36). */
export const buildAsaasPixAutomaticContractId = (orderId: string): string => {
  const compact = String(orderId ?? "")
    .trim()
    .replace(/-/g, "");
  if (!compact) {
    throw new Error("Pedido sem ID para contrato Pix Automático.");
  }
  return clampAsaasPixAutomaticText(compact, compact);
};

export const buildAsaasPixAutomaticDescription = (cycle: "MONTHLY" | "YEARLY"): string =>
  clampAsaasPixAutomaticText(
    cycle === "MONTHLY" ? "Drax Business mensal" : "Drax Business anual",
  );

export const orderMatchesAsaasPixAutomaticContractId = (
  orderId: string,
  contractId: string,
): boolean =>
  buildAsaasPixAutomaticContractId(orderId) ===
  buildAsaasPixAutomaticContractId(contractId);
