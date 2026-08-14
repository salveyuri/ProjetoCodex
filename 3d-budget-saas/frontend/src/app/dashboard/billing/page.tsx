"use client";

import type {
  BillingOverview,
  CheckoutResponse,
  PaymentResource,
  PlanResource,
  UsageMetric,
} from "@3d-budget/shared";
import {
  Check,
  CreditCard,
  ExternalLink,
  FileText,
  History,
  Package,
  Printer,
  ShieldCheck,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";

const statusLabels = {
  ACTIVE: "Ativo",
  CANCELED: "Cancelado",
  PAST_DUE: "Inadimplente",
} as const;

type NoticeTone = "success" | "warning";

const checkoutBanners: Record<string, { tone: NoticeTone; text: string }> = {
  success: {
    tone: "success",
    text: "Pagamento em processamento no Asaas. A confirmacao chega em instantes assim que eles notificarem — atualize esta pagina daqui a pouco.",
  },
  cancelled: {
    tone: "warning",
    text: "Checkout cancelado. Nenhuma cobranca foi feita.",
  },
  expired: {
    tone: "warning",
    text: "O link de checkout expirou. Tente assinar novamente.",
  },
};

const formatMoney = (value: number, currency: string): string =>
  value.toLocaleString("pt-BR", { style: "currency", currency });

const cycleLabel = (cycle: PlanResource["billingCycle"]): string =>
  cycle === "YEARLY" ? "/ano" : "/mes";

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const { isLoading: isAuthLoading, token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [plans, setPlans] = useState<PlanResource[]>([]);
  const [payments, setPayments] = useState<PaymentResource[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<
    { tone: NoticeTone; text: string } | null
  >(null);

  const loadBilling = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [billingResponse, plansResponse, paymentsResponse] = await Promise.all([
        api.get<BillingOverview>("/billing"),
        api.get<PlanResource[]>("/plans"),
        api.get<PaymentResource[]>("/billing/payments"),
      ]);
      setBilling(billingResponse.data);
      setPlans(plansResponse.data);
      setPayments(paymentsResponse.data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Nao foi possivel atualizar o plano."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void loadBilling();
    }
  }, [isAuthLoading, loadBilling]);

  useEffect(() => {
    const checkoutParam = searchParams.get("checkout");
    const banner = checkoutParam ? checkoutBanners[checkoutParam] : undefined;

    if (banner) {
      setCheckoutNotice(banner);
      router.replace("/dashboard/billing");
    }
  }, [searchParams, router]);

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

  const isSubmitting = submittingPlanId !== null;

  const subscribeToPlan = async (plan: PlanResource) => {
    setSubmittingPlanId(plan.id);
    setErrorMessage(null);
    setMessage(null);

    try {
      const { data } = await api.post<CheckoutResponse>("/billing/checkout", {
        planId: plan.id,
      });

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      if (data.billing) {
        setBilling(data.billing);
        setMessage(`Plano alterado para ${data.billing.plan.name}.`);
      }
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, "Nao foi possivel iniciar a assinatura."),
      );
    } finally {
      setSubmittingPlanId(null);
    }
  };

  const cancelPlan = async () => {
    setSubmittingPlanId("cancel");
    setErrorMessage(null);
    setMessage(null);

    try {
      const { data } = await api.post<BillingOverview>("/billing/cancel");
      setBilling(data);
      setMessage("Plano cancelado e limites Free reaplicados.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Nao foi possivel cancelar o plano."));
    } finally {
      setSubmittingPlanId(null);
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
              Assine um plano com checkout seguro do Asaas — o cartao de credito
              e processado inteiramente na pagina deles.
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

        {checkoutNotice ? (
          <div
            className={cn(
              "rounded-lg border px-4 py-3 text-sm",
              checkoutNotice.tone === "success"
                ? "border-secondary/40 bg-secondary/10 text-secondary"
                : "border-warning/40 bg-warning/10 text-warning",
            )}
          >
            {checkoutNotice.text}
          </div>
        ) : null}
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
          <>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <Card className="p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-sm text-muted">Plano atual</p>
                    <h2 className="mt-2 text-4xl font-semibold text-foreground">
                      {billing.plan.name}
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
                  <UsageCard icon={Printer} label="Maquinas" metric={billing.usage.machines} />
                  <UsageCard icon={Package} label="Materiais" metric={billing.usage.materials} />
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

              <Card className="content-start p-5">
                <div className="flex items-center gap-3">
                  <History className="h-5 w-5 text-secondary" />
                  <h2 className="text-xl font-semibold text-foreground">
                    Historico de faturas
                  </h2>
                </div>
                {payments.length === 0 ? (
                  <p className="mt-5 text-sm text-muted">
                    Nenhuma fatura ainda — aparecem aqui assim que a primeira
                    cobranca do Asaas for confirmada.
                  </p>
                ) : (
                  <ul className="mt-5 grid gap-3">
                    {payments.map((payment) => (
                      <li
                        key={payment.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {formatMoney(payment.value, billing.plan.currency)}
                          </p>
                          <p className="text-xs text-muted">
                            {payment.paymentDate
                              ? new Date(payment.paymentDate).toLocaleDateString("pt-BR")
                              : payment.dueDate
                                ? new Date(payment.dueDate).toLocaleDateString("pt-BR")
                                : "—"}
                            {" · "}
                            {payment.status}
                          </p>
                        </div>
                        {payment.invoiceUrl ? (
                          <a
                            href={payment.invoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            Ver <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>

            <section>
              <div className="mb-4 flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">
                  Planos disponiveis
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan) => {
                  const isCurrentPlan = billing.plan.id === plan.id;

                  return (
                    <Card key={plan.id} className="flex flex-col p-5">
                      <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                      <p className="mt-2 text-3xl font-semibold text-foreground">
                        {formatMoney(plan.price, plan.currency)}
                        <span className="text-sm font-normal text-muted">
                          {plan.price > 0 ? cycleLabel(plan.billingCycle) : ""}
                        </span>
                      </p>
                      {plan.description ? (
                        <p className="mt-2 text-sm text-muted">{plan.description}</p>
                      ) : null}
                      <ul className="mt-4 grid gap-2 text-sm text-muted">
                        <li>
                          Maquinas: {plan.limits.machines ?? "ilimitado"}
                        </li>
                        <li>
                          Materiais: {plan.limits.materials ?? "ilimitado"}
                        </li>
                        <li>
                          Orcamentos/mes: {plan.limits.monthlyQuotes ?? "ilimitado"}
                        </li>
                        {plan.features.customFormulas ? (
                          <li className="flex items-center gap-2 text-foreground">
                            <Check className="h-4 w-4 text-secondary" /> Formulas customizadas
                          </li>
                        ) : null}
                        {plan.features.pdfExport ? (
                          <li className="flex items-center gap-2 text-foreground">
                            <Check className="h-4 w-4 text-secondary" /> Exportacao PDF
                          </li>
                        ) : null}
                      </ul>
                      <button
                        type="button"
                        onClick={() => void subscribeToPlan(plan)}
                        disabled={isSubmitting || isCurrentPlan}
                        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isCurrentPlan ? "Plano atual" : "Assinar"}
                      </button>
                    </Card>
                  );
                })}
              </div>
              {billing.plan.price > 0 ? (
                <button
                  type="button"
                  onClick={() => void cancelPlan()}
                  disabled={isSubmitting}
                  className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-danger/40 px-4 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar assinatura
                  <XCircle className="h-4 w-4" />
                </button>
              ) : null}
            </section>
          </>
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
