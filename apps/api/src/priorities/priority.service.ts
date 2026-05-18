import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DEFAULT_PRIORITY_NAMES } from "./priority.defaults";
import type { TenantPriority } from "./priority.repository";
import { PriorityRepository } from "./priority.repository";

const priorityNameSchema = z
  .string()
  .trim()
  .min(2, "Nome da prioridade deve ter ao menos 2 caracteres.")
  .max(48);

export const createTenantPrioritySchema = z.object({
  name: priorityNameSchema,
});

export const updateTenantPrioritySchema = z.object({
  name: priorityNameSchema,
});

export type TenantPriorityPublic = TenantPriority;

export class PriorityService {
  constructor(private readonly repository: PriorityRepository) {}

  listByTenant(tenantId: string): TenantPriorityPublic[] {
    const existing = this.repository.listByTenant(tenantId);
    if (existing.length > 0) {
      return existing;
    }
    return this.seedDefaults(tenantId);
  }

  private seedDefaults(tenantId: string): TenantPriorityPublic[] {
    const createdAt = new Date().toISOString();
    const rows: TenantPriority[] = DEFAULT_PRIORITY_NAMES.map((name, index) => ({
      id: randomUUID(),
      tenantId,
      name,
      createdAt,
      sortOrder: index,
      isDefault: true,
    }));
    return this.repository.createMany(rows);
  }

  create(tenantId: string, input: z.infer<typeof createTenantPrioritySchema>): TenantPriorityPublic {
    if (this.repository.listByTenant(tenantId).length === 0) {
      this.seedDefaults(tenantId);
    }
    const name = input.name.trim();
    if (this.repository.findByName(tenantId, name)) {
      throw new Error("Já existe uma prioridade com este nome neste assinante.");
    }
    const existing = this.repository.listByTenant(tenantId);
    const row: TenantPriority = {
      id: randomUUID(),
      tenantId,
      name,
      createdAt: new Date().toISOString(),
      sortOrder: existing.length,
      isDefault: false,
    };
    return this.repository.create(row);
  }

  update(
    tenantId: string,
    priorityId: string,
    input: z.infer<typeof updateTenantPrioritySchema>,
  ): TenantPriorityPublic {
    const current = this.repository.findById(tenantId, priorityId);
    if (!current) {
      throw new Error("Prioridade não encontrada.");
    }
    const nextName = input.name.trim();
    if (this.repository.findByName(tenantId, nextName, priorityId)) {
      throw new Error("Já existe uma prioridade com este nome neste assinante.");
    }
    const updated = this.repository.updateById(tenantId, priorityId, {
      name: nextName,
      sortOrder: current.sortOrder,
    });
    if (!updated) {
      throw new Error("Prioridade não encontrada.");
    }
    return updated;
  }

  delete(tenantId: string, priorityId: string): boolean {
    return this.repository.deleteById(tenantId, priorityId);
  }
}
