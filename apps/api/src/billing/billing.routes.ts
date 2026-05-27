import type { Express, Request } from "express";
import {
  attendantRepository,
  flowRepository,
  labelRepository,
  queueRepository,
  tenantRepository,
} from "../lib/repositories";
import { BillingOrderRepository } from "./billing-order.repository";
import { BillingService } from "./billing.service";
import { createSalesCheckoutSchema, createSalesSubscriptionSchema } from "./billing.schemas";

const billingOrderRepository = new BillingOrderRepository();
const billingService = new BillingService(
  billingOrderRepository,
  tenantRepository,
  attendantRepository,
  flowRepository,
  queueRepository,
  labelRepository,
);

const resolveAsaasWebhookToken = (): string => String(process.env.ASAAS_WEBHOOK_ACCESS_TOKEN ?? "").trim();

const isAuthorizedAsaasWebhook = (req: Request): boolean => {
  const expected = resolveAsaasWebhookToken();
  if (!expected) return true;
  const received = String(req.header("asaas-access-token") ?? "").trim();
  return received.length > 0 && received === expected;
};

export const registerBillingRoutes = (app: Express) => {
  app.get("/api/public/sales/plans", (_req, res) => {
    return res.status(200).json({
      plans: billingService.listPlans(),
      paymentConfigured: Boolean(process.env.ASAAS_API_KEY?.trim()),
    });
  });

  app.post("/api/public/sales/checkout", async (req, res) => {
    try {
      const input = createSalesCheckoutSchema.parse(req.body);
      const checkout = await billingService.createCheckout(input);
      return res.status(201).json(checkout);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/public/sales/subscriptions", async (req, res) => {
    try {
      const input = createSalesSubscriptionSchema.parse(req.body);
      const checkout = await billingService.createSubscriptionCheckout({
        customerName: input.customerName,
        ownerEmail: input.ownerEmail,
        cpfCnpj: input.cpfCnpj,
        cycle: input.cycle,
        whatsapp: input.whatsapp,
        billingType: input.billingType,
      });
      return res.status(201).json(checkout);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/public/sales/orders/:orderId", async (req, res) => {
    try {
      const current = billingService.getOrderStatus(req.params.orderId);
      if (!current) return res.status(404).json({ message: "Pedido não encontrado." });
      if (current.status === "pending_payment") {
        const reconciled = await billingService.reconcileOrderPayment(req.params.orderId);
        return res.status(200).json(reconciled ?? current);
      }
      return res.status(200).json(current);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/webhooks/asaas", async (req, res) => {
    if (!isAuthorizedAsaasWebhook(req)) {
      return res.status(401).json({ message: "Webhook Asaas não autorizado." });
    }

    try {
      const body = req.body as {
        event?: string;
        payment?: { id?: string; externalReference?: string; status?: string };
        checkout?: { id?: string; externalReference?: string };
      };
      const result = await billingService.handleAsaasWebhook(
        String(body.event ?? ""),
        body.payment ?? {},
        body.checkout,
      );
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });
};
