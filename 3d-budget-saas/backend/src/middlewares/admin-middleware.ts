import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { AppError } from "./error-handler";

export const adminMiddleware = async (
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = request.auth?.userId;

    if (!userId) {
      next(new AppError("Missing authenticated user.", 401, "AUTH_CONTEXT_MISSING"));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });

    if (!user?.isActive || user.role !== "ADMIN") {
      next(new AppError("Admin privileges required.", 403, "ADMIN_REQUIRED"));
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
