import { z } from "zod";

const passwordSchema = z
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
  defaultCurrency: z
    .string()
    .trim()
    .length(3, "Currency must be an ISO 4217 code.")
    .toUpperCase()
    .default("BRL"),
  taxRate: z.number().min(0).max(1).default(0),
}).strict();

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Invalid email address."),
    password: z.string().min(1, "Password is required."),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
