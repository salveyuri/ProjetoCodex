import type { MachineResource } from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { machineService } from "../services/machine.service";
import { getAuthenticatedCompanyId } from "../utils/request-auth";
import {
  machineSchema,
  machineUpdateSchema,
} from "../validators/resources.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

export class MachineController {
  async index(
    request: Request,
    response: Response<MachineResource[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const machines = await machineService.list(companyId);
      response.status(200).json(machines);
    } catch (error) {
      next(error);
    }
  }

  async create(
    request: Request,
    response: Response<MachineResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = machineSchema.parse(request.body);
      const machine = await machineService.create(companyId, input);
      response.status(201).json(machine);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async update(
    request: Request,
    response: Response<MachineResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = machineUpdateSchema.parse(request.body);
      const machine = await machineService.update(
        companyId,
        request.params.id,
        input,
      );
      response.status(200).json(machine);
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
      await machineService.delete(companyId, request.params.id);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const machineController = new MachineController();

