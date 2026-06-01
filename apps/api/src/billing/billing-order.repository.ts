import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getDataFilePath } from "../lib/data-path";
import { orderMatchesAsaasPixAutomaticContractId } from "./asaas-contract-id";

export type BillingOrderStatus =
  | "pending_payment"
  | "paid"
  | "provisioned"
  | "failed"
  | "cancelled";

export type BillingOrder = {
  id: string;
  planId: string;
  customerName: string;
  ownerEmail: string;
  whatsapp: string;
  cpfCnpj: string;
  billingType: "PIX" | "CREDIT_CARD" | "BOLETO";
  /** `pix_automatic` = mensal com Pix Automático; ausente = fluxo legado. */
  billingKind?: "pix_automatic" | "credit_card_checkout" | "pix_single";
  asaasCheckoutSessionId?: string;
  valueCents: number;
  status: BillingOrderStatus;
  tenantId?: string;
  asaasCustomerId?: string;
  asaasPaymentId?: string;
  asaasSubscriptionId?: string;
  asaasPixAutomaticAuthorizationId?: string;
  pixAutomaticAuthorizationStatus?: string;
  pixCopyPaste?: string;
  pixQrCodeBase64?: string;
  nextRecurringDueDate?: string;
  lastRenewalPaymentId?: string;
  paymentUrl?: string;
  provisionError?: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
};

const BILLING_ORDERS_FILE_PATH = getDataFilePath("billing-orders.json");

const ensureStorage = () => {
  const folder = dirname(BILLING_ORDERS_FILE_PATH);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  if (!existsSync(BILLING_ORDERS_FILE_PATH)) {
    writeFileSync(BILLING_ORDERS_FILE_PATH, "[]", "utf-8");
  }
};

const loadOrders = (): BillingOrder[] => {
  ensureStorage();
  try {
    const raw = readFileSync(BILLING_ORDERS_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as BillingOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveOrders = (orders: BillingOrder[]) => {
  ensureStorage();
  writeFileSync(BILLING_ORDERS_FILE_PATH, JSON.stringify(orders, null, 2), "utf-8");
};

export class BillingOrderRepository {
  list(): BillingOrder[] {
    return loadOrders();
  }

  getById(orderId: string): BillingOrder | null {
    const normalized = String(orderId ?? "").trim();
    if (!normalized) return null;
    return loadOrders().find((order) => order.id === normalized) ?? null;
  }

  getByPixAutomaticContractId(contractId: string): BillingOrder | null {
    const normalized = String(contractId ?? "").trim();
    if (!normalized) return null;
    return (
      loadOrders().find((order) => orderMatchesAsaasPixAutomaticContractId(order.id, normalized)) ??
      null
    );
  }

  getByAsaasPaymentId(paymentId: string): BillingOrder | null {
    const normalized = String(paymentId ?? "").trim();
    if (!normalized) return null;
    return loadOrders().find((order) => order.asaasPaymentId === normalized) ?? null;
  }

  getByAsaasCheckoutSessionId(checkoutSessionId: string): BillingOrder | null {
    const normalized = String(checkoutSessionId ?? "").trim();
    if (!normalized) return null;
    return loadOrders().find((order) => order.asaasCheckoutSessionId === normalized) ?? null;
  }

  getByPixAutomaticAuthorizationId(authorizationId: string): BillingOrder | null {
    const normalized = String(authorizationId ?? "").trim();
    if (!normalized) return null;
    return loadOrders().find((order) => order.asaasPixAutomaticAuthorizationId === normalized) ?? null;
  }

  listPixAutomaticRenewalCandidates(): BillingOrder[] {
    return loadOrders().filter(
      (order) =>
        order.billingKind === "pix_automatic" &&
        order.status === "provisioned" &&
        Boolean(order.asaasPixAutomaticAuthorizationId) &&
        Boolean(order.nextRecurringDueDate),
    );
  }

  create(order: BillingOrder): BillingOrder {
    const orders = loadOrders();
    orders.push(order);
    saveOrders(orders);
    return order;
  }

  update(orderId: string, patch: Partial<BillingOrder>): BillingOrder | null {
    const normalized = String(orderId ?? "").trim();
    if (!normalized) return null;
    const orders = loadOrders();
    const index = orders.findIndex((order) => order.id === normalized);
    if (index < 0) return null;
    const next = {
      ...orders[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    orders[index] = next;
    saveOrders(orders);
    return next;
  }
}
