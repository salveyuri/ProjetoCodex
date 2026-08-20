import type { AuthResponse, AuthUser, SupportedLanguage } from "@3d-budget/shared";
import { currencyForCountry } from "@3d-budget/shared";
import { Prisma, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { emailService, PASSWORD_RESET_TOKEN_TTL_MINUTES } from "./email.service";
import { planService } from "./plan.service";
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from "../validators/auth.validator";

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
const PASSWORD_RESET_TOKEN_BYTES = 32;

const companySelect = {
  id: true,
  name: true,
  country: true,
  defaultCurrency: true,
  subscriptionStatus: true,
  taxId: true,
  phone: true,
  address: true,
  customTerms: true,
  customTermsEn: true,
  plan: { select: { code: true, name: true } },
} as const;

const toAuthUser = (user: {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  language: string;
  notifyFinancialEmails: boolean;
  notifyQuoteEmails: boolean;
  notifyNewsletter: boolean;
  company: {
    id: string;
    name: string;
    country: string;
    defaultCurrency: string;
    subscriptionStatus: "ACTIVE" | "CANCELED" | "PAST_DUE";
    taxId: string | null;
    phone: string | null;
    address: string | null;
    customTerms: string | null;
    customTermsEn: string | null;
    plan: { code: string; name: string };
  } | null;
}): AuthUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  isActive: user.isActive,
  language: user.language as SupportedLanguage,
  emailPreferences: {
    financial: user.notifyFinancialEmails,
    quotes: user.notifyQuoteEmails,
    newsletter: user.notifyNewsletter,
  },
  company: user.company
    ? {
        id: user.company.id,
        name: user.company.name,
        country: user.company.country,
        defaultCurrency: user.company.defaultCurrency,
        planCode: user.company.plan.code,
        planName: user.company.plan.name,
        subscriptionStatus: user.company.subscriptionStatus,
        taxId: user.company.taxId,
        phone: user.company.phone,
        address: user.company.address,
        customTerms: user.company.customTerms,
        customTermsEn: user.company.customTermsEn,
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

// Same shape as the refresh token: a random raw value is emailed once and
// never stored — only its SHA-256 hash lives in the database, so a leaked
// database (unlike a leaked email) can't be used to reset anyone's
// password.
const generateRawPasswordResetToken = (): string =>
  randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("base64url");

const hashPasswordResetToken = (rawToken: string): string =>
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
          name: input.fullName,
          role: UserRole.USER,
          language: input.language,
          company: {
            create: {
              name: input.companyName,
              country: input.country,
              defaultCurrency: currencyForCountry(input.country),
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
      void emailService.sendAccountCreated(authUser.id);

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

  /**
   * Always resolves successfully regardless of whether the email exists —
   * telling the caller "no account with that email" would let an attacker
   * enumerate registered accounts. A reset link is only emailed when a
   * matching, active user is found.
   */
  async forgotPassword(
    input: ForgotPasswordInput,
    createdByIp?: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return;
    }

    // Never leave more than one live link for the same user — an older
    // request the user forgot about shouldn't still be redeemable.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = generateRawPasswordResetToken();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + PASSWORD_RESET_TOKEN_TTL_MINUTES);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashPasswordResetToken(rawToken),
        expiresAt,
        createdByIp,
      },
    });

    void emailService.sendPasswordReset(user.id, rawToken);
  }

  /**
   * Redeems a password-reset token: single-use (rejects if already
   * redeemed), short-lived (rejects if expired), looked up only by its
   * hash (the raw token from the email is never stored). On success every
   * refresh token for the user is revoked — a password reset is a strong
   * signal the account may have been compromised, so every other
   * logged-in device is forced to log in again with the new password.
   */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = hashPasswordResetToken(input.token);
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (
      !resetToken ||
      resetToken.usedAt !== null ||
      resetToken.expiresAt < new Date()
    ) {
      throw new AppError(
        "Invalid or expired password reset link.",
        400,
        "PASSWORD_RESET_TOKEN_INVALID",
      );
    }

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
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

  /** Updates the caller's own profile (and, if provided, their company's
   * name). Email is never accepted here — it's immutable through this
   * endpoint by design. Company name is updated first, inside the same
   * transaction, so the `include: company` on the user update below always
   * reflects the fresh value instead of a stale pre-update snapshot. */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<AuthUser> {
    const user = await prisma.$transaction(async (transaction) => {
      const hasCompanyChanges =
        input.companyName !== undefined ||
        input.country !== undefined ||
        input.taxId !== undefined ||
        input.phone !== undefined ||
        input.address !== undefined ||
        input.customTerms !== undefined ||
        input.customTermsEn !== undefined;

      if (hasCompanyChanges) {
        await transaction.company.update({
          where: { userId },
          data: {
            ...(input.companyName !== undefined ? { name: input.companyName } : {}),
            ...(input.country !== undefined
              ? { country: input.country, defaultCurrency: currencyForCountry(input.country) }
              : {}),
            ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.address !== undefined ? { address: input.address } : {}),
            ...(input.customTerms !== undefined ? { customTerms: input.customTerms } : {}),
            ...(input.customTermsEn !== undefined
              ? { customTermsEn: input.customTermsEn }
              : {}),
          },
        });
      }

      return transaction.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.language !== undefined ? { language: input.language } : {}),
          ...(input.emailPreferences?.financial !== undefined
            ? { notifyFinancialEmails: input.emailPreferences.financial }
            : {}),
          ...(input.emailPreferences?.quotes !== undefined
            ? { notifyQuoteEmails: input.emailPreferences.quotes }
            : {}),
          ...(input.emailPreferences?.newsletter !== undefined
            ? { notifyNewsletter: input.emailPreferences.newsletter }
            : {}),
        },
        include: { company: { select: companySelect } },
      });
    });

    return toAuthUser(user);
  }

  /**
   * Changes the caller's own password. Requires re-entering the current
   * password — a defense against a stolen/left-open access token being
   * used to lock the real account owner out. Revokes every refresh token
   * for the user afterwards, same "force re-login everywhere" behavior as
   * resetPassword — a password change is exactly the kind of event that
   * should invalidate stale sessions on other devices.
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new AppError("Authenticated user not found.", 401, "USER_NOT_FOUND");
    }

    const currentPasswordMatches = await bcrypt.compare(
      input.currentPassword,
      user.passwordHash,
    );

    if (!currentPasswordMatches) {
      throw new AppError(
        "Current password is incorrect.",
        401,
        "CURRENT_PASSWORD_INVALID",
      );
    }

    const passwordHash = await bcrypt.hash(input.newPassword, PASSWORD_SALT_ROUNDS);

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}

export const authService = new AuthService();
