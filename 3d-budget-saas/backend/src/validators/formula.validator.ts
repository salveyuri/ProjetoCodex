import { z } from "zod";

export const formulaSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    expression: z.string().trim().min(1).max(600),
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  })
  .strict();

export const formulaUpdateSchema = formulaSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

export const formulaPreviewSchema = z
  .object({
    expression: z.string().trim().min(1).max(600),
    variables: z
      .record(
        z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
        z.number().finite(),
      )
      .optional(),
  })
  .strict();

export type FormulaInput = z.infer<typeof formulaSchema>;
export type FormulaUpdateInput = z.infer<typeof formulaUpdateSchema>;
export type FormulaPreviewInput = z.infer<typeof formulaPreviewSchema>;
