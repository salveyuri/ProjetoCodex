import type {
  PaginatedQuoteList,
  QuoteItemSnapshot,
  QuoteListItem,
  QuoteResource,
  QuoteStatus as SharedQuoteStatus,
} from "@3d-budget/shared";
import { Prisma, type QuoteStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { billingService } from "./billing.service";
import { cacheService, companyAnalyticsCacheKeyPrefix } from "./cache.service";
import { calculationService } from "./CalculationService";
import { formulaService } from "./formula.service";
import { settingsService } from "./settings.service";
import type {
  QuoteCreateInput,
  QuoteListQuery,
  QuoteUpdateInput,
} from "../validators/quote.validator";

const quoteInclude = {
  formula: { select: { id: true, name: true } },
  printItems: {
    orderBy: { createdAt: "asc" as const },
    include: {
      machine: { select: { id: true, name: true } },
      material: { select: { id: true, brand: true, color: true } },
    },
  },
} satisfies Prisma.QuoteInclude;

const quoteListInclude = {
  formula: { select: { id: true, name: true } },
  printItems: {
    take: 1,
    orderBy: { createdAt: "asc" as const },
    include: {
      machine: { select: { id: true, name: true } },
      material: { select: { id: true, brand: true, color: true } },
    },
  },
  _count: { select: { printItems: true } },
} satisfies Prisma.QuoteInclude;

type QuoteWithItems = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;
type QuoteListRow = Prisma.QuoteGetPayload<{ include: typeof quoteListInclude }>;
type QuoteCalculation = Awaited<ReturnType<typeof calculationService.calculate>>;
type QuoteItemInput = QuoteCreateInput["items"][number];

const toNumber = (value: Prisma.Decimal): number => Number(value.toString());

const decimal = (value: number): Prisma.Decimal => new Prisma.Decimal(value);

const sumDecimal = (
  values: number[],
): Prisma.Decimal =>
  values.reduce(
    (total, value) => total.add(decimal(value)),
    new Prisma.Decimal(0),
  );

const aggregateCalculations = (calculations: QuoteCalculation[]) => ({
  totalAmount: sumDecimal(
    calculations.map((calculation) => calculation.breakdown.finalPrice),
  ),
  totalPrintHours: sumDecimal(
    calculations.map((calculation) => calculation.input.printTimeHours),
  ),
  totalWeightGrams: sumDecimal(
    calculations.map((calculation) => calculation.input.weightGrams),
  ),
});

const getAppliedFormulaId = (calculations: QuoteCalculation[]): string | null =>
  calculations.find((calculation) => calculation.formula.id)?.formula.id ?? null;

const toQuoteItemInput = (
  item: QuoteWithItems["printItems"][number],
): QuoteItemInput => ({
  modelName: item.modelName,
  machineId: item.machineId,
  materialId: item.materialId,
  weightGrams: toNumber(item.materialWeightGrams),
  printTimeHours: toNumber(item.estimatedPrintTimeHours),
});

const buildQuoteCalculationContext = (
  paintingHours: number,
  finishingHours: number,
  quoteItemsCount: number,
) => ({
  paintingHours,
  finishingHours,
  quoteItemsCount,
});

// "Access denied." on purpose: doesn't confirm a company-ownership check
// is what rejected this — see Contextos/Conhecimento.md.
const throwQuoteForbidden = (): never => {
  throw new AppError("Access denied.", 403, "QUOTE_FORBIDDEN");
};

const toQuoteItemSnapshot = (
  item: QuoteWithItems["printItems"][number],
): QuoteItemSnapshot => ({
  id: item.id,
  modelName: item.modelName,
  machineId: item.machineId,
  materialId: item.materialId,
  machineName: item.machine.name,
  materialName: item.material.brand,
  materialColor: item.material.color,
  estimatedPrintTimeHours: toNumber(item.estimatedPrintTimeHours),
  materialWeightGrams: toNumber(item.materialWeightGrams),
  calculatedCost: toNumber(item.calculatedCost),
  materialCost: toNumber(item.materialCost),
  energyCost: toNumber(item.energyCost),
  depreciationCost: toNumber(item.depreciationCost),
  laborCost: toNumber(item.laborCost),
  baseCost: toNumber(item.baseCost),
  marginAmount: toNumber(item.marginAmount),
  feesTotal: toNumber(item.feesTotal),
  finalPrice: toNumber(item.finalPrice),
  appliedMarginPercent: toNumber(item.appliedMarginPercent),
  appliedTechnicalHourRate: toNumber(item.appliedTechnicalHourRate),
  appliedEnergyCostPerKwh: toNumber(item.appliedEnergyCostPerKwh),
  appliedCardFeePercent: toNumber(item.appliedCardFeePercent),
  appliedAdministrativeFeePercent: toNumber(
    item.appliedAdministrativeFeePercent,
  ),
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

const toQuoteResource = (quote: QuoteWithItems): QuoteResource => ({
  id: quote.id,
  formulaId: quote.formulaId,
  formulaName: quote.formula?.name ?? null,
  customerName: quote.customerName,
  status: quote.status as SharedQuoteStatus,
  totalAmount: toNumber(quote.totalAmount),
  totalPrintHours: toNumber(quote.totalPrintHours),
  totalWeightGrams: toNumber(quote.totalWeightGrams),
  paintingHours: toNumber(quote.paintingHours),
  finishingHours: toNumber(quote.finishingHours),
  validUntil: quote.validUntil.toISOString(),
  createdAt: quote.createdAt.toISOString(),
  updatedAt: quote.updatedAt.toISOString(),
  items: quote.printItems.map(toQuoteItemSnapshot),
});

const toQuoteListItem = (quote: QuoteListRow): QuoteListItem => {
  const firstItem = quote.printItems[0];

  return {
    id: quote.id,
    formulaId: quote.formulaId,
    formulaName: quote.formula?.name ?? null,
    customerName: quote.customerName,
    status: quote.status as SharedQuoteStatus,
    totalAmount: toNumber(quote.totalAmount),
    totalPrintHours: toNumber(quote.totalPrintHours),
    totalWeightGrams: toNumber(quote.totalWeightGrams),
    paintingHours: toNumber(quote.paintingHours),
    finishingHours: toNumber(quote.finishingHours),
    validUntil: quote.validUntil.toISOString(),
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
    itemsCount: quote._count.printItems,
    firstItem: firstItem
      ? {
          modelName: firstItem.modelName,
          machineName: firstItem.machine.name,
          materialName: firstItem.material.brand,
        }
      : null,
  };
};

const toPrintItemSnapshotData = (
  input: QuoteItemInput,
  calculation: QuoteCalculation,
): Prisma.PrintItemUncheckedCreateWithoutQuoteInput => ({
  modelName: input.modelName,
  machineId: calculation.resources.machine.id,
  materialId: calculation.resources.material.id,
  estimatedPrintTimeHours: calculation.input.printTimeHours,
  materialWeightGrams: calculation.input.weightGrams,
  calculatedCost: calculation.breakdown.finalPrice,
  materialCost: calculation.breakdown.materialCost,
  energyCost: calculation.breakdown.energyCost,
  depreciationCost: calculation.breakdown.depreciationCost,
  laborCost: calculation.breakdown.laborCost,
  baseCost: calculation.breakdown.baseCost,
  marginAmount: calculation.breakdown.marginAmount,
  feesTotal: calculation.breakdown.feesTotal,
  finalPrice: calculation.breakdown.finalPrice,
  appliedMarginPercent: calculation.rates.desiredMarginPercent,
  appliedTechnicalHourRate: calculation.rates.technicalHourRate,
  appliedEnergyCostPerKwh: calculation.rates.energyCostPerKwh,
  appliedCardFeePercent: calculation.rates.cardFeePercent,
  appliedAdministrativeFeePercent:
    calculation.rates.administrativeFeePercent,
});

export class QuoteService {
  async list(
    companyId: string,
    query: QuoteListQuery,
  ): Promise<PaginatedQuoteList> {
    const where: Prisma.QuoteWhereInput = {
      companyId,
      status: query.status as QuoteStatus | undefined,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [quotes, total] = await prisma.$transaction([
      prisma.quote.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: "desc" },
        include: quoteListInclude,
      }),
      prisma.quote.count({ where }),
    ]);

    return {
      data: quotes.map(toQuoteListItem),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async show(companyId: string, quoteId: string): Promise<QuoteResource> {
    const quote = await this.findOwnedQuote(companyId, quoteId);
    return toQuoteResource(quote);
  }

  async create(
    companyId: string,
    input: QuoteCreateInput,
  ): Promise<QuoteResource> {
    const quoteCalculationContext = buildQuoteCalculationContext(
      input.paintingHours,
      input.finishingHours,
      input.items.length,
    );
    const calculations = await this.calculateItems(
      companyId,
      input.items,
      input.formulaId,
      quoteCalculationContext,
    );
    const aggregation = aggregateCalculations(calculations);
    const appliedFormulaId = getAppliedFormulaId(calculations);
    const quote = await prisma.$transaction(async (transaction) => {
      const created = await transaction.quote.create({
        data: {
          companyId,
          formulaId: appliedFormulaId,
          customerName: input.customerName,
          status: input.status as QuoteStatus,
          totalAmount: aggregation.totalAmount,
          totalPrintHours: aggregation.totalPrintHours,
          totalWeightGrams: aggregation.totalWeightGrams,
          paintingHours: input.paintingHours,
          finishingHours: input.finishingHours,
          validUntil: input.validUntil,
          printItems: {
            create: input.items.map((item, index) =>
              toPrintItemSnapshotData(item, calculations[index]),
            ),
          },
        },
        include: quoteInclude,
      });

      await billingService.incrementQuoteUsage(companyId, transaction);

      return created;
    });

    cacheService.delByPrefix(companyAnalyticsCacheKeyPrefix(companyId));
    return toQuoteResource(quote);
  }

  async update(
    companyId: string,
    quoteId: string,
    input: QuoteUpdateInput,
  ): Promise<QuoteResource> {
    const existing = await this.findOwnedQuote(companyId, quoteId);
    const shouldRecalculate =
      input.items !== undefined ||
      input.formulaId !== undefined ||
      input.paintingHours !== undefined ||
      input.finishingHours !== undefined;
    const itemsForCalculation = input.items ?? existing.printItems.map(toQuoteItemInput);
    const formulaId = input.formulaId ?? existing.formulaId ?? undefined;
    const paintingHours =
      input.paintingHours ?? toNumber(existing.paintingHours);
    const finishingHours =
      input.finishingHours ?? toNumber(existing.finishingHours);
    const quoteCalculationContext = buildQuoteCalculationContext(
      paintingHours,
      finishingHours,
      itemsForCalculation.length,
    );
    const calculations = shouldRecalculate
      ? await this.calculateItems(
          companyId,
          itemsForCalculation,
          formulaId,
          quoteCalculationContext,
        )
      : null;
    const aggregation = calculations ? aggregateCalculations(calculations) : null;
    const appliedFormulaId = calculations ? getAppliedFormulaId(calculations) : undefined;

    const quote = await prisma.$transaction(async (transaction) => {
      const updateResult = await transaction.quote.updateMany({
        where: { id: quoteId, companyId },
        data: {
          customerName: input.customerName,
          validUntil: input.validUntil,
          status: input.status as QuoteStatus | undefined,
          formulaId: appliedFormulaId,
          totalAmount: aggregation?.totalAmount,
          totalPrintHours: aggregation?.totalPrintHours,
          totalWeightGrams: aggregation?.totalWeightGrams,
          paintingHours: input.paintingHours,
          finishingHours: input.finishingHours,
        },
      });

      if (updateResult.count !== 1) {
        throwQuoteForbidden();
      }

      if (shouldRecalculate && calculations) {
        await transaction.printItem.deleteMany({
          where: { quote: { id: quoteId, companyId } },
        });
        await Promise.all(
          itemsForCalculation.map((item, index) =>
            transaction.printItem.create({
              data: {
                quoteId,
                ...toPrintItemSnapshotData(item, calculations[index]),
              },
            }),
          ),
        );
      }

      const updated = await transaction.quote.findFirst({
        where: { id: quoteId, companyId },
        include: quoteInclude,
      });

      if (updated === null) {
        throwQuoteForbidden();
      }

      return updated as QuoteWithItems;
    });

    cacheService.delByPrefix(companyAnalyticsCacheKeyPrefix(companyId));
    return toQuoteResource(quote);
  }

  async delete(companyId: string, quoteId: string): Promise<void> {
    const result = await prisma.quote.deleteMany({
      where: { id: quoteId, companyId },
    });

    if (result.count !== 1) {
      throwQuoteForbidden();
    }

    cacheService.delByPrefix(companyAnalyticsCacheKeyPrefix(companyId));
  }

  private async findOwnedQuote(
    companyId: string,
    quoteId: string,
  ): Promise<QuoteWithItems> {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, companyId },
      include: quoteInclude,
    });

    if (quote === null) {
      throwQuoteForbidden();
    }

    return quote as QuoteWithItems;
  }

  /**
   * Resolves `settings`/`formula` once for the whole quote (every item
   * shares them) instead of once per item, then calculates each item in
   * parallel. Avoids refetching the same settings/formula N times for a
   * quote with N print items.
   */
  private async calculateItems(
    companyId: string,
    items: QuoteItemInput[],
    formulaId: string | undefined,
    quoteCalculationContext: ReturnType<typeof buildQuoteCalculationContext>,
  ): Promise<QuoteCalculation[]> {
    const [settings, formula] = await Promise.all([
      settingsService.get(companyId),
      formulaService.getFormulaForCalculation(companyId, formulaId),
    ]);

    return Promise.all(
      items.map((item) =>
        calculationService.calculateWithResolvedContext(
          companyId,
          { ...item, ...quoteCalculationContext, formulaId },
          settings,
          formula,
        ),
      ),
    );
  }
}

export const quoteService = new QuoteService();
