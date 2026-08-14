import { z } from "zod";
import { subscriptionStatusSchema } from "./billing.validator";

export const adminUserUpdateSchema = z
  .object({
    role: z.enum(["ADMIN", "USER"]).optional(),
    isActive: z.boolean().optional(),
    planId: z.string().trim().uuid().optional(),
    subscriptionStatus: subscriptionStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
