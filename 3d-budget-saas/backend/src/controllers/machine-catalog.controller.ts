import type { MachineCatalogResource } from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { machineCatalogService } from "../services/machine-catalog.service";
import { machineCatalogSearchQuerySchema } from "../validators/machine-catalog.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

export class MachineCatalogController {
  async search(
    request: Request,
    response: Response<MachineCatalogResource[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { q } = machineCatalogSearchQuerySchema.parse(request.query);
      const results = await machineCatalogService.search(q);
      response.status(200).json(results);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }
}

export const machineCatalogController = new MachineCatalogController();
