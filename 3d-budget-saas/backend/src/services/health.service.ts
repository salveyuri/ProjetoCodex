import type { HealthCheckResponse } from "@3d-budget/shared";
import { access, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { prisma } from "../config/prisma";

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown database error";

export class HealthService {
  async getHealthCheck(): Promise<HealthCheckResponse> {
    const [database, calculation, filesystem] = await Promise.all([
      this.checkDatabase(),
      this.checkCalculationQuery(),
      this.checkFilesystem(),
    ]);
    const status =
      database.status === "connected" &&
      calculation.status === "ok" &&
      filesystem.status === "writable"
        ? "ok"
        : "degraded";

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      server: {
        status: "online",
      },
      database,
      calculation,
      filesystem,
    };
  }

  private async checkDatabase(): Promise<HealthCheckResponse["database"]> {
    const startedAt = performance.now();

    try {
      await prisma.$queryRaw`SELECT 1`;

      return {
        status: "connected",
        latencyMs: Number((performance.now() - startedAt).toFixed(2)),
      };
    } catch (error) {
      return {
        status: "unavailable",
        latencyMs: null,
        error: getErrorMessage(error),
      };
    }
  }

  private async checkCalculationQuery(): Promise<
    HealthCheckResponse["calculation"]
  > {
    const startedAt = performance.now();

    try {
      await prisma.$queryRaw`
        SELECT COALESCE(SUM("final_price" - "base_cost"), 0) AS "estimated_profit"
        FROM "print_items"
        WHERE "created_at" >= NOW() - INTERVAL '30 days'
      `;

      return {
        status: "ok",
        latencyMs: Number((performance.now() - startedAt).toFixed(2)),
      };
    } catch (error) {
      return {
        status: "degraded",
        latencyMs: null,
        error: getErrorMessage(error),
      };
    }
  }

  private async checkFilesystem(): Promise<HealthCheckResponse["filesystem"]> {
    const startedAt = performance.now();
    const healthPath = join(tmpdir(), "3d-budget-health.tmp");

    try {
      await access(tmpdir(), constants.W_OK);
      await writeFile(healthPath, "ok", "utf8");
      await rm(healthPath, { force: true });

      return {
        status: "writable",
        latencyMs: Number((performance.now() - startedAt).toFixed(2)),
        path: tmpdir(),
      };
    } catch (error) {
      return {
        status: "unavailable",
        latencyMs: null,
        path: tmpdir(),
        error: getErrorMessage(error),
      };
    }
  }
}

export const healthService = new HealthService();
