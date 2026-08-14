"use client";

import type {
  CalculationResponse,
  MachineResource,
  MaterialResource,
} from "@3d-budget/shared";
import { Clock3, Scale, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { toMoney } from "./quote-ui";
import { NumberField, SelectField, TextField } from "./QuoteFormFields";
import type { PrintTableFormState } from "./quote-form-types";

interface PrintItemCardProps {
  table: PrintTableFormState;
  index: number;
  machines: MachineResource[];
  materials: MaterialResource[];
  preview: CalculationResponse | null;
  canRemove: boolean;
  isLoadingResources: boolean;
  missingResources: boolean;
  onChange: (patch: Partial<PrintTableFormState>) => void;
  onRemove: () => void;
}

export const PrintItemCard = ({
  table,
  index,
  machines,
  materials,
  preview,
  canRemove,
  isLoadingResources,
  missingResources,
  onChange,
  onRemove,
}: PrintItemCardProps) => {
  const fieldsDisabled = isLoadingResources || missingResources;

  return (
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
        disabled={fieldsDisabled}
      />
      <SelectField
        label="Maquina"
        value={table.machineId}
        onChange={(value) => onChange({ machineId: value })}
        disabled={fieldsDisabled || machines.length === 0}
      >
        <option value="">
          {machines.length === 0
            ? "Cadastre uma maquina primeiro"
            : "Selecione uma maquina..."}
        </option>
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
        disabled={fieldsDisabled || materials.length === 0}
      >
        <option value="">
          {materials.length === 0
            ? "Cadastre um material primeiro"
            : "Selecione um material..."}
        </option>
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
        disabled={fieldsDisabled}
      />
      <NumberField
        icon={Clock3}
        label="Tempo"
        suffix="h"
        value={table.printTimeHours}
        onChange={(value) => onChange({ printTimeHours: value })}
        disabled={fieldsDisabled}
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
};
