import { z } from "zod";

export const subscriptionPlanSchema = z.enum(["FREE", "PRO", "ENTERPRISE"]);

export const paidSubscriptionPlanSchema = z.enum(["PRO", "ENTERPRISE"]);

export const subscriptionStatusSchema = z.enum([
  "ACTIVE",
  "CANCELED",
  "PAST_DUE",
]);

export const billingPlanChangeSchema = z.object({
  planType: paidSubscriptionPlanSchema,
});

export type BillingPlanChangeInput = z.infer<typeof billingPlanChangeSchema>;
