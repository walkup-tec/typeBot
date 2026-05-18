import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getDataFilePath } from "../lib/data-path";

export interface TenantLabel {
  id: string;
  tenantId: string;
  name: string;
  color: string;
  createdAt: string;
  sortOrder: number;
}

const FILE_PATH = getDataFilePath("tenant-labels.json");

const ensureStorage = () => {
  const folder = dirname(FILE_PATH);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  if (!existsSync(FILE_PATH)) {
    writeFileSync(FILE_PATH, "[]", "utf-8");
  }
};

const loadAll = (): TenantLabel[] => {
  ensureStorage();
  try {
    const raw = readFileSync(FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as TenantLabel[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveAll = (rows: TenantLabel[]) => {
  ensureStorage();
  writeFileSync(FILE_PATH, JSON.stringify(rows, null, 2), "utf-8");
};

export class LabelRepository {
  private rows: TenantLabel[] = [];

  constructor() {
    this.rows = loadAll();
  }

  listByTenant(tenantId: string): TenantLabel[] {
    return this.rows
      .filter((row) => row.tenantId === tenantId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }

  findById(tenantId: string, labelId: string): TenantLabel | null {
    return this.rows.find((row) => row.tenantId === tenantId && row.id === labelId) ?? null;
  }

  findByName(tenantId: string, name: string, excludeId?: string): TenantLabel | null {
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

  create(row: TenantLabel): TenantLabel {
    this.rows.push(row);
    saveAll(this.rows);
    return row;
  }

  updateById(
    tenantId: string,
    labelId: string,
    patch: Pick<TenantLabel, "name" | "color" | "sortOrder">,
  ): TenantLabel | null {
    const index = this.rows.findIndex((row) => row.tenantId === tenantId && row.id === labelId);
    if (index < 0) return null;
    const current = this.rows[index];
    if (!current) return null;
    const updated: TenantLabel = { ...current, ...patch };
    this.rows[index] = updated;
    saveAll(this.rows);
    return updated;
  }

  deleteById(tenantId: string, labelId: string): boolean {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !(row.tenantId === tenantId && row.id === labelId));
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
