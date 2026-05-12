import { Router } from "express";
import { machineController } from "../controllers/machine.controller";
import { requireUsageLimit } from "../middlewares/plan-middleware";

export const machineRoutes = Router();

machineRoutes.get("/", (request, response, next) =>
  machineController.index(request, response, next),
);

machineRoutes.post("/", requireUsageLimit("MACHINES"), (request, response, next) =>
  machineController.create(request, response, next),
);

machineRoutes.put("/:id", (request, response, next) =>
  machineController.update(request, response, next),
);

machineRoutes.delete("/:id", (request, response, next) =>
  machineController.delete(request, response, next),
);
