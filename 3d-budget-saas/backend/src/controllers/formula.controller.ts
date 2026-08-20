import type {
  FormulaPreviewResponse,
  FormulaResource,
  FormulaVariable,
  SupportedLanguage,
} from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { formulaService } from "../services/formula.service";
import { getAuthenticatedCompanyId } from "../utils/request-auth";
import { idParamSchema } from "../validators/common.validator";
import {
  formulaPreviewSchema,
  formulaSchema,
  formulaUpdateSchema,
} from "../validators/formula.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

export class FormulaController {
  async index(
    request: Request,
    response: Response<FormulaResource[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const formulas = await formulaService.list(companyId);
      response.status(200).json(formulas);
    } catch (error) {
      next(error);
    }
  }

  async variables(
    request: Request,
    response: Response<FormulaVariable[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      // Variable descriptions live server-side (unlike the rest of the UI,
      // translated client-side) — same reasoning as the PDF/email content,
      // read from the DB rather than trusting a client-supplied locale.
      const user = await prisma.user.findUnique({
        where: { id: request.auth?.userId ?? "" },
        select: { language: true },
      });
      const language = (user?.language ?? "pt-BR") as SupportedLanguage;
      const variables = await formulaService.variables(companyId, language);
      response.status(200).json(variables);
    } catch (error) {
      next(error);
    }
  }

  async create(
    request: Request,
    response: Response<FormulaResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = formulaSchema.parse(request.body);
      const formula = await formulaService.create(
        companyId,
        input,
        request.auth?.userId,
      );
      response.status(201).json(formula);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async preview(
    request: Request,
    response: Response<FormulaPreviewResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = formulaPreviewSchema.parse(request.body);
      const preview = await formulaService.preview(companyId, input);
      response.status(200).json(preview);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async update(
    request: Request,
    response: Response<FormulaResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const { id } = idParamSchema.parse(request.params);
      const input = formulaUpdateSchema.parse(request.body);
      const formula = await formulaService.update(
        companyId,
        id,
        input,
        request.auth?.userId,
      );
      response.status(200).json(formula);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async delete(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const { id } = idParamSchema.parse(request.params);
      await formulaService.delete(
        companyId,
        id,
        request.auth?.userId,
      );
      response.status(204).send();
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }
}

export const formulaController = new FormulaController();
