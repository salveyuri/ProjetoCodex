import type {
  CalculationAppliedRates,
  CalculationRequest,
  CalculationResponse,
  MachineType,
  MaterialType,
  ProductionSettings,
  QuoteItemCostPreview,
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

const machineSelect = {
  id: true,
  name: true,
  type: true,
  powerConsumptionKw: true,
  depreciationCostPerHour: true,
  maintenanceCostPerHour: true,
} as const;

const materialSelect = {
  id: true,
  brand: true,
  type: true,
  color: true,
  costPerGram: true,
} as const;

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

const toPositiveDelta = (
  a: Prisma.Decimal,
  b: Prisma.Decimal,
): Prisma.Decimal => {
  const delta = a.sub(b);
  return delta.isNegative() ? new Prisma.Decimal(0) : delta;
};

const toAppliedRates = (settings: ProductionSettings): CalculationAppliedRates => ({
  desiredMarginPercent: settings.desiredMarginPercent,
  paintingHourRate: settings.paintingHourRate,
  finishingHourRate: settings.finishingHourRate,
  errorRate: settings.errorRate,
  energyCostPerKwh: settings.energyCostPerKwh,
  cardFeePercent: settings.cardFeePercent,
  administrativeFeePercent: settings.administrativeFeePercent,
  customVariables: settings.customVariables,
});

/** Raw production cost of a single print item — material + energy +
 * machine depreciation/maintenance for the time/weight given. No error
 * rate, fees, margin or post-processing: those only exist once the item
 * is folded into a quote's aggregate (see `calculateAggregate` below). */
export interface RawItemCost {
  materialCost: Prisma.Decimal;
  energyCost: Prisma.Decimal;
  depreciationCost: Prisma.Decimal;
  maintenanceCost: Prisma.Decimal;
  rawCost: Prisma.Decimal;
}

export const computeRawItemCost = (
  machine: CalculationMachine,
  material: CalculationMaterial,
  weightGrams: Prisma.Decimal,
  printTimeHours: Prisma.Decimal,
  energyCostPerKwh: number,
): RawItemCost => {
  const materialCost = material.costPerGram.mul(weightGrams);
  const energyCost = machine.powerConsumptionKw
    .mul(printTimeHours)
    .mul(energyCostPerKwh);
  const depreciationCost = machine.depreciationCostPerHour.mul(printTimeHours);
  const maintenanceCost = machine.maintenanceCostPerHour.mul(printTimeHours);
  const rawCost = materialCost.add(energyCost).add(depreciationCost).add(maintenanceCost);

  return { materialCost, energyCost, depreciationCost, maintenanceCost, rawCost };
};

export interface AggregateCalculationInput {
  rawCosts: RawItemCost[];
  settings: ProductionSettings;
  formula: { id: string | null; name: string; expression: string } | null;
  paintingHours: number;
  finishingHours: number;
  itemsCount: number;
  totalWeightGrams: Prisma.Decimal;
  totalPrintTimeHours: Prisma.Decimal;
  totalPowerConsumptionKw: Prisma.Decimal;
  customVariables: ProductionSettings["customVariables"];
}

export interface AggregateCalculationResult {
  breakdown: {
    materialCost: number;
    energyCost: number;
    depreciationCost: number;
    maintenanceCost: number;
    errorCostAmount: number;
    baseCost: number;
    postProcessingCost: number;
    marginAmount: number;
    subtotalWithMargin: number;
    cardFeeAmount: number;
    administrativeFeeAmount: number;
    feesTotal: number;
    finalPrice: number;
  };
  formula: {
    id: string | null;
    name: string;
    expression: string;
    source: "DATABASE" | "SYSTEM_FALLBACK";
  };
  variables: FormulaVariables;
}

/**
 * The core pricing engine: folds N raw item costs into ONE whole-quote
 * calculation, evaluating the formula (system default or company-custom)
 * exactly once — never per item. This is the fix for the reported bug
 * where painting/finishing hours got counted once per mesa instead of
 * once for the whole order (see Contextos/Decisoes.md, 2026-08-17).
 *
 * Pipeline (matches the Yuri's own spec verbatim):
 *   1. printCost = sum(materialCost) + sum(energyCost) across every item.
 *   2. errorRate applies ONLY to printCost (not depreciation/maintenance).
 *   3. custo_base = printCost*(1+errorRate) + sum(depreciationCost) + sum(maintenanceCost).
 *   4. Post-processing (painting/finishing) is added once, not per item —
 *      the formula itself adds it as a separate term alongside custo_base.
 *   5. The formula evaluates once against these aggregate variables.
 *   6. cardFeeAmount/administrativeFeeAmount/marginAmount below are
 *      best-effort *display* estimates (subtotal * rate) — the formula is
 *      free-text, so there's no way to know exactly how an arbitrary
 *      expression split fees from margin in its result. This applies
 *      uniformly regardless of formula source (default or custom).
 */
export const calculateAggregate = ({
  rawCosts,
  settings,
  formula,
  paintingHours,
  finishingHours,
  itemsCount,
  totalWeightGrams,
  totalPrintTimeHours,
  totalPowerConsumptionKw,
  customVariables,
}: AggregateCalculationInput): AggregateCalculationResult => {
  const materialCost = rawCosts.reduce(
    (total, item) => total.add(item.materialCost),
    decimal(0),
  );
  const energyCost = rawCosts.reduce(
    (total, item) => total.add(item.energyCost),
    decimal(0),
  );
  const depreciationCost = rawCosts.reduce(
    (total, item) => total.add(item.depreciationCost),
    decimal(0),
  );
  const maintenanceCost = rawCosts.reduce(
    (total, item) => total.add(item.maintenanceCost),
    decimal(0),
  );

  const marginRate = settings.desiredMarginPercent / 100;
  const cardFeeRate = percentToRate(settings.cardFeePercent);
  const administrativeFeeRate = percentToRate(settings.administrativeFeePercent);
  const errorRate = percentToRate(settings.errorRate);

  const printCost = materialCost.add(energyCost);
  const errorCostAmount = printCost.mul(errorRate);
  const baseCost = printCost.add(errorCostAmount).add(depreciationCost).add(maintenanceCost);
  const postProcessingCost = decimal(settings.paintingHourRate)
    .mul(paintingHours)
    .add(decimal(settings.finishingHourRate).mul(finishingHours));
  const subtotalBeforeFees = baseCost.add(postProcessingCost);

  const runtimeCustomVariables = customVariablesToRuntimeValues(customVariables);
  const formulaVariables: FormulaVariables = {
    peso: Number(totalWeightGrams.toString()),
    tempo: Number(totalPrintTimeHours.toString()),
    material_cost: Number(materialCost.toString()),
    energia_total: Number(energyCost.toString()),
    depreciacao_maquina: Number(depreciationCost.toString()),
    manutencao_maquina: Number(maintenanceCost.toString()),
    custo_base: Number(baseCost.toString()),
    margem_lucro: marginRate,
    custo_kwh: settings.energyCostPerKwh,
    taxa_cartao: Number(cardFeeRate.toString()),
    taxa_administrativa: Number(administrativeFeeRate.toString()),
    taxas_percentuais: Number(cardFeeRate.add(administrativeFeeRate).toString()),
    // Best-effort sum across items — with multiple different machines in
    // one quote this isn't any single machine's real consumption, just a
    // stand-in so the variable stays defined instead of crashing formulas
    // that reference it.
    consumo_kw: Number(totalPowerConsumptionKw.toString()),
    horas_pintura: paintingHours,
    valor_hora_pintura: settings.paintingHourRate,
    horas_acabamento: finishingHours,
    valor_hora_acabamento: settings.finishingHourRate,
    quantidade_mesas: itemsCount,
    taxa_erro: Number(errorRate.toString()),
    ...runtimeCustomVariables,
  };

  const selectedFormula = formula ?? SYSTEM_DEFAULT_FORMULA;
  let formulaSource: "DATABASE" | "SYSTEM_FALLBACK" = formula
    ? "DATABASE"
    : "SYSTEM_FALLBACK";
  let formulaResult: FormulaExecutionResult;

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
  const delta = toPositiveDelta(finalPrice, subtotalBeforeFees);
  const cardFeeAmount = subtotalBeforeFees.mul(cardFeeRate);
  const administrativeFeeAmount = subtotalBeforeFees.mul(administrativeFeeRate);
  const feesTotal = cardFeeAmount.add(administrativeFeeAmount);
  const marginAmount = toPositiveDelta(delta, feesTotal);
  const subtotalWithMargin = subtotalBeforeFees.add(marginAmount);

  return {
    breakdown: {
      materialCost: toCurrencyNumber(materialCost),
      energyCost: toCurrencyNumber(energyCost),
      depreciationCost: toCurrencyNumber(depreciationCost),
      maintenanceCost: toCurrencyNumber(maintenanceCost),
      errorCostAmount: toCurrencyNumber(errorCostAmount),
      baseCost: toCurrencyNumber(baseCost),
      postProcessingCost: toCurrencyNumber(postProcessingCost),
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
        formulaSource === "DATABASE" ? selectedFormula.name : SYSTEM_DEFAULT_FORMULA.name,
      expression: formulaResult.expression,
      source: formulaSource,
    },
    variables: formulaVariables,
  };
};

/** Single-item calculation — used by the standalone calculator page and
 * by existing tests. Internally just the N=1 case of `calculateAggregate`. */
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
  const rawCost = computeRawItemCost(
    machine,
    material,
    weightGrams,
    printTimeHours,
    settings.energyCostPerKwh,
  );

  const aggregate = calculateAggregate({
    rawCosts: [rawCost],
    settings,
    formula,
    paintingHours: safeRequest.paintingHours ?? 0,
    finishingHours: safeRequest.finishingHours ?? 0,
    itemsCount: safeRequest.quoteItemsCount ?? 1,
    totalWeightGrams: weightGrams,
    totalPrintTimeHours: printTimeHours,
    totalPowerConsumptionKw: machine.powerConsumptionKw,
    customVariables: settings.customVariables,
  });

  const powerConsumptionWatts = machine.powerConsumptionKw.mul(1000);

  return {
    input: safeRequest,
    resources: {
      machine: {
        id: machine.id,
        name: machine.name,
        type: machine.type,
        powerConsumptionWatts: toRoundedNumber(powerConsumptionWatts, 2),
        depreciationCostPerHour: toCurrencyNumber(machine.depreciationCostPerHour),
        maintenanceCostPerHour: toCurrencyNumber(machine.maintenanceCostPerHour),
      },
      material: {
        id: material.id,
        brand: material.brand,
        type: material.type,
        color: material.color,
        costPerGram: toRoundedNumber(material.costPerGram, 6),
      },
    },
    rates: toAppliedRates(settings),
    breakdown: aggregate.breakdown,
    formula: aggregate.formula,
    variables: aggregate.variables,
    precision: {
      internal: "Prisma.Decimal",
      currencyDecimalPlaces: 2,
    },
  };
};

