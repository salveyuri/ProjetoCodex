import type {
  AdminAnalyticsOverview,
  AdminPlanDistributionPoint,
  AuditLogResource,
  MachineOccupancyPoint,
  MaterialMixPoint,
  MonthlyFinancialPoint,
  SystemErrorResource,
  UserAnalyticsOverview,
} from "@3d-budget/shared";
import { MaterialType, Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { cacheService, companyAnalyticsCacheKeyPrefix } from "./cache.service";
import type {
  AnalyticsExportQuery,
  AnalyticsQuery,
} from "../validators/analytics.validator";

const USER_ANALYTICS_TTL_SECONDS = 300;
const ADMIN_ANALYTICS_TTL_SECONDS = 600;
const DAILY_MACHINE_CAPACITY_HOURS = 8;

// A YEARLY plan's sticker price isn't its monthly contribution to MRR —
// normalize to a monthly-equivalent before summing across companies.
const monthlyEquivalentPrice = (plan: {
  price: Prisma.Decimal;
  billingCycle: string;
}): number =>
  plan.billingCycle === "YEARLY"
    ? toNumber(plan.price) / 12
    : toNumber(plan.price);

const quoteInclude = {
  printItems: {
    include: {
      machine: { select: { id: true, name: true } },
      material: { select: { id: true, brand: true, type: true, color: true } },
    },
  },
} satisfies Prisma.QuoteInclude;

type QuoteAnalyticsRow = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;

const toNumber = (value: Prisma.Decimal | number | null | undefined): number =>
  value instanceof Prisma.Decimal
    ? Number(value.toString())
    : typeof value === "number"
      ? value
      : 0;

const toDateRange = (query: AnalyticsQuery | AnalyticsExportQuery) => {
  const from = new Date(`${query.from}T00:00:00.000Z`);
  const to = new Date(`${query.to}T23:59:59.999Z`);

  return { from, to };
};

const monthKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const monthSequence = (from: Date, to: Date): string[] => {
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  const months: string[] = [];

  while (cursor <= last) {
    months.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
};

const daysInRange = (from: Date, to: Date): number =>
  Math.max(
    1,
    Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)),
  );

const getItemProfit = (item: QuoteAnalyticsRow["printItems"][number]): number =>
  Math.max(toNumber(item.finalPrice) - toNumber(item.baseCost), 0);

const roundMoney = (value: number): number => Math.round(value * 100) / 100;
const roundMetric = (value: number): number => Math.round(value * 100) / 100;

const toSystemErrorResource = (error: {
  id: string;
  message: string;
  code: string | null;
  severity: string;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  createdAt: Date;
}): SystemErrorResource => ({
  id: error.id,
  message: error.message,
  code: error.code,
  severity: error.severity,
  method: error.method,
  path: error.path,
  statusCode: error.statusCode,
  createdAt: error.createdAt.toISOString(),
});

const toAuditLogResource = (log: {
  id: string;
  action: string;
  entityType: string;
  actorEmail: string | null;
  targetUserId: string | null;
  companyId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}): AuditLogResource => ({
  id: log.id,
  action: log.action,
  entityType: log.entityType,
  actorEmail: log.actorEmail,
  targetUserId: log.targetUserId,
  companyId: log.companyId,
  metadata: log.metadata,
  createdAt: log.createdAt.toISOString(),
});

const csvEscape = (value: unknown): string => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

export class AnalyticsService {
  async getCompanyOverview(
    companyId: string,
    query: AnalyticsQuery,
  ): Promise<UserAnalyticsOverview> {
    const key = `${companyAnalyticsCacheKeyPrefix(companyId)}${query.from}:${query.to}`;

    return cacheService.getOrSet(
      key,
      () => this.buildCompanyOverview(companyId, query),
      USER_ANALYTICS_TTL_SECONDS,
    );
  }

