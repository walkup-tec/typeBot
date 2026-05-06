import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { authEmailsEquivalent, normalizeAuthIdentifier } from "../lib/auth-email";
import { getDataFilePath } from "../lib/data-path";
import { isAuthPostgresEnabled, loadAttendantsFromPostgres, schedulePersistAttendants } from "../lib/auth-postgres";

export type AttendantRole = "master" | "manager" | "attendant";

export interface Attendant {
  id: string;
  tenantId: string;
  username: string;
  email?: string;
  displayName: string;
  passwordHash: string;
  role: AttendantRole;
  createdAt: string;
}

const FILE_PATH = getDataFilePath("attendants.json");

const ensureStorage = () => {
  const folder = dirname(FILE_PATH);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  if (!existsSync(FILE_PATH)) {
    writeFileSync(FILE_PATH, "[]", "utf-8");
  }
};

const loadAll = (): Attendant[] => {
  ensureStorage();
  try {
    const raw = readFileSync(FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Attendant[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveAll = (rows: Attendant[]) => {
  ensureStorage();
  writeFileSync(FILE_PATH, JSON.stringify(rows, null, 2), "utf-8");
};

const persistAttendantsSnapshot = (rows: Attendant[]) => {
  const snapshot = [...rows];
  if (isAuthPostgresEnabled()) {
    schedulePersistAttendants(snapshot);
    return;
  }
  saveAll(snapshot);
};

export class AttendantRepository {
  private rows: Attendant[] = [];

  constructor() {
    if (!isAuthPostgresEnabled()) {
      this.rows = loadAll();
    }
  }

  /** Preenche linhas em memória após bootstrap Postgres (ou testes). */
  hydrate(rows: Attendant[]): void {
    this.rows = [...rows];
  }

  /** Re-lê `attendants.json` (útil antes de auth se o ficheiro foi atualizado noutro processo ou restore). */
  reloadFromDisk(): void {
    this.rows = loadAll();
  }

  /** Postgres: recarrega da base. JSON: re-lê o ficheiro. */
  async reloadFromStorage(): Promise<void> {
    if (isAuthPostgresEnabled()) {
      this.rows = await loadAttendantsFromPostgres();
      return;
    }
    this.reloadFromDisk();
  }

  listByTenant(tenantId: string): Attendant[] {
    return this.rows.filter((row) => row.tenantId === tenantId);
  }

  listAll(): Attendant[] {
    return [...this.rows];
  }

  findByUsername(tenantId: string, username: string): Attendant | null {
    const key = username.trim().toLowerCase();
    return this.rows.find((row) => row.tenantId === tenantId && row.username.toLowerCase() === key) ?? null;
  }

  findByUsernameGlobal(username: string): Attendant | null {
    const key = normalizeAuthIdentifier(username);
    if (!key) return null;
    return this.rows.find((row) => normalizeAuthIdentifier(row.username) === key) ?? null;
  }

  /** Username compatível com equivalência Gmail quando aplicável. */
  findByUsernameGlobalRelaxed(identifier: string): Attendant | null {
    const key = normalizeAuthIdentifier(identifier);
    if (!key) return null;
    return (
      this.rows.find((row) => {
        const un = normalizeAuthIdentifier(row.username);
        return un.length > 0 && (un === key || authEmailsEquivalent(un, key));
      }) ?? null
    );
  }

  /**
   * Possíveis contas para um identificador (username ou e-mail).
   * Se parecer e-mail (`@`), prioriza linhas com `email` igual — evita ficar preso a um username duplicado/obsoleto com a mesma string.
   */
  listLoginCandidates(identifier: string): Attendant[] {
    const key = normalizeAuthIdentifier(identifier);
    if (!key) return [];
    const seen = new Set<string>();
    const out: Attendant[] = [];
    const add = (row: Attendant) => {
      if (seen.has(row.id)) return;
      seen.add(row.id);
      out.push(row);
    };

    const emailRows = this.rows.filter((row) => {
      const em = normalizeAuthIdentifier(row.email ?? "");
      return em.length > 0 && (em === key || authEmailsEquivalent(em, key));
    });
    const usernameRows = this.rows.filter((row) => {
      const un = normalizeAuthIdentifier(row.username);
      if (!un) return false;
      if (un === key) return true;
      return key.includes("@") && un.includes("@") && authEmailsEquivalent(un, key);
    });


    if (key.includes("@")) {
      for (const row of emailRows) add(row);
      for (const row of usernameRows) add(row);
    } else {
      for (const row of usernameRows) add(row);
      for (const row of emailRows) add(row);
    }

    return out;
  }

  /** Login: mesmo valor que o utilizador mete no campo "Usuário" pode ser username ou e-mail cadastrado. */
  findByUsernameOrEmailGlobal(identifier: string): Attendant | null {
    return this.listLoginCandidates(identifier)[0] ?? null;
  }

  /** E-mail guardado no atendente (não confunde com titular do tenant). */
  findByEmailGlobal(email: string): Attendant | null {
    const key = normalizeAuthIdentifier(email);
    if (!key) return null;
    return this.rows.find((row) => normalizeAuthIdentifier(row.email ?? "") === key) ?? null;
  }

  /** E-mail no cadastro com equivalência Gmail / normalização NFKC. */
  findByEmailGlobalRelaxed(identifier: string): Attendant | null {
    const key = normalizeAuthIdentifier(identifier);
    if (!key) return null;
    return (
      this.rows.find((row) => {
        const em = normalizeAuthIdentifier(row.email ?? "");
        return em.length > 0 && authEmailsEquivalent(em, key);
      }) ?? null
    );
  }

  create(row: Attendant): Attendant {
    this.rows.push(row);
    persistAttendantsSnapshot(this.rows);
    return row;
  }

  updateById(
    id: string,
    patch: {
      passwordHash?: string;
      email?: string;
    },
  ): Attendant | null {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index < 0) return null;
    const current = this.rows[index];
    if (!current) return null;
    const updated: Attendant = {
      ...current,
      ...patch,
      email: patch.email === undefined ? current.email : patch.email,
    };
    this.rows[index] = updated;
    persistAttendantsSnapshot(this.rows);
    return updated;
  }

  deleteById(id: string): boolean {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.id !== id);
    if (this.rows.length === before) return false;
    persistAttendantsSnapshot(this.rows);
    return true;
  }

  /** Remove todos os atendentes do assinante (ex.: ao apagar o tenant). */
  deleteByTenantId(tenantId: string): void {
    const next = this.rows.filter((row) => row.tenantId !== tenantId);
    if (next.length === this.rows.length) return;
    this.rows = next;
    persistAttendantsSnapshot(this.rows);
  }

  /** Contagem em memória; chama `reloadFromDisk()` antes se precisares do estado em disco. */
  countAll(): number {
    return this.rows.length;
  }
}
