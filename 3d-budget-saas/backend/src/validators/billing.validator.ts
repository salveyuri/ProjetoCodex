import { z } from "zod";

export const subscriptionStatusSchema = z.enum([
  "ACTIVE",
  "CANCELED",
  "PAST_DUE",
]);

export const checkoutRequestSchema = z
  .object({
    planId: z.string().trim().uuid(),
    couponCode: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export const couponCodeParamSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
  })
  .strict();

export type CheckoutRequestInput = z.infer<typeof checkoutRequestSchema>;
