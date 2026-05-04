import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getDataFilePath } from "../lib/data-path";

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

export class AttendantRepository {
  private rows: Attendant[] = [];

  constructor() {
    this.rows = loadAll();
  }

  listByTenant(tenantId: string): Attendant[] {
    return this.rows.filter((row) => row.tenantId === tenantId);
  }

  findByUsername(tenantId: string, username: string): Attendant | null {
    const key = username.trim().toLowerCase();
    return this.rows.find((row) => row.tenantId === tenantId && row.username.toLowerCase() === key) ?? null;
  }

  findByUsernameGlobal(username: string): Attendant | null {
    const key = username.trim().toLowerCase();
    return this.rows.find((row) => row.username.toLowerCase() === key) ?? null;
  }

  /** Login: mesmo valor que o utilizador mete no campo "Usuário" pode ser username ou e-mail cadastrado. */
  findByUsernameOrEmailGlobal(identifier: string): Attendant | null {
    const key = identifier.trim().toLowerCase();
    if (!key) return null;
    const byUsername = this.rows.find((row) => row.username.toLowerCase() === key);
    if (byUsername) return byUsername;
    return this.rows.find((row) => (row.email ?? "").trim().toLowerCase() === key) ?? null;
  }

  create(row: Attendant): Attendant {
    this.rows.push(row);
    saveAll(this.rows);
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
    saveAll(this.rows);
    return updated;
  }

  deleteById(id: string): boolean {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.id !== id);
    if (this.rows.length === before) return false;
    saveAll(this.rows);
    return true;
  }
}
