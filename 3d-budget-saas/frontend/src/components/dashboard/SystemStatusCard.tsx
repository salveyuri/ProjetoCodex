"use client";

import type { HealthCheckResponse } from "@3d-budget/shared";
import axios from "axios";
import {
  Activity,
  Calculator,
  Database,
  HardDrive,
  RefreshCw,
  Server,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useLanguage } from "@/contexts/LanguageContext";

type LoadState = "loading" | "online" | "degraded" | "offline";

const badgeToneByState = {
  loading: "neutral",
  online: "success",
  degraded: "warning",
  offline: "danger",
} as const;

export const SystemStatusCard = () => {
  const { t } = useLanguage();
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const loadHealth = useCallback(async () => {
    setState("loading");

    try {
      const { data } = await api.get<HealthCheckResponse>("/health");
      setHealth(data);
      setState(data.status === "ok" ? "online" : "degraded");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        const data = error.response.data as HealthCheckResponse;
        setHealth(data);
        setState(data.status === "ok" ? "online" : "degraded");
        return;
      }

      setHealth(null);
      setState("offline");
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const noSignal = t("dashboard.status.noSignal");
  const databaseLatency =
    health?.database.latencyMs === null || health?.database.latencyMs === undefined
      ? noSignal
      : `${health.database.latencyMs} ms`;
  const calculationLatency =
    health?.calculation.latencyMs === null ||
    health?.calculation.latencyMs === undefined
      ? noSignal
      : `${health.calculation.latencyMs} ms`;
  const filesystemLatency =
    health?.filesystem.latencyMs === null ||
    health?.filesystem.latencyMs === undefined
      ? noSignal
      : `${health.filesystem.latencyMs} ms`;
  const stateLabel =
    state === "loading"
      ? t("dashboard.status.checking")
      : state === "online"
        ? t("dashboard.status.online")
        : state === "degraded"
          ? t("dashboard.status.degraded")
          : t("dashboard.status.offline");

  return (
    <Card className="min-h-80 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{t("dashboard.status.apiHealth")}</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            {t("dashboard.status.title")}
          </h2>
        </div>
        <button
          type="button"
          title={t("dashboard.status.refresh")}
          aria-label={t("dashboard.status.refresh")}
          onClick={loadHealth}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-5">
        <StatusBadge tone={badgeToneByState[state]}>{stateLabel}</StatusBadge>
      </div>

      <div className="mt-6 grid gap-3">
        <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3">
          <Server className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm text-muted">{t("dashboard.status.server")}</p>
            <p className="text-sm font-medium text-foreground">
              {health?.server.status ?? t("dashboard.status.waiting")}
            </p>
          </div>
        </div>
        <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3">
          <Database className="h-5 w-5 text-secondary" />
          <div>
            <p className="text-sm text-muted">{t("dashboard.status.database")}</p>
            <p className="text-sm font-medium text-foreground">{databaseLatency}</p>
          </div>
        </div>
        <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3">
          <Calculator className="h-5 w-5 text-accent" />
          <div>
            <p className="text-sm text-muted">{t("dashboard.status.calculationQuery")}</p>
            <p className="text-sm font-medium text-foreground">
              {calculationLatency}
            </p>
          </div>
        </div>
        <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3">
          <HardDrive className="h-5 w-5 text-warning" />
          <div>
            <p className="text-sm text-muted">{t("dashboard.status.pdfFilesystem")}</p>
            <p className="text-sm font-medium text-foreground">
              {filesystemLatency}
            </p>
          </div>
        </div>
        <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3">
          <Activity className="h-5 w-5 text-accent" />
          <div>
            <p className="text-sm text-muted">{t("dashboard.status.uptime")}</p>
            <p className="text-sm font-medium text-foreground">
              {health ? `${health.uptimeSeconds}s` : t("dashboard.status.waiting")}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};
