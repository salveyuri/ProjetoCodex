import { z } from "zod";

const positiveNumber = z.number().finite().min(0);
const variableName = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
const customVariableTypeSchema = z.enum(["INTEGER", "FLOAT", "PERCENTAGE"]);
const legacyCustomVariableSchema = z.number().finite().transform((value) => ({
  value,
  type: "FLOAT" as const,
}));
const customVariableDefinitionSchema = z
  .object({
    value: z.number().finite(),
    type: customVariableTypeSchema.default("FLOAT"),
  })
  .strict()
  .superRefine((variable, context) => {
    if (variable.type === "INTEGER" && !Number.isInteger(variable.value)) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Integer custom variables must not use decimals.",
      });
    }
  });

const machineTypeSchema = z
  .enum(["FDM", "RESIN", "SLA"])
  .transform((type) => (type === "SLA" ? "RESIN" : type));

export const machineSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Machine name must have at least 2 characters.")
      .max(120, "Machine name must have at most 120 characters."),
    type: machineTypeSchema,
    printVolumeXmm: positiveNumber.default(220),
    printVolumeYmm: positiveNumber.default(220),
    printVolumeZmm: positiveNumber.default(220),
    // depreciationCostPerHour/maintenanceCostPerHour are never accepted
    // from the client — always derived from price+type server-side (same
    // pattern as Material.costPerGram, derived from purchasePrice/
    // totalWeightGrams). See resolveMachineHourlyCosts in machine.service.ts.
    price: positiveNumber,
    powerConsumptionWatts: positiveNumber,
  })
  .strict();

export const machineUpdateSchema = machineSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

export const materialSchema = z
  .object({
    brand: z
      .string()
      .trim()
      .min(2, "Material name must have at least 2 characters.")
      .max(120, "Material name must have at most 120 characters."),
    type: z.enum(["FILAMENT", "RESIN", "OTHER"]),
    color: z
      .string()
      .trim()
      .min(2, "Color must have at least 2 characters.")
      .max(60, "Color must have at most 60 characters."),
    totalWeightGrams: z.number().finite().positive(),
    purchasePrice: z.number().finite().min(0),
  })
  .strict();

export const materialUpdateSchema = materialSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

export const productionSettingsSchema = z
  .object({
    desiredMarginPercent: z.number().finite().min(0).max(100),
    paintingHourRate: z.number().finite().min(0).default(0),
    finishingHourRate: z.number().finite().min(0).default(0),
    errorRate: z.number().finite().min(0).max(100).default(0),
    energyCostPerKwh: z.number().finite().min(0),
    cardFeePercent: z.number().finite().min(0).max(100),
    administrativeFeePercent: z.number().finite().min(0).max(100),
    customVariables: z
      .record(
        variableName,
        z.union([customVariableDefinitionSchema, legacyCustomVariableSchema]),
      )
      .optional(),
  })
  .strict();

export type MachineInput = z.infer<typeof machineSchema>;
export type MachineUpdateInput = z.infer<typeof machineUpdateSchema>;
export type MaterialInput = z.infer<typeof materialSchema>;
export type MaterialUpdateInput = z.infer<typeof materialUpdateSchema>;
export type ProductionSettingsInput = z.infer<typeof productionSettingsSchema>;
