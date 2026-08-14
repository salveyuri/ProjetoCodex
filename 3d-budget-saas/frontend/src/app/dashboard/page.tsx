"use client";

import type {
  PaginatedQuoteList,
  QuoteListItem,
  QuoteResource,
} from "@3d-budget/shared";
import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  FileText,
  Printer,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SystemStatusCard } from "@/components/dashboard/SystemStatusCard";
import { MainLayout } from "@/components/layout/MainLayout";
import {
  formatDate,
  quoteStatusLabels,
  quoteStatusTones,
  toMoney,
} from "@/components/quotes/quote-ui";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";

interface DashboardMetric {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}

const isCurrentMonth = (value: string): boolean => {
  const date = new Date(value);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
};

const getEstimatedProfit = (quotes: QuoteResource[]): number =>
  quotes.reduce(
    (quoteTotal, quote) =>
      quoteTotal +
      quote.items.reduce(
        (itemTotal, item) =>
          itemTotal + Math.max(item.finalPrice - item.baseCost, 0),
        0,
      ),
    0,
  );

const getMostUsedPrinter = (quotes: QuoteResource[]): string => {
  const usage = new Map<string, number>();

  for (const quote of quotes) {
    for (const item of quote.items) {
      usage.set(item.machineName, (usage.get(item.machineName) ?? 0) + 1);
    }
  }

  return [...usage.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "--";
};

export default function DashboardPage() {
  const { isLoading: isAuthLoading, token } = useAuth();
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [quoteDetails, setQuoteDetails] = useState<QuoteResource[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<PaginatedQuoteList>("/quotes", {
        params: { page: 1, pageSize: 100 },
      });
      const quoteList = response.data.data;
      const currentMonthQuotes = quoteList.filter((quote) =>
        isCurrentMonth(quote.createdAt),
      );
      const detailResponses = await Promise.all(
        currentMonthQuotes
          .slice(0, 50)
          .map((quote) => api.get<QuoteResource>(`/quotes/${quote.id}`)),
      );

      setQuotes(quoteList);
      setQuoteDetails(detailResponses.map((detail) => detail.data));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Nao foi possivel carregar o dashboard."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void loadDashboard();
    }
  }, [isAuthLoading, loadDashboard]);

  const currentMonthQuotes = useMemo(
    () => quotes.filter((quote) => isCurrentMonth(quote.createdAt)),
    [quotes],
  );

  const conversionRate = useMemo(() => {
    const approved = currentMonthQuotes.filter(
      (quote) => quote.status === "APPROVED",
    ).length;
    const sentPipeline = currentMonthQuotes.filter((quote) =>
      ["SENT", "APPROVED", "REJECTED"].includes(quote.status),
    ).length;

    if (sentPipeline === 0) {
      return 0;
    }

    return Math.round((approved / sentPipeline) * 100);
  }, [currentMonthQuotes]);

  const metrics: DashboardMetric[] = [
    {
      label: "Orcamentos do mes",
      value: String(currentMonthQuotes.length),
      detail: `${quotes.length} no historico`,
      icon: FileText,
    },
    {
      label: "Taxa de conversao",
      value: `${conversionRate}%`,
      detail: "Aprovados sobre propostas enviadas",
      icon: TrendingUp,
    },
    {
      label: "Lucro estimado",
      value: toMoney(getEstimatedProfit(quoteDetails)),
      detail: "Final - custo base dos snapshots",
      icon: WalletCards,
    },
    {
      label: "Impressora mais usada",
      value: getMostUsedPrinter(quoteDetails),
      detail: "Contagem por mesa no mes",
      icon: Printer,
    },
  ];

  const recentQuotes = quotes.slice(0, 5);

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 sm:flex-row sm:items-end">
          <div>
            <StatusBadge tone="success">Visao geral</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Dashboard de orcamentos 3D
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Acompanhe propostas, conversao, lucro estimado e atividade recente
              em um unico painel operacional.
            </p>
          </div>
          <Link
            href="/dashboard/quotes/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Novo orcamento
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </section>

        {errorMessage ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="min-h-36" />
              ))
            : metrics.map((metric) => (
                <MetricCard key={metric.label} metric={metric} />
              ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border p-5">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Atividade recente
                  </h2>
                  <p className="text-sm text-muted">
                    Ultimos 5 orcamentos criados.
                  </p>
                </div>
              </div>
              <Link
                href="/dashboard/quotes"
                className="text-sm font-semibold text-primary transition hover:text-primary/80"
              >
                Ver todos
              </Link>
            </div>

            {isLoading ? (
              <div className="grid gap-3 p-5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex min-h-16 items-center justify-between gap-4 rounded-lg border border-border bg-background px-4"
                  >
                    <div className="grid flex-1 gap-2">
                      <SkeletonText className="w-44" />
                      <SkeletonText className="w-28" />
                    </div>
                    <SkeletonText className="w-20" />
                  </div>
                ))}
              </div>
            ) : recentQuotes.length > 0 ? (
              <div className="divide-y divide-border">
                {recentQuotes.map((quote) => (
                  <Link
                    key={quote.id}
                    href={`/dashboard/quotes/${quote.id}`}
                    className="grid gap-3 p-5 transition hover:bg-surface-muted/60 md:grid-cols-[minmax(0,1fr)_150px_120px]"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {quote.customerName}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {quote.itemsCount} mesa(s), {quote.totalWeightGrams.toFixed(1)} g
                      </p>
                    </div>
                    <div className="text-sm text-muted">
                      <CalendarClock className="mr-1 inline h-4 w-4 text-primary" />
                      {formatDate(quote.createdAt)}
                    </div>
                    <div className="flex items-center justify-between gap-3 md:justify-end">
                      <span className="text-sm font-semibold text-foreground">
                        {toMoney(quote.totalAmount)}
                      </span>
                      <StatusBadge tone={quoteStatusTones[quote.status]}>
                        {quoteStatusLabels[quote.status]}
                      </StatusBadge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-5">
                <EmptyState
                  actionHref="/dashboard/quotes/new"
                  actionLabel="Criar primeiro orcamento"
                  description="Configure maquinas e materiais, depois crie uma proposta com mesas de impressao."
                  icon={FileText}
                  title="Nenhum orcamento ainda"
                />
              </div>
            )}
          </Card>

          <SystemStatusCard />
        </section>
      </div>
    </MainLayout>
  );
}

const MetricCard = ({ metric }: { metric: DashboardMetric }) => {
  const Icon = metric.icon;

  return (
    <Card className="min-h-36 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">{metric.label}</p>
          <p className="mt-3 truncate text-3xl font-semibold text-foreground">
            {metric.value}
          </p>
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-background text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">{metric.detail}</p>
    </Card>
  );
};
