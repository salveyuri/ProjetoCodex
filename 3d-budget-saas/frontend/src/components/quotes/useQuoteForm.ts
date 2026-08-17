import type {
  FormulaResource,
  MachineResource,
  MaterialResource,
  QuoteItemCostPreview,
  QuotePayload,
  QuotePreviewRequest,
  QuotePreviewResponse,
  QuoteResource,
  QuoteUpdatePayload,
} from "@3d-budget/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createToastId,
  type ToastMessage,
} from "@/components/ui/toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { downloadQuotePdf } from "@/lib/download-quote-pdf";
import { toDateInputValue } from "./quote-ui";
import type { PrintTableFormState, QuoteFormState } from "./quote-form-types";

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
  modelName: "",
  machineId: "",
  materialId: "",
  weightGrams: "",
  printTimeHours: "",
  ...overrides,
});

const createEmptyForm = (): QuoteFormState => ({
  customerName: "",
  validUntil: nextWeek(),
  status: "DRAFT",
  formulaId: "",
  paintingHours: "",
  finishingHours: "",
  tables: [createPrintTable()],
});

const numberFromInput = (value: string | null | undefined): number => {
  if (value === null || value === undefined || value.trim() === "") {
    return 0;
  }

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const isPrintTableReadyForPreview = (table: PrintTableFormState): boolean =>
  Boolean(table.machineId) &&
  Boolean(table.materialId) &&
  table.modelName.trim().length >= 2 &&
  numberFromInput(table.weightGrams) > 0 &&
  numberFromInput(table.printTimeHours) > 0;

const toFormState = (quote: QuoteResource): QuoteFormState => ({
  customerName: quote.customerName,
  validUntil: toDateInputValue(quote.validUntil),
  status: quote.status,
  formulaId: quote.formulaId ?? "",
  paintingHours: String(quote.paintingHours),
  finishingHours: String(quote.finishingHours),
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

export const useQuoteForm = (quoteId?: string) => {
  const router = useRouter();
  const { isLoading: isAuthLoading, token } = useAuth();
  const { t } = useLanguage();
  const [form, setForm] = useState<QuoteFormState>(() => createEmptyForm());
  const [machines, setMachines] = useState<MachineResource[]>([]);
  const [materials, setMaterials] = useState<MaterialResource[]>([]);
  const [formulas, setFormulas] = useState<FormulaResource[]>([]);
  // Preview is computed once for the whole quote (never per mesa — see
  // Contextos/Decisoes.md, 2026-08-17). `tableIds` records which localIds
  // `response.items` correspond to (same order), so the per-mesa raw cost
  // can be looked back up even if `form.tables` changes before the next
  // debounced recalculation lands.
  const [preview, setPreview] = useState<{
    response: QuotePreviewResponse;
    tableIds: string[];
  } | null>(null);
  const [savedQuote, setSavedQuote] = useState<QuoteResource | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingResources, setIsLoadingResources] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const previewableTables = useMemo(
    () => form.tables.filter(isPrintTableReadyForPreview),
    [form.tables],
  );

  const postProcessingIsValid = useMemo(
    () =>
      numberFromInput(form.paintingHours) >= 0 &&
      numberFromInput(form.finishingHours) >= 0,
    [form.finishingHours, form.paintingHours],
  );

  const canCalculate =
    Boolean(token) && postProcessingIsValid && previewableTables.length > 0;
  const canSave =
    Boolean(token) &&
    postProcessingIsValid &&
    form.tables.length > 0 &&
    form.tables.every(isPrintTableReadyForPreview) &&
    form.customerName.trim().length >= 2;
  const missingResources =
    !isLoadingResources && (machines.length === 0 || materials.length === 0);

  const showToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = createToastId();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
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
    const paintingHours = numberFromInput(form.paintingHours) || 0;
    const finishingHours = numberFromInput(form.finishingHours) || 0;
    const totalAmount = preview?.response.breakdown.finalPrice ?? 0;

    return {
      totalWeightGrams,
      totalPrintHours,
      paintingHours,
      finishingHours,
      totalAmount,
    };
  }, [form.finishingHours, form.paintingHours, form.tables, preview]);

  const itemPreviewByLocalId = useMemo(() => {
    const map: Record<string, QuoteItemCostPreview> = {};

    if (!preview) {
      return map;
    }

    preview.tableIds.forEach((localId, index) => {
      const item = preview.response.items[index];

      if (item) {
        map[localId] = item;
      }
    });

    return map;
  }, [preview]);

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
      }));
    } catch (error) {
      const message = getApiErrorMessage(error, t("quotes.form.errorLoad"));
      setErrorMessage(message);
      showToast({ tone: "danger", title: t("quotes.form.toastLoadErrorTitle"), message });
    } finally {
      setIsLoadingResources(false);
    }
  }, [quoteId, showToast, t, token]);

  const calculatePreview = useCallback(async () => {
    if (!canCalculate) {
      setPreview(null);
      return;
    }

    setIsCalculating(true);

    try {
      const tableIds = previewableTables.map((table) => table.localId);
      const payload: QuotePreviewRequest = {
        items: previewableTables.map((table) => ({
          modelName: table.modelName,
          weightGrams: numberFromInput(table.weightGrams),
          printTimeHours: numberFromInput(table.printTimeHours),
          machineId: table.machineId,
          materialId: table.materialId,
        })),
        formulaId: form.formulaId || undefined,
        paintingHours: numberFromInput(form.paintingHours) || 0,
        finishingHours: numberFromInput(form.finishingHours) || 0,
      };
      const response = await api.post<QuotePreviewResponse>(
        "/quotes/preview",
        payload,
      );

      setPreview({ response: response.data, tableIds });
    } catch (error) {
      setPreview(null);
      setErrorMessage(
        getApiErrorMessage(error, t("quotes.form.errorPreview")),
      );
    } finally {
      setIsCalculating(false);
    }
  }, [
    canCalculate,
    form.finishingHours,
    form.formulaId,
    form.paintingHours,
    previewableTables,
    t,
  ]);

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
      tables: [...current.tables, createPrintTable()],
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
  };

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    const payload: QuotePayload = {
      customerName: form.customerName,
      validUntil: form.validUntil,
      status: form.status,
      formulaId: form.formulaId || undefined,
      paintingHours: numberFromInput(form.paintingHours) || 0,
      finishingHours: numberFromInput(form.finishingHours) || 0,
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
          title: quoteId ? t("quotes.form.toastUpdatedTitle") : t("quotes.form.toastCreatedTitle"),
          message: t("quotes.form.toastSavedMsg"),
        }),
      );
      router.push("/dashboard/quotes");
    } catch (error) {
      const message = getApiErrorMessage(error, t("quotes.form.errorSave"));
      setErrorMessage(message);
      showToast({ tone: "danger", title: t("quotes.form.toastSaveErrorTitle"), message });
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
        title: t("quotes.form.toastPdfTitle"),
        message: t("quotes.form.toastPdfMsg"),
      });
    } catch (error) {
      const message = getApiErrorMessage(error, t("quotes.form.errorPdf"));
      showToast({ tone: "danger", title: t("quotes.form.toastPdfErrorTitle"), message });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return {
    form,
    machines,
    materials,
    formulas,
    itemPreviewByLocalId,
    savedQuote,
    toasts,
    dismissToast,
    errorMessage,
    isLoadingResources,
    isCalculating,
    isSaving,
    isDownloadingPdf,
    canSave,
    missingResources,
    aggregate,
    updateField,
    updateTable,
    addTable,
    removeTable,
    handleSubmit,
    handleDownloadPdf,
  };
};

export type UseQuoteFormResult = ReturnType<typeof useQuoteForm>;
