import {
  Calculator,
  Cpu,
  Database,
  Gauge,
  Layers3,
  WalletCards,
} from "lucide-react";
import { SystemStatusCard } from "@/components/dashboard/SystemStatusCard";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

const metrics = [
  {
    label: "Orcamentos ativos",
    value: "24",
    detail: "8 aguardando revisao",
    icon: Calculator,
    tone: "success" as const,
  },
  {
    label: "Perfis de material",
    value: "12",
    detail: "PLA, PETG, ABS, resinas",
    icon: Layers3,
    tone: "neutral" as const,
  },
  {
    label: "Fila estimada",
    value: "38h",
    detail: "capacidade desta semana",
    icon: Gauge,
    tone: "warning" as const,
  },
  {
    label: "Receita projetada",
    value: "R$ 8,4k",
    detail: "MVP forecast",
    icon: WalletCards,
    tone: "success" as const,
  },
];

export default function DashboardPage() {
  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 sm:flex-row sm:items-end">
          <div>
            <StatusBadge tone="success">MVP online</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Dashboard de orcamentos 3D
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Visao operacional para precificacao, fila de impressao e saude da API.
            </p>
          </div>
          <div className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-background px-4">
            <Cpu className="h-6 w-6 text-primary" />
            <div>
              <p className="text-sm text-muted">Stack</p>
              <p className="text-sm font-medium text-foreground">Next + Express + Prisma</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <Card key={metric.label} className="min-h-40 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted">{metric.label}</p>
                    <p className="mt-3 text-3xl font-semibold text-foreground">
                      {metric.value}
                    </p>
                  </div>
                  <div className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-background text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-5">
                  <StatusBadge tone={metric.tone}>{metric.detail}</StatusBadge>
                </div>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="min-h-80 p-5" id="quotes">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted">Pipeline</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">
                  Budgeting Logic
                </h2>
              </div>
              <StatusBadge tone="warning">proxima prioridade</StatusBadge>
            </div>

            <div className="mt-6 grid gap-3">
              {[
                "Cadastro de impressoras e custos por hora",
                "Perfis de filamento, resina e perda tecnica",
                "Calculo por material, tempo, energia, margem e SLA",
                "Historico de revisoes e aprovacao pelo cliente",
              ].map((item, index) => (
                <div
                  key={item}
                  className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                    {index + 1}
                  </span>
                  <p className="text-sm text-foreground">{item}</p>
                </div>
              ))}
            </div>
          </Card>

          <SystemStatusCard />
        </section>

        <section className="grid gap-4 md:grid-cols-2" id="materials">
          <Card className="min-h-48 p-5">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-secondary" />
              <h2 className="text-xl font-semibold text-foreground">Persistencia</h2>
            </div>
            <p className="mt-4 text-sm text-muted">
              Prisma inicia com User e SystemConfig para sustentar usuarios,
              parametros globais e futuras regras de precificacao.
            </p>
          </Card>
          <Card className="min-h-48 p-5" id="quality">
            <div className="flex items-center gap-3">
              <Gauge className="h-5 w-5 text-accent" />
              <h2 className="text-xl font-semibold text-foreground">Calibracao</h2>
            </div>
            <p className="mt-4 text-sm text-muted">
              A proxima camada deve transformar tempo, material, energia, risco e
              margem em uma estimativa auditavel.
            </p>
          </Card>
        </section>
      </div>
    </MainLayout>
  );
}
