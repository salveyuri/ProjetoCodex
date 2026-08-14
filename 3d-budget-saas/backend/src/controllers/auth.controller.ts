import type { AuthResponse, AuthUser } from "@3d-budget/shared";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { AppError } from "../middlewares/error-handler";
import { authService } from "../services/auth.service";
import { loginSchema, registerSchema } from "../validators/auth.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

const REFRESH_TOKEN_COOKIE = "refresh_token";

const refreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.nodeEnv === "production",
  // Must be "/", not "/api/auth": the cookie's Path is matched against the
  // request URL regardless of which server receives it. frontend/src/proxy.ts
  // runs on the Next.js server (a different port) and needs this cookie on
  // every page navigation (/dashboard, /admin, ...), not just on calls to
  // the backend's /api/auth/* endpoints.
  path: "/",
};

const setRefreshTokenCookie = (response: Response, token: string): void => {
  response.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...refreshTokenCookieOptions,
    maxAge: env.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000,
  });
};

const clearRefreshTokenCookie = (response: Response): void => {
  response.clearCookie(REFRESH_TOKEN_COOKIE, refreshTokenCookieOptions);
  // Also clear the cookie under the old Path=/api/auth scoping used very
  // briefly during development, so browsers that picked it up before the
  // fix don't keep sending a stale, unusable duplicate cookie forever.
  response.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...refreshTokenCookieOptions,
    path: "/api/auth",
  });
};

export class AuthController {
  async register(
    request: Request,
    response: Response<AuthResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const input = registerSchema.parse(request.body);
      const result = await authService.register(input, request.ip);
      setRefreshTokenCookie(response, result.refreshToken);
      response.status(201).json(result.response);
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
      const result = await authService.login(input, request.ip);
      setRefreshTokenCookie(response, result.refreshToken);
      response.status(200).json(result.response);
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

  async refresh(
    request: Request,
    response: Response<AuthResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const rawRefreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as
        | string
        | undefined;

      if (!rawRefreshToken) {
        throw new AppError(
          "Missing refresh token.",
          401,
          "REFRESH_TOKEN_MISSING",
        );
      }

      const result = await authService.refresh(rawRefreshToken, request.ip);
      setRefreshTokenCookie(response, result.refreshToken);
      response.status(200).json(result.response);
    } catch (error) {
      clearRefreshTokenCookie(response);
      next(error);
    }
  }

  async logout(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const rawRefreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as
        | string
        | undefined;

      if (rawRefreshToken) {
        await authService.logout(rawRefreshToken);
      }

      clearRefreshTokenCookie(response);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async logoutAll(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const rawRefreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as
        | string
        | undefined;

      if (rawRefreshToken) {
        await authService.logoutAll(rawRefreshToken);
      }

      clearRefreshTokenCookie(response);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
