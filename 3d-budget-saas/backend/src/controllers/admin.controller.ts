import type { AdminUserResource } from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { adminService } from "../services/admin.service";
import { adminUserUpdateSchema } from "../validators/admin.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

export class AdminController {
  async users(
    _request: Request,
    response: Response<AdminUserResource[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const users = await adminService.listUsers();
      response.status(200).json(users);
    } catch (error) {
      next(error);
    }
  }

  async updateUser(
    request: Request,
    response: Response<AdminUserResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const input = adminUserUpdateSchema.parse(request.body);
      const user = await adminService.updateUser(
        request.params.id,
        input,
        request.auth?.userId ?? "",
      );
      response.status(200).json(user);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }
}

export const adminController = new AdminController();
