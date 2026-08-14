import type {
  CustomVariableMap,
  CustomVariableType,
  FormulaPreviewResponse,
  FormulaResource,
  FormulaVariable,
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
  SYSTEM_DEFAULT_FORMULA,
  SYSTEM_DEFAULT_FORMULA_CODE,
  validateFormulaExpression,
} from "./formula-engine";
import {
  customVariablesToRuntimeValues,
  settingsService,
} from "./settings.service";
import { auditLogService } from "./audit-log.service";

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

const systemVariableMeta: Record<
  (typeof INTERNAL_VARIABLES)[number],
  { description: string; type: CustomVariableType; previewValue: number }
> = {
  peso: { description: "Peso da mesa em gramas.", type: "FLOAT", previewValue: 100 },
  peso_gramas: {
    description: "Alias de peso em gramas.",
    type: "FLOAT",
    previewValue: 100,
  },
  tempo: {
    description: "Tempo estimado de impressao em horas.",
    type: "FLOAT",
    previewValue: 2,
  },
  tempo_horas: {
    description: "Alias de tempo em horas.",
    type: "FLOAT",
    previewValue: 2,
  },
  material_cost: {
    description: "Custo de material da mesa.",
    type: "FLOAT",
    previewValue: 10,
  },
  energia_total: {
    description: "Custo total de energia da mesa.",
    type: "FLOAT",
    previewValue: 0.24,
  },
  depreciacao_maquina: {
    description: "Custo de depreciacao da maquina para o tempo informado.",
    type: "FLOAT",
    previewValue: 6,
  },
  manutencao_maquina: {
    description: "Custo de manutencao da maquina para o tempo informado.",
    type: "FLOAT",
    previewValue: 3,
  },
  mao_obra: {
    description: "Custo de hora tecnica para o tempo informado.",
    type: "FLOAT",
    previewValue: 40,
  },
  custo_base: {
    description: "Soma de material, energia, depreciacao e mao de obra.",
    type: "FLOAT",
    previewValue: 56.24,
  },
  margem_lucro: {
    description: "Margem como taxa. No teste, digite 30 para simular 0.30.",
    type: "PERCENTAGE",
    previewValue: 30,
  },
  margem_lucro_percentual: {
    description: "Margem bruta em percentual. Ex: 30.",
    type: "FLOAT",
    previewValue: 30,
  },
  valor_hora_tecnica: {
    description: "Valor monetario da hora tecnica.",
    type: "FLOAT",
    previewValue: 20,
  },
  custo_kwh: {
    description: "Custo monetario do kWh.",
    type: "FLOAT",
    previewValue: 1,
  },
  taxa_cartao: {
    description: "Taxa de cartao. No teste, digite 5 para simular 0.05.",
    type: "PERCENTAGE",
    previewValue: 5,
  },
  taxa_administrativa: {
    description: "Taxa administrativa. No teste, digite 2 para simular 0.02.",
    type: "PERCENTAGE",
    previewValue: 2,
  },
  taxas_percentuais: {
    description: "Soma das taxas percentuais. No teste, digite 7 para simular 0.07.",
    type: "PERCENTAGE",
    previewValue: 7,
  },
  consumo_kw: {
    description: "Consumo da maquina em kW.",
    type: "FLOAT",
    previewValue: 0.12,
  },
  horas_pintura: {
    description: "Horas totais estimadas para pintura do orcamento.",
    type: "FLOAT",
    previewValue: 1,
  },
  valor_hora_pintura: {
    description: "Valor monetario cobrado por hora de pintura.",
    type: "FLOAT",
    previewValue: 35,
  },
  horas_acabamento: {
    description: "Horas totais estimadas para acabamento ou lixamento.",
    type: "FLOAT",
    previewValue: 1.5,
  },
  valor_hora_acabamento: {
    description: "Valor monetario cobrado por hora de acabamento.",
    type: "FLOAT",
    previewValue: 30,
  },
  quantidade_mesas: {
    description: "Quantidade de mesas/itens dentro do orcamento.",
    type: "INTEGER",
    previewValue: 2,
  },
  taxa_erro: {
    description: "Taxa ou multiplicador de erro configurado pela empresa.",
    type: "FLOAT",
    previewValue: 1.2,
  },
};

const toRuntimeValue = (value: number, type: CustomVariableType): number =>
  type === "PERCENTAGE" ? value / 100 : value;

const toFormulaResource = (formula: FormulaRow): FormulaResource => ({
  id: formula.id,
  code: formula.code,
  name: formula.name,
  expression: formula.expression,
  isActive: formula.isActive,
  isDefault: formula.isDefault,
  isSystem: formula.code === SYSTEM_DEFAULT_FORMULA_CODE,
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
  async list(companyId: string): Promise<FormulaResource[]> {
    await this.ensureDefaultFormula(companyId);
    const formulas = await prisma.formula.findMany({
      where: { companyId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return formulas.map(toFormulaResource);
  }

  async variables(companyId: string): Promise<FormulaVariable[]> {
    const settings = await settingsService.get(companyId);

    return [
      ...INTERNAL_VARIABLES.map((name) => ({
        name,
        label: name,
        description: systemVariableMeta[name].description,
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
        description:
          variable.type === "PERCENTAGE"
            ? "Variavel customizada percentual. O parser recebe valor / 100."
            : "Variavel customizada salva em custos fixos.",
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

    if (formula.isDefault || formula.code === SYSTEM_DEFAULT_FORMULA_CODE) {
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

  async getFormulaForCalculation(
    companyId: string,
    formulaId?: string,
  ): Promise<FormulaRow | null> {
    await this.ensureDefaultFormula(companyId);

    if (formulaId) {
      const formula = await prisma.formula.findFirst({
        where: { id: formulaId, companyId, isActive: true },
      });

      if (formula) {
        return formula;
      }

      throwFormulaForbidden();
    }

    return prisma.formula.findFirst({
      where: { companyId, isActive: true, isDefault: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  async ensureDefaultFormula(companyId: string): Promise<void> {
    const existingDefault = await prisma.formula.findFirst({
      where: { companyId, isDefault: true },
      select: { id: true, isActive: true },
    });

    if (existingDefault) {
      if (!existingDefault.isActive) {
        await prisma.formula.updateMany({
          where: { id: existingDefault.id, companyId },
          data: { isActive: true },
        });
      }

      return;
    }

    const existingSystem = await prisma.formula.findFirst({
      where: { companyId, code: SYSTEM_DEFAULT_FORMULA_CODE },
      select: { id: true },
    });

    if (existingSystem) {
      await prisma.formula.updateMany({
        where: { id: existingSystem.id, companyId },
        data: { isDefault: true, isActive: true },
      });
      return;
    }

    await prisma.formula.create({
      data: {
        companyId,
        code: SYSTEM_DEFAULT_FORMULA.code,
        name: SYSTEM_DEFAULT_FORMULA.name,
        expression: SYSTEM_DEFAULT_FORMULA.expression,
        coefficients: {},
        isActive: true,
        isDefault: true,
      },
    });
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
