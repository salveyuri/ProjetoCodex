import type {
  PaginatedQuoteList,
  QuoteItemCostPreview,
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
import {
  calculationService,
  type QuoteCalculationResult,
} from "./CalculationService";
import { emailService } from "./email.service";
import type {
  QuoteCreateInput,
  QuoteListQuery,
  QuoteUpdateInput,
} from "../validators/quote.validator";

const quoteInclude = {
  formula: { select: { id: true, name: true } },
  systemFormula: { select: { id: true, name: true } },
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
  systemFormula: { select: { id: true, name: true } },
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
type QuoteItemInput = QuoteCreateInput["items"][number];

const toNumber = (value: Prisma.Decimal): number => Number(value.toString());

const decimal = (value: number): Prisma.Decimal => new Prisma.Decimal(value);

const sumDecimal = (values: number[]): Prisma.Decimal =>
  values.reduce((total, value) => total.add(decimal(value)), new Prisma.Decimal(0));

const toQuoteItemInput = (
  item: QuoteWithItems["printItems"][number],
): QuoteItemInput => ({
  modelName: item.modelName,
  machineId: item.machineId,
  materialId: item.materialId,
  weightGrams: toNumber(item.materialWeightGrams),
  printTimeHours: toNumber(item.estimatedPrintTimeHours),
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
  maintenanceCost: toNumber(item.maintenanceCost),
  baseCost: toNumber(item.baseCost),
  marginAmount: toNumber(item.marginAmount),
  feesTotal: toNumber(item.feesTotal),
  finalPrice: toNumber(item.finalPrice),
  appliedMarginPercent: toNumber(item.appliedMarginPercent),
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
  formulaId: quote.formulaId ?? quote.systemFormulaId,
  formulaName: quote.formula?.name ?? quote.systemFormula?.name ?? null,
  customerName: quote.customerName,
  status: quote.status as SharedQuoteStatus,
  totalAmount: toNumber(quote.totalAmount),
  totalPrintHours: toNumber(quote.totalPrintHours),
  totalWeightGrams: toNumber(quote.totalWeightGrams),
  paintingHours: toNumber(quote.paintingHours),
  finishingHours: toNumber(quote.finishingHours),
  cardPayment: quote.cardPayment,
  cardFeeAmount: toNumber(quote.cardFeeAmount),
  adjustmentType: quote.adjustmentType,
  adjustmentPercent: toNumber(quote.adjustmentPercent),
  adjustmentAmount: toNumber(quote.adjustmentAmount),
  validUntil: quote.validUntil.toISOString(),
  createdAt: quote.createdAt.toISOString(),
  updatedAt: quote.updatedAt.toISOString(),
  items: quote.printItems.map(toQuoteItemSnapshot),
});

const toQuoteListItem = (quote: QuoteListRow): QuoteListItem => {
  const firstItem = quote.printItems[0];

  return {
    id: quote.id,
    formulaId: quote.formulaId ?? quote.systemFormulaId,
    formulaName: quote.formula?.name ?? quote.systemFormula?.name ?? null,
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

// Each print item snapshots its own RAW production cost only — material +
// energy + depreciation + maintenance, no error rate/fees/margin/post-
// processing (those only exist once at the whole-quote level, computed
// once by calculateQuote — see Contextos/Decisoes.md, 2026-08-17).
// marginAmount/feesTotal stay at 0: they're no longer a meaningful
// per-item figure, but the columns remain (no schema migration needed).
const toPrintItemSnapshotData = (
  input: QuoteItemInput,
  machineId: string,
  materialId: string,
  itemPreview: QuoteItemCostPreview,
  rates: QuoteCalculationResult["rates"],
): Prisma.PrintItemUncheckedCreateWithoutQuoteInput => ({
  modelName: input.modelName,
  machineId,
  materialId,
  estimatedPrintTimeHours: input.printTimeHours,
  materialWeightGrams: input.weightGrams,
  calculatedCost: itemPreview.rawCost,
  materialCost: itemPreview.materialCost,
  energyCost: itemPreview.energyCost,
  depreciationCost: itemPreview.depreciationCost,
  maintenanceCost: itemPreview.maintenanceCost,
  baseCost: itemPreview.rawCost,
  marginAmount: 0,
  feesTotal: 0,
  finalPrice: itemPreview.rawCost,
  appliedMarginPercent: rates.desiredMarginPercent,
  appliedEnergyCostPerKwh: rates.energyCostPerKwh,
  appliedCardFeePercent: rates.cardFeePercent,
  appliedAdministrativeFeePercent: rates.administrativeFeePercent,
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
    const result = await calculationService.calculateQuote(companyId, {
      items: input.items,
      formulaId: input.formulaId,
      paintingHours: input.paintingHours,
      finishingHours: input.finishingHours,
      cardPayment: input.cardPayment,
      adjustmentType: input.adjustmentType,
      adjustmentPercent: input.adjustmentPercent,
    });
    const totalWeightGrams = sumDecimal(input.items.map((item) => item.weightGrams));
    const totalPrintHours = sumDecimal(input.items.map((item) => item.printTimeHours));

    const quote = await prisma.$transaction(async (transaction) => {
      const created = await transaction.quote.create({
        data: {
          companyId,
          formulaId: result.formula.isSystem ? null : result.formula.id,
          systemFormulaId: result.formula.isSystem ? result.formula.id : null,
          cardPayment: input.cardPayment,
          cardFeeAmount: result.breakdown.cardFeeAmount,
          adjustmentType: input.adjustmentType,
          adjustmentPercent: input.adjustmentPercent,
          adjustmentAmount: result.breakdown.adjustmentAmount,
          customerName: input.customerName,
          status: input.status as QuoteStatus,
          totalAmount: result.breakdown.finalPrice,
          totalPrintHours,
          totalWeightGrams,
          paintingHours: input.paintingHours,
          finishingHours: input.finishingHours,
          validUntil: input.validUntil,
          printItems: {
            create: input.items.map((item, index) =>
              toPrintItemSnapshotData(
                item,
                item.machineId,
                item.materialId,
                result.items[index],
                result.rates,
              ),
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
      input.finishingHours !== undefined ||
      input.cardPayment !== undefined ||
      input.adjustmentType !== undefined ||
      input.adjustmentPercent !== undefined;
    const itemsForCalculation = input.items ?? existing.printItems.map(toQuoteItemInput);
    const formulaId =
      input.formulaId ?? existing.formulaId ?? existing.systemFormulaId ?? undefined;
    const paintingHours = input.paintingHours ?? toNumber(existing.paintingHours);
    const finishingHours = input.finishingHours ?? toNumber(existing.finishingHours);
    const cardPayment = input.cardPayment ?? existing.cardPayment;
    const adjustmentType =
      input.adjustmentType !== undefined ? input.adjustmentType : existing.adjustmentType;
    const adjustmentPercent =
      input.adjustmentPercent ?? toNumber(existing.adjustmentPercent);

    const result = shouldRecalculate
      ? await calculationService.calculateQuote(companyId, {
          items: itemsForCalculation,
          formulaId,
          paintingHours,
          finishingHours,
          cardPayment,
          adjustmentType,
          adjustmentPercent,
        })
      : null;
    const totalWeightGrams = result
      ? sumDecimal(itemsForCalculation.map((item) => item.weightGrams))
      : undefined;
    const totalPrintHours = result
      ? sumDecimal(itemsForCalculation.map((item) => item.printTimeHours))
      : undefined;

    const quote = await prisma.$transaction(async (transaction) => {
      const updateResult = await transaction.quote.updateMany({
        where: { id: quoteId, companyId },
        data: {
          customerName: input.customerName,
          validUntil: input.validUntil,
          status: input.status as QuoteStatus | undefined,
          formulaId: result ? (result.formula.isSystem ? null : result.formula.id) : undefined,
          systemFormulaId: result ? (result.formula.isSystem ? result.formula.id : null) : undefined,
          cardPayment: input.cardPayment,
          cardFeeAmount: result?.breakdown.cardFeeAmount,
          adjustmentType: input.adjustmentType,
          adjustmentPercent: input.adjustmentPercent,
          adjustmentAmount: result?.breakdown.adjustmentAmount,
          totalAmount: result?.breakdown.finalPrice,
          totalPrintHours,
          totalWeightGrams,
          paintingHours: input.paintingHours,
          finishingHours: input.finishingHours,
        },
      });

      if (updateResult.count !== 1) {
        throwQuoteForbidden();
      }

      if (shouldRecalculate && result) {
        await transaction.printItem.deleteMany({
          where: { quote: { id: quoteId, companyId } },
        });
        await Promise.all(
          itemsForCalculation.map((item, index) =>
            transaction.printItem.create({
              data: {
                quoteId,
                ...toPrintItemSnapshotData(
                  item,
                  item.machineId,
                  item.materialId,
                  result.items[index],
                  result.rates,
                ),
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

    if (existing.status !== "APPROVED" && quote.status === "APPROVED") {
      void emailService.sendQuoteSummary(companyId, quoteId, "APPROVED");
    }

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
}

export const quoteService = new QuoteService();
