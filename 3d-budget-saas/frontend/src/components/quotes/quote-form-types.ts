import type { QuoteAdjustmentType, QuoteStatus } from "@3d-budget/shared";

// "" means no adjustment selected — kept as a string (not QuoteAdjustmentType
// | null) so it binds directly to a <select>'s value.
export type QuoteAdjustmentFormValue = QuoteAdjustmentType | "";

export interface PrintTableFormState {
  localId: string;
  modelName: string;
  machineId: string;
  materialId: string;
  weightGrams: string;
  printTimeHours: string;
}

export interface QuoteFormState {
  customerName: string;
  validUntil: string;
  status: QuoteStatus;
  formulaId: string;
  paintingHours: string;
  finishingHours: string;
  cardPayment: boolean;
  adjustmentType: QuoteAdjustmentFormValue;
  adjustmentPercent: string;
  tables: PrintTableFormState[];
}
