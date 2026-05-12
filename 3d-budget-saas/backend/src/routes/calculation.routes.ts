import { Router } from "express";
import { calculationController } from "../controllers/calculation.controller";

export const calculationRoutes = Router();

calculationRoutes.post("/", (request, response, next) =>
  calculationController.calculate(request, response, next),
);
