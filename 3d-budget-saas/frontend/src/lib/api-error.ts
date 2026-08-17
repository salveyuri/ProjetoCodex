import type { SupportedLanguage } from "@3d-budget/shared";
import axios from "axios";

/**
 * Curated allowlist of backend error codes safe to translate and show
 * verbatim to end users. Anything NOT listed here — including every
 * *_FORBIDDEN code, ADMIN_REQUIRED, and any unexpected 4xx/5xx — falls
 * back to a generic message instead of echoing the backend's raw
 * `message` field. That field is written for API debugging, not for end
 * users: it can spell out exactly which internal check rejected the
 * request (e.g. "requires ADMIN role"), which hands an attacker a map of
 * what to try forging instead of just "access denied". Keep this an
 * allowlist (not a blocklist) so any new backend error code defaults to
 * the safe generic message unless someone deliberately opts it in here.
 */
const KNOWN_ERROR_MESSAGES: Record<SupportedLanguage, Record<string, string>> = {
  "pt-BR": {
    INVALID_CREDENTIALS: "E-mail ou senha invalidos.",
    EMAIL_ALREADY_EXISTS: "E-mail ja cadastrado.",
    ACCOUNT_INACTIVE: "Conta desativada. Fale com o suporte.",
    VALIDATION_ERROR: "Confira os campos preenchidos e tente novamente.",
    PLAN_LIMIT_REACHED: "Limite do plano atual atingido.",
    PLAN_FEATURE_UNAVAILABLE: "Este recurso nao esta disponivel no plano atual.",
    SUBSCRIPTION_PAST_DUE:
      "Assinatura pendente. Regularize o pagamento para continuar.",
    RATE_LIMIT_GLOBAL: "Muitas requisicoes. Aguarde um instante e tente novamente.",
    RATE_LIMIT_LOGIN: "Muitas tentativas. Aguarde um minuto e tente novamente.",
    RATE_LIMIT_REGISTER: "Muitas tentativas. Aguarde um minuto e tente novamente.",
    RATE_LIMIT_REFRESH: "Muitas tentativas. Aguarde um minuto e tente novamente.",
    RATE_LIMIT_CALCULATION:
      "Muitas requisicoes. Aguarde um instante e tente novamente.",
    PLAN_NOT_FOUND: "Este plano nao esta mais disponivel.",
    PLAN_IN_USE:
      "Este plano esta em uso por empresas e nao pode ser excluido. Desative-o em vez disso.",
    PLAN_CODE_TAKEN: "Ja existe um plano com esse codigo.",
    ASAAS_API_ERROR:
      "O gateway de pagamento nao respondeu. Tente novamente em instantes.",
    PASSWORD_RESET_TOKEN_INVALID:
      "Este link de redefinicao de senha e invalido ou ja expirou. Peca um novo.",
    EMAIL_TEMPLATE_NOT_FOUND: "Este template de e-mail nao foi encontrado.",
    RATE_LIMIT_FORGOT_PASSWORD:
      "Muitas tentativas. Aguarde 15 minutos e tente novamente.",
    RATE_LIMIT_RESET_PASSWORD: "Muitas tentativas. Aguarde um minuto e tente novamente.",
    CURRENT_PASSWORD_INVALID: "Senha atual incorreta.",
    RATE_LIMIT_CHANGE_PASSWORD: "Muitas tentativas. Aguarde um minuto e tente novamente.",
    SYSTEM_FORMULA_NOT_FOUND: "Esta formula do sistema nao foi encontrada.",
    SYSTEM_FORMULA_DEFAULT_DELETE_BLOCKED:
      "A formula padrao nao pode ser excluida. Torne outra formula padrao primeiro.",
  },
  en: {
    INVALID_CREDENTIALS: "Invalid email or password.",
    EMAIL_ALREADY_EXISTS: "Email already registered.",
    ACCOUNT_INACTIVE: "Account deactivated. Contact support.",
    VALIDATION_ERROR: "Check the fields you filled in and try again.",
    PLAN_LIMIT_REACHED: "Current plan limit reached.",
    PLAN_FEATURE_UNAVAILABLE: "This feature isn't available on the current plan.",
    SUBSCRIPTION_PAST_DUE: "Subscription past due. Settle the payment to continue.",
    RATE_LIMIT_GLOBAL: "Too many requests. Wait a moment and try again.",
    RATE_LIMIT_LOGIN: "Too many attempts. Wait a minute and try again.",
    RATE_LIMIT_REGISTER: "Too many attempts. Wait a minute and try again.",
    RATE_LIMIT_REFRESH: "Too many attempts. Wait a minute and try again.",
    RATE_LIMIT_CALCULATION: "Too many requests. Wait a moment and try again.",
    PLAN_NOT_FOUND: "This plan is no longer available.",
    PLAN_IN_USE:
      "This plan is in use by companies and can't be deleted. Deactivate it instead.",
    PLAN_CODE_TAKEN: "A plan with this code already exists.",
    ASAAS_API_ERROR: "The payment gateway did not respond. Try again shortly.",
    PASSWORD_RESET_TOKEN_INVALID:
      "This password reset link is invalid or has expired. Request a new one.",
    EMAIL_TEMPLATE_NOT_FOUND: "This email template was not found.",
    RATE_LIMIT_FORGOT_PASSWORD: "Too many attempts. Wait 15 minutes and try again.",
    RATE_LIMIT_RESET_PASSWORD: "Too many attempts. Wait a minute and try again.",
    CURRENT_PASSWORD_INVALID: "Current password is incorrect.",
    RATE_LIMIT_CHANGE_PASSWORD: "Too many attempts. Wait a minute and try again.",
    SYSTEM_FORMULA_NOT_FOUND: "This system formula was not found.",
    SYSTEM_FORMULA_DEFAULT_DELETE_BLOCKED:
      "The default formula can't be deleted. Make another formula the default first.",
  },
};

const DEFAULT_FALLBACK: Record<SupportedLanguage, string> = {
  "pt-BR": "Nao foi possivel completar esta acao. Tente novamente em instantes.",
  en: "Could not complete this action. Try again shortly.",
};

// Mirrors the setApiAuthorization pattern in AuthContext.tsx — module-level
// state read outside React, kept in sync by LanguageContext whenever the
// viewer's language changes, so this plain (non-hook) helper function can
// stay callable from anywhere without threading `language` through every
// one of its ~30 call sites.
let currentLanguage: SupportedLanguage = "pt-BR";

export const setErrorMessageLanguage = (language: SupportedLanguage): void => {
  currentLanguage = language;
};

/**
 * Turns an API error into safe, user-facing copy in the viewer's current
 * language. Pass a page-specific `fallback` for the (common) case where
 * the error code isn't in the allowlist above — e.g. getApiErrorMessage(
 * error, t("admin.users.errorLoad")).
 */
export const getApiErrorMessage = (
  error: unknown,
  fallback: string = DEFAULT_FALLBACK[currentLanguage],
): string => {
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.code;

    if (typeof code === "string" && code in KNOWN_ERROR_MESSAGES[currentLanguage]) {
      return KNOWN_ERROR_MESSAGES[currentLanguage][code];
    }
  }

  return fallback;
};
