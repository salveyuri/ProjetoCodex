import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { emailService } from "../services/email.service";
import { resendClient } from "../services/resend-client";
import { registerTestCompany } from "../test-utils/register-test-company";

const asaasHeader = () => ({ "asaas-access-token": env.asaasWebhookToken });

describe("POST /api/webhooks/asaas", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers sendPaymentOverdue on a new PAYMENT_OVERDUE event and moves the company to PAST_DUE", async () => {
    const company = await registerTestCompany(app, "webhook-overdue");
    const subscriptionId = `sub_${randomUUID()}`;
    await prisma.company.update({
      where: { id: company.companyId },
      data: { asaasSubscriptionId: subscriptionId, subscriptionStatus: "ACTIVE" },
    });

    vi.spyOn(resendClient, "send").mockResolvedValue({ id: "resend-id", error: null });
    const overdueSpy = vi.spyOn(emailService, "sendPaymentOverdue");

    const paymentId = `pay_${randomUUID()}`;
    const response = await request(app)
      .post("/api/webhooks/asaas")
      .set(asaasHeader())
      .send({
        event: "PAYMENT_OVERDUE",
        payment: {
          id: paymentId,
          subscription: subscriptionId,
          status: "OVERDUE",
          value: 49.9,
          dueDate: "2026-08-01",
        },
      });

    expect(response.status).toBe(200);
    expect(overdueSpy).toHaveBeenCalledTimes(1);
    // webhook.controller.ts calls this with `void` (fire-and-forget) — wait
    // for the actual async work to finish before checking its side effects,
    // otherwise this races the still-in-flight EmailLog write below.
    await overdueSpy.mock.results[0]?.value;

    const updatedCompany = await prisma.company.findUniqueOrThrow({
      where: { id: company.companyId },
    });
    expect(updatedCompany.subscriptionStatus).toBe("PAST_DUE");

    const log = await prisma.emailLog.findFirst({
      where: { templateKey: "PAYMENT_OVERDUE", toEmail: company.email },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.status).toBe("SENT");
  });

  it("does not resend PAYMENT_OVERDUE when the same payment webhook is redelivered", async () => {
    const company = await registerTestCompany(app, "webhook-overdue-redelivery");
    const subscriptionId = `sub_${randomUUID()}`;
    await prisma.company.update({
      where: { id: company.companyId },
      data: { asaasSubscriptionId: subscriptionId, subscriptionStatus: "ACTIVE" },
    });

    vi.spyOn(resendClient, "send").mockResolvedValue({ id: "resend-id", error: null });
    const overdueSpy = vi.spyOn(emailService, "sendPaymentOverdue");

    const paymentId = `pay_${randomUUID()}`;
    const payload = {
      event: "PAYMENT_OVERDUE",
      payment: {
        id: paymentId,
        subscription: subscriptionId,
        status: "OVERDUE",
        value: 49.9,
        dueDate: "2026-08-01",
      },
    };

    await request(app).post("/api/webhooks/asaas").set(asaasHeader()).send(payload);
    await request(app).post("/api/webhooks/asaas").set(asaasHeader()).send(payload);

    expect(overdueSpy).toHaveBeenCalledTimes(1);
  });
});
