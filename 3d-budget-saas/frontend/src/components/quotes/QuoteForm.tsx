"use client";

import type { QuoteStatus } from "@3d-budget/shared";
import { AlertTriangle, ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ToastViewport } from "@/components/ui/toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { PostProcessingCard } from "./PostProcessingCard";
import { PrintItemCard } from "./PrintItemCard";
import { SelectField, TextField } from "./QuoteFormFields";
import { QuotePdfPreviewModal } from "./QuotePdfPreviewModal";
import { QuoteSummary } from "./QuoteSummary";
import { quoteStatusLabelKeys, quoteStatusOptions, quoteStatusTones } from "./quote-ui";
import { useQuoteForm } from "./useQuoteForm";

interface QuoteFormProps {
  quoteId?: string;
}

export const QuoteForm = ({ quoteId }: QuoteFormProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const canExportPdf = user?.company?.pdfExport ?? false;
  const {
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
    isPdfPreviewOpen,
    canSave,
    missingResources,
    aggregate,
    updateField,
    updateTable,
    addTable,
    removeTable,
    handleSubmit,
    openPdfPreview,
    closePdfPreview,
  } = useQuoteForm(quoteId);

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
              {t("quotes.backToList")}
            </Link>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              {quoteId ? t("quotes.editTitle") : t("quotes.newTitle")}
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">{t("quotes.subtitle")}</p>
          </div>
          <StatusBadge tone={quoteStatusTones[form.status]}>
            {t(quoteStatusLabelKeys[form.status])}
          </StatusBadge>
        </section>

        {errorMessage ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        {missingResources ? (
          <Card className="border-danger/50 bg-danger/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-danger/40 bg-danger/15 text-danger">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-danger">
                    {t("quotes.configureProductionTitle")}
                  </p>
                  <p className="mt-1 text-sm text-foreground/80">
                    {t("quotes.configureProductionBody")}
                  </p>
                </div>
              </div>
              <Link
                href="/dashboard/settings"
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition hover:bg-danger/90"
              >
                {t("quotes.openSettings")}
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
                  label={t("quotes.client")}
                  value={form.customerName}
                  onChange={(value) => updateField("customerName", value)}
                  required
                />
                <TextField
                  label={t("quotes.validUntil")}
                  type="date"
                  value={form.validUntil}
                  onChange={(value) => updateField("validUntil", value)}
                  required
                />
                <SelectField
                  label={t("quotes.status")}
                  value={form.status}
                  onChange={(value) =>
                    updateField("status", value as QuoteStatus)
                  }
                >
                  {quoteStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {t(quoteStatusLabelKeys[status])}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={t("quotes.formula")}
                  value={form.formulaId}
                  onChange={(value) => updateField("formulaId", value)}
                  disabled={isLoadingResources || formulas.length === 0}
                >
                  {formulas.length === 0 ? (
                    <option value="">{t("quotes.systemDefaultFormula")}</option>
                  ) : null}
                  {formulas.map((formula) => (
                    <option key={formula.id} value={formula.id}>
                      {formula.name}
                      {formula.isDefault ? t("quotes.defaultSuffix") : ""}
                    </option>
                  ))}
                </SelectField>
              </div>
            </Card>

            <section className="grid min-w-0 gap-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    {t("quotes.printTablesTitle")}
                  </h2>
                  <p className="text-sm text-muted">{t("quotes.printTablesSubtitle")}</p>
                </div>
                <button
                  type="button"
                  onClick={addTable}
                  disabled={missingResources}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary/10"
                >
                  <Plus className="h-4 w-4" />
                  {t("quotes.addTable")}
                </button>
              </div>

              {form.tables.map((table, index) => (
                <PrintItemCard
                  key={table.localId}
                  table={table}
                  index={index}
                  machines={machines}
                  materials={materials}
                  preview={itemPreviewByLocalId[table.localId] ?? null}
                  canRemove={form.tables.length > 1}
                  isLoadingResources={isLoadingResources}
                  missingResources={missingResources}
                  onChange={(patch) => updateTable(table.localId, patch)}
                  onRemove={() => removeTable(table.localId)}
                />
              ))}
            </section>

            <PostProcessingCard
              paintingHours={form.paintingHours}
              finishingHours={form.finishingHours}
              disabled={missingResources}
              onChangePaintingHours={(value) => updateField("paintingHours", value)}
              onChangeFinishingHours={(value) => updateField("finishingHours", value)}
            />
          </div>

          <QuoteSummary
            quoteId={quoteId}
            tablesCount={form.tables.length}
            aggregate={aggregate}
            isCalculating={isCalculating}
            savedQuote={savedQuote}
            isSaving={isSaving}
            canSave={canSave}
            canExportPdf={canExportPdf}
            onPreviewPdf={openPdfPreview}
            cardPayment={form.cardPayment}
            onChangeCardPayment={(value) => updateField("cardPayment", value)}
            adjustmentType={form.adjustmentType}
            onChangeAdjustmentType={(value) => updateField("adjustmentType", value)}
            adjustmentPercent={form.adjustmentPercent}
            onChangeAdjustmentPercent={(value) => updateField("adjustmentPercent", value)}
          />
        </form>
      </div>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      {isPdfPreviewOpen && savedQuote ? (
        <QuotePdfPreviewModal
          quoteId={savedQuote.id}
          customerName={savedQuote.customerName}
          onClose={closePdfPreview}
        />
      ) : null}
    </MainLayout>
  );
};
