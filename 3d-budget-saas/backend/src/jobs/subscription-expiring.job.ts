import { Prisma } from "@prisma/client";
import cron from "node-cron";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { asaasClient } from "../services/asaas-client";
import { emailService } from "../services/email.service";

const EXPIRING_WINDOW_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Statuses that mean the invoice is already settled — never remind about a
// due date that's already been paid, even if it happens to fall inside the
// warning window (paid ahead of time).
const SETTLED_PAYMENT_STATUSES = ["CONFIRMED", "RECEIVED"];

// Checked once (2026-08-15, this project's Asaas sandbox account, GET
// /v3/webhooks): zero webhooks are registered — nothing is pushed to this
// app today, in any environment (production has never registered one
// either; see Notas/TODO.md, DEVOPS-001). Confirmed separately that Asaas
// DOES generate the next cycle's payment object (status PENDING, due date
// days out) as soon as the previous one settles — a real subscription
// created in sandbox for this check had a PENDING payment with a future
// dueDate immediately after creation. So the data this job needs exists on
// Asaas's side well ahead of time; it's just not being pushed here. Rather
// than depend on a future webhook registration (and on "PAYMENT_CREATED"
// specifically being included in whatever events get selected — an easy
// thing to forget), this job pulls each active subscription's upcoming
// payment directly from the Asaas API and upserts it into `payments` (the
// same shape the webhook would have written), then runs the original
// local-table query below. This makes the reminder work today, and it
// keeps working regardless of what the eventual webhook ends up
// subscribed to.
const syncUpcomingPaymentsFromAsaas = async (): Promise<void> => {
  if (!env.asaasApiKey) {
    logger.debug(
      "Subscription-expiring job: ASAAS_API_KEY not configured, skipping Asaas sync",
    );
    return;
  }

  const activeSubscriptions = await prisma.company.findMany({
    where: { subscriptionStatus: "ACTIVE", asaasSubscriptionId: { not: null } },
    select: { id: true, asaasSubscriptionId: true },
  });

  for (const company of activeSubscriptions) {
    const subscriptionId = company.asaasSubscriptionId;

    if (!subscriptionId) {
      continue;
    }

    try {
      const pendingPayments = await asaasClient.listPendingPayments(subscriptionId);

      for (const payment of pendingPayments) {
        await prisma.payment.upsert({
          where: { asaasPaymentId: payment.id },
          create: {
            asaasPaymentId: payment.id,
            companyId: company.id,
            asaasSubscriptionId: payment.subscription ?? subscriptionId,
            status: payment.status,
            billingType: payment.billingType ?? null,
            value: new Prisma.Decimal(payment.value),
            dueDate: payment.dueDate ? new Date(payment.dueDate) : null,
            paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : null,
            invoiceUrl: payment.invoiceUrl ?? null,
            rawPayload: payment as unknown as Prisma.InputJsonValue,
          },
          // Only refreshes status/dueDate — a webhook-delivered row (or an
          // earlier sync) always wins on every other field, same as
          // webhook.controller.ts's own upsert.
          update: {
            status: payment.status,
            dueDate: payment.dueDate ? new Date(payment.dueDate) : null,
          },
        });
      }
    } catch (error) {
      // One company's Asaas call failing (rate limit, transient error)
      // must not stop the rest of the batch.
      logger.warn(
        { err: error, companyId: company.id, subscriptionId },
        "Subscription-expiring job: failed to sync payments from Asaas for this company",
      );
    }
  }
};

// Exported so it can also be triggered manually (ops/debugging) or driven
// directly from a test, instead of only ever firing from the cron schedule.
export const runSubscriptionExpiringCheck = async (): Promise<void> => {
  await syncUpcomingPaymentsFromAsaas();

  const now = new Date();
  const windowEnd = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * MS_PER_DAY);

  const candidates = await prisma.payment.findMany({
    where: {
      dueDate: { gte: now, lte: windowEnd },
      status: { notIn: SETTLED_PAYMENT_STATUSES },
      company: { subscriptionStatus: "ACTIVE" },
    },
    select: { id: true, companyId: true },
  });

  logger.info(
    { count: candidates.length },
    "Subscription-expiring job: candidates found",
  );

  for (const candidate of candidates) {
    await emailService.sendSubscriptionExpiring(
      candidate.companyId,
      candidate.id,
    );
  }
};

export const startSubscriptionExpiringJob = (): void => {
  cron.schedule(
    "0 9 * * *",
    () => {
      runSubscriptionExpiringCheck().catch((error) => {
        logger.error({ err: error }, "Subscription-expiring job failed");
      });
    },
    { timezone: "America/Sao_Paulo" },
  );
};
