import { randomBytes, randomUUID } from "node:crypto";
import { getSalesPlanByCycle, getSalesPlanById, listSalesPlans } from "./billing-plans";
import { BillingOrderRepository, type BillingOrder } from "./billing-order.repository";
import { createAsaasCustomer, createAsaasPayment, createAsaasSubscription, getAsaasPayment, isAsaasConfigured, listAsaasSubscriptionPayments } from "./asaas.client";
import type { CreateSalesCheckoutInput, CreateSalesSubscriptionInput } from "./billing.schemas";
import { TenantService } from "../tenants/tenant.service";
import type { AttendantRepository } from "../attendants/attendant.repository";
import type { FlowRepository } from "../flows/flow.repository";
import type { QueueRepository } from "../queue/queue.repository";
import type { LabelRepository } from "../labels/label.repository";
import type { TenantRepository } from "../tenants/tenant.repository";
import { FlowService } from "../flows/flow.service";
import { listSystemMasterLibrary } from "../flows/system-master-library.repository";
import { syncSystemDefaultsToRealTypebotWorkspace } from "../typebot/typebot-builder.service";
import { mailService } from "../mail/mail.service";
import { buildTenantWelcomeTemplate } from "../mail/mail.templates";

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const normalizeDigits = (value: string): string => value.replace(/\D/g, "");

const formatDueDate = (daysAhead: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
};

const centsToCurrency = (valueCents: number): number => Number((valueCents / 100).toFixed(2));

const generateInitialPassword = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let password = "";
  for (let index = 0; index < bytes.length; index += 1) {
    password += alphabet[bytes[index] % alphabet.length];
  }
  return password;
};

const resolvePaymentUrl = (payment: { invoiceUrl?: string; bankSlipUrl?: string }): string => {
  return String(payment.invoiceUrl ?? payment.bankSlipUrl ?? "").trim();
};

const isPaidAsaasStatus = (status: string | undefined): boolean => {
  const normalized = String(status ?? "").trim().toUpperCase();
  return normalized === "RECEIVED" || normalized === "CONFIRMED" || normalized === "RECEIVED_IN_CASH";
};

export class BillingService {
  private readonly tenantService: TenantService;
  private readonly flowService: FlowService;

  constructor(
    private readonly billingOrderRepository: BillingOrderRepository,
    tenantRepository: TenantRepository,
    attendantRepository: AttendantRepository,
    flowRepository: FlowRepository,
    queueRepository: QueueRepository,
    labelRepository: LabelRepository,
  ) {
    this.tenantService = new TenantService(
      tenantRepository,
      attendantRepository,
      flowRepository,
      queueRepository,
      labelRepository,
    );
    this.flowService = new FlowService(flowRepository);
  }

  listPlans() {
    return listSalesPlans();
  }

  getOrderStatus(orderId: string) {
    const order = this.billingOrderRepository.getById(orderId);
    if (!order) return null;
    return {
      id: order.id,
      status: order.status,
      paymentUrl: order.paymentUrl ?? "",
      tenantId: order.tenantId ?? "",
      provisionError: order.provisionError ?? "",
      paidAt: order.paidAt ?? "",
      updatedAt: order.updatedAt,
    };
  }

  async createCheckout(input: CreateSalesCheckoutInput) {
    if (!isAsaasConfigured()) {
      throw new Error("Pagamentos indisponíveis no momento. Configure ASAAS_API_KEY na API.");
    }

    const plan = getSalesPlanById(input.planId);
    if (!plan) {
      throw new Error("Plano selecionado não está disponível.");
    }

    const ownerEmail = normalizeEmail(input.ownerEmail);
    const existingTenant = this.tenantService
      .list()
      .find((tenant) => normalizeEmail(tenant.ownerEmail) === ownerEmail);
    if (existingTenant) {
      throw new Error("Já existe uma assinatura com este e-mail. Acesse o painel ou fale com o suporte.");
    }

    const now = new Date().toISOString();
    const orderId = randomUUID();
    const order = this.billingOrderRepository.create({
      id: orderId,
      planId: plan.id,
      customerName: input.customerName.trim(),
      ownerEmail,
      whatsapp: normalizeDigits(input.whatsapp),
      cpfCnpj: normalizeDigits(input.cpfCnpj),
      billingType: input.billingType,
      valueCents: plan.priceCents,
      status: "pending_payment",
      createdAt: now,
      updatedAt: now,
    });

    const customer = await createAsaasCustomer({
      name: order.customerName,
      email: order.ownerEmail,
      mobilePhone: order.whatsapp,
      cpfCnpj: order.cpfCnpj,
      externalReference: order.id,
    });

    const payment = await createAsaasPayment({
      customerId: customer.id,
      billingType: order.billingType,
      value: centsToCurrency(order.valueCents),
      dueDate: formatDueDate(order.billingType === "BOLETO" ? 3 : 1),
      description: `${plan.name} - assinatura ${plan.billingCycle === "YEARLY" ? "anual" : "mensal"}`,
      externalReference: order.id,
    });

    const paymentUrl = resolvePaymentUrl(payment);
    const updated = this.billingOrderRepository.update(order.id, {
      asaasCustomerId: customer.id,
      asaasPaymentId: payment.id,
      paymentUrl,
    });

    return {
      orderId: updated?.id ?? order.id,
      status: updated?.status ?? order.status,
      paymentUrl,
      valueCents: order.valueCents,
      billingType: order.billingType,
      plan,
    };
  }

