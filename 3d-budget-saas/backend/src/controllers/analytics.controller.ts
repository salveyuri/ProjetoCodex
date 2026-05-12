import type {
  AdminAnalyticsOverview,
  UserAnalyticsOverview,
} from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { analyticsService } from "../services/analytics.service";
import { getAuthenticatedCompanyId } from "../utils/request-auth";
import {
  analyticsExportQuerySchema,
  analyticsQuerySchema,
} from "../validators/analytics.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request query.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

export class AnalyticsController {
  async overview(
    request: Request,
    response: Response<UserAnalyticsOverview>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const query = analyticsQuerySchema.parse(request.query);
      const overview = await analyticsService.getCompanyOverview(
        companyId,
        query,
      );

      response.status(200).json(overview);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async export(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const query = analyticsExportQuerySchema.parse(request.query);
      const exported = await analyticsService.exportCompanyData(companyId, query);

      response.setHeader("Content-Type", exported.contentType);
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${exported.filename}"`,
      );

      if (query.format === "json") {
        response.status(200).send(JSON.stringify(exported.body, null, 2));
        return;
      }

      response.status(200).send(exported.body);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async adminOverview(
    _request: Request,
    response: Response<AdminAnalyticsOverview>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const overview = await analyticsService.getAdminOverview();
      response.status(200).json(overview);
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
