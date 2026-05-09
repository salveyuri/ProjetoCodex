import type { NextFunction, Request, Response } from "express";
import { healthService } from "../services/health.service";

export class HealthController {
  async show(
    _request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const health = await healthService.getHealthCheck();
      response.status(health.status === "ok" ? 200 : 503).json(health);
    } catch (error) {
      next(error);
    }
  }
}

export const healthController = new HealthController();

