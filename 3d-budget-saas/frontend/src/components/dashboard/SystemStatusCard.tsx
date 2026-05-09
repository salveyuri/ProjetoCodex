"use client";

import type { HealthCheckResponse } from "@3d-budget/shared";
import axios from "axios";
import { Activity, Database, RefreshCw, Server } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type LoadState = "loading" | "online" | "degraded" | "offline";

const badgeToneByState = {
  loading: "neutral",
  online: "success",
  degraded: "warning",
  offline: "danger",
} as const;

export const SystemStatusCard = () => {
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

  const databaseLatency =
    health?.database.latencyMs === null || health?.database.latencyMs === undefined
      ? "sem sinal"
      : `${health.database.latencyMs} ms`;

  return (
    <Card className="min-h-80 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">API Health</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Status do sistema</h2>
        </div>
        <button
          type="button"
          title="Atualizar status"
          aria-label="Atualizar status"
          onClick={loadHealth}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-5">
        <StatusBadge tone={badgeToneByState[state]}>
          {state === "loading"
            ? "checando"
            : state === "online"
              ? "online"
              : state === "degraded"
                ? "degradado"
                : "offline"}
        </StatusBadge>
      </div>

      <div className="mt-6 grid gap-3">
        <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3">
          <Server className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm text-muted">Servidor</p>
            <p className="text-sm font-medium text-foreground">
              {health?.server.status ?? "aguardando"}
            </p>
          </div>
        </div>
        <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3">
          <Database className="h-5 w-5 text-secondary" />
          <div>
            <p className="text-sm text-muted">PostgreSQL</p>
            <p className="text-sm font-medium text-foreground">{databaseLatency}</p>
          </div>
        </div>
        <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3">
          <Activity className="h-5 w-5 text-accent" />
          <div>
            <p className="text-sm text-muted">Uptime</p>
            <p className="text-sm font-medium text-foreground">
              {health ? `${health.uptimeSeconds}s` : "aguardando"}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};

