import type { QuoteStatus } from "@3d-budget/shared";

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviado",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
};

export const quoteStatusTones: Record<
  QuoteStatus,
  "neutral" | "warning" | "success" | "danger"
> = {
  DRAFT: "neutral",
  SENT: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

export const quoteStatusOptions: QuoteStatus[] = [
  "DRAFT",
  "SENT",
  "APPROVED",
  "REJECTED",
];

export const toMoney = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export const toDateInputValue = (value: string | Date): string => {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
};

export const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