  async createSubscriptionCheckout(input: CreateSalesSubscriptionInput) {
    if (!isAsaasConfigured()) {
      throw new Error("Pagamentos indisponíveis no momento. Configure ASAAS_API_KEY na API.");
    }

    const plan = getSalesPlanByCycle(input.cycle);
    if (!plan) {
      throw new Error("Plano selecionado não está disponível.");
    }

    const ownerEmail = normalizeEmail(input.ownerEmail);
    const existingTenant = this.tenantService
      .list()
      .find((tenant) => normalizeEmail(tenant.ownerEmail) === ownerEmail);
    if (existingTenant) {
      throw new Error("Já existe uma assinatura com este e-mail. Acesse o painel ou fale com o suporte.");
    }

    const now = new Date().toISOString();
    const orderId = randomUUID();
    const order = this.billingOrderRepository.create({
      id: orderId,
      planId: plan.id,
      customerName: input.customerName.trim(),
      ownerEmail,
      whatsapp: normalizeDigits(input.whatsapp ?? ""),
      cpfCnpj: normalizeDigits(input.cpfCnpj),
      billingType: "PIX",
      valueCents: plan.priceCents,
      status: "pending_payment",
      createdAt: now,
      updatedAt: now,
    });

    const customer = await createAsaasCustomer({
      name: order.customerName,
      email: order.ownerEmail,
      mobilePhone: order.whatsapp || "11999999999",
      cpfCnpj: order.cpfCnpj,
      externalReference: order.id,
    });

    const subscription = await createAsaasSubscription({
      customerId: customer.id,
      cycle: input.cycle,
      value: centsToCurrency(order.valueCents),
      dueDate: formatDueDate(1),
      description: `${plan.name} - assinatura ${input.cycle === "YEARLY" ? "anual" : "mensal"}`,
      externalReference: order.id,
    });

    const payments = await listAsaasSubscriptionPayments(subscription.id);
    const firstPayment = payments.data?.[0];
    const paymentUrl = resolvePaymentUrl(firstPayment ?? {});
    const firstPaymentId = String(firstPayment?.id ?? "").trim();

    const updated = this.billingOrderRepository.update(order.id, {
      asaasCustomerId: customer.id,
      asaasSubscriptionId: subscription.id,
      asaasPaymentId: firstPaymentId || undefined,
      paymentUrl,
    });

    return {
      orderId: updated?.id ?? order.id,
      subscriptionId: subscription.id,
      invoiceUrl: paymentUrl,
      status: updated?.status ?? order.status,
      plan,
    };
  }

  private async provisionPaidOrder(order: BillingOrder): Promise<BillingOrder> {
    if (order.status === "provisioned" && order.tenantId) return order;

    const initialPassword = generateInitialPassword();
    const tenant = this.tenantService.create({
      name: order.customerName,
      ownerEmail: order.ownerEmail,
      whatsapp: order.whatsapp,
      initialPassword,
    });

    const systemDefaultItems = listSystemMasterLibrary().filter((item) => item.isSystemDefault);
    for (const item of systemDefaultItems) {
      try {
        this.flowService.create(tenant.id, {
          nickname: item.suggestedNickname.trim(),
          displayLabel: item.title.trim(),
          url: item.viewerUrl.trim(),
          librarySourceId: item.id,
        });
      } catch {
        // ignora duplicados para não bloquear ativação pós-pagamento
      }
    }

    try {
      await syncSystemDefaultsToRealTypebotWorkspace(tenant.id, systemDefaultItems);
    } catch {
      // provisionamento Typebot pode ser concluído depois sem bloquear acesso ao painel
    }

    if (mailService.isConfigured()) {
      const loginUrl = String(process.env.SYSTEM_LOGIN_URL ?? "http://localhost:5173").trim();
      const mail = buildTenantWelcomeTemplate({
        recipientName: order.customerName,
        tenantName: tenant.name,
        ownerEmail: order.ownerEmail,
        initialPassword,
        loginUrl,
      });
      try {
        await mailService.send({
          to: order.ownerEmail,
          subject: mail.subject,
          html: mail.html,
        });
      } catch {
        // e-mail de boas-vindas é complementar
      }
    }

    return (
      this.billingOrderRepository.update(order.id, {
        status: "provisioned",
        tenantId: tenant.id,
        paidAt: order.paidAt ?? new Date().toISOString(),
        provisionError: "",
      }) ?? order
    );
  }

