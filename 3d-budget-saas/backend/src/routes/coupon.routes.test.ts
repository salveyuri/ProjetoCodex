import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { asaasClient } from "../services/asaas-client";
import { registerTestCompany } from "../test-utils/register-test-company";

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

// Same DB shortcut used elsewhere in this suite — promoting to ADMIN has no
// public endpoint. adminMiddleware re-reads role from the DB on every
// request, so the token issued at registration (still USER at the time)
// keeps working after this.
const promoteToAdmin = async (userId: string): Promise<void> => {
  await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
};

// Fixed Pro plan id from the original seed migration (20260813190000_
// asaas_plans_checkout_payment) — price 49.90, the only plan besides
// Enterprise that isn't free, so it's what checkout tests discount.
const PRO_PLAN_ID = "00000000-0000-4000-8000-000000000002";

const asaasHeader = () => ({ "asaas-access-token": env.asaasWebhookToken });

describe("Admin coupon CRUD (/api/admin/coupons)", () => {
  it("rejects a non-admin caller", async () => {
    const company = await registerTestCompany(app, "coupon-admin-non-admin");

    const response = await request(app)
      .get("/api/admin/coupons")
      .set(authHeader(company.token));

    expect(response.status).toBe(403);
  });

  it("creates, lists and updates a coupon as admin", async () => {
    const company = await registerTestCompany(app, "coupon-admin-crud");
    await promoteToAdmin(company.userId);

    const createResponse = await request(app)
      .post("/api/admin/coupons")
      .set(authHeader(company.token))
      .send({ code: `promo-${randomUUID().slice(0, 8)}`, discountPercent: 20 });

    expect(createResponse.status).toBe(201);
    // Codes are normalized to uppercase regardless of how the admin typed it.
    expect(createResponse.body.code).toBe(createResponse.body.code.toUpperCase());
    expect(createResponse.body.discountPercent).toBe(20);
    expect(createResponse.body.isActive).toBe(true);
    expect(createResponse.body.usageCount).toBe(0);
    const couponId = createResponse.body.id as string;

    const listResponse = await request(app)
      .get("/api/admin/coupons")
      .set(authHeader(company.token));
    expect(listResponse.status).toBe(200);
    expect(
      listResponse.body.some((coupon: { id: string }) => coupon.id === couponId),
    ).toBe(true);

    const updateResponse = await request(app)
      .patch(`/api/admin/coupons/${couponId}`)
      .set(authHeader(company.token))
      .send({ isActive: false });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.isActive).toBe(false);
    // discountPercent untouched by a partial update that only sent isActive.
    expect(updateResponse.body.discountPercent).toBe(20);
  });

  it("rejects a duplicate code regardless of case", async () => {
    const company = await registerTestCompany(app, "coupon-admin-duplicate");
    await promoteToAdmin(company.userId);
    const code = `dup-${randomUUID().slice(0, 8)}`;

    const first = await request(app)
      .post("/api/admin/coupons")
      .set(authHeader(company.token))
      .send({ code, discountPercent: 10 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/admin/coupons")
      .set(authHeader(company.token))
      .send({ code: code.toUpperCase(), discountPercent: 15 });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("COUPON_CODE_TAKEN");
  });
});

describe("GET /api/billing/coupons/:code (preview)", () => {
  it("returns the discount for an active coupon, matched case-insensitively", async () => {
    const company = await registerTestCompany(app, "coupon-preview-valid");
    await promoteToAdmin(company.userId);
    const code = `prev-${randomUUID().slice(0, 8)}`;
    await request(app)
      .post("/api/admin/coupons")
      .set(authHeader(company.token))
      .send({ code, discountPercent: 25 });

    const response = await request(app)
      .get(`/api/billing/coupons/${code.toLowerCase()}`)
      .set(authHeader(company.token));

    expect(response.status).toBe(200);
    expect(response.body.code).toBe(code.toUpperCase());
    expect(response.body.discountPercent).toBe(25);
  });

  it("rejects an inactive coupon", async () => {
    const company = await registerTestCompany(app, "coupon-preview-inactive");
    await promoteToAdmin(company.userId);
    const code = `inact-${randomUUID().slice(0, 8)}`;
    const created = await request(app)
      .post("/api/admin/coupons")
      .set(authHeader(company.token))
      .send({ code, discountPercent: 10 });
    await request(app)
      .patch(`/api/admin/coupons/${created.body.id}`)
      .set(authHeader(company.token))
      .send({ isActive: false });

    const response = await request(app)
      .get(`/api/billing/coupons/${code}`)
      .set(authHeader(company.token));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("COUPON_INVALID");
  });

  it("rejects a code that doesn't exist", async () => {
    const company = await registerTestCompany(app, "coupon-preview-missing");

    const response = await request(app)
      .get("/api/billing/coupons/does-not-exist")
      .set(authHeader(company.token));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("COUPON_INVALID");
  });
});

describe("POST /api/billing/checkout with a coupon", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("charges the discounted value and records the coupon on the Checkout row", async () => {
    const company = await registerTestCompany(app, "coupon-checkout-discount");
    await promoteToAdmin(company.userId);
    const code = `chk-${randomUUID().slice(0, 8)}`;
    await request(app)
      .post("/api/admin/coupons")
      .set(authHeader(company.token))
      .send({ code, discountPercent: 20 });

    const createCheckoutSpy = vi
      .spyOn(asaasClient, "createCheckout")
      .mockResolvedValue({
        id: `asaas_checkout_${randomUUID()}`,
        link: "https://sandbox.asaas.com/checkoutSession/fake",
        status: "PENDING",
      });

    const plan = await prisma.plan.findUniqueOrThrow({ where: { id: PRO_PLAN_ID } });

    const response = await request(app)
      .post("/api/billing/checkout")
      .set(authHeader(company.token))
      .send({ planId: PRO_PLAN_ID, couponCode: code.toLowerCase() });

    expect(response.status).toBe(200);
    expect(response.body.checkoutUrl).toBeTruthy();
    expect(createCheckoutSpy).toHaveBeenCalledTimes(1);
    const [payload] = createCheckoutSpy.mock.calls[0];
    // Whatever Pro currently costs, 20% off, rounded to cents.
    const expectedValue = Math.round(plan.price.toNumber() * 0.8 * 100) / 100;
    expect(payload.items[0]?.value).toBeCloseTo(expectedValue, 2);

    const checkout = await prisma.checkout.findUnique({
      where: { id: response.body.checkoutId },
    });
    expect(checkout?.couponId).not.toBeNull();
  });

  it("rejects checkout with an invalid coupon code before ever calling Asaas", async () => {
    const company = await registerTestCompany(app, "coupon-checkout-invalid");

    const createCheckoutSpy = vi.spyOn(asaasClient, "createCheckout");

    const response = await request(app)
      .post("/api/billing/checkout")
      .set(authHeader(company.token))
      .send({ planId: PRO_PLAN_ID, couponCode: "totally-bogus-code" });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("COUPON_INVALID");
    expect(createCheckoutSpy).not.toHaveBeenCalled();
  });

  it("charges full price when no coupon is given", async () => {
    const company = await registerTestCompany(app, "coupon-checkout-none");
    const plan = await prisma.plan.findUniqueOrThrow({ where: { id: PRO_PLAN_ID } });

    const createCheckoutSpy = vi
      .spyOn(asaasClient, "createCheckout")
      .mockResolvedValue({
        id: `asaas_checkout_${randomUUID()}`,
        link: "https://sandbox.asaas.com/checkoutSession/fake",
        status: "PENDING",
      });

    const response = await request(app)
      .post("/api/billing/checkout")
      .set(authHeader(company.token))
      .send({ planId: PRO_PLAN_ID });

    expect(response.status).toBe(200);
    const [payload] = createCheckoutSpy.mock.calls[0];
    expect(payload.items[0]?.value).toBe(plan.price.toNumber());

    const checkout = await prisma.checkout.findUnique({
      where: { id: response.body.checkoutId },
    });
    expect(checkout?.couponId).toBeNull();
  });
});

