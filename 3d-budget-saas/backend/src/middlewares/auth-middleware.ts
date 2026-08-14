import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "./error-handler";

interface JwtAuthPayload extends jwt.JwtPayload {
  sub: string;
  email: string;
  role: "ADMIN" | "USER" | "CUSTOMER";
  companyId?: string;
}

const isJwtAuthPayload = (
  payload: string | jwt.JwtPayload,
): payload is JwtAuthPayload =>
  typeof payload !== "string" &&
  typeof payload.sub === "string" &&
  typeof payload.email === "string" &&
  (payload.role === "ADMIN" ||
    payload.role === "USER" ||
    payload.role === "CUSTOMER");

export const authMiddleware = (
  request: Request,
  _response: Response,
  next: NextFunction,
): void => {
  const authorization = request.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    next(new AppError("Missing bearer token.", 401, "AUTH_TOKEN_MISSING"));
    return;
  }

  const token = authorization.replace("Bearer ", "").trim();

  if (!token) {
    next(new AppError("Missing bearer token.", 401, "AUTH_TOKEN_MISSING"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);

    if (!isJwtAuthPayload(payload)) {
      // Same message/code as a bad signature below — don't give a token
      // forger a debugging oracle that distinguishes "signature verified
      // but payload shape was wrong" from "signature/expiry failed".
      next(new AppError("Invalid or expired token.", 401, "AUTH_TOKEN_INVALID"));
      return;
    }

    request.userId = payload.sub;
    request.user_id = payload.sub;
    request.auth = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role === "CUSTOMER" ? "USER" : payload.role,
      companyId: payload.companyId,
    };

    next();
  } catch {
    next(new AppError("Invalid or expired token.", 401, "AUTH_TOKEN_INVALID"));
  }
};
