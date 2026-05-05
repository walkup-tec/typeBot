import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import type { Attendant } from "../attendants/attendant.repository";
import type { Tenant } from "../tenants/tenant.repository";
import { getDataFilePath } from "./data-path";

let pool: Pool | null = null;

/** Quando definido, tenants e attendants persistem em Postgres (sobrevivem a redeploy do contentor). */
export const isAuthPostgresEnabled = (): boolean => Boolean(String(process.env.DATABASE_URL ?? "").trim());

export const getAuthPool = (): Pool => {
  const url = String(process.env.DATABASE_URL ?? "").trim();
  if (!url) {
    throw new Error("DATABASE_URL não definido.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
  }
  return pool;
};

const readJsonArray = <T>(filename: string): T[] => {
  const p = getDataFilePath(filename);
  if (!existsSync(p)) return [];
  try {
    const raw = readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const loadTenantsFromJsonFiles = (): Tenant[] => readJsonArray<Tenant>("tenants.json");
const loadAttendantsFromJsonFiles = (): Attendant[] => readJsonArray<Attendant>("attendants.json");

let persistChain = Promise.resolve();

const enqueuePersist = (label: string, fn: () => Promise<void>): void => {
  persistChain = persistChain
    .then(fn)
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`[auth-postgres] Falha ao persistir (${label}):`, err);
    });
};

export async function ensureAuthSchema(p: Pool): Promise<void> {
  await p.query(`
    CREATE TABLE IF NOT EXISTS saas_tenants (
      id text PRIMARY KEY,
      data jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saas_attendants (
      id text PRIMARY KEY,
      tenant_id text NOT NULL,
      data jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saas_attendants_tenant_id ON saas_attendants (tenant_id);
  `);
}

async function selectAllTenants(p: Pool): Promise<Tenant[]> {
  const res = await p.query<{ data: unknown }>(`SELECT data FROM saas_tenants ORDER BY id`);
  return res.rows.map((r) => r.data as Tenant);
}

async function selectAllAttendants(p: Pool): Promise<Attendant[]> {
  const res = await p.query<{ data: unknown }>(`SELECT data FROM saas_attendants ORDER BY id`);
  return res.rows.map((r) => r.data as Attendant);
}

async function replaceTenantsTable(p: Pool, rows: Tenant[]): Promise<void> {
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    await c.query("DELETE FROM saas_tenants");
    for (const row of rows) {
      await c.query(`INSERT INTO saas_tenants (id, data) VALUES ($1, $2::jsonb)`, [row.id, JSON.stringify(row)]);
    }
    await c.query("COMMIT");
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    c.release();
  }
}

async function replaceAttendantsTable(p: Pool, rows: Attendant[]): Promise<void> {
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    await c.query("DELETE FROM saas_attendants");
    for (const row of rows) {
      await c.query(`INSERT INTO saas_attendants (id, tenant_id, data) VALUES ($1, $2, $3::jsonb)`, [
        row.id,
        row.tenantId,
        JSON.stringify(row),
      ]);
    }
    await c.query("COMMIT");
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    c.release();
  }
}

/** Grava snapshot completo de tenants (alinha ao modelo “ficheiro JSON inteiro”). */
export const schedulePersistTenants = (rows: Tenant[]): void => {
  if (!isAuthPostgresEnabled()) return;
  const snapshot = [...rows];
  enqueuePersist("tenants", () => replaceTenantsTable(getAuthPool(), snapshot));
};

/** Grava snapshot completo de attendants. */
export const schedulePersistAttendants = (rows: Attendant[]): void => {
  if (!isAuthPostgresEnabled()) return;
  const snapshot = [...rows];
  enqueuePersist("attendants", () => replaceAttendantsTable(getAuthPool(), snapshot));
};

export async function loadTenantsFromPostgres(): Promise<Tenant[]> {
  return selectAllTenants(getAuthPool());
}

export async function loadAttendantsFromPostgres(): Promise<Attendant[]> {
  return selectAllAttendants(getAuthPool());
}

/**
 * Garante schema, migra JSON→Postgres se as tabelas estiverem vazias e houver dados em disco,
 * e devolve os arrays finais para hidratar repositórios em memória.
 */
export async function resolveInitialAuthRowsFromPostgres(): Promise<{
  tenants: Tenant[];
  attendants: Attendant[];
}> {
  const p = getAuthPool();
  await ensureAuthSchema(p);
  let tenants = await selectAllTenants(p);
  let attendants = await selectAllAttendants(p);

  if (tenants.length === 0 && attendants.length === 0) {
    const fromFileT = loadTenantsFromJsonFiles();
    const fromFileA = loadAttendantsFromJsonFiles();
    if (fromFileT.length > 0 || fromFileA.length > 0) {
      await replaceTenantsTable(p, fromFileT);
      await replaceAttendantsTable(p, fromFileA);
      tenants = fromFileT;
      attendants = fromFileA;
      // eslint-disable-next-line no-console
      console.log(
        `[auth-postgres] Copiados ${fromFileT.length} tenant(s) e ${fromFileA.length} attendant(s) dos JSON locais para Postgres.`,
      );
    }
  }

  return { tenants, attendants };
}
