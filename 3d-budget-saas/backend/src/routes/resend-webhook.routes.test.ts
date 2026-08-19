import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { Webhook } from "svix";
import { app } from "../app";
import { env } from "../config/env";
import { prisma } from "../config/prisma";

// env.resendWebhookSecret is fixed for the whole test run (see
// vitest.config.mts) so every test here signs against the same secret the
// running app verifies against.
const wh = new Webhook(env.resendWebhookSecret);

const signedHeaders = (payload: string) => {
  const id = `msg_${randomUUID()}`;
  const timestamp = new Date();
  return {
    "svix-id": id,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": wh.sign(id, timestamp, payload),
  };
};

const postWebhook = (payload: string, headers: Record<string, string> = {}) =>
  request(app)
    .post("/api/webhooks/resend")
    .set("Content-Type", "application/json")
    .set(headers)
    .send(payload);

const createEmailLog = async (resendMessageId: string) =>
  prisma.emailLog.create({
    data: {
      templateKey: "ACCOUNT_CREATED",
      toEmail: "resend-webhook-test@example.com",
      subject: "Test subject",
      status: "SENT",
      resendMessageId,
    },
  });

describe("POST /api/webhooks/resend", () => {
  it("rejects a request with no svix headers", async () => {
    const response = await postWebhook(JSON.stringify({ type: "email.delivered", data: { email_id: "x" } }));

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("RESEND_WEBHOOK_UNAUTHORIZED");
  });

  it("rejects a request with an invalid signature", async () => {
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "x" } });

    const response = await postWebhook(payload, {
      "svix-id": "msg_bogus",
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": "v1,not-a-real-signature",
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("RESEND_WEBHOOK_UNAUTHORIZED");
  });

  it("records a delivered event on the matching EmailLog row", async () => {
    const log = await createEmailLog(`resend-msg-delivered-${randomUUID()}`);
    const payload = JSON.stringify({
      type: "email.delivered",
      data: { email_id: log.resendMessageId },
    });

    const response = await postWebhook(payload, signedHeaders(payload));

    expect(response.status).toBe(200);
    const updated = await prisma.emailLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(updated.deliveryStatus).toBe("DELIVERED");
    expect(updated.deliveryDetail).toBeNull();
    expect(updated.deliveryUpdatedAt).not.toBeNull();
  });

  it("extracts the bounce message as the delivery detail", async () => {
    const log = await createEmailLog(`resend-msg-bounced-${randomUUID()}`);
    const payload = JSON.stringify({
      type: "email.bounced",
      data: {
        email_id: log.resendMessageId,
        bounce: {
          type: "Permanent",
          subType: "Suppressed",
          message: "The recipient's email address is on the suppression list.",
        },
      },
    });

    const response = await postWebhook(payload, signedHeaders(payload));

    expect(response.status).toBe(200);
    const updated = await prisma.emailLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(updated.deliveryStatus).toBe("BOUNCED");
    expect(updated.deliveryDetail).toBe(
      "The recipient's email address is on the suppression list.",
    );
  });

  it("extracts the failure reason as the delivery detail", async () => {
    const log = await createEmailLog(`resend-msg-failed-${randomUUID()}`);
    const payload = JSON.stringify({
      type: "email.failed",
      data: { email_id: log.resendMessageId, failed: { reason: "reached_daily_quota" } },
    });

    const response = await postWebhook(payload, signedHeaders(payload));

    expect(response.status).toBe(200);
    const updated = await prisma.emailLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(updated.deliveryStatus).toBe("FAILED");
    expect(updated.deliveryDetail).toBe("reached_daily_quota");
  });

  it("acks and ignores an event type it doesn't track (e.g. email.opened)", async () => {
    const log = await createEmailLog(`resend-msg-opened-${randomUUID()}`);
    const payload = JSON.stringify({
      type: "email.opened",
      data: { email_id: log.resendMessageId },
    });

    const response = await postWebhook(payload, signedHeaders(payload));

    expect(response.status).toBe(200);
    const untouched = await prisma.emailLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(untouched.deliveryStatus).toBeNull();
  });

  it("acks a well-signed payload for an unknown message id without throwing", async () => {
    const payload = JSON.stringify({
      type: "email.delivered",
      data: { email_id: `unknown-${randomUUID()}` },
    });

    const response = await postWebhook(payload, signedHeaders(payload));

    expect(response.status).toBe(200);
  });
});
