import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { uniqueEmail, uniqueTestClientIp } from "../test-utils/register-test-company";

/**
 * Integration tests hit the real Express app + local Postgres dev database
 * (same one `npm run dev` uses) via supertest — there is no separate test
 * DB/container yet (see Contextos/Ambientes.md and Notas/TODO.md). Each
 * test uses a timestamp+random-suffixed email so runs don't collide with
 * each other or with manual testing data; rows are not cleaned up
 * afterwards (acceptable for a dev database, not for a shared/CI one).
 */

const registerPayload = (email: string) => ({
  fullName: "Integration Test",
  email,
  password: "Abcdef12",
  companyName: "Integration Test Co",
  country: "BR",
});

// Every register call gets its own fake client IP (via X-Forwarded-For,
// trusted because vitest.config.mts sets TRUST_PROXY_HOPS=1) so this file's
// many registrations don't collide with each other on registerRateLimiter
// (5/min, keyed by client IP) the way a single real IP legitimately would.
const registerAsNewClient = (email: string) =>
  request(app)
    .post("/api/auth/register")
    .set("X-Forwarded-For", uniqueTestClientIp())
    .send(registerPayload(email));

describe("POST /api/auth/register", () => {
  it("creates a user + company and returns a short-lived access token", async () => {
    const email = uniqueEmail("register");

    const response = await registerAsNewClient(email);

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.tokenType).toBe("Bearer");
    expect(response.body.user.email).toBe(email);
    expect(response.body.user.company.name).toBe("Integration Test Co");
    expect(response.body.user.company.planCode).toBe("free");

    const setCookie = response.headers["set-cookie"];
    expect(setCookie?.[0]).toMatch(/refresh_token=.+HttpOnly/i);
    expect(setCookie?.[0]).toMatch(/Path=\//);
  });

  it("rejects a second registration with the same email", async () => {
    const email = uniqueEmail("duplicate");
    await registerAsNewClient(email);

    const response = await registerAsNewClient(email);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("rejects a payload with an over-long full name", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .set("X-Forwarded-For", uniqueTestClientIp())
      .send({ ...registerPayload(uniqueEmail("toolong")), fullName: "A".repeat(300) });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/login", () => {
  it("authenticates with correct credentials", async () => {
    const email = uniqueEmail("login-ok");
    await registerAsNewClient(email);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "Abcdef12" });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(email);
  });

  it("rejects an incorrect password without revealing which field was wrong", async () => {
    const email = uniqueEmail("login-bad");
    await registerAsNewClient(email);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "WrongPassword1" });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /api/auth/me", () => {
  it("rejects requests without a bearer token", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
  });

  it("returns the authenticated user for a valid access token", async () => {
    const email = uniqueEmail("me");
    const registerResponse = await registerAsNewClient(email);
    const token = registerResponse.body.token as string;

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(email);
  });
});

describe("PATCH /api/auth/me", () => {
  it("rejects requests without a bearer token", async () => {
    const response = await request(app).patch("/api/auth/me").send({ name: "Nova" });

    expect(response.status).toBe(401);
  });

  it("updates the display name and returns the fresh user, register() also fills it in initially", async () => {
    const email = uniqueEmail("profile-name");
    const registerResponse = await registerAsNewClient(email);
    const token = registerResponse.body.token as string;
    expect(registerResponse.body.user.name).toBe("Integration Test");

    const response = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Novo Nome" });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Novo Nome");
    expect(response.body.email).toBe(email);
  });

  it("updates the company name alongside the display name", async () => {
    const email = uniqueEmail("profile-company-name");
    const registerResponse = await registerAsNewClient(email);
    const token = registerResponse.body.token as string;
    expect(registerResponse.body.user.company.name).toBe("Integration Test Co");

    const response = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Novo Nome", companyName: "Nova Empresa Ltda" });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Novo Nome");
    expect(response.body.company.name).toBe("Nova Empresa Ltda");
  });

  it("updates email preferences without touching the name", async () => {
    const email = uniqueEmail("profile-prefs");
    const registerResponse = await registerAsNewClient(email);
    const token = registerResponse.body.token as string;
    expect(registerResponse.body.user.emailPreferences).toEqual({
      financial: true,
      quotes: true,
      newsletter: false,
    });

    const response = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ emailPreferences: { financial: false, newsletter: true } });

    expect(response.status).toBe(200);
    expect(response.body.emailPreferences).toEqual({
      financial: false,
      quotes: true,
      newsletter: true,
    });
    expect(response.body.name).toBe("Integration Test");
  });

  it("rejects a payload that tries to change the email", async () => {
    const email = uniqueEmail("profile-email-locked");
    const registerResponse = await registerAsNewClient(email);
    const token = registerResponse.body.token as string;

    const response = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "someone-else@example.com" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");

    const meResponse = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(meResponse.body.email).toBe(email);
  });

  it("rejects an empty payload", async () => {
    const email = uniqueEmail("profile-empty");
    const registerResponse = await registerAsNewClient(email);
    const token = registerResponse.body.token as string;

    const response = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/auth/password", () => {
  it("rejects requests without a bearer token", async () => {
    const response = await request(app)
      .patch("/api/auth/password")
      .send({ currentPassword: "Abcdef12", newPassword: "NovaSenha12" });

    expect(response.status).toBe(401);
  });

  it("rejects the wrong current password", async () => {
    const email = uniqueEmail("change-pw-wrong");
    const registerResponse = await registerAsNewClient(email);
    const token = registerResponse.body.token as string;

    const response = await request(app)
      .patch("/api/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "WrongPassword1", newPassword: "NovaSenha12" });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("CURRENT_PASSWORD_INVALID");
  });

  it("changes the password and revokes existing sessions", async () => {
    const email = uniqueEmail("change-pw-ok");
    const registerResponse = await registerAsNewClient(email);
    const token = registerResponse.body.token as string;
    const refreshCookie = registerResponse.headers["set-cookie"][0] as string;

    const response = await request(app)
      .patch("/api/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "Abcdef12", newPassword: "NovaSenha12" });

    expect(response.status).toBe(204);

    // The old session's refresh token no longer works...
    const refreshResponse = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie);
    expect(refreshResponse.status).toBe(401);

    // ...but logging in again works with the new password.
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "NovaSenha12" });
    expect(loginResponse.status).toBe(200);
  });

  it("rejects a weak new password", async () => {
    const email = uniqueEmail("change-pw-weak");
    const registerResponse = await registerAsNewClient(email);
    const token = registerResponse.body.token as string;

    const response = await request(app)
      .patch("/api/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "Abcdef12", newPassword: "short" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/refresh", () => {
  it("exchanges a valid refresh cookie for a new access token", async () => {
    const email = uniqueEmail("refresh");
    const registerResponse = await registerAsNewClient(email);
    const refreshCookie = registerResponse.headers["set-cookie"][0] as string;

    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    // The access token itself can legitimately be byte-identical to the one
    // from register (same JWT payload + same iat second) — what actually
    // must change on every refresh is the rotated refresh token cookie.
    const newRefreshCookie = response.headers["set-cookie"][0] as string;
    expect(newRefreshCookie).not.toBe(refreshCookie);
  });

  it("rejects a refresh call with no cookie at all", async () => {
    const response = await request(app).post("/api/auth/refresh");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("REFRESH_TOKEN_MISSING");
  });
});
