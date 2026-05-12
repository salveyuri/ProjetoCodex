"use client";

import type {
  CalculationRequest,
  CalculationResponse,
  FormulaResource,
  MachineResource,
  MaterialResource,
  QuotePayload,
  QuoteResource,
  QuoteStatus,
  QuoteUpdatePayload,
} from "@3d-budget/shared";
import axios from "axios";
import {
  ArrowLeft,
  Calculator,
  Clock3,
  Download,
  Info,
  Layers3,
  Plus,
  Save,
  Scale,
  Send,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createToastId,
  ToastViewport,
  type ToastMessage,
} from "@/components/ui/toast";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { downloadQuotePdf } from "@/lib/download-quote-pdf";
import {
  quoteStatusLabels,
  quoteStatusOptions,
  quoteStatusTones,
  toDateInputValue,
  toMoney,
} from "./quote-ui";

interface QuoteFormProps {
  quoteId?: string;
}

interface PrintTableFormState {
  localId: string;
  modelName: string;
  machineId: string;
  materialId: string;
  weightGrams: string;
  printTimeHours: string;
}

interface QuoteFormState {
  customerName: string;
  validUntil: string;
  status: QuoteStatus;
  formulaId: string;
  tables: PrintTableFormState[];
}

const nextWeek = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return toDateInputValue(date);
};

const createLocalId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
};

const createPrintTable = (
  overrides: Partial<PrintTableFormState> = {},
): PrintTableFormState => ({
  localId: createLocalId(),
  modelName: "Modelo 3D",
  machineId: "",
  materialId: "",
  weightGrams: "120",
  printTimeHours: "4",
  ...overrides,
});

const createEmptyForm = (): QuoteFormState => ({
  customerName: "",
  validUntil: nextWeek(),
  status: "DRAFT",
  formulaId: "",
  tables: [createPrintTable()],
});

const numberFromInput = (value: string): number => Number(value.replace(",", "."));

const getApiErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;

    if (typeof message === "string") {
      return message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel salvar o orcamento.";
};

const toFormState = (quote: QuoteResource): QuoteFormState => ({
  customerName: quote.customerName,
  validUntil: toDateInputValue(quote.validUntil),
  status: quote.status,
  formulaId: quote.formulaId ?? "",
  tables:
    quote.items.length > 0
      ? quote.items.map((item) =>
          createPrintTable({
            localId: item.id,
            modelName: item.modelName,
            machineId: item.machineId,
            materialId: item.materialId,
            weightGrams: String(item.materialWeightGrams),
            printTimeHours: String(item.estimatedPrintTimeHours),
          }),
        )
      : [createPrintTable()],
});

