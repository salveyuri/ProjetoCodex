import type {
  CalculationRequest,
  CalculationResponse,
  MachineType,
  MaterialType,
  ProductionSettings,
} from "@3d-budget/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import type { CalculationInput } from "../validators/calculation.validator";
import {
  evaluateFormulaExpression,
  type FormulaExecutionResult,
  type FormulaVariables,
  SYSTEM_DEFAULT_FORMULA,
} from "./formula-engine";
import { formulaService } from "./formula.service";
import {
  customVariablesToRuntimeValues,
  settingsService,
} from "./settings.service";

type DecimalValue = Prisma.Decimal | number | string;

interface CalculationMachine {
  id: string;
  name: string;
  type: MachineType;
  powerConsumptionKw: Prisma.Decimal;
  depreciationCostPerHour: Prisma.Decimal;
}

interface CalculationMaterial {
  id: string;
  brand: string;
  type: MaterialType;
  color: string;
  costPerGram: Prisma.Decimal;
}

export interface CalculationFormulaInput {
  request: CalculationRequest;
  machine: CalculationMachine;
  material: CalculationMaterial;
  settings: ProductionSettings;
  formula: {
    id: string | null;
    name: string;
    expression: string;
  } | null;
}

const ROUNDING_MODE = Prisma.Decimal.ROUND_HALF_UP;

const decimal = (value: DecimalValue): Prisma.Decimal => new Prisma.Decimal(value);

const percentToRate = (percent: number): Prisma.Decimal =>
  decimal(percent).div(100);

const toRoundedNumber = (value: Prisma.Decimal, decimalPlaces: number): number =>
  Number(value.toDecimalPlaces(decimalPlaces, ROUNDING_MODE).toString());

const toCurrencyNumber = (value: Prisma.Decimal): number =>
  toRoundedNumber(value, 2);

const toPositiveCurrencyDelta = (
  finalPrice: Prisma.Decimal,
  baseCost: Prisma.Decimal,
): Prisma.Decimal => {
  const delta = finalPrice.sub(baseCost);
  return delta.isNegative() ? new Prisma.Decimal(0) : delta;
};

const buildFormulaVariables = ({
  request,
  machine,
  settings,
  materialCost,
  energyCost,
  depreciationCost,
  laborCost,
  baseCost,
}: {
  request: CalculationRequest;
  machine: CalculationMachine;
  settings: ProductionSettings;
  materialCost: Prisma.Decimal;
  energyCost: Prisma.Decimal;
  depreciationCost: Prisma.Decimal;
  laborCost: Prisma.Decimal;
  baseCost: Prisma.Decimal;
}): FormulaVariables => {
  const marginRate = settings.desiredMarginPercent / 100;
  const cardFeeRate = settings.cardFeePercent / 100;
  const administrativeFeeRate = settings.administrativeFeePercent / 100;
  const runtimeCustomVariables = customVariablesToRuntimeValues(
    settings.customVariables,
  );

  return {
    peso: request.weightGrams,
    peso_gramas: request.weightGrams,
    tempo: request.printTimeHours,
    tempo_horas: request.printTimeHours,
    material_cost: Number(materialCost.toString()),
    energia_total: Number(energyCost.toString()),
    depreciacao_maquina: Number(depreciationCost.toString()),
    mao_obra: Number(laborCost.toString()),
    custo_base: Number(baseCost.toString()),
    margem_lucro: marginRate,
    margem_lucro_percentual: settings.desiredMarginPercent,
    valor_hora_tecnica: settings.technicalHourRate,
    custo_kwh: settings.energyCostPerKwh,
    taxa_cartao: cardFeeRate,
    taxa_administrativa: administrativeFeeRate,
    taxas_percentuais: cardFeeRate + administrativeFeeRate,
    consumo_kw: Number(machine.powerConsumptionKw.toString()),
    ...runtimeCustomVariables,
  };
};

