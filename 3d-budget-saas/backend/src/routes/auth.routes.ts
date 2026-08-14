import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth-middleware";
import {
  loginRateLimiter,
  refreshRateLimiter,
  registerRateLimiter,
} from "../middlewares/rate-limit-middleware";

export const authRoutes = Router();

authRoutes.post("/register", registerRateLimiter, (request, response, next) =>
  authController.register(request, response, next),
);

authRoutes.post("/login", loginRateLimiter, (request, response, next) =>
  authController.login(request, response, next),
);

authRoutes.get("/me", authMiddleware, (request, response, next) =>
  authController.me(request, response, next),
);

// refresh/logout/logout-all intentionally don't require authMiddleware:
// they only need the httpOnly refresh cookie, so they keep working even
// when the short-lived access token has already expired.
authRoutes.post("/refresh", refreshRateLimiter, (request, response, next) =>
  authController.refresh(request, response, next),
);

authRoutes.post("/logout", (request, response, next) =>
  authController.logout(request, response, next),
);

authRoutes.post("/logout-all", (request, response, next) =>
  authController.logoutAll(request, response, next),
);
