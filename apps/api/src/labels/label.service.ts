import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TenantLabel } from "./label.repository";
import { LabelRepository } from "./label.repository";
import { isValidLabelColor, normalizeLabelColor } from "./label-color";

const labelNameSchema = z.string().trim().min(2, "Nome da etiqueta deve ter ao menos 2 caracteres.").max(48);

const labelColorSchema = z
  .string()
  .trim()
  .refine((value) => isValidLabelColor(value), "Cor inválida. Use um código hexadecimal (#RRGGBB).");

export const createTenantLabelSchema = z.object({
  name: labelNameSchema,
  color: labelColorSchema,
});

export const updateTenantLabelSchema = z
  .object({
    name: labelNameSchema.optional(),
    color: labelColorSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.color !== undefined, {
    message: "Informe nome ou cor para atualizar.",
  });

export type TenantLabelPublic = TenantLabel;

export class LabelService {
  constructor(private readonly repository: LabelRepository) {}

  listByTenant(tenantId: string): TenantLabelPublic[] {
    return this.repository.listByTenant(tenantId);
  }

  create(tenantId: string, input: z.infer<typeof createTenantLabelSchema>): TenantLabelPublic {
    const name = input.name.trim();
    if (this.repository.findByName(tenantId, name)) {
      throw new Error("Já existe uma etiqueta com este nome neste assinante.");
    }
    const color = normalizeLabelColor(input.color);
    if (!color) {
      throw new Error("Cor inválida.");
    }
    const existing = this.repository.listByTenant(tenantId);
    const row: TenantLabel = {
      id: randomUUID(),
      tenantId,
      name,
      color,
      createdAt: new Date().toISOString(),
      sortOrder: existing.length,
    };
    return this.repository.create(row);
  }

  update(tenantId: string, labelId: string, input: z.infer<typeof updateTenantLabelSchema>): TenantLabelPublic {
    const current = this.repository.findById(tenantId, labelId);
    if (!current) {
      throw new Error("Etiqueta não encontrada.");
    }
    const nextName = input.name !== undefined ? input.name.trim() : current.name;
    if (this.repository.findByName(tenantId, nextName, labelId)) {
      throw new Error("Já existe uma etiqueta com este nome neste assinante.");
    }
    const nextColor =
      input.color !== undefined ? normalizeLabelColor(input.color) : current.color;
    if (!nextColor) {
      throw new Error("Cor inválida.");
    }
    const updated = this.repository.updateById(tenantId, labelId, {
      name: nextName,
      color: nextColor,
      sortOrder: current.sortOrder,
    });
    if (!updated) {
      throw new Error("Etiqueta não encontrada.");
    }
    return updated;
  }

  delete(tenantId: string, labelId: string): boolean {
    return this.repository.deleteById(tenantId, labelId);
  }
}
