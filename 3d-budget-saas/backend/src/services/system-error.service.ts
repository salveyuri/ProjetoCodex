import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { cacheService } from "./cache.service";

type ErrorWithDetails = Error & {
  code?: string;
  details?: unknown;
  statusCode?: number;
};

const toJsonMetadata = (value: unknown): Prisma.InputJsonValue => {
  if (value === undefined) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return { serialization: "failed" };
  }
};

export class SystemErrorService {
  async capture(
    error: Error,
    request: Request,
    statusCode: number,
  ): Promise<void> {
    try {
      const knownError = error as ErrorWithDetails;
      const metadata =
        knownError.details !== undefined
          ? toJsonMetadata(knownError.details)
          : {};

      await prisma.systemError.create({
        data: {
          message: error.message,
          stack: error.stack,
          code: knownError.code ?? "INTERNAL_SERVER_ERROR",
          severity: statusCode >= 500 ? "error" : "warn",
          method: request.method,
          path: request.originalUrl,
          statusCode,
          userId: request.auth?.userId ?? request.userId ?? null,
          companyId: request.auth?.companyId ?? null,
          metadata,
        },
      });
      cacheService.del("admin-analytics:global");
    } catch (captureError) {
      logger.warn({ error: captureError }, "System error capture failed");
    }
  }
}

export const systemErrorService = new SystemErrorService();
