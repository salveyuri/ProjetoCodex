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
import { cacheService } from "./cache.service";
import { calculationService } from "./CalculationService";
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
    const calculations = await Promise.all(
      input.items.map((item) =>
        calculationService.calculate(companyId, {
          ...item,
          formulaId: input.formulaId,
        }),
      ),
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

    cacheService.flush();
    return toQuoteResource(quote);
  }

  async update(
    companyId: string,
    quoteId: string,
    input: QuoteUpdateInput,
  ): Promise<QuoteResource> {
    const existing = await this.findOwnedQuote(companyId, quoteId);
    const shouldRecalculate =
      input.items !== undefined || input.formulaId !== undefined;
    const itemsForCalculation = input.items ?? existing.printItems.map(toQuoteItemInput);
    const formulaId = input.formulaId ?? existing.formulaId ?? undefined;
    const calculations = shouldRecalculate
      ? await Promise.all(
          itemsForCalculation.map((item) =>
            calculationService.calculate(companyId, {
              ...item,
              formulaId,
            }),
          ),
        )
      : null;
    const aggregation = calculations ? aggregateCalculations(calculations) : null;
    const appliedFormulaId = calculations ? getAppliedFormulaId(calculations) : undefined;

    const quote = await prisma.$transaction(async (transaction) => {
      await transaction.quote.update({
        where: { id: quoteId },
        data: {
          customerName: input.customerName,
          validUntil: input.validUntil,
          status: input.status as QuoteStatus | undefined,
          formulaId: appliedFormulaId,
          totalAmount: aggregation?.totalAmount,
          totalPrintHours: aggregation?.totalPrintHours,
          totalWeightGrams: aggregation?.totalWeightGrams,
        },
      });

      if (shouldRecalculate && calculations) {
        await transaction.printItem.deleteMany({ where: { quoteId } });
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

      if (!updated) {
        throw new AppError("Quote not found.", 404, "QUOTE_NOT_FOUND");
      }

      return updated;
    });

    cacheService.flush();
    return toQuoteResource(quote);
  }

  async delete(companyId: string, quoteId: string): Promise<void> {
    await this.findOwnedQuote(companyId, quoteId);
    await prisma.quote.delete({ where: { id: quoteId } });
    cacheService.flush();
  }

  private async findOwnedQuote(
    companyId: string,
    quoteId: string,
  ): Promise<QuoteWithItems> {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, companyId },
      include: quoteInclude,
    });

    if (!quote) {
      throw new AppError("Quote not found.", 404, "QUOTE_NOT_FOUND");
    }

    return quote;
  }
}

export const quoteService = new QuoteService();
