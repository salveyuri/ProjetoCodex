import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import {
  billingService,
  type PlanFeature,
  type UsageResource,
} from "../services/billing.service";
import { getAuthenticatedCompanyId } from "../utils/request-auth";

const isCurrentUserAdmin = async (request: Request): Promise<boolean> => {
  const userId = request.auth?.userId;

  if (!userId) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });

  return Boolean(user?.isActive && user.role === "ADMIN");
};

export const requireUsageLimit =
  (resource: UsageResource) =>
  async (
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!(await isCurrentUserAdmin(request))) {
        await billingService.ensureWithinLimit(
          getAuthenticatedCompanyId(request),
          resource,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };

export const requirePlanFeature =
  (feature: PlanFeature) =>
  async (
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!(await isCurrentUserAdmin(request))) {
        await billingService.ensureFeature(
          getAuthenticatedCompanyId(request),
          feature,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
