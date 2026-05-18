import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getDataFilePath } from "../lib/data-path";

export interface TenantPriority {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
  sortOrder: number;
  isDefault: boolean;
}

const FILE_PATH = getDataFilePath("tenant-priorities.json");

const ensureStorage = () => {
  const folder = dirname(FILE_PATH);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  if (!existsSync(FILE_PATH)) {
    writeFileSync(FILE_PATH, "[]", "utf-8");
  }
};

const loadAll = (): TenantPriority[] => {
  ensureStorage();
  try {
    const raw = readFileSync(FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as TenantPriority[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveAll = (rows: TenantPriority[]) => {
  ensureStorage();
  writeFileSync(FILE_PATH, JSON.stringify(rows, null, 2), "utf-8");
};

export class PriorityRepository {
  private rows: TenantPriority[] = [];

  constructor() {
    this.rows = loadAll();
  }

  listByTenant(tenantId: string): TenantPriority[] {
    return this.rows
      .filter((row) => row.tenantId === tenantId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }

  findById(tenantId: string, priorityId: string): TenantPriority | null {
    return this.rows.find((row) => row.tenantId === tenantId && row.id === priorityId) ?? null;
  }

  findByName(tenantId: string, name: string, excludeId?: string): TenantPriority | null {
    const key = name.trim().toLowerCase();
    return (
      this.rows.find(
        (row) =>
          row.tenantId === tenantId &&
          row.id !== excludeId &&
          row.name.trim().toLowerCase() === key,
      ) ?? null
    );
  }

  create(row: TenantPriority): TenantPriority {
    this.rows.push(row);
    saveAll(this.rows);
    return row;
  }

  createMany(rows: TenantPriority[]): TenantPriority[] {
    this.rows.push(...rows);
    saveAll(this.rows);
    return rows;
  }

  updateById(
    tenantId: string,
    priorityId: string,
    patch: Pick<TenantPriority, "name" | "sortOrder">,
  ): TenantPriority | null {
    const index = this.rows.findIndex((row) => row.tenantId === tenantId && row.id === priorityId);
    if (index < 0) return null;
    const current = this.rows[index];
    if (!current) return null;
    const updated: TenantPriority = { ...current, ...patch };
    this.rows[index] = updated;
    saveAll(this.rows);
    return updated;
  }

  deleteById(tenantId: string, priorityId: string): boolean {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !(row.tenantId === tenantId && row.id === priorityId));
    if (this.rows.length === before) return false;
    saveAll(this.rows);
    return true;
  }

  deleteByTenantId(tenantId: string): void {
    const next = this.rows.filter((row) => row.tenantId !== tenantId);
    if (next.length === this.rows.length) return;
    this.rows = next;
    saveAll(this.rows);
  }
}
