"use client";

import type {
  CustomVariableType,
  FormulaPayload,
  FormulaPreviewResponse,
  FormulaResource,
  FormulaVariable,
  ProductionSettings,
} from "@3d-budget/shared";
import axios from "axios";
import {
  AlertTriangle,
  Code2,
  FlaskConical,
  Info,
  Pencil,
  type LucideIcon,
  Plus,
  Save,
  Settings2,
  Trash2,
  Variable,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";

interface FormulaFormState {
  name: string;
  expression: string;
  isActive: boolean;
  isDefault: boolean;
}

interface CustomVariableRow {
  localId: string;
  name: string;
  value: string;
  type: CustomVariableType;
}

interface ToastState {
  tone: "success" | "danger";
  message: string;
}

const defaultSettings: ProductionSettings = {
  desiredMarginPercent: 30,
  technicalHourRate: 0,
  paintingHourRate: 0,
  finishingHourRate: 0,
  errorRate: 0,
  energyCostPerKwh: 0,
  cardFeePercent: 0,
  administrativeFeePercent: 0,
  customVariables: {},
};

const emptyFormulaForm: FormulaFormState = {
  name: "",
  expression: "(custo_base * (1 + margem_lucro)) + (custo_base * taxa_cartao)",
  isActive: true,
  isDefault: false,
};

const typeLabels: Record<CustomVariableType, string> = {
  INTEGER: "Int",
  FLOAT: "Float",
  PERCENTAGE: "%",
};

const typeDescriptions: Record<CustomVariableType, string> = {
  INTEGER: "Inteiro sem casas decimais.",
  FLOAT: "Decimal comum.",
  PERCENTAGE: "Percentual: 15 vira 0.15 no parser.",
};

const typeOptions: Array<{ value: CustomVariableType; label: string }> = [
  { value: "FLOAT", label: "Float" },
  { value: "INTEGER", label: "Integer" },
  { value: "PERCENTAGE", label: "Percentage" },
];

const defaultPreviewOrder = [
  "custo_base",
  "margem_lucro",
  "taxa_cartao",
  "material_cost",
  "tempo",
  "peso",
];

const variableNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const createLocalId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
};

const toMoney = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const toFormulaForm = (formula: FormulaResource): FormulaFormState => ({
  name: formula.name,
  expression: formula.expression,
  isActive: formula.isActive,
  isDefault: formula.isDefault,
});

const sanitizeInteger = (value: string): string =>
  value.replace(/[,.].*$/, "").replace(/[^\d-]/g, "");

const numberFromInput = (value: string): number => Number(value.replace(",", "."));

const defaultPreviewValue = (variable: FormulaVariable): string => {
  if (typeof variable.value === "number") {
    return String(variable.value);
  }

  if (variable.type === "PERCENTAGE") {
    return "10";
  }

  if (variable.type === "INTEGER") {
    return "1";
  }

  return "1";
};

const customRowsFromSettings = (
  settings: ProductionSettings,
): CustomVariableRow[] =>
  Object.entries(settings.customVariables).map(([name, variable]) => ({
    localId: createLocalId(),
    name,
    value: String(variable.value),
    type: variable.type,
  }));

const getUsedVariableNames = (expression: string): Set<string> => {
  const normalizedExpression = expression.replace(
    /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    "$1",
  );
  const matches = normalizedExpression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
  return new Set(matches);
};

