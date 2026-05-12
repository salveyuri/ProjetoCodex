import { z } from "zod";
import {
  subscriptionPlanSchema,
  subscriptionStatusSchema,
} from "./billing.validator";

export const adminUserUpdateSchema = z
  .object({
    role: z.enum(["ADMIN", "USER"]).optional(),
    isActive: z.coerce.boolean().optional(),
    planType: subscriptionPlanSchema.optional(),
    subscriptionStatus: subscriptionStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
