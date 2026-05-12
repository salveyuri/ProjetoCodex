import { z } from "zod";

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date in YYYY-MM-DD format.");

const defaultDateRange = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
};

export const analyticsQuerySchema = z
  .object({
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
  })
  .transform((value) => {
    const defaults = defaultDateRange();

    return {
      from: value.from ?? defaults.from,
      to: value.to ?? defaults.to,
    };
  })
  .refine((value) => new Date(value.from) <= new Date(value.to), {
    message: "from must be earlier than or equal to to.",
  });

export const analyticsExportQuerySchema = z
  .object({
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
    format: z.enum(["csv", "json"]).default("csv"),
  })
  .transform((value) => {
    const defaults = defaultDateRange();

    return {
      from: value.from ?? defaults.from,
      to: value.to ?? defaults.to,
      format: value.format,
    };
  })
  .refine((value) => new Date(value.from) <= new Date(value.to), {
    message: "from must be earlier than or equal to to.",
  });

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsExportQuery = z.infer<typeof analyticsExportQuerySchema>;
