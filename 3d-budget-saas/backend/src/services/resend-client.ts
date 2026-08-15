import { Resend } from "resend";
import { env } from "../config/env";
import { logger } from "../config/logger";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  id: string | null;
  error: string | null;
}

// Email is a best-effort side effect (account creation, billing events,
// quote summaries) — it must never throw and never block the action it
// rides along with. Every failure path here returns a result object
// instead of raising, and the full detail always gets logged server-side
// even though the caller only sees a short message (same "never leak the
// upstream body" convention as asaas-client.ts).
const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

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
};
