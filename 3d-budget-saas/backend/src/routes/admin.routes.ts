import { Router } from "express";
import { adminController } from "../controllers/admin.controller";
import { analyticsController } from "../controllers/analytics.controller";

export const adminRoutes = Router();

adminRoutes.get("/analytics", (request, response, next) =>
  analyticsController.adminOverview(request, response, next),
);

adminRoutes.get("/users", (request, response, next) =>
  adminController.users(request, response, next),
);

adminRoutes.patch("/users/:id", (request, response, next) =>
  adminController.updateUser(request, response, next),
);

adminRoutes.get("/plans", (request, response, next) =>
  adminController.plans(request, response, next),
);

adminRoutes.post("/plans", (request, response, next) =>
  adminController.createPlan(request, response, next),
);

adminRoutes.patch("/plans/:id", (request, response, next) =>
  adminController.updatePlan(request, response, next),
);

adminRoutes.delete("/plans/:id", (request, response, next) =>
  adminController.deletePlan(request, response, next),
);

adminRoutes.get("/email-templates", (request, response, next) =>
  adminController.emailTemplates(request, response, next),
);

adminRoutes.patch("/email-templates/:id", (request, response, next) =>
  adminController.updateEmailTemplate(request, response, next),
);
