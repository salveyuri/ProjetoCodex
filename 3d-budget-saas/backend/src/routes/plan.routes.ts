import { Router } from "express";
import { planController } from "../controllers/plan.controller";

export const planRoutes = Router();

planRoutes.get("/", (request, response, next) =>
  planController.listPublic(request, response, next),
);
