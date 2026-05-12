import type { ProductionSettings } from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { settingsService } from "../services/settings.service";
import { getAuthenticatedCompanyId } from "../utils/request-auth";
import { productionSettingsSchema } from "../validators/resources.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

export class SettingsController {
  async show(
    request: Request,
    response: Response<ProductionSettings>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const settings = await settingsService.get(companyId);
      response.status(200).json(settings);
    } catch (error) {
      next(error);
    }
  }

  async save(
    request: Request,
    response: Response<ProductionSettings>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = productionSettingsSchema.parse(request.body);
      const settings = await settingsService.save(companyId, input);
      response.status(200).json(settings);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }
}

export const settingsController = new SettingsController();

