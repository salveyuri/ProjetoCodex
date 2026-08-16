import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { resendClient } from "../services/resend-client";
import { registerTestCompany } from "../test-utils/register-test-company";

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

const promoteToAdmin = async (userId: string): Promise<void> => {
  // Same DB shortcut used in plan-limits.test.ts — promoting to ADMIN has
  // no public endpoint. adminMiddleware re-reads role from the DB on every
  // request, so the token issued at registration (still USER at the time)
  // keeps working after this.
  await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
};

describe("POST /api/admin/email-templates/:id/test", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a non-admin caller", async () => {
    const company = await registerTestCompany(app, "email-test-non-admin");
    const template = await prisma.emailTemplate.findFirstOrThrow({
      where: { key: "ACCOUNT_CREATED" },
    });

    const response = await request(app)
      .post(`/api/admin/email-templates/${template.id}/test`)
      .set(authHeader(company.token))
      .send({ to: "someone@example.com" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ADMIN_REQUIRED");
  });

  it("sends a real test email through EmailService and logs it", async () => {
    const company = await registerTestCompany(app, "email-test-admin");
    await promoteToAdmin(company.userId);
    const template = await prisma.emailTemplate.findFirstOrThrow({
      where: { key: "QUOTE_SUMMARY" },
    });
    const sendSpy = vi
      .spyOn(resendClient, "send")
      .mockResolvedValue({ id: "resend-test-id", error: null });
    const targetEmail = "preview-target@example.com";

    const response = await request(app)
      .post(`/api/admin/email-templates/${template.id}/test`)
      .set(authHeader(company.token))
      .send({ to: targetEmail });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "SENT", error: null });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [{ to, html }] = sendSpy.mock.calls[0];
    expect(to).toBe(targetEmail);
    // Sample data (not a real order) rendered in, no leftover {{...}} tags.
    expect(html).toContain("Maria Cliente");
    expect(html).not.toMatch(/\{\{\w+\}\}/);

    const log = await prisma.emailLog.findFirst({
      where: { templateKey: "QUOTE_SUMMARY", toEmail: targetEmail },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.status).toBe("SENT");
  });

  it("reports a failed send instead of throwing", async () => {
    const company = await registerTestCompany(app, "email-test-fail");
    await promoteToAdmin(company.userId);
    const template = await prisma.emailTemplate.findFirstOrThrow({
      where: { key: "PASSWORD_RESET" },
    });
    vi.spyOn(resendClient, "send").mockResolvedValue({
      id: null,
      error: "Resend rejected the request",
    });

    const response = await request(app)
      .post(`/api/admin/email-templates/${template.id}/test`)
      .set(authHeader(company.token))
      .send({ to: "someone@example.com" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("FAILED");
    expect(response.body.error).toBe("Resend rejected the request");
  });

  it("rejects an invalid email address", async () => {
    const company = await registerTestCompany(app, "email-test-invalid");
    await promoteToAdmin(company.userId);
    const template = await prisma.emailTemplate.findFirstOrThrow({
      where: { key: "ACCOUNT_CREATED" },
    });

    const response = await request(app)
      .post(`/api/admin/email-templates/${template.id}/test`)
      .set(authHeader(company.token))
      .send({ to: "not-an-email" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("tests even a template the admin hasn't activated yet", async () => {
    const company = await registerTestCompany(app, "email-test-inactive");
    await promoteToAdmin(company.userId);
    const template = await prisma.emailTemplate.findFirstOrThrow({
      where: { key: "SUBSCRIPTION_RENEWED" },
    });
    await prisma.emailTemplate.update({
      where: { id: template.id },
      data: { isActive: false },
    });
    vi.spyOn(resendClient, "send").mockResolvedValue({ id: "id", error: null });

    try {
      const response = await request(app)
        .post(`/api/admin/email-templates/${template.id}/test`)
        .set(authHeader(company.token))
        .send({ to: "someone@example.com" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("SENT");
    } finally {
      await prisma.emailTemplate.update({
        where: { id: template.id },
        data: { isActive: true },
      });
    }
  });
});
