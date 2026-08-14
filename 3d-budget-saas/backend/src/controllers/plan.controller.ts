import type { PlanResource } from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { planService } from "../services/plan.service";

export class PlanController {
  async listPublic(
    _request: Request,
    response: Response<PlanResource[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const plans = await planService.listPublic();
      response.status(200).json(plans);
    } catch (error) {
      next(error);
    }
  }
}

export const planController = new PlanController();
