"use client";

import type { SupportedLanguage } from "@3d-budget/shared";
import { currencyForLanguage, localeForLanguage } from "@3d-budget/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { setErrorMessageLanguage } from "@/lib/api-error";
import { dictionaries, type TranslationKey } from "@/lib/i18n";

const LANGUAGE_KEY = "app_language";

const isSupportedLanguage = (value: string | null): value is SupportedLanguage =>
  value === "pt-BR" || value === "en" || value === "es";

// Used before the user is authenticated (register page) and as the
// fallback default at signup — the browser's own language is the best
// guess for which language a new visitor actually reads.
const detectBrowserLanguage = (): SupportedLanguage => {
  if (typeof navigator === "undefined") {
    return "pt-BR";
  }

  const browserLanguage = navigator.language.toLowerCase();

  if (browserLanguage.startsWith("en")) {
    return "en";
  }

  if (browserLanguage.startsWith("es")) {
    return "es";
  }

  return "pt-BR";
};

const readInitialLanguage = (): SupportedLanguage => {
  if (typeof window === "undefined") {
    return "pt-BR";
  }

  const stored = window.localStorage.getItem(LANGUAGE_KEY);
  return isSupportedLanguage(stored) ? stored : detectBrowserLanguage();
};

interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  formatMoney: (value: number) => string;
  formatDate: (value: Date | string) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<SupportedLanguage>(readInitialLanguage);

  const setLanguage = useCallback((next: SupportedLanguage) => {
    setLanguageState(next);
    window.localStorage.setItem(LANGUAGE_KEY, next);
    setErrorMessageLanguage(next);
  }, []);

  // Keeps the non-React api-error module in sync too, including on the
  // very first render (setLanguage above only runs on later changes).
  useEffect(() => {
    setErrorMessageLanguage(language);
  }, [language]);

  // The authenticated user's saved preference is the source of truth once
  // it's known (login, silent refresh on reload) — overrides whatever
  // guess/cache was showing beforehand.
  useEffect(() => {
    if (user?.language) {
      setLanguage(user.language);
    }
  }, [user?.language, setLanguage]);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const text = dictionaries[language][key] ?? dictionaries["pt-BR"][key] ?? key;

      if (!vars) {
        return text;
      }

      return Object.entries(vars).reduce(
        (result, [varName, varValue]) =>
          result.replace(new RegExp(`\\{${varName}\\}`, "g"), String(varValue)),
        text,
      );
    },
    [language],
  );

  const formatMoney = useCallback(
    (value: number): string =>
      new Intl.NumberFormat(localeForLanguage(language), {
        style: "currency",
        currency: currencyForLanguage(language),
      }).format(value),
    [language],
  );

  const formatDate = useCallback(
    (value: Date | string): string => {
      const date = typeof value === "string" ? new Date(value) : value;

      return new Intl.DateTimeFormat(localeForLanguage(language), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date);
    },
    [language],
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions): string =>
      new Intl.NumberFormat(localeForLanguage(language), options).format(value),
    [language],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, t, formatMoney, formatDate, formatNumber }),
    [language, setLanguage, t, formatMoney, formatDate, formatNumber],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextValue => {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider.");
  }

  return context;
};
