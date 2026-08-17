"use client";

import { CheckCircle2, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";

export const ForgotPasswordForm = () => {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await api.post("/auth/forgot-password", { email });
      // Backend always responds success regardless of whether the email
      // exists, on purpose — never reveal which accounts are registered.
      setIsSent(true);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, t("auth.forgot.errorGeneric")));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSent) {
    return (
      <Card className="w-full max-w-md p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-secondary/40 bg-secondary/10 text-secondary">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-foreground">
          {t("auth.forgot.sentHeading")}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {t("auth.forgot.sentBodyPrefix")} <strong>{email}</strong>
          {t("auth.forgot.sentBodySuffix")}
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          {t("auth.forgot.backToLogin")}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md p-6">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {t("auth.forgot.heading")}
          </h2>
          <p className="text-sm text-muted">{t("auth.forgot.subheading")}</p>
        </div>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-medium text-foreground">
          {t("auth.forgot.email")}
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
          {t("auth.forgot.submit")}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {t("auth.forgot.rememberedPassword")}{" "}
        <Link className="font-semibold text-primary hover:underline" href="/login">
          {t("auth.forgot.loginLink")}
        </Link>
      </p>
    </Card>
  );
};
