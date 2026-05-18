import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getDataFilePath } from "../lib/data-path";

export type KanbanOrganizeBy = "priority" | "labels" | "custom";

export interface KanbanCustomColumn {
  id: string;
  name: string;
  sortOrder: number;
}

export interface TenantKanbanConfig {
  tenantId: string;
  organizeBy: KanbanOrganizeBy;
  customColumns: KanbanCustomColumn[];
  updatedAt: string;
}

const FILE_PATH = getDataFilePath("tenant-kanban-config.json");

const ensureStorage = () => {
  const folder = dirname(FILE_PATH);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  if (!existsSync(FILE_PATH)) {
    writeFileSync(FILE_PATH, "[]", "utf-8");
  }
};

const loadAll = (): TenantKanbanConfig[] => {
  ensureStorage();
  try {
    const raw = readFileSync(FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as TenantKanbanConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveAll = (rows: TenantKanbanConfig[]) => {
  ensureStorage();
  writeFileSync(FILE_PATH, JSON.stringify(rows, null, 2), "utf-8");
};

export class KanbanRepository {
  private rows: TenantKanbanConfig[] = [];

  constructor() {
    this.rows = loadAll();
  }

  getByTenantId(tenantId: string): TenantKanbanConfig | null {
    return this.rows.find((row) => row.tenantId === tenantId) ?? null;
  }

  upsert(config: TenantKanbanConfig): TenantKanbanConfig {
    const index = this.rows.findIndex((row) => row.tenantId === config.tenantId);
    if (index < 0) {
      this.rows.push(config);
    } else {
      this.rows[index] = config;
    }
    saveAll(this.rows);
    return config;
  }

  deleteByTenantId(tenantId: string): void {
    const next = this.rows.filter((row) => row.tenantId !== tenantId);
    if (next.length === this.rows.length) return;
    this.rows = next;
    saveAll(this.rows);
  }
}