export const QuoteForm = ({ quoteId }: QuoteFormProps) => {
  const router = useRouter();
  const { isLoading: isAuthLoading, token } = useAuth();
  const [form, setForm] = useState<QuoteFormState>(() => createEmptyForm());
  const [machines, setMachines] = useState<MachineResource[]>([]);
  const [materials, setMaterials] = useState<MaterialResource[]>([]);
  const [formulas, setFormulas] = useState<FormulaResource[]>([]);
  const [tablePreviews, setTablePreviews] = useState<
    Record<string, CalculationResponse>
  >({});
  const [savedQuote, setSavedQuote] = useState<QuoteResource | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingResources, setIsLoadingResources] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const validTables = useMemo(
    () =>
      form.tables.length > 0 &&
      form.tables.every(
        (table) =>
          Boolean(table.machineId) &&
          Boolean(table.materialId) &&
          table.modelName.trim().length >= 2 &&
          numberFromInput(table.weightGrams) > 0 &&
          numberFromInput(table.printTimeHours) > 0,
      ),
    [form.tables],
  );

  const canCalculate = Boolean(token) && validTables;
  const canSave = canCalculate && form.customerName.trim().length >= 2;
  const missingResources =
    !isLoadingResources && (machines.length === 0 || materials.length === 0);

  const showToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = createToastId();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  const aggregate = useMemo(() => {
    const totalWeightGrams = form.tables.reduce(
      (total, table) => total + (numberFromInput(table.weightGrams) || 0),
      0,
    );
    const totalPrintHours = form.tables.reduce(
      (total, table) => total + (numberFromInput(table.printTimeHours) || 0),
      0,
    );
    const previews = form.tables
      .map((table) => tablePreviews[table.localId])
      .filter(Boolean);
    const totalAmount =
      previews.length === form.tables.length
        ? previews.reduce(
            (total, preview) => total + preview.breakdown.finalPrice,
            0,
          )
        : null;

    return {
      totalWeightGrams,
      totalPrintHours,
      totalAmount,
    };
  }, [form.tables, tablePreviews]);

  const loadInitialData = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoadingResources(true);
    setErrorMessage(null);

    try {
      const [
        machinesResponse,
        materialsResponse,
        formulasResponse,
        quoteResponse,
      ] =
        await Promise.all([
          api.get<MachineResource[]>("/machines"),
          api.get<MaterialResource[]>("/materials"),
          api.get<FormulaResource[]>("/formulas"),
          quoteId ? api.get<QuoteResource>(`/quotes/${quoteId}`) : null,
        ]);
      const firstMachineId = machinesResponse.data[0]?.id ?? "";
      const firstMaterialId = materialsResponse.data[0]?.id ?? "";
      const defaultFormulaId =
        formulasResponse.data.find((formula) => formula.isDefault)?.id ??
        formulasResponse.data[0]?.id ??
        "";

      setMachines(machinesResponse.data);
      setMaterials(materialsResponse.data);
      setFormulas(formulasResponse.data);

      if (quoteResponse) {
        setSavedQuote(quoteResponse.data);
        setForm({
          ...toFormState(quoteResponse.data),
          formulaId: quoteResponse.data.formulaId ?? defaultFormulaId,
        });
        return;
      }

      setSavedQuote(null);
      setForm((current) => ({
        ...current,
        formulaId: current.formulaId || defaultFormulaId,
        tables: current.tables.map((table) => ({
          ...table,
          machineId: table.machineId || firstMachineId,
          materialId: table.materialId || firstMaterialId,
        })),
      }));
    } catch (error) {
      const message = getApiErrorMessage(error);
      setErrorMessage(message);
      showToast({ tone: "danger", title: "Erro ao carregar", message });
    } finally {
      setIsLoadingResources(false);
    }
  }, [quoteId, showToast, token]);

  const calculatePreview = useCallback(async () => {
    if (!canCalculate) {
      setTablePreviews({});
      return;
    }

    setIsCalculating(true);

    try {
      const results = await Promise.all(
        form.tables.map(async (table) => {
          const payload: CalculationRequest = {
            weightGrams: numberFromInput(table.weightGrams),
            printTimeHours: numberFromInput(table.printTimeHours),
            machineId: table.machineId,
            materialId: table.materialId,
            formulaId: form.formulaId || undefined,
          };
          const response = await api.post<CalculationResponse>(
            "/calculate",
            payload,
          );

          return [table.localId, response.data] as const;
        }),
      );

      setTablePreviews(Object.fromEntries(results));
    } catch (error) {
      setTablePreviews({});
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsCalculating(false);
    }
  }, [canCalculate, form.formulaId, form.tables]);

  useEffect(() => {
    if (!isAuthLoading) {
      void loadInitialData();
    }
  }, [isAuthLoading, loadInitialData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void calculatePreview();
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [calculatePreview]);

  const updateField = <Field extends keyof QuoteFormState>(
    field: Field,
    value: QuoteFormState[Field],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateTable = (
    localId: string,
    patch: Partial<PrintTableFormState>,
  ) => {
    setForm((current) => ({
      ...current,
      tables: current.tables.map((table) =>
        table.localId === localId ? { ...table, ...patch } : table,
      ),
    }));
  };

  const addTable = () => {
    setForm((current) => ({
      ...current,
      tables: [
        ...current.tables,
        createPrintTable({
          machineId: machines[0]?.id ?? "",
          materialId: materials[0]?.id ?? "",
        }),
      ],
    }));
  };

  const removeTable = (localId: string) => {
    setForm((current) => ({
      ...current,
      tables:
        current.tables.length > 1
          ? current.tables.filter((table) => table.localId !== localId)
          : current.tables,
    }));
    setTablePreviews((current) => {
      const next = { ...current };
      delete next[localId];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    const payload: QuotePayload = {
      customerName: form.customerName,
      validUntil: form.validUntil,
      status: form.status,
      formulaId: form.formulaId || undefined,
      items: form.tables.map((table) => ({
        modelName: table.modelName,
        weightGrams: numberFromInput(table.weightGrams),
        printTimeHours: numberFromInput(table.printTimeHours),
        machineId: table.machineId,
        materialId: table.materialId,
      })),
    };

    try {
      if (quoteId) {
        await api.patch<QuoteResource>(
          `/quotes/${quoteId}`,
          payload satisfies QuoteUpdatePayload,
        );
      } else {
        await api.post<QuoteResource>("/quotes", payload);
      }

      window.sessionStorage.setItem(
        "quoteToast",
        JSON.stringify({
          tone: "success",
          title: quoteId ? "Orcamento atualizado" : "Orcamento criado",
          message: "Os snapshots de calculo foram salvos.",
        }),
      );
      router.push("/dashboard/quotes");
    } catch (error) {
      const message = getApiErrorMessage(error);
      setErrorMessage(message);
      showToast({ tone: "danger", title: "Erro ao salvar", message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!quoteId || !savedQuote) {
      return;
    }

    setIsDownloadingPdf(true);

    try {
      await downloadQuotePdf({
        quoteId,
        customerName: savedQuote.customerName,
      });
      showToast({
        tone: "success",
        title: "PDF gerado",
        message: "O download do orcamento foi iniciado.",
      });
    } catch (error) {
      const message = getApiErrorMessage(error);
      showToast({ tone: "danger", title: "Erro ao gerar PDF", message });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <Link
              href="/dashboard/quotes"
              className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-muted transition hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para orcamentos
            </Link>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              {quoteId ? "Editar orcamento" : "Novo orcamento"}
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Cada mesa e calculada individualmente e somada no valor final.
            </p>
          </div>
          <StatusBadge tone={quoteStatusTones[form.status]}>
            {quoteStatusLabels[form.status]}
          </StatusBadge>
        </section>

        {errorMessage ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        {missingResources ? (
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 text-accent" />
                <div>
                  <p className="font-medium text-foreground">
                    Configure a producao antes de orcar
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    O formulario precisa de ao menos uma maquina e um material cadastrados.
                  </p>
                </div>
              </div>
              <Link
                href="/dashboard/settings"
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-primary/40 px-3 text-sm font-semibold text-primary transition hover:bg-primary/10"
              >
                Abrir configuracoes
              </Link>
            </div>
          </Card>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]"
        >
          <div className="grid min-w-0 gap-4">
            <Card className="overflow-hidden p-5">
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <TextField
                  label="Cliente"
                  value={form.customerName}
                  onChange={(value) => updateField("customerName", value)}
                  required
                />
                <TextField
                  label="Validade"
                  type="date"
                  value={form.validUntil}
                  onChange={(value) => updateField("validUntil", value)}
                  required
                />
                <SelectField
                  label="Status"
                  value={form.status}
                  onChange={(value) =>
                    updateField("status", value as QuoteStatus)
                  }
                >
                  {quoteStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {quoteStatusLabels[status]}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Formula"
                  value={form.formulaId}
                  onChange={(value) => updateField("formulaId", value)}
                  disabled={isLoadingResources || formulas.length === 0}
                >
                  {formulas.length === 0 ? (
                    <option value="">Formula padrao do sistema</option>
                  ) : null}
                  {formulas.map((formula) => (
                    <option key={formula.id} value={formula.id}>
                      {formula.name}
                      {formula.isDefault ? " - padrao" : ""}
                    </option>
                  ))}
                </SelectField>
              </div>
            </Card>

            <section className="grid min-w-0 gap-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Mesas de impressao
                  </h2>
                  <p className="text-sm text-muted">
                    Adicione pecas com maquinas, materiais e tempos independentes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addTable}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-primary transition hover:bg-primary/20"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar mesa
                </button>
              </div>

              {form.tables.map((table, index) => (
                <PrintTableCard
                  key={table.localId}
                  table={table}
                  index={index}
                  machines={machines}
                  materials={materials}
                  preview={tablePreviews[table.localId] ?? null}
                  canRemove={form.tables.length > 1}
                  isLoadingResources={isLoadingResources}
                  onChange={(patch) => updateTable(table.localId, patch)}
                  onRemove={() => removeTable(table.localId)}
                />
              ))}
            </section>
          </div>

          <aside className="grid content-start gap-4 xl:sticky xl:top-24">
            <Card className="p-5">
              <p className="text-sm text-muted">Valor acumulado</p>
              <p
                className={cn(
                  "mt-2 text-4xl font-semibold text-foreground transition-all duration-300",
                  isCalculating && "scale-[0.99] opacity-60",
                )}
              >
                {aggregate.totalAmount !== null
                  ? toMoney(aggregate.totalAmount)
                  : "--"}
              </p>
              <p className="mt-2 text-sm text-muted">
                {isCalculating ? "Recalculando mesas..." : "Soma dos previews"}
              </p>

              <div className="mt-5 grid gap-3">
                <SummaryLine
                  label="Mesas"
                  value={String(form.tables.length)}
                  icon={Layers3}
                />
                <SummaryLine
                  label="Peso total"
                  value={`${aggregate.totalWeightGrams.toFixed(2)} g`}
                  icon={Scale}
                />
                <SummaryLine
                  label="Tempo total"
                  value={`${aggregate.totalPrintHours.toFixed(2)} h`}
                  icon={Clock3}
                />
                <SummaryLine
                  label="Valor salvo"
                  value={savedQuote ? toMoney(savedQuote.totalAmount) : "--"}
                  icon={Calculator}
                />
              </div>
            </Card>

            <button
              type="submit"
              disabled={isSaving || !canSave}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {quoteId ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {isSaving
                ? "Salvando..."
                : quoteId
                  ? "Salvar orcamento"
                  : "Criar orcamento"}
            </button>

            {savedQuote ? (
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={isDownloadingPdf}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download
                  className={cn(
                    "h-4 w-4",
                    isDownloadingPdf && "animate-pulse",
                  )}
                />
                {isDownloadingPdf ? "Gerando PDF..." : "Gerar PDF"}
              </button>
            ) : null}
          </aside>
        </form>
      </div>
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }
      />
    </MainLayout>
  );
};

interface PrintTableCardProps {
  table: PrintTableFormState;
  index: number;
  machines: MachineResource[];
  materials: MaterialResource[];
  preview: CalculationResponse | null;
  canRemove: boolean;
  isLoadingResources: boolean;
  onChange: (patch: Partial<PrintTableFormState>) => void;
  onRemove: () => void;
}

const PrintTableCard = ({
  table,
  index,
  machines,
  materials,
  preview,
  canRemove,
  isLoadingResources,
  onChange,
  onRemove,
}: PrintTableCardProps) => (
  <Card className="min-w-0 overflow-hidden p-5 transition hover:border-primary/40">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <p className="text-sm font-medium text-primary">Mesa {index + 1}</p>
        <h3 className="mt-1 text-lg font-semibold text-foreground">
          {table.modelName || "Peca sem nome"}
        </h3>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge tone={preview ? "success" : "warning"}>
          {preview ? toMoney(preview.breakdown.finalPrice) : "aguardando"}
        </StatusBadge>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
          title="Remover mesa"
          aria-label="Remover mesa"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>

    <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <TextField
        label="Nome da peca"
        value={table.modelName}
        onChange={(value) => onChange({ modelName: value })}
        required
      />
      <SelectField
        label="Maquina"
        value={table.machineId}
        onChange={(value) => onChange({ machineId: value })}
        disabled={isLoadingResources || machines.length === 0}
      >
        {machines.length === 0 ? (
          <option value="">Cadastre uma maquina primeiro</option>
        ) : null}
        {machines.map((machine) => (
          <option key={machine.id} value={machine.id}>
            {machine.name} - {machine.type}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Material"
        value={table.materialId}
        onChange={(value) => onChange({ materialId: value })}
        disabled={isLoadingResources || materials.length === 0}
      >
        {materials.length === 0 ? (
          <option value="">Cadastre um material primeiro</option>
        ) : null}
        {materials.map((material) => (
          <option key={material.id} value={material.id}>
            {material.brand} - {material.color}
          </option>
        ))}
      </SelectField>
      <NumberField
        icon={Scale}
        label="Peso"
        suffix="g"
        value={table.weightGrams}
        onChange={(value) => onChange({ weightGrams: value })}
      />
      <NumberField
        icon={Clock3}
        label="Tempo"
        suffix="h"
        value={table.printTimeHours}
        onChange={(value) => onChange({ printTimeHours: value })}
      />
      <div className="grid min-h-11 min-w-0 content-end gap-1 rounded-lg border border-border bg-background px-3 py-2">
        <span className="text-xs uppercase text-muted">Subtotal</span>
        <span className="text-sm font-semibold text-foreground">
          {preview ? toMoney(preview.breakdown.finalPrice) : "--"}
        </span>
      </div>
    </div>
  </Card>
);

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}

const TextField = ({
  label,
  value,
  onChange,
  type = "text",
  required,
}: TextFieldProps) => (
  <label className="grid min-w-0 gap-2">
    <span className="text-sm font-medium text-foreground">{label}</span>
    <input
      type={type}
      value={value}
      required={required}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary"
    />
  </label>
);

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

const SelectField = ({
  label,
  value,
  onChange,
  disabled,
  children,
}: SelectFieldProps) => (
  <label className="grid min-w-0 gap-2">
    <span className="text-sm font-medium text-foreground">{label}</span>
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </select>
  </label>
);

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

interface SummaryLineProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

const SummaryLine = ({ icon: Icon, label, value }: SummaryLineProps) => (
  <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3">
    <span className="flex items-center gap-2 text-sm text-muted">
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </span>
    <span className="text-sm font-semibold text-foreground">{value}</span>
  </div>
);
