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
import { cn } from "@/lib/cn";
import { toMoney } from "./quote-ui";
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
}: QuoteSummaryProps) => (
  <aside className="sticky top-24 grid max-h-[calc(100vh-7rem)] content-start gap-4 self-start overflow-y-auto">
    <Card className="p-5">
      <p className="text-sm text-muted">Valor acumulado</p>
      <p
        className={cn(
          "mt-2 text-4xl font-semibold text-foreground transition-all duration-300",
          isCalculating && "scale-[0.99] opacity-60",
        )}
      >
        {toMoney(aggregate.totalAmount)}
      </p>
      <p className="mt-2 text-sm text-muted">
        {isCalculating ? "Recalculando orcamento..." : "Preview do orcamento"}
      </p>

      <div className="mt-5 grid gap-3">
        <SummaryLine label="Mesas" value={String(tablesCount)} icon={Layers3} />
        <SummaryLine
          label="Peso total"
          value={`${aggregate.totalWeightGrams.toFixed(2)} g`}
          icon={Scale}
        />
        <SummaryLine
          label="Tempo total"
          value={`${aggregate.totalPrintHours.toFixed(2)} h`}
          icon={Clock3}
        />
        <SummaryLine
          label="Pintura"
          value={`${aggregate.paintingHours.toFixed(2)} h`}
          icon={Paintbrush}
        />
        <SummaryLine
          label="Acabamento"
          value={`${aggregate.finishingHours.toFixed(2)} h`}
          icon={Wrench}
        />
        <SummaryLine
          label="Valor salvo"
          value={savedQuote ? toMoney(savedQuote.totalAmount) : "--"}
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
      {isSaving ? "Salvando..." : quoteId ? "Salvar orcamento" : "Criar orcamento"}
    </button>

    {savedQuote ? (
      <button
        type="button"
        onClick={onDownloadPdf}
        disabled={isDownloadingPdf}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download className={cn("h-4 w-4", isDownloadingPdf && "animate-pulse")} />
        {isDownloadingPdf ? "Gerando PDF..." : "Gerar PDF"}
      </button>
    ) : null}
  </aside>
);
