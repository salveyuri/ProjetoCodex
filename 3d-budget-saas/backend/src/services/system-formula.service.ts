import type { SystemFormulaResource } from "@3d-budget/shared";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import {
  buildDryRunVariables,
  evaluateFormulaExpression,
  INTERNAL_VARIABLES,
  validateFormulaExpression,
} from "./formula-engine";
import type {
  SystemFormulaInput,
  SystemFormulaUpdateInput,
} from "../validators/system-formula.validator";

type SystemFormulaRow = {
  id: string;
  code: string;
  name: string;
  expression: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "formula";

const createCode = async (name: string): Promise<string> => {
  const baseCode = toSlug(name);
  let code = baseCode;
  let suffix = 1;

  while (
    await prisma.systemFormula.findFirst({ where: { code }, select: { id: true } })
  ) {
    suffix += 1;
    code = `${baseCode}_${suffix}`;
  }

  return code;
};

export const toSystemFormulaResource = (
  formula: SystemFormulaRow,
): SystemFormulaResource => ({
  id: formula.id,
  code: formula.code,
  name: formula.name,
  expression: formula.expression,
  isActive: formula.isActive,
  isDefault: formula.isDefault,
  createdAt: formula.createdAt.toISOString(),
  updatedAt: formula.updatedAt.toISOString(),
});

// "Not found" (not "Access denied.") on purpose - this is a global,
// admin-only resource with no per-company ownership to hide the existence
// of, unlike company Formula's throwFormulaForbidden().
const throwNotFound = (): never => {
  throw new AppError("System formula not found.", 404, "SYSTEM_FORMULA_NOT_FOUND");
};

export class SystemFormulaService {
  async listAll(): Promise<SystemFormulaResource[]> {
    const formulas = await prisma.systemFormula.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return formulas.map(toSystemFormulaResource);
  }

  /** Active rows in their raw DB shape - consumed by the company-facing
   * formula list and the calculation fallback chain, not the admin screen. */
  async listActive(): Promise<SystemFormulaRow[]> {
    return prisma.systemFormula.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async getActiveById(id: string): Promise<SystemFormulaRow | null> {
    return prisma.systemFormula.findFirst({ where: { id, isActive: true } });
  }

  async getDefault(): Promise<SystemFormulaRow | null> {
    return prisma.systemFormula.findFirst({
      where: { isActive: true, isDefault: true },
    });
  }

  async getById(id: string): Promise<SystemFormulaRow> {
    const formula = await prisma.systemFormula.findUnique({ where: { id } });

    if (formula === null) {
      throwNotFound();
    }

    return formula as SystemFormulaRow;
  }

  // System formulas can only reference INTERNAL_VARIABLES - unlike a
  // company formula, there's no companyId to look up custom variables for.
  async create(input: SystemFormulaInput): Promise<SystemFormulaResource> {
    const expression = validateFormulaExpression(input.expression, [
      ...INTERNAL_VARIABLES,
    ]);
    evaluateFormulaExpression(expression, buildDryRunVariables());
    const code = await createCode(input.name);

    const formula = await prisma.$transaction(async (transaction) => {
      if (input.isDefault) {
        await transaction.systemFormula.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      return transaction.systemFormula.create({
        data: {
          code,
          name: input.name,
          expression,
          isActive: input.isActive,
          isDefault: input.isDefault,
        },
      });
    });

    return toSystemFormulaResource(formula);
  }

  async update(
    id: string,
    input: SystemFormulaUpdateInput,
  ): Promise<SystemFormulaResource> {
    const existing = await this.getById(id);
    const expression =
      input.expression !== undefined
        ? validateFormulaExpression(input.expression, [...INTERNAL_VARIABLES])
        : existing.expression;

    evaluateFormulaExpression(expression, buildDryRunVariables());

    const formula = await prisma.$transaction(async (transaction) => {
      if (input.isDefault) {
        await transaction.systemFormula.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return transaction.systemFormula.update({
        where: { id },
        data: {
          name: input.name,
          expression,
          isActive: input.isActive,
          isDefault: input.isDefault,
        },
      });
    });

    return toSystemFormulaResource(formula);
  }

  // A default must always exist so getFormulaForCalculation() always has a
  // global fallback to reach for - block deleting it; the admin has to
  // promote another one first (same "can't delete the default" rule
  // company formulas already follow).
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);

    if (existing.isDefault) {
      throw new AppError(
        "Default system formula cannot be deleted. Make another one default first.",
        409,
        "SYSTEM_FORMULA_DEFAULT_DELETE_BLOCKED",
      );
    }

    await prisma.systemFormula.delete({ where: { id } });
  }
}

export const systemFormulaService = new SystemFormulaService();
