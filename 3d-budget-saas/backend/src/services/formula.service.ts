import type {
  CustomVariableMap,
  CustomVariableType,
  FormulaPreviewResponse,
  FormulaResource,
  FormulaVariable,
  SupportedLanguage,
} from "@3d-budget/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import type {
  FormulaInput,
  FormulaPreviewInput,
  FormulaUpdateInput,
} from "../validators/formula.validator";
import {
  buildDryRunVariables,
  evaluateFormulaExpression,
  getAvailableVariableNames,
  type FormulaVariables,
  INTERNAL_VARIABLES,
  validateFormulaExpression,
} from "./formula-engine";
import {
  customVariablesToRuntimeValues,
  settingsService,
} from "./settings.service";
import { auditLogService } from "./audit-log.service";
import { systemFormulaService } from "./system-formula.service";

type FormulaRow = {
  id: string;
  code: string;
  name: string;
  expression: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Descriptions come from the backend (unlike the rest of the UI, which is
// translated client-side), so they need their own pt-BR/en pair instead of
// a plain string — see Contextos/Decisoes.md (2026-08-20).
const systemVariableMeta: Record<
  (typeof INTERNAL_VARIABLES)[number],
  {
    description: Record<SupportedLanguage, string>;
    type: CustomVariableType;
    previewValue: number;
  }
> = {
  peso: {
    description: {
      "pt-BR": "Soma do peso de todas as mesas do orcamento, em gramas.",
      en: "Sum of the weight of every table in the quote, in grams.",
      es: "Suma del peso de todas las mesas del presupuesto, en gramos.",
    },
    type: "FLOAT",
    previewValue: 100,
  },
  tempo: {
    description: {
      "pt-BR": "Soma do tempo de impressao de todas as mesas, em horas.",
      en: "Sum of the print time of every table, in hours.",
      es: "Suma del tiempo de impresion de todas las mesas, en horas.",
    },
    type: "FLOAT",
    previewValue: 2,
  },
  material_cost: {
    description: {
      "pt-BR": "Custo total de material somado de todas as mesas do orcamento.",
      en: "Total material cost, summed across every table in the quote.",
      es: "Costo total de material, sumado de todas las mesas del presupuesto.",
    },
    type: "FLOAT",
    previewValue: 10,
  },
  energia_total: {
    description: {
      "pt-BR": "Custo total de energia somado de todas as mesas do orcamento.",
      en: "Total energy cost, summed across every table in the quote.",
      es: "Costo total de energia, sumado de todas las mesas del presupuesto.",
    },
    type: "FLOAT",
    previewValue: 0.24,
  },
  depreciacao_maquina: {
    description: {
      "pt-BR": "Custo de depreciacao somado de todas as mesas do orcamento.",
      en: "Depreciation cost, summed across every table in the quote.",
      es: "Costo de depreciacion, sumado de todas las mesas del presupuesto.",
    },
    type: "FLOAT",
    previewValue: 6,
  },
  manutencao_maquina: {
    description: {
      "pt-BR": "Custo de manutencao somado de todas as mesas do orcamento.",
      en: "Maintenance cost, summed across every table in the quote.",
      es: "Costo de mantenimiento, sumado de todas las mesas del presupuesto.",
    },
    type: "FLOAT",
    previewValue: 3,
  },
  custo_base: {
    description: {
      "pt-BR":
        "Custo total do orcamento: material + energia (com taxa de erro aplicada) + depreciacao + manutencao, somados de todas as mesas. Calculado uma unica vez pro orcamento inteiro, nao por mesa.",
      en: "Total quote cost: material + energy (with the error rate applied) + depreciation + maintenance, summed across every table. Calculated once for the whole quote, not per table.",
      es: "Costo total del presupuesto: material + energia (con la tasa de error aplicada) + depreciacion + mantenimiento, sumados de todas las mesas. Calculado una unica vez para todo el presupuesto, no por mesa.",
    },
    type: "FLOAT",
    previewValue: 19.24,
  },
  margem_lucro: {
    description: {
      "pt-BR": "Margem como taxa. No teste, digite 30 para simular 0.30.",
      en: "Margin as a rate. In the test, type 30 to simulate 0.30.",
      es: "Margen como tasa. En la prueba, escriba 30 para simular 0.30.",
    },
    type: "PERCENTAGE",
    previewValue: 30,
  },
  custo_kwh: {
    description: {
      "pt-BR": "Custo monetario do kWh.",
      en: "Monetary cost per kWh.",
      es: "Costo monetario del kWh.",
    },
    type: "FLOAT",
    previewValue: 1,
  },
  taxa_cartao: {
    description: {
      "pt-BR":
        "Taxa de cartao configurada em Configuracoes. Nao entra mais em taxas_percentuais - e aplicada automaticamente por cima do preco quando o orcamento marca 'Pagamento Cartao'. So referencie esta variavel direto numa formula customizada se quiser aplica-la sempre, independente dessa marcacao. No teste, digite 5 para simular 0.05.",
      en: "Card fee rate from Settings. No longer part of taxas_percentuais - it's applied automatically on top of the price when the quote has 'Card Payment' checked. Only reference this variable directly in a custom formula if you want it always applied, regardless of that checkbox. In the test, type 5 to simulate 0.05.",
      es: "Tasa de tarjeta configurada en Configuracion. Ya no forma parte de taxas_percentuales - se aplica automaticamente sobre el precio cuando el presupuesto marca 'Pago con Tarjeta'. Solo referencie esta variable directo en una formula personalizada si quiere aplicarla siempre, sin depender de esa marca. En la prueba, escriba 5 para simular 0.05.",
    },
    type: "PERCENTAGE",
    previewValue: 5,
  },
  taxa_administrativa: {
    description: {
      "pt-BR": "Taxa administrativa. No teste, digite 2 para simular 0.02.",
      en: "Administrative fee rate. In the test, type 2 to simulate 0.02.",
      es: "Tasa administrativa. En la prueba, escriba 2 para simular 0.02.",
    },
    type: "PERCENTAGE",
    previewValue: 2,
  },
  taxas_percentuais: {
    description: {
      "pt-BR":
        "Hoje e igual a taxa_administrativa (taxa de cartao saiu daqui - ver taxa_cartao). Nao inclui taxa de erro (essa ja entra dentro de custo_base). No teste, digite 2 para simular 0.02.",
      en: "Today it equals taxa_administrativa (card fee moved out of this bundle - see taxa_cartao). Does not include the error rate (that's already inside custo_base). In the test, type 2 to simulate 0.02.",
      es: "Hoy equivale a taxa_administrativa (la tasa de tarjeta salio de aqui - vea taxa_cartao). No incluye la tasa de error (esa ya esta dentro de custo_base). En la prueba, escriba 2 para simular 0.02.",
    },
    type: "PERCENTAGE",
    previewValue: 2,
  },
  consumo_kw: {
    description: {
      "pt-BR": "Soma do consumo (kW) das maquinas de todas as mesas do orcamento.",
      en: "Sum of the machines' power consumption (kW) across every table in the quote.",
      es: "Suma del consumo (kW) de las maquinas de todas las mesas del presupuesto.",
    },
    type: "FLOAT",
    previewValue: 0.12,
  },
  horas_pintura: {
    description: {
      "pt-BR": "Horas totais estimadas para pintura do orcamento inteiro (nao por mesa).",
      en: "Total estimated painting hours for the whole quote (not per table).",
      es: "Horas totales estimadas para pintura de todo el presupuesto (no por mesa).",
    },
    type: "FLOAT",
    previewValue: 1,
  },
  valor_hora_pintura: {
    description: {
      "pt-BR": "Valor monetario cobrado por hora de pintura.",
      en: "Monetary rate charged per hour of painting.",
      es: "Valor monetario cobrado por hora de pintura.",
    },
    type: "FLOAT",
    previewValue: 35,
  },
  horas_acabamento: {
    description: {
      "pt-BR":
        "Horas totais estimadas para acabamento ou lixamento do orcamento inteiro (nao por mesa).",
      en: "Total estimated finishing/sanding hours for the whole quote (not per table).",
      es: "Horas totales estimadas para acabado o lijado de todo el presupuesto (no por mesa).",
    },
    type: "FLOAT",
    previewValue: 1.5,
  },
  valor_hora_acabamento: {
    description: {
      "pt-BR": "Valor monetario cobrado por hora de acabamento.",
      en: "Monetary rate charged per hour of finishing.",
      es: "Valor monetario cobrado por hora de acabado.",
    },
    type: "FLOAT",
    previewValue: 30,
  },
  quantidade_mesas: {
    description: {
      "pt-BR": "Quantidade de mesas/itens dentro do orcamento.",
      en: "Number of tables/items in the quote.",
      es: "Cantidad de mesas/items dentro del presupuesto.",
    },
    type: "INTEGER",
    previewValue: 2,
  },
  taxa_erro: {
    description: {
      "pt-BR":
        "Taxa de erro/desperdicio, aplicada so sobre material+energia (nunca sobre depreciacao/manutencao) e ja embutida em custo_base. Se nao preenchida (0), nao afeta o calculo. No teste, digite 3 para simular 0.03.",
      en: "Error/waste rate, applied only to material+energy (never to depreciation/maintenance) and already baked into custo_base. If unset (0), it doesn't affect the calculation. In the test, type 3 to simulate 0.03.",
      es: "Tasa de error/desperdicio, aplicada solo sobre material+energia (nunca sobre depreciacion/mantenimiento) y ya incluida en custo_base. Si no esta definida (0), no afecta el calculo. En la prueba, escriba 3 para simular 0.03.",
    },
    type: "PERCENTAGE",
    previewValue: 3,
  },
};

const customVariableDescriptions: Record<CustomVariableType, Record<SupportedLanguage, string>> = {
  PERCENTAGE: {
    "pt-BR": "Variavel customizada percentual. O parser recebe valor / 100.",
    en: "Custom percentage variable. The parser receives value / 100.",
    es: "Variable personalizada porcentual. El parser recibe valor / 100.",
  },
  FLOAT: {
    "pt-BR": "Variavel customizada salva em custos fixos.",
    en: "Custom variable saved under fixed costs.",
    es: "Variable personalizada guardada en costos fijos.",
  },
  INTEGER: {
    "pt-BR": "Variavel customizada salva em custos fixos.",
    en: "Custom variable saved under fixed costs.",
    es: "Variable personalizada guardada en costos fijos.",
  },
};

const toRuntimeValue = (value: number, type: CustomVariableType): number =>
  type === "PERCENTAGE" ? value / 100 : value;

const toFormulaResource = (
  formula: FormulaRow,
  isSystem = false,
): FormulaResource => ({
  id: formula.id,
  code: formula.code,
  name: formula.name,
  expression: formula.expression,
  isActive: formula.isActive,
  isDefault: formula.isDefault,
  isSystem,
  createdAt: formula.createdAt.toISOString(),
  updatedAt: formula.updatedAt.toISOString(),
});

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "formula";

const createCode = async (companyId: string, name: string): Promise<string> => {
  const baseCode = toSlug(name);
  let code = baseCode;
  let suffix = 1;

  while (
    await prisma.formula.findFirst({
      where: { companyId, code },
      select: { id: true },
    })
  ) {
    suffix += 1;
    code = `${baseCode}_${suffix}`;
  }

  return code;
};

// "Access denied." on purpose: doesn't confirm a company-ownership check
// is what rejected this — see Contextos/Conhecimento.md.
const throwFormulaForbidden = (): never => {
  throw new AppError("Access denied.", 403, "FORMULA_FORBIDDEN");
};

export class FormulaService {
  // Merges the company's own (editable) formulas with every active global
  // system formula (read-only — see Contextos/Decisoes.md, 2026-08-17) so
  // the "Biblioteca" list shows both.
  async list(companyId: string): Promise<FormulaResource[]> {
    const [companyFormulas, systemFormulas] = await Promise.all([
      prisma.formula.findMany({
        where: { companyId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      }),
      systemFormulaService.listActive(),
    ]);

    return [
      ...companyFormulas.map((formula) => toFormulaResource(formula, false)),
      ...systemFormulas.map((formula) => toFormulaResource(formula, true)),
    ];
  }

  async variables(
    companyId: string,
    language: SupportedLanguage,
  ): Promise<FormulaVariable[]> {
    const settings = await settingsService.get(companyId);

    return [
      ...INTERNAL_VARIABLES.map((name) => ({
        name,
        label: name,
        description: systemVariableMeta[name].description[language],
        source: "SYSTEM" as const,
        type: systemVariableMeta[name].type,
        value: systemVariableMeta[name].previewValue,
        runtimeValue: toRuntimeValue(
          systemVariableMeta[name].previewValue,
          systemVariableMeta[name].type,
        ),
      })),
      ...Object.entries(settings.customVariables).map(([name, variable]) => ({
        name,
        label: name,
        description: customVariableDescriptions[variable.type][language],
        source: "CUSTOM" as const,
        type: variable.type,
        value: variable.value,
        runtimeValue: toRuntimeValue(variable.value, variable.type),
      })),
    ];
  }

  async preview(
    companyId: string,
    input: FormulaPreviewInput,
  ): Promise<FormulaPreviewResponse> {
    const settings = await settingsService.get(companyId);
    const runtimeCustomVariables = customVariablesToRuntimeValues(
      settings.customVariables,
    );
    const availableVariables = getAvailableVariableNames(runtimeCustomVariables);
    const expression = validateFormulaExpression(
      input.expression,
      availableVariables,
    );
    const variables = this.buildPreviewVariables(
      runtimeCustomVariables,
      settings.customVariables,
      input.variables ?? {},
    );
    const result = evaluateFormulaExpression(expression, variables);

    return {
      expression: result.expression,
      result: Math.round(result.price * 1_000_000) / 1_000_000,
      variables: result.variables,
    };
  }

  async create(
    companyId: string,
    input: FormulaInput,
    actorUserId?: string,
  ): Promise<FormulaResource> {
    const settings = await settingsService.get(companyId);
    const runtimeCustomVariables = customVariablesToRuntimeValues(
      settings.customVariables,
    );
    const expression = validateFormulaExpression(
      input.expression,
      getAvailableVariableNames(runtimeCustomVariables),
    );
    evaluateFormulaExpression(
      expression,
      buildDryRunVariables(runtimeCustomVariables),
    );
    const code = await createCode(companyId, input.name);

    let formula: FormulaRow;

    try {
      formula = await prisma.$transaction(async (transaction) => {
        if (input.isDefault) {
          await transaction.formula.updateMany({
            where: { companyId },
            data: { isDefault: false },
          });
        }

        return transaction.formula.create({
          data: {
            companyId,
            code,
            name: input.name,
            expression,
            coefficients: {},
            isActive: input.isActive,
            isDefault: input.isDefault,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AppError(
          "A formula with this name was just created by another request. Try again.",
          409,
          "FORMULA_CODE_CONFLICT",
        );
      }

      throw error;
    }

    await auditLogService.record({
      action: input.isDefault ? "FORMULA_CREATED_AS_DEFAULT" : "FORMULA_CREATED",
      entityType: "Formula",
      entityId: formula.id,
      actorUserId,
      companyId,
      after: {
        id: formula.id,
        name: formula.name,
        expression: formula.expression,
        isActive: formula.isActive,
        isDefault: formula.isDefault,
      },
    });

    return toFormulaResource(formula);
  }

  async update(
    companyId: string,
    formulaId: string,
    input: FormulaUpdateInput,
    actorUserId?: string,
  ): Promise<FormulaResource> {
    const existing = await this.findOwnedFormula(companyId, formulaId);
    const settings = await settingsService.get(companyId);
    const runtimeCustomVariables = customVariablesToRuntimeValues(
      settings.customVariables,
    );
    const expression =
      input.expression !== undefined
        ? validateFormulaExpression(
            input.expression,
            getAvailableVariableNames(runtimeCustomVariables),
          )
        : existing.expression;

    evaluateFormulaExpression(
      expression,
      buildDryRunVariables(runtimeCustomVariables),
    );

    const formula = await prisma.$transaction(async (transaction) => {
      if (input.isDefault) {
        await transaction.formula.updateMany({
          where: { companyId },
          data: { isDefault: false },
        });
      }

      const updateResult = await transaction.formula.updateMany({
        where: { id: formulaId, companyId },
        data: {
          name: input.name,
          expression,
          isActive: input.isActive,
          isDefault: input.isDefault,
        },
      });

      if (updateResult.count !== 1) {
        throwFormulaForbidden();
      }

      const updated = await transaction.formula.findFirst({
        where: { id: formulaId, companyId },
      });

      if (updated === null) {
        throwFormulaForbidden();
      }

      return updated as FormulaRow;
    });

    await auditLogService.record({
      action:
        !existing.isDefault && formula.isDefault
          ? "FORMULA_DEFAULT_CHANGED"
          : "FORMULA_UPDATED",
      entityType: "Formula",
      entityId: formula.id,
      actorUserId,
      companyId,
      before: {
        id: existing.id,
        name: existing.name,
        expression: existing.expression,
        isActive: existing.isActive,
        isDefault: existing.isDefault,
      },
      after: {
        id: formula.id,
        name: formula.name,
        expression: formula.expression,
        isActive: formula.isActive,
        isDefault: formula.isDefault,
      },
      metadata: { changedFields: Object.keys(input) },
    });

    return toFormulaResource(formula);
  }

  async delete(
    companyId: string,
    formulaId: string,
    actorUserId?: string,
  ): Promise<void> {
    const formula = await this.findOwnedFormula(companyId, formulaId);

    if (formula.isDefault) {
      throw new AppError(
        "Default formula cannot be deleted.",
        409,
        "FORMULA_DEFAULT_DELETE_BLOCKED",
      );
    }

    const result = await prisma.formula.deleteMany({
      where: { id: formulaId, companyId },
    });

    if (result.count !== 1) {
      throwFormulaForbidden();
    }

    await auditLogService.record({
      action: "FORMULA_DELETED",
      entityType: "Formula",
      entityId: formulaId,
      actorUserId,
      companyId,
      before: {
        id: formula.id,
        name: formula.name,
        expression: formula.expression,
        isActive: formula.isActive,
        isDefault: formula.isDefault,
      },
    });
  }

  /**
   * Resolves the formula to use for a calculation. Fallback chain:
   * explicit formulaId → company's own formulas, then global system
   * formulas (403 if it matches neither) → no formulaId → the company's
   * own isDefault formula, then the global default → `null` (the caller,
   * calculateQuoteBreakdown, falls back to the hardcoded SYSTEM_DEFAULT_
   * FORMULA constant — a bootstrap safety net for the theoretical case
   * where the system_formulas table has no rows at all).
   *
   * A resolved system formula carries `isSystem: true` and its real id
   * from `system_formulas` (not `formulas`) — the caller (quote.service.ts)
   * uses that flag to persist it as `Quote.systemFormulaId` instead of
   * `Quote.formulaId`, so which system formula was picked survives a
   * reload (see Contextos/Decisoes.md, 2026-08-20 - previously this
   * returned `id: null` here and the choice was silently lost).
   */
  async getFormulaForCalculation(
    companyId: string,
    formulaId?: string,
  ): Promise<{
    id: string | null;
    name: string;
    expression: string;
    isSystem: boolean;
  } | null> {
    if (formulaId) {
      const companyFormula = await prisma.formula.findFirst({
        where: { id: formulaId, companyId, isActive: true },
      });

      if (companyFormula) {
        return { ...companyFormula, isSystem: false };
      }

      const systemFormula = await systemFormulaService.getActiveById(formulaId);

      if (systemFormula) {
        return {
          id: systemFormula.id,
          name: systemFormula.name,
          expression: systemFormula.expression,
          isSystem: true,
        };
      }

      throwFormulaForbidden();
    }

    const companyDefault = await prisma.formula.findFirst({
      where: { companyId, isActive: true, isDefault: true },
      orderBy: { updatedAt: "desc" },
    });

    if (companyDefault) {
      return { ...companyDefault, isSystem: false };
    }

    const systemDefault = await systemFormulaService.getDefault();

    if (systemDefault) {
      return {
        id: systemDefault.id,
        name: systemDefault.name,
        expression: systemDefault.expression,
        isSystem: true,
      };
    }

    return null;
  }

  private async findOwnedFormula(
    companyId: string,
    formulaId: string,
  ): Promise<FormulaRow> {
    const formula = await prisma.formula.findFirst({
      where: { id: formulaId, companyId },
    });

    if (formula === null) {
      throwFormulaForbidden();
    }

    return formula as FormulaRow;
  }

  private buildPreviewVariables(
    runtimeCustomVariables: FormulaVariables,
    customVariables: CustomVariableMap,
    overrides: Record<string, number>,
  ): FormulaVariables {
    const variables = buildDryRunVariables(runtimeCustomVariables);

    for (const name of INTERNAL_VARIABLES) {
      const meta = systemVariableMeta[name];
      variables[name] = toRuntimeValue(meta.previewValue, meta.type);
    }

    for (const [name, rawValue] of Object.entries(overrides)) {
      if (name in systemVariableMeta) {
        const meta = systemVariableMeta[name as (typeof INTERNAL_VARIABLES)[number]];
        variables[name] = toRuntimeValue(rawValue, meta.type);
        continue;
      }

      const customVariable = customVariables[name];

      if (customVariable) {
        variables[name] = toRuntimeValue(rawValue, customVariable.type);
      }
    }

    return variables;
  }
}

export const formulaService = new FormulaService();
