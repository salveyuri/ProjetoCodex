import type { QuoteStatus } from "@3d-budget/shared";

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
  tables: PrintTableFormState[];
}
