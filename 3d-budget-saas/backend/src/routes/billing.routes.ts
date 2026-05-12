import { Router } from "express";
import { billingController } from "../controllers/billing.controller";

export const billingRoutes = Router();

billingRoutes.get("/", (request, response, next) =>
  billingController.current(request, response, next),
);

billingRoutes.post("/upgrade", (request, response, next) =>
  billingController.upgrade(request, response, next),
);

billingRoutes.post("/cancel", (request, response, next) =>
  billingController.cancel(request, response, next),
);
