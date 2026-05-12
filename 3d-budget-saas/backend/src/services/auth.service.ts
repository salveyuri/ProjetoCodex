import type { AuthResponse, AuthUser } from "@3d-budget/shared";
import { Prisma, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import type { LoginInput, RegisterInput } from "../validators/auth.validator";

interface JwtAuthPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId?: string;
}

const PASSWORD_SALT_ROUNDS = 12;

const toAuthUser = (user: {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  company: {
    id: string;
    name: string;
    defaultCurrency: string;
    planType: "FREE" | "PRO" | "ENTERPRISE";
    subscriptionStatus: "ACTIVE" | "CANCELED" | "PAST_DUE";
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
        planType: user.company.planType,
        subscriptionStatus: user.company.subscriptionStatus,
      }
    : null,
});

const signAuthToken = (user: AuthUser): string => {
  const payload: JwtAuthPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    companyId: user.company?.id,
  };

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"],
  });
};

const toAuthResponse = (user: AuthUser): AuthResponse => ({
  token: signAuthToken(user),
  tokenType: "Bearer",
  expiresIn: env.jwtExpiresIn,
  user,
});

export class AuthService {
  async register(input: RegisterInput): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new AppError("Email already registered.", 409, "EMAIL_ALREADY_EXISTS");
    }

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);

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
              pricingSettings: {
                create: {},
              },
            },
          },
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              defaultCurrency: true,
              planType: true,
              subscriptionStatus: true,
            },
          },
        },
      });

      return toAuthResponse(toAuthUser(user));
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

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            defaultCurrency: true,
            planType: true,
            subscriptionStatus: true,
          },
        },
      },
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

    return toAuthResponse(toAuthUser(user));
  }

  async getAuthenticatedUser(userId: string): Promise<AuthUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            defaultCurrency: true,
            planType: true,
            subscriptionStatus: true,
          },
        },
      },
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
