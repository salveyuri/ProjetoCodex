import type { Plan } from "@prisma/client";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { asaasClient } from "./asaas-client";

const CHECKOUT_EXPIRY_MINUTES = 60;

const todayIsoDate = (): string => new Date().toISOString().slice(0, 10);

export interface CreateSubscriptionCheckoutInput {
  checkoutId: string;
  plan: Plan;
  // When set (a coupon was applied), this becomes the recurring item value
  // Asaas charges instead of plan.price — every future renewal keeps using
  // this same fixed amount automatically, Asaas never re-derives it from
  // the plan. See coupon.service.ts#discountedPrice.
  overridePrice?: number;
}

export interface CreateSubscriptionCheckoutResult {
  checkoutUrl: string;
  asaasCheckoutId: string;
}

// Business-facing wrapper around asaas-client: turns our own Plan/Company/
// User records into the exact payload Checkout Asaas expects. Card/Pix data
// is entered entirely on the Asaas-hosted checkout page — we never collect
// or store it. CPF/CNPJ, address and phone are also collected there (not
// pre-filled), so Company doesn't need those fields.
export class AsaasService {
  async createSubscriptionCheckout(
    input: CreateSubscriptionCheckoutInput,
  ): Promise<CreateSubscriptionCheckoutResult> {
    const result = await asaasClient.createCheckout({
      // Asaas hard-rejects any other billingType for chargeTypes: RECURRENT
      // — confirmed against the sandbox API (400 "O metodo de pagamento
      // CREDIT_CARD e o unico metodo de pagamento permitido para operacoes
      // RECURRENT"). Pix has no recurring-charge product in Checkout Asaas;
      // it would need the payer to reconfirm every cycle, which is a
      // different flow than this MVP implements. See Contextos/Decisoes.md.
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: CHECKOUT_EXPIRY_MINUTES,
      callback: {
        successUrl: `${env.appBaseUrl}/dashboard/billing?checkout=success`,
        cancelUrl: `${env.appBaseUrl}/dashboard/billing?checkout=cancelled`,
        expiredUrl: `${env.appBaseUrl}/dashboard/billing?checkout=expired`,
      },
      items: [
        {
          name: input.plan.name,
          description: input.plan.description ?? undefined,
          quantity: 1,
          value: input.overridePrice ?? input.plan.price.toNumber(),
        },
      ],
      // customerData is deliberately omitted (not just name/email): Asaas
      // sandbox rejects a *partial* customerData object outright ("cpfCnpj
      // deve ser informado", "phoneNumber deve ser informado", etc. — a
      // partial payload demands the rest, confirmed against the sandbox
      // API). Omitting the key entirely is accepted and lets the customer
      // fill in everything — name, email, CPF/CNPJ, address — directly on
      // the Asaas-hosted page, which also means we never handle any of
      // that data ourselves. See Contextos/Decisoes.md.
      subscription: {
        cycle: input.plan.billingCycle,
        nextDueDate: todayIsoDate(),
        description: input.plan.name,
      },
      externalReference: input.checkoutId,
    });

    return { checkoutUrl: result.link, asaasCheckoutId: result.id };
  }

  // Best-effort: a local plan downgrade/cancel must succeed even if the
  // upstream subscription is already gone (e.g. previously canceled
  // directly in the Asaas dashboard) — never block the user's own
  // cancellation on the gateway call.
  async cancelSubscription(asaasSubscriptionId: string | null): Promise<void> {
    if (!asaasSubscriptionId) {
      return;
    }

    try {
      await asaasClient.cancelSubscription(asaasSubscriptionId);
    } catch (error) {
      logger.warn(
        { err: error, asaasSubscriptionId },
        "Failed to cancel Asaas subscription — local plan change proceeds anyway",
      );
    }
  }

  // Called once, right after the webhook confirms a ONE_TIME coupon's
  // first payment (see webhook.controller.ts) — pushes the subscription's
  // recurring value back to the plan's full price for every cycle after.
  // Unlike cancelSubscription's best-effort shrug, a failure here is a
  // real revenue leak (the customer would keep being charged the
  // discounted value indefinitely), so it's logged at error level with
  // everything needed to fix it manually in the Asaas dashboard — but it
  // still never throws: the webhook handler must always ack Asaas with
  // 2xx regardless of what this call does.
  async revertSubscriptionToFullPrice(
    asaasSubscriptionId: string,
    fullPrice: number,
  ): Promise<void> {
    try {
      await asaasClient.updateSubscriptionValue(asaasSubscriptionId, fullPrice);
    } catch (error) {
      logger.error(
        { err: error, asaasSubscriptionId, fullPrice },
        "Failed to revert a ONE_TIME coupon subscription to full price after its first cycle — the customer may keep being charged the discounted value until this is fixed manually in the Asaas dashboard",
      );
    }
  }
}

export const asaasService = new AsaasService();
