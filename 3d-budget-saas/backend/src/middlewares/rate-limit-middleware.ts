import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { ApiErrorResponse } from "@3d-budget/shared";

const oneMinute = 60 * 1000;

const createRateLimitHandler =
  (code: string, message: string) =>
  (
    _request: Request,
    response: Response<ApiErrorResponse>,
    _next: NextFunction,
  ): void => {
    response.status(429).json({
      status: "error",
      message,
      code,
      details: {
        retryAfter: response.getHeader("Retry-After") ?? null,
      },
      timestamp: new Date().toISOString(),
    });
  };

export const globalRateLimiter = rateLimit({
  windowMs: oneMinute,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: createRateLimitHandler(
    "RATE_LIMIT_GLOBAL",
    "Too many requests from this IP. Try again shortly.",
  ),
});

export const loginRateLimiter = rateLimit({
  windowMs: oneMinute,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: createRateLimitHandler(
    "RATE_LIMIT_LOGIN",
    "Too many login attempts from this IP. Try again in one minute.",
  ),
});

export const registerRateLimiter = rateLimit({
  windowMs: oneMinute,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: createRateLimitHandler(
    "RATE_LIMIT_REGISTER",
    "Too many registration attempts from this IP. Try again in one minute.",
  ),
});

export const refreshRateLimiter = rateLimit({
  windowMs: oneMinute,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: createRateLimitHandler(
    "RATE_LIMIT_REFRESH",
    "Too many session refresh attempts from this IP. Try again shortly.",
  ),
});

export const calculationRateLimiter = rateLimit({
  windowMs: oneMinute,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: createRateLimitHandler(
    "RATE_LIMIT_CALCULATION",
    "Too many calculation requests from this IP. Try again shortly.",
  ),
});
