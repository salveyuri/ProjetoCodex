import { z } from "zod";

// Query params are always strings over HTTP — no coercion needed here
// since we only trim/bound the length, never parse it as a number.
export const machineCatalogSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
});

export type MachineCatalogSearchQuery = z.infer<
  typeof machineCatalogSearchQuerySchema
>;
