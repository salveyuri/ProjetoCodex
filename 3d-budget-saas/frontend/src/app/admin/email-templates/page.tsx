"use client";

import type {
  EmailLogResource,
  EmailSendStatus,
  EmailTemplateResource,
  EmailTemplateTestResult,
  EmailTemplateUpdatePayload,
  EmailTemplateVariable,
  PaginatedEmailLogList,
} from "@3d-budget/shared";
import axios from "axios";
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  ListChecks,
  Loader2,
  Mail,
  RefreshCcw,
  Save,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";

interface EmailTemplateFormState {
  name: string;
  subject: string;
  bodyHtml: string;
  isActive: boolean;
}

interface ToastState {
  tone: "success" | "danger";
  message: string;
}

const toForm = (template: EmailTemplateResource): EmailTemplateFormState => ({
  name: template.name,
  subject: template.subject,
  bodyHtml: template.bodyHtml,
  isActive: template.isActive,
});

const toPayload = (form: EmailTemplateFormState): EmailTemplateUpdatePayload => ({
  name: form.name.trim(),
  subject: form.subject.trim(),
  bodyHtml: form.bodyHtml,
  isActive: form.isActive,
});

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Mirrors EmailService's substitution rule on the backend (escape every
// variable except pre-rendered "...Html" fragments) so the preview matches
// what a real send would produce. Uses each variable's sampleValue since
// there's no real user/company/payment to pull data from here — logoUrl
// specifically resolves against this app's own origin, where the real logo
// file (frontend/public/logo_full.webp) actually lives.
const buildPreviewHtml = (
  bodyHtml: string,
  variables: EmailTemplateVariable[],
): string => {
  const sampleValues: Record<string, string> = {};

  for (const variable of variables) {
    sampleValues[variable.name] =
      variable.name === "logoUrl"
        ? `${window.location.origin}${variable.sampleValue}`
        : variable.sampleValue;
  }

  return bodyHtml.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in sampleValues)) {
      return "";
    }

    const value = sampleValues[key];
    return key.endsWith("Html") ? value : escapeHtml(value);
  });
};

const emailLogStatusLabels: Record<EmailSendStatus, string> = {
  SENT: "Enviado",
  FAILED: "Falhou",
  SKIPPED_INACTIVE: "Pulado (inativo)",
  SKIPPED_PREFERENCE: "Pulado (preferencia)",
};

const emailLogStatusTones: Record<
  EmailSendStatus,
  "success" | "warning" | "danger" | "neutral"
> = {
  SENT: "success",
  FAILED: "danger",
  SKIPPED_INACTIVE: "neutral",
  SKIPPED_PREFERENCE: "neutral",
};

