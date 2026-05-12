"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 text-center shadow-panel">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-danger/40 bg-danger/10 text-danger">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Algo saiu do trilho</h1>
        <p className="mt-2 text-sm text-muted">
          A interface encontrou um erro inesperado. O backend registra falhas de
          API em auditoria tecnica para investigacao.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <RefreshCcw className="h-4 w-4" />
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
