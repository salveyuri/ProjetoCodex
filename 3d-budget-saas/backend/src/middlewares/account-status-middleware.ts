import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { AppError } from "./error-handler";

export const accountStatusMiddleware = async (
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
      select: { isActive: true },
    });

    if (!user || !user.isActive) {
      next(new AppError("User account is inactive.", 403, "ACCOUNT_INACTIVE"));
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
