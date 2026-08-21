import type { ProductionSettings } from "@3d-budget/shared";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  calculateAggregate,
  calculateQuoteBreakdown,
  computeRawItemCost,
  type CalculationFormulaInput,
  type RawItemCost,
} from "./CalculationService";

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
  // during Bloco 5 (ver Contextos/Chat.log), originally 78.23, then 22.59
  // (2026-08-16, laborCost/technicalHourRate removed). Re-pinned to 22.25
  // on 2026-08-17: the pricing redesign changed the system default formula
  // from a compounded "custo_base*(1+margem)*(1+taxas)" to the additive
  // "custo_base*(1+taxas+margem)" shape the user's own formula uses — see
  // Contextos/Decisoes.md. Re-pinned to 21.44 on 2026-08-21: card fee
  // stopped being part of taxas_percentuais (it became an opt-in surcharge
  // tied to Quote.cardPayment, which calculateQuoteBreakdown never sets —
  // it has no "Pagamento Cartão" toggle, that only exists on the quote
  // form). taxas_percentuais here is administrativeFeeRate only now (2%).
  it("matches the known-good calculation when no formula is set", () => {
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
    expect(result.breakdown.errorCostAmount).toBe(0);
    expect(result.breakdown.baseCost).toBe(16.24);
    expect(result.breakdown.postProcessingCost).toBe(0);
    // 16.24 * (1 + 0.02 + 0.30) = 21.4368 -> 21.44
    expect(result.breakdown.finalPrice).toBe(21.44);
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

    // baseCost * (1 + taxas_percentuais + margem_lucro), with every rate at
    // 0 contributing nothing to the "(taxa_cartao + taxa_administrativa)"
    // factor — never multiplying the whole price by 0.
    expect(result.breakdown.finalPrice).toBe(21.11);
    expect(result.breakdown.cardFeeAmount).toBe(0);
    expect(result.breakdown.administrativeFeeAmount).toBe(0);
    expect(result.breakdown.errorCostAmount).toBe(0);
  });

  it("errorRate applies only to material+energy, upstream of the formula (baked into custo_base)", () => {
    const result = calculateQuoteBreakdown({
      request: baseRequest,
      machine: baseMachine,
      material: baseMaterial,
      settings: { ...baseSettings, errorRate: 10 },
      formula: null,
    });

    // printCost (materialCost+energyCost) = 10.24; 10.24 * 10% = 1.024 -> 1.02.
    // Depreciation/maintenance never carry the error multiplier.
    expect(result.breakdown.errorCostAmount).toBe(1.02);
    // baseCost = 10.24 + 1.024 + 6 + 0 = 17.264 -> 17.26
    expect(result.breakdown.baseCost).toBe(17.26);
    // finalPrice = 17.264 * 1.32 = 22.78848 -> 22.79 (1.32 = 1 + 0.02
    // taxas_percentuais [admin-only] + 0.30 margem_lucro)
    expect(result.breakdown.finalPrice).toBe(22.79);
    // Same baseSettings, errorRate 0 -> 21.44 (see the fixture above).
    expect(result.breakdown.finalPrice).toBeGreaterThan(21.44);
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
        isSystem: false,
      },
    });

    expect(result.breakdown.baseCost).toBe(16.24);
    expect(result.breakdown.finalPrice).toBe(32.48);
    expect(result.formula.source).toBe("DATABASE");
    expect(result.formula.id).toBe("formula-1");
    // administrativeFeeAmount is a best-effort display estimate (subtotal
    // * rate), computed uniformly regardless of which formula produced
    // finalPrice — see calculateAggregate's doc comment. cardFeeAmount is
    // NOT an estimate — it's 0 here because calculateQuoteBreakdown always
    // passes cardPayment: false (no "Pagamento Cartão" toggle outside the
    // quote form).
    expect(result.breakdown.cardFeeAmount).toBe(0);
    expect(result.breakdown.administrativeFeeAmount).toBe(0.32);
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
        isSystem: false,
      },
    });

    expect(result.formula.source).toBe("SYSTEM_FALLBACK");
    // Same math as the no-formula case above.
    expect(result.breakdown.finalPrice).toBe(21.44);
  });
});