describe("Coupon persists onto Company once the webhook confirms the checkout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets Company.couponId on first activation and it shows up on the billing overview", async () => {
    const company = await registerTestCompany(app, "coupon-webhook-activation");
    await promoteToAdmin(company.userId);
    const code = `wh-${randomUUID().slice(0, 8)}`;
    await request(app)
      .post("/api/admin/coupons")
      .set(authHeader(company.token))
      .send({ code, discountPercent: 30 });

    vi.spyOn(asaasClient, "createCheckout").mockResolvedValue({
      id: `asaas_checkout_${randomUUID()}`,
      link: "https://sandbox.asaas.com/checkoutSession/fake",
      status: "PENDING",
    });

    const checkoutResponse = await request(app)
      .post("/api/billing/checkout")
      .set(authHeader(company.token))
      .send({ planId: PRO_PLAN_ID, couponCode: code });
    const checkoutId = checkoutResponse.body.checkoutId as string;

    const webhookResponse = await request(app)
      .post("/api/webhooks/asaas")
      .set(asaasHeader())
      .send({
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: `pay_${randomUUID()}`,
          customer: `cus_${randomUUID()}`,
          subscription: `sub_${randomUUID()}`,
          status: "CONFIRMED",
          value: 34.93,
          externalReference: checkoutId,
        },
      });
    expect(webhookResponse.status).toBe(200);

    const overview = await request(app)
      .get("/api/billing")
      .set(authHeader(company.token));
    expect(overview.status).toBe(200);
    expect(overview.body.coupon).toEqual({ code: code.toUpperCase(), discountPercent: 30 });
    expect(overview.body.plan.id).toBe(PRO_PLAN_ID);
  });

  it("clears Company.couponId when cancelling back to the free plan", async () => {
    const company = await registerTestCompany(app, "coupon-webhook-cancel");
    await promoteToAdmin(company.userId);
    const code = `cancel-${randomUUID().slice(0, 8)}`;
    await request(app)
      .post("/api/admin/coupons")
      .set(authHeader(company.token))
      .send({ code, discountPercent: 30 });

    vi.spyOn(asaasClient, "createCheckout").mockResolvedValue({
      id: `asaas_checkout_${randomUUID()}`,
      link: "https://sandbox.asaas.com/checkoutSession/fake",
      status: "PENDING",
    });
    vi.spyOn(asaasClient, "cancelSubscription").mockResolvedValue(undefined);

    const checkoutResponse = await request(app)
      .post("/api/billing/checkout")
      .set(authHeader(company.token))
      .send({ planId: PRO_PLAN_ID, couponCode: code });

    await request(app)
      .post("/api/webhooks/asaas")
      .set(asaasHeader())
      .send({
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: `pay_${randomUUID()}`,
          customer: `cus_${randomUUID()}`,
          subscription: `sub_${randomUUID()}`,
          status: "CONFIRMED",
          value: 34.93,
          externalReference: checkoutResponse.body.checkoutId,
        },
      });

    const cancelResponse = await request(app)
      .post("/api/billing/cancel")
      .set(authHeader(company.token));

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.coupon).toBeNull();
  });
});
