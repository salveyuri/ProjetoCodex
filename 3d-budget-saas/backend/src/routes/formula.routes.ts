import { Router } from "express";
import { formulaController } from "../controllers/formula.controller";
import { requirePlanFeature } from "../middlewares/plan-middleware";

export const formulaRoutes = Router();

formulaRoutes.get("/", (request, response, next) =>
  formulaController.index(request, response, next),
);

formulaRoutes.get("/variables", (request, response, next) =>
  formulaController.variables(request, response, next),
);

formulaRoutes.post("/", requirePlanFeature("CUSTOM_FORMULAS"), (request, response, next) =>
  formulaController.create(request, response, next),
);

formulaRoutes.post("/preview", requirePlanFeature("CUSTOM_FORMULAS"), (request, response, next) =>
  formulaController.preview(request, response, next),
);

formulaRoutes.put("/:id", requirePlanFeature("CUSTOM_FORMULAS"), (request, response, next) =>
  formulaController.update(request, response, next),
);

formulaRoutes.delete("/:id", requirePlanFeature("CUSTOM_FORMULAS"), (request, response, next) =>
  formulaController.delete(request, response, next),
);
