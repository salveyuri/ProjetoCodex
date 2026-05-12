import { Router } from "express";
import { materialController } from "../controllers/material.controller";
import { requireUsageLimit } from "../middlewares/plan-middleware";

export const materialRoutes = Router();

materialRoutes.get("/", (request, response, next) =>
  materialController.index(request, response, next),
);

materialRoutes.post("/", requireUsageLimit("MATERIALS"), (request, response, next) =>
  materialController.create(request, response, next),
);

materialRoutes.put("/:id", (request, response, next) =>
  materialController.update(request, response, next),
);

materialRoutes.delete("/:id", (request, response, next) =>
  materialController.delete(request, response, next),
);
