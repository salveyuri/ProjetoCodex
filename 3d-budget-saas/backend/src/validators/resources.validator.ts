import { z } from "zod";

const positiveNumber = z.coerce.number().finite().min(0);
const variableName = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
const customVariableTypeSchema = z.enum(["INTEGER", "FLOAT", "PERCENTAGE"]);
const legacyCustomVariableSchema = z.coerce.number().finite().transform((value) => ({
  value,
  type: "FLOAT" as const,
}));
const customVariableDefinitionSchema = z
  .object({
    value: z.coerce.number().finite(),
    type: customVariableTypeSchema.default("FLOAT"),
  })
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

export const machineSchema = z.object({
  name: z.string().trim().min(2, "Machine name must have at least 2 characters."),
  type: machineTypeSchema,
  printVolumeXmm: positiveNumber.default(220),
  printVolumeYmm: positiveNumber.default(220),
  printVolumeZmm: positiveNumber.default(220),
  depreciationCostPerHour: positiveNumber,
  powerConsumptionWatts: positiveNumber,
});

export const machineUpdateSchema = machineSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

export const materialSchema = z.object({
  brand: z.string().trim().min(2, "Material name must have at least 2 characters."),
  type: z.enum(["FILAMENT", "RESIN", "POWDER", "OTHER"]),
  color: z.string().trim().min(2, "Color must have at least 2 characters."),
  totalWeightGrams: z.coerce.number().finite().positive(),
  purchasePrice: z.coerce.number().finite().min(0),
  density: z.coerce.number().finite().positive().default(1.24),
});

export const materialUpdateSchema = materialSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

export const productionSettingsSchema = z.object({
  desiredMarginPercent: z.coerce.number().finite().min(0).max(100),
  technicalHourRate: z.coerce.number().finite().min(0),
  energyCostPerKwh: z.coerce.number().finite().min(0),
  cardFeePercent: z.coerce.number().finite().min(0).max(100),
  administrativeFeePercent: z.coerce.number().finite().min(0).max(100),
  customVariables: z
    .record(
      variableName,
      z.union([customVariableDefinitionSchema, legacyCustomVariableSchema]),
    )
    .optional(),
});

export type MachineInput = z.infer<typeof machineSchema>;
export type MachineUpdateInput = z.infer<typeof machineUpdateSchema>;
export type MaterialInput = z.infer<typeof materialSchema>;
export type MaterialUpdateInput = z.infer<typeof materialUpdateSchema>;
export type ProductionSettingsInput = z.infer<typeof productionSettingsSchema>;
