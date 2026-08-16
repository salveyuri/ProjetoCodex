"use client";

import type { SystemFormulaPayload, SystemFormulaResource } from "@3d-budget/shared";
import axios from "axios";
import {
  Edit3,
  Plus,
  RefreshCcw,
  Save,
  Sigma,
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
  | { mode: "edit"; item: SystemFormulaResource }
  | null;

interface FormulaFormState {
  name: string;
  expression: string;
  isActive: boolean;
  isDefault: boolean;
}

interface ToastState {
  tone: "success" | "danger";
  message: string;
}

const emptyForm: FormulaFormState = {
  name: "",
  expression: "",
  isActive: true,
  isDefault: false,
};

const toForm = (formula: SystemFormulaResource): FormulaFormState => ({
  name: formula.name,
  expression: formula.expression,
  isActive: formula.isActive,
  isDefault: formula.isDefault,
});

const toPayload = (form: FormulaFormState): SystemFormulaPayload => ({
  name: form.name.trim(),
  expression: form.expression.trim(),
  isActive: form.isActive,
  isDefault: form.isDefault,
});

export default function AdminSystemFormulasPage() {
  const { isLoading: isAuthLoading, token, refreshUser } = useAuth();
  const [formulas, setFormulas] = useState<SystemFormulaResource[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<FormulaFormState>(emptyForm);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const showToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const loadFormulas = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsAccessDenied(false);

    try {
      const { data } = await api.get<SystemFormulaResource[]>("/admin/system-formulas");
      setFormulas(data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setIsAccessDenied(true);
      } else {
        showToast({
          tone: "danger",
          message: getApiErrorMessage(error, "Nao foi possivel carregar as formulas."),
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

        await loadFormulas();
      })();
    }
  }, [isAuthLoading, loadFormulas, refreshUser, token]);

  const openModal = (formula?: SystemFormulaResource) => {
    setForm(formula ? toForm(formula) : emptyForm);
    setModal(formula ? { mode: "edit", item: formula } : { mode: "create" });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    const payload = toPayload(form);

    try {
      if (modal?.mode === "edit") {
        const { data } = await api.patch<SystemFormulaResource>(
          `/admin/system-formulas/${modal.item.id}`,
          payload,
        );
        setFormulas((current) =>
          current.map((formula) => (formula.id === data.id ? data : formula)),
        );
      } else {
        const { data } = await api.post<SystemFormulaResource>(
          "/admin/system-formulas",
          payload,
        );
        setFormulas((current) => [...current, data]);
      }

      setModal(null);
      showToast({ tone: "success", message: "Formula salva." });
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(error, "Nao foi possivel salvar a formula."),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteFormula = async (formula: SystemFormulaResource) => {
    const confirmed = window.confirm(`Excluir a formula "${formula.name}"?`);

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/admin/system-formulas/${formula.id}`);
      setFormulas((current) => current.filter((item) => item.id !== formula.id));
      showToast({ tone: "success", message: "Formula excluida." });
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(
          error,
          "Nao foi possivel excluir a formula. A formula padrao nao pode ser excluida — torne outra padrao primeiro.",
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
              Formulas do sistema
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Formulas globais visiveis pra todas as empresas na biblioteca de
              formulas, mas so leitura por elas — editar/criar so aqui.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadFormulas()}
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
                <Sigma className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Formulas cadastradas
                  </h2>
                  <p className="text-sm text-muted">{formulas.length} formulas.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openModal()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Nova formula
              </button>
            </div>

            {isLoading ? (
              <div className="grid gap-3 p-5">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-3"
                  >
                    <SkeletonText className="w-44" />
                    <SkeletonText className="w-64" />
                    <SkeletonText className="w-28" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-background text-xs uppercase text-muted">
                    <tr>
                      <th className="px-5 py-3">Formula</th>
                      <th className="px-5 py-3">Equacao</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {formulas.map((formula) => (
                      <tr key={formula.id} className="bg-surface/40">
                        <td className="px-5 py-4">
                          <p className="font-medium text-foreground">{formula.name}</p>
                          <p className="text-xs text-muted">{formula.code}</p>
                        </td>
                        <td className="max-w-md px-5 py-4">
                          <p className="truncate font-mono text-xs text-muted">
                            {formula.expression}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1">
                            <StatusBadge tone={formula.isActive ? "success" : "danger"}>
                              {formula.isActive ? "Ativa" : "Inativa"}
                            </StatusBadge>
                            {formula.isDefault ? (
                              <StatusBadge tone="neutral">Padrao</StatusBadge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              title="Editar"
                              aria-label="Editar"
                              onClick={() => openModal(formula)}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Excluir"
                              aria-label="Excluir"
                              disabled={formula.isDefault}
                              onClick={() => void deleteFormula(formula)}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {formulas.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-sm text-muted">
                          Nenhuma formula cadastrada.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}
      </div>

      {modal ? (
        <Modal
          title={modal.mode === "edit" ? "Editar formula" : "Nova formula"}
          onClose={() => setModal(null)}
        >
          <form className="grid min-w-0 gap-4" onSubmit={handleSubmit}>
            <TextField
              label="Nome"
              value={form.name}
              onChange={(value) => setForm((current) => ({ ...current, name: value }))}
            />
            <label className="grid min-w-0 gap-2 text-sm font-medium">
              Equacao
              <textarea
                value={form.expression}
                onChange={(event) =>
                  setForm((current) => ({ ...current, expression: event.target.value }))
                }
                required
                rows={4}
                className="w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-sm outline-none focus:border-primary"
              />
              <span className="text-xs font-normal text-muted">
                Variaveis disponiveis: peso, tempo, material_cost, energia_total,
                depreciacao_maquina, manutencao_maquina, custo_base, margem_lucro,
                custo_kwh, taxa_cartao, taxa_administrativa, taxas_percentuais,
                consumo_kw, horas_pintura, valor_hora_pintura, horas_acabamento,
                valor_hora_acabamento, quantidade_mesas, taxa_erro. Percentuais
                (%) sao digitados 0-100 e convertidos pra taxa decimal.
              </span>
            </label>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <ToggleField
                label="Ativa"
                checked={form.isActive}
                onChange={(checked) =>
                  setForm((current) => ({ ...current, isActive: checked }))
                }
              />
              <ToggleField
                label="Padrao do sistema"
                checked={form.isDefault}
                onChange={(checked) =>
                  setForm((current) => ({ ...current, isDefault: checked }))
                }
              />
            </div>
            <p className="text-xs text-muted">
              Marcar como padrao troca automaticamente a formula usada por
              empresas que nao tem uma formula propria marcada como padrao.
            </p>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="grid min-w-0 gap-2 text-sm font-medium">
    {label}
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required
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
