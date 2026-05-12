import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ToastMessage {
  id: string;
  message: string;
  title?: string;
  tone: "success" | "danger" | "neutral";
}

interface ToastViewportProps {
  onDismiss: (id: string) => void;
  toasts: ToastMessage[];
}

const toneClasses: Record<ToastMessage["tone"], string> = {
  success: "border-secondary/40 bg-secondary/10 text-secondary",
  danger: "border-danger/40 bg-danger/10 text-danger",
  neutral: "border-border bg-surface text-foreground",
};

const toneIcons = {
  success: CheckCircle2,
  danger: AlertTriangle,
  neutral: Info,
};

export const createToastId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
};

export const ToastViewport = ({ onDismiss, toasts }: ToastViewportProps) => (
  <div className="fixed bottom-4 right-4 z-50 grid w-[min(360px,calc(100vw-2rem))] gap-2">
    {toasts.map((toast) => {
      const Icon = toneIcons[toast.tone];

      return (
        <div
          key={toast.id}
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-panel backdrop-blur",
            toneClasses[toast.tone],
          )}
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            {toast.title ? (
              <p className="text-sm font-semibold">{toast.title}</p>
            ) : null}
            <p className={cn("text-sm", toast.title && "mt-0.5")}>
              {toast.message}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar notificacao"
            title="Fechar notificacao"
            onClick={() => onDismiss(toast.id)}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-current/20 opacity-80 transition hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    })}
  </div>
);
