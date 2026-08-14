"use client";

import type {
  CalculationRequest,
  CalculationResponse,
  MachineResource,
  MaterialResource,
} from "@3d-budget/shared";
import {
  Calculator,
  Clock3,
  Cpu,
  Layers3,
  Percent,
  RefreshCcw,
  Scale,
  type LucideIcon,
  WalletCards,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";

const toMoney = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const numberFromInput = (value: string): number => Number(value.replace(",", "."));

export default function CalculatorPage() {
  const { isLoading: isAuthLoading, token } = useAuth();
  const [machines, setMachines] = useState<MachineResource[]>([]);
  const [materials, setMaterials] = useState<MaterialResource[]>([]);
  const [machineId, setMachineId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [weightGrams, setWeightGrams] = useState("120");
  const [printTimeHours, setPrintTimeHours] = useState("4");
  const [result, setResult] = useState<CalculationResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingResources, setIsLoadingResources] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);

  const selectedMachine = useMemo(
    () => machines.find((machine) => machine.id === machineId) ?? null,
    [machineId, machines],
  );

  const selectedMaterial = useMemo(
    () => materials.find((material) => material.id === materialId) ?? null,
    [materialId, materials],
  );

  const canCalculate = useMemo(() => {
    return (
      Boolean(token) &&
      Boolean(machineId) &&
      Boolean(materialId) &&
      numberFromInput(weightGrams) > 0 &&
      numberFromInput(printTimeHours) > 0
    );
  }, [machineId, materialId, printTimeHours, token, weightGrams]);

  const loadResources = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoadingResources(true);
    setErrorMessage(null);

    try {
      const [machinesResponse, materialsResponse] = await Promise.all([
        api.get<MachineResource[]>("/machines"),
        api.get<MaterialResource[]>("/materials"),
      ]);

      setMachines(machinesResponse.data);
      setMaterials(materialsResponse.data);
      setMachineId((current) => current || machinesResponse.data[0]?.id || "");
      setMaterialId((current) => current || materialsResponse.data[0]?.id || "");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Nao foi possivel calcular o orcamento."));
    } finally {
      setIsLoadingResources(false);
    }
  }, [token]);

  const calculate = useCallback(async () => {
    if (!canCalculate) {
      setResult(null);
      return;
    }

    const payload: CalculationRequest = {
      weightGrams: numberFromInput(weightGrams),
      printTimeHours: numberFromInput(printTimeHours),
      machineId,
      materialId,
    };

    setIsCalculating(true);
    setErrorMessage(null);

    try {
      const response = await api.post<CalculationResponse>("/calculate", payload);
      setResult(response.data);
    } catch (error) {
      setResult(null);
      setErrorMessage(getApiErrorMessage(error, "Nao foi possivel calcular o orcamento."));
    } finally {
      setIsCalculating(false);
    }
  }, [canCalculate, machineId, materialId, printTimeHours, weightGrams]);

  useEffect(() => {
    if (!isAuthLoading) {
      void loadResources();
    }
  }, [isAuthLoading, loadResources]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void calculate();
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [calculate]);

  const costRows = useMemo(
    () =>
      result
        ? [
            {
              label: "Material",
              value: result.breakdown.materialCost,
              icon: Layers3,
              tone: "text-secondary",
            },
            {
              label: "Energia",
              value: result.breakdown.energyCost,
              icon: Zap,
              tone: "text-primary",
            },
            {
              label: "Depreciacao",
              value: result.breakdown.depreciationCost,
              icon: Cpu,
              tone: "text-accent",
            },
            {
              label: "Mao de obra",
              value: result.breakdown.laborCost,
              icon: Clock3,
              tone: "text-foreground",
            },
          ]
        : [],
    [result],
  );

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">Engine ativo</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Calculadora de orcamentos
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Simulacao em tempo real usando maquina, material e custos fixos da empresa.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void calculate()}
            disabled={!canCalculate || isCalculating}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw
              className={cn("h-4 w-4", isCalculating && "animate-spin")}
            />
            Recalcular
          </button>
        </section>

        {errorMessage ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid min-w-0 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card className="min-w-0 overflow-hidden p-5">
            <div className="flex items-center gap-3">
              <Calculator className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold text-foreground">
                Parametros tecnicos
              </h2>
            </div>

            <div className="mt-6 grid min-w-0 gap-4">
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium text-foreground">Maquina</span>
                <select
                  value={machineId}
                  onChange={(event) => setMachineId(event.target.value)}
                  disabled={isLoadingResources || machines.length === 0}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary"
                >
                  {machines.length === 0 ? (
                    <option value="">Nenhuma maquina cadastrada</option>
                  ) : null}
                  {machines.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.name} - {machine.type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium text-foreground">Material</span>
                <select
                  value={materialId}
                  onChange={(event) => setMaterialId(event.target.value)}
                  disabled={isLoadingResources || materials.length === 0}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary"
                >
                  {materials.length === 0 ? (
                    <option value="">Nenhum material cadastrado</option>
                  ) : null}
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.brand} - {material.color}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <NumberField
                  icon={Scale}
                  label="Peso"
                  suffix="g"
                  value={weightGrams}
                  onChange={setWeightGrams}
                />
                <NumberField
                  icon={Clock3}
                  label="Tempo"
                  suffix="h"
                  value={printTimeHours}
                  onChange={setPrintTimeHours}
                />
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              <ResourceLine
                label="Consumo"
                value={
                  selectedMachine
                    ? `${selectedMachine.powerConsumptionWatts} W`
                    : "--"
                }
              />
              <ResourceLine
                label="Depreciacao"
                value={
                  selectedMachine
                    ? `${toMoney(selectedMachine.depreciationCostPerHour)} / h`
                    : "--"
                }
              />
              <ResourceLine
                label="Custo do material"
                value={
                  selectedMaterial
                    ? `${toMoney(selectedMaterial.costPerGram)} / g`
                    : "--"
                }
              />
            </div>
          </Card>

          <div className="grid min-w-0 gap-4">
            <section className="min-w-0 rounded-lg border border-border bg-surface/75 p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-sm text-muted">Preco sugerido</p>
                  <p className="mt-2 text-4xl font-semibold text-foreground">
                    {result ? toMoney(result.breakdown.finalPrice) : "--"}
                  </p>
                </div>
                <StatusBadge tone={result ? "success" : "warning"}>
                  {isCalculating ? "calculando" : result ? "atualizado" : "aguardando dados"}
                </StatusBadge>
              </div>

              <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-3">
                <SummaryMetric
                  icon={WalletCards}
                  label="Custo base"
                  value={result ? toMoney(result.breakdown.baseCost) : "--"}
                />
                <SummaryMetric
                  icon={Percent}
                  label="Margem"
                  value={
                    result
                      ? `${result.rates.desiredMarginPercent.toFixed(2)}%`
                      : "--"
                  }
                />
                <SummaryMetric
                  icon={Zap}
                  label="kWh"
                  value={
                    result ? toMoney(result.rates.energyCostPerKwh) : "--"
                  }
                />
              </div>
            </section>

            <section className="grid min-w-0 gap-4 lg:grid-cols-2">
              <Card className="min-w-0 p-5">
                <h2 className="text-xl font-semibold text-foreground">
                  Breakdown de producao
                </h2>
                <div className="mt-5 grid gap-3">
                  {costRows.length > 0 ? (
                    costRows.map((row) => (
                      <BreakdownRow
                        key={row.label}
                        icon={row.icon}
                        label={row.label}
                        value={toMoney(row.value)}
                        tone={row.tone}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted">
                      Cadastre maquina, material e custos para calcular.
                    </p>
                  )}
                </div>
              </Card>

              <Card className="min-w-0 p-5">
                <h2 className="text-xl font-semibold text-foreground">
                  Margem e taxas
                </h2>
                <div className="mt-5 grid gap-3">
                  <BreakdownText
                    label="Subtotal com margem"
                    value={
                      result
                        ? toMoney(result.breakdown.subtotalWithMargin)
                        : "--"
                    }
                  />
                  <BreakdownText
                    label="Valor da margem"
                    value={result ? toMoney(result.breakdown.marginAmount) : "--"}
                  />
                  <BreakdownText
                    label="Taxa de cartao"
                    value={
                      result ? toMoney(result.breakdown.cardFeeAmount) : "--"
                    }
                  />
                  <BreakdownText
                    label="Taxa administrativa"
                    value={
                      result
                        ? toMoney(result.breakdown.administrativeFeeAmount)
                        : "--"
                    }
                  />
                  <BreakdownText
                    label="Taxas totais"
                    value={result ? toMoney(result.breakdown.feesTotal) : "--"}
                    strong
                  />
                </div>
              </Card>
            </section>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}

interface NumberFieldProps {
  icon: LucideIcon;
  label: string;
  suffix: string;
  value: string;
  onChange: (value: string) => void;
}

const NumberField = ({
  icon: Icon,
  label,
  suffix,
  value,
  onChange,
}: NumberFieldProps) => (
  <label className="grid min-w-0 gap-2">
    <span className="text-sm font-medium text-foreground">{label}</span>
    <span className="flex min-h-11 min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-border bg-background px-3 transition focus-within:border-primary">
      <Icon className="h-4 w-4 text-muted" />
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
      />
      <span className="text-xs font-semibold uppercase text-muted">{suffix}</span>
    </span>
  </label>
);

const ResourceLine = ({ label, value }: { label: string; value: string }) => (
  <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3">
    <span className="min-w-0 text-sm text-muted">{label}</span>
    <span className="shrink-0 text-right text-sm font-semibold text-foreground">
      {value}
    </span>
  </div>
);

interface SummaryMetricProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

const SummaryMetric = ({ icon: Icon, label, value }: SummaryMetricProps) => (
  <div className="flex min-h-20 min-w-0 items-center gap-3 rounded-lg border border-border bg-background px-3">
    <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      <p className="text-xs uppercase text-muted">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-foreground">
        {value}
      </p>
    </div>
  </div>
);

interface BreakdownRowProps {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: string;
}

const BreakdownRow = ({
  icon: Icon,
  label,
  value,
  tone,
}: BreakdownRowProps) => (
  <div className="flex min-h-14 min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3">
    <div className="flex min-w-0 items-center gap-3">
      <Icon className={cn("h-5 w-5", tone)} />
      <span className="min-w-0 truncate text-sm text-muted">{label}</span>
    </div>
    <span className="shrink-0 text-sm font-semibold text-foreground">{value}</span>
  </div>
);

const BreakdownText = ({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <div
    className={cn(
      "flex min-h-11 min-w-0 items-center justify-between gap-3 border-b border-border/70 pb-2",
      strong && "border-b-0 pb-0",
    )}
  >
    <span className="min-w-0 text-sm text-muted">{label}</span>
    <span
      className={cn(
        "shrink-0 text-sm font-medium text-foreground",
        strong && "text-base font-semibold text-primary",
      )}
    >
      {value}
    </span>
  </div>
);
