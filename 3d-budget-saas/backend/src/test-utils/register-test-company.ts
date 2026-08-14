import type { Express } from "express";
import request from "supertest";

export const uniqueEmail = (label: string): string =>
  `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

/**
 * Every call gets its own fake client IP so integration tests that register
 * many companies back-to-back don't all pile into the same
 * registerRateLimiter bucket (5/min, keyed by client IP) the way a single
 * real IP legitimately would. Requires TRUST_PROXY_HOPS=1 in the test env
 * (see vitest.config.mts) so Express actually honors X-Forwarded-For here,
 * same as it would behind a real reverse proxy in production.
 */
let fakeIpCounter = 1;
export const uniqueTestClientIp = (): string => {
  fakeIpCounter += 1;
  return `10.${(fakeIpCounter >> 16) & 255}.${(fakeIpCounter >> 8) & 255}.${fakeIpCounter & 255}`;
};

export interface TestCompany {
  token: string;
  userId: string;
  companyId: string;
  email: string;
}

/**
 * Registers a fresh user + company (FREE plan) against the real app/DB and
 * returns everything a test needs to act as that company. See
 * auth.routes.test.ts for the caveat about there being no isolated test DB
 * yet — this hits the same local Postgres `npm run dev` uses.
 */
export const registerTestCompany = async (
  app: Express,
  label: string,
): Promise<TestCompany> => {
  const email = uniqueEmail(label);
  const response = await request(app)
    .post("/api/auth/register")
    .set("X-Forwarded-For", uniqueTestClientIp())
    .send({
      fullName: `Test ${label}`,
      email,
      password: "Abcdef12",
      companyName: `Test Co ${label}`,
    });

  if (response.status !== 201) {
    throw new Error(
      `registerTestCompany("${label}") failed: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return {
    token: response.body.token as string,
    userId: response.body.user.id as string,
    companyId: response.body.user.company.id as string,
    email,
  };
};
