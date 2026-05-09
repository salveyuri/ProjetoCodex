import { Router } from "express";
import { healthRoutes } from "./health.routes";

export const apiRoutes = Router();

apiRoutes.use("/health", healthRoutes);