export default function AdminEmailTemplatesPage() {
  const { isLoading: isAuthLoading, token, refreshUser } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplateResource[]>([]);
  const [selected, setSelected] = useState<EmailTemplateResource | null>(null);
  const [form, setForm] = useState<EmailTemplateFormState | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [testTarget, setTestTarget] = useState<EmailTemplateResource | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<EmailLogResource[]>([]);
  const [logsPagination, setLogsPagination] = useState<
    PaginatedEmailLogList["pagination"] | null
  >(null);
  const [logsPage, setLogsPage] = useState(1);
  const [logsStatusFilter, setLogsStatusFilter] = useState<EmailSendStatus | "">("");
  const [isLogsLoading, setIsLogsLoading] = useState(true);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const showToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const loadTemplates = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsAccessDenied(false);

    try {
      const { data } = await api.get<EmailTemplateResource[]>("/admin/email-templates");
      setTemplates(data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setIsAccessDenied(true);
      } else {
        showToast({
          tone: "danger",
          message: getApiErrorMessage(error, "Nao foi possivel carregar os templates."),
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

        await loadTemplates();
      })();
    }
  }, [isAuthLoading, loadTemplates, refreshUser, token]);

  const loadLogs = useCallback(async () => {
    if (!token) {
      setIsLogsLoading(false);
      return;
    }

    setIsLogsLoading(true);

    try {
      const { data } = await api.get<PaginatedEmailLogList>("/admin/email-logs", {
        params: {
          page: logsPage,
          pageSize: 20,
          status: logsStatusFilter || undefined,
        },
      });
      setLogs(data.data);
      setLogsPagination(data.pagination);
    } catch (error) {
      // 403 is already surfaced by the templates card above (isAccessDenied)
      // - avoid a second, redundant "access denied" toast for the same page.
      if (!(axios.isAxiosError(error) && error.response?.status === 403)) {
        showToast({
          tone: "danger",
          message: getApiErrorMessage(error, "Nao foi possivel carregar os logs de e-mail."),
        });
      }
    } finally {
      setIsLogsLoading(false);
    }
  }, [logsPage, logsStatusFilter, showToast, token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void loadLogs();
    }
  }, [isAuthLoading, loadLogs]);

  const openModal = (template: EmailTemplateResource) => {
    setSelected(template);
    setForm(toForm(template));
  };

  const closeModal = () => {
    setSelected(null);
    setForm(null);
  };

  const openPreview = (bodyHtml: string, variables: EmailTemplateVariable[]) => {
    setPreviewHtml(buildPreviewHtml(bodyHtml, variables));
  };

  const openTestModal = (template: EmailTemplateResource) => {
    setTestTarget(template);
    setTestEmail("");
  };

  const closeTestModal = () => {
    setTestTarget(null);
    setTestEmail("");
  };

  const handleSendTest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!testTarget) {
      return;
    }

    setIsSendingTest(true);

    try {
      const { data } = await api.post<EmailTemplateTestResult>(
        `/admin/email-templates/${testTarget.id}/test`,
        { to: testEmail },
      );

      if (data.status === "SENT") {
        showToast({
          tone: "success",
          message: `E-mail de teste enviado para ${testEmail}.`,
        });
        closeTestModal();
      } else {
        showToast({
          tone: "danger",
          message: data.error
            ? `Falha ao enviar: ${data.error}`
            : "Nao foi possivel enviar o e-mail de teste.",
        });
      }
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(error, "Nao foi possivel enviar o e-mail de teste."),
      });
    } finally {
      void loadLogs();
      setIsSendingTest(false);
    }
  };

  const insertVariable = (name: string) => {
    const tag = `{{${name}}}`;
    const textarea = bodyRef.current;

    if (!textarea) {
      setForm((current) =>
        current ? { ...current, bodyHtml: `${current.bodyHtml}${tag}` } : current,
      );
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    setForm((current) =>
      current
        ? {
            ...current,
            bodyHtml: `${current.bodyHtml.slice(0, start)}${tag}${current.bodyHtml.slice(end)}`,
          }
        : current,
    );

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = start + tag.length;
      textarea.selectionEnd = start + tag.length;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selected || !form) {
      return;
    }

    setIsSaving(true);

    try {
      const { data } = await api.patch<EmailTemplateResource>(
        `/admin/email-templates/${selected.id}`,
        toPayload(form),
      );
      setTemplates((current) =>
        current.map((template) => (template.id === data.id ? data : template)),
      );
      closeModal();
      showToast({ tone: "success", message: "Template salvo." });
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(error, "Nao foi possivel salvar o template."),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">Admin</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Templates de e-mail
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Edite assunto e HTML dos e-mails automaticos enviados pelo sistema.
              Desativar um template pausa o envio sem precisar mexer em codigo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadTemplates()}
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
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border p-5">
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Templates cadastrados
                </h2>
                <p className="text-sm text-muted">{templates.length} templates.</p>
              </div>
            </div>

            {isLoading ? (
              <div className="grid gap-3 p-5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-3"
                  >
                    <SkeletonText className="w-44" />
                    <SkeletonText className="w-64" />
                    <SkeletonText className="w-24" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-background text-xs uppercase text-muted">
                    <tr>
                      <th className="px-5 py-3">Template</th>
                      <th className="px-5 py-3">Assunto</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {templates.map((template) => (
                      <tr key={template.id} className="bg-surface/40">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{template.name}</p>
                            <span className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                              {template.language === "en" ? "EN" : "PT"}
                            </span>
                          </div>
                          <p className="text-xs text-muted">{template.key}</p>
                        </td>
                        <td className="max-w-xs truncate px-5 py-4 text-muted">
                          {template.subject}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge tone={template.isActive ? "success" : "danger"}>
                            {template.isActive ? "Ativo" : "Inativo"}
                          </StatusBadge>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              title="Visualizar"
                              aria-label="Visualizar"
                              onClick={() =>
                                openPreview(template.bodyHtml, template.availableVariables)
                              }
                              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Editar"
                              aria-label="Editar"
                              onClick={() => openModal(template)}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Testar e-mail"
                              aria-label="Testar e-mail"
                              onClick={() => openTestModal(template)}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
                            >
                              <Send className="h-4 w-4" />
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

        {!isAccessDenied ? (
          <Card className="overflow-hidden">
            <div className="flex flex-col justify-between gap-3 border-b border-border p-5 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <ListChecks className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Logs de envio
                  </h2>
                  <p className="text-sm text-muted">
                    {logsPagination ? `${logsPagination.total} registros.` : "Carregando..."}{" "}
                    Todo envio (real ou de teste) grava uma linha aqui.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={logsStatusFilter}
                  onChange={(event) => {
                    setLogsStatusFilter(event.target.value as EmailSendStatus | "");
                    setLogsPage(1);
                  }}
                  className="h-10 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none focus:border-primary"
                >
                  <option value="">Todos os status</option>
                  {(Object.keys(emailLogStatusLabels) as EmailSendStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {emailLogStatusLabels[status]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void loadLogs()}
                  disabled={!token}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Atualizar
                </button>
              </div>
            </div>

            {isLogsLoading ? (
              <div className="grid gap-3 p-5">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-4"
                  >
                    <SkeletonText className="w-32" />
                    <SkeletonText className="w-40" />
                    <SkeletonText className="w-48" />
                    <SkeletonText className="w-20" />
                  </div>
                ))}
              </div>
            ) : logs.length === 0 ? (
              <p className="p-5 text-sm text-muted">Nenhum e-mail registrado ainda.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border bg-background text-xs uppercase text-muted">
                      <tr>
                        <th className="px-5 py-3">Data</th>
                        <th className="px-5 py-3">Template</th>
                        <th className="px-5 py-3">Para</th>
                        <th className="px-5 py-3">Assunto</th>
                        <th className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {logs.map((log) => (
                        <tr key={log.id} className="bg-surface/40 align-top">
                          <td className="whitespace-nowrap px-5 py-4 text-muted">
                            {new Date(log.createdAt).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-foreground">
                            {log.templateKey}
                          </td>
                          <td className="px-5 py-4 text-foreground">{log.toEmail}</td>
                          <td className="max-w-xs truncate px-5 py-4 text-muted">
                            {log.subject}
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge tone={emailLogStatusTones[log.status]}>
                              {emailLogStatusLabels[log.status]}
                            </StatusBadge>
                            {log.errorMessage ? (
                              <p className="mt-1 max-w-xs text-xs text-danger">
                                {log.errorMessage}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {logsPagination && logsPagination.totalPages > 1 ? (
                  <div className="flex items-center justify-between gap-4 border-t border-border p-4 text-sm text-muted">
                    <span>
                      Pagina {logsPagination.page} de {logsPagination.totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setLogsPage((page) => Math.max(1, page - 1))}
                        disabled={logsPagination.page <= 1}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setLogsPage((page) =>
                            Math.min(logsPagination.totalPages, page + 1),
                          )
                        }
                        disabled={logsPagination.page >= logsPagination.totalPages}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </Card>
        ) : null}
      </div>

      {selected && form ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-panel sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Editar template: {selected.name}</h2>
              <button
                type="button"
                title="Fechar"
                aria-label="Fechar"
                onClick={closeModal}
                className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="grid min-w-0 gap-4" onSubmit={handleSubmit}>
              <div className="grid min-w-0 gap-4 sm:grid-cols-[1fr_140px]">
                <label className="grid min-w-0 gap-2 text-sm font-medium">
                  Nome
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                    required
                    className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
                  />
                </label>
                <label className="flex min-h-11 items-center gap-3 self-end rounded-lg border border-border bg-surface-muted px-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, isActive: event.target.checked } : current,
                      )
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  Ativo
                </label>
              </div>

              <label className="grid min-w-0 gap-2 text-sm font-medium">
                Assunto
                <input
                  value={form.subject}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, subject: event.target.value } : current,
                    )
                  }
                  required
                  className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
                />
              </label>

              <div className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Variaveis disponiveis</span>
                <div className="flex flex-wrap gap-2">
                  {selected.availableVariables.map((variable) => (
                    <button
                      key={variable.name}
                      type="button"
                      title={variable.description}
                      onClick={() => insertVariable(variable.name)}
                      className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-xs font-semibold text-primary transition hover:border-primary/60"
                    >
                      {`{{${variable.name}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <label className="grid min-w-0 gap-2 text-sm font-medium">
                Corpo HTML
                <textarea
                  ref={bodyRef}
                  value={form.bodyHtml}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, bodyHtml: event.target.value } : current,
                    )
                  }
                  required
                  rows={16}
                  className={cn(
                    "w-full min-w-0 resize-y rounded-lg border border-border bg-surface-muted px-3 py-3 font-mono text-xs outline-none transition focus:border-primary",
                  )}
                />
              </label>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => openPreview(form.bodyHtml, selected.availableVariables)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20"
                >
                  <Eye className="h-4 w-4" />
                  Visualizar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
                >
                  <Save className="h-4 w-4" />
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {previewHtml !== null ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/70 px-4 py-6"
          onClick={() => setPreviewHtml(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h2 className="text-lg font-semibold">Pre-visualizacao</h2>
                <p className="text-xs text-muted">
                  Renderizado com valores de exemplo - nada e enviado de verdade.
                </p>
              </div>
              <button
                type="button"
                title="Fechar"
                aria-label="Fechar"
                onClick={() => setPreviewHtml(null)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe
              title="Pre-visualizacao do e-mail"
              srcDoc={previewHtml}
              sandbox=""
              className="h-[70vh] w-full bg-white"
            />
          </div>
        </div>
      ) : null}

      {testTarget ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/70 px-4 py-6"
          onClick={closeTestModal}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Testar e-mail</h2>
                <p className="text-xs text-muted">{testTarget.name}</p>
              </div>
              <button
                type="button"
                title="Fechar"
                aria-label="Fechar"
                onClick={closeTestModal}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="grid min-w-0 gap-4" onSubmit={handleSendTest}>
              <label className="grid min-w-0 gap-2 text-sm font-medium">
                Enviar para
                <input
                  type="email"
                  value={testEmail}
                  onChange={(event) => setTestEmail(event.target.value)}
                  required
                  autoFocus
                  placeholder="voce@empresa.com"
                  className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
                />
              </label>
              <p className="text-xs text-muted">
                Envia de verdade pelo mesmo mecanismo do sistema (Resend), com
                valores de exemplo no lugar das variaveis.
              </p>
              <button
                type="submit"
                disabled={isSendingTest}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSendingTest ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar teste
              </button>
            </form>
          </div>
        </div>
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
