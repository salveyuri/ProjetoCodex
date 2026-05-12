import { Router } from "express";
import { settingsController } from "../controllers/settings.controller";

export const settingsRoutes = Router();

settingsRoutes.get("/", (request, response, next) =>
  settingsController.show(request, response, next),
);

settingsRoutes.put("/", (request, response, next) =>
  settingsController.save(request, response, next),
);

