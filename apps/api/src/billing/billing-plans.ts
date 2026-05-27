export type SalesPlan = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  billingCycle: "MONTHLY" | "YEARLY";
  highlights: string[];
};

const parsePlanPriceCents = (raw: string | undefined, fallback: number): number => {
  const normalized = String(raw ?? "").trim().replace(",", ".");
  if (!normalized) return fallback;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.round(value * 100);
};

export const listSalesPlans = (): SalesPlan[] => {
  const monthlyPriceCents = parsePlanPriceCents(process.env.SALES_PLAN_MONTHLY_VALUE, 29000);
  const yearlyPriceCents = parsePlanPriceCents(process.env.SALES_PLAN_YEARLY_VALUE, 228000);

  return [
    {
      id: "typebot-chat-monthly",
      name: process.env.SALES_PLAN_MONTHLY_NAME?.trim() || "Type Bot + Chat de atendimento",
      description:
        process.env.SALES_PLAN_MONTHLY_DESCRIPTION?.trim() ||
        "Fluxos Typebot, fila ao vivo, handoff humano e painel do assinante.",
      priceCents: monthlyPriceCents,
      billingCycle: "MONTHLY",
      highlights: [
        "Workspace Typebot dedicado por assinante",
        "Fila de atendimento com contexto do lead",
        "Painel master para equipe e atendentes",
      ],
    },
    {
      id: "typebot-chat-yearly",
      name: process.env.SALES_PLAN_YEARLY_NAME?.trim() || "Type Bot + Chat anual",
      description:
        process.env.SALES_PLAN_YEARLY_DESCRIPTION?.trim() ||
        "Mesmo pacote com cobrança anual e desconto.",
      priceCents: yearlyPriceCents,
      billingCycle: "YEARLY",
      highlights: [
        "Tudo do plano mensal",
        "Cobrança anual com desconto",
        "Suporte à ativação do workspace",
      ],
    },
  ];
};

export const getSalesPlanById = (planId: string): SalesPlan | null => {
  const normalized = String(planId ?? "").trim();
  if (!normalized) return null;
  return listSalesPlans().find((plan) => plan.id === normalized) ?? null;
};

export const getSalesPlanByCycle = (cycle: "MONTHLY" | "YEARLY"): SalesPlan | null => {
  return listSalesPlans().find((plan) => plan.billingCycle === cycle) ?? null;
};
