const resolveInjectedApiBase = (): string => {
  if (typeof window === "undefined") return "";
  return String(
    (window as Window & { __TYPEBOT_SAAS_API_BASE__?: string }).__TYPEBOT_SAAS_API_BASE__ ?? "",
  ).trim();
};

export const resolveApiBase = (): string => {
  const injected = resolveInjectedApiBase();
  if (injected) return injected.replace(/\/$/, "");
  return String(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3333").trim().replace(/\/$/, "");
};

export const resolvePainelUrl = (): string =>
  String(import.meta.env.VITE_PAINEL_URL ?? "http://localhost:5173").trim().replace(/\/$/, "");

export type SalesSubscriptionCycle = "MONTHLY" | "YEARLY";

export const createSalesSubscription = async (input: {
  customerName: string;
  ownerEmail: string;
  cpfCnpj: string;
  cycle: SalesSubscriptionCycle;
}): Promise<{ subscriptionId: string; invoiceUrl: string | null }> => {
  const base = resolveApiBase();
  const url = `${base}/api/public/sales/subscriptions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error(
      `Sem conexão com a API (${base}). Confira: build da landing com VITE_API_BASE_URL apontando para a API pública HTTPS; API no ar; sem bloqueio de rede ou conteúdo misto (página HTTPS chamando API HTTP).`,
    );
  }

  const raw = await response.text();
  let payload: { subscriptionId?: string; invoiceUrl?: string | null; message?: string };
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
    subscriptionId: String(payload.subscriptionId ?? ""),
    invoiceUrl: payload.invoiceUrl ?? null,
  };
};
