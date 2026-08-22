"use client";

import type {
  BillingOverview,
  CheckoutResponse,
  CouponPreviewResponse,
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
  Tag,
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
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import type { TranslationKey } from "@/lib/i18n";

const statusLabelKeys: Record<BillingOverview["subscriptionStatus"], TranslationKey> = {
  ACTIVE: "billing.statusActive",
  CANCELED: "billing.statusCanceled",
  PAST_DUE: "billing.statusPastDue",
};

type NoticeTone = "success" | "warning";

const checkoutBannerKeys: Record<string, { tone: NoticeTone; textKey: TranslationKey }> = {
  success: { tone: "success", textKey: "billing.checkoutSuccess" },
  cancelled: { tone: "warning", textKey: "billing.checkoutCancelled" },
  expired: { tone: "warning", textKey: "billing.checkoutExpired" },
};

// Subscription charges always run in BRL through Asaas (a Brazilian-only
// payment processor) regardless of the viewer's language — showing $ here
// would misrepresent what actually gets charged. Deliberately NOT wired to
// useLanguage() (Contextos/Decisoes.md, 2026-08-17).
const formatMoney = (value: number, currency: string): string =>
  value.toLocaleString("pt-BR", { style: "currency", currency });

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const { isLoading: isAuthLoading, token } = useAuth();
  const { t, formatDate } = useLanguage();
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
    { tone: NoticeTone; textKey: TranslationKey } | null
  >(null);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponPreviewResponse | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isCheckingCoupon, setIsCheckingCoupon] = useState(false);

  const cycleLabel = useCallback(
    (cycle: PlanResource["billingCycle"]): string =>
      cycle === "YEARLY" ? t("billing.cyclePerYear") : t("billing.cyclePerMonth"),
    [t],
  );

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
      setErrorMessage(getApiErrorMessage(error, t("billing.errorRefresh")));
    } finally {
      setIsLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void loadBilling();
    }
  }, [isAuthLoading, loadBilling]);

  useEffect(() => {
    const checkoutParam = searchParams.get("checkout");
    const banner = checkoutParam ? checkoutBannerKeys[checkoutParam] : undefined;

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
              label: t("billing.customFormulas"),
              enabled: billing.entitlements.customFormulas,
            },
            {
              label: t("billing.pdfExport"),
              enabled: billing.entitlements.pdfExport,
            },
          ]
        : [],
    [billing, t],
  );

  const isSubmitting = submittingPlanId !== null;

  // Only Brazil is billed in BRL — everyone else sees the admin-set USD
  // reference price when one exists (falls back to BRL otherwise). This
  // never changes what Asaas actually charges (see formatMoney comment
  // above and Contextos/Decisoes.md, 2026-08-17).
  const showUsd = billing?.companyCountry !== "BR";

  const planPriceDisplay = (plan: PlanResource): string =>
    showUsd && plan.priceUsd !== null
      ? formatMoney(plan.priceUsd, "USD")
      : formatMoney(plan.price, plan.currency);

  // discountPercent only ever applies to the BRL price actually charged by
  // Asaas — the USD figure is a display-only reference (see
  // planPriceDisplay/formatMoney above), so a discounted price is only
  // shown for plans billed in BRL.
  const discountedPriceDisplay = (plan: PlanResource): string | null =>
    appliedCoupon && !showUsd
      ? formatMoney(
          plan.price * (1 - appliedCoupon.discountPercent / 100),
          plan.currency,
        )
      : null;

  const applyCoupon = async () => {
    const code = couponCodeInput.trim();

    if (!code) {
      return;
    }

    setIsCheckingCoupon(true);
    setCouponError(null);

    try {
      const { data } = await api.get<CouponPreviewResponse>(
        `/billing/coupons/${encodeURIComponent(code)}`,
      );
      setAppliedCoupon(data);
    } catch (error) {
      setAppliedCoupon(null);
      setCouponError(getApiErrorMessage(error, t("billing.couponInvalid")));
    } finally {
      setIsCheckingCoupon(false);
    }
  };

  const clearCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput("");
    setCouponError(null);
  };

  const subscribeToPlan = async (plan: PlanResource) => {
    setSubmittingPlanId(plan.id);
    setErrorMessage(null);
    setMessage(null);

    try {
      const { data } = await api.post<CheckoutResponse>("/billing/checkout", {
        planId: plan.id,
        couponCode: appliedCoupon?.code,
      });

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      if (data.billing) {
        setBilling(data.billing);
        setMessage(t("billing.planChangedMsg", { planName: data.billing.plan.name }));
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, t("billing.errorSubscribe")));
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
      setMessage(t("billing.planCanceledMsg"));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, t("billing.errorCancel")));
    } finally {
      setSubmittingPlanId(null);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">{t("billing.badge")}</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              {t("billing.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">{t("billing.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadBilling()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20"
          >
            <CreditCard className="h-4 w-4" />
            {t("billing.refresh")}
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
            {t(checkoutNotice.textKey)}
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
                    <p className="text-sm text-muted">{t("billing.currentPlan")}</p>
                    <h2 className="mt-2 text-4xl font-semibold text-foreground">
                      {billing.plan.name}
                    </h2>
                    <p className="mt-2 text-sm text-muted">
                      {billing.companyName} - {t(statusLabelKeys[billing.subscriptionStatus])}
                    </p>
                    {billing.coupon ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-secondary">
                        <Tag className="h-3.5 w-3.5" />
                        {t("billing.couponApplied", {
                          code: billing.coupon.code,
                          percent: billing.coupon.discountPercent,
                        })}
                        {billing.coupon.type === "ONE_TIME"
                          ? ` (${t("billing.couponOneTimeShort")})`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge
                    tone={billing.subscriptionStatus === "ACTIVE" ? "success" : "warning"}
                  >
                    {billing.subscriptionStatus}
                  </StatusBadge>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <UsageCard icon={Printer} label={t("billing.machines")} metric={billing.usage.machines} />
                  <UsageCard icon={Package} label={t("billing.materials")} metric={billing.usage.materials} />
                  <UsageCard
                    icon={FileText}
                    label={t("billing.monthlyQuotes")}
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
                        {feature.enabled ? t("billing.included") : t("billing.upgrade")}
                      </StatusBadge>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="content-start p-5">
                <div className="flex items-center gap-3">
                  <History className="h-5 w-5 text-secondary" />
                  <h2 className="text-xl font-semibold text-foreground">
                    {t("billing.invoiceHistory")}
                  </h2>
                </div>
                {payments.length === 0 ? (
                  <p className="mt-5 text-sm text-muted">{t("billing.noInvoices")}</p>
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
                              ? formatDate(payment.paymentDate)
                              : payment.dueDate
                                ? formatDate(payment.dueDate)
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
                            {t("billing.view")} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>

            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Tag className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  {t("billing.couponTitle")}
                </h2>
              </div>
              <p className="mt-2 text-sm text-muted">{t("billing.couponSubtitle")}</p>

              {appliedCoupon ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-secondary">
                      {t("billing.couponApplied", {
                        code: appliedCoupon.code,
                        percent: appliedCoupon.discountPercent,
                      })}
                    </p>
                    {appliedCoupon.type === "ONE_TIME" ? (
                      <p className="mt-1 text-xs text-secondary/80">
                        {t("billing.couponOneTimeNote")}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={clearCoupon}
                    className="text-xs font-semibold text-secondary underline-offset-2 hover:underline"
                  >
                    {t("billing.couponRemove")}
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={couponCodeInput}
                    onChange={(event) => setCouponCodeInput(event.target.value.toUpperCase())}
                    placeholder={t("billing.couponPlaceholder")}
                    className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 font-mono text-sm outline-none focus:border-primary sm:max-w-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void applyCoupon()}
                    disabled={isCheckingCoupon || !couponCodeInput.trim()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCheckingCoupon ? t("billing.couponChecking") : t("billing.couponApply")}
                  </button>
                </div>
              )}
              {couponError ? (
                <p className="mt-2 text-xs font-medium text-danger">{couponError}</p>
              ) : null}
            </Card>

            <section>
              <div className="mb-4 flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">
                  {t("billing.availablePlans")}
                </h2>
              </div>
              {showUsd ? (
                <p className="mb-4 max-w-2xl text-xs text-muted">
                  {t("billing.usdDisclaimer")}
                </p>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan) => {
                  const isCurrentPlan = billing.plan.id === plan.id;

                  const discountedPrice =
                    plan.price > 0 ? discountedPriceDisplay(plan) : null;

                  return (
                    <Card key={plan.id} className="flex flex-col p-5">
                      <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                      {discountedPrice ? (
                        <p className="mt-2 text-sm text-muted line-through">
                          {planPriceDisplay(plan)}
                        </p>
                      ) : null}
                      <p className="mt-1 text-3xl font-semibold text-foreground">
                        {discountedPrice ?? planPriceDisplay(plan)}
                        <span className="text-sm font-normal text-muted">
                          {plan.price > 0 ? cycleLabel(plan.billingCycle) : ""}
                        </span>
                      </p>
                      {discountedPrice && appliedCoupon?.type === "ONE_TIME" ? (
                        <p className="mt-1 text-xs text-muted">
                          {t("billing.couponOneTimePriceNote", {
                            price: planPriceDisplay(plan),
                          })}
                        </p>
                      ) : null}
                      {plan.description ? (
                        <p className="mt-2 text-sm text-muted">{plan.description}</p>
                      ) : null}
                      <ul className="mt-4 grid gap-2 text-sm text-muted">
                        <li>
                          {t("billing.machines")}: {plan.limits.machines ?? t("billing.unlimited")}
                        </li>
                        <li>
                          {t("billing.materials")}: {plan.limits.materials ?? t("billing.unlimited")}
                        </li>
                        <li>
                          {t("billing.monthlyQuotes")}: {plan.limits.monthlyQuotes ?? t("billing.unlimited")}
                        </li>
                        {plan.features.customFormulas ? (
                          <li className="flex items-center gap-2 text-foreground">
                            <Check className="h-4 w-4 text-secondary" /> {t("billing.customFormulas")}
                          </li>
                        ) : null}
                        {plan.features.pdfExport ? (
                          <li className="flex items-center gap-2 text-foreground">
                            <Check className="h-4 w-4 text-secondary" /> {t("billing.pdfExport")}
                          </li>
                        ) : null}
                      </ul>
                      <button
                        type="button"
                        onClick={() => void subscribeToPlan(plan)}
                        disabled={isSubmitting || isCurrentPlan}
                        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isCurrentPlan ? t("billing.currentPlanButton") : t("billing.subscribe")}
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
                  {t("billing.cancelSubscription")}
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
  const { t } = useLanguage();
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
            {t("billing.usedOf", { used: metric.used, limit: metric.limit ?? t("billing.unlimited") })}
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
        {metric.limit === null ? t("billing.noLimitDefined") : t("billing.usedPercent", { percent: percentage })}
      </div>
    </div>
  );
};
