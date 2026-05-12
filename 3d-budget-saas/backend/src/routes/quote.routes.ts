import { Router } from "express";
import { quoteController } from "../controllers/quote.controller";
import {
  requirePlanFeature,
  requireUsageLimit,
} from "../middlewares/plan-middleware";

export const quoteRoutes = Router();

quoteRoutes.get("/", (request, response, next) =>
  quoteController.index(request, response, next),
);

quoteRoutes.post(
  "/",
  requireUsageLimit("MONTHLY_QUOTES"),
  (request, response, next) => quoteController.create(request, response, next),
);

quoteRoutes.get(
  "/:id/pdf",
  requirePlanFeature("PDF_EXPORT"),
  (request, response, next) => quoteController.exportPdf(request, response, next),
);

quoteRoutes.get("/:id", (request, response, next) =>
  quoteController.show(request, response, next),
);

quoteRoutes.patch("/:id", (request, response, next) =>
  quoteController.update(request, response, next),
);

quoteRoutes.delete("/:id", (request, response, next) =>
  quoteController.delete(request, response, next),
);
