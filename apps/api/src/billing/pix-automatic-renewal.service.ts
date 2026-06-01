import {
  addCalendarMonths,
  formatLocalDate,
  isWithinPixAutomaticInstructionWindow,
} from "./billing-dates";
import { BillingOrderRepository } from "./billing-order.repository";
import { createAsaasPixAutomaticRecurringPayment } from "./asaas-pix-automatic.client";

const centsToCurrency = (valueCents: number): number => Number((valueCents / 100).toFixed(2));

export class PixAutomaticRenewalService {
  constructor(private readonly billingOrderRepository: BillingOrderRepository) {}

  async runRenewalCycle(): Promise<{ processed: number; created: number; skipped: number }> {
    const mode = String(process.env.BILLING_PIX_AUTOMATIC_PAYMENT_MODE ?? "SUBSCRIPTION")
      .trim()
      .toUpperCase();
    if (mode !== "MANUAL") {
      return { processed: 0, created: 0, skipped: 0 };
    }

    const candidates = this.billingOrderRepository.listPixAutomaticRenewalCandidates();
    let created = 0;
    let skipped = 0;

    for (const order of candidates) {
      const dueDateRaw = String(order.nextRecurringDueDate ?? "").trim();
      if (!dueDateRaw) {
        skipped += 1;
        continue;
      }

      const dueDate = new Date(`${dueDateRaw}T12:00:00`);
      if (!isWithinPixAutomaticInstructionWindow(dueDate)) {
        skipped += 1;
        continue;
      }

      const customerId = String(order.asaasCustomerId ?? "").trim();
      const authorizationId = String(order.asaasPixAutomaticAuthorizationId ?? "").trim();
      if (!customerId || !authorizationId) {
        skipped += 1;
        continue;
      }

      const renewalReference = `${order.id}-renewal-${dueDateRaw}`;
      const payment = await createAsaasPixAutomaticRecurringPayment({
        customerId,
        pixAutomaticAuthorizationId: authorizationId,
        value: centsToCurrency(order.valueCents),
        dueDate: dueDateRaw,
        description: `Renovação assinatura ${order.planId}`,
        externalReference: renewalReference,
      });

      const nextDue = formatLocalDate(addCalendarMonths(dueDate, 1));
      this.billingOrderRepository.update(order.id, {
        lastRenewalPaymentId: String(payment.id ?? order.lastRenewalPaymentId ?? "").trim(),
        nextRecurringDueDate: nextDue,
      });
      created += 1;
    }

    return { processed: candidates.length, created, skipped };
  }
}
