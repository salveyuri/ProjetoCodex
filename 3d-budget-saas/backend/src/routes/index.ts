import { Router } from "express";
import { adminRoutes } from "./admin.routes";
import { analyticsRoutes } from "./analytics.routes";
import { authRoutes } from "./auth.routes";
import { billingRoutes } from "./billing.routes";
import { healthRoutes } from "./health.routes";
import { accountStatusMiddleware } from "../middlewares/account-status-middleware";
import { adminMiddleware } from "../middlewares/admin-middleware";
import { authMiddleware } from "../middlewares/auth-middleware";
import { machineRoutes } from "./machine.routes";
import { machineCatalogRoutes } from "./machine-catalog.routes";
import { materialRoutes } from "./material.routes";
import { settingsRoutes } from "./settings.routes";
import { calculationRoutes } from "./calculation.routes";
import { quoteRoutes } from "./quote.routes";
import { formulaRoutes } from "./formula.routes";
import { planRoutes } from "./plan.routes";
import { webhookRoutes } from "./webhook.routes";

export const apiRoutes = Router();

apiRoutes.use("/auth", authRoutes);
apiRoutes.use("/health", healthRoutes);
apiRoutes.use("/machines", authMiddleware, accountStatusMiddleware, machineRoutes);
apiRoutes.use(
  "/machine-catalog",
  authMiddleware,
  accountStatusMiddleware,
  machineCatalogRoutes,
);
apiRoutes.use("/materials", authMiddleware, accountStatusMiddleware, materialRoutes);
apiRoutes.use("/settings", authMiddleware, accountStatusMiddleware, settingsRoutes);
apiRoutes.use("/calculate", authMiddleware, accountStatusMiddleware, calculationRoutes);
apiRoutes.use("/quotes", authMiddleware, accountStatusMiddleware, quoteRoutes);
apiRoutes.use("/formulas", authMiddleware, accountStatusMiddleware, formulaRoutes);
apiRoutes.use("/billing", authMiddleware, accountStatusMiddleware, billingRoutes);
apiRoutes.use("/analytics", authMiddleware, accountStatusMiddleware, analyticsRoutes);
apiRoutes.use("/plans", authMiddleware, accountStatusMiddleware, planRoutes);
apiRoutes.use(
  "/admin",
  authMiddleware,
  accountStatusMiddleware,
  adminMiddleware,
  adminRoutes,
);
// Asaas calls this unauthenticated (no JWT) — verified inside
// webhook.controller.ts via the asaas-access-token header instead.
apiRoutes.use("/webhooks", webhookRoutes);
