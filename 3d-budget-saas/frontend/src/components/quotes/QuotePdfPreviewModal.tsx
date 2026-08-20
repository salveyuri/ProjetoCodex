"use client";

import type { QuotePdfFormat } from "@3d-budget/shared";
import { AlertTriangle, Download, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import {
  fetchQuotePdf,
  triggerBlobDownload,
  type QuotePdfFile,
} from "@/lib/download-quote-pdf";

interface QuotePdfPreviewModalProps {
  quoteId: string;
  customerName?: string;
  onClose: () => void;
}

export const QuotePdfPreviewModal = ({
  quoteId,
  customerName,
  onClose,
}: QuotePdfPreviewModalProps) => {
  const { t } = useLanguage();
  const [format, setFormat] = useState<QuotePdfFormat>("FULL");
  const [file, setFile] = useState<QuotePdfFile | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    fetchQuotePdf({ quoteId, customerName, format })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setFile(result);
        // The cleanup effect below (keyed on objectUrl) revokes the
        // previous blob URL automatically whenever this changes - including
        // on every format switch, not just on unmount.
        setObjectUrl(URL.createObjectURL(result.blob));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(getApiErrorMessage(error, t("quotes.pdfPreview.error")));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [quoteId, customerName, format, reloadToken, t]);

  // Runs on every objectUrl change, not just unmount - React tears down the
  // previous effect instance (and its captured objectUrl) before setting up
  // the new one, so this revokes the old blob URL each time a new PDF is
  // fetched (format switch or retry), not only when the modal closes.
  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <div>
            <h2 className="text-lg font-semibold">{t("quotes.pdfPreview.title")}</h2>
            <p className="text-xs text-muted">{t("quotes.pdfPreview.subtitle")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {file ? (
              <button
                type="button"
                onClick={() => triggerBlobDownload(file)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <Download className="h-4 w-4" />
                {t("quotes.pdfPreview.download")}
              </button>
            ) : null}
            <button
              type="button"
              title={t("quotes.pdfPreview.close")}
              aria-label={t("quotes.pdfPreview.close")}
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="text-xs font-medium text-muted">
            {t("quotes.pdfPreview.formatLabel")}
          </span>
          <div className="inline-flex rounded-lg border border-border bg-surface-muted p-1">
            {(["FULL", "SUMMARY"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFormat(option)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  format === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                {option === "FULL"
                  ? t("quotes.pdfPreview.formatFull")
                  : t("quotes.pdfPreview.formatSummary")}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center bg-surface-muted">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-sm text-muted">
              <Loader2 className="h-6 w-6 animate-spin" />
              {t("quotes.pdfPreview.loading")}
            </div>
          ) : errorMessage ? (
            <div className="flex flex-col items-center gap-3 px-6 text-center text-sm text-danger">
              <AlertTriangle className="h-6 w-6" />
              {errorMessage}
              <button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
                className="inline-flex h-9 items-center rounded-lg border border-danger/40 px-3 text-xs font-semibold text-danger transition hover:bg-danger/10"
              >
                {t("quotes.pdfPreview.retry")}
              </button>
            </div>
          ) : objectUrl ? (
            <iframe title={t("quotes.pdfPreview.title")} src={objectUrl} className="h-full w-full" />
          ) : null}
        </div>
      </div>
    </div>
  );
};
