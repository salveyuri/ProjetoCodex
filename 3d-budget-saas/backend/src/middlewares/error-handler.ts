import type { ApiErrorResponse } from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { systemErrorService } from "../services/system-error.service";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code = "INTERNAL_SERVER_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundHandler = (
  request: Request,
  _response: Response,
  next: NextFunction,
): void => {
  next(
    new AppError(
      `Route ${request.method} ${request.originalUrl} not found`,
      404,
      "ROUTE_NOT_FOUND",
    ),
  );
};

export const errorHandler = (
  error: Error,
  request: Request,
  response: Response<ApiErrorResponse>,
  _next: NextFunction,
): void => {
  const isOperational = error instanceof AppError;
  const statusCode = isOperational ? error.statusCode : 500;

  if (!isOperational || statusCode >= 500) {
    logger.error(
      {
        error,
        method: request.method,
        path: request.originalUrl,
        statusCode,
        userId: request.auth?.userId,
        companyId: request.auth?.companyId,
      },
      "Request failed",
    );
  } else {
    logger.warn(
      {
        error,
        method: request.method,
        path: request.originalUrl,
        statusCode,
      },
      "Request rejected",
    );
  }

  if (!(isOperational && error.code === "ROUTE_NOT_FOUND")) {
    void systemErrorService.capture(error, request, statusCode);
  }

  response.status(statusCode).json({
    status: "error",
    message: isOperational ? error.message : "Unexpected server error",
    code: isOperational ? error.code : "INTERNAL_SERVER_ERROR",
    details:
      isOperational || env.nodeEnv !== "production"
        ? (error as AppError).details
        : undefined,
    timestamp: new Date().toISOString(),
  });
};
