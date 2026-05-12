import type { CalculationResponse } from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { calculationService } from "../services/CalculationService";
import { getAuthenticatedCompanyId } from "../utils/request-auth";
import { calculationSchema } from "../validators/calculation.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

export class CalculationController {
  async calculate(
    request: Request,
    response: Response<CalculationResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = calculationSchema.parse(request.body);
      const result = await calculationService.calculate(companyId, input);
      response.status(200).json(result);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }
}

export const calculationController = new CalculationController();
