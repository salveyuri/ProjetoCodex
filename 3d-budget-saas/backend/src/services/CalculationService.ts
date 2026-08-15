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
  maintenanceCostPerHour: Prisma.Decimal;
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

const toSafeNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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
  maintenanceCost,
  laborCost,
  baseCost,
}: {
  request: CalculationRequest;
  machine: CalculationMachine;
  settings: ProductionSettings;
  materialCost: Prisma.Decimal;
  energyCost: Prisma.Decimal;
  depreciationCost: Prisma.Decimal;
  maintenanceCost: Prisma.Decimal;
  laborCost: Prisma.Decimal;
  baseCost: Prisma.Decimal;
}): FormulaVariables => {
  const marginRate = settings.desiredMarginPercent / 100;
  const cardFeeRate = settings.cardFeePercent / 100;
  const administrativeFeeRate = settings.administrativeFeePercent / 100;
  const weightGrams = toSafeNumber(request.weightGrams);
  const printTimeHours = toSafeNumber(request.printTimeHours);
  const paintingHours = toSafeNumber(request.paintingHours);
  const finishingHours = toSafeNumber(request.finishingHours);
  const quoteItemsCount = toSafeNumber(request.quoteItemsCount ?? 1);
  const runtimeCustomVariables = customVariablesToRuntimeValues(
    settings.customVariables,
  );

  return {
    peso: weightGrams,
    tempo: printTimeHours,
    material_cost: Number(materialCost.toString()),
    energia_total: Number(energyCost.toString()),
    depreciacao_maquina: Number(depreciationCost.toString()),
    manutencao_maquina: Number(maintenanceCost.toString()),
    mao_obra: Number(laborCost.toString()),
    custo_base: Number(baseCost.toString()),
    margem_lucro: marginRate,
    valor_hora_tecnica: settings.technicalHourRate,
    custo_kwh: settings.energyCostPerKwh,
    taxa_cartao: cardFeeRate,
    taxa_administrativa: administrativeFeeRate,
    taxas_percentuais: cardFeeRate + administrativeFeeRate,
    consumo_kw: Number(machine.powerConsumptionKw.toString()),
    horas_pintura: paintingHours,
    valor_hora_pintura: settings.paintingHourRate,
    horas_acabamento: finishingHours,
    valor_hora_acabamento: settings.finishingHourRate,
    quantidade_mesas: quoteItemsCount,
    taxa_erro: settings.errorRate,
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
  const safeRequest: CalculationRequest = {
    ...request,
    weightGrams: toSafeNumber(request.weightGrams),
    printTimeHours: toSafeNumber(request.printTimeHours),
    paintingHours: toSafeNumber(request.paintingHours),
    finishingHours: toSafeNumber(request.finishingHours),
    quoteItemsCount: toSafeNumber(request.quoteItemsCount ?? 1),
  };
  const weightGrams = decimal(safeRequest.weightGrams);
  const printTimeHours = decimal(safeRequest.printTimeHours);
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
  const maintenanceCost =
    machine.maintenanceCostPerHour.mul(printTimeHours);
  const laborCost = decimal(settings.technicalHourRate).mul(printTimeHours);
  const baseCost = materialCost
    .add(energyCost)
    .add(depreciationCost)
    .add(maintenanceCost)
    .add(laborCost);
  const formulaVariables = buildFormulaVariables({
    request: safeRequest,
    machine,
    settings,
    materialCost,
    energyCost,
    depreciationCost,
    maintenanceCost,
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
    input: safeRequest,
    resources: {
      machine: {
        id: machine.id,
        name: machine.name,
        type: machine.type,
        powerConsumptionWatts: toRoundedNumber(powerConsumptionWatts, 2),
        depreciationCostPerHour: toCurrencyNumber(
          machine.depreciationCostPerHour,
        ),
        maintenanceCostPerHour: toCurrencyNumber(
          machine.maintenanceCostPerHour,
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
      paintingHourRate: settings.paintingHourRate,
      finishingHourRate: settings.finishingHourRate,
      errorRate: settings.errorRate,
      energyCostPerKwh: settings.energyCostPerKwh,
      cardFeePercent: settings.cardFeePercent,
      administrativeFeePercent: settings.administrativeFeePercent,
      customVariables: settings.customVariables,
    },
    breakdown: {
      materialCost: toCurrencyNumber(materialCost),
      energyCost: toCurrencyNumber(energyCost),
      depreciationCost: toCurrencyNumber(depreciationCost),
      maintenanceCost: toCurrencyNumber(maintenanceCost),
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

type FormulaForCalculation = Awaited<
  ReturnType<typeof formulaService.getFormulaForCalculation>
>;

export class CalculationService {
  async calculate(
    companyId: string,
    input: CalculationInput,
  ): Promise<CalculationResponse> {
    const [settings, formula] = await Promise.all([
      settingsService.get(companyId),
      formulaService.getFormulaForCalculation(companyId, input.formulaId),
    ]);

    return this.calculateWithResolvedContext(companyId, input, settings, formula);
  }

  /**
   * Same as `calculate`, but for callers that already resolved `settings`
   * and `formula` once (e.g. a multi-item quote, where every item shares
   * the same settings/formula) — avoids refetching them per item.
   */
  async calculateWithResolvedContext(
    companyId: string,
    input: CalculationInput,
    settings: ProductionSettings,
    formula: FormulaForCalculation,
  ): Promise<CalculationResponse> {
    const [machine, material] = await Promise.all([
      prisma.machine.findFirst({
        where: { id: input.machineId, companyId },
        select: {
          id: true,
          name: true,
          type: true,
          powerConsumptionKw: true,
          depreciationCostPerHour: true,
          maintenanceCostPerHour: true,
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
    ]);

    // "Access denied." on purpose for both, not "not accessible for this
    // company": the specific wording shouldn't confirm that a
    // company-ownership check is what rejected the request (see
    // Contextos/Conhecimento.md). Codes stay distinct for legitimate
    // frontend/API-consumer logic.
    if (!machine) {
      throw new AppError("Access denied.", 403, "MACHINE_FORBIDDEN");
    }

    if (!material) {
      throw new AppError("Access denied.", 403, "MATERIAL_FORBIDDEN");
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
