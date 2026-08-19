import { Resend } from "resend";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "../middlewares/error-handler";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  id: string | null;
  error: string | null;
}

export interface ResendWebhookConfig {
  id: string;
  endpoint: string;
  status: "enabled" | "disabled";
  events: string[];
}

// Only returned once, at creation time — Resend never echoes it back on
// list/get, matching how any other signing secret works. If it's lost, the
// only recovery is deleting and recreating the webhook (which changes the
// id and requires updating RESEND_WEBHOOK_SECRET again).
export interface ResendWebhookCreateResult extends ResendWebhookConfig {
  signingSecret: string;
}

interface ResendWebhookListResponse {
  data: ResendWebhookConfig[];
}

// Email is a best-effort side effect (account creation, billing events,
// quote summaries) — it must never throw and never block the action it
// rides along with. Every failure path here returns a result object
// instead of raising, and the full detail always gets logged server-side
// even though the caller only sees a short message (same "never leak the
// upstream body" convention as asaas-client.ts).
const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

// The `resend` npm SDK only covers sending — webhook management
// (list/create/update) isn't exposed by it, so this hits Resend's REST API
// directly with the built-in fetch. Only used by
// backend/scripts/register-resend-webhook.ts; the running app never
// lists/creates/updates webhooks at runtime. Mirrors asaas-client.ts's
// `request()` wrapper (same error-handling shape).
const RESEND_API_BASE_URL = "https://api.resend.com";

const request = async <T>(path: string, init: RequestInit): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${RESEND_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.resendApiKey}`,
        ...init.headers,
      },
    });
  } catch (error) {
    logger.error({ err: error, path }, "Failed to reach the Resend API");
    throw new AppError("Could not reach Resend.", 502, "RESEND_API_ERROR");
  }

  const rawBody = await response.text();
  const body = rawBody ? (JSON.parse(rawBody) as unknown) : null;

  if (!response.ok) {
    logger.error(
      { status: response.status, path, body },
      "Resend API rejected the request",
    );
    throw new AppError("Resend rejected the request.", 502, "RESEND_API_ERROR", {
      status: response.status,
    });
  }

  return body as T;
};

const toWebhookConfig = (raw: {
  id: string;
  endpoint: string;
  status: "enabled" | "disabled";
  events: string[];
}): ResendWebhookConfig => ({
  id: raw.id,
  endpoint: raw.endpoint,
  status: raw.status,
  events: raw.events,
});

export const resendClient = {
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    if (!resend) {
      logger.warn(
        { to: params.to, subject: params.subject },
        "RESEND_API_KEY not configured — email not sent",
      );
      return { id: null, error: "RESEND_API_KEY not configured" };
    }

    try {
      const { data, error } = await resend.emails.send({
        from: env.emailFromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });

      if (error) {
        logger.error(
          { err: error, to: params.to, subject: params.subject },
          "Resend rejected the email",
        );
        return { id: null, error: error.message };
      }

      return { id: data?.id ?? null, error: null };
    } catch (error) {
      logger.error(
        { err: error, to: params.to, subject: params.subject },
        "Failed to reach the Resend API",
      );
      return {
        id: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },

  // Used only by backend/scripts/register-resend-webhook.ts.
  listWebhooks: async (): Promise<ResendWebhookConfig[]> => {
    const response = await request<ResendWebhookListResponse>("/webhooks", {
      method: "GET",
    });

    return response.data.map(toWebhookConfig);
  },

  createWebhook: async (
    endpoint: string,
    events: readonly string[],
  ): Promise<ResendWebhookCreateResult> => {
    const created = await request<{
      id: string;
      endpoint: string;
      status: "enabled" | "disabled";
      events: string[];
      signing_secret: string;
    }>("/webhooks", {
      method: "POST",
      body: JSON.stringify({ endpoint, events }),
    });

    return { ...toWebhookConfig(created), signingSecret: created.signing_secret };
  },

  // Never returns the signing secret (Resend only hands it out once, at
  // creation) — used to keep an existing webhook's endpoint/events current
  // without rotating the secret Yuri already has in RESEND_WEBHOOK_SECRET.
  updateWebhook: async (
    id: string,
    endpoint: string,
    events: readonly string[],
  ): Promise<void> => {
    await request<unknown>(`/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ endpoint, events, status: "enabled" }),
    });
  },
};
