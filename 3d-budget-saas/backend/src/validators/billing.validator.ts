import { z } from "zod";

export const subscriptionStatusSchema = z.enum([
  "ACTIVE",
  "CANCELED",
  "PAST_DUE",
]);

export const checkoutRequestSchema = z
  .object({
    planId: z.string().trim().uuid(),
  })
  .strict();

export type CheckoutRequestInput = z.infer<typeof checkoutRequestSchema>;
