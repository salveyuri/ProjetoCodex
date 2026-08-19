import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { resendClient } from "../services/resend-client";
import { registerTestCompany } from "../test-utils/register-test-company";

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

const promoteToAdmin = async (userId: string): Promise<void> => {
  await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
};

describe("GET /api/admin/email-logs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a non-admin caller", async () => {
    const company = await registerTestCompany(app, "email-log-non-admin");

    const response = await request(app)
      .get("/api/admin/email-logs")
      .set(authHeader(company.token));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ADMIN_REQUIRED");
  });

  it("lists every send attempt, most recent first, paginated", async () => {
    const company = await registerTestCompany(app, "email-log-list");
    await promoteToAdmin(company.userId);
    const template = await prisma.emailTemplate.findFirstOrThrow({
      where: { key: "ACCOUNT_CREATED" },
    });
    vi.spyOn(resendClient, "send").mockResolvedValue({ id: "resend-id", error: null });

    const firstEmail = "log-list-first@example.com";
    const secondEmail = "log-list-second@example.com";

    await request(app)
      .post(`/api/admin/email-templates/${template.id}/test`)
      .set(authHeader(company.token))
      .send({ to: firstEmail });
    await request(app)
      .post(`/api/admin/email-templates/${template.id}/test`)
      .set(authHeader(company.token))
      .send({ to: secondEmail });

    const response = await request(app)
      .get("/api/admin/email-logs")
      .query({ pageSize: 100 })
      .set(authHeader(company.token));

    expect(response.status).toBe(200);
    expect(response.body.pagination).toMatchObject({ page: 1, pageSize: 100 });

    const emails: string[] = response.body.data.map(
      (log: { toEmail: string }) => log.toEmail,
    );
    const firstIndex = emails.indexOf(firstEmail);
    const secondIndex = emails.indexOf(secondEmail);
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThanOrEqual(0);
    // Most recent first: the second send should sort before the first.
    expect(secondIndex).toBeLessThan(firstIndex);

    const secondEntry = response.body.data[secondIndex];
    expect(secondEntry).toMatchObject({
      templateKey: "ACCOUNT_CREATED",
      status: "SENT",
      resendMessageId: "resend-id",
      errorMessage: null,
    });
  });

  it("filters by status", async () => {
    const company = await registerTestCompany(app, "email-log-filter");
    await promoteToAdmin(company.userId);
    const template = await prisma.emailTemplate.findFirstOrThrow({
      where: { key: "PASSWORD_RESET" },
    });
    const failedEmail = "log-filter-failed@example.com";
    vi.spyOn(resendClient, "send").mockResolvedValue({
      id: null,
      error: "Resend rejected the request",
    });

    await request(app)
      .post(`/api/admin/email-templates/${template.id}/test`)
      .set(authHeader(company.token))
      .send({ to: failedEmail });

    const response = await request(app)
      .get("/api/admin/email-logs")
      .query({ status: "FAILED", pageSize: 100 })
      .set(authHeader(company.token));

    expect(response.status).toBe(200);
    const statuses: string[] = response.body.data.map(
      (log: { status: string }) => log.status,
    );
    expect(statuses.every((status) => status === "FAILED")).toBe(true);
    const emails: string[] = response.body.data.map(
      (log: { toEmail: string }) => log.toEmail,
    );
    expect(emails).toContain(failedEmail);
  });

  it("rejects an invalid status filter", async () => {
    const company = await registerTestCompany(app, "email-log-bad-status");
    await promoteToAdmin(company.userId);

    const response = await request(app)
      .get("/api/admin/email-logs")
      .query({ status: "NOT_A_STATUS" })
      .set(authHeader(company.token));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("does not include bodyHtml in the list response", async () => {
    const company = await registerTestCompany(app, "email-log-list-no-body");
    await promoteToAdmin(company.userId);
    const template = await prisma.emailTemplate.findFirstOrThrow({
      where: { key: "ACCOUNT_CREATED" },
    });
    vi.spyOn(resendClient, "send").mockResolvedValue({ id: "resend-id", error: null });

    await request(app)
      .post(`/api/admin/email-templates/${template.id}/test`)
      .set(authHeader(company.token))
      .send({ to: "log-list-no-body@example.com" });

    const response = await request(app)
      .get("/api/admin/email-logs")
      .query({ pageSize: 100 })
      .set(authHeader(company.token));

    expect(response.status).toBe(200);
    expect(
      (response.body.data as Array<Record<string, unknown>>).every(
        (log) => !("bodyHtml" in log),
      ),
    ).toBe(true);
  });
});

describe("GET /api/admin/email-logs/:id", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a non-admin caller", async () => {
    const company = await registerTestCompany(app, "email-log-detail-non-admin");

    const response = await request(app)
      .get("/api/admin/email-logs/00000000-0000-4000-8000-000000000000")
      .set(authHeader(company.token));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ADMIN_REQUIRED");
  });

  it("returns 404 for an unknown id", async () => {
    const company = await registerTestCompany(app, "email-log-detail-404");
    await promoteToAdmin(company.userId);

    const response = await request(app)
      .get("/api/admin/email-logs/00000000-0000-4000-8000-000000000000")
      .set(authHeader(company.token));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("EMAIL_LOG_NOT_FOUND");
  });

  it("returns the exact rendered HTML that was sent", async () => {
    const company = await registerTestCompany(app, "email-log-detail-body");
    await promoteToAdmin(company.userId);
    const template = await prisma.emailTemplate.findFirstOrThrow({
      where: { key: "PASSWORD_RESET" },
    });
    vi.spyOn(resendClient, "send").mockResolvedValue({ id: "resend-id-detail", error: null });

    await request(app)
      .post(`/api/admin/email-templates/${template.id}/test`)
      .set(authHeader(company.token))
      .send({ to: "log-detail-body@example.com" });

    const log = await prisma.emailLog.findFirstOrThrow({
      where: { resendMessageId: "resend-id-detail" },
    });

    const response = await request(app)
      .get(`/api/admin/email-logs/${log.id}`)
      .set(authHeader(company.token));

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(log.id);
    expect(typeof response.body.bodyHtml).toBe("string");
    expect(response.body.bodyHtml).not.toMatch(/\{\{\w+\}\}/);
  });
});
