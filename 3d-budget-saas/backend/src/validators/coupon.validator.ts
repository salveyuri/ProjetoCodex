import { z } from "zod";

export const couponCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9-]+$/, "Use only letters, numbers and hyphens.")
      .transform((value) => value.toUpperCase()),
    discountPercent: z.number().gt(0).max(100),
    isActive: z.boolean().optional(),
  })
  .strict();

export const couponUpdateSchema = couponCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type CouponCreateInput = z.infer<typeof couponCreateSchema>;
export type CouponUpdateInput = z.infer<typeof couponUpdateSchema>;
