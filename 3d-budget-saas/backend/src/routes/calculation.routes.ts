import { Router } from "express";
import { calculationController } from "../controllers/calculation.controller";
import { calculationRateLimiter } from "../middlewares/rate-limit-middleware";

export const calculationRoutes = Router();

calculationRoutes.post("/", calculationRateLimiter, (request, response, next) =>
  calculationController.calculate(request, response, next),
);
