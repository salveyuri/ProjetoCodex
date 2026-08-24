import { CheckoutStatus, Prisma, SubscriptionStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { Webhook } from "svix";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { asaasService } from "../services/asaas.service";
import { auditLogService } from "../services/audit-log.service";
import { emailService } from "../services/email.service";
import {
  asaasWebhookSchema,
  resendWebhookSchema,
} from "../validators/webhook.validator";

// Payment statuses that mean "money actually landed" — activates the plan
// tied to the originating Checkout (first confirmation) or simply confirms
// a recurring renewal is still healthy.
const CONFIRMED_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
// A charge went unpaid past its due date — degrade to PAST_DUE, which the
// plan/usage middlewares already gate on (see billing.service.ts).
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);

// Single source of truth for which Asaas events this endpoint actually
// acts on — reused by backend/scripts/register-asaas-webhook.ts so the
// webhook registered with Asaas can never drift from what this controller
// handles (asaasWebhookSchema accepts any event string, but anything
// outside this list is just acked and ignored below).
export const HANDLED_ASAAS_EVENTS: readonly string[] = [
  ...CONFIRMED_EVENTS,
  ...OVERDUE_EVENTS,
];

// coupon/plan are only needed to decide, on first activation, whether a
// ONE_TIME coupon's first-cycle discount needs to be reverted afterward
// (see asaasService.revertSubscriptionToFullPrice below).
const findCheckoutWithCouponAndPlan = (checkoutId: string) =>
  prisma.checkout.findUnique({
    where: { id: checkoutId },
    include: { coupon: true, plan: true },
  });

// Resend event -> the deliveryStatus value stored on EmailLog. Only events
// that answer "did it get delivered, or did something go wrong" (per
// https://resend.com/docs/webhooks/event-types) — email.sent is skipped
// (redundant with our own synchronous SENT status) and so are open/click
// tracking and account-level events (domain.*/contact.*/suppression.*),
// none of which this app subscribes to (see register-resend-webhook.ts).
const RESEND_DELIVERY_STATUS_BY_EVENT: Record<string, string> = {
  "email.delivered": "DELIVERED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
  "email.delivery_delayed": "DELAYED",
  "email.failed": "FAILED",
};

export const HANDLED_RESEND_EVENTS: readonly string[] = Object.keys(
  RESEND_DELIVERY_STATUS_BY_EVENT,
);

// Confirmed against Resend's documented example payloads
// (https://resend.com/docs/webhooks/emails/failed,
// https://resend.com/docs/webhooks/emails/bounced) — email.complained and
// email.delivery_delayed don't carry a structured reason field, so those
// fall through to null (the status itself is still recorded).
const extractResendDeliveryDetail = (
  type: string,
  data: Record<string, unknown>,
): string | null => {
  if (type === "email.bounced") {
    const bounce = data.bounce as { message?: string } | undefined;
    return bounce?.message ?? null;
  }

  if (type === "email.failed") {
    const failed = data.failed as { reason?: string } | undefined;
    return failed?.reason ?? null;
  }

  return null;
};

