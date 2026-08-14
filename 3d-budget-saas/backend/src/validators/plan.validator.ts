import { z } from "zod";

const planLimitsSchema = z
  .object({
    machines: z.number().int().positive().nullable(),
    materials: z.number().int().positive().nullable(),
    monthlyQuotes: z.number().int().positive().nullable(),
  })
  .strict();

const planFeaturesSchema = z
  .object({
    customFormulas: z.boolean(),
    pdfExport: z.boolean(),
  })
  .strict();

export const planCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9-]+$/, "Use only lowercase letters, numbers and hyphens."),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    price: z.number().min(0),
    currency: z.string().trim().length(3).optional(),
    billingCycle: z.enum(["MONTHLY", "YEARLY"]),
    limits: planLimitsSchema,
    features: planFeaturesSchema,
    isActive: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    displayOrder: z.number().int().optional(),
  })
  .strict();

export const planUpdateSchema = planCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type PlanCreateInput = z.infer<typeof planCreateSchema>;
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;
