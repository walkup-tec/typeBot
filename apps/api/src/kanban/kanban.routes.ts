import type { Express } from "express";
import { kanbanRepository, tenantRepository } from "../lib/repositories";
import { KanbanService, updateTenantKanbanConfigSchema } from "./kanban.service";

const kanbanService = new KanbanService(kanbanRepository);

const ensureTenantExists = (tenantId: string) => Boolean(tenantRepository.getById(tenantId));

export const registerKanbanRoutes = (app: Express) => {
  app.get("/api/master/tenants/:tenantId/kanban-config", (req, res) => {
    if (!ensureTenantExists(req.params.tenantId)) {
      return res.status(404).json({ message: "Tenant not found" });
    }
    const tenantId = req.params.tenantId;
    const persisted = kanbanRepository.getByTenantId(tenantId);
    return res.status(200).json({
      ...kanbanService.getByTenant(tenantId),
      isPersisted: Boolean(persisted),
    });
  });

  app.put("/api/master/tenants/:tenantId/kanban-config", (req, res) => {
    if (!ensureTenantExists(req.params.tenantId)) {
      return res.status(404).json({ message: "Tenant not found" });
    }
    try {
      const input = updateTenantKanbanConfigSchema.parse(req.body);
      const updated = kanbanService.update(req.params.tenantId, input);
      return res.status(200).json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      return res.status(400).json({ message });
    }
  });
};