describe("calculateAggregate — quote-level fix for the reported painting/finishing bug", () => {
  // Reported bug: increasing painting/finishing hours inflated EVERY mesa's
  // subtotal by the same delta, because the old code re-ran the whole-quote
  // formula independently per item using the full quote's hours each time.
  // The fix: post-processing cost is computed once, from aggregate raw
  // costs, and the formula runs exactly once per quote — never per item.
  const settings: ProductionSettings = {
    ...baseSettings,
    paintingHourRate: 10,
    finishingHourRate: 0,
  };

  const rawCost = computeRawItemCost(
    baseMachine,
    baseMaterial,
    new Prisma.Decimal(100),
    new Prisma.Decimal(2),
    settings.energyCostPerKwh,
  );

  const runAggregate = (rawCosts: RawItemCost[], paintingHours: number) =>
    calculateAggregate({
      rawCosts,
      settings,
      formula: null,
      paintingHours,
      finishingHours: 0,
      itemsCount: rawCosts.length,
      totalWeightGrams: new Prisma.Decimal(100 * rawCosts.length),
      totalPrintTimeHours: new Prisma.Decimal(2 * rawCosts.length),
      totalPowerConsumptionKw: baseMachine.powerConsumptionKw.mul(rawCosts.length),
      customVariables: settings.customVariables,
      // Not what this describe block is testing — kept off so the delta
      // math below stays about painting hours, not the card fee surcharge.
      cardPayment: false,
    });

  it("applies postProcessingCost once, identically, regardless of how many mesas are in the quote", () => {
    const oneItem = runAggregate([rawCost], 5);
    const twoItems = runAggregate([rawCost, rawCost], 5);

    // 10/h * 5h = 50 — the SAME whether there's 1 mesa or 2. Under the old
    // per-item-formula bug this would have been 50 for 1 item but doubled
    // (counted once per mesa inside each independent calculation) for 2.
    expect(oneItem.breakdown.postProcessingCost).toBe(50);
    expect(twoItems.breakdown.postProcessingCost).toBe(50);
  });

  it("raises finalPrice by the same amount per hour of painting, whether the quote has 1 or 2 mesas", () => {
    const oneItemBefore = runAggregate([rawCost], 5);
    const oneItemAfter = runAggregate([rawCost], 8);
    const twoItemsBefore = runAggregate([rawCost, rawCost], 5);
    const twoItemsAfter = runAggregate([rawCost, rawCost], 8);

    // Extra painting cost for +3h = 3 * 10 = 30, marked up by the formula's
    // (1 + taxas_percentuais + margem_lucro) factor = 1.32 (taxas_percentuais
    // is admin-only, 2%, since cardPayment is false here) -> 39.60, exactly
    // the same delta for a 1-mesa and a 2-mesa quote.
    const oneItemDelta = oneItemAfter.breakdown.finalPrice - oneItemBefore.breakdown.finalPrice;
    const twoItemsDelta =
      twoItemsAfter.breakdown.finalPrice - twoItemsBefore.breakdown.finalPrice;

    expect(oneItemDelta).toBeCloseTo(39.6, 2);
    expect(twoItemsDelta).toBeCloseTo(39.6, 2);
  });

  it("a mesa's own raw cost never changes when painting/finishing hours change", () => {
    // computeRawItemCost has no paintingHours/finishingHours parameter at
    // all — a mesa's displayed cost is structurally independent of them.
    const rawCostAgain = computeRawItemCost(
      baseMachine,
      baseMaterial,
      new Prisma.Decimal(100),
      new Prisma.Decimal(2),
      settings.energyCostPerKwh,
    );

    expect(rawCostAgain.rawCost.toString()).toBe(rawCost.rawCost.toString());
  });
});
