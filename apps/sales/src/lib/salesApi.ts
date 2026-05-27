const resolveInjectedApiBase = (): string => {
  if (typeof window === "undefined") return "";
  return String(
    (window as Window & { __TYPEBOT_SAAS_API_BASE__?: string }).__TYPEBOT_SAAS_API_BASE__ ?? "",
  ).trim();
};

export const resolveApiBase = (): string => {
  const injected = resolveInjectedApiBase();
  if (injected) return injected.replace(/\/$/, "");
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  // Em produção nunca usar localhost embutido: evita bundle com API errada se o build não tiver VITE_*.
  if (import.meta.env.DEV) return "http://localhost:3333".replace(/\/$/, "");
  return "";
};

export const resolvePainelUrl = (): string => {
  const fromEnv = String(import.meta.env.VITE_PAINEL_URL ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return "http://localhost:5173".replace(/\/$/, "");
  return "";
};

export type SalesSubscriptionCycle = "MONTHLY" | "YEARLY";
export type SalesBillingType = "PIX" | "CREDIT_CARD";

export type SalesPlanDto = {
  id: string;
  name: string;
  priceCents: number;
  billingCycle: SalesSubscriptionCycle;
};

export const fetchSalesPlans = async (): Promise<{
  plans: SalesPlanDto[];
  paymentConfigured: boolean;
}> => {
  const base = resolveApiBase();
  if (!base) {
    return { plans: [], paymentConfigured: false };
  }

  const response = await fetch(`${base}/api/public/sales/plans`, {
    method: "GET",
    headers: { accept: "application/json" },
  });

  const raw = await response.text();
  let payload: { plans?: SalesPlanDto[]; paymentConfigured?: boolean; message?: string };
  try {
    payload = raw ? (JSON.parse(raw) as typeof payload) : {};
  } catch {
    throw new Error("Resposta inválida ao carregar planos.");
  }

  if (!response.ok) {
    throw new Error(payload.message ?? "Erro ao carregar planos.");
  }

  return {
    plans: Array.isArray(payload.plans) ? payload.plans : [],
    paymentConfigured: Boolean(payload.paymentConfigured),
  };
};

export const createSalesSubscription = async (input: {
  customerName: string;
  ownerEmail: string;
  cpfCnpj: string;
  whatsapp: string;
  billingType: SalesBillingType;
  cycle: SalesSubscriptionCycle;
}): Promise<{ checkoutSessionId: string; invoiceUrl: string | null }> => {
  const base = resolveApiBase();
  if (!base) {
    throw new Error(
      "API não configurada nesta versão da página (VITE_API_BASE_URL em falta no build). Refaça o deploy da landing com variáveis de build HTTPS no Easypanel, sem localhost.",
    );
  }
  const url = `${base}/api/public/sales/subscriptions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (cause: unknown) {
    const hint =
      base.startsWith("https://")
        ? ` Teste no browser: ${base}/health — tem de aparecer JSON com "status":"ok". Se não abrir: DNS (registo A/AAAA para o subdomínio), certificado TLS, ou serviço da API parado no Easypanel.`
        : " Confira URL da API (HTTPS) e firewall.";
    const detail =
      import.meta.env.DEV && cause instanceof Error && cause.message ? ` (${cause.message})` : "";
    throw new Error(`Sem ligação à API em ${base}.${hint}${detail}`);
  }

  const raw = await response.text();
  let payload: {
    checkoutSessionId?: string;
    subscriptionId?: string;
    invoiceUrl?: string | null;
    message?: string;
  };
  try {
    payload = raw ? (JSON.parse(raw) as typeof payload) : {};
  } catch {
    throw new Error(
      `Resposta inválida da API (${response.status}). Verifique se ${base} é realmente o servidor Drax (não HTML de CDN ou 404).`,
    );
  }

  if (!response.ok) {
    throw new Error(payload.message ?? "Erro ao processar assinatura.");
  }
  return {
    checkoutSessionId: String(payload.checkoutSessionId ?? payload.subscriptionId ?? ""),
    invoiceUrl: payload.invoiceUrl ?? null,
  };
};
