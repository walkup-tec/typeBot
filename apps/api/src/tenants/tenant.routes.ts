import type { Express } from "express";
import { tenantRepository } from "../lib/repositories";
import {
  TenantService,
  createTenantSchema,
  updateTenantSchema,
  updateTenantProfileImageSchema,
  updateTenantStatusSchema,
  updateTenantChatThemeSchema,
} from "./tenant.service";

const tenantService = new TenantService(tenantRepository);

export const registerTenantRoutes = (app: Express) => {
  app.get("/api/master/typebot/capabilities", (_req, res) => {
    return res.status(200).json(tenantService.getTypebotCapabilities());
  });

  app.post("/api/master/tenants", (req, res) => {
    const input = createTenantSchema.parse(req.body);
    const tenant = tenantService.create(input);
    return res.status(201).json(tenant);
  });

  app.get("/api/master/tenants", (_req, res) => {
    return res.status(200).json(tenantService.list());
  });

  app.patch("/api/master/tenants/:id/status", (req, res) => {
    const input = updateTenantStatusSchema.parse(req.body);
    const tenant = tenantService.updateStatus(req.params.id, input.status);

    if (!tenant) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    return res.status(200).json(tenant);
  });

  app.patch("/api/master/tenants/:id/profile-image", (req, res) => {
    try {
      const input = updateTenantProfileImageSchema.parse(req.body);
      const tenant = tenantService.patchLeadChatProfile(req.params.id, input);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      return res.status(200).json(tenant);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.patch("/api/master/tenants/:id/chat-theme", (req, res) => {
    try {
      const input = updateTenantChatThemeSchema.parse(req.body);
      const tenant = tenantService.updateChatTheme(req.params.id, input);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      return res.status(200).json(tenant);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.patch("/api/master/tenants/:id", (req, res) => {
    const input = updateTenantSchema.parse(req.body);
    const tenant = tenantService.update(req.params.id, input);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    return res.status(200).json(tenant);
  });

};
