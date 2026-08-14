import { z } from "zod";

// Unlike every other validator in this codebase, this one is deliberately
// NOT `.strict()`: it validates an external, evolving payload sent by
// Asaas, not an internal mutation we control. Rejecting unknown fields
// here would make the integration brittle against Asaas adding fields.
export const asaasWebhookSchema = z.object({
  event: z.string(),
  payment: z
    .object({
      id: z.string(),
      customer: z.string().nullable().optional(),
      subscription: z.string().nullable().optional(),
      status: z.string(),
      value: z.number(),
      billingType: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      paymentDate: z.string().nullable().optional(),
      invoiceUrl: z.string().nullable().optional(),
      externalReference: z.string().nullable().optional(),
    })
    .passthrough(),
});

export type AsaasWebhookPayload = z.infer<typeof asaasWebhookSchema>;
