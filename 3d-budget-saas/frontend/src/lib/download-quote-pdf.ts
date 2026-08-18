import axios, { type AxiosResponse } from "axios";
import { api } from "./api";

interface DownloadQuotePdfParams {
  quoteId: string;
  customerName?: string;
}

const sanitizeFilenamePart = (value: string): string => {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return normalized.slice(0, 48) || "Cliente";
};

const fallbackFilename = ({ quoteId, customerName }: DownloadQuotePdfParams) =>
  `Orcamento_${quoteId.slice(0, 8)}_${sanitizeFilenamePart(
    customerName ?? "Cliente",
  )}.pdf`;

const getFilenameFromHeader = (header?: string): string | null => {
  if (!header) {
    return null;
  }

  const filenameStar = /filename\*=UTF-8''([^;]+)/i.exec(header);

  if (filenameStar) {
    return decodeURIComponent(filenameStar[1]);
  }

  const filename = /filename="?([^";]+)"?/i.exec(header);
  return filename?.[1] ?? null;
};

const readErrorPayload = async (data: unknown): Promise<string | null> => {
  if (!data) {
    return null;
  }

  if (data instanceof Blob) {
    return data.text();
  }

  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  return null;
};

const toDownloadError = async (error: unknown): Promise<Error> => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error
      ? error
      : new Error("Nao foi possivel gerar o PDF.");
  }

  const status = error.response?.status;
  const payload = await readErrorPayload(error.response?.data);

  if (payload) {
    try {
      const parsed = JSON.parse(payload) as { message?: unknown };

      if (typeof parsed.message === "string") {
        return new Error(parsed.message);
      }
    } catch {
      if (payload.includes("Cannot GET") || payload.includes("<!DOCTYPE")) {
        return new Error(
          "A rota de PDF ainda nao esta carregada no backend. Reinicie a API na porta 3001 e tente novamente.",
        );
      }
    }
  }

  if (status === 401) {
    return new Error("Sessao expirada. Entre novamente para gerar o PDF.");
  }

  if (status === 404) {
    return new Error(
      "A rota de PDF nao foi encontrada. Reinicie o backend para carregar /api/quotes/:id/pdf.",
    );
  }

  return new Error("Nao foi possivel gerar o PDF no backend.");
};

export interface QuotePdfFile {
  blob: Blob;
  filename: string;
}

// Just the network call + blob/filename resolution, no side effects — used
// both by downloadQuotePdf (below) and by the in-app preview modal, which
// needs the same file without triggering a save-to-disk prompt.
export const fetchQuotePdf = async (
  params: DownloadQuotePdfParams,
): Promise<QuotePdfFile> => {
  let response: AxiosResponse<Blob>;

  try {
    response = await api.get<Blob>(`/quotes/${params.quoteId}/pdf`, {
      responseType: "blob",
      timeout: 20000,
    });
  } catch (error) {
    throw await toDownloadError(error);
  }

  const contentDisposition = response.headers["content-disposition"];
  const filename =
    getFilenameFromHeader(
      typeof contentDisposition === "string" ? contentDisposition : undefined,
    ) ?? fallbackFilename(params);
  const blob =
    response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: "application/pdf" });

  return { blob, filename };
};

export const triggerBlobDownload = (file: QuotePdfFile): void => {
  const url = window.URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

export const downloadQuotePdf = async (
  params: DownloadQuotePdfParams,
): Promise<void> => {
  const file = await fetchQuotePdf(params);
  triggerBlobDownload(file);
};
