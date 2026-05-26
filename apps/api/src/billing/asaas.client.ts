const DEFAULT_ASAAS_API_BASE_URL = "https://api-sandbox.asaas.com/v3";

const resolveAsaasApiBaseUrl = (): string =>
  String(process.env.ASAAS_API_BASE_URL ?? DEFAULT_ASAAS_API_BASE_URL).trim().replace(/\/$/, "");

const resolveAsaasApiKey = (): string => String(process.env.ASAAS_API_KEY ?? "").trim();

export const isAsaasConfigured = (): boolean => resolveAsaasApiKey().length > 0;

type AsaasErrorPayload = {
  errors?: Array<{ description?: string }>;
};

const readAsaasErrorMessage = (payload: unknown, status: number): string => {
  const body = payload as AsaasErrorPayload;
  const description = body.errors?.[0]?.description?.trim();
  if (description) return description;
  return `Falha na integração Asaas (${status}).`;
};

export const asaasRequest = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const apiKey = resolveAsaasApiKey();
  if (!apiKey) {
    throw new Error("Integração Asaas não configurada. Defina ASAAS_API_KEY na API.");
  }

  const response = await fetch(`${resolveAsaasApiBaseUrl()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    throw new Error(readAsaasErrorMessage(payload, response.status));
  }
  return payload as T;
};

export type AsaasCustomer = {
  id: string;
};

export type AsaasPayment = {
  id: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  status?: string;
};

export type AsaasSubscription = {
  id: string;
};

export type AsaasPaymentListItem = {
  id?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  status?: string;
};

export type AsaasPaymentList = {
  data?: AsaasPaymentListItem[];
};

export const createAsaasCustomer = async (input: {
  name: string;
  email: string;
  mobilePhone: string;
  cpfCnpj: string;
  externalReference: string;
}): Promise<AsaasCustomer> => {
  return asaasRequest<AsaasCustomer>("POST", "/customers", {
    name: input.name,
    email: input.email,
    mobilePhone: input.mobilePhone,
    cpfCnpj: input.cpfCnpj,
    externalReference: input.externalReference,
    notificationDisabled: false,
  });
};

export const createAsaasPayment = async (input: {
  customerId: string;
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD";
  value: number;
  dueDate: string;
  description: string;
  externalReference: string;
}): Promise<AsaasPayment> => {
  return asaasRequest<AsaasPayment>("POST", "/payments", {
    customer: input.customerId,
    billingType: input.billingType,
    value: input.value,
    dueDate: input.dueDate,
    description: input.description,
    externalReference: input.externalReference,
  });
};

export const getAsaasPayment = async (paymentId: string): Promise<AsaasPayment> => {
  const normalized = String(paymentId ?? "").trim();
  return asaasRequest<AsaasPayment>("GET", `/payments/${encodeURIComponent(normalized)}`);
};

export const createAsaasSubscription = async (input: {
  customerId: string;
  cycle: "MONTHLY" | "YEARLY";
  value: number;
  dueDate: string;
  description: string;
  externalReference: string;
}): Promise<AsaasSubscription> => {
  return asaasRequest<AsaasSubscription>("POST", "/subscriptions", {
    customer: input.customerId,
    billingType: "UNDEFINED",
    cycle: input.cycle,
    value: input.value,
    nextDueDate: input.dueDate,
    description: input.description,
    externalReference: input.externalReference,
  });
};

export const listAsaasSubscriptionPayments = async (subscriptionId: string): Promise<AsaasPaymentList> => {
  const normalized = String(subscriptionId ?? "").trim();
  return asaasRequest<AsaasPaymentList>(
    "GET",
    `/payments?subscription=${encodeURIComponent(normalized)}&limit=1`,
  );
};
