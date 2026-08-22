import type {
  BillingOverview,
  BillingUsage,
  SubscriptionStatus as SharedSubscriptionStatus,
  UsageMetric,
} from "@3d-budget/shared";
import type { Plan, Prisma } from "@prisma/client";
import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { toPlanResource } from "./plan.service";

export type UsageResource = "MACHINES" | "MATERIALS" | "MONTHLY_QUOTES";

export type PlanFeature = "CUSTOM_FORMULAS" | "PDF_EXPORT";

type CompanyUpdater = Pick<Prisma.TransactionClient, "company">;

interface CompanyWithPlan {
  id: string;
  name: string;
  country: string;
  defaultCurrency: string;
  subscriptionStatus: SubscriptionStatus;
  asaasCustomerId: string | null;
  currentQuotesCount: number;
  quoteUsagePeriodStart: Date;
  plan: Plan;
  coupon: { code: string; discountPercent: Prisma.Decimal } | null;
}

const toUsageMetric = (used: number, limit: number | null): UsageMetric => ({
  used,
  limit,
});

const currentMonthStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const subscriptionStatusLabel = (
  status: SubscriptionStatus,
): SharedSubscriptionStatus => status as SharedSubscriptionStatus;

export class BillingService {
  async getOverview(companyId: string): Promise<BillingOverview> {
    const company = await this.getCompanyWithFreshUsage(companyId);
    const usage = await this.getUsage(companyId, company);
    const plan = toPlanResource(company.plan);

    return {
      companyId: company.id,
      companyName: company.name,
      companyCountry: company.country,
      companyDefaultCurrency: company.defaultCurrency,
      plan,
      subscriptionStatus: subscriptionStatusLabel(company.subscriptionStatus),
      asaasCustomerId: company.asaasCustomerId,
      usage,
      entitlements: plan.features,
      coupon: company.coupon
        ? {
            code: company.coupon.code,
            discountPercent: company.coupon.discountPercent.toNumber(),
          }
        : null,
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

    const usage = await this.getUsage(companyId, company);
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

    const entitlements = toPlanResource(company.plan).features;
    const allowed =
      feature === "CUSTOM_FORMULAS"
        ? entitlements.customFormulas
        : entitlements.pdfExport;

    if (!allowed) {
      throw new AppError(
        "This feature is not available on the current plan.",
        403,
        "PLAN_FEATURE_UNAVAILABLE",
        { feature, planCode: company.plan.code },
      );
    }
  }

  // Single place that changes a company's plan — used by the free-plan
  // checkout path, by cancellation (back to Free), and by admin overrides
  // on /admin/users (the paid-checkout webhook sets planId/couponId
  // directly instead — see webhook.controller.ts — since it also needs to
  // touch subscriptionStatus/asaasSubscriptionId together atomically).
  // Always clears couponId: every caller here represents a plan change
  // outside the coupon-aware checkout flow (free plan, cancellation, or a
  // manual admin override), so a coupon from a previous paid subscription
  // should never linger.
  async applyPlan(
    companyId: string,
    planId: string,
    subscriptionStatus: SubscriptionStatus = SubscriptionStatus.ACTIVE,
  ): Promise<BillingOverview> {
    await prisma.company.update({
      where: { id: companyId },
      data: { planId, subscriptionStatus, couponId: null },
    });

    return this.getOverview(companyId);
  }

  async updateSubscription(
    companyId: string,
    input: {
      planId?: string;
      subscriptionStatus?: SubscriptionStatus;
    },
  ): Promise<BillingOverview> {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        planId: input.planId,
        subscriptionStatus: input.subscriptionStatus,
        // A manual admin plan change (this is the only caller of this
        // method) isn't going through the coupon-aware checkout flow, so
        // any coupon from a previous paid subscription shouldn't linger.
        // Left untouched when only subscriptionStatus changes (e.g.
        // reactivating a PAST_DUE company on the same plan).
        couponId: input.planId !== undefined ? null : undefined,
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
    return this.getUsage(companyId, company);
  }

  private async getCompanyWithFreshUsage(
    companyId: string,
  ): Promise<CompanyWithPlan> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        plan: true,
        coupon: { select: { code: true, discountPercent: true } },
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
    company: CompanyWithPlan,
  ): Promise<BillingUsage> {
    const [machineCount, materialCount] = await Promise.all([
      prisma.machine.count({ where: { companyId } }),
      prisma.material.count({ where: { companyId } }),
    ]);

    return {
      machines: toUsageMetric(machineCount, company.plan.maxMachinesAllowed),
      materials: toUsageMetric(
        materialCount,
        company.plan.maxMaterialsAllowed,
      ),
      monthlyQuotes: {
        ...toUsageMetric(
          company.currentQuotesCount,
          company.plan.maxQuotesPerMonth,
        ),
        periodStart: company.quoteUsagePeriodStart.toISOString(),
      },
    };
  }
}

export const billingService = new BillingService();
