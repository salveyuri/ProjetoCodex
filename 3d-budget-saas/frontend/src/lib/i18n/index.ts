import type { SupportedLanguage } from "@3d-budget/shared";
import { en } from "./en";
import { es } from "./es";
import { pt, type TranslationKey } from "./pt";

export type { TranslationKey };

export const dictionaries: Record<SupportedLanguage, Record<TranslationKey, string>> = {
  "pt-BR": pt,
  en,
  es,
};