export class WebhookController {
  // Asaas confirms payment asynchronously, never on the checkout redirect —
  // this is the only place a paid plan actually becomes ACTIVE. Always acks
  // with 2xx quickly per Asaas's own recommendation, except for a bad/
  // missing token, which is rejected outright (never process an
  // unauthenticated payload).
  async asaas(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = request.header("asaas-access-token");

      if (!token || token !== env.asaasWebhookToken) {
        throw new AppError(
          "Invalid webhook token.",
          401,
          "ASAAS_WEBHOOK_UNAUTHORIZED",
        );
      }

      const parsed = asaasWebhookSchema.safeParse(request.body);

      if (!parsed.success) {
        logger.warn(
          { issues: parsed.error.issues },
          "Asaas webhook payload rejected by schema",
        );
        response.status(200).json({ received: true });
        return;
      }

      const { event, payment } = parsed.data;

      // Renewal payments carry the Asaas subscription id, which we stored
      // on Company once the first checkout confirmed. The very first
      // payment (before that id exists on Company yet) is instead matched
      // by the externalReference we set to our own Checkout.id when
      // creating the hosted checkout session.
      let checkout: Awaited<ReturnType<typeof findCheckoutWithCouponAndPlan>> =
        null;
      let company = payment.subscription
        ? await prisma.company.findFirst({
            where: { asaasSubscriptionId: payment.subscription },
          })
        : null;

      if (!company && payment.externalReference) {
        checkout = await findCheckoutWithCouponAndPlan(payment.externalReference);

        if (checkout) {
          company = await prisma.company.findUnique({
            where: { id: checkout.companyId },
          });
        }
      }

      if (!company) {
        // Temporary extra detail (externalReference/subscription as Asaas
        // actually sent them) while tracking down a real "no matching
        // company" miss on a fresh first-payment webhook — see
        // Contextos/Conhecimento.md. Safe to trim back down once resolved.
        logger.warn(
          {
            event,
            asaasPaymentId: payment.id,
            externalReference: payment.externalReference,
            subscription: payment.subscription,
            foundCheckout: checkout !== null,
          },
          "Asaas webhook: no matching company for this payment",
        );
        response.status(200).json({ received: true });
        return;
      }

      // Whether this exact payment was already recorded — used below to
      // fire the "subscription confirmed/renewed" email exactly once per
      // payment even though Asaas can redeliver the same event.
      const existingPaymentRow = await prisma.payment.findUnique({
        where: { asaasPaymentId: payment.id },
        select: { id: true },
      });
      const isNewPaymentRecord = existingPaymentRow === null;

      // Upsert keyed by asaasPaymentId makes this idempotent — Asaas
      // guarantees "at least once" delivery, so the same event can arrive
      // more than once.
      const paymentRow = await prisma.payment.upsert({
        where: { asaasPaymentId: payment.id },
        create: {
          asaasPaymentId: payment.id,
          companyId: company.id,
          asaasSubscriptionId: payment.subscription ?? null,
          status: payment.status,
          billingType: payment.billingType ?? null,
          value: new Prisma.Decimal(payment.value),
          dueDate: payment.dueDate ? new Date(payment.dueDate) : null,
          paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : null,
          invoiceUrl: payment.invoiceUrl ?? null,
          rawPayload: request.body as Prisma.InputJsonValue,
        },
        update: {
          status: payment.status,
          paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : null,
          invoiceUrl: payment.invoiceUrl ?? null,
          rawPayload: request.body as Prisma.InputJsonValue,
        },
      });

      const isFirstActivation =
        checkout !== null && checkout.status === CheckoutStatus.PENDING;
      let nextStatus: SubscriptionStatus | null = null;

      if (CONFIRMED_EVENTS.has(event)) {
        nextStatus = SubscriptionStatus.ACTIVE;
      } else if (OVERDUE_EVENTS.has(event)) {
        nextStatus = SubscriptionStatus.PAST_DUE;
      }

      if (nextStatus) {
        const statusChanged = company.subscriptionStatus !== nextStatus;

        // Only touch Company/AuditLog when something actually changes —
        // keeps repeated webhook deliveries for the same event silent.
        if (isFirstActivation || statusChanged) {
          await prisma.company.update({
            where: { id: company.id },
            data: {
              subscriptionStatus: nextStatus,
              planId:
                isFirstActivation && checkout ? checkout.planId : undefined,
              couponId:
                isFirstActivation && checkout ? checkout.couponId : undefined,
              asaasCustomerId: payment.customer ?? company.asaasCustomerId,
              asaasSubscriptionId:
                payment.subscription ?? company.asaasSubscriptionId,
            },
          });

          if (isFirstActivation && checkout) {
            await prisma.checkout.update({
              where: { id: checkout.id },
              data: { status: CheckoutStatus.PAID },
            });

            // ONE_TIME coupon: the discount only ever covered this first
            // payment (already charged at the discounted value when the
            // checkout was created) — push the subscription back to the
            // plan's full price now, before Asaas generates the next
            // cycle's charge. Guarded to CONFIRMED_EVENTS: an OVERDUE event
            // should never be the one that "first activates" a checkout in
            // practice, but if it somehow were, there's no successful
            // payment yet to revert anything from.
            const subscriptionId = payment.subscription ?? company.asaasSubscriptionId;
            if (
              CONFIRMED_EVENTS.has(event) &&
              checkout.coupon?.type === "ONE_TIME" &&
              subscriptionId
            ) {
              await asaasService.revertSubscriptionToFullPrice({
                asaasSubscriptionId: subscriptionId,
                fullPrice: checkout.plan.price.toNumber(),
                companyName: company.name,
                couponCode: checkout.coupon.code,
                paymentId: paymentRow.id,
              });
            }
          }

          await auditLogService.record({
            action: isFirstActivation
              ? "BILLING_SUBSCRIPTION_ACTIVATED"
              : "BILLING_SUBSCRIPTION_STATUS_CHANGED",
            entityType: "Company",
            entityId: company.id,
            companyId: company.id,
            before: { subscriptionStatus: company.subscriptionStatus },
            after: { subscriptionStatus: nextStatus },
            metadata: { event, asaasPaymentId: payment.id },
          });
        }
      }

      // Independent of the Company/AuditLog block above on purpose: a
      // routine renewal (already ACTIVE, payment confirms, stays ACTIVE)
      // never enters "isFirstActivation || statusChanged", but it still
      // needs an email. isNewPaymentRecord (checked before the upsert)
      // guards against sending it twice for a redelivered webhook.
      if (isNewPaymentRecord && CONFIRMED_EVENTS.has(event)) {
        if (isFirstActivation) {
          void emailService.sendSubscriptionConfirmed(company.id, paymentRow.id);
        } else {
          void emailService.sendSubscriptionRenewed(company.id, paymentRow.id);
        }
      } else if (isNewPaymentRecord && OVERDUE_EVENTS.has(event)) {
        void emailService.sendPaymentOverdue(company.id, paymentRow.id);
      }

      response.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  }

