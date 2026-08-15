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
const KNOWN_ERROR_MESSAGES: Record<string, string> = {
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
};

const DEFAULT_FALLBACK =
  "Nao foi possivel completar esta acao. Tente novamente em instantes.";

/**
 * Turns an API error into safe, user-facing PT-BR copy. Pass a
 * page-specific `fallback` for the (common) case where the error code
 * isn't in the allowlist above — e.g. getApiErrorMessage(error, "Nao foi
 * possivel carregar usuarios.").
 */
export const getApiErrorMessage = (
  error: unknown,
  fallback: string = DEFAULT_FALLBACK,
): string => {
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.code;

    if (typeof code === "string" && code in KNOWN_ERROR_MESSAGES) {
      return KNOWN_ERROR_MESSAGES[code];
    }
  }

  return fallback;
};
