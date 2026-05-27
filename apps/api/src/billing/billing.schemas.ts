import { z } from "zod";

export const createSalesCheckoutSchema = z.object({
  planId: z.string().min(2).max(80),
  customerName: z.string().min(2).max(120),
  ownerEmail: z.string().email().max(160),
  whatsapp: z.string().min(8).max(30),
  cpfCnpj: z.string().min(11).max(18),
  billingType: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]),
});

export const createSalesSubscriptionSchema = z.object({
  customerName: z.string().min(2).max(120),
  ownerEmail: z.string().email().max(160),
  cpfCnpj: z.string().min(11).max(18),
  cycle: z.enum(["MONTHLY", "YEARLY"]),
  whatsapp: z.string().min(8).max(30),
});

export type CreateSalesCheckoutInput = z.infer<typeof createSalesCheckoutSchema>;
export type CreateSalesSubscriptionInput = z.infer<typeof createSalesSubscriptionSchema>;
