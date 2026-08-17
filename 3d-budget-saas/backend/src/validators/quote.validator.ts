import { z } from "zod";

export const quoteStatusSchema = z.enum([
  "DRAFT",
  "SENT",
  "APPROVED",
  "REJECTED",
]);

const uuid = z.string().trim().uuid();
const positiveNumber = z.number().finite().positive();
const nonNegativeNumber = z.number().finite().min(0);

const quoteItemSchema = z
  .object({
    modelName: z.string().trim().min(2).max(120).default("Modelo 3D"),
    weightGrams: positiveNumber,
    printTimeHours: positiveNumber,
    machineId: uuid,
    materialId: uuid,
  })
  .strict();

const quoteItemsSchema = z.array(quoteItemSchema).min(1);

const defaultValidUntil = (): Date => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
};

export const quoteCreateSchema = z
  .object({
    customerName: z.string().trim().min(2).max(160),
    validUntil: z.coerce.date().default(defaultValidUntil),
    status: quoteStatusSchema.default("DRAFT"),
    formulaId: uuid.optional(),
    paintingHours: nonNegativeNumber.optional(),
    horas_pintura: nonNegativeNumber.optional(),
    finishingHours: nonNegativeNumber.optional(),
    horas_acabamento: nonNegativeNumber.optional(),
    item: quoteItemSchema.optional(),
    items: quoteItemsSchema.optional(),
    printItems: quoteItemsSchema.optional(),
    tables: quoteItemsSchema.optional(),
  })
  .strict()
  .transform((value, context) => {
    const items =
      value.items ??
      value.printItems ??
      value.tables ??
      (value.item ? [value.item] : undefined);

    if (!items || items.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "At least one print table is required.",
      });
    }

    return {
      customerName: value.customerName,
      validUntil: value.validUntil,
      status: value.status,
      formulaId: value.formulaId,
      paintingHours: value.paintingHours ?? value.horas_pintura ?? 0,
      finishingHours: value.finishingHours ?? value.horas_acabamento ?? 0,
      items: items ?? [],
    };
  });

export const quoteUpdateSchema = z
  .object({
    customerName: z.string().trim().min(2).max(160).optional(),
    validUntil: z.coerce.date().optional(),
    status: quoteStatusSchema.optional(),
    formulaId: uuid.optional(),
    paintingHours: nonNegativeNumber.optional(),
    horas_pintura: nonNegativeNumber.optional(),
    finishingHours: nonNegativeNumber.optional(),
    horas_acabamento: nonNegativeNumber.optional(),
    item: quoteItemSchema.optional(),
    items: quoteItemsSchema.optional(),
    printItems: quoteItemsSchema.optional(),
    tables: quoteItemsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  })
  .transform((value) => ({
    customerName: value.customerName,
    validUntil: value.validUntil,
    status: value.status,
    formulaId: value.formulaId,
    paintingHours: value.paintingHours ?? value.horas_pintura,
    finishingHours: value.finishingHours ?? value.horas_acabamento,
    items:
      value.items ??
      value.printItems ??
      value.tables ??
      (value.item ? [value.item] : undefined),
  }));

export const quoteListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    status: quoteStatusSchema.optional(),
  })
  .strict();

// Live, unsaved preview of a whole quote-in-progress — same item shape as
// quoteCreateSchema, minus the fields (customerName/status/validUntil)
// that don't affect price.
export const quotePreviewSchema = z
  .object({
    formulaId: uuid.optional(),
    paintingHours: nonNegativeNumber.optional(),
    horas_pintura: nonNegativeNumber.optional(),
    finishingHours: nonNegativeNumber.optional(),
    horas_acabamento: nonNegativeNumber.optional(),
    item: quoteItemSchema.optional(),
    items: quoteItemsSchema.optional(),
    printItems: quoteItemsSchema.optional(),
    tables: quoteItemsSchema.optional(),
  })
  .strict()
  .transform((value, context) => {
    const items =
      value.items ??
      value.printItems ??
      value.tables ??
      (value.item ? [value.item] : undefined);

    if (!items || items.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "At least one print table is required.",
      });
    }

    return {
      formulaId: value.formulaId,
      paintingHours: value.paintingHours ?? value.horas_pintura ?? 0,
      finishingHours: value.finishingHours ?? value.horas_acabamento ?? 0,
      items: items ?? [],
    };
  });

export type QuoteCreateInput = z.infer<typeof quoteCreateSchema>;
export type QuoteUpdateInput = z.infer<typeof quoteUpdateSchema>;
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;
export type QuotePreviewInput = z.infer<typeof quotePreviewSchema>;
