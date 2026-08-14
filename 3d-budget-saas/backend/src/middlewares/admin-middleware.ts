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
      // Deliberately generic: naming the exact missing role tells an
      // attacker precisely what to try forging. ADMIN_REQUIRED (the code,
      // not this message) is what the frontend/API consumers should key
      // off of instead.
      next(new AppError("Access denied.", 403, "ADMIN_REQUIRED"));
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
