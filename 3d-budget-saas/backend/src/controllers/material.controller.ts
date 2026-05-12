import type { MaterialResource } from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { materialService } from "../services/material.service";
import { getAuthenticatedCompanyId } from "../utils/request-auth";
import {
  materialSchema,
  materialUpdateSchema,
} from "../validators/resources.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

export class MaterialController {
  async index(
    request: Request,
    response: Response<MaterialResource[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const materials = await materialService.list(companyId);
      response.status(200).json(materials);
    } catch (error) {
      next(error);
    }
  }

  async create(
    request: Request,
    response: Response<MaterialResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = materialSchema.parse(request.body);
      const material = await materialService.create(companyId, input);
      response.status(201).json(material);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async update(
    request: Request,
    response: Response<MaterialResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = materialUpdateSchema.parse(request.body);
      const material = await materialService.update(
        companyId,
        request.params.id,
        input,
      );
      response.status(200).json(material);
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
      await materialService.delete(companyId, request.params.id);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const materialController = new MaterialController();

