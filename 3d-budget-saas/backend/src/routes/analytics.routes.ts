import { Router } from "express";
import { analyticsController } from "../controllers/analytics.controller";

export const analyticsRoutes = Router();

analyticsRoutes.get("/overview", (request, response, next) =>
  analyticsController.overview(request, response, next),
);

analyticsRoutes.get("/export", (request, response, next) =>
  analyticsController.export(request, response, next),
);
