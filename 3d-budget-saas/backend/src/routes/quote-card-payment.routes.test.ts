import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { registerTestCompany } from "../test-utils/register-test-company";

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

// Regression coverage for "Pagamento Cartão": the card fee stopped being
// unconditionally baked into every quote's price (via taxas_percentuais)
// and became an opt-in surcharge tied to Quote.cardPayment, applied on top
// of whatever the formula computed. See Contextos/Decisoes.md (2026-08-21).
describe("Quote cardPayment surcharge", () => {
  const setup = async (label: string, cardFeePercent: number) => {
    const company = await registerTestCompany(app, label);

    await request(app)
      .put("/api/settings")
      .set(authHeader(company.token))
      .send({
        desiredMarginPercent: 30,
        paintingHourRate: 0,
        finishingHourRate: 0,
        errorRate: 0,
        energyCostPerKwh: 1,
        cardFeePercent,
        administrativeFeePercent: 0,
      });

    const machine = await request(app)
      .post("/api/machines")
      .set(authHeader(company.token))
      .send({ name: "Card Fee Printer", type: "FDM", price: 3000, powerConsumptionWatts: 120 });
    const material = await request(app)
      .post("/api/materials")
      .set(authHeader(company.token))
      .send({
        brand: "PLA Card",
        type: "FILAMENT",
        color: "Vermelho",
        totalWeightGrams: 1000,
        purchasePrice: 100,
      });

    return { company, machineId: machine.body.id, materialId: material.body.id };
  };

  const buildQuotePayload = (
    machineId: string,
    materialId: string,
    cardPayment?: boolean,
  ) => ({
    customerName: "Cliente Cartao",
    cardPayment,
    items: [
      {
        modelName: "Peca",
        weightGrams: 100,
        printTimeHours: 2,
        machineId,
        materialId,
      },
    ],
  });

  it("does not add a card fee when cardPayment is left unset, even with a configured rate", async () => {
    const { company, machineId, materialId } = await setup("cardfee-unset", 5);

    const response = await request(app)
      .post("/api/quotes")
      .set(authHeader(company.token))
      .send(buildQuotePayload(machineId, materialId));

    expect(response.status).toBe(201);
    expect(response.body.cardPayment).toBe(false);
    expect(response.body.cardFeeAmount).toBe(0);
  });

  it("adds the real card fee amount on top of the price when cardPayment is true", async () => {
    const { company, machineId, materialId } = await setup("cardfee-on", 5);

    const withoutFee = await request(app)
      .post("/api/quotes")
      .set(authHeader(company.token))
      .send(buildQuotePayload(machineId, materialId, false));
    const withFee = await request(app)
      .post("/api/quotes")
      .set(authHeader(company.token))
      .send(buildQuotePayload(machineId, materialId, true));

    expect(withoutFee.status).toBe(201);
    expect(withFee.status).toBe(201);
    expect(withFee.body.cardPayment).toBe(true);
    // 5% of the pre-card-fee price, applied on top of it.
    const expectedFee = Math.round(withoutFee.body.totalAmount * 0.05 * 100) / 100;
    expect(withFee.body.cardFeeAmount).toBeCloseTo(expectedFee, 2);
    expect(withFee.body.totalAmount).toBeCloseTo(
      withoutFee.body.totalAmount + expectedFee,
      2,
    );
  });

  it("does not increase the value when cardFeePercent is 0, even if cardPayment is true", async () => {
    const { company, machineId, materialId } = await setup("cardfee-zero-rate", 0);

    const response = await request(app)
      .post("/api/quotes")
      .set(authHeader(company.token))
      .send(buildQuotePayload(machineId, materialId, true));

    expect(response.status).toBe(201);
    expect(response.body.cardPayment).toBe(true);
    expect(response.body.cardFeeAmount).toBe(0);
  });

  it("keeps cardPayment/cardFeeAmount after an edit that recalculates but doesn't resend cardPayment", async () => {
    const { company, machineId, materialId } = await setup("cardfee-persist", 5);

    const created = await request(app)
      .post("/api/quotes")
      .set(authHeader(company.token))
      .send(buildQuotePayload(machineId, materialId, true));
    expect(created.status).toBe(201);
    expect(created.body.cardFeeAmount).toBeGreaterThan(0);

    // paintingHours forces shouldRecalculate without touching cardPayment.
    const patched = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set(authHeader(company.token))
      .send({ paintingHours: 0 });

    expect(patched.status).toBe(200);
    expect(patched.body.cardPayment).toBe(true);
    expect(patched.body.cardFeeAmount).toBeCloseTo(created.body.cardFeeAmount, 2);
  });

  it("removes the surcharge when cardPayment is explicitly turned off", async () => {
    const { company, machineId, materialId } = await setup("cardfee-toggle-off", 5);

    const created = await request(app)
      .post("/api/quotes")
      .set(authHeader(company.token))
      .send(buildQuotePayload(machineId, materialId, true));
    expect(created.body.cardFeeAmount).toBeGreaterThan(0);

    const patched = await request(app)
      .patch(`/api/quotes/${created.body.id}`)
      .set(authHeader(company.token))
      .send({ cardPayment: false });

    expect(patched.status).toBe(200);
    expect(patched.body.cardPayment).toBe(false);
    expect(patched.body.cardFeeAmount).toBe(0);
    expect(patched.body.totalAmount).toBeLessThan(created.body.totalAmount);
  });
});
