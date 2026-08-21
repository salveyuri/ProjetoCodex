import { Parser } from "expr-eval";
import { AppError } from "../middlewares/error-handler";

export const SYSTEM_DEFAULT_FORMULA_CODE = "system_default";

// custo_base already has taxa_erro folded in (applied only to material+
// energy, upstream — see CalculationService.ts's calculateAggregate).
// taxas_percentuais here is just taxa_administrativa — taxa_cartao is no
// longer bundled into it (2026-08-21): the card fee became an opt-in
// surcharge applied after this expression evaluates, tied to
// Quote.cardPayment (see calculateAggregate's cardFeeAmount).
// Post-processing (pintura/acabamento) is a separate additive term,
// applied once per quote — never per mesa.
export const SYSTEM_DEFAULT_FORMULA = {
  id: null,
  code: SYSTEM_DEFAULT_FORMULA_CODE,
  name: "Formula Padrao do Sistema",
  expression:
    "(custo_base + (valor_hora_acabamento * horas_acabamento) + (valor_hora_pintura * horas_pintura)) * (1 + taxas_percentuais + margem_lucro)",
};

export const INTERNAL_VARIABLES = [
  "peso",
  "tempo",
  "material_cost",
  "energia_total",
  "depreciacao_maquina",
  "manutencao_maquina",
  "custo_base",
  "margem_lucro",
  "custo_kwh",
  "taxa_cartao",
  "taxa_administrativa",
  "taxas_percentuais",
  "consumo_kw",
  "horas_pintura",
  "valor_hora_pintura",
  "horas_acabamento",
  "valor_hora_acabamento",
  "quantidade_mesas",
  "taxa_erro",
] as const;

const DANGEROUS_IDENTIFIERS = [
  "console",
  "constructor",
  "document",
  "eval",
  "fetch",
  "Function",
  "global",
  "globalThis",
  "import",
  "process",
  "prototype",
  "require",
  "setTimeout",
  "window",
  "__proto__",
];

const parser = new Parser({
  allowMemberAccess: false,
  operators: {
    assignment: false,
    comparison: false,
    conditional: false,
    fndef: false,
    in: false,
    logical: false,
    random: false,
  },
});

export type FormulaVariables = Record<string, number>;

export interface FormulaExecutionResult {
  price: number;
  expression: string;
  variables: FormulaVariables;
}

export const normalizeFormulaExpression = (expression: string): string =>
  expression
    .trim()
    .replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, "$1");

export const getAvailableVariableNames = (
  customVariables: FormulaVariables = {},
): string[] => [
  ...INTERNAL_VARIABLES,
  ...Object.keys(customVariables).filter((key) =>
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key),
  ),
];

const allowedFormulaCharacters = /^[0-9a-zA-Z_+\-*/().\s]+$/;
const identifierPattern = /[a-zA-Z_][a-zA-Z0-9_]*/g;

const assertSafeExpressionText = (
  expression: string,
  availableVariables: string[],
): void => {
  if (expression.length === 0 || expression.length > 600) {
    throw new AppError(
      "Formula expression must have between 1 and 600 characters.",
      400,
      "FORMULA_INVALID_EXPRESSION",
    );
  }

  if (!allowedFormulaCharacters.test(expression) || expression.includes("=>")) {
    throw new AppError(
      "Formula expression contains unsupported characters.",
      400,
      "FORMULA_UNSAFE_EXPRESSION",
    );
  }

  const identifiers = expression.match(identifierPattern) ?? [];
  const availableVariableSet = new Set(availableVariables);
  const dangerousIdentifierSet = new Set(
    DANGEROUS_IDENTIFIERS.map((identifier) => identifier.toLowerCase()),
  );
  const hasDangerousIdentifier = identifiers.some((identifier) =>
    dangerousIdentifierSet.has(identifier.toLowerCase()),
  );

  if (hasDangerousIdentifier) {
    throw new AppError(
      "Formula expression contains a blocked identifier.",
      400,
      "FORMULA_UNSAFE_IDENTIFIER",
    );
  }

  const unknownTextIdentifiers = identifiers.filter(
    (identifier) => !availableVariableSet.has(identifier),
  );

  if (unknownTextIdentifiers.length > 0) {
    throw new AppError(
      `Unknown formula variables: ${unknownTextIdentifiers.join(", ")}.`,
      400,
      "FORMULA_UNKNOWN_VARIABLE",
      { unknownVariables: unknownTextIdentifiers, availableVariables },
    );
  }
};

export const validateFormulaExpression = (
  expression: string,
  availableVariables: string[],
): string => {
  const normalizedExpression = normalizeFormulaExpression(expression);
  assertSafeExpressionText(normalizedExpression, availableVariables);

  let parsedExpression;

  try {
    parsedExpression = parser.parse(normalizedExpression);
  } catch (error) {
    throw new AppError(
      "Formula expression has invalid mathematical syntax.",
      400,
      "FORMULA_SYNTAX_ERROR",
      { reason: error instanceof Error ? error.message : "Unknown parser error." },
    );
  }

  const usedVariables = parsedExpression.variables({ withMembers: false });
  const unknownVariables = usedVariables.filter(
    (variable) => !availableVariables.includes(variable),
  );

  if (unknownVariables.length > 0) {
    throw new AppError(
      `Unknown formula variables: ${unknownVariables.join(", ")}.`,
      400,
      "FORMULA_UNKNOWN_VARIABLE",
      { unknownVariables, availableVariables },
    );
  }

  return normalizedExpression;
};

export const evaluateFormulaExpression = (
  expression: string,
  variables: FormulaVariables,
): FormulaExecutionResult => {
  const availableVariables = getAvailableVariableNames(variables);
  const normalizedExpression = validateFormulaExpression(
    expression,
    availableVariables,
  );
  const parsedExpression = parser.parse(normalizedExpression);
  let result: number;

  try {
    result = Number(parsedExpression.evaluate(variables));
  } catch (error) {
    throw new AppError(
      "Formula could not be evaluated with the provided variables.",
      400,
      "FORMULA_EVALUATION_ERROR",
      { reason: error instanceof Error ? error.message : "Unknown evaluation error." },
    );
  }

  if (!Number.isFinite(result) || result < 0) {
    throw new AppError(
      "Formula result must be a finite non-negative number.",
      400,
      "FORMULA_INVALID_RESULT",
    );
  }

  return {
    price: result,
    expression: normalizedExpression,
    variables,
  };
};

export const buildDryRunVariables = (
  customVariables: FormulaVariables = {},
): FormulaVariables =>
  Object.fromEntries(
    getAvailableVariableNames(customVariables).map((variable) => [
      variable,
      customVariables[variable] ?? 1,
    ]),
  );
