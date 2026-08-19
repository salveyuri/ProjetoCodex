import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { registerTestCompany } from "../test-utils/register-test-company";
import { emailService } from "./email.service";
import { resendClient } from "./resend-client";

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Same convention as the route integration tests: hits the real dev
 * Postgres (reads the actual seeded EmailTemplate rows, writes a real
 * EmailLog row per call — not cleaned up afterwards). Only the outbound
 * Resend call itself is mocked, since that's the actual external I/O
 * boundary and there is no real API key configured in this environment
 * anyway.
 */
describe("EmailService.send", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("HTML-escapes plain variables but leaves *Html-suffixed ones raw", async () => {
    const sendSpy = vi
      .spyOn(resendClient, "send")
      .mockResolvedValue({ id: "resend-id-1", error: null });

    await emailService.send("QUOTE_SUMMARY", "pt-BR", "customer@example.com", {
      accountName: '<script>alert("xss")</script>',
      customerName: "Fulano & Cia",
      totalAmount: "R$ 100,00",
      validUntil: "01/01/2027",
      itemsHtml: "<tr><td>Peca segura</td></tr>",
      triggerLabel: "aprovado",
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [{ html }] = sendSpy.mock.calls[0];

    // The dangerous variable was escaped — no raw <script> tag reached the
    // outgoing HTML.
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // Plain text with an ampersand is also escaped.
    expect(html).toContain("Fulano &amp; Cia");
    // itemsHtml is a pre-built HTML fragment (key ends in "Html") and must
    // pass through untouched, not double-escaped.
    expect(html).toContain("<tr><td>Peca segura</td></tr>");

    // The exact rendered HTML is also persisted on the EmailLog row, so an
    // admin can re-read what a customer was actually sent later (e.g. a
    // password reset link) — see /admin/email-logs/:id.
    const log = await prisma.emailLog.findFirst({
      where: { toEmail: "customer@example.com", resendMessageId: "resend-id-1" },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.bodyHtml).toBe(html);
  });

  it("strips newlines from subject variables but does not HTML-escape them", async () => {
    const sendSpy = vi
      .spyOn(resendClient, "send")
      .mockResolvedValue({ id: "resend-id-2", error: null });

    await emailService.send("ACCOUNT_CREATED", "pt-BR", "user@example.com", {
      accountName: "Empresa & Filhos\nLinha injetada",
      email: "user@example.com",
      planName: "Free",
      loginUrl: "https://example.com/login",
    });

    const [{ subject }] = sendSpy.mock.calls[0];

    expect(subject).not.toContain("\n");
    // Subjects are plain text (never HTML-rendered), so "&" must stay
    // literal here — HTML-escaping it would show "&amp;" to the recipient.
    expect(subject).toContain("Empresa & Filhos Linha injetada");
  });

  it("never throws even when Resend fails, and reports the failure", async () => {
    vi.spyOn(resendClient, "send").mockRejectedValue(new Error("network down"));

    const result = await emailService.send("ACCOUNT_CREATED", "pt-BR", "user@example.com", {
      accountName: "Empresa Teste",
      email: "user@example.com",
      planName: "Free",
      loginUrl: "https://example.com/login",
    });

    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("network down");
  });
});

describe("Email preference gating", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips sendQuoteSummary when the user opted out of quote emails, and logs SKIPPED_PREFERENCE", async () => {
    const company = await registerTestCompany(app, "email-pref-quotes");

    await request(app)
      .patch("/api/auth/me")
      .set(authHeader(company.token))
      .send({ emailPreferences: { quotes: false } });

    const machine = await request(app)
      .post("/api/machines")
      .set(authHeader(company.token))
      .send({ name: "Pref Machine", type: "FDM", price: 3000, powerConsumptionWatts: 120 });
    const material = await request(app)
      .post("/api/materials")
      .set(authHeader(company.token))
      .send({
        brand: "PLA Pref",
        type: "FILAMENT",
        color: "Azul",
        totalWeightGrams: 1000,
        purchasePrice: 100,
      });
    const quote = await request(app)
      .post("/api/quotes")
      .set(authHeader(company.token))
      .send({
        customerName: "Cliente Pref",
        items: [
          {
            modelName: "Peca",
            weightGrams: 100,
            printTimeHours: 2,
            machineId: machine.body.id,
            materialId: material.body.id,
          },
        ],
      });

    const sendSpy = vi.spyOn(resendClient, "send");

    await emailService.sendQuoteSummary(company.companyId, quote.body.id, "APPROVED");

    expect(sendSpy).not.toHaveBeenCalled();
    const log = await prisma.emailLog.findFirst({
      where: { templateKey: "QUOTE_SUMMARY", toEmail: company.email },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.status).toBe("SKIPPED_PREFERENCE");

    // Opting back in lets the same trigger send normally.
    await request(app)
      .patch("/api/auth/me")
      .set(authHeader(company.token))
      .send({ emailPreferences: { quotes: true } });
    sendSpy.mockResolvedValue({ id: "resend-id", error: null });

    await emailService.sendQuoteSummary(company.companyId, quote.body.id, "APPROVED");

    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it("skips sendSubscriptionConfirmed when the user opted out of financial emails", async () => {
    const company = await registerTestCompany(app, "email-pref-financial");

    await request(app)
      .patch("/api/auth/me")
      .set(authHeader(company.token))
      .send({ emailPreferences: { financial: false } });

    const payment = await prisma.payment.create({
      data: {
        companyId: company.companyId,
        asaasPaymentId: `pay_pref_${Date.now()}`,
        status: "CONFIRMED",
        value: 49.9,
        dueDate: new Date(),
        rawPayload: {},
      },
    });

    const sendSpy = vi.spyOn(resendClient, "send");

    await emailService.sendSubscriptionConfirmed(company.companyId, payment.id);

    expect(sendSpy).not.toHaveBeenCalled();
    const log = await prisma.emailLog.findFirst({
      where: { templateKey: "SUBSCRIPTION_CONFIRMED", toEmail: company.email },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.status).toBe("SKIPPED_PREFERENCE");
  });

  it("never gates sendAccountCreated on any preference", async () => {
    const company = await registerTestCompany(app, "email-pref-account-created");

    await request(app)
      .patch("/api/auth/me")
      .set(authHeader(company.token))
      .send({
        emailPreferences: { financial: false, quotes: false, newsletter: false },
      });

    const sendSpy = vi
      .spyOn(resendClient, "send")
      .mockResolvedValue({ id: "resend-id", error: null });

    await emailService.sendAccountCreated(company.userId);

    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
