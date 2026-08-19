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

// Also deliberately not `.strict()` — Resend's payload shape per event
// type (see https://resend.com/docs/webhooks/event-types) carries extra
// fields we don't use (from/to/subject/tags/...); `data` only requires
// `email_id`, which is the one field every event type is confirmed to
// carry and the only one this app actually reads (to match a resendMessageId
// back to an EmailLog row).
export const resendWebhookSchema = z.object({
  type: z.string(),
  data: z
    .object({
      email_id: z.string(),
    })
    .passthrough(),
});

export type ResendWebhookPayload = z.infer<typeof resendWebhookSchema>;
