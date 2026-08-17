"use client";

import type { QuoteResource } from "@3d-budget/shared";
import {
  Calculator,
  Clock3,
  Download,
  Layers3,
  Paintbrush,
  Save,
  Scale,
  Send,
  Wrench,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/cn";
import { SummaryLine } from "./QuoteFormFields";

interface QuoteAggregate {
  totalWeightGrams: number;
  totalPrintHours: number;
  paintingHours: number;
  finishingHours: number;
  totalAmount: number;
}

interface QuoteSummaryProps {
  quoteId?: string;
  tablesCount: number;
  aggregate: QuoteAggregate;
  isCalculating: boolean;
  savedQuote: QuoteResource | null;
  isSaving: boolean;
  canSave: boolean;
  isDownloadingPdf: boolean;
  onDownloadPdf: () => void;
}

export const QuoteSummary = ({
  quoteId,
  tablesCount,
  aggregate,
  isCalculating,
  savedQuote,
  isSaving,
  canSave,
  isDownloadingPdf,
  onDownloadPdf,
}: QuoteSummaryProps) => {
  const { t, formatMoney } = useLanguage();

  return (
  <aside className="sticky top-24 grid max-h-[calc(100vh-7rem)] content-start gap-4 self-start overflow-y-auto">
    <Card className="p-5">
      <p className="text-sm text-muted">{t("quotes.accumulatedValue")}</p>
      <p
        className={cn(
          "mt-2 text-4xl font-semibold text-foreground transition-all duration-300",
          isCalculating && "scale-[0.99] opacity-60",
        )}
      >
        {formatMoney(aggregate.totalAmount)}
      </p>
      <p className="mt-2 text-sm text-muted">
        {isCalculating ? t("quotes.recalculating") : t("quotes.previewLabel")}
      </p>

      <div className="mt-5 grid gap-3">
        <SummaryLine label={t("quotes.tablesCount")} value={String(tablesCount)} icon={Layers3} />
        <SummaryLine
          label={t("quotes.totalWeight")}
          value={`${aggregate.totalWeightGrams.toFixed(2)} g`}
          icon={Scale}
        />
        <SummaryLine
          label={t("quotes.totalTime")}
          value={`${aggregate.totalPrintHours.toFixed(2)} h`}
          icon={Clock3}
        />
        <SummaryLine
          label={t("quotes.painting")}
          value={`${aggregate.paintingHours.toFixed(2)} h`}
          icon={Paintbrush}
        />
        <SummaryLine
          label={t("quotes.finishing")}
          value={`${aggregate.finishingHours.toFixed(2)} h`}
          icon={Wrench}
        />
        <SummaryLine
          label={t("quotes.savedValue")}
          value={savedQuote ? formatMoney(savedQuote.totalAmount) : "--"}
          icon={Calculator}
        />
      </div>
    </Card>

    <button
      type="submit"
      disabled={isSaving || !canSave}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {quoteId ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}
      {isSaving ? t("quotes.saving") : quoteId ? t("quotes.saveQuote") : t("quotes.createQuote")}
    </button>

    {savedQuote ? (
      <button
        type="button"
        onClick={onDownloadPdf}
        disabled={isDownloadingPdf}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download className={cn("h-4 w-4", isDownloadingPdf && "animate-pulse")} />
        {isDownloadingPdf ? t("quotes.generatingPdf") : t("quotes.generatePdf")}
      </button>
    ) : null}
  </aside>
  );
};
