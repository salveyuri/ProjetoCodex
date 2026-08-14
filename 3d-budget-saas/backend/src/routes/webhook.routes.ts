import { Router } from "express";
import { webhookController } from "../controllers/webhook.controller";

export const webhookRoutes = Router();

// No authMiddleware here on purpose — Asaas calls this without a JWT.
// Authenticity is verified inside the controller via the
// asaas-access-token header (see webhook.controller.ts).
webhookRoutes.post("/asaas", (request, response, next) =>
  webhookController.asaas(request, response, next),
);
