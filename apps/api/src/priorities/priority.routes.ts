import type { Express } from "express";
import { priorityRepository, queueRepository, tenantRepository } from "../lib/repositories";
import {
  PriorityService,
  createTenantPrioritySchema,
  updateTenantPrioritySchema,
} from "./priority.service";

const priorityService = new PriorityService(priorityRepository);

const ensureTenantExists = (tenantId: string) => Boolean(tenantRepository.getById(tenantId));

export const registerPriorityRoutes = (app: Express) => {
  app.get("/api/master/tenants/:tenantId/priorities", (req, res) => {
    if (!ensureTenantExists(req.params.tenantId)) {
      return res.status(404).json({ message: "Tenant not found" });
    }
    return res.status(200).json(priorityService.listByTenant(req.params.tenantId));
  });

  app.post("/api/master/tenants/:tenantId/priorities", (req, res) => {
    if (!ensureTenantExists(req.params.tenantId)) {
      return res.status(404).json({ message: "Tenant not found" });
    }
    try {
      const input = createTenantPrioritySchema.parse(req.body);
      const created = priorityService.create(req.params.tenantId, input);
      return res.status(201).json(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      const status = message.includes("Já existe") ? 409 : 400;
      return res.status(status).json({ message });
    }
  });

  app.patch("/api/master/tenants/:tenantId/priorities/:priorityId", (req, res) => {
    if (!ensureTenantExists(req.params.tenantId)) {
      return res.status(404).json({ message: "Tenant not found" });
    }
    try {
      const input = updateTenantPrioritySchema.parse(req.body);
      const updated = priorityService.update(req.params.tenantId, req.params.priorityId, input);
      queueRepository.propagatePriorityRename(req.params.tenantId, req.params.priorityId, updated.name);
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

  app.delete("/api/master/tenants/:tenantId/priorities/:priorityId", (req, res) => {
    if (!ensureTenantExists(req.params.tenantId)) {
      return res.status(404).json({ message: "Tenant not found" });
    }
    const ok = priorityService.delete(req.params.tenantId, req.params.priorityId);
    if (!ok) return res.status(404).json({ message: "Priority not found" });
    return res.status(204).send();
  });
};
