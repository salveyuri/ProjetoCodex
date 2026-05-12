import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth-middleware";

export const authRoutes = Router();

authRoutes.post("/register", (request, response, next) =>
  authController.register(request, response, next),
);

authRoutes.post("/login", (request, response, next) =>
  authController.login(request, response, next),
);

authRoutes.get("/me", authMiddleware, (request, response, next) =>
  authController.me(request, response, next),
);

