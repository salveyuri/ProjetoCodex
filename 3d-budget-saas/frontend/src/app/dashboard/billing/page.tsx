"use client";

import type {
  BillingOverview,
  BillingPlanChangeResponse,
  UsageMetric,
} from "@3d-budget/shared";
import axios from "axios";
import {
  ArrowUpRight,
  CreditCard,
  FileText,
  History,
  Package,
  Printer,
  ShieldCheck,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

const planLabels = {
  FREE: "Free",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
} as const;

const statusLabels = {
  ACTIVE: "Ativo",
  CANCELED: "Cancelado",
  PAST_DUE: "Inadimplente",
} as const;

const getApiErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Nao foi possivel atualizar o plano.";
};

export default function BillingPage() {
  const { isLoading: isAuthLoading, token } = useAuth();
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadBilling = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data } = await api.get<BillingOverview>("/billing");
      setBilling(data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void loadBilling();
    }
  }, [isAuthLoading, loadBilling]);

  const features = useMemo(
    () =>
      billing
        ? [
            {
              label: "Formulas customizadas",
              enabled: billing.entitlements.customFormulas,
            },
            {
              label: "Exportacao PDF",
              enabled: billing.entitlements.pdfExport,
            },
          ]
        : [],
    [billing],
  );

  const upgradeToPro = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const { data } = await api.post<BillingPlanChangeResponse>(
        "/billing/upgrade",
        { planType: "PRO" },
      );
      setBilling(data.billing);
      setMessage(`Upgrade aprovado no gateway mock: ${data.payment.transactionId}`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelPlan = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const { data } = await api.post<BillingOverview>("/billing/cancel");
      setBilling(data);
      setMessage("Plano cancelado e limites Free reaplicados.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">Monetizacao</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Plano e faturamento
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Controle uso, limites e upgrades da empresa antes de integrar o Stripe real.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadBilling()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20"
          >
            <CreditCard className="h-4 w-4" />
            Atualizar
          </button>
        </section>

        {errorMessage ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3 text-sm text-secondary">
            {message}
          </div>
        ) : null}

        {isLoading ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Skeleton className="min-h-80" />
            <Skeleton className="min-h-80" />
          </section>
        ) : billing ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="text-sm text-muted">Plano atual</p>
                  <h2 className="mt-2 text-4xl font-semibold text-foreground">
                    {planLabels[billing.planType]}
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    {billing.companyName} - {statusLabels[billing.subscriptionStatus]}
                  </p>
                </div>
                <StatusBadge
                  tone={billing.subscriptionStatus === "ACTIVE" ? "success" : "warning"}
                >
                  {billing.subscriptionStatus}
                </StatusBadge>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <UsageCard
                  icon={Printer}
                  label="Maquinas"
                  metric={billing.usage.machines}
                />
                <UsageCard
                  icon={Package}
                  label="Materiais"
                  metric={billing.usage.materials}
                />
                <UsageCard
                  icon={FileText}
                  label="Orcamentos/mes"
                  metric={billing.usage.monthlyQuotes}
                />
              </div>

              <div className="mt-6 grid gap-3">
                {features.map((feature) => (
                  <div
                    key={feature.label}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3"
                  >
                    <span className="text-sm text-muted">{feature.label}</span>
                    <StatusBadge tone={feature.enabled ? "success" : "warning"}>
                      {feature.enabled ? "incluido" : "upgrade"}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid content-start gap-4">
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold text-foreground">
                    Upgrade
                  </h2>
                </div>
                <p className="mt-3 text-sm text-muted">
                  Pro libera maquinas, materiais, formulas customizadas e PDF.
                </p>
                <button
                  type="button"
                  onClick={() => void upgradeToPro()}
                  disabled={isSubmitting || billing.planType === "PRO"}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Upgrade para Pro
                  <ArrowUpRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void cancelPlan()}
                  disabled={isSubmitting || billing.planType === "FREE"}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-danger/40 px-4 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar plano
                  <XCircle className="h-4 w-4" />
                </button>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <History className="h-5 w-5 text-secondary" />
                  <h2 className="text-xl font-semibold text-foreground">
                    Historico de faturas
                  </h2>
                </div>
                <div className="mt-5 grid gap-3">
                  <SkeletonText className="w-3/4" />
                  <SkeletonText className="w-1/2" />
                  <p className="text-sm text-muted">
                    Placeholder pronto para webhooks e invoices do Stripe.
                  </p>
                </div>
              </Card>
            </div>
          </section>
        ) : null}
      </div>
    </MainLayout>
  );
}

const UsageCard = ({
  icon: Icon,
  label,
  metric,
}: {
  icon: LucideIcon;
  label: string;
  metric: UsageMetric;
}) => {
  const percentage =
    metric.limit === null
      ? 100
      : Math.min(100, Math.round((metric.used / Math.max(metric.limit, 1)) * 100));

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-sm text-muted">
            {metric.used} de {metric.limit ?? "ilimitado"}
          </p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            metric.limit === null || percentage < 80
              ? "bg-secondary"
              : "bg-warning",
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <ShieldCheck className="h-4 w-4 text-secondary" />
        {metric.limit === null ? "Sem limite definido" : `${percentage}% utilizado`}
      </div>
    </div>
  );
};
