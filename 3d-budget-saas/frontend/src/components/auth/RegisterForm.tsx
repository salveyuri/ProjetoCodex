"use client";

import type { SupportedLanguage } from "@3d-budget/shared";
import { Loader2, UserPlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
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
  const { language, setLanguage, t } = useLanguage();
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
      setError(t("auth.register.errorRequired"));
      return;
    }

    if (!isStrongEnoughPassword(password)) {
      setError(t("auth.register.errorWeakPassword"));
      return;
    }

    if (password !== passwordConfirmation) {
      setError(t("auth.register.errorPasswordMismatch"));
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
        language,
      });
      router.replace("/dashboard");
    } catch (registerError) {
      setError(getApiErrorMessage(registerError, t("auth.register.errorGeneric")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-lg p-6">
      <div className="flex justify-center">
        <Image src="/logo_full.webp" alt="Pricify3D" width={180} height={60} priority />
      </div>

      <div className="mt-6">
        <StatusBadge tone="success">{t("auth.register.badge")}</StatusBadge>
        <h2 className="mt-4 text-2xl font-semibold">{t("auth.register.heading")}</h2>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-medium text-foreground">
          {t("auth.register.fullName")}
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
          {t("auth.register.email")}
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
          {t("auth.register.companyName")}
          <input
            type="text"
            autoComplete="organization"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            required
            className="h-11 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition placeholder:text-muted focus:border-primary"
            placeholder="Empresa"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-foreground">
          {t("auth.register.language")}
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
            className="h-11 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition focus:border-primary"
          >
            <option value="pt-BR">{t("common.portuguese")}</option>
            <option value="en">{t("common.english")}</option>
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-foreground">
            {t("auth.register.password")}
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
            {t("auth.register.confirmPassword")}
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
          {t("auth.register.submit")}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {t("auth.register.haveAccount")}{" "}
        <Link className="font-semibold text-primary hover:underline" href="/login">
          {t("auth.register.loginLink")}
        </Link>
      </p>
    </Card>
  );
};

