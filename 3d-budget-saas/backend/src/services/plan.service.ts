import type { PlanEntitlements, PlanResource } from "@3d-budget/shared";
import type { Plan } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import type {
  PlanCreateInput,
  PlanUpdateInput,
} from "../validators/plan.validator";

interface PlanFeaturesJson {
  customFormulas?: boolean;
  pdfExport?: boolean;
}

// Plan.features is JSONB so the admin screen can add more feature flags
// later without a migration (same pattern as PricingSettings.extraFees).
// Only the two flags the rest of the app actually gates on are read here.
const toEntitlements = (value: Prisma.JsonValue): PlanEntitlements => {
  const json = (value ?? {}) as PlanFeaturesJson;
  return {
    customFormulas: Boolean(json.customFormulas),
    pdfExport: Boolean(json.pdfExport),
  };
};

export const toPlanResource = (plan: Plan): PlanResource => ({
  id: plan.id,
  code: plan.code,
  name: plan.name,
  description: plan.description,
  price: plan.price.toNumber(),
  priceUsd: plan.priceUsd ? plan.priceUsd.toNumber() : null,
  currency: plan.currency,
  billingCycle: plan.billingCycle,
  limits: {
    machines: plan.maxMachinesAllowed,
    materials: plan.maxMaterialsAllowed,
    monthlyQuotes: plan.maxQuotesPerMonth,
  },
  features: toEntitlements(plan.features),
  isActive: plan.isActive,
  isPublic: plan.isPublic,
  displayOrder: plan.displayOrder,
  createdAt: plan.createdAt.toISOString(),
  updatedAt: plan.updatedAt.toISOString(),
});

const toCreateData = (input: PlanCreateInput): Prisma.PlanCreateInput => ({
  code: input.code,
  name: input.name,
  description: input.description ?? null,
  price: new Prisma.Decimal(input.price),
  priceUsd: input.priceUsd != null ? new Prisma.Decimal(input.priceUsd) : null,
  currency: input.currency ?? "BRL",
  billingCycle: input.billingCycle,
  maxMachinesAllowed: input.limits.machines,
  maxMaterialsAllowed: input.limits.materials,
  maxQuotesPerMonth: input.limits.monthlyQuotes,
  features: input.features,
  isActive: input.isActive ?? true,
  isPublic: input.isPublic ?? true,
  displayOrder: input.displayOrder ?? 0,
});

const toUpdateData = (input: PlanUpdateInput): Prisma.PlanUpdateInput => ({
  code: input.code,
  name: input.name,
  description: input.description,
  price: input.price !== undefined ? new Prisma.Decimal(input.price) : undefined,
  priceUsd:
    input.priceUsd === undefined
      ? undefined
      : input.priceUsd === null
        ? null
        : new Prisma.Decimal(input.priceUsd),
  currency: input.currency,
  billingCycle: input.billingCycle,
  maxMachinesAllowed: input.limits?.machines,
  maxMaterialsAllowed: input.limits?.materials,
  maxQuotesPerMonth: input.limits?.monthlyQuotes,
  features: input.features,
  isActive: input.isActive,
  isPublic: input.isPublic,
  displayOrder: input.displayOrder,
});

const isUniqueCodeViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const isForeignKeyRestriction = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";

// The seed migration (20260813190000_asaas_plans_checkout_payment) always
// creates a plan with this code — new companies start here, and cancelling
// a paid subscription falls back to it. Single source of truth for both
// auth.service.ts (registration) and billing.controller.ts (cancel).
export const FREE_PLAN_CODE = "free";

export class PlanService {
  async getFreePlan(): Promise<Plan> {
    const plan = await prisma.plan.findUnique({
      where: { code: FREE_PLAN_CODE },
    });

    if (!plan) {
      throw new AppError(
        "Free plan is not configured. Contact support.",
        500,
        "FREE_PLAN_MISSING",
      );
    }

    return plan;
  }

  async listPublic(): Promise<PlanResource[]> {
    const plans = await prisma.plan.findMany({
      where: { isActive: true, isPublic: true },
      orderBy: { displayOrder: "asc" },
    });

    return plans.map(toPlanResource);
  }

  async listAll(): Promise<PlanResource[]> {
    const plans = await prisma.plan.findMany({
      orderBy: { displayOrder: "asc" },
    });

    return plans.map(toPlanResource);
  }

  async getById(id: string): Promise<Plan> {
    const plan = await prisma.plan.findUnique({ where: { id } });

    if (!plan) {
      throw new AppError("Plan not found.", 404, "PLAN_NOT_FOUND");
    }

    return plan;
  }

  async create(input: PlanCreateInput): Promise<PlanResource> {
    try {
      const plan = await prisma.plan.create({ data: toCreateData(input) });
      return toPlanResource(plan);
    } catch (error) {
      if (isUniqueCodeViolation(error)) {
        throw new AppError(
          "A plan with this code already exists.",
          409,
          "PLAN_CODE_TAKEN",
        );
      }

      throw error;
    }
  }

  async update(id: string, input: PlanUpdateInput): Promise<PlanResource> {
    await this.getById(id);

    try {
      const plan = await prisma.plan.update({
        where: { id },
        data: toUpdateData(input),
      });
      return toPlanResource(plan);
    } catch (error) {
      if (isUniqueCodeViolation(error)) {
        throw new AppError(
          "A plan with this code already exists.",
          409,
          "PLAN_CODE_TAKEN",
        );
      }

      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);

    try {
      await prisma.plan.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyRestriction(error)) {
        throw new AppError(
          "This plan is assigned to companies and cannot be deleted. Deactivate it instead.",
          409,
          "PLAN_IN_USE",
        );
      }

      throw error;
    }
  }
}

export const planService = new PlanService();
