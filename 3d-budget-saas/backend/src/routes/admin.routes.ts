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
