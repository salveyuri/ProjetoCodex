"use client";

import type { MachineCatalogImportResult, MachineCatalogPayload, MachineCatalogResource } from "@3d-budget/shared";
import axios from "axios";
import {
  AlertTriangle,
  Download,
  Edit3,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { parseCsv, triggerTextDownload } from "@/lib/csv";

type ModalState =
  | { mode: "create"; item?: undefined }
  | { mode: "edit"; item: MachineCatalogResource }
  | null;

interface CatalogFormState {
  brand: string;
  name: string;
  type: "FDM" | "RESIN";
  price: string;
  powerConsumptionWatts: string;
  printVolumeXmm: string;
  printVolumeYmm: string;
  printVolumeZmm: string;
  depreciationCostPerHour: string;
  maintenanceCostPerHour: string;
}

interface ToastState {
  tone: "success" | "danger";
  message: string;
}

const emptyForm: CatalogFormState = {
  brand: "",
  name: "",
  type: "FDM",
  price: "",
  powerConsumptionWatts: "",
  printVolumeXmm: "220",
  printVolumeYmm: "220",
  printVolumeZmm: "250",
  depreciationCostPerHour: "",
  maintenanceCostPerHour: "",
};

const toForm = (row: MachineCatalogResource): CatalogFormState => ({
  brand: row.brand,
  name: row.name,
  type: row.type,
  price: String(row.price),
  powerConsumptionWatts: String(row.powerConsumptionWatts),
  printVolumeXmm: String(row.printVolumeXmm),
  printVolumeYmm: String(row.printVolumeYmm),
  printVolumeZmm: String(row.printVolumeZmm),
  depreciationCostPerHour: String(row.depreciationCostPerHour),
  maintenanceCostPerHour: String(row.maintenanceCostPerHour),
});

const toPayload = (form: CatalogFormState): MachineCatalogPayload => ({
  brand: form.brand.trim(),
  name: form.name.trim(),
  type: form.type,
  price: Number(form.price),
  powerConsumptionWatts: Number(form.powerConsumptionWatts),
  printVolumeXmm: Number(form.printVolumeXmm),
  printVolumeYmm: Number(form.printVolumeYmm),
  printVolumeZmm: Number(form.printVolumeZmm),
  depreciationCostPerHour: Number(form.depreciationCostPerHour),
  maintenanceCostPerHour: Number(form.maintenanceCostPerHour),
});

const toMoney = (value: number): string =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CSV_COLUMNS = [
  "brand",
  "name",
  "type",
  "price",
  "powerConsumptionWatts",
  "printVolumeXmm",
  "printVolumeYmm",
  "printVolumeZmm",
  "depreciationCostPerHour",
  "maintenanceCostPerHour",
] as const;

const CSV_TEMPLATE = [
  CSV_COLUMNS.join(","),
  "Creality,Ender-3 V3,FDM,1800,270,220,220,250,1.2,0.4",
  "Elegoo,Mars 4 Ultra,RESIN,2200,100,153,77,165,1.5,0.6",
].join("\n");

const parseCsvRowToPayload = (row: Record<string, string>): Record<string, unknown> => ({
  brand: row.brand ?? "",
  name: row.name ?? "",
  type: (row.type ?? "").trim().toUpperCase(),
  price: Number(row.price),
  powerConsumptionWatts: Number(row.powerConsumptionWatts),
  printVolumeXmm: Number(row.printVolumeXmm),
  printVolumeYmm: Number(row.printVolumeYmm),
  printVolumeZmm: Number(row.printVolumeZmm),
  depreciationCostPerHour: Number(row.depreciationCostPerHour),
  maintenanceCostPerHour: Number(row.maintenanceCostPerHour),
});

export default function AdminMachineCatalogPage() {
  const { isLoading: isAuthLoading, token, refreshUser } = useAuth();
  const [rows, setRows] = useState<MachineCatalogResource[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<CatalogFormState>(emptyForm);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<MachineCatalogImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const loadRows = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsAccessDenied(false);

    try {
      const { data } = await api.get<MachineCatalogResource[]>("/admin/machine-catalog");
      setRows(data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setIsAccessDenied(true);
      } else {
        showToast({
          tone: "danger",
          message: getApiErrorMessage(error, "Nao foi possivel carregar o catalogo."),
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

        await loadRows();
      })();
    }
  }, [isAuthLoading, loadRows, refreshUser, token]);

  const openModal = (row?: MachineCatalogResource) => {
    setForm(row ? toForm(row) : emptyForm);
    setModal(row ? { mode: "edit", item: row } : { mode: "create" });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    const payload = toPayload(form);

    try {
      if (modal?.mode === "edit") {
        const { data } = await api.patch<MachineCatalogResource>(
          `/admin/machine-catalog/${modal.item.id}`,
          payload,
        );
        setRows((current) => current.map((row) => (row.id === data.id ? data : row)));
      } else {
        const { data } = await api.post<MachineCatalogResource>(
          "/admin/machine-catalog",
          payload,
        );
        setRows((current) =>
          [...current, data].sort(
            (a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name),
          ),
        );
      }

      setModal(null);
      showToast({ tone: "success", message: "Item do catalogo salvo." });
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(error, "Nao foi possivel salvar o item."),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRow = async (row: MachineCatalogResource) => {
    const confirmed = window.confirm(`Excluir "${row.brand} ${row.name}" do catalogo?`);

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/admin/machine-catalog/${row.id}`);
      setRows((current) => current.filter((item) => item.id !== row.id));
      showToast({ tone: "success", message: "Item excluido." });
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(error, "Nao foi possivel excluir o item."),
      });
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const { rows: csvRows } = parseCsv(text);

      if (csvRows.length === 0) {
        showToast({ tone: "danger", message: "O arquivo CSV esta vazio." });
        return;
      }

      const payloadRows = csvRows.map(parseCsvRowToPayload);
      const { data } = await api.post<MachineCatalogImportResult>(
        "/admin/machine-catalog/import",
        { rows: payloadRows },
      );

      setImportResult(data);
      showToast({
        tone: data.errors.length > 0 ? "danger" : "success",
        message: `Importacao concluida: ${data.created} criado(s), ${data.updated} atualizado(s), ${data.errors.length} erro(s).`,
      });
      await loadRows();
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(error, "Nao foi possivel importar o arquivo."),
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">Admin</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Catalogo de impressoras
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Referencia usada no autocomplete de cadastro de maquina das empresas. Preco e
              custos de depreciacao/manutencao alimentam o orcamento automaticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRows()}
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
          <Card className="p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <Upload className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Importar catalogo por CSV
                  </h2>
                  <p className="text-sm text-muted">
                    Colunas: {CSV_COLUMNS.join(", ")}. Uma linha existente (mesma marca+modelo)
                    e atualizada; o resto e criado.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => triggerTextDownload(CSV_TEMPLATE, "catalogo_modelo.csv")}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-muted transition hover:border-primary hover:text-primary"
                >
                  <Download className="h-4 w-4" />
                  Baixar modelo
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className={cn("h-4 w-4", isImporting && "animate-pulse")} />
                  {isImporting ? "Importando..." : "Importar CSV"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void handleImportFile(event)}
                  className="hidden"
                />
              </div>
            </div>

            {importResult && importResult.errors.length > 0 ? (
              <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  {importResult.errors.length} linha(s) com erro
                </div>
                <ul className="mt-2 grid gap-1">
                  {importResult.errors.map((rowError) => (
                    <li key={rowError.row}>
                      Linha {rowError.row} ({rowError.brand || "?"} {rowError.name || "?"}):{" "}
                      {rowError.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        ) : null}

        {!isAccessDenied ? (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border p-5">
              <div className="flex items-center gap-3">
                <Printer className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Impressoras cadastradas
                  </h2>
                  <p className="text-sm text-muted">{rows.length} itens.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openModal()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Novo item
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
                      <th className="px-5 py-3">Impressora</th>
                      <th className="px-5 py-3">Tipo</th>
                      <th className="px-5 py-3">Preco</th>
                      <th className="px-5 py-3">Volume (mm)</th>
                      <th className="px-5 py-3">Custo/h</th>
                      <th className="px-5 py-3">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                      <tr key={row.id} className="bg-surface/40">
                        <td className="px-5 py-4">
                          <p className="font-medium text-foreground">{row.brand}</p>
                          <p className="text-xs text-muted">{row.name}</p>
                        </td>
                        <td className="px-5 py-4 text-muted">{row.type}</td>
                        <td className="px-5 py-4 text-muted">{toMoney(row.price)}</td>
                        <td className="px-5 py-4 text-muted">
                          {row.printVolumeXmm}x{row.printVolumeYmm}x{row.printVolumeZmm}
                        </td>
                        <td className="px-5 py-4 text-muted">
                          <div className="grid gap-1 text-xs">
                            <span>Depreciacao: {toMoney(row.depreciationCostPerHour)}</span>
                            <span>Manutencao: {toMoney(row.maintenanceCostPerHour)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              title="Editar"
                              aria-label="Editar"
                              onClick={() => openModal(row)}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Excluir"
                              aria-label="Excluir"
                              onClick={() => void deleteRow(row)}
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
          title={modal.mode === "edit" ? "Editar item do catalogo" : "Novo item do catalogo"}
          onClose={() => setModal(null)}
        >
          <form className="grid min-w-0 gap-4" onSubmit={handleSubmit}>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <TextField
                label="Marca"
                value={form.brand}
                onChange={(value) => setForm((current) => ({ ...current, brand: value }))}
              />
              <TextField
                label="Modelo"
                value={form.name}
                onChange={(value) => setForm((current) => ({ ...current, name: value }))}
              />
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <label className="grid min-w-0 gap-2 text-sm font-medium">
                Tipo
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      type: event.target.value as CatalogFormState["type"],
                    }))
                  }
                  className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
                >
                  <option value="FDM">FDM</option>
                  <option value="RESIN">Resina</option>
                </select>
              </label>
              <TextField
                label="Preco (R$)"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(value) => setForm((current) => ({ ...current, price: value }))}
              />
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-3">
              <TextField
                label="Volume X (mm)"
                type="number"
                step="0.1"
                value={form.printVolumeXmm}
                onChange={(value) =>
                  setForm((current) => ({ ...current, printVolumeXmm: value }))
                }
              />
              <TextField
                label="Volume Y (mm)"
                type="number"
                step="0.1"
                value={form.printVolumeYmm}
                onChange={(value) =>
                  setForm((current) => ({ ...current, printVolumeYmm: value }))
                }
              />
              <TextField
                label="Volume Z (mm)"
                type="number"
                step="0.1"
                value={form.printVolumeZmm}
                onChange={(value) =>
                  setForm((current) => ({ ...current, printVolumeZmm: value }))
                }
              />
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-3">
              <TextField
                label="Consumo (W)"
                type="number"
                step="1"
                value={form.powerConsumptionWatts}
                onChange={(value) =>
                  setForm((current) => ({ ...current, powerConsumptionWatts: value }))
                }
              />
              <TextField
                label="Depreciacao (R$/h)"
                type="number"
                step="0.01"
                value={form.depreciationCostPerHour}
                onChange={(value) =>
                  setForm((current) => ({ ...current, depreciationCostPerHour: value }))
                }
              />
              <TextField
                label="Manutencao (R$/h)"
                type="number"
                step="0.01"
                value={form.maintenanceCostPerHour}
                onChange={(value) =>
                  setForm((current) => ({ ...current, maintenanceCostPerHour: value }))
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