  // Resend calls this asynchronously, some time after the original
  // resend.emails.send() call already returned (see resend-client.ts /
  // EmailService.send()) — this is the only place EmailLog.deliveryStatus
  // ever gets filled in. Acks quietly (200, no processing) whenever the
  // webhook isn't configured yet, so this stays a purely additive feature
  // that never affects whether email sends at all.
  async resend(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!env.resendWebhookSecret) {
        response.status(200).json({ received: true });
        return;
      }

      const svixId = request.header("svix-id");
      const svixTimestamp = request.header("svix-timestamp");
      const svixSignature = request.header("svix-signature");

      if (!svixId || !svixTimestamp || !svixSignature || !request.rawBody) {
        throw new AppError(
          "Invalid webhook signature.",
          401,
          "RESEND_WEBHOOK_UNAUTHORIZED",
        );
      }

      let payload: unknown;

      try {
        const webhook = new Webhook(env.resendWebhookSecret);
        payload = webhook.verify(request.rawBody, {
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": svixSignature,
        });
      } catch (error) {
        logger.warn(
          { err: error },
          "Resend webhook signature verification failed",
        );
        throw new AppError(
          "Invalid webhook signature.",
          401,
          "RESEND_WEBHOOK_UNAUTHORIZED",
        );
      }

      const parsed = resendWebhookSchema.safeParse(payload);

      if (!parsed.success) {
        logger.warn(
          { issues: parsed.error.issues },
          "Resend webhook payload rejected by schema",
        );
        response.status(200).json({ received: true });
        return;
      }

      const { type, data } = parsed.data;
      const deliveryStatus = RESEND_DELIVERY_STATUS_BY_EVENT[type];

      if (!deliveryStatus) {
        response.status(200).json({ received: true });
        return;
      }

      const result = await prisma.emailLog.updateMany({
        where: { resendMessageId: data.email_id },
        data: {
          deliveryStatus,
          deliveryDetail: extractResendDeliveryDetail(type, data),
          deliveryPayload: data as Prisma.InputJsonValue,
          deliveryUpdatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        logger.warn(
          { type, resendMessageId: data.email_id },
          "Resend webhook: no matching EmailLog row for this message id",
        );
      }

      response.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  }
}

export const webhookController = new WebhookController();
