import { Router } from "express";
import { healthController } from "../controllers/health.controller";

export const healthRoutes = Router();

healthRoutes.get("/", (request, response, next) =>
  healthController.show(request, response, next),
);

