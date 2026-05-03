/**
 * Verifica se a URL pública do fluxo (viewer) responde com HTTP 2xx.
 * Mesma lógica usada na Biblioteca Master (`source-flows`).
 */
export const isFlowUrlActive = async (url: string): Promise<boolean> => {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(trimmed, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      return response.status >= 200 && response.status < 300;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
};
