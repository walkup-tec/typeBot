const ASAAS_PIX_AUTOMATIC_CONTRACT_ID_MAX = 35;

/** Asaas: contractId da autorização Pix Automático — máx. 35 caracteres (UUID com hífen = 36). */
export const buildAsaasPixAutomaticContractId = (orderId: string): string => {
  const compact = String(orderId ?? "")
    .trim()
    .replace(/-/g, "");
  if (!compact) {
    throw new Error("Pedido sem ID para contrato Pix Automático.");
  }
  if (compact.length <= ASAAS_PIX_AUTOMATIC_CONTRACT_ID_MAX) {
    return compact;
  }
  return compact.slice(0, ASAAS_PIX_AUTOMATIC_CONTRACT_ID_MAX);
};

export const orderMatchesAsaasPixAutomaticContractId = (
  orderId: string,
  contractId: string,
): boolean =>
  buildAsaasPixAutomaticContractId(orderId) ===
  buildAsaasPixAutomaticContractId(contractId);
