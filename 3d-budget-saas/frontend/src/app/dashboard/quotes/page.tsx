"use client";

import type {
  PaginatedQuoteList,
  QuoteListItem,
  QuoteStatus,
} from "@3d-budget/shared";
import {
  Download,
  Edit3,
  FileText,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createToastId,
  ToastViewport,
  type ToastMessage,
} from "@/components/ui/toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { QuotePdfPreviewModal } from "@/components/quotes/QuotePdfPreviewModal";
import {
  quoteStatusLabelKeys,
  quoteStatusOptions,
  quoteStatusTones,
} from "@/components/quotes/quote-ui";

export default function QuotesPage() {
  const { isLoading: isAuthLoading, token } = useAuth();
  const { t, formatMoney, formatDate } = useLanguage();
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [status, setStatus] = useState<QuoteStatus | "ALL">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [pdfPreviewQuote, setPdfPreviewQuote] = useState<{
    id: string;
    customerName: string;
  } | null>(null);

  const showToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = createToastId();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  const filteredQuotes = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return quotes.filter((quote) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        quote.customerName.toLowerCase().includes(normalizedSearch);

      return matchesSearch;
    });
  }, [quotes, searchTerm]);

  const totalAmount = useMemo(
    () =>
      filteredQuotes.reduce((total, quote) => total + quote.totalAmount, 0),
    [filteredQuotes],
  );

  const loadQuotes = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<PaginatedQuoteList>("/quotes", {
        params: {
          page: 1,
          pageSize: 50,
          ...(status !== "ALL" ? { status } : {}),
        },
      });
      setQuotes(response.data.data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, t("quotes.list.errorLoad")));
    } finally {
      setIsLoading(false);
    }
  }, [status, t, token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void loadQuotes();
    }
  }, [isAuthLoading, loadQuotes]);

  useEffect(() => {
    const storedToast = window.sessionStorage.getItem("quoteToast");

    if (!storedToast) {
      return;
    }

    window.sessionStorage.removeItem("quoteToast");

    try {
      const toast = JSON.parse(storedToast) as Omit<ToastMessage, "id">;
      showToast(toast);
    } catch {
      showToast({
        tone: "success",
        title: t("quotes.list.toastSavedTitle"),
        message: t("quotes.list.toastGenericMsg"),
      });
    }
  }, [showToast, t]);

  const handleDelete = async (quoteId: string) => {
    if (!window.confirm(t("quotes.list.confirmDelete"))) {
      return;
    }

    setIsDeleting(quoteId);

    try {
      await api.delete(`/quotes/${quoteId}`);
      setQuotes((current) => current.filter((quote) => quote.id !== quoteId));
      showToast({
        tone: "success",
        title: t("quotes.list.toastDeletedTitle"),
        message: t("quotes.list.toastGenericMsg"),
      });
    } catch (error) {
      const message = getApiErrorMessage(error, t("quotes.list.errorDelete"));
      setErrorMessage(message);
      showToast({ tone: "danger", title: t("quotes.list.toastDeleteErrorTitle"), message });
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">{t("quotes.list.badge")}</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              {t("quotes.list.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">{t("quotes.list.subtitle")}</p>
          </div>
          <Link
            href="/dashboard/quotes/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t("quotes.list.newQuote")}
          </Link>
        </section>

        {errorMessage ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm text-muted">{t("quotes.list.filteredCount")}</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">
              {filteredQuotes.length}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted">{t("quotes.list.totalValue")}</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">
              {formatMoney(totalAmount)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted">{t("quotes.list.approved")}</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">
              {filteredQuotes.filter((quote) => quote.status === "APPROVED").length}
            </p>
          </Card>
        </section>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-muted md:w-96">
              <Search className="h-4 w-4" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t("quotes.list.searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as QuoteStatus | "ALL")
                }
                className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary"
              >
                <option value="ALL">{t("quotes.list.allStatuses")}</option>
                {quoteStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(quoteStatusLabelKeys[option])}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadQuotes()}
                className="grid h-11 w-11 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
                title={t("quotes.list.reload")}
                aria-label={t("quotes.list.reload")}
              >
                <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead className="bg-background text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t("quotes.list.colClient")}</th>
                  <th className="px-4 py-3 font-semibold">{t("quotes.list.colItem")}</th>
                  <th className="px-4 py-3 font-semibold">{t("quotes.list.colDate")}</th>
                  <th className="px-4 py-3 font-semibold">{t("quotes.list.colValue")}</th>
                  <th className="px-4 py-3 font-semibold">{t("quotes.list.colStatus")}</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    {t("quotes.list.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index} className="bg-surface/50">
                        <td className="px-4 py-4">
                          <SkeletonText className="mb-2 w-40" />
                          <SkeletonText className="w-28" />
                        </td>
                        <td className="px-4 py-4">
                          <SkeletonText className="mb-2 w-52" />
                          <SkeletonText className="w-36" />
                        </td>
                        <td className="px-4 py-4">
                          <SkeletonText className="w-24" />
                        </td>
                        <td className="px-4 py-4">
                          <SkeletonText className="w-20" />
                        </td>
                        <td className="px-4 py-4">
                          <SkeletonText className="w-24" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <SkeletonText className="h-10 w-10 rounded-lg" />
                            <SkeletonText className="h-10 w-10 rounded-lg" />
                            <SkeletonText className="h-10 w-10 rounded-lg" />
                          </div>
                        </td>
                      </tr>
                    ))
                  : filteredQuotes.map((quote) => (
                  <tr key={quote.id} className="bg-surface/50">
                    <td className="px-4 py-4">
                      <p className="font-medium text-foreground">
                        {quote.customerName}
                      </p>
                      <p className="text-sm text-muted">
                        {t("quotes.list.validUntilPrefix")} {formatDate(quote.validUntil)}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted">
                      {quote.firstItem ? (
                        <>
                          <span className="block font-medium text-foreground">
                            {quote.firstItem.modelName}
                          </span>
                          {quote.firstItem.machineName} /{" "}
                          {quote.firstItem.materialName}
                          <span className="mt-1 block text-xs text-muted">
                            {quote.itemsCount} {t("quotes.list.tablesSuffix")} /{" "}
                            {quote.totalWeightGrams.toFixed(2)} g /{" "}
                            {quote.totalPrintHours.toFixed(2)} h
                          </span>
                        </>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-muted">
                      {formatDate(quote.createdAt)}
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-foreground">
                      {formatMoney(quote.totalAmount)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={quoteStatusTones[quote.status]}>
                        {t(quoteStatusLabelKeys[quote.status])}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPdfPreviewQuote({ id: quote.id, customerName: quote.customerName })
                          }
                          className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
                          title={t("quotes.list.generatePdf")}
                          aria-label={t("quotes.list.generatePdf")}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/dashboard/quotes/${quote.id}`}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
                          title={t("quotes.list.edit")}
                          aria-label={t("quotes.list.edit")}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDelete(quote.id)}
                          disabled={isDeleting === quote.id}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                          title={t("quotes.list.delete")}
                          aria-label={t("quotes.list.delete")}
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

          {!isLoading && filteredQuotes.length === 0 ? (
            <div className="p-6">
              <EmptyState
                actionHref="/dashboard/quotes/new"
                actionLabel={t("quotes.list.newQuote")}
                description={
                  searchTerm || status !== "ALL"
                    ? t("quotes.list.emptyDescFiltered")
                    : t("quotes.list.emptyDescDefault")
                }
                icon={FileText}
                title={t("quotes.list.emptyTitle")}
              />
            </div>
          ) : null}
        </Card>
      </div>
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }
      />
      {pdfPreviewQuote ? (
        <QuotePdfPreviewModal
          quoteId={pdfPreviewQuote.id}
          customerName={pdfPreviewQuote.customerName}
          onClose={() => setPdfPreviewQuote(null)}
        />
      ) : null}
    </MainLayout>
  );
}
