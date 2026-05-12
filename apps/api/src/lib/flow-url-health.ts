const buildViewerAlternateUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    const host = parsed.host;
    if (host.startsWith("soma-typebot-")) {
      parsed.host = host.replace(/^soma-typebot-/, "typebot-");
      return parsed.toString();
    }
    if (host.startsWith("typebot-")) {
      parsed.host = host.replace(/^typebot-/, "soma-typebot-");
      return parsed.toString();
    }
    return "";
  } catch {
    return "";
  }
};

const fetchHttpStatus = async (url: string): Promise<number | null> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      return response.status;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
};

export const probeFlowUrlStatus = async (url: string): Promise<{
  status: "active" | "inactive";
  httpStatus: number | null;
  resolvedUrl: string;
  fallbackUrl: string | null;
}> => {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) {
    return {
      status: "inactive",
      httpStatus: null,
      resolvedUrl: "",
      fallbackUrl: null,
    };
  }

  const primaryStatus = await fetchHttpStatus(trimmed);
  if (primaryStatus !== null && primaryStatus >= 200 && primaryStatus < 400) {
    return {
      status: "active",
      httpStatus: primaryStatus,
      resolvedUrl: trimmed,
      fallbackUrl: null,
    };
  }

  const alternate = buildViewerAlternateUrl(trimmed);
  if (!alternate || alternate === trimmed) {
    return {
      status: "inactive",
      httpStatus: primaryStatus,
      resolvedUrl: trimmed,
      fallbackUrl: null,
    };
  }

  const fallbackStatus = await fetchHttpStatus(alternate);
  if (fallbackStatus !== null && fallbackStatus >= 200 && fallbackStatus < 400) {
    return {
      status: "active",
      httpStatus: fallbackStatus,
      resolvedUrl: alternate,
      fallbackUrl: alternate,
    };
  }

  return {
    status: "inactive",
    httpStatus: primaryStatus,
    resolvedUrl: trimmed,
    fallbackUrl: null,
  };
};

/**
 * Verifica se a URL pública do fluxo (viewer) responde com HTTP ativo.
 * Também testa fallback automático entre domínios `typebot-` e `soma-typebot-`.
 */
export const isFlowUrlActive = async (url: string): Promise<boolean> => {
  const probe = await probeFlowUrlStatus(url);
  return probe.status === "active";
};
