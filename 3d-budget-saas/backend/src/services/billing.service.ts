import type {
  BillingOverview,
  BillingUsage,
  PlanEntitlements,
  SubscriptionPlan as SharedSubscriptionPlan,
  SubscriptionStatus as SharedSubscriptionStatus,
  UsageMetric,
} from "@3d-budget/shared";
import {
  Prisma,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";

export type UsageResource = "MACHINES" | "MATERIALS" | "MONTHLY_QUOTES";

export type PlanFeature = "CUSTOM_FORMULAS" | "PDF_EXPORT";

type CompanyUpdater = Pick<Prisma.TransactionClient, "company">;

interface PlanDefinition {
  maxMachinesAllowed: number;
  maxMaterialsAllowed: number;
  maxQuotesPerMonth: number;
  entitlements: PlanEntitlements;
}

const UNLIMITED = -1;

export const PLAN_DEFINITIONS: Record<SubscriptionPlan, PlanDefinition> = {
  [SubscriptionPlan.FREE]: {
    maxMachinesAllowed: 2,
    maxMaterialsAllowed: 3,
    maxQuotesPerMonth: 10,
    entitlements: {
      customFormulas: false,
      pdfExport: false,
    },
  },
  [SubscriptionPlan.PRO]: {
    maxMachinesAllowed: UNLIMITED,
    maxMaterialsAllowed: UNLIMITED,
    maxQuotesPerMonth: UNLIMITED,
    entitlements: {
      customFormulas: true,
      pdfExport: true,
    },
  },
  [SubscriptionPlan.ENTERPRISE]: {
    maxMachinesAllowed: UNLIMITED,
    maxMaterialsAllowed: UNLIMITED,
    maxQuotesPerMonth: UNLIMITED,
    entitlements: {
      customFormulas: true,
      pdfExport: true,
    },
  },
};

const toLimit = (value: number): number | null =>
  value < 0 ? null : value;

const toUsageMetric = (used: number, limit: number): UsageMetric => ({
  used,
  limit: toLimit(limit),
});

const currentMonthStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const subscriptionStatusLabel = (
  status: SubscriptionStatus,
): SharedSubscriptionStatus => status as SharedSubscriptionStatus;

const subscriptionPlanLabel = (
  plan: SubscriptionPlan,
): SharedSubscriptionPlan => plan as SharedSubscriptionPlan;

export class BillingService {
  async getOverview(companyId: string): Promise<BillingOverview> {
    const company = await this.getCompanyWithFreshUsage(companyId);
    const usage = await this.getUsage(companyId, {
      maxMachinesAllowed: company.maxMachinesAllowed,
      maxMaterialsAllowed: company.maxMaterialsAllowed,
      maxQuotesPerMonth: company.maxQuotesPerMonth,
      currentQuotesCount: company.currentQuotesCount,
      quoteUsagePeriodStart: company.quoteUsagePeriodStart,
    });

    return {
      companyId: company.id,
      companyName: company.name,
      planType: subscriptionPlanLabel(company.planType),
      subscriptionStatus: subscriptionStatusLabel(company.subscriptionStatus),
      stripeCustomerId: company.stripeCustomerId,
      usage,
      entitlements: PLAN_DEFINITIONS[company.planType].entitlements,
    };
  }

  async ensureWithinLimit(
    companyId: string,
    resource: UsageResource,
  ): Promise<void> {
    const company = await this.getCompanyWithFreshUsage(companyId);

    if (company.subscriptionStatus === SubscriptionStatus.PAST_DUE) {
      throw new AppError(
        "Subscription is past due. Update billing before creating new resources.",
        402,
        "SUBSCRIPTION_PAST_DUE",
      );
    }

    const usage = await this.getUsage(companyId, {
      maxMachinesAllowed: company.maxMachinesAllowed,
      maxMaterialsAllowed: company.maxMaterialsAllowed,
      maxQuotesPerMonth: company.maxQuotesPerMonth,
      currentQuotesCount: company.currentQuotesCount,
      quoteUsagePeriodStart: company.quoteUsagePeriodStart,
    });
    const metric =
      resource === "MACHINES"
        ? usage.machines
        : resource === "MATERIALS"
          ? usage.materials
          : usage.monthlyQuotes;

    if (metric.limit !== null && metric.used >= metric.limit) {
      throw new AppError(
        `Plan limit reached: ${metric.used} of ${metric.limit}.`,
        403,
        "PLAN_LIMIT_REACHED",
        { resource, used: metric.used, limit: metric.limit },
      );
    }
  }

  async ensureFeature(companyId: string, feature: PlanFeature): Promise<void> {
    const company = await this.getCompanyWithFreshUsage(companyId);

    if (company.subscriptionStatus === SubscriptionStatus.PAST_DUE) {
      throw new AppError(
        "Subscription is past due. Update billing to use this feature.",
        402,
        "SUBSCRIPTION_PAST_DUE",
      );
    }

    const entitlements = PLAN_DEFINITIONS[company.planType].entitlements;
    const allowed =
      feature === "CUSTOM_FORMULAS"
        ? entitlements.customFormulas
        : entitlements.pdfExport;

    if (!allowed) {
      throw new AppError(
        "This feature is not available on the current plan.",
        403,
        "PLAN_FEATURE_UNAVAILABLE",
        { feature, planType: company.planType },
      );
    }
  }

  async applyPlan(
    companyId: string,
    planType: SubscriptionPlan,
    subscriptionStatus: SubscriptionStatus = SubscriptionStatus.ACTIVE,
  ): Promise<BillingOverview> {
    const definition = PLAN_DEFINITIONS[planType];

    await prisma.company.update({
      where: { id: companyId },
      data: {
        planType,
        subscriptionStatus,
        maxMachinesAllowed: definition.maxMachinesAllowed,
        maxMaterialsAllowed: definition.maxMaterialsAllowed,
        maxQuotesPerMonth: definition.maxQuotesPerMonth,
      },
    });

    return this.getOverview(companyId);
  }

  async updateSubscription(
    companyId: string,
    input: {
      planType?: SubscriptionPlan;
      subscriptionStatus?: SubscriptionStatus;
    },
  ): Promise<BillingOverview> {
    const company = await this.getCompanyWithFreshUsage(companyId);
    const planType = input.planType ?? company.planType;
    const definition = PLAN_DEFINITIONS[planType];

    await prisma.company.update({
      where: { id: companyId },
      data: {
        planType: input.planType,
        subscriptionStatus: input.subscriptionStatus,
        maxMachinesAllowed: input.planType
          ? definition.maxMachinesAllowed
          : undefined,
        maxMaterialsAllowed: input.planType
          ? definition.maxMaterialsAllowed
          : undefined,
        maxQuotesPerMonth: input.planType
          ? definition.maxQuotesPerMonth
          : undefined,
      },
    });

    return this.getOverview(companyId);
  }

  async syncMonthlyQuoteUsage(companyId: string): Promise<number> {
    const monthStart = currentMonthStart();
    const currentQuotesCount = await prisma.quote.count({
      where: {
        companyId,
        createdAt: { gte: monthStart },
      },
    });

    await prisma.company.update({
      where: { id: companyId },
      data: {
        currentQuotesCount,
        quoteUsagePeriodStart: monthStart,
      },
    });

    return currentQuotesCount;
  }

  async incrementQuoteUsage(
    companyId: string,
    transaction: CompanyUpdater = prisma,
  ): Promise<void> {
    await transaction.company.update({
      where: { id: companyId },
      data: { currentQuotesCount: { increment: 1 } },
    });
  }

  async getUsageSnapshot(companyId: string): Promise<BillingUsage> {
    const company = await this.getCompanyWithFreshUsage(companyId);

    return this.getUsage(companyId, {
      maxMachinesAllowed: company.maxMachinesAllowed,
      maxMaterialsAllowed: company.maxMaterialsAllowed,
      maxQuotesPerMonth: company.maxQuotesPerMonth,
      currentQuotesCount: company.currentQuotesCount,
      quoteUsagePeriodStart: company.quoteUsagePeriodStart,
    });
  }

  private async getCompanyWithFreshUsage(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        planType: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        currentQuotesCount: true,
        quoteUsagePeriodStart: true,
        maxMachinesAllowed: true,
        maxMaterialsAllowed: true,
        maxQuotesPerMonth: true,
      },
    });

    if (!company) {
      throw new AppError("Company not found.", 404, "COMPANY_NOT_FOUND");
    }

    const syncedQuoteCount = await this.syncMonthlyQuoteUsage(companyId);

    return {
      ...company,
      currentQuotesCount: syncedQuoteCount,
      quoteUsagePeriodStart: currentMonthStart(),
    };
  }

  private async getUsage(
    companyId: string,
    limits: {
      maxMachinesAllowed: number;
      maxMaterialsAllowed: number;
      maxQuotesPerMonth: number;
      currentQuotesCount: number;
      quoteUsagePeriodStart: Date;
    },
  ): Promise<BillingUsage> {
    const [machineCount, materialCount] = await Promise.all([
      prisma.machine.count({ where: { companyId } }),
      prisma.material.count({ where: { companyId } }),
    ]);

    return {
      machines: toUsageMetric(machineCount, limits.maxMachinesAllowed),
      materials: toUsageMetric(materialCount, limits.maxMaterialsAllowed),
      monthlyQuotes: {
        ...toUsageMetric(limits.currentQuotesCount, limits.maxQuotesPerMonth),
        periodStart: limits.quoteUsagePeriodStart.toISOString(),
      },
    };
  }
}

export const billingService = new BillingService();