export default function FormulasPage() {
  const { isLoading: isAuthLoading, token } = useAuth();
  const expressionRef = useRef<HTMLTextAreaElement>(null);
  const [formulas, setFormulas] = useState<FormulaResource[]>([]);
  const [variables, setVariables] = useState<FormulaVariable[]>([]);
  const [settings, setSettings] =
    useState<ProductionSettings>(defaultSettings);
  const [customRows, setCustomRows] = useState<CustomVariableRow[]>([]);
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(null);
  const [formulaForm, setFormulaForm] =
    useState<FormulaFormState>(emptyFormulaForm);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<FormulaPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingFormula, setIsSavingFormula] = useState(false);
  const [isSavingVariables, setIsSavingVariables] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const loadData = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);

    try {
      const [formulasResponse, variablesResponse, settingsResponse] =
        await Promise.all([
          api.get<FormulaResource[]>("/formulas"),
          api.get<FormulaVariable[]>("/formulas/variables"),
          api.get<ProductionSettings>("/settings"),
        ]);

      setFormulas(formulasResponse.data);
      setVariables(variablesResponse.data);
      setSettings(settingsResponse.data);
      setCustomRows(customRowsFromSettings(settingsResponse.data));
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(error, "Nao foi possivel carregar formulas."),
      });
    } finally {
      setIsLoading(false);
    }
  }, [showToast, token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void loadData();
    }
  }, [isAuthLoading, loadData]);

  const visiblePreviewVariables = useMemo(() => {
    const usedVariables = getUsedVariableNames(formulaForm.expression);
    const variablesInExpression = variables.filter((variable) =>
      usedVariables.has(variable.name),
    );

    if (variablesInExpression.length > 0) {
      return variablesInExpression;
    }

    return variables
      .filter(
        (variable) =>
          defaultPreviewOrder.includes(variable.name) ||
          variable.source === "CUSTOM",
      )
      .slice(0, 8);
  }, [formulaForm.expression, variables]);

  useEffect(() => {
    setPreviewValues((current) => {
      const next = { ...current };

      for (const variable of visiblePreviewVariables) {
        if (!(variable.name in next)) {
          next[variable.name] = defaultPreviewValue(variable);
        }
      }

      return next;
    });
  }, [visiblePreviewVariables]);

  useEffect(() => {
    if (!isEditorOpen || !token || !formulaForm.expression.trim()) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setIsPreviewing(true);

      try {
        const variablesPayload = Object.fromEntries(
          visiblePreviewVariables.map((variable) => [
            variable.name,
            numberFromInput(previewValues[variable.name] ?? defaultPreviewValue(variable)),
          ]),
        );
        const { data } = await api.post<FormulaPreviewResponse>(
          "/formulas/preview",
          {
            expression: formulaForm.expression,
            variables: variablesPayload,
          },
        );

        setPreview(data);
        setPreviewError(null);
      } catch (error) {
        setPreview(null);
        setPreviewError(
          getApiErrorMessage(error, "Nao foi possivel calcular o preview."),
        );
      } finally {
        setIsPreviewing(false);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    formulaForm.expression,
    isEditorOpen,
    previewValues,
    token,
    visiblePreviewVariables,
  ]);

  const startNewFormula = () => {
    setSelectedFormulaId(null);
    setFormulaForm(emptyFormulaForm);
    setFormulaError(null);
    setPreviewError(null);
    setPreview(null);
    setIsEditorOpen(true);
  };

  const selectFormula = (formula: FormulaResource) => {
    setSelectedFormulaId(formula.id);
    setFormulaForm(toFormulaForm(formula));
    setFormulaError(null);
    setPreviewError(null);
    setPreview(null);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setSelectedFormulaId(null);
    setFormulaForm(emptyFormulaForm);
    setFormulaError(null);
    setPreviewError(null);
    setPreview(null);
  };

  const insertVariable = (name: string) => {
    const tag = `{${name}}`;
    const input = expressionRef.current;

    if (!input) {
      setFormulaForm((current) => ({
        ...current,
        expression: `${current.expression}${tag}`,
      }));
      return;
    }

    const start = input.selectionStart;
    const end = input.selectionEnd;

    setFormulaForm((current) => ({
      ...current,
      expression: `${current.expression.slice(0, start)}${tag}${current.expression.slice(end)}`,
    }));

    window.requestAnimationFrame(() => {
      input.focus();
      input.selectionStart = start + tag.length;
      input.selectionEnd = start + tag.length;
    });
  };

  const saveFormula = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingFormula(true);
    setFormulaError(null);

    const payload: FormulaPayload = {
      name: formulaForm.name,
      expression: formulaForm.expression,
      isActive: formulaForm.isActive,
      isDefault: formulaForm.isDefault,
    };

    try {
      if (selectedFormulaId) {
        const { data } = await api.put<FormulaResource>(
          `/formulas/${selectedFormulaId}`,
          payload,
        );
        setFormulas((current) =>
          current.map((formula) => (formula.id === data.id ? data : formula)),
        );
        setFormulaForm(toFormulaForm(data));
      } else {
        const { data } = await api.post<FormulaResource>("/formulas", payload);
        setFormulas((current) => [data, ...current]);
        setSelectedFormulaId(data.id);
        setFormulaForm(toFormulaForm(data));
      }

      showToast({ tone: "success", message: "Formula validada e salva." });
      closeEditor();
      void loadData();
    } catch (error) {
      const message = getApiErrorMessage(error, "Nao foi possivel salvar a formula.");
      setFormulaError(message);
      showToast({ tone: "danger", message });
    } finally {
      setIsSavingFormula(false);
    }
  };

  const deleteFormula = async (formula: FormulaResource) => {
    const confirmed = window.confirm(`Excluir ${formula.name}?`);

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/formulas/${formula.id}`);
      setFormulas((current) =>
        current.filter((item) => item.id !== formula.id),
      );
      closeEditor();
      showToast({ tone: "success", message: "Formula excluida." });
      void loadData();
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(error, "Nao foi possivel excluir a formula."),
      });
    }
  };

  const addCustomVariable = () => {
    setCustomRows((current) => [
      ...current,
      { localId: createLocalId(), name: "", value: "0", type: "FLOAT" },
    ]);
  };

  const updateCustomVariable = (
    localId: string,
    patch: Partial<CustomVariableRow>,
  ) => {
    setCustomRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row)),
    );
  };

  const updateCustomVariableType = (
    localId: string,
    type: CustomVariableType,
  ) => {
    setCustomRows((current) =>
      current.map((row) =>
        row.localId === localId
          ? {
              ...row,
              type,
              value: type === "INTEGER" ? sanitizeInteger(row.value || "0") : row.value,
            }
          : row,
      ),
    );
  };

  const updateCustomVariableValue = (
    row: CustomVariableRow,
    value: string,
  ) => {
    if (row.type === "INTEGER" && /[,.]/.test(value)) {
      return;
    }

    updateCustomVariable(row.localId, {
      value: row.type === "INTEGER" ? sanitizeInteger(value) : value,
    });
  };

  const removeCustomVariable = (localId: string) => {
    setCustomRows((current) => current.filter((row) => row.localId !== localId));
  };

  const saveCustomVariables = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingVariables(true);

    try {
      const entries = customRows
        .map((row) => ({
          name: row.name.trim(),
          value: numberFromInput(row.value),
          type: row.type,
          rawValue: row.value,
        }))
        .filter((row) => row.name.length > 0);

      const duplicatedName = entries.find(
        (row, index) =>
          entries.findIndex((entry) => entry.name === row.name) !== index,
      );

      if (duplicatedName) {
        throw new Error(`Variavel duplicada: ${duplicatedName.name}`);
      }

      for (const entry of entries) {
        if (!variableNamePattern.test(entry.name)) {
          throw new Error(`Nome invalido: ${entry.name}`);
        }

        if (!Number.isFinite(entry.value)) {
          throw new Error(`Valor invalido para ${entry.name}`);
        }

        if (entry.type === "INTEGER" && /[,.]/.test(entry.rawValue)) {
          throw new Error(`Variavel inteira nao aceita decimal: ${entry.name}`);
        }
      }

      const customVariables = Object.fromEntries(
        entries.map((entry) => [
          entry.name,
          { value: entry.value, type: entry.type },
        ]),
      );
      const { data } = await api.put<ProductionSettings>("/settings", {
        ...settings,
        customVariables,
      });

      setSettings(data);
      setCustomRows(customRowsFromSettings(data));
      showToast({ tone: "success", message: "Variaveis salvas." });
      void loadData();
    } catch (error) {
      showToast({
        tone: "danger",
        message:
          error instanceof Error && !axios.isAxiosError(error)
            ? error.message
            : getApiErrorMessage(error, "Nao foi possivel salvar as variaveis."),
      });
    } finally {
      setIsSavingVariables(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/80 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">parser seguro</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Formulas de preco
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Edite equacoes, teste variaveis e defina a regra comercial aplicada aos orcamentos.
            </p>
          </div>
          <button
            type="button"
            onClick={startNewFormula}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nova formula
          </button>
        </section>

        {isLoading ? <Card className="min-h-96 animate-pulse p-5" /> : null}

        {!isLoading ? (
          <>
            <Card className="p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <PanelTitle
                  icon={Code2}
                  title="Biblioteca"
                  subtitle="Formulas salvas por empresa."
                />
                <span className="text-sm text-muted">{formulas.length} formulas</span>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {formulas.map((formula) => (
                  <div
                    key={formula.id}
                    className="grid min-w-0 gap-4 rounded-lg border border-border bg-background p-4 transition hover:border-primary/50"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">
                          {formula.name}
                        </p>
                        <p className="mt-2 truncate font-mono text-xs text-muted">
                          {formula.expression}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {formula.isDefault ? (
                          <StatusBadge tone="success">Padrao</StatusBadge>
                        ) : null}
                        {!formula.isActive ? (
                          <StatusBadge tone="warning">Inativa</StatusBadge>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => selectFormula(formula)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/40 px-3 text-sm font-semibold text-primary transition hover:bg-primary/10"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </button>
                    </div>
                  </div>
                ))}

                {formulas.length === 0 ? (
                  <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-border text-sm text-muted lg:col-span-2">
                    Nenhuma formula cadastrada.
                  </div>
                ) : null}
              </div>
            </Card>

            {isEditorOpen ? (
              <section className="grid min-w-0 items-start gap-4 2xl:grid-cols-[360px_minmax(0,1fr)]">
                <Card className="min-w-0 p-5">
                  <PanelTitle
                    icon={Variable}
                    title="Variaveis disponiveis"
                    subtitle="Clique para inserir no cursor."
                  />
                  <div className="mt-5 grid max-h-[640px] gap-5 overflow-y-auto pr-1">
                    <VariableGroup
                      title="Sistema"
                      variables={variables.filter(
                        (variable) => variable.source === "SYSTEM",
                      )}
                      onInsert={insertVariable}
                    />
                    <VariableGroup
                      title="Custom"
                      variables={variables.filter(
                        (variable) => variable.source === "CUSTOM",
                      )}
                      onInsert={insertVariable}
                    />
                  </div>
                </Card>

                <div className="grid min-w-0 gap-4">
                  <Card className="min-w-0 p-5">
                    <form className="grid min-w-0 gap-4" onSubmit={saveFormula}>
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <PanelTitle
                          icon={FlaskConical}
                          title={selectedFormulaId ? "Editar formula" : "Nova formula"}
                          subtitle="O backend faz dry run antes de salvar."
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <ToggleLabel
                            label="Ativa"
                            checked={formulaForm.isActive}
                            onChange={(checked) =>
                              setFormulaForm((current) => ({
                                ...current,
                                isActive: checked,
                              }))
                            }
                          />
                          <ToggleLabel
                            label="Padrao"
                            checked={formulaForm.isDefault}
                            onChange={(checked) =>
                              setFormulaForm((current) => ({
                                ...current,
                                isDefault: checked,
                              }))
                            }
                          />
                          <button
                            type="button"
                            title="Fechar editor"
                            aria-label="Fechar editor"
                            onClick={closeEditor}
                            className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <label className="grid min-w-0 gap-2">
                        <span className="text-sm font-medium text-foreground">
                          Nome
                        </span>
                        <input
                          value={formulaForm.name}
                          onChange={(event) =>
                            setFormulaForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          required
                          className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary"
                        />
                      </label>

                      <label className="grid min-w-0 gap-2">
                        <span className="text-sm font-medium text-foreground">
                          Equacao
                        </span>
                        <textarea
                          ref={expressionRef}
                          value={formulaForm.expression}
                          onChange={(event) => {
                            setFormulaError(null);
                            setFormulaForm((current) => ({
                              ...current,
                              expression: event.target.value,
                            }));
                          }}
                          required
                          rows={7}
                          className={cn(
                            "min-h-44 w-full min-w-0 resize-y rounded-lg border bg-background px-3 py-3 font-mono text-sm outline-none transition",
                            previewError || formulaError
                              ? "border-danger/60 focus:border-danger"
                              : "border-border focus:border-primary focus:shadow-[0_0_0_1px_rgba(99,102,241,0.35)]",
                          )}
                        />
                      </label>

                      {previewError || formulaError ? (
                        <Alert tone="danger">
                          {formulaError ?? previewError}
                        </Alert>
                      ) : null}

                      <div className="min-w-0 rounded-lg border border-border bg-background p-3">
                        <p className="mb-2 text-xs uppercase text-muted">
                          Leitura da equacao
                        </p>
                        <HighlightedExpression
                          expression={formulaForm.expression}
                          variables={variables}
                        />
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        {selectedFormulaId ? (
                          <button
                            type="button"
                            disabled={
                              formulas.find((formula) => formula.id === selectedFormulaId)
                                ?.isSystem
                            }
                            onClick={() => {
                              const selected = formulas.find(
                                (formula) => formula.id === selectedFormulaId,
                              );
                              if (selected) {
                                void deleteFormula(selected);
                              }
                            }}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-danger/40 px-4 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Excluir
                          </button>
                        ) : (
                          <span />
                        )}

                        <button
                          type="submit"
                          disabled={isSavingFormula}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
                        >
                          <Save className="h-4 w-4" />
                          {isSavingFormula ? "Validando..." : "Salvar formula"}
                        </button>
                      </div>
                    </form>
                  </Card>

                  <Card className="min-w-0 p-5">
                    <PanelTitle
                      icon={FlaskConical}
                      title="Teste de formula"
                      subtitle="Valores ficticios sao enviados ao parser em tempo real."
                    />
                    <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                        {visiblePreviewVariables.map((variable) => (
                          <PreviewInput
                            key={variable.name}
                            variable={variable}
                            value={
                              previewValues[variable.name] ??
                              defaultPreviewValue(variable)
                            }
                            onChange={(value) =>
                              setPreviewValues((current) => ({
                                ...current,
                                [variable.name]: value,
                              }))
                            }
                          />
                        ))}
                      </div>
                      <div className="rounded-lg border border-border bg-background p-4">
                        <p className="text-sm text-muted">
                          {isPreviewing ? "Calculando..." : "Resultado"}
                        </p>
                        <p className="mt-3 text-3xl font-semibold text-foreground">
                          {preview ? toMoney(preview.result) : "--"}
                        </p>
                        <p className="mt-3 text-xs text-muted">
                          Percentuais sao convertidos para taxa decimal antes da execucao.
                        </p>
                      </div>
                    </div>
                  </Card>
                </div>
              </section>
            ) : null}

            <Card className="p-5">
              <form className="grid gap-4" onSubmit={saveCustomVariables}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <PanelTitle
                    icon={Settings2}
                    title="Variaveis customizadas"
                    subtitle="Campos salvos em custos fixos e disponiveis nas formulas."
                  />
                  <button
                    type="button"
                    onClick={addCustomVariable}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-primary transition hover:bg-primary/20"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </button>
                </div>

                <div className="grid gap-2">
                  <div className="hidden grid-cols-[minmax(0,1fr)_150px_170px_44px] gap-2 px-3 text-xs uppercase text-muted lg:grid">
                    <span>Nome</span>
                    <span>Tipo</span>
                    <span>Valor</span>
                    <span />
                  </div>
                  {customRows.map((row) => (
                    <div
                      key={row.localId}
                      className="grid min-w-0 gap-2 rounded-lg border border-border bg-background p-3 lg:grid-cols-[minmax(0,1fr)_150px_170px_44px]"
                    >
                      <input
                        value={row.name}
                        onChange={(event) =>
                          updateCustomVariable(row.localId, {
                            name: event.target.value,
                          })
                        }
                        placeholder="taxa_manutencao"
                        className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition focus:border-primary"
                      />
                      <select
                        value={row.type}
                        onChange={(event) =>
                          updateCustomVariableType(
                            row.localId,
                            event.target.value as CustomVariableType,
                          )
                        }
                        className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition focus:border-primary"
                      >
                        {typeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 transition focus-within:border-primary">
                        <input
                          type="number"
                          step={row.type === "INTEGER" ? "1" : "0.01"}
                          value={row.value}
                          onChange={(event) =>
                            updateCustomVariableValue(row, event.target.value)
                          }
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        />
                        <span className="text-xs font-semibold text-muted">
                          {row.type === "PERCENTAGE" ? "%" : typeLabels[row.type]}
                        </span>
                      </div>
                      <button
                        type="button"
                        title="Remover"
                        aria-label="Remover"
                        onClick={() => removeCustomVariable(row.localId)}
                        className="grid min-h-11 place-items-center rounded-lg border border-border text-muted transition hover:border-danger hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {customRows.length === 0 ? (
                    <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-border text-sm text-muted">
                      Nenhuma variavel customizada.
                    </div>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={isSavingVariables}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 text-sm font-semibold text-background transition hover:bg-secondary/90 disabled:opacity-70"
                >
                  <Save className="h-4 w-4" />
                  {isSavingVariables ? "Salvando..." : "Salvar variaveis"}
                </button>
              </form>
            </Card>
          </>
        ) : null}
      </div>

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

interface PanelTitleProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

const PanelTitle = ({ icon: Icon, title, subtitle }: PanelTitleProps) => (
  <div className="flex items-start gap-3">
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
    </div>
  </div>
);

const ToggleLabel = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    {label}
  </label>
);

const VariableGroup = ({
  title,
  variables,
  onInsert,
}: {
  title: string;
  variables: FormulaVariable[];
  onInsert: (name: string) => void;
}) => (
  <div className="grid min-w-0 gap-2">
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold uppercase text-muted">{title}</p>
      <span className="text-xs text-muted">{variables.length}</span>
    </div>
    <div className="grid min-w-0 gap-2">
      {variables.length > 0 ? (
        variables.map((variable) => (
          <button
            key={variable.name}
            type="button"
            title={variable.description}
            onClick={() => onInsert(variable.name)}
            className={cn(
              "group flex min-h-12 min-w-0 items-center justify-between gap-3 rounded-lg border px-3 text-left transition",
              variable.source === "CUSTOM"
                ? "border-violet-400/30 bg-violet-500/10 hover:border-violet-300"
                : "border-sky-400/25 bg-sky-500/10 hover:border-sky-300",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-sm font-semibold text-foreground">
                {"{"}
                {variable.name}
                {"}"}
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted">
                <Info className="h-3 w-3" />
                <span className="truncate">{variable.description}</span>
              </span>
            </span>
            <TypeBadge type={variable.type} source={variable.source} />
          </button>
        ))
      ) : (
        <div className="grid min-h-16 place-items-center rounded-lg border border-dashed border-border text-sm text-muted">
          Nenhuma variavel.
        </div>
      )}
    </div>
  </div>
);

const TypeBadge = ({
  type,
  source,
}: {
  type: CustomVariableType;
  source: FormulaVariable["source"];
}) => (
  <span
    title={typeDescriptions[type]}
    className={cn(
      "inline-flex h-7 shrink-0 items-center rounded-md border px-2 text-xs font-semibold",
      source === "CUSTOM"
        ? "border-violet-300/40 bg-violet-400/10 text-violet-200"
        : "border-sky-300/40 bg-sky-400/10 text-sky-200",
    )}
  >
    {typeLabels[type]}
  </span>
);

const Alert = ({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "danger";
}) => (
  <div
    className={cn(
      "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
      tone === "danger" && "border-danger/40 bg-danger/10 text-danger",
    )}
  >
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
    <span>{children}</span>
  </div>
);

const HighlightedExpression = ({
  expression,
  variables,
}: {
  expression: string;
  variables: FormulaVariable[];
}) => {
  const variableMap = new Map(variables.map((variable) => [variable.name, variable]));
  const tokens = expression
    .split(/(\{?[a-zA-Z_][a-zA-Z0-9_]*\}?|[()+\-*/^])/g)
    .filter(Boolean);

  return (
    <pre className="min-h-12 max-w-full whitespace-pre-wrap break-words font-mono text-sm leading-7 text-muted">
      {tokens.map((token, index) => {
        const normalizedToken = token.replace(/[{}]/g, "");
        const variable = variableMap.get(normalizedToken);

        if (variable) {
          return (
            <span
              key={`${token}-${index}`}
              className={cn(
                "rounded px-1 py-0.5 font-semibold",
                variable.source === "CUSTOM"
                  ? "bg-violet-500/15 text-violet-200"
                  : "bg-sky-500/15 text-sky-200",
              )}
            >
              {token}
            </span>
          );
        }

        if (/^[()+\-*/^]$/.test(token)) {
          return (
            <span key={`${token}-${index}`} className="text-primary">
              {token}
            </span>
          );
        }

        return <span key={`${token}-${index}`}>{token}</span>;
      })}
    </pre>
  );
};

const PreviewInput = ({
  variable,
  value,
  onChange,
}: {
  variable: FormulaVariable;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="grid min-w-0 gap-2">
    <span className="flex min-w-0 items-center justify-between gap-2 text-sm font-medium text-foreground">
      <span className="min-w-0 truncate font-mono">{variable.name}</span>
      <TypeBadge type={variable.type} source={variable.source} />
    </span>
    <span className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 transition focus-within:border-primary">
      <input
        type="number"
        step={variable.type === "INTEGER" ? "1" : "0.01"}
        value={value}
        onChange={(event) => {
          if (variable.type === "INTEGER" && /[,.]/.test(event.target.value)) {
            return;
          }

          onChange(
            variable.type === "INTEGER"
              ? sanitizeInteger(event.target.value)
              : event.target.value,
          );
        }}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      <span className="text-xs font-semibold text-muted">
        {variable.type === "PERCENTAGE" ? "%" : typeLabels[variable.type]}
      </span>
    </span>
  </label>
);
