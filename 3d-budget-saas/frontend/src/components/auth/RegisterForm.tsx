"use client";

import { Cpu, Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApiErrorMessage } from "@/lib/api-error";

const isStrongEnoughPassword = (password: string): boolean =>
  password.length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /[0-9]/.test(password);

export const RegisterForm = () => {
  const router = useRouter();
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !companyName.trim() || !password) {
      setError("Preencha todos os campos obrigatorios.");
      return;
    }

    if (!isStrongEnoughPassword(password)) {
      setError("A senha precisa ter 8 caracteres, letra maiuscula, minuscula e numero.");
      return;
    }

    if (password !== passwordConfirmation) {
      setError("As senhas nao coincidem.");
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        fullName,
        email,
        companyName,
        password,
        defaultCurrency: "BRL",
        taxRate: 0,
      });
      router.replace("/dashboard");
    } catch (registerError) {
      setError(getApiErrorMessage(registerError, "Nao foi possivel criar a conta."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-lg p-6">
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
        <StatusBadge tone="success">nova conta</StatusBadge>
        <h2 className="mt-4 text-2xl font-semibold">Criar cadastro</h2>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-medium text-foreground">
          Nome completo
          <input
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            className="h-11 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition placeholder:text-muted focus:border-primary"
            placeholder="Ada Lovelace"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          E-mail
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
          Nome da empresa
          <input
            type="text"
            autoComplete="organization"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            required
            className="h-11 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition placeholder:text-muted focus:border-primary"
            placeholder="Artesanerd"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Senha
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="h-11 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition placeholder:text-muted focus:border-primary"
              placeholder="Senha forte"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            Confirmar senha
            <input
              type="password"
              autoComplete="new-password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
              minLength={8}
              className="h-11 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition placeholder:text-muted focus:border-primary"
              placeholder="Repita a senha"
            />
          </label>
        </div>

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
            <UserPlus className="h-4 w-4" />
          )}
          Criar conta
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Ja possui conta?{" "}
        <Link className="font-semibold text-primary hover:underline" href="/login">
          Entre aqui
        </Link>
      </p>
    </Card>
  );
};

