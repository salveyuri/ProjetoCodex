import { z } from "zod";

export const emailTemplateUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    subject: z.string().trim().min(1).max(200),
    bodyHtml: z.string().trim().min(1).max(20000),
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const emailTemplateTestSchema = z
  .object({
    to: z.string().trim().toLowerCase().email("Invalid email address."),
  })
  .strict();

const emailSendStatusSchema = z.enum([
  "SENT",
  "FAILED",
  "SKIPPED_INACTIVE",
  "SKIPPED_PREFERENCE",
]);

const emailDeliveryStatusSchema = z.enum([
  "DELIVERED",
  "BOUNCED",
  "COMPLAINED",
  "DELAYED",
  "FAILED",
]);

// z.coerce.boolean() would treat the *string* "false" as truthy (JS
// Boolean("false") === true) — a well-known Zod gotcha. Query params only
// ever arrive as strings, so this matches "true"/"false" explicitly
// instead of coercing.
const booleanQueryParamSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const emailLogListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    status: emailSendStatusSchema.optional(),
    deliveryStatus: emailDeliveryStatusSchema.optional(),
    isTest: booleanQueryParamSchema.optional(),
  })
  .strict();

export type EmailTemplateUpdateInput = z.infer<typeof emailTemplateUpdateSchema>;
export type EmailTemplateTestInput = z.infer<typeof emailTemplateTestSchema>;
export type EmailLogListQueryInput = z.infer<typeof emailLogListQuerySchema>;
