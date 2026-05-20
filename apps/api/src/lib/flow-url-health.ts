const configuredViewerBase = (): string =>
  String(process.env.TYPEBOT_TARGET_VIEWER_BASE_URL ?? process.env.TYPEBOT_SOURCE_VIEWER_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");

/** Gera URLs alternativas (migração soma → typebot → typebot-typebot-walkup-viewer). */
const buildViewerAlternateUrls = (url: string): string[] => {
  const out: string[] = [];
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
    const host = parsed.host;

    const targetBase = configuredViewerBase();
    if (targetBase) {
      out.push(`${targetBase}${path}`);
    }

    if (host.includes("soma-typebot-walkup-viewer")) {
      const migrated = new URL(url);
      migrated.host = host.replace("soma-typebot-walkup-viewer", "typebot-typebot-walkup-viewer");
      out.push(migrated.toString());
    } else if (host.startsWith("typebot-walkup-viewer.")) {
      const migrated = new URL(url);
      migrated.host = host.replace(/^typebot-walkup-viewer/, "typebot-typebot-walkup-viewer");
      out.push(migrated.toString());
    }
  } catch {
    // ignore invalid URL
  }
  const trimmed = String(url ?? "").trim();
  return [...new Set(out.filter((candidate) => candidate && candidate !== trimmed))];
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

  for (const alternate of buildViewerAlternateUrls(trimmed)) {
    const fallbackStatus = await fetchHttpStatus(alternate);
    if (fallbackStatus !== null && fallbackStatus >= 200 && fallbackStatus < 400) {
      return {
        status: "active",
        httpStatus: fallbackStatus,
        resolvedUrl: alternate,
        fallbackUrl: alternate,
      };
    }
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
 * Também testa fallback (env `TYPEBOT_TARGET_VIEWER_BASE_URL` e hosts legados soma/typebot).
 */
export const isFlowUrlActive = async (url: string): Promise<boolean> => {
  const probe = await probeFlowUrlStatus(url);
  return probe.status === "active";
};
