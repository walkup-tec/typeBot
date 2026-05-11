import { attendantRepository, tenantRepository } from "../lib/repositories";
import { isAuthPostgresEnabled, resolveInitialAuthRowsFromPostgres } from "../lib/auth-postgres";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isPostgresConnectivityError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const code = String((error as NodeJS.ErrnoException).code ?? "");
  return ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(code);
};

/** Em produção, pode obrigar Postgres para não perder login entre redeploys. */
export function enforceProductionAuthEnv(): void {
  const prod = String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
  if (!prod) return;
  if (isAuthPostgresEnabled()) return;
  const allowJson = String(process.env.AUTH_ALLOW_JSON_IN_PRODUCTION ?? "").trim() === "true";
  if (String(process.env.AUTH_REQUIRE_DATABASE_URL_IN_PRODUCTION ?? "").trim() === "true" && !allowJson) {
    // eslint-disable-next-line no-console
    console.error(
      "[auth] AUTH_REQUIRE_DATABASE_URL_IN_PRODUCTION: em produção é obrigatório DATABASE_URL (Postgres) ou AUTH_ALLOW_JSON_IN_PRODUCTION=true para aceitar JSON em disco.",
    );
    process.exit(1);
  }
}

/** Carrega tenants/atendentes do Postgres e preenche repositórios em memória. */
export async function bootstrapAuthDataFromDatabase(): Promise<void> {
  if (!isAuthPostgresEnabled()) {
    return;
  }

  const attempts = 6;
  const delayMs = 2500;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { tenants, attendants } = await resolveInitialAuthRowsFromPostgres();
      tenantRepository.hydrate(tenants);
      attendantRepository.hydrate(attendants);
      if (attempt > 1) {
        // eslint-disable-next-line no-console
        console.log(`[auth] Postgres disponivel apos ${attempt} tentativa(s).`);
      }
      return;
    } catch (error) {
      const canRetry = isPostgresConnectivityError(error) && attempt < attempts;
      if (!canRetry) {
        // eslint-disable-next-line no-console
        console.error(
          "[auth] Falha ao ligar ao Postgres (DATABASE_URL). Revise host interno, credenciais e se o servico Postgres esta verde no Easypanel.",
        );
        throw error;
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[auth] Postgres indisponivel no arranque (tentativa ${attempt}/${attempts}). Nova tentativa em ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }
}

export function logAuthPersistenceMode(): void {
  const prod = String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
  if (isAuthPostgresEnabled()) {
    // eslint-disable-next-line no-console
    console.log("[auth] Tenants e atendentes: Postgres (DATABASE_URL).");
    return;
  }
  // eslint-disable-next-line no-console
  console.log("[auth] Tenants e atendentes: ficheiros JSON (apps/api/data).");
  if (prod) {
    const allow = String(process.env.AUTH_ALLOW_JSON_IN_PRODUCTION ?? "").trim() === "true";
    if (!allow) {
      // eslint-disable-next-line no-console
      console.warn(
        "[auth] AVISO produção: sem DATABASE_URL os utilizadores vivem só no disco do contentor. Cada redeploy sem volume pode apagar logins. Adiciona um serviço Postgres no Easypanel e define DATABASE_URL, ou monta volume persistente em apps/api/data.",
      );
    }
  }
}
