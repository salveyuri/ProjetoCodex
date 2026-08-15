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

export type EmailTemplateUpdateInput = z.infer<typeof emailTemplateUpdateSchema>;
