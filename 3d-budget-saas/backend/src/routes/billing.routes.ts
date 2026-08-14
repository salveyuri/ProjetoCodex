import { Router } from "express";
import { billingController } from "../controllers/billing.controller";

export const billingRoutes = Router();

billingRoutes.get("/", (request, response, next) =>
  billingController.current(request, response, next),
);

billingRoutes.post("/checkout", (request, response, next) =>
  billingController.checkout(request, response, next),
);

billingRoutes.post("/cancel", (request, response, next) =>
  billingController.cancel(request, response, next),
);

billingRoutes.get("/payments", (request, response, next) =>
  billingController.payments(request, response, next),
);
