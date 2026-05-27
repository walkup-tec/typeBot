const trimUrl = (value: string): string => value.trim().replace(/\/$/, "");

export const resolveSalesCheckoutCallbacks = (): {
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
} => {
  const success = trimUrl(
    process.env.SALES_CHECKOUT_SUCCESS_URL ?? process.env.SYSTEM_LOGIN_URL ?? "",
  );
  const landing = trimUrl(
    process.env.SALES_LANDING_URL ??
      process.env.SALES_PUBLIC_BASE_URL ??
      process.env.SYSTEM_LOGIN_URL ??
      "",
  );
  const cancel = trimUrl(process.env.SALES_CHECKOUT_CANCEL_URL ?? landing);
  const expired = trimUrl(process.env.SALES_CHECKOUT_EXPIRED_URL ?? landing);

  if (!success || !cancel || !expired) {
    throw new Error(
      "URLs de retorno do checkout não configuradas. Defina SALES_CHECKOUT_SUCCESS_URL e SALES_LANDING_URL (ou SALES_CHECKOUT_CANCEL_URL) na API.",
    );
  }

  return { successUrl: success, cancelUrl: cancel, expiredUrl: expired };
};
