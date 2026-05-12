"use client";

import type { AdminAnalyticsOverview } from "@3d-budget/shared";
import axios from "axios";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  DollarSign,
  RefreshCcw,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MainLayout } from "@/components/layout/MainLayout";
import { toMoney } from "@/components/quotes/quote-ui";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

const getApiErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Nao foi possivel carregar analytics admin.";
};

const actionLabels: Record<string, string> = {
  ADMIN_USER_UPDATED: "Usuario/plano alterado",
  BILLING_UPGRADED: "Upgrade de plano",
  BILLING_CANCELED: "Plano cancelado",
  FORMULA_CREATED: "Formula criada",
  FORMULA_CREATED_AS_DEFAULT: "Formula criada como padrao",
  FORMULA_UPDATED: "Formula atualizada",
  FORMULA_DEFAULT_CHANGED: "Formula padrao alterada",
  FORMULA_DELETED: "Formula removida",
};

export default function AdminAnalyticsPage() {
  const { isLoading: isAuthLoading, token, refreshUser } = useAuth();
  const [analytics, setAnalytics] = useState<AdminAnalyticsOverview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setIsAccessDenied(false);

    try {
      const { data } = await api.get<AdminAnalyticsOverview>("/admin/analytics");
      setAnalytics(data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setIsAccessDenied(true);
      } else {
        setErrorMessage(getApiErrorMessage(error));
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void (async () => {
        if (token) {
          await refreshUser();
        }

        await loadAnalytics();
      })();
    }
  }, [isAuthLoading, loadAnalytics, refreshUser, token]);

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">Admin BI</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Analytics da plataforma
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Acompanhe crescimento, MRR mock, auditoria e erros recentes do
              SaaS em uma visao operacional.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAnalytics()}
            disabled={!token}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
        </section>

        {isAccessDenied ? (
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-1 h-5 w-5 text-warning" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Acesso restrito
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Esta area esta disponivel apenas para usuarios com role ADMIN.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {errorMessage ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        {!isAccessDenied && isLoading ? <AdminAnalyticsSkeleton /> : null}

        {!isAccessDenied && !isLoading && analytics ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={<UsersRound className="h-5 w-5" />}
                label="Usuarios ativos"
                value={`${analytics.summary.activeUsers}/${analytics.summary.totalUsers}`}
                detail="Contas ativas sobre total"
              />
              <MetricCard
                icon={<Building2 className="h-5 w-5" />}
                label="Empresas ativas"
                value={String(analytics.summary.activeCompanies)}
                detail="Assinatura ACTIVE"
              />
              <MetricCard
                icon={<DollarSign className="h-5 w-5" />}
                label="MRR estimado"
                value={toMoney(analytics.summary.estimatedMrr)}
                detail="PRO R$99, Enterprise R$299"
              />
              <MetricCard
                icon={<AlertTriangle className="h-5 w-5" />}
                label="Erros 24h"
                value={String(analytics.summary.systemErrors24h)}
                detail={`${analytics.summary.quotesThisMonth} orcamentos no mes`}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      Planos e MRR
                    </h2>
                    <p className="text-sm text-muted">
                      Distribuicao por plano com receita recorrente mockada.
                    </p>
                  </div>
                </div>
                <div className="mt-5 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.planDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="planType" stroke="#a1a1aa" />
                      <YAxis stroke="#a1a1aa" />
                      <Tooltip
                        contentStyle={{
                          background: "#09090b",
                          border: "1px solid #3f3f46",
                          borderRadius: 8,
                        }}
                      />
                      <Bar dataKey="companies" name="Empresas" fill="#818cf8" />
                      <Bar dataKey="mrr" name="MRR" fill="#22c55e" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-xl font-semibold text-foreground">
                  Receita do mes
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Soma global de orcamentos criados no mes corrente.
                </p>
                <p className="mt-8 text-4xl font-semibold text-foreground">
                  {toMoney(analytics.summary.revenueThisMonth)}
                </p>
                <div className="mt-6 rounded-lg border border-border bg-background p-4">
                  <p className="text-sm text-muted">Cache de metricas</p>
                  <p className="mt-2 text-lg font-semibold text-primary">
                    {analytics.cacheTtlSeconds / 60} min
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Ultima geracao:{" "}
                    {new Date(analytics.generatedAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              </Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <Card className="overflow-hidden">
                <div className="border-b border-border p-5">
                  <h2 className="text-xl font-semibold text-foreground">
                    Erros recentes
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Capturados pelo middleware global do backend.
                  </p>
                </div>
                {analytics.recentErrors.length > 0 ? (
                  <div className="divide-y divide-border">
                    {analytics.recentErrors.map((error) => (
                      <div key={error.id} className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-foreground">
                              {error.code ?? "INTERNAL_SERVER_ERROR"}
                            </p>
                            <p className="mt-1 text-sm text-muted">
                              {error.message}
                            </p>
                          </div>
                          <StatusBadge
                            tone={error.severity === "error" ? "danger" : "warning"}
                          >
                            {error.statusCode ?? "--"}
                          </StatusBadge>
                        </div>
                        <p className="mt-3 text-xs text-muted">
                          {error.method ?? "--"} {error.path ?? "--"} -{" "}
                          {new Date(error.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    description="Nenhum erro foi registrado nas consultas recentes."
                    icon={AlertTriangle}
                    title="Sem erros recentes"
                  />
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b border-border p-5">
                  <h2 className="text-xl font-semibold text-foreground">
                    Auditoria recente
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Alteracoes sensiveis de planos, usuarios e formulas.
                  </p>
                </div>
                {analytics.recentAuditLogs.length > 0 ? (
                  <div className="divide-y divide-border">
                    {analytics.recentAuditLogs.map((log) => (
                      <div key={log.id} className="p-5">
                        <p className="font-medium text-foreground">
                          {actionLabels[log.action] ?? log.action}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          {log.actorEmail ?? "Sistema"} em {log.entityType}
                        </p>
                        <p className="mt-3 text-xs text-muted">
                          {new Date(log.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    description="As proximas alteracoes administrativas aparecerao aqui."
                    icon={ShieldAlert}
                    title="Sem auditoria ainda"
                  />
                )}
              </Card>
            </section>
          </>
        ) : null}
      </div>
    </MainLayout>
  );
}

const MetricCard = ({
  detail,
  icon,
  label,
  value,
}: {
  detail: string;
  icon: ReactNode;
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
        {icon}
      </div>
    </div>
    <p className="mt-4 text-sm text-muted">{detail}</p>
  </Card>
);

const AdminAnalyticsSkeleton = () => (
  <div className="grid gap-4">
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="min-h-32" />
      ))}
    </section>
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="p-5">
        <SkeletonText className="w-44" />
        <Skeleton className="mt-5 h-80" />
      </Card>
      <Card className="p-5">
        <SkeletonText className="w-40" />
        <Skeleton className="mt-8 h-32" />
      </Card>
    </section>
  </div>
);