  async exportCompanyData(
    companyId: string,
    query: AnalyticsExportQuery,
  ): Promise<{ filename: string; contentType: string; body: string | unknown[] }> {
    const quotes = await this.getCompanyQuotes(companyId, query);
    const rows = quotes.flatMap((quote) =>
      quote.printItems.map((item) => ({
        quoteId: quote.id,
        customerName: quote.customerName,
        status: quote.status,
        quoteCreatedAt: quote.createdAt.toISOString(),
        validUntil: quote.validUntil.toISOString(),
        itemId: item.id,
        modelName: item.modelName,
        machineName: item.machine.name,
        material: `${item.material.brand} - ${item.material.color}`,
        materialType: item.material.type,
        weightGrams: toNumber(item.materialWeightGrams),
        printHours: toNumber(item.estimatedPrintTimeHours),
        baseCost: toNumber(item.baseCost),
        finalPrice: toNumber(item.finalPrice),
        profit: getItemProfit(item),
      })),
    );
    const filename = `analytics_${query.from}_${query.to}.${query.format}`;

    if (query.format === "json") {
      return {
        filename,
        contentType: "application/json; charset=utf-8",
        body: rows,
      };
    }

    const headers = [
      "quoteId",
      "customerName",
      "status",
      "quoteCreatedAt",
      "validUntil",
      "itemId",
      "modelName",
      "machineName",
      "material",
      "materialType",
      "weightGrams",
      "printHours",
      "baseCost",
      "finalPrice",
      "profit",
    ];
    const body = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((header) => csvEscape(row[header as keyof typeof row])).join(","),
      ),
    ].join("\n");

    return {
      filename,
      contentType: "text/csv; charset=utf-8",
      body,
    };
  }

  async getAdminOverview(): Promise<AdminAnalyticsOverview> {
    return cacheService.getOrSet(
      "admin-analytics:global",
      () => this.buildAdminOverview(),
      ADMIN_ANALYTICS_TTL_SECONDS,
    );
  }

  private async buildCompanyOverview(
    companyId: string,
    query: AnalyticsQuery,
  ): Promise<UserAnalyticsOverview> {
    const { from, to } = toDateRange(query);
    const [quotes, machines] = await Promise.all([
      this.getCompanyQuotes(companyId, query),
      prisma.machine.findMany({
        where: { companyId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    const monthlyMap = new Map<string, MonthlyFinancialPoint>(
      monthSequence(from, to).map((month) => [
        month,
        { month, revenue: 0, profit: 0, baseCost: 0 },
      ]),
    );
    const materialMap = new Map<
      MaterialType,
      { weightGrams: number; revenue: number }
    >();
    const machineMap = new Map<string, MachineOccupancyPoint>();
    const capacityHours =
      daysInRange(from, to) * DAILY_MACHINE_CAPACITY_HOURS;

    for (const machine of machines) {
      machineMap.set(machine.id, {
        machineId: machine.id,
        machineName: machine.name,
        printedHours: 0,
        capacityHours,
        occupancyPercent: 0,
      });
    }

    let revenue = 0;
    let profit = 0;
    let totalPrintHours = 0;
    let totalWeightGrams = 0;

    for (const quote of quotes) {
      const month = monthKey(quote.createdAt);
      const monthly = monthlyMap.get(month) ?? {
        month,
        revenue: 0,
        profit: 0,
        baseCost: 0,
      };

      for (const item of quote.printItems) {
        const itemRevenue = toNumber(item.finalPrice);
        const itemBaseCost = toNumber(item.baseCost);
        const itemProfit = getItemProfit(item);
        const itemWeight = toNumber(item.materialWeightGrams);
        const itemHours = toNumber(item.estimatedPrintTimeHours);

        revenue += itemRevenue;
        profit += itemProfit;
        totalPrintHours += itemHours;
        totalWeightGrams += itemWeight;
        monthly.revenue += itemRevenue;
        monthly.profit += itemProfit;
        monthly.baseCost += itemBaseCost;

        const material = materialMap.get(item.material.type) ?? {
          weightGrams: 0,
          revenue: 0,
        };
        material.weightGrams += itemWeight;
        material.revenue += itemRevenue;
        materialMap.set(item.material.type, material);

        const machine = machineMap.get(item.machine.id) ?? {
          machineId: item.machine.id,
          machineName: item.machine.name,
          printedHours: 0,
          capacityHours,
          occupancyPercent: 0,
        };
        machine.printedHours += itemHours;
        machineMap.set(item.machine.id, machine);
      }

      monthlyMap.set(month, monthly);
    }

    const materialMix: MaterialMixPoint[] = [...materialMap.entries()]
      .map(([materialType, value]) => ({
        materialType,
        label: materialType,
        weightGrams: roundMetric(value.weightGrams),
        revenue: roundMoney(value.revenue),
        percentage:
          totalWeightGrams > 0
            ? roundMetric((value.weightGrams / totalWeightGrams) * 100)
            : 0,
      }))
      .sort((a, b) => b.weightGrams - a.weightGrams);

    const machineOccupancy: MachineOccupancyPoint[] = [...machineMap.values()]
      .map((machine) => ({
        ...machine,
        printedHours: roundMetric(machine.printedHours),
        occupancyPercent:
          machine.capacityHours > 0
            ? roundMetric((machine.printedHours / machine.capacityHours) * 100)
            : 0,
      }))
      .sort((a, b) => b.printedHours - a.printedHours);

    return {
      range: query,
      generatedAt: new Date().toISOString(),
      cacheTtlSeconds: USER_ANALYTICS_TTL_SECONDS,
      summary: {
        quotesCount: quotes.length,
        approvedQuotesCount: quotes.filter((quote) => quote.status === "APPROVED").length,
        revenue: roundMoney(revenue),
        profit: roundMoney(profit),
        averageTicket:
          quotes.length > 0 ? roundMoney(revenue / quotes.length) : 0,
        totalPrintHours: roundMetric(totalPrintHours),
        totalWeightGrams: roundMetric(totalWeightGrams),
      },
      monthlyFinancials: [...monthlyMap.values()].map((point) => ({
        month: point.month,
        revenue: roundMoney(point.revenue),
        profit: roundMoney(point.profit),
        baseCost: roundMoney(point.baseCost),
      })),
      materialMix,
      machineOccupancy,
    };
  }

  private async buildAdminOverview(): Promise<AdminAnalyticsOverview> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [
      totalUsers,
      activeUsers,
      activeCompanies,
      planRows,
      plans,
      quotesThisMonth,
      revenueThisMonth,
      systemErrors24h,
      recentErrors,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.company.count({
        where: { subscriptionStatus: SubscriptionStatus.ACTIVE },
      }),
      prisma.company.groupBy({
        by: ["planId", "subscriptionStatus"],
        _count: { _all: true },
      }),
      prisma.plan.findMany(),
      prisma.quote.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.quote.aggregate({
        where: { createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      prisma.systemError.count({ where: { createdAt: { gte: yesterday } } }),
      prisma.systemError.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          message: true,
          code: true,
          severity: true,
          method: true,
          path: true,
          statusCode: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          action: true,
          entityType: true,
          actorEmail: true,
          targetUserId: true,
          companyId: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);
    const distributionMap = new Map<string, AdminPlanDistributionPoint>();
    const planById = new Map(plans.map((plan) => [plan.id, plan]));

    for (const plan of plans) {
      distributionMap.set(plan.id, {
        planId: plan.id,
        planName: plan.name,
        companies: 0,
        activeCompanies: 0,
        mrr: 0,
      });
    }

    for (const row of planRows) {
      const current = distributionMap.get(row.planId);
      const plan = planById.get(row.planId);

      if (!current || !plan) {
        continue;
      }

      current.companies += row._count._all;

      if (row.subscriptionStatus === SubscriptionStatus.ACTIVE) {
        current.activeCompanies += row._count._all;
        current.mrr += row._count._all * monthlyEquivalentPrice(plan);
      }
    }

    const planDistribution = [...distributionMap.values()].map((point) => ({
      ...point,
      mrr: roundMoney(point.mrr),
    }));
    const estimatedMrr = roundMoney(
      planDistribution.reduce((total, plan) => total + plan.mrr, 0),
    );

    return {
      generatedAt: now.toISOString(),
      cacheTtlSeconds: ADMIN_ANALYTICS_TTL_SECONDS,
      summary: {
        totalUsers,
        activeUsers,
        activeCompanies,
        estimatedMrr,
        quotesThisMonth,
        revenueThisMonth: roundMoney(toNumber(revenueThisMonth._sum.totalAmount)),
        systemErrors24h,
      },
      planDistribution,
      recentErrors: recentErrors.map(toSystemErrorResource),
      recentAuditLogs: recentAuditLogs.map(toAuditLogResource),
    };
  }

  private async getCompanyQuotes(
    companyId: string,
    query: AnalyticsQuery | AnalyticsExportQuery,
  ): Promise<QuoteAnalyticsRow[]> {
    const { from, to } = toDateRange(query);

    return prisma.quote.findMany({
      where: {
        companyId,
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      include: quoteInclude,
      orderBy: { createdAt: "asc" },
    });
  }
}

export const analyticsService = new AnalyticsService();
