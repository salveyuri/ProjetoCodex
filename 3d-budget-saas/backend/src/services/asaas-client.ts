import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "../middlewares/error-handler";

export type AsaasBillingType = "CREDIT_CARD" | "PIX";

export interface AsaasCreateCheckoutPayload {
  billingTypes: AsaasBillingType[];
  chargeTypes: ["RECURRENT"];
  minutesToExpire: number;
  callback: {
    successUrl: string;
    cancelUrl: string;
    expiredUrl: string;
  };
  items: Array<{
    name: string;
    description?: string;
    quantity: number;
    value: number;
  }>;
  customerData?: {
    name?: string;
    email?: string;
  };
  subscription: {
    cycle: "MONTHLY" | "YEARLY";
    nextDueDate: string;
    description: string;
  };
  externalReference: string;
}

export interface AsaasCreateCheckoutResult {
  id: string;
  link: string;
  status: string;
}

export interface AsaasPaymentSummary {
  id: string;
  subscription: string | null;
  status: string;
  value: number;
  dueDate: string | null;
  paymentDate: string | null;
  invoiceUrl: string | null;
  billingType: string | null;
}

interface AsaasPaymentListResponse {
  data: AsaasPaymentSummary[];
}

// Thin wrapper around the Asaas REST API (https://docs.asaas.com/) using the
// built-in fetch (Node 20+) — no need for an HTTP client dependency for two
// endpoints. Every failure (network or non-2xx) becomes an AppError so
// callers never have to deal with raw fetch/Response objects; the full
// upstream error body is logged server-side but never forwarded verbatim to
// the client response, since it could contain gateway-internal details.
const request = async <T>(path: string, init: RequestInit): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${env.asaasBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        access_token: env.asaasApiKey,
        ...init.headers,
      },
    });
  } catch (error) {
    logger.error({ err: error, path }, "Failed to reach Asaas API");
    throw new AppError(
      "Could not reach the payment gateway. Try again in a moment.",
      502,
      "ASAAS_API_ERROR",
    );
  }

  const rawBody = await response.text();
  const body = rawBody ? (JSON.parse(rawBody) as unknown) : null;

  if (!response.ok) {
    logger.error(
      { status: response.status, path, body },
      "Asaas API rejected the request",
    );
    throw new AppError(
      "The payment gateway rejected the request.",
      502,
      "ASAAS_API_ERROR",
      { status: response.status },
    );
  }

  return body as T;
};

export const asaasClient = {
  createCheckout: (
    payload: AsaasCreateCheckoutPayload,
  ): Promise<AsaasCreateCheckoutResult> =>
    request<AsaasCreateCheckoutResult>("/checkouts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  cancelSubscription: async (subscriptionId: string): Promise<void> => {
    await request<unknown>(`/subscriptions/${subscriptionId}`, {
      method: "DELETE",
    });
  },

  // Asaas generates the next cycle's payment ahead of its due date (as
  // soon as the previous one settles) — this lets the subscription-
  // expiring cron job (backend/src/jobs/subscription-expiring.job.ts)
  // pull that upcoming due date directly, instead of only relying on a
  // PAYMENT_CREATED webhook event that requires a webhook to actually be
  // registered with Asaas (not the case yet — see Notas/TODO.md).
  listPendingPayments: async (
    subscriptionId: string,
  ): Promise<AsaasPaymentSummary[]> => {
    const response = await request<AsaasPaymentListResponse>(
      `/payments?subscription=${encodeURIComponent(subscriptionId)}&status=PENDING`,
      { method: "GET" },
    );

    return response.data;
  },
};
