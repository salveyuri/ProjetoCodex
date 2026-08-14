import { Router } from "express";
import { machineCatalogController } from "../controllers/machine-catalog.controller";

export const machineCatalogRoutes = Router();

machineCatalogRoutes.get("/", (request, response, next) =>
  machineCatalogController.search(request, response, next),
);
