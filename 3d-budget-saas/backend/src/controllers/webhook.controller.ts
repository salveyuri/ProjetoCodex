import { CheckoutStatus, Prisma, SubscriptionStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { auditLogService } from "../services/audit-log.service";
import { asaasWebhookSchema } from "../validators/webhook.validator";

// Payment statuses that mean "money actually landed" — activates the plan
// tied to the originating Checkout (first confirmation) or simply confirms
// a recurring renewal is still healthy.
const CONFIRMED_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
// A charge went unpaid past its due date — degrade to PAST_DUE, which the
// plan/usage middlewares already gate on (see billing.service.ts).
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);

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
      let checkout: Awaited<ReturnType<typeof prisma.checkout.findUnique>> =
        null;
      let company = payment.subscription
        ? await prisma.company.findFirst({
            where: { asaasSubscriptionId: payment.subscription },
          })
        : null;

      if (!company && payment.externalReference) {
        checkout = await prisma.checkout.findUnique({
          where: { id: payment.externalReference },
        });

        if (checkout) {
          company = await prisma.company.findUnique({
            where: { id: checkout.companyId },
          });
        }
      }

      if (!company) {
        logger.warn(
          { event, asaasPaymentId: payment.id },
          "Asaas webhook: no matching company for this payment",
        );
        response.status(200).json({ received: true });
        return;
      }

      // Upsert keyed by asaasPaymentId makes this idempotent — Asaas
      // guarantees "at least once" delivery, so the same event can arrive
      // more than once.
      await prisma.payment.upsert({
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

      let nextStatus: SubscriptionStatus | null = null;

      if (CONFIRMED_EVENTS.has(event)) {
        nextStatus = SubscriptionStatus.ACTIVE;
      } else if (OVERDUE_EVENTS.has(event)) {
        nextStatus = SubscriptionStatus.PAST_DUE;
      }

      if (nextStatus) {
        const isFirstActivation =
          checkout !== null && checkout.status === CheckoutStatus.PENDING;
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

      response.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  }
}

export const webhookController = new WebhookController();