type FormulaForCalculation = Awaited<
  ReturnType<typeof formulaService.getFormulaForCalculation>
>;

export interface QuoteCalculationItemInput {
  modelName?: string;
  machineId: string;
  materialId: string;
  weightGrams: number;
  printTimeHours: number;
}

export interface QuoteCalculationInput {
  items: QuoteCalculationItemInput[];
  formulaId?: string;
  paintingHours?: number;
  finishingHours?: number;
}

export interface QuoteCalculationResult {
  items: QuoteItemCostPreview[];
  breakdown: AggregateCalculationResult["breakdown"];
  rates: CalculationAppliedRates;
  formula: AggregateCalculationResult["formula"];
  variables: FormulaVariables;
}

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
   * and `formula` once.
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
        select: machineSelect,
      }),
      prisma.material.findFirst({
        where: { id: input.materialId, companyId },
        select: materialSelect,
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

  /**
   * Whole-quote calculation: resolves every item's machine/material,
   * computes each one's raw cost, then folds them into ONE aggregate
   * calculation (formula evaluated once — see `calculateAggregate`).
   * Used by both the live quote preview endpoint and quote create/update,
   * so preview and save can never drift apart.
   */
  async calculateQuote(
    companyId: string,
    input: QuoteCalculationInput,
  ): Promise<QuoteCalculationResult> {
    const [settings, formula] = await Promise.all([
      settingsService.get(companyId),
      formulaService.getFormulaForCalculation(companyId, input.formulaId),
    ]);

    const resolvedItems = await Promise.all(
      input.items.map(async (item) => {
        const [machine, material] = await Promise.all([
          prisma.machine.findFirst({
            where: { id: item.machineId, companyId },
            select: machineSelect,
          }),
          prisma.material.findFirst({
            where: { id: item.materialId, companyId },
            select: materialSelect,
          }),
        ]);

        if (!machine) {
          throw new AppError("Access denied.", 403, "MACHINE_FORBIDDEN");
        }

        if (!material) {
          throw new AppError("Access denied.", 403, "MATERIAL_FORBIDDEN");
        }

        const weightGrams = decimal(toSafeNumber(item.weightGrams));
        const printTimeHours = decimal(toSafeNumber(item.printTimeHours));
        const rawCost = computeRawItemCost(
          machine,
          material,
          weightGrams,
          printTimeHours,
          settings.energyCostPerKwh,
        );

        return { modelName: item.modelName, machine, weightGrams, printTimeHours, rawCost };
      }),
    );

    const paintingHours = toSafeNumber(input.paintingHours);
    const finishingHours = toSafeNumber(input.finishingHours);
    const totalWeightGrams = resolvedItems.reduce(
      (total, item) => total.add(item.weightGrams),
      decimal(0),
    );
    const totalPrintTimeHours = resolvedItems.reduce(
      (total, item) => total.add(item.printTimeHours),
      decimal(0),
    );
    const totalPowerConsumptionKw = resolvedItems.reduce(
      (total, item) => total.add(item.machine.powerConsumptionKw),
      decimal(0),
    );

    const aggregate = calculateAggregate({
      rawCosts: resolvedItems.map((item) => item.rawCost),
      settings,
      formula,
      paintingHours,
      finishingHours,
      itemsCount: resolvedItems.length,
      totalWeightGrams,
      totalPrintTimeHours,
      totalPowerConsumptionKw,
      customVariables: settings.customVariables,
    });

    const items: QuoteItemCostPreview[] = resolvedItems.map((item) => ({
      modelName: item.modelName,
      materialCost: toCurrencyNumber(item.rawCost.materialCost),
      energyCost: toCurrencyNumber(item.rawCost.energyCost),
      depreciationCost: toCurrencyNumber(item.rawCost.depreciationCost),
      maintenanceCost: toCurrencyNumber(item.rawCost.maintenanceCost),
      rawCost: toCurrencyNumber(item.rawCost.rawCost),
    }));

    return {
      items,
      breakdown: aggregate.breakdown,
      rates: toAppliedRates(settings),
      formula: aggregate.formula,
      variables: aggregate.variables,
    };
  }
}

export const calculationService = new CalculationService();
