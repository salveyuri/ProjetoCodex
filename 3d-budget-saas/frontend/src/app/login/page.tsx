"use client";

import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LoginPage() {
  const { t } = useLanguage();

  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="relative hidden overflow-hidden lg:block">
        <Image
          src="/login.webp"
          alt={t("auth.login.heroAlt")}
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-r from-transparent to-background" />
      </div>

      <div className="grid place-items-center px-4 py-10">
        <Suspense
          fallback={<Card className="h-80 w-full max-w-md animate-pulse p-6" />}
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
