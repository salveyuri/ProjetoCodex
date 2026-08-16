import { z } from "zod";

export const systemFormulaSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    expression: z.string().trim().min(1).max(600),
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  })
  .strict();

export const systemFormulaUpdateSchema = systemFormulaSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

export type SystemFormulaInput = z.infer<typeof systemFormulaSchema>;
export type SystemFormulaUpdateInput = z.infer<typeof systemFormulaUpdateSchema>;
