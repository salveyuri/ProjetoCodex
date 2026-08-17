"use client";

import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";

const isStrongEnoughPassword = (password: string): boolean =>
  password.length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /[0-9]/.test(password);

export const ResetPasswordForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError(t("auth.reset.errorMissingToken"));
      return;
    }

    if (!isStrongEnoughPassword(password)) {
      setError(t("auth.reset.errorWeakPassword"));
      return;
    }

    if (password !== passwordConfirmation) {
      setError(t("auth.reset.errorPasswordMismatch"));
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post("/auth/reset-password", { token, password });
      setIsDone(true);
      window.setTimeout(() => router.replace("/login"), 2500);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, t("auth.reset.errorGeneric")));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isDone) {
    return (
      <Card className="w-full max-w-md p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-secondary/40 bg-secondary/10 text-secondary">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-foreground">
          {t("auth.reset.doneHeading")}
        </h2>
        <p className="mt-2 text-sm text-muted">{t("auth.reset.doneBody")}</p>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md p-6">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {t("auth.reset.heading")}
          </h2>
          <p className="text-sm text-muted">{t("auth.reset.subheading")}</p>
        </div>
      </div>

      {!token ? (
        <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {t("auth.reset.invalidLink")}{" "}
          <Link href="/forgot-password" className="font-semibold hover:underline">
            {t("auth.reset.forgotLink")}
          </Link>
          .
        </div>
      ) : (
        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            {t("auth.reset.newPassword")}
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="h-11 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition placeholder:text-muted focus:border-primary"
              placeholder="Nova senha"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            {t("auth.reset.confirmPassword")}
            <input
              type="password"
              autoComplete="new-password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
              minLength={8}
              className="h-11 rounded-lg border border-border bg-surface-muted px-3 text-sm outline-none transition placeholder:text-muted focus:border-primary"
              placeholder="Repita a nova senha"
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
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("auth.reset.submit")}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        <Link className="font-semibold text-primary hover:underline" href="/login">
          {t("auth.reset.backToLogin")}
        </Link>
      </p>
    </Card>
  );
};
