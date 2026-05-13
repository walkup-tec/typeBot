import { createServerFn } from "@tanstack/react-start";

type Cycle = "MONTHLY" | "YEARLY";

const PLAN = {
  MONTHLY: { value: 190.0, description: "Plano Business Drax — Mensal" },
  YEARLY: { value: 1188.0, description: "Plano Business Drax — Anual" },
} as const;

export const createAsaasCheckout = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { name: string; email: string; cpfCnpj: string; cycle: Cycle }) => {
      if (!input?.name || !input?.email || !input?.cpfCnpj || !input?.cycle) {
        throw new Error("Dados obrigatórios ausentes.");
      }
      if (input.cycle !== "MONTHLY" && input.cycle !== "YEARLY") {
        throw new Error("Ciclo inválido.");
      }
      return input;
    },
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) throw new Error("ASAAS_API_KEY não configurada.");

    const isProd = apiKey.startsWith("$aact_prod_");
    const baseUrl = isProd
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";

    const headers = {
      "Content-Type": "application/json",
      access_token: apiKey,
      "User-Agent": "Drax-Landing/1.0",
    };

    // 1) Cria/recupera cliente
    const cleanedDoc = data.cpfCnpj.replace(/\D/g, "");
    const customerRes = await fetch(`${baseUrl}/customers`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        cpfCnpj: cleanedDoc,
      }),
    });
    const customerJson = await customerRes.json();
    if (!customerRes.ok) {
      throw new Error(
        `Falha ao criar cliente Asaas: ${customerJson?.errors?.[0]?.description ?? customerRes.statusText}`,
      );
    }
    const customerId = customerJson.id as string;

    // 2) Cria assinatura
    const plan = PLAN[data.cycle];
    const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const subRes = await fetch(`${baseUrl}/subscriptions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED", // permite o cliente escolher (Pix, boleto, cartão)
        cycle: data.cycle,
        value: plan.value,
        nextDueDate,
        description: plan.description,
      }),
    });
    const subJson = await subRes.json();
    if (!subRes.ok) {
      throw new Error(
        `Falha ao criar assinatura: ${subJson?.errors?.[0]?.description ?? subRes.statusText}`,
      );
    }

    // 3) Recupera primeira cobrança e devolve invoiceUrl
    const paymentsRes = await fetch(
      `${baseUrl}/payments?subscription=${subJson.id}&limit=1`,
      { headers },
    );
    const paymentsJson = await paymentsRes.json();
    const invoiceUrl = paymentsJson?.data?.[0]?.invoiceUrl as string | undefined;

    return {
      subscriptionId: subJson.id as string,
      invoiceUrl: invoiceUrl ?? null,
    };
  });
