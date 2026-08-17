import type { QuoteStatus } from "@3d-budget/shared";
import type { TranslationKey } from "@/lib/i18n";

// Values, never labels — the actual PT/EN text lives in the dictionaries,
// looked up via t(quoteStatusLabelKeys[status]) so it follows useLanguage().
export const quoteStatusLabelKeys: Record<QuoteStatus, TranslationKey> = {
  DRAFT: "quote.status.draft",
  SENT: "quote.status.sent",
  APPROVED: "quote.status.approved",
  REJECTED: "quote.status.rejected",
};

export const quoteStatusTones: Record<
  QuoteStatus,
  "neutral" | "warning" | "success" | "danger"
> = {
  DRAFT: "neutral",
  SENT: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

export const quoteStatusOptions: QuoteStatus[] = [
  "DRAFT",
  "SENT",
  "APPROVED",
  "REJECTED",
];

// Locale-independent on purpose — feeds an <input type="date"> value, never
// shown to the user directly, so it always stays ISO (yyyy-mm-dd).
export const toDateInputValue = (value: string | Date): string => {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
};