  private async resolveSubscriptionPayment(order: BillingOrder): Promise<{
    paymentId: string;
    status?: string;
    paymentUrl: string;
  } | null> {
    const subscriptionId = String(order.asaasSubscriptionId ?? "").trim();
    if (!subscriptionId) return null;

    const payments = await listAsaasSubscriptionPayments(subscriptionId);
    const latest = payments.data?.[0];
    if (!latest) return null;

    const paymentId = String(latest.id ?? order.asaasPaymentId ?? "").trim();
    if (!paymentId) return null;

    return {
      paymentId,
      status: latest.status,
      paymentUrl: resolvePaymentUrl(latest) || String(order.paymentUrl ?? "").trim(),
    };
  }

  async reconcileOrderPayment(orderId: string) {
    const order = this.billingOrderRepository.getById(orderId);
    if (!order) return null;

    let paymentId = String(order.asaasPaymentId ?? "").trim();
    let paymentStatus: string | undefined;
    let paymentUrl = String(order.paymentUrl ?? "").trim();

    if (paymentId) {
      const payment = await getAsaasPayment(paymentId);
      paymentStatus = payment.status;
      paymentUrl = resolvePaymentUrl(payment) || paymentUrl;
    } else {
      const subscriptionPayment = await this.resolveSubscriptionPayment(order);
      if (!subscriptionPayment) return this.getOrderStatus(order.id);
      paymentId = subscriptionPayment.paymentId;
      paymentStatus = subscriptionPayment.status;
      paymentUrl = subscriptionPayment.paymentUrl;
      this.billingOrderRepository.update(order.id, {
        asaasPaymentId: paymentId,
        paymentUrl,
      });
    }

    if (!isPaidAsaasStatus(paymentStatus)) return this.getOrderStatus(order.id);
    const paidOrder =
      this.billingOrderRepository.update(order.id, {
        status: "paid",
        paidAt: new Date().toISOString(),
        asaasPaymentId: paymentId,
        paymentUrl,
      }) ?? order;
    const provisioned = await this.provisionPaidOrder(paidOrder);
    return this.getOrderStatus(provisioned.id);
  }

  async handleAsaasWebhook(event: string, payment: { id?: string; externalReference?: string; status?: string }) {
    const paymentId = String(payment.id ?? "").trim();
    const externalReference = String(payment.externalReference ?? "").trim();
    const order =
      (paymentId ? this.billingOrderRepository.getByAsaasPaymentId(paymentId) : null) ??
      (externalReference ? this.billingOrderRepository.getById(externalReference) : null);
    if (!order) return { handled: false, reason: "order_not_found" as const };

    const normalizedEvent = String(event ?? "").trim().toUpperCase();
    if (normalizedEvent === "PAYMENT_OVERDUE") {
      if (order.tenantId) {
        this.tenantService.updateStatus(order.tenantId, "blocked");
      }
      this.billingOrderRepository.update(order.id, { status: "cancelled" });
      return { handled: true, orderId: order.id, action: "blocked" as const };
    }

    if (!isPaidAsaasStatus(payment.status) && normalizedEvent !== "PAYMENT_RECEIVED" && normalizedEvent !== "PAYMENT_CONFIRMED") {
      return { handled: true, orderId: order.id, action: "ignored" as const };
    }

    const paidOrder =
      this.billingOrderRepository.update(order.id, {
        status: "paid",
        paidAt: new Date().toISOString(),
        asaasPaymentId: paymentId || order.asaasPaymentId,
      }) ?? order;
    const provisioned = await this.provisionPaidOrder(paidOrder);
    return { handled: true, orderId: provisioned.id, action: "provisioned" as const };
  }
}
