import { asaasRequest } from "./asaas.client";
import {
  assertAsaasPixAutomaticFieldLengths,
  buildAsaasPixAutomaticContractId,
  buildAsaasPixAutomaticDescription,
  clampAsaasPixAutomaticText,
} from "./asaas-pix-automatic-fields";

// Re-export for billing.service
export { buildAsaasPixAutomaticContractId, buildAsaasPixAutomaticDescription };

const resolvePixAutomaticAuthorizationsPath = (): string => {
  const fromEnv = String(process.env.ASAAS_PIX_AUTOMATIC_AUTH_PATH ?? "").trim();
  if (fromEnv) return fromEnv.startsWith("/") ? fromEnv : `/${fromEnv}`;
  return "/pix/automatic/authorizations";
};

export type AsaasPixAutomaticFrequency = "MONTHLY" | "YEARLY";

export type AsaasPixAutomaticAuthorization = {
  id?: string;
  status?: string;
  payload?: string;
  encodedImage?: string;
  immediateQrCode?: {
    payload?: string;
    encodedImage?: string;
    conciliationIdentifier?: string;
    expirationDate?: string;
  };
};

export const resolvePixAutomaticCopyPaste = (authorization: AsaasPixAutomaticAuthorization): string =>
  String(
    authorization.immediateQrCode?.payload ??
      authorization.payload ??
      "",
  ).trim();

export const resolvePixAutomaticQrCodeBase64 = (
  authorization: AsaasPixAutomaticAuthorization,
): string => {
  const raw = String(
    authorization.immediateQrCode?.encodedImage ?? authorization.encodedImage ?? "",
  ).trim();
  if (!raw) return "";
  if (raw.startsWith("data:image")) return raw;
  return `data:image/png;base64,${raw}`;
};

const buildPixAutomaticAuthorizationBody = (input: {
  customerId: string;
  contractId: string;
  frequency: AsaasPixAutomaticFrequency;
  startDate: string;
  value: number;
  description: string;
  immediateValue: number;
  expirationSeconds?: number;
  paymentCreationMode: "SUBSCRIPTION" | "MANUAL";
}) => {
  const contractId = buildAsaasPixAutomaticContractId(input.contractId);
  const description = buildAsaasPixAutomaticDescription(
    input.frequency === "YEARLY" ? "YEARLY" : "MONTHLY",
  );

  const body = {
    customerId: input.customerId,
    contractId,
    frequency: input.frequency,
    startDate: input.startDate,
    value: input.value,
    description,
    paymentCreationMode: input.paymentCreationMode,
    immediateQrCode: {
      originalValue: input.immediateValue,
      expirationSeconds: input.expirationSeconds ?? 86400,
    },
  };

  assertAsaasPixAutomaticFieldLengths(body);
  return body;
};

const FALLBACK_PIX_AUTOMATIC_AUTH_PATH = "/pix/automaticRecurringAuthorizations";

export const createAsaasPixAutomaticAuthorization = async (input: {
  customerId: string;
  contractId: string;
  frequency: AsaasPixAutomaticFrequency;
  startDate: string;
  value: number;
  description?: string;
  immediateValue: number;
  expirationSeconds?: number;
  paymentCreationMode?: "SUBSCRIPTION" | "MANUAL";
}): Promise<AsaasPixAutomaticAuthorization> => {
  const paymentCreationMode =
    input.paymentCreationMode ??
    (String(process.env.BILLING_PIX_AUTOMATIC_PAYMENT_MODE ?? "SUBSCRIPTION")
      .trim()
      .toUpperCase() === "MANUAL"
      ? "MANUAL"
      : "SUBSCRIPTION");

  const body = buildPixAutomaticAuthorizationBody({
    customerId: input.customerId,
    contractId: input.contractId,
    frequency: input.frequency,
    startDate: input.startDate,
    value: input.value,
    description: input.description ?? "",
    immediateValue: input.immediateValue,
    expirationSeconds: input.expirationSeconds,
    paymentCreationMode,
  });
  const primaryPath = resolvePixAutomaticAuthorizationsPath();

  try {
    return await asaasRequest<AsaasPixAutomaticAuthorization>("POST", primaryPath, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const isNotFound = message.includes("(404)") || message.toLowerCase().includes("not found");
    if (!isNotFound || primaryPath === FALLBACK_PIX_AUTOMATIC_AUTH_PATH) {
      throw error;
    }
    return asaasRequest<AsaasPixAutomaticAuthorization>("POST", FALLBACK_PIX_AUTOMATIC_AUTH_PATH, body);
  }
};

export const createAsaasPixAutomaticRecurringPayment = async (input: {
  customerId: string;
  pixAutomaticAuthorizationId: string;
  value: number;
  dueDate: string;
  description: string;
  externalReference: string;
}) => {
  return asaasRequest<{ id?: string; invoiceUrl?: string; bankSlipUrl?: string; status?: string }>(
    "POST",
    "/payments",
    {
      customer: input.customerId,
      billingType: "PIX",
      value: input.value,
      dueDate: input.dueDate,
      description: clampAsaasPixAutomaticText(input.description, "Renovacao Drax"),
      externalReference: input.externalReference,
      pixAutomaticAuthorizationId: input.pixAutomaticAuthorizationId,
    },
  );
};
