import { isValidCountryCode } from "@3d-budget/shared";
import { z } from "zod";

export const supportedLanguageSchema = z.enum(["pt-BR", "en"]);

export const countryCodeSchema = z
  .string()
  .trim()
  .length(2, "Country must be an ISO 3166-1 alpha-2 code.")
  .toUpperCase()
  .refine(isValidCountryCode, "Unknown country.");

export const passwordSchema = z
  .string()
  .min(8, "Password must have at least 8 characters.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.");

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must have at least 2 characters.")
    .max(160, "Full name must have at most 160 characters."),
  email: z.string().trim().toLowerCase().email("Invalid email address."),
  password: passwordSchema,
  companyName: z
    .string()
    .trim()
    .min(2, "Company name must have at least 2 characters.")
    .max(160, "Company name must have at most 160 characters."),
  country: countryCodeSchema,
  taxRate: z.number().min(0).max(1).default(0),
  language: supportedLanguageSchema.default("pt-BR"),
}).strict();

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Invalid email address."),
    password: z.string().min(1, "Password is required."),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Invalid email address."),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, "Token is required."),
    password: passwordSchema,
  })
  .strict();

// Email is deliberately not accepted here — `.strict()` rejects it outright
// rather than silently ignoring it, so the "email is immutable" rule holds
// even if a client tries to send it.
export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must have at least 2 characters.")
      .max(160, "Name must have at most 160 characters.")
      .optional(),
    companyName: z
      .string()
      .trim()
      .min(2, "Company name must have at least 2 characters.")
      .max(160, "Company name must have at most 160 characters.")
      .optional(),
    country: countryCodeSchema.optional(),
    language: supportedLanguageSchema.optional(),
    emailPreferences: z
      .object({
        financial: z.boolean().optional(),
        quotes: z.boolean().optional(),
        newsletter: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.companyName !== undefined ||
      value.country !== undefined ||
      value.language !== undefined ||
      value.emailPreferences !== undefined,
    { message: "At least one field must be provided." },
  );

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: passwordSchema,
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
