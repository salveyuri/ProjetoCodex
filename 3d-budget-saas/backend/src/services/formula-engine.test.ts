import { describe, expect, it } from "vitest";
import {
  buildDryRunVariables,
  evaluateFormulaExpression,
  getAvailableVariableNames,
  INTERNAL_VARIABLES,
  normalizeFormulaExpression,
  SYSTEM_DEFAULT_FORMULA,
  validateFormulaExpression,
} from "./formula-engine";

describe("normalizeFormulaExpression", () => {
  it("strips the curly braces around variable tags", () => {
    expect(normalizeFormulaExpression("{custo_base} * 2")).toBe(
      "custo_base * 2",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeFormulaExpression("  custo_base  ")).toBe("custo_base");
  });
});

describe("getAvailableVariableNames", () => {
  it("includes every internal variable", () => {
    const names = getAvailableVariableNames();

    for (const variable of INTERNAL_VARIABLES) {
      expect(names).toContain(variable);
    }
  });

  it("includes custom variables with valid identifier names", () => {
    const names = getAvailableVariableNames({ frete_extra: 10 });

    expect(names).toContain("frete_extra");
  });

  it("silently drops custom variable keys that aren't valid identifiers", () => {
    const names = getAvailableVariableNames({ "not-an-identifier": 10 });

    expect(names).not.toContain("not-an-identifier");
  });
});

describe("validateFormulaExpression — security surface", () => {
  const available = getAvailableVariableNames();

  it("accepts a valid expression using known variables", () => {
    expect(() =>
      validateFormulaExpression("custo_base * (1 + margem_lucro)", available),
    ).not.toThrow();
  });

  it("rejects an empty expression", () => {
    expect(() => validateFormulaExpression("", available)).toThrow(
      /1 and 600 characters/,
    );
  });

  it("rejects an expression longer than 600 characters", () => {
    const tooLong = `custo_base ${"+ 1 ".repeat(200)}`;

    expect(() => validateFormulaExpression(tooLong, available)).toThrow(
      /1 and 600 characters/,
    );
  });

  it.each([
    ["semicolon", "custo_base; process.exit()"],
    ["square brackets", "custo_base[0]"],
    ["backtick", "custo_base * `1`"],
    ["arrow function", "custo_base => custo_base"],
  ])("rejects unsupported characters: %s", (_label, expression) => {
    expect(() => validateFormulaExpression(expression, available)).toThrow(
      /unsupported characters/,
    );
  });

  it.each([
    "process",
    "require",
    "eval",
    "Function",
    "constructor",
    "prototype",
    "__proto__",
    "console",
    "document",
    "window",
    "globalThis",
    "global",
    "fetch",
    "setTimeout",
    "import",
  ])("rejects the dangerous identifier %s", (identifier) => {
    expect(() =>
      validateFormulaExpression(`custo_base + ${identifier}`, available),
    ).toThrow(/blocked identifier/);
  });

  it("rejects dangerous identifiers regardless of casing", () => {
    expect(() =>
      validateFormulaExpression("custo_base + PROCESS", available),
    ).toThrow(/blocked identifier/);
  });

  it("rejects variables that aren't in the available list", () => {
    expect(() =>
      validateFormulaExpression("custo_base + variavel_inexistente", available),
    ).toThrow(/Unknown formula variables/);
  });

  it("rejects invalid mathematical syntax", () => {
    expect(() =>
      validateFormulaExpression("custo_base * (1 +", available),
    ).toThrow(/invalid mathematical syntax/);
  });

  it("normalizes {variavel} tags before validating", () => {
    expect(() =>
      validateFormulaExpression("{custo_base} * 2", available),
    ).not.toThrow();
  });
});

describe("evaluateFormulaExpression", () => {
  it("evaluates a valid expression with the given variables", () => {
    const result = evaluateFormulaExpression("custo_base * (1 + margem_lucro)", {
      custo_base: 100,
      margem_lucro: 0.3,
    });

    expect(result.price).toBeCloseTo(130);
  });

  it("rejects a result that is negative", () => {
    expect(() =>
      evaluateFormulaExpression("custo_base - custo_base - 1", {
        custo_base: 100,
      }),
    ).toThrow(/finite non-negative/);
  });

  it("rejects a result that is not finite", () => {
    expect(() =>
      evaluateFormulaExpression("custo_base / zero", {
        custo_base: 100,
        zero: 0,
      }),
    ).toThrow(/finite non-negative/);
  });
});

describe("buildDryRunVariables", () => {
  it("fills every internal variable with a default of 1", () => {
    const variables = buildDryRunVariables();

    for (const name of INTERNAL_VARIABLES) {
      expect(variables[name]).toBe(1);
    }
  });

  it("uses the provided value for custom variables instead of the default", () => {
    const variables = buildDryRunVariables({ frete_extra: 42 });

    expect(variables.frete_extra).toBe(42);
  });
});

describe("SYSTEM_DEFAULT_FORMULA", () => {
  it("is itself a valid, evaluable expression", () => {
    const available = getAvailableVariableNames();

    expect(() =>
      validateFormulaExpression(SYSTEM_DEFAULT_FORMULA.expression, available),
    ).not.toThrow();

    const result = evaluateFormulaExpression(
      SYSTEM_DEFAULT_FORMULA.expression,
      buildDryRunVariables(),
    );

    expect(result.price).toBeGreaterThan(0);
  });
});
