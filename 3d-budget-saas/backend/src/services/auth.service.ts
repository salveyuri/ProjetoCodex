import type { AuthResponse, AuthUser } from "@3d-budget/shared";
import { Prisma, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { planService } from "./plan.service";
import type { LoginInput, RegisterInput } from "../validators/auth.validator";

interface JwtAccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId?: string;
}

export interface AuthResult {
  response: AuthResponse;
  refreshToken: string;
}

const PASSWORD_SALT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 32;
const REUSE_GRACE_PERIOD_MS = 5000;

const companySelect = {
  id: true,
  name: true,
  defaultCurrency: true,
  subscriptionStatus: true,
  plan: { select: { code: true, name: true } },
} as const;

const toAuthUser = (user: {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  company: {
    id: string;
    name: string;
    defaultCurrency: string;
    subscriptionStatus: "ACTIVE" | "CANCELED" | "PAST_DUE";
    plan: { code: string; name: string };
  } | null;
}): AuthUser => ({
  id: user.id,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  company: user.company
    ? {
        id: user.company.id,
        name: user.company.name,
        defaultCurrency: user.company.defaultCurrency,
        planCode: user.company.plan.code,
        planName: user.company.plan.name,
        subscriptionStatus: user.company.subscriptionStatus,
      }
    : null,
});


const signAccessToken = (user: AuthUser): string => {
  const payload: JwtAccessTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    companyId: user.company?.id,
  };

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"],
  });
};

const buildAuthResult = (authUser: AuthUser, refreshToken: string): AuthResult => ({
  response: {
    token: signAccessToken(authUser),
    tokenType: "Bearer",
    expiresIn: env.jwtExpiresIn,
    user: authUser,
  },
  refreshToken,
});

const generateRawRefreshToken = (): string =>
  randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");

const hashRefreshToken = (rawToken: string): string =>
  createHash("sha256").update(rawToken).digest("hex");

const refreshTokenExpiresAt = (): Date => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.refreshTokenExpiresInDays);
  return expiresAt;
};

/** Creates a new refresh token row (a new one on login/register, or the next
 * link in the rotation chain when `familyId` comes from an existing token). */
const createRefreshToken = async (
  userId: string,
  familyId: string,
  createdByIp?: string,
): Promise<string> => {
  const rawToken = generateRawRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashRefreshToken(rawToken),
      expiresAt: refreshTokenExpiresAt(),
      createdByIp,
    },
  });

  return rawToken;
};

export class AuthService {
  async register(input: RegisterInput, createdByIp?: string): Promise<AuthResult> {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new AppError("Email already registered.", 409, "EMAIL_ALREADY_EXISTS");
    }

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);
    const freePlan = await planService.getFreePlan();

    try {
      const user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: UserRole.USER,
          company: {
            create: {
              name: input.companyName,
              defaultCurrency: input.defaultCurrency,
              taxRate: input.taxRate,
              planId: freePlan.id,
              pricingSettings: {
                create: {},
              },
            },
          },
        },
        include: { company: { select: companySelect } },
      });

      const authUser = toAuthUser(user);
      const refreshToken = await createRefreshToken(
        authUser.id,
        randomUUID(),
        createdByIp,
      );

      return buildAuthResult(authUser, refreshToken);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AppError(
          "Email already registered.",
          409,
          "EMAIL_ALREADY_EXISTS",
        );
      }

      throw error;
    }
  }

  async login(input: LoginInput, createdByIp?: string): Promise<AuthResult> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { company: { select: companySelect } },
    });

    if (!user) {
      throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }

    if (!user.isActive) {
      throw new AppError("User account is inactive.", 403, "ACCOUNT_INACTIVE");
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

    if (!passwordMatches) {
      throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }

    const authUser = toAuthUser(user);
    const refreshToken = await createRefreshToken(
      authUser.id,
      randomUUID(),
      createdByIp,
    );

    return buildAuthResult(authUser, refreshToken);
  }

  /**
   * Rotates a refresh token: the presented token is marked used and a new
   * one takes its place in the same rotation family. Presenting a token
   * that was already rotated away (reuse) is treated as a signal of theft
   * and revokes the whole family, forcing a fresh login.
   */
  async refresh(rawRefreshToken: string, createdByIp?: string): Promise<AuthResult> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { company: { select: companySelect } } } },
    });

    if (!existing || existing.expiresAt < new Date()) {
      throw new AppError(
        "Invalid or expired refresh token.",
        401,
        "REFRESH_TOKEN_INVALID",
      );
    }

    if (existing.revokedAt) {
      // Grace period only applies to a token that was individually rotated
      // (it has a recorded successor) — that's the normal "two near-
      // simultaneous refresh calls" case (a tab remounting twice, two tabs
      // refreshing at once), not necessarily theft. A token that was mass-
      // revoked as part of a theft response (no successor — see the
      // updateMany below) must NEVER get leniency, or reusing any other
      // token from an already-compromised family within the grace window
      // would silently undo the revocation.
      const wasIndividuallyRotated = existing.replacedByTokenHash !== null;
      const reuseIsWithinGracePeriod =
        wasIndividuallyRotated &&
        Date.now() - existing.revokedAt.getTime() < REUSE_GRACE_PERIOD_MS;

      if (!reuseIsWithinGracePeriod) {
        await prisma.refreshToken.updateMany({
          where: { familyId: existing.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        throw new AppError(
          "Refresh token was already used. Session revoked for safety — please log in again.",
          401,
          "REFRESH_TOKEN_REUSED",
        );
      }
    }

    if (!existing.user.isActive) {
      throw new AppError("User account is inactive.", 403, "ACCOUNT_INACTIVE");
    }

    const newRawToken = generateRawRefreshToken();
    const newTokenHash = hashRefreshToken(newRawToken);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedByTokenHash: newTokenHash },
      }),
      prisma.refreshToken.create({
        data: {
          userId: existing.userId,
          familyId: existing.familyId,
          tokenHash: newTokenHash,
          expiresAt: refreshTokenExpiresAt(),
          createdByIp,
        },
      }),
    ]);

    return buildAuthResult(toAuthUser(existing.user), newRawToken);
  }

  /** Ends the session/device the refresh token belongs to. Idempotent —
   * an unknown/already-invalid token is treated as "already logged out". */
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true },
    });

    if (!existing) {
      return;
    }

    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Ends every session/device for the user behind this refresh token. */
  async logoutAll(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });

    if (!existing) {
      return;
    }

    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getAuthenticatedUser(userId: string): Promise<AuthUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: { select: companySelect } },
    });

    if (!user) {
      throw new AppError("Authenticated user not found.", 401, "USER_NOT_FOUND");
    }

    if (!user.isActive) {
      throw new AppError("User account is inactive.", 403, "ACCOUNT_INACTIVE");
    }

    return toAuthUser(user);
  }
}

export const authService = new AuthService();
