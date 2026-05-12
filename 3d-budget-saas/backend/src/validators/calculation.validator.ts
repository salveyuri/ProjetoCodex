import { z } from "zod";

const positiveNumber = z.coerce.number().finite().positive();
const uuid = z.string().trim().uuid();

export const calculationSchema = z
  .object({
    weightGrams: positiveNumber.optional(),
    peso_gramas: positiveNumber.optional(),
    printTimeHours: positiveNumber.optional(),
    tempo_horas: positiveNumber.optional(),
    machineId: uuid.optional(),
    machine_id: uuid.optional(),
    materialId: uuid.optional(),
    material_id: uuid.optional(),
    formulaId: uuid.optional(),
    formula_id: uuid.optional(),
  })
  .transform((value, context) => {
    const weightGrams = value.weightGrams ?? value.peso_gramas;
    const printTimeHours = value.printTimeHours ?? value.tempo_horas;
    const machineId = value.machineId ?? value.machine_id;
    const materialId = value.materialId ?? value.material_id;
    const formulaId = value.formulaId ?? value.formula_id;

    if (weightGrams === undefined) {
      context.addIssue({
        code: "custom",
        path: ["weightGrams"],
        message: "Weight in grams is required.",
      });
    }

    if (printTimeHours === undefined) {
      context.addIssue({
        code: "custom",
        path: ["printTimeHours"],
        message: "Print time in hours is required.",
      });
    }

    if (machineId === undefined) {
      context.addIssue({
        code: "custom",
        path: ["machineId"],
        message: "Machine id is required.",
      });
    }

    if (materialId === undefined) {
      context.addIssue({
        code: "custom",
        path: ["materialId"],
        message: "Material id is required.",
      });
    }

    return {
      weightGrams: weightGrams ?? 0,
      printTimeHours: printTimeHours ?? 0,
      machineId: machineId ?? "",
      materialId: materialId ?? "",
      formulaId,
    };
  });

export type CalculationInput = z.infer<typeof calculationSchema>;
