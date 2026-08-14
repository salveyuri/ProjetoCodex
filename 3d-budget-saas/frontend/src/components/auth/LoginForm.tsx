"use client";

import { Cpu, Loader2, LogIn } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApiErrorMessage } from "@/lib/api-error";

export const LoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ email, password });
      const nextPath = searchParams.get("next");
      const targetRoute =
        nextPath?.startsWith("/dashboard") === true
          ? (nextPath as Route)
          : "/dashboard";
      router.replace(targetRoute);
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, "Nao foi possivel autenticar."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md p-6">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Cpu className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">3D Budget</h1>
          <p className="text-sm text-muted">PrintOps Console</p>
        </div>
      </div>

      <div className="mt-6">
        <StatusBadge tone="neutral">acesso restrito</StatusBadge>
        <h2 className="mt-4 text-2xl font-semibold">Entrar</h2>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-medium text-foreground">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-11 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition placeholder:text-muted focus:border-primary"
            placeholder="voce@empresa.com"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          Senha
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            className="h-11 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition placeholder:text-muted focus:border-primary"
            placeholder="Sua senha"
          />
        </label>

        {error ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          Entrar
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Nao tem conta?{" "}
        <Link className="font-semibold text-primary hover:underline" href="/register">
          Cadastre-se
        </Link>
      </p>
    </Card>
  );
};
