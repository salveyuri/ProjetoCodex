import type { AuthResponse, AuthUser } from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { authService } from "../services/auth.service";
import { loginSchema, registerSchema } from "../validators/auth.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

export class AuthController {
  async register(
    request: Request,
    response: Response<AuthResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const input = registerSchema.parse(request.body);
      const authResponse = await authService.register(input);
      response.status(201).json(authResponse);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async login(
    request: Request,
    response: Response<AuthResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const input = loginSchema.parse(request.body);
      const authResponse = await authService.login(input);
      response.status(200).json(authResponse);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async me(
    request: Request,
    response: Response<AuthUser>,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!request.userId) {
        throw new AppError("Missing authenticated user.", 401, "AUTH_REQUIRED");
      }

      const user = await authService.getAuthenticatedUser(request.userId);
      response.status(200).json(user);
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();

