import { z } from "zod";

const nonNegativeNumber = z.number().finite().min(0);
const positiveInteger = z.number().int().positive();
const uuid = z.string().trim().uuid();

export const calculationSchema = z
  .object({
    weightGrams: nonNegativeNumber.optional(),
    peso_gramas: nonNegativeNumber.optional(),
    printTimeHours: nonNegativeNumber.optional(),
    tempo_horas: nonNegativeNumber.optional(),
    machineId: uuid.optional(),
    machine_id: uuid.optional(),
    materialId: uuid.optional(),
    material_id: uuid.optional(),
    formulaId: uuid.optional(),
    formula_id: uuid.optional(),
    paintingHours: nonNegativeNumber.optional(),
    horas_pintura: nonNegativeNumber.optional(),
    finishingHours: nonNegativeNumber.optional(),
    horas_acabamento: nonNegativeNumber.optional(),
    quoteItemsCount: positiveInteger.optional(),
    quantidade_mesas: positiveInteger.optional(),
  })
  .strict()
  .transform((value, context) => {
    const weightGrams = value.weightGrams ?? value.peso_gramas;
    const printTimeHours = value.printTimeHours ?? value.tempo_horas;
    const machineId = value.machineId ?? value.machine_id;
    const materialId = value.materialId ?? value.material_id;
    const formulaId = value.formulaId ?? value.formula_id;
    const paintingHours = value.paintingHours ?? value.horas_pintura ?? 0;
    const finishingHours =
      value.finishingHours ?? value.horas_acabamento ?? 0;
    const quoteItemsCount =
      value.quoteItemsCount ?? value.quantidade_mesas ?? 1;

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
      paintingHours,
      finishingHours,
      quoteItemsCount,
    };
  });

export type CalculationInput = z.infer<typeof calculationSchema>;
