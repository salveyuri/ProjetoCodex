"use client";

import type {
  MachineCatalogResource,
  MachinePayload,
  MachineResource,
  MaterialPayload,
  MaterialResource,
  ProductionSettings,
} from "@3d-budget/shared";
import {
  Cpu,
  Edit3,
  Layers3,
  Plus,
  Save,
  Settings2,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";

type ActiveTab = "machines" | "materials" | "costs";

type ModalState =
  | { type: "machine"; mode: "create"; item?: undefined }
  | { type: "machine"; mode: "edit"; item: MachineResource }
  | { type: "material"; mode: "create"; item?: undefined }
  | { type: "material"; mode: "edit"; item: MaterialResource }
  | null;

interface MachineFormState {
  name: string;
  type: "FDM" | "RESIN";
  powerConsumptionWatts: string;
  price: string;
  printVolumeXmm: string;
  printVolumeYmm: string;
  printVolumeZmm: string;
}

// Mesmas formulas do backend (machine.service.ts) — so pra prever
// depreciacao/manutencao na tela antes de salvar. A autoridade de verdade
// continua sendo o backend, que recalcula do zero ao salvar.
const calculateMachineHourlyCosts = (
  price: number,
  type: "FDM" | "RESIN",
): { depreciationCostPerHour: number; maintenanceCostPerHour: number } => {
  if (type === "FDM") {
    return {
      depreciationCostPerHour: (price * 0.9) / 10000,
      maintenanceCostPerHour: (price * 0.3) / 2000,
    };
  }

  return {
    depreciationCostPerHour: (price * 0.9) / 6000,
    maintenanceCostPerHour: (price * 0.35) / 1500,
  };
};

interface MaterialFormState {
  brand: string;
  type: "FILAMENT" | "RESIN" | "OTHER";
  color: string;
  totalWeightGrams: string;
  purchasePrice: string;
}

interface ToastState {
  tone: "success" | "danger";
  message: string;
}

const emptyMachineForm: MachineFormState = {
  name: "",
  type: "FDM",
  powerConsumptionWatts: "120",
  price: "3000",
  printVolumeXmm: "220",
  printVolumeYmm: "220",
  printVolumeZmm: "250",
};

const emptyMaterialForm: MaterialFormState = {
  brand: "",
  type: "FILAMENT",
  color: "",
  totalWeightGrams: "1000",
  purchasePrice: "80",
};

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

const normalizeSettings = (
  settings: Partial<ProductionSettings> | null | undefined,
): ProductionSettings => ({
  ...defaultSettings,
  ...settings,
  customVariables: settings?.customVariables ?? {},
});

const tabs = [
  { id: "machines" as const, label: "Impressoras", icon: Cpu },
  { id: "materials" as const, label: "Materiais", icon: Layers3 },
  { id: "costs" as const, label: "Custos Fixos", icon: Zap },
];

const toMoney = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const toMachineForm = (machine: MachineResource): MachineFormState => ({
  name: machine.name,
  type: machine.type,
  powerConsumptionWatts: String(machine.powerConsumptionWatts),
  price: String(machine.price),
  printVolumeXmm: String(machine.printVolumeXmm),
  printVolumeYmm: String(machine.printVolumeYmm),
  printVolumeZmm: String(machine.printVolumeZmm),
});

const toCatalogForm = (item: MachineCatalogResource): MachineFormState => ({
  name: `${item.brand} ${item.name}`,
  type: item.type,
  powerConsumptionWatts: String(item.powerConsumptionWatts),
  price: String(item.price),
  printVolumeXmm: String(item.printVolumeXmm),
  printVolumeYmm: String(item.printVolumeYmm),
  printVolumeZmm: String(item.printVolumeZmm),
});

const toMaterialForm = (material: MaterialResource): MaterialFormState => ({
  brand: material.brand,
  type: material.type,
  color: material.color,
  totalWeightGrams: String(material.totalWeightGrams),
  purchasePrice: String(material.purchasePrice),
});

export default function SettingsPage() {
  const { isLoading: isAuthLoading, token } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("machines");
  const [machines, setMachines] = useState<MachineResource[]>([]);
  const [materials, setMaterials] = useState<MaterialResource[]>([]);
  const [settings, setSettings] = useState<ProductionSettings>(defaultSettings);
  const [modal, setModal] = useState<ModalState>(null);
  const [machineForm, setMachineForm] =
    useState<MachineFormState>(emptyMachineForm);
  const [materialForm, setMaterialForm] =
    useState<MaterialFormState>(emptyMaterialForm);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const showToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const loadResources = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);

    try {
      const [machinesResponse, materialsResponse, settingsResponse] =
        await Promise.all([
          api.get<MachineResource[]>("/machines"),
          api.get<MaterialResource[]>("/materials"),
          api.get<ProductionSettings>("/settings"),
        ]);

      setMachines(machinesResponse.data);
      setMaterials(materialsResponse.data);
      setSettings(normalizeSettings(settingsResponse.data));
    } catch (error) {
      showToast({ tone: "danger", message: getApiErrorMessage(error, "Nao foi possivel concluir a operacao.") });
    } finally {
      setIsLoading(false);
    }
  }, [showToast, token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void loadResources();
    }
  }, [isAuthLoading, loadResources]);

  const materialInventoryValue = useMemo(
    () =>
      materials.reduce(
        (total, material) => total + material.purchasePrice,
        0,
      ),
    [materials],
  );

  const openMachineModal = (machine?: MachineResource) => {
    setMachineForm(machine ? toMachineForm(machine) : emptyMachineForm);
    setModal(
      machine
        ? { type: "machine", mode: "edit", item: machine }
        : { type: "machine", mode: "create" },
    );
  };

  const openMaterialModal = (material?: MaterialResource) => {
    setMaterialForm(material ? toMaterialForm(material) : emptyMaterialForm);
    setModal(
      material
        ? { type: "material", mode: "edit", item: material }
        : { type: "material", mode: "create" },
    );
  };

  const handleMachineSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    const payload: MachinePayload = {
      name: machineForm.name,
      type: machineForm.type,
      powerConsumptionWatts: Number(machineForm.powerConsumptionWatts),
      price: Number(machineForm.price),
      printVolumeXmm: Number(machineForm.printVolumeXmm),
      printVolumeYmm: Number(machineForm.printVolumeYmm),
      printVolumeZmm: Number(machineForm.printVolumeZmm),
    };

    try {
      if (modal?.type === "machine" && modal.mode === "edit") {
        const { data } = await api.put<MachineResource>(
          `/machines/${modal.item.id}`,
          payload,
        );
        setMachines((current) =>
          current.map((machine) => (machine.id === data.id ? data : machine)),
        );
      } else {
        const { data } = await api.post<MachineResource>("/machines", payload);
        setMachines((current) => [data, ...current]);
      }

      setModal(null);
      showToast({ tone: "success", message: "Maquina salva." });
    } catch (error) {
      showToast({ tone: "danger", message: getApiErrorMessage(error, "Nao foi possivel concluir a operacao.") });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMaterialSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    const payload: MaterialPayload = {
      brand: materialForm.brand,
      type: materialForm.type,
      color: materialForm.color,
      totalWeightGrams: Number(materialForm.totalWeightGrams),
      purchasePrice: Number(materialForm.purchasePrice),
    };

    try {
      if (modal?.type === "material" && modal.mode === "edit") {
        const { data } = await api.put<MaterialResource>(
          `/materials/${modal.item.id}`,
          payload,
        );
        setMaterials((current) =>
          current.map((material) => (material.id === data.id ? data : material)),
        );
      } else {
        const { data } = await api.post<MaterialResource>("/materials", payload);
        setMaterials((current) => [data, ...current]);
      }

      setModal(null);
      showToast({ tone: "success", message: "Material salvo." });
    } catch (error) {
      showToast({ tone: "danger", message: getApiErrorMessage(error, "Nao foi possivel concluir a operacao.") });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteMachine = async (machine: MachineResource) => {
    const confirmed = window.confirm(`Excluir ${machine.name}?`);

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/machines/${machine.id}`);
      setMachines((current) => current.filter((item) => item.id !== machine.id));
      showToast({ tone: "success", message: "Maquina excluida." });
    } catch (error) {
      showToast({ tone: "danger", message: getApiErrorMessage(error, "Nao foi possivel concluir a operacao.") });
    }
  };

  const deleteMaterial = async (material: MaterialResource) => {
    const confirmed = window.confirm(`Excluir ${material.brand} ${material.color}?`);

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/materials/${material.id}`);
      setMaterials((current) => current.filter((item) => item.id !== material.id));
      showToast({ tone: "success", message: "Material excluido." });
    } catch (error) {
      showToast({ tone: "danger", message: getApiErrorMessage(error, "Nao foi possivel concluir a operacao.") });
    }
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      const { data } = await api.put<ProductionSettings>("/settings", settings);
      setSettings(normalizeSettings(data));
      showToast({ tone: "success", message: "Custos fixos salvos." });
    } catch (error) {
      showToast({ tone: "danger", message: getApiErrorMessage(error, "Nao foi possivel concluir a operacao.") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 sm:flex-row sm:items-end">
          <div>
            <StatusBadge tone="neutral">configuracoes</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Configuracoes de producao
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Gerencie maquinas, materiais e custos base usados pelo motor de calculo.
            </p>
          </div>
          <div className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-background px-4">
            <Settings2 className="h-6 w-6 text-primary" />
            <div>
              <p className="text-sm text-muted">Escopo</p>
              <p className="text-sm font-medium text-foreground">Empresa autenticada</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="min-h-32 p-5">
            <p className="text-sm text-muted">Impressoras</p>
            <p className="mt-3 text-3xl font-semibold">{machines.length}</p>
          </Card>
          <Card className="min-h-32 p-5">
            <p className="text-sm text-muted">Materiais</p>
            <p className="mt-3 text-3xl font-semibold">{materials.length}</p>
          </Card>
          <Card className="min-h-32 p-5">
            <p className="text-sm text-muted">Estoque cadastrado</p>
            <p className="mt-3 text-3xl font-semibold">
              {toMoney(materialInventoryValue)}
            </p>
          </Card>
        </section>

        <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted transition",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-surface-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <Card className="min-h-96 animate-pulse p-5" />
        ) : null}

        {!isLoading && activeTab === "machines" ? (
          <ResourcePanel
            title="Impressoras"
            actionLabel="Nova Maquina"
            onAction={() => openMachineModal()}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Valor</th>
                    <th className="px-3 py-2 font-medium">Consumo</th>
                    <th className="px-3 py-2 font-medium">Depreciacao/h</th>
                    <th className="px-3 py-2 font-medium">Manutencao/h</th>
                    <th className="px-3 py-2 font-medium">Volume</th>
                    <th className="px-3 py-2 font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((machine) => (
                    <tr key={machine.id} className="bg-surface-muted">
                      <td className="rounded-l-lg px-3 py-3 font-medium">
                        {machine.name}
                      </td>
                      <td className="px-3 py-3">
                        {machine.type === "FDM" ? "FDM" : "SLA/Resina"}
                      </td>
                      <td className="px-3 py-3">{toMoney(machine.price)}</td>
                      <td className="px-3 py-3">
                        {machine.powerConsumptionWatts} W
                      </td>
                      <td className="px-3 py-3">
                        {toMoney(machine.depreciationCostPerHour)}
                      </td>
                      <td className="px-3 py-3">
                        {toMoney(machine.maintenanceCostPerHour)}
                      </td>
                      <td className="px-3 py-3">
                        {machine.printVolumeXmm} x {machine.printVolumeYmm} x{" "}
                        {machine.printVolumeZmm} mm
                      </td>
                      <td className="rounded-r-lg px-3 py-3">
                        <RowActions
                          onEdit={() => openMachineModal(machine)}
                          onDelete={() => void deleteMachine(machine)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {machines.length === 0 ? (
                <EmptyState message="Nenhuma maquina cadastrada." />
              ) : null}
            </div>
          </ResourcePanel>
        ) : null}

        {!isLoading && activeTab === "materials" ? (
          <ResourcePanel
            title="Materiais"
            actionLabel="Novo Material"
            onAction={() => openMaterialModal()}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Nome/Marca</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Cor</th>
                    <th className="px-3 py-2 font-medium">Peso/Volume</th>
                    <th className="px-3 py-2 font-medium">Compra</th>
                    <th className="px-3 py-2 font-medium">Custo/un.</th>
                    <th className="px-3 py-2 font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((material) => (
                    <tr key={material.id} className="bg-surface-muted">
                      <td className="rounded-l-lg px-3 py-3 font-medium">
                        {material.brand}
                      </td>
                      <td className="px-3 py-3">{material.type}</td>
                      <td className="px-3 py-3">{material.color}</td>
                      <td className="px-3 py-3">
                        {material.totalWeightGrams} g/ml
                      </td>
                      <td className="px-3 py-3">
                        {toMoney(material.purchasePrice)}
                      </td>
                      <td className="px-3 py-3">
                        {toMoney(material.costPerGram)} por g/ml
                      </td>
                      <td className="rounded-r-lg px-3 py-3">
                        <RowActions
                          onEdit={() => openMaterialModal(material)}
                          onDelete={() => void deleteMaterial(material)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {materials.length === 0 ? (
                <EmptyState message="Nenhum material cadastrado." />
              ) : null}
            </div>
          </ResourcePanel>
        ) : null}

        {!isLoading && activeTab === "costs" ? (
          <ResourcePanel title="Custos Fixos">
            <form className="grid gap-4 md:grid-cols-2" onSubmit={saveSettings}>
              <NumberField
                label="Lucro desejado (%)"
                value={settings.desiredMarginPercent}
                onChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    desiredMarginPercent: value,
                  }))
                }
              />
              <NumberField
                label="Hora tecnica (R$)"
                value={settings.technicalHourRate}
                onChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    technicalHourRate: value,
                  }))
                }
              />
              <NumberField
                label="Hora pintura (R$)"
                value={settings.paintingHourRate}
                onChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    paintingHourRate: value,
                  }))
                }
              />
              <NumberField
                label="Hora acabamento (R$)"
                value={settings.finishingHourRate}
                onChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    finishingHourRate: value,
                  }))
                }
              />
              <NumberField
                label="Energia kWh (R$)"
                value={settings.energyCostPerKwh}
                onChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    energyCostPerKwh: value,
                  }))
                }
              />
              <NumberField
                label="Taxas cartao (%)"
                value={settings.cardFeePercent}
                onChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    cardFeePercent: value,
                  }))
                }
              />
              <NumberField
                label="Taxa de erro"
                value={settings.errorRate}
                onChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    errorRate: value,
                  }))
                }
              />
              <NumberField
                label="Taxas administrativas (%)"
                value={settings.administrativeFeePercent}
                onChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    administrativeFeePercent: value,
                  }))
                }
              />

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
                >
                  <Save className="h-4 w-4" />
                  Salvar custos
                </button>
              </div>
            </form>
          </ResourcePanel>
        ) : null}
      </div>

      {modal?.type === "machine" ? (
        <Modal
          title={modal.mode === "edit" ? "Editar Maquina" : "Nova Maquina"}
          onClose={() => setModal(null)}
        >
          <form className="grid min-w-0 gap-4" onSubmit={handleMachineSubmit}>
            <MachineNameAutocomplete
              value={machineForm.name}
              onChange={(value) =>
                setMachineForm((current) => ({ ...current, name: value }))
              }
              onSelect={(item) => setMachineForm(toCatalogForm(item))}
            />
            <label className="grid min-w-0 gap-2 text-sm font-medium">
              Tipo
              <select
                value={machineForm.type}
                onChange={(event) =>
                  setMachineForm((current) => ({
                    ...current,
                    type: event.target.value as MachineFormState["type"],
                  }))
                }
                className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
              >
                <option value="FDM">FDM</option>
                <option value="RESIN">SLA/Resina</option>
              </select>
            </label>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <TextField
                label="Consumo (Watts)"
                type="number"
                value={machineForm.powerConsumptionWatts}
                onChange={(value) =>
                  setMachineForm((current) => ({
                    ...current,
                    powerConsumptionWatts: value,
                  }))
                }
              />
              <TextField
                label="Valor (R$)"
                type="number"
                step="0.01"
                value={machineForm.price}
                onChange={(value) =>
                  setMachineForm((current) => ({
                    ...current,
                    price: value,
                  }))
                }
              />
            </div>
            <p className="-mt-2 text-xs text-muted">
              {(() => {
                const preview = calculateMachineHourlyCosts(
                  Number(machineForm.price) || 0,
                  machineForm.type,
                );
                return (
                  <>
                    Depreciacao: {toMoney(preview.depreciationCostPerHour)}/h
                    {" · "}
                    Manutencao: {toMoney(preview.maintenanceCostPerHour)}/h
                  </>
                );
              })()}
            </p>
            <div className="grid min-w-0 gap-4 md:grid-cols-3">
              <TextField
                label="Volume X"
                type="number"
                value={machineForm.printVolumeXmm}
                onChange={(value) =>
                  setMachineForm((current) => ({
                    ...current,
                    printVolumeXmm: value,
                  }))
                }
              />
              <TextField
                label="Volume Y"
                type="number"
                value={machineForm.printVolumeYmm}
                onChange={(value) =>
                  setMachineForm((current) => ({
                    ...current,
                    printVolumeYmm: value,
                  }))
                }
              />
              <TextField
                label="Volume Z"
                type="number"
                value={machineForm.printVolumeZmm}
                onChange={(value) =>
                  setMachineForm((current) => ({
                    ...current,
                    printVolumeZmm: value,
                  }))
                }
              />
            </div>
            <SubmitButton isSaving={isSaving} />
          </form>
        </Modal>
      ) : null}

      {modal?.type === "material" ? (
        <Modal
          title={modal.mode === "edit" ? "Editar Material" : "Novo Material"}
          onClose={() => setModal(null)}
        >
          <form className="grid min-w-0 gap-4" onSubmit={handleMaterialSubmit}>
            <TextField
              label="Nome/Marca"
              value={materialForm.brand}
              onChange={(value) =>
                setMaterialForm((current) => ({ ...current, brand: value }))
              }
            />
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <label className="grid min-w-0 gap-2 text-sm font-medium">
                Tipo
                <select
                  value={materialForm.type}
                  onChange={(event) =>
                    setMaterialForm((current) => ({
                      ...current,
                      type: event.target.value as MaterialFormState["type"],
                    }))
                  }
                  className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
                >
                  <option value="FILAMENT">Filamento</option>
                  <option value="RESIN">Resina</option>
                  <option value="OTHER">Outro</option>
                </select>
              </label>
              <TextField
                label="Cor"
                value={materialForm.color}
                onChange={(value) =>
                  setMaterialForm((current) => ({ ...current, color: value }))
                }
              />
            </div>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <TextField
                label="Peso/Volume"
                type="number"
                value={materialForm.totalWeightGrams}
                onChange={(value) =>
                  setMaterialForm((current) => ({
                    ...current,
                    totalWeightGrams: value,
                  }))
                }
              />
              <TextField
                label="Preco compra"
                type="number"
                step="0.01"
                value={materialForm.purchasePrice}
                onChange={(value) =>
                  setMaterialForm((current) => ({
                    ...current,
                    purchasePrice: value,
                  }))
                }
              />
            </div>
            <StatusBadge tone="neutral">
              Custo calculado:{" "}
              {toMoney(
                Number(materialForm.purchasePrice || 0) /
                  Math.max(Number(materialForm.totalWeightGrams || 0), 1),
              )}{" "}
              por g/ml
            </StatusBadge>
            <SubmitButton isSaving={isSaving} />
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

interface ResourcePanelProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}

const ResourcePanel = ({
  title,
  actionLabel,
  onAction,
  children,
}: ResourcePanelProps) => (
  <Card className="min-h-96 p-5">
    <div className="mb-5 flex items-center justify-between gap-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </button>
      ) : null}
    </div>
    {children}
  </Card>
);

