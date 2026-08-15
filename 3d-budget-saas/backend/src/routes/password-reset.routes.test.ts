import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { emailService } from "../services/email.service";
import { uniqueEmail, uniqueTestClientIp } from "../test-utils/register-test-company";

/**
 * Same caveat as auth.routes.test.ts: hits the real app + local dev
 * Postgres, no isolated test DB yet. Resend is never actually configured
 * in this environment, so instead of intercepting a real email we spy on
 * EmailService.sendPasswordReset — the same call the real code path
 * makes — to capture the raw token that would have been emailed. Nothing
 * about the reset flow itself is mocked, only the delivery.
 */

const registerPayload = (email: string) => ({
  fullName: "Reset Test",
  email,
  password: "Abcdef12",
  companyName: "Reset Test Co",
});

const registerAsNewClient = (email: string) =>
  request(app)
    .post("/api/auth/register")
    .set("X-Forwarded-For", uniqueTestClientIp())
    .send(registerPayload(email));

// forgotPasswordRateLimiter is intentionally tight (3 / 15min per IP) —
// every call in this file needs its own fake client IP or the tests would
// trip the very limiter they're testing around.
const forgotPassword = (email: string) =>
  request(app)
    .post("/api/auth/forgot-password")
    .set("X-Forwarded-For", uniqueTestClientIp())
    .send({ email });

const resetPassword = (token: string, password: string) =>
  request(app)
    .post("/api/auth/reset-password")
    .set("X-Forwarded-For", uniqueTestClientIp())
    .send({ token, password });

describe("POST /api/auth/forgot-password", () => {
  it("always responds 200, whether or not the email is registered", async () => {
    const email = uniqueEmail("forgot-known");
    await registerAsNewClient(email);

    const knownResponse = await forgotPassword(email);
    const unknownResponse = await forgotPassword(uniqueEmail("forgot-unknown"));

    expect(knownResponse.status).toBe(200);
    expect(unknownResponse.status).toBe(200);
  });

  it("only emails a reset link for a known, active account", async () => {
    const sendSpy = vi.spyOn(emailService, "sendPasswordReset");
    const email = uniqueEmail("forgot-spy");
    await registerAsNewClient(email);
    sendSpy.mockClear();

    await forgotPassword(email);
    await forgotPassword(uniqueEmail("forgot-spy-unknown"));

    expect(sendSpy).toHaveBeenCalledTimes(1);
    sendSpy.mockRestore();
  });
});

describe("POST /api/auth/reset-password", () => {
  it("resets the password, revokes existing sessions, and the token can't be reused", async () => {
    const sendSpy = vi.spyOn(emailService, "sendPasswordReset");
    const email = uniqueEmail("reset-flow");
    const registerResponse = await registerAsNewClient(email);
    const oldRefreshCookie = registerResponse.headers["set-cookie"][0] as string;

    await forgotPassword(email);
    expect(sendSpy).toHaveBeenCalled();
    const [, rawToken] = sendSpy.mock.calls[sendSpy.mock.calls.length - 1] as [
      string,
      string,
    ];
    sendSpy.mockRestore();

    const resetResponse = await resetPassword(rawToken, "NewPassword12");
    expect(resetResponse.status).toBe(204);

    // Old password no longer works.
    const oldPasswordLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "Abcdef12" });
    expect(oldPasswordLogin.status).toBe(401);

    // New password works.
    const newPasswordLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "NewPassword12" });
    expect(newPasswordLogin.status).toBe(200);

    // The refresh token issued before the reset was revoked.
    const staleRefresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", oldRefreshCookie);
    expect(staleRefresh.status).toBe(401);

    // The same reset token cannot be redeemed a second time.
    const reuseResponse = await resetPassword(rawToken, "AnotherPassword12");
    expect(reuseResponse.status).toBe(400);
    expect(reuseResponse.body.code).toBe("PASSWORD_RESET_TOKEN_INVALID");
  });

  it("rejects an invalid/garbage token", async () => {
    const response = await resetPassword("not-a-real-token", "SomePassword12");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("PASSWORD_RESET_TOKEN_INVALID");
  });
});
