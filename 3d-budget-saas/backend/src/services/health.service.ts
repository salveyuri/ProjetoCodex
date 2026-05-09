import type { HealthCheckResponse } from "@3d-budget/shared";
import { performance } from "node:perf_hooks";
import { prisma } from "../config/database";

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown database error";

export class HealthService {
  async getHealthCheck(): Promise<HealthCheckResponse> {
    const startedAt = performance.now();

    try {
      await prisma.$queryRaw`SELECT 1`;

      return {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Number(process.uptime().toFixed(2)),
        server: {
          status: "online",
        },
        database: {
          status: "connected",
          latencyMs: Number((performance.now() - startedAt).toFixed(2)),
        },
      };
    } catch (error) {
      return {
        status: "degraded",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Number(process.uptime().toFixed(2)),
        server: {
          status: "online",
        },
        database: {
          status: "unavailable",
          latencyMs: null,
          error: getErrorMessage(error),
        },
      };
    }
  }
}

export const healthService = new HealthService();

