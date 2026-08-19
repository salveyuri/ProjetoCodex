import "dotenv/config";

const parsePort = (value: string | undefined): number => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 3001;
  }

  return parsed;
};

const parseRefreshTokenExpiresInDays = (value: string | undefined): number => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 30;
  }

  return parsed;
};

// Number of reverse-proxy hops Express should trust when reading
// X-Forwarded-For (used by express-rate-limit to key limits per real client
// IP). Defaults to 0 — i.e. Express's own default of not trusting any
// proxy — which is correct today (no reverse proxy in front of the API).
// Once a reverse proxy (e.g. Nginx) is deployed in front of this API, set
// this to the number of proxy hops between the client and this process
// (usually 1) via TRUST_PROXY_HOPS, or rate limiting will silently key off
// the proxy's IP instead of the real client's.
const parseTrustProxyHops = (value: string | undefined): number => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
};

const resolveJwtSecret = (): string => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be defined in production.");
  }

  return "dev-only-change-me-3d-budget";
};

const resolveCorsOrigin = (): string => {
  const corsOrigin =
    process.env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000";
  const origins = corsOrigin.split(",").map((origin) => origin.trim());

  if (origins.includes("*")) {
    throw new Error(
      "CORS_ORIGIN must not include '*': the API always sends credentials: true, and browsers reject a wildcard origin combined with credentials. List explicit origins instead.",
    );
  }

  return corsOrigin;
};

// Public origin of the frontend, used to build the Asaas checkout callback
// URLs (successUrl/cancelUrl/expiredUrl) that redirect the customer back
// after the hosted checkout. Not the same as CORS_ORIGIN (which can list
// several allowed origins) — this is the single canonical URL a real human
// gets redirected to.
const resolveAppBaseUrl = (): string =>
  process.env.APP_BASE_URL ?? "http://localhost:3000";

const resolveAsaasEnv = (): "sandbox" | "production" =>
  process.env.ASAAS_ENV === "production" ? "production" : "sandbox";

const resolveAsaasBaseUrl = (asaasEnv: "sandbox" | "production"): string =>
  asaasEnv === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

const resolveAsaasApiKey = (): string => {
  if (process.env.ASAAS_API_KEY) {
    return process.env.ASAAS_API_KEY;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("ASAAS_API_KEY must be defined in production.");
  }

  return "";
};

// Shared secret we choose and register alongside the webhook URL in the
// Asaas dashboard/API; Asaas echoes it back on the `asaas-access-token`
// header of every webhook call so we can verify a request truly came from
// them (see backend/src/controllers/webhook.controller.ts).
const resolveAsaasWebhookToken = (): string => {
  if (process.env.ASAAS_WEBHOOK_TOKEN) {
    return process.env.ASAAS_WEBHOOK_TOKEN;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("ASAAS_WEBHOOK_TOKEN must be defined in production.");
  }

  return "";
};

// Resend (e-mails transacionais). Sem chave configurada, resend-client.ts
// loga e pula o envio em vez de travar a acao principal (cadastro, webhook,
// aprovacao de orcamento) - so obrigatorio em producao.
const resolveResendApiKey = (): string => {
  if (process.env.RESEND_API_KEY) {
    return process.env.RESEND_API_KEY;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("RESEND_API_KEY must be defined in production.");
  }

  return "";
};

const resolveEmailFromAddress = (): string =>
  process.env.EMAIL_FROM_ADDRESS ?? "Pricify3D <system@pricify3d.com>";

// Signing secret Resend generates when the webhook endpoint is created
// (see backend/scripts/register-resend-webhook.ts) — verified via the
// `svix` package against the svix-id/svix-timestamp/svix-signature headers
// on every call to POST /api/webhooks/resend. Unlike ASAAS_WEBHOOK_TOKEN,
// deliberately NOT required in production: this only feeds the optional
// "delivery status" column in /admin/email-templates, never the app's
// critical path, so the app must still boot and send email fine without
// it configured yet. If unset, the webhook route just acks without
// processing (see webhook.controller.ts).
const resolveResendWebhookSecret = (): string =>
  process.env.RESEND_WEBHOOK_SECRET ?? "";

const asaasEnv = resolveAsaasEnv();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePort(process.env.PORT),
  corsOrigin: resolveCorsOrigin(),
  jwtSecret: resolveJwtSecret(),
  // TTL of the short-lived access token. Session revocation/renewal is
  // handled by the refresh token (see refreshTokenExpiresInDays below), so
  // this can stay short without hurting UX.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "15m",
  refreshTokenExpiresInDays: parseRefreshTokenExpiresInDays(
    process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS,
  ),
  trustProxyHops: parseTrustProxyHops(process.env.TRUST_PROXY_HOPS),
  logLevel: process.env.LOG_LEVEL ?? "info",
  appBaseUrl: resolveAppBaseUrl(),
  asaasEnv,
  asaasBaseUrl: resolveAsaasBaseUrl(asaasEnv),
  asaasApiKey: resolveAsaasApiKey(),
  asaasWebhookToken: resolveAsaasWebhookToken(),
  resendApiKey: resolveResendApiKey(),
  emailFromAddress: resolveEmailFromAddress(),
  resendWebhookSecret: resolveResendWebhookSecret(),
};
