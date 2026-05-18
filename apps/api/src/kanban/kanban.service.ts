import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { KanbanCustomColumn, KanbanOrganizeBy, TenantKanbanConfig } from "./kanban.repository";
import { KanbanRepository } from "./kanban.repository";

const columnNameSchema = z.string().trim().min(2, "Nome da coluna deve ter ao menos 2 caracteres.").max(48);

const customColumnSchema = z.object({
  id: z.string().max(64).optional(),
  name: columnNameSchema,
  sortOrder: z.number().int().min(0).optional(),
});

export const updateTenantKanbanConfigSchema = z
  .object({
    organizeBy: z.enum(["priority", "labels", "custom"]),
    customColumns: z.array(customColumnSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.organizeBy !== "custom") return;
    const columns = value.customColumns ?? [];
    if (columns.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe ao menos 2 colunas personalizadas.",
        path: ["customColumns"],
      });
      return;
    }
    if (columns.length > 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "O Kanban personalizado aceita no máximo 12 colunas.",
        path: ["customColumns"],
      });
    }
    const keys = columns.map((col) => col.name.trim().toLowerCase());
    const unique = new Set(keys);
    if (unique.size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Os nomes das colunas personalizadas devem ser únicos.",
        path: ["customColumns"],
      });
    }
  });

export type TenantKanbanConfigPublic = TenantKanbanConfig;

const defaultConfig = (tenantId: string): TenantKanbanConfig => ({
  tenantId,
  organizeBy: "priority",
  customColumns: [],
  updatedAt: new Date().toISOString(),
});

export class KanbanService {
  constructor(private readonly repository: KanbanRepository) {}

  getByTenant(tenantId: string): TenantKanbanConfigPublic {
    return this.repository.getByTenantId(tenantId) ?? defaultConfig(tenantId);
  }

  update(tenantId: string, input: z.infer<typeof updateTenantKanbanConfigSchema>): TenantKanbanConfigPublic {
    const organizeBy = input.organizeBy as KanbanOrganizeBy;
    let customColumns: KanbanCustomColumn[] = [];

    if (organizeBy === "custom") {
      const incoming = input.customColumns ?? [];
      customColumns = incoming.map((col, index) => ({
        id: col.id && col.id.length > 0 ? col.id : randomUUID(),
        name: col.name.trim(),
        sortOrder: col.sortOrder ?? index,
      }));
    }

    const config: TenantKanbanConfig = {
      tenantId,
      organizeBy,
      customColumns,
      updatedAt: new Date().toISOString(),
    };
    return this.repository.upsert(config);
  }
}
