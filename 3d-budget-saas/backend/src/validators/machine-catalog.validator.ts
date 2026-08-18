import { z } from "zod";

// Query params are always strings over HTTP — no coercion needed here
// since we only trim/bound the length, never parse it as a number.
export const machineCatalogSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
});

export type MachineCatalogSearchQuery = z.infer<
  typeof machineCatalogSearchQuerySchema
>;

const positiveNumber = z.number().finite().min(0);

export const machineCatalogCreateSchema = z
  .object({
    brand: z
      .string()
      .trim()
      .min(1, "Brand must have at least 1 character.")
      .max(80, "Brand must have at most 80 characters."),
    name: z
      .string()
      .trim()
      .min(1, "Name must have at least 1 character.")
      .max(120, "Name must have at most 120 characters."),
    type: z.enum(["FDM", "RESIN"]),
    price: positiveNumber,
    powerConsumptionWatts: positiveNumber,
    printVolumeXmm: positiveNumber,
    printVolumeYmm: positiveNumber,
    printVolumeZmm: positiveNumber,
    depreciationCostPerHour: positiveNumber,
    maintenanceCostPerHour: positiveNumber,
  })
  .strict();

export const machineCatalogUpdateSchema = machineCatalogCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

// Deliberately loose at this layer — each row is only required to be an
// object here. Validating against machineCatalogCreateSchema happens
// per-row inside machineCatalogService.importRows() instead, so one
// malformed row (typo'd number, missing column) is reported with its row
// number and skipped, without failing the rest of a large CSV batch.
export const machineCatalogImportSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
});

export type MachineCatalogCreateInput = z.infer<typeof machineCatalogCreateSchema>;
export type MachineCatalogUpdateInput = z.infer<typeof machineCatalogUpdateSchema>;
export type MachineCatalogImportInput = z.infer<typeof machineCatalogImportSchema>;