const RowActions = ({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      title="Editar"
      aria-label="Editar"
      onClick={onEdit}
      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
    >
      <Edit3 className="h-4 w-4" />
    </button>
    <button
      type="button"
      title="Excluir"
      aria-label="Excluir"
      onClick={onDelete}
      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-danger hover:text-danger"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  </div>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-border text-sm text-muted">
    {message}
  </div>
);

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

const MACHINE_CATALOG_MIN_QUERY_LENGTH = 2;
const MACHINE_CATALOG_DEBOUNCE_MS = 250;

// Autocomplete do nome da maquina contra o catalogo de referencia
// (backend/prisma machine_catalog). Ao clicar numa sugestao, preenche o
// resto do formulario — mas tudo continua editavel depois, sem nenhum
// impedimento pro usuario ajustar o que quiser antes de salvar.
const MachineNameAutocomplete = ({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: MachineCatalogResource) => void;
}) => {
  const [suggestions, setSuggestions] = useState<MachineCatalogResource[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const query = value.trim();

    if (query.length < MACHINE_CATALOG_MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void api
        .get<MachineCatalogResource[]>("/machine-catalog", {
          params: { q: query },
        })
        .then(({ data }) => setSuggestions(data))
        .catch(() => setSuggestions([]));
    }, MACHINE_CATALOG_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  return (
    <label className="relative grid min-w-0 gap-2 text-sm font-medium">
      Nome
      <input
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
        required
        autoComplete="off"
        placeholder="Ex.: Bambu Lab P1S"
        className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
      />
      {isOpen && suggestions.length > 0 ? (
        <ul className="absolute left-0 top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-background shadow-panel">
          {suggestions.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(item);
                  setIsOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-foreground">
                    {item.brand} {item.name}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    {item.type === "FDM" ? "FDM" : "SLA/Resina"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {toMoney(item.price)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  );
};

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

const NumberField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) => {
  const safeValue = Number.isFinite(value) ? value : 0;

  return (
    <label className="grid min-w-0 gap-2 text-sm font-medium">
      {label}
      <input
        type="number"
        step="0.01"
        min="0"
        value={safeValue}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          onChange(Number.isFinite(nextValue) ? nextValue : 0);
        }}
        required
        className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
      />
    </label>
  );
};

const SubmitButton = ({ isSaving }: { isSaving: boolean }) => (
  <button
    type="submit"
    disabled={isSaving}
    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
  >
    <Save className="h-4 w-4" />
    Salvar
  </button>
);
