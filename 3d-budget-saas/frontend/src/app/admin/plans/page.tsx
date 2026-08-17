"use client";

import type { PlanPayload, PlanResource } from "@3d-budget/shared";
import axios from "axios";
import {
  Edit3,
  Package,
  Plus,
  RefreshCcw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";

type ModalState =
  | { mode: "create"; item?: undefined }
  | { mode: "edit"; item: PlanResource }
  | null;

interface PlanFormState {
  code: string;
  name: string;
  description: string;
  price: string;
  priceUsd: string;
  currency: string;
  billingCycle: "MONTHLY" | "YEARLY";
  machinesLimit: string;
  materialsLimit: string;
  monthlyQuotesLimit: string;
  customFormulas: boolean;
  pdfExport: boolean;
  isActive: boolean;
  isPublic: boolean;
  displayOrder: string;
}

interface ToastState {
  tone: "success" | "danger";
  message: string;
}

const emptyPlanForm: PlanFormState = {
  code: "",
  name: "",
  description: "",
  price: "0",
  priceUsd: "",
  currency: "BRL",
  billingCycle: "MONTHLY",
  machinesLimit: "",
  materialsLimit: "",
  monthlyQuotesLimit: "",
  customFormulas: false,
  pdfExport: false,
  isActive: true,
  isPublic: true,
  displayOrder: "0",
};

const toPlanForm = (plan: PlanResource): PlanFormState => ({
  code: plan.code,
  name: plan.name,
  description: plan.description ?? "",
  price: String(plan.price),
  priceUsd: plan.priceUsd === null ? "" : String(plan.priceUsd),
  currency: plan.currency,
  billingCycle: plan.billingCycle,
  machinesLimit: plan.limits.machines === null ? "" : String(plan.limits.machines),
  materialsLimit: plan.limits.materials === null ? "" : String(plan.limits.materials),
  monthlyQuotesLimit:
    plan.limits.monthlyQuotes === null ? "" : String(plan.limits.monthlyQuotes),
  customFormulas: plan.features.customFormulas,
  pdfExport: plan.features.pdfExport,
  isActive: plan.isActive,
  isPublic: plan.isPublic,
  displayOrder: String(plan.displayOrder),
});

const toPayload = (form: PlanFormState): PlanPayload => ({
  code: form.code.trim(),
  name: form.name.trim(),
  description: form.description.trim() ? form.description.trim() : null,
  price: Number(form.price),
  priceUsd: form.priceUsd.trim() === "" ? null : Number(form.priceUsd),
  currency: form.currency.trim() || "BRL",
  billingCycle: form.billingCycle,
  limits: {
    machines: form.machinesLimit.trim() === "" ? null : Number(form.machinesLimit),
    materials: form.materialsLimit.trim() === "" ? null : Number(form.materialsLimit),
    monthlyQuotes:
      form.monthlyQuotesLimit.trim() === "" ? null : Number(form.monthlyQuotesLimit),
  },
  features: {
    customFormulas: form.customFormulas,
    pdfExport: form.pdfExport,
  },
  isActive: form.isActive,
  isPublic: form.isPublic,
  displayOrder: Number(form.displayOrder) || 0,
});

const toMoney = (value: number, currency: string): string =>
  value.toLocaleString("pt-BR", { style: "currency", currency });

export default function AdminPlansPage() {
  const { isLoading: isAuthLoading, token, refreshUser } = useAuth();
  const [plans, setPlans] = useState<PlanResource[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<PlanFormState>(emptyPlanForm);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const showToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const loadPlans = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsAccessDenied(false);

    try {
      const { data } = await api.get<PlanResource[]>("/admin/plans");
      setPlans(data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setIsAccessDenied(true);
      } else {
        showToast({
          tone: "danger",
          message: getApiErrorMessage(error, "Nao foi possivel carregar os planos."),
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [showToast, token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void (async () => {
        if (token) {
          await refreshUser();
        }

        await loadPlans();
      })();
    }
  }, [isAuthLoading, loadPlans, refreshUser, token]);

  const openModal = (plan?: PlanResource) => {
    setForm(plan ? toPlanForm(plan) : emptyPlanForm);
    setModal(plan ? { mode: "edit", item: plan } : { mode: "create" });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    const payload = toPayload(form);

    try {
      if (modal?.mode === "edit") {
        const { data } = await api.patch<PlanResource>(
          `/admin/plans/${modal.item.id}`,
          payload,
        );
        setPlans((current) => current.map((plan) => (plan.id === data.id ? data : plan)));
      } else {
        const { data } = await api.post<PlanResource>("/admin/plans", payload);
        setPlans((current) => [...current, data]);
      }

      setModal(null);
      showToast({ tone: "success", message: "Plano salvo." });
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(error, "Nao foi possivel salvar o plano."),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deletePlan = async (plan: PlanResource) => {
    const confirmed = window.confirm(`Excluir o plano "${plan.name}"?`);

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/admin/plans/${plan.id}`);
      setPlans((current) => current.filter((item) => item.id !== plan.id));
      showToast({ tone: "success", message: "Plano excluido." });
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(
          error,
          "Nao foi possivel excluir o plano. Empresas nesse plano impedem a exclusao — desative-o em vez disso.",
        ),
      });
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">Admin</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Planos de assinatura
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Configure preco, ciclo, limites e recursos de cada plano oferecido no
              checkout.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPlans()}
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
                <h2 className="text-xl font-semibold text-foreground">Acesso restrito</h2>
                <p className="mt-2 text-sm text-muted">
                  Voce nao tem permissao para acessar esta area.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {!isAccessDenied ? (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border p-5">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Planos cadastrados
                  </h2>
                  <p className="text-sm text-muted">{plans.length} planos.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openModal()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Novo plano
              </button>
            </div>

            {isLoading ? (
              <div className="grid gap-3 p-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-4"
                  >
                    <SkeletonText className="w-44" />
                    <SkeletonText className="w-28" />
                    <SkeletonText className="w-32" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-background text-xs uppercase text-muted">
                    <tr>
                      <th className="px-5 py-3">Plano</th>
                      <th className="px-5 py-3">Preco</th>
                      <th className="px-5 py-3">Limites</th>
                      <th className="px-5 py-3">Recursos</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {plans.map((plan) => (
                      <tr key={plan.id} className="bg-surface/40">
                        <td className="px-5 py-4">
                          <p className="font-medium text-foreground">{plan.name}</p>
                          <p className="text-xs text-muted">{plan.code}</p>
                        </td>
                        <td className="px-5 py-4 text-muted">
                          <p>
                            {toMoney(plan.price, plan.currency)}
                            {plan.price > 0 && plan.billingCycle === "YEARLY"
                              ? "/ano"
                              : plan.price > 0
                                ? "/mes"
                                : ""}
                          </p>
                          {plan.priceUsd !== null ? (
                            <p className="text-xs">{toMoney(plan.priceUsd, "USD")}</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 text-muted">
                          <div className="grid gap-1 text-xs">
                            <span>Maq. {plan.limits.machines ?? "ilimitado"}</span>
                            <span>Mat. {plan.limits.materials ?? "ilimitado"}</span>
                            <span>Orc. {plan.limits.monthlyQuotes ?? "ilimitado"}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-muted">
                          <div className="grid gap-1 text-xs">
                            <span>
                              Formulas: {plan.features.customFormulas ? "sim" : "nao"}
                            </span>
                            <span>PDF: {plan.features.pdfExport ? "sim" : "nao"}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1">
                            <StatusBadge tone={plan.isActive ? "success" : "danger"}>
                              {plan.isActive ? "Ativo" : "Inativo"}
                            </StatusBadge>
                            <StatusBadge tone={plan.isPublic ? "neutral" : "warning"}>
                              {plan.isPublic ? "Visivel" : "Oculto"}
                            </StatusBadge>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              title="Editar"
                              aria-label="Editar"
                              onClick={() => openModal(plan)}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Excluir"
                              aria-label="Excluir"
                              onClick={() => void deletePlan(plan)}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-danger hover:text-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}
      </div>

      {modal ? (
        <Modal
          title={modal.mode === "edit" ? "Editar plano" : "Novo plano"}
          onClose={() => setModal(null)}
        >
          <form className="grid min-w-0 gap-4" onSubmit={handleSubmit}>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <TextField
                label="Nome"
                value={form.name}
                onChange={(value) => setForm((current) => ({ ...current, name: value }))}
              />
              <TextField
                label="Codigo (slug)"
                value={form.code}
                onChange={(value) =>
                  setForm((current) => ({ ...current, code: value.toLowerCase() }))
                }
              />
            </div>
            <label className="grid min-w-0 gap-2 text-sm font-medium">
              Descricao
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={2}
                className="w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 py-2 outline-none focus:border-primary"
              />
            </label>
            <div className="grid min-w-0 gap-4 sm:grid-cols-3">
              <TextField
                label="Preco (BRL)"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(value) => setForm((current) => ({ ...current, price: value }))}
              />
              <TextField
                label="Preco em dolar (USD, opcional)"
                type="number"
                step="0.01"
                value={form.priceUsd}
                onChange={(value) => setForm((current) => ({ ...current, priceUsd: value }))}
              />
              <TextField
                label="Moeda"
                value={form.currency}
                onChange={(value) =>
                  setForm((current) => ({ ...current, currency: value.toUpperCase() }))
                }
              />
              <label className="grid min-w-0 gap-2 text-sm font-medium">
                Ciclo
                <select
                  value={form.billingCycle}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      billingCycle: event.target.value as PlanFormState["billingCycle"],
                    }))
                  }
                  className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
                >
                  <option value="MONTHLY">Mensal</option>
                  <option value="YEARLY">Anual</option>
                </select>
              </label>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-3">
              <OptionalNumberField
                label="Limite maquinas"
                value={form.machinesLimit}
                onChange={(value) =>
                  setForm((current) => ({ ...current, machinesLimit: value }))
                }
              />
              <OptionalNumberField
                label="Limite materiais"
                value={form.materialsLimit}
                onChange={(value) =>
                  setForm((current) => ({ ...current, materialsLimit: value }))
                }
              />
              <OptionalNumberField
                label="Limite orcamentos/mes"
                value={form.monthlyQuotesLimit}
                onChange={(value) =>
                  setForm((current) => ({ ...current, monthlyQuotesLimit: value }))
                }
              />
            </div>
            <p className="text-xs text-muted">Deixe os limites em branco para ilimitado.</p>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <ToggleField
                label="Formulas customizadas"
                checked={form.customFormulas}
                onChange={(checked) =>
                  setForm((current) => ({ ...current, customFormulas: checked }))
                }
              />
              <ToggleField
                label="Exportacao PDF"
                checked={form.pdfExport}
                onChange={(checked) =>
                  setForm((current) => ({ ...current, pdfExport: checked }))
                }
              />
              <ToggleField
                label="Plano ativo"
                checked={form.isActive}
                onChange={(checked) =>
                  setForm((current) => ({ ...current, isActive: checked }))
                }
              />
              <ToggleField
                label="Visivel no checkout"
                checked={form.isPublic}
                onChange={(checked) =>
                  setForm((current) => ({ ...current, isPublic: checked }))
                }
              />
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
            >
              <Save className="h-4 w-4" />
              Salvar
            </button>
          </form>
        </Modal>
      ) : null}

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-panel",
            toast.tone === "success"
              ? "border-secondary/40 bg-secondary/10 text-secondary"
              : "border-danger/40 bg-danger/10 text-danger",
          )}
        >
          {toast.message}
        </div>
      ) : null}
    </MainLayout>
  );
}

const Modal = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => (
  <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6">
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-panel sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button
          type="button"
          title="Fechar"
          aria-label="Fechar"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const TextField = ({
  label,
  value,
  onChange,
  type = "text",
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  step?: string;
}) => (
  <label className="grid min-w-0 gap-2 text-sm font-medium">
    {label}
    <input
      type={type}
      step={step}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required
      className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
    />
  </label>
);

const OptionalNumberField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="grid min-w-0 gap-2 text-sm font-medium">
    {label}
    <input
      type="number"
      min="0"
      step="1"
      value={value}
      placeholder="Ilimitado"
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
    />
  </label>
);

const ToggleField = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 text-sm font-medium">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-border"
    />
    {label}
  </label>
);
