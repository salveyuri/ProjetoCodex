import type { ProductionSettings } from "@3d-budget/shared";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { calculateQuoteBreakdown, type CalculationFormulaInput } from "./CalculationService";

const baseSettings: ProductionSettings = {
  desiredMarginPercent: 30,
  paintingHourRate: 0,
  finishingHourRate: 0,
  errorRate: 0,
  energyCostPerKwh: 1,
  cardFeePercent: 5,
  administrativeFeePercent: 2,
  customVariables: {},
};

const baseMachine: CalculationFormulaInput["machine"] = {
  id: "machine-1",
  name: "Ender 3",
  type: "FDM",
  powerConsumptionKw: new Prisma.Decimal(0.12),
  depreciationCostPerHour: new Prisma.Decimal(3),
  // 0 on purpose: keeps the historical regression assertions below (pinned
  // to finalPrice = 78.23, before maintenanceCost existed) unchanged.
  maintenanceCostPerHour: new Prisma.Decimal(0),
};

const baseMaterial: CalculationFormulaInput["material"] = {
  id: "material-1",
  brand: "PLA X",
  type: "FILAMENT",
  color: "Preto",
  costPerGram: new Prisma.Decimal(0.1),
};

const baseRequest: CalculationFormulaInput["request"] = {
  weightGrams: 100,
  printTimeHours: 2,
  machineId: baseMachine.id,
  materialId: baseMaterial.id,
};

describe("calculateQuoteBreakdown — system fallback formula", () => {
  // Regression fixture: this exact combination was validated manually
  // during Bloco 5 (ver Contextos/Chat.log) and originally returned
  // finalPrice = 78.23. Re-pinned to 22.59 in 2026-08-16 after removing
  // laborCost/technicalHourRate from baseCost (see Contextos/Decisoes.md).
  it("matches the historical known-good calculation when no formula is set", () => {
    const result = calculateQuoteBreakdown({
      request: baseRequest,
      machine: baseMachine,
      material: baseMaterial,
      settings: baseSettings,
      formula: null,
    });

    expect(result.breakdown.materialCost).toBe(10);
    expect(result.breakdown.energyCost).toBe(0.24);
    expect(result.breakdown.depreciationCost).toBe(6);
    expect(result.breakdown.maintenanceCost).toBe(0);
    expect(result.breakdown.baseCost).toBe(16.24);
    expect(result.breakdown.finalPrice).toBe(22.59);
    expect(result.formula.source).toBe("SYSTEM_FALLBACK");
  });

  it("adds maintenanceCost to baseCost alongside depreciationCost", () => {
    const machineWithMaintenance: CalculationFormulaInput["machine"] = {
      ...baseMachine,
      maintenanceCostPerHour: new Prisma.Decimal(1.5),
    };

    const result = calculateQuoteBreakdown({
      request: baseRequest,
      machine: machineWithMaintenance,
      material: baseMaterial,
      settings: baseSettings,
      formula: null,
    });

    // 1.5/h * 2h = 3, on top of the 16.24 baseCost from the fixture above.
    expect(result.breakdown.maintenanceCost).toBe(3);
    expect(result.breakdown.baseCost).toBe(19.24);
    expect(result.resources.machine.maintenanceCostPerHour).toBe(1.5);
    expect(result.variables.manutencao_maquina).toBe(3);
  });

  it("rounds currency fields to 2 decimal places and cost-per-gram to 6", () => {
    const result = calculateQuoteBreakdown({
      request: baseRequest,
      machine: baseMachine,
      material: baseMaterial,
      settings: baseSettings,
      formula: null,
    });

    expect(result.resources.material.costPerGram).toBe(0.1);
    expect(Number.isInteger(result.breakdown.finalPrice * 100)).toBe(true);
  });

  it("an unfilled (0) errorRate/cardFeePercent/administrativeFeePercent does not zero the price", () => {
    const result = calculateQuoteBreakdown({
      request: baseRequest,
      machine: baseMachine,
      material: baseMaterial,
      settings: {
        ...baseSettings,
        cardFeePercent: 0,
        administrativeFeePercent: 0,
        errorRate: 0,
      },
      formula: null,
    });

    // baseCost * (1 + margem_lucro), with every rate at 0 contributing
    // nothing to the "(taxa_cartao + taxa_administrativa + taxa_erro)"
    // factor — never multiplying the whole price by 0.
    expect(result.breakdown.finalPrice).toBe(21.11);
    expect(result.breakdown.cardFeeAmount).toBe(0);
    expect(result.breakdown.administrativeFeeAmount).toBe(0);
    expect(result.breakdown.errorFeeAmount).toBe(0);
  });

  it("errorRate adds its share of the fee on top of card/administrative, same as they do", () => {
    const result = calculateQuoteBreakdown({
      request: baseRequest,
      machine: baseMachine,
      material: baseMaterial,
      settings: { ...baseSettings, errorRate: 10 },
      formula: null,
    });

    // subtotalWithMargin (21.112) * 10% = 2.1112 -> rounds to 2.11.
    expect(result.breakdown.errorFeeAmount).toBe(2.11);
    expect(result.breakdown.finalPrice).toBeGreaterThan(22.59);
  });

  it("normalizes a missing weight/print time to 0 instead of throwing", () => {
    const result = calculateQuoteBreakdown({
      request: {
        ...baseRequest,
        weightGrams: undefined as unknown as number,
        printTimeHours: undefined as unknown as number,
      },
      machine: baseMachine,
      material: baseMaterial,
      settings: baseSettings,
      formula: null,
    });

    expect(result.breakdown.materialCost).toBe(0);
    expect(result.breakdown.depreciationCost).toBe(0);
    expect(result.input.weightGrams).toBe(0);
    expect(result.input.printTimeHours).toBe(0);
  });
});

describe("calculateQuoteBreakdown — custom (DATABASE) formula", () => {
  it("uses the custom formula's result as the final price", () => {
    const result = calculateQuoteBreakdown({
      request: baseRequest,
      machine: baseMachine,
      material: baseMaterial,
      settings: baseSettings,
      formula: {
        id: "formula-1",
        name: "Dobro do custo base",
        expression: "custo_base * 2",
      },
    });

    expect(result.breakdown.baseCost).toBe(16.24);
    expect(result.breakdown.finalPrice).toBe(32.48);
    expect(result.formula.source).toBe("DATABASE");
    expect(result.formula.id).toBe("formula-1");
    // No card/administrative fee is layered on top of a custom formula's
    // own result — those only apply to the system fallback formula.
    expect(result.breakdown.cardFeeAmount).toBe(0);
    expect(result.breakdown.administrativeFeeAmount).toBe(0);
  });

  it("falls back to the system formula when the custom formula fails at runtime", () => {
    const result = calculateQuoteBreakdown({
      request: baseRequest,
      machine: baseMachine,
      material: baseMaterial,
      settings: baseSettings,
      formula: {
        id: "formula-broken",
        name: "Resultado negativo",
        expression: "custo_base - custo_base - 1",
      },
    });

    expect(result.formula.source).toBe("SYSTEM_FALLBACK");
    // Same math as the no-formula case above.
    expect(result.breakdown.finalPrice).toBe(22.59);
  });
});
