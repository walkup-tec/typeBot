import type { Express } from "express";
import { labelRepository, queueRepository, tenantRepository } from "../lib/repositories";
import {
  LabelService,
  createTenantLabelSchema,
  updateTenantLabelSchema,
} from "./label.service";

const labelService = new LabelService(labelRepository);

const ensureTenantExists = (tenantId: string) => Boolean(tenantRepository.getById(tenantId));

export const registerLabelRoutes = (app: Express) => {
  app.get("/api/master/tenants/:tenantId/labels", (req, res) => {
    if (!ensureTenantExists(req.params.tenantId)) {
      return res.status(404).json({ message: "Tenant not found" });
    }
    return res.status(200).json(labelService.listByTenant(req.params.tenantId));
  });

  app.post("/api/master/tenants/:tenantId/labels", (req, res) => {
    if (!ensureTenantExists(req.params.tenantId)) {
      return res.status(404).json({ message: "Tenant not found" });
    }
    try {
      const input = createTenantLabelSchema.parse(req.body);
      const created = labelService.create(req.params.tenantId, input);
      return res.status(201).json(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      const status = message.includes("Já existe") ? 409 : 400;
      return res.status(status).json({ message });
    }
  });

  app.patch("/api/master/tenants/:tenantId/labels/:labelId", (req, res) => {
    if (!ensureTenantExists(req.params.tenantId)) {
      return res.status(404).json({ message: "Tenant not found" });
    }
    try {
      const input = updateTenantLabelSchema.parse(req.body);
      const updated = labelService.update(req.params.tenantId, req.params.labelId, input);
      queueRepository.propagateLabelRename(req.params.tenantId, req.params.labelId, {
        name: updated.name,
        color: updated.color,
      });
      return res.status(200).json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      if (message.includes("não encontrada")) {
        return res.status(404).json({ message });
      }
      const status = message.includes("Já existe") ? 409 : 400;
      return res.status(status).json({ message });
    }
  });

  app.delete("/api/master/tenants/:tenantId/labels/:labelId", (req, res) => {
    if (!ensureTenantExists(req.params.tenantId)) {
      return res.status(404).json({ message: "Tenant not found" });
    }
    const ok = labelService.delete(req.params.tenantId, req.params.labelId);
    if (!ok) return res.status(404).json({ message: "Label not found" });
    return res.status(204).send();
  });
};