export const calculateQuoteBreakdown = ({
  request,
  machine,
  material,
  settings,
  formula,
}: CalculationFormulaInput): CalculationResponse => {
  const weightGrams = decimal(request.weightGrams);
  const printTimeHours = decimal(request.printTimeHours);
  const desiredMarginRate = percentToRate(settings.desiredMarginPercent);
  const cardFeeRate = percentToRate(settings.cardFeePercent);
  const administrativeFeeRate = percentToRate(
    settings.administrativeFeePercent,
  );

  const materialCost = material.costPerGram.mul(weightGrams);
  const energyCost = machine.powerConsumptionKw
    .mul(printTimeHours)
    .mul(settings.energyCostPerKwh);
  const depreciationCost =
    machine.depreciationCostPerHour.mul(printTimeHours);
  const laborCost = decimal(settings.technicalHourRate).mul(printTimeHours);
  const baseCost = materialCost.add(energyCost).add(depreciationCost).add(laborCost);
  const formulaVariables = buildFormulaVariables({
    request,
    machine,
    settings,
    materialCost,
    energyCost,
    depreciationCost,
    laborCost,
    baseCost,
  });
  const selectedFormula = formula ?? SYSTEM_DEFAULT_FORMULA;
  let formulaSource: CalculationResponse["formula"]["source"] = "DATABASE";
  let formulaResult: FormulaExecutionResult;

  if (!formula) {
    formulaSource = "SYSTEM_FALLBACK";
  }

  try {
    formulaResult = evaluateFormulaExpression(
      selectedFormula.expression,
      formulaVariables,
    );
  } catch {
    formulaResult = evaluateFormulaExpression(
      SYSTEM_DEFAULT_FORMULA.expression,
      formulaVariables,
    );
    formulaSource = "SYSTEM_FALLBACK";
  }

  const finalPrice = decimal(formulaResult.price);
  const marginAmount =
    formulaSource === "SYSTEM_FALLBACK"
      ? baseCost.mul(desiredMarginRate)
      : toPositiveCurrencyDelta(finalPrice, baseCost);
  const subtotalWithMargin =
    formulaSource === "SYSTEM_FALLBACK"
      ? baseCost.add(marginAmount)
      : finalPrice;
  const cardFeeAmount =
    formulaSource === "SYSTEM_FALLBACK" ? subtotalWithMargin.mul(cardFeeRate) : decimal(0);
  const administrativeFeeAmount =
    formulaSource === "SYSTEM_FALLBACK"
      ? subtotalWithMargin.mul(administrativeFeeRate)
      : decimal(0);
  const feesTotal = cardFeeAmount.add(administrativeFeeAmount);
  const powerConsumptionWatts = machine.powerConsumptionKw.mul(1000);

  return {
    input: request,
    resources: {
      machine: {
        id: machine.id,
        name: machine.name,
        type: machine.type,
        powerConsumptionWatts: toRoundedNumber(powerConsumptionWatts, 2),
        depreciationCostPerHour: toCurrencyNumber(
          machine.depreciationCostPerHour,
        ),
      },
      material: {
        id: material.id,
        brand: material.brand,
        type: material.type,
        color: material.color,
        costPerGram: toRoundedNumber(material.costPerGram, 6),
      },
    },
    rates: {
      desiredMarginPercent: settings.desiredMarginPercent,
      technicalHourRate: settings.technicalHourRate,
      energyCostPerKwh: settings.energyCostPerKwh,
      cardFeePercent: settings.cardFeePercent,
      administrativeFeePercent: settings.administrativeFeePercent,
      customVariables: settings.customVariables,
    },
    breakdown: {
      materialCost: toCurrencyNumber(materialCost),
      energyCost: toCurrencyNumber(energyCost),
      depreciationCost: toCurrencyNumber(depreciationCost),
      laborCost: toCurrencyNumber(laborCost),
      baseCost: toCurrencyNumber(baseCost),
      marginAmount: toCurrencyNumber(marginAmount),
      subtotalWithMargin: toCurrencyNumber(subtotalWithMargin),
      cardFeeAmount: toCurrencyNumber(cardFeeAmount),
      administrativeFeeAmount: toCurrencyNumber(administrativeFeeAmount),
      feesTotal: toCurrencyNumber(feesTotal),
      finalPrice: toCurrencyNumber(finalPrice),
    },
    formula: {
      id: formulaSource === "DATABASE" ? selectedFormula.id : null,
      name:
        formulaSource === "DATABASE"
          ? selectedFormula.name
          : SYSTEM_DEFAULT_FORMULA.name,
      expression: formulaResult.expression,
      source: formulaSource,
    },
    variables: formulaVariables,
    precision: {
      internal: "Prisma.Decimal",
      currencyDecimalPlaces: 2,
    },
  };
};

export class CalculationService {
  async calculate(
    companyId: string,
    input: CalculationInput,
  ): Promise<CalculationResponse> {
    const [machine, material, settings, formula] = await Promise.all([
      prisma.machine.findFirst({
        where: { id: input.machineId, companyId },
        select: {
          id: true,
          name: true,
          type: true,
          powerConsumptionKw: true,
          depreciationCostPerHour: true,
        },
      }),
      prisma.material.findFirst({
        where: { id: input.materialId, companyId },
        select: {
          id: true,
          brand: true,
          type: true,
          color: true,
          costPerGram: true,
        },
      }),
      settingsService.get(companyId),
      formulaService.getFormulaForCalculation(companyId, input.formulaId),
    ]);

    if (!machine) {
      throw new AppError("Machine not found.", 404, "MACHINE_NOT_FOUND");
    }

    if (!material) {
      throw new AppError("Material not found.", 404, "MATERIAL_NOT_FOUND");
    }

    return calculateQuoteBreakdown({
      request: input,
      machine,
      material,
      settings,
      formula,
    });
  }
}

export const calculationService = new CalculationService();
