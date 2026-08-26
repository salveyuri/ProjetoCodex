"use client";

import type { UserAnalyticsOverview } from "@3d-budget/shared";
import { localeForLanguage } from "@3d-budget/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Download,
  FileJson,
  HardDriveDownload,
  PieChart as PieChartIcon,
  Printer,
  RefreshCcw,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";

const chartColors = ["#818cf8", "#22c55e", "#06b6d4", "#f59e0b", "#ef4444"];

const defaultRange = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function AnalyticsPage() {
  const { isLoading: isAuthLoading, token } = useAuth();
  const { t, language, formatMoney } = useLanguage();
  const initialRange = useMemo(defaultRange, []);
  const [range, setRange] = useState(initialRange);
  const [analytics, setAnalytics] = useState<UserAnalyticsOverview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const formatMonth = useCallback(
    (month: string): string => {
      const [year, monthIndex] = month.split("-").map(Number);
      return new Intl.DateTimeFormat(localeForLanguage(language), {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(year, monthIndex - 1, 1)));
    },
    [language],
  );

  const loadAnalytics = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data } = await api.get<UserAnalyticsOverview>(
        "/analytics/overview",
        { params: range },
      );
      setAnalytics(data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, t("analytics.errorLoad")));
    } finally {
      setIsLoading(false);
    }
  }, [range, t, token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void loadAnalytics();
    }
  }, [isAuthLoading, loadAnalytics]);

  const exportData = async (format: "csv" | "json") => {
    setIsExporting(format);
    setErrorMessage(null);

    try {
      const response = await api.get<Blob>("/analytics/export", {
        params: { ...range, format },
        responseType: "blob",
      });
      const filename = `analytics_${range.from}_${range.to}.${format}`;
      downloadBlob(response.data, filename);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, t("analytics.errorExport")));
    } finally {
      setIsExporting(null);
    }
  };

  const monthlyFinancials = analytics?.monthlyFinancials.map((point) => ({
    ...point,
    label: formatMonth(point.month),
  })) ?? [];
  const hasData = analytics ? analytics.summary.quotesCount > 0 : false;

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">{t("analytics.badge")}</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              {t("analytics.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">{t("analytics.subtitle")}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void exportData("csv")}
              disabled={!hasData || isExporting !== null}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => void exportData("json")}
              disabled={!hasData || isExporting !== null}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-secondary/40 bg-secondary/10 px-4 text-sm font-semibold text-secondary transition hover:bg-secondary/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileJson className="h-4 w-4" />
              JSON
            </button>
          </div>
        </section>

        <Card className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-2 text-sm font-semibold text-foreground">
            {t("analytics.rangeStart")}
            <input
              type="date"
              value={range.from}
              onChange={(event) =>
                setRange((current) => ({ ...current, from: event.target.value }))
              }
              className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-foreground">
            {t("analytics.rangeEnd")}
            <input
              type="date"
              value={range.to}
              onChange={(event) =>
                setRange((current) => ({ ...current, to: event.target.value }))
              }
              className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadAnalytics()}
            className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <RefreshCcw className="h-4 w-4" />
            {t("analytics.refresh")}
          </button>
        </Card>

        {errorMessage ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <AnalyticsSkeleton />
        ) : analytics && hasData ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={BarChart3}
                label={t("analytics.metricQuotes")}
                value={String(analytics.summary.quotesCount)}
                detail={t("analytics.metricQuotesDetail", {
                  count: analytics.summary.approvedQuotesCount,
                })}
              />
              <MetricCard
                icon={TrendingUp}
                label={t("analytics.metricRevenue")}
                value={formatMoney(analytics.summary.revenue)}
                detail={t("analytics.metricRevenueDetail", {
                  value: formatMoney(analytics.summary.averageTicket),
                })}
              />
              <MetricCard
                icon={HardDriveDownload}
                label={t("analytics.metricProfit")}
                value={formatMoney(analytics.summary.profit)}
                detail={t("analytics.metricProfitDetail")}
              />
              <MetricCard
                icon={Printer}
                label={t("analytics.metricPrintedHours")}
                value={`${analytics.summary.totalPrintHours.toFixed(1)} h`}
                detail={t("analytics.metricPrintedHoursDetail", {
                  weight: analytics.summary.totalWeightGrams.toFixed(0),
                })}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {t("analytics.revenueVsProfitTitle")}
                    </h2>
                    <p className="text-sm text-muted">
                      {t("analytics.revenueVsProfitSubtitle")}
                    </p>
                  </div>
                </div>
                <div className="mt-5 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyFinancials}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="label" stroke="#a1a1aa" />
                      <YAxis stroke="#a1a1aa" />
                      <Tooltip
                        formatter={(value) => formatMoney(Number(value))}
                        contentStyle={{
                          background: "#09090b",
                          border: "1px solid #3f3f46",
                          borderRadius: 8,
                        }}
                      />
                      <Legend />
                      <Bar dataKey="revenue" name={t("analytics.revenueLegend")} fill="#818cf8" />
                      <Bar dataKey="profit" name={t("analytics.profitLegend")} fill="#22c55e" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <PieChartIcon className="h-5 w-5 text-secondary" />
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {t("analytics.materialMixTitle")}
                    </h2>
                    <p className="text-sm text-muted">{t("analytics.materialMixSubtitle")}</p>
                  </div>
                </div>
                <div className="mt-5 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.materialMix}
                        dataKey="weightGrams"
                        nameKey="label"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={3}
                      >
                        {analytics.materialMix.map((entry, index) => (
                          <Cell
                            key={entry.materialType}
                            fill={chartColors[index % chartColors.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, props) => [
                          `${Number(value).toFixed(1)} g`,
                          `${props.payload.percentage}%`,
                        ]}
                        contentStyle={{
                          background: "#09090b",
                          border: "1px solid #3f3f46",
                          borderRadius: 8,
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </section>

            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Printer className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    {t("analytics.machineOccupancyTitle")}
                  </h2>
                  <p className="text-sm text-muted">
                    {t("analytics.machineOccupancySubtitle", {
                      count: analytics.machineOccupancy.length,
                    })}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                {analytics.machineOccupancy.map((machine) => (
                  <div
                    key={machine.machineId}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-foreground">
                          {machine.machineName}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          {t("analytics.machineHoursDetail", {
                            printed: machine.printedHours.toFixed(1),
                            capacity: machine.capacityHours.toFixed(0),
                          })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-primary">
                        {machine.occupancyPercent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(machine.occupancyPercent, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        ) : (
          <EmptyState
            actionHref="/dashboard/quotes/new"
            actionLabel={t("analytics.emptyAction")}
            description={t("analytics.emptyDescription")}
            icon={BarChart3}
            title={t("analytics.emptyTitle")}
          />
        )}
      </div>
    </MainLayout>
  );
}

const MetricCard = ({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) => (
  <Card className="min-h-32 p-5">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-3 truncate text-2xl font-semibold text-foreground">
          {value}
        </p>
      </div>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-background text-primary">
        <Icon className="h-5 w-5" />
      </div>
    </div>
    <p className="mt-4 text-sm text-muted">{detail}</p>
  </Card>
);

const AnalyticsSkeleton = () => (
  <div className="grid gap-4">
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="min-h-32" />
      ))}
    </section>
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
      <Card className="p-5">
        <SkeletonText className="w-48" />
        <Skeleton className="mt-5 h-80" />
      </Card>
      <Card className="p-5">
        <SkeletonText className="w-44" />
        <Skeleton className="mt-5 h-80" />
      </Card>
    </section>
  </div>
);
