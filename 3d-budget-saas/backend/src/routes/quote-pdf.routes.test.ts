import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { registerTestCompany } from "../test-utils/register-test-company";

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

// Fixed id from the original seed migration (20260813190000_asaas_plans_
// checkout_payment) — pdfExport: true, same as every paid plan.
const PRO_PLAN_ID = "00000000-0000-4000-8000-000000000002";

const buildQuote = async (token: string) => {
  const machine = await request(app)
    .post("/api/machines")
    .set(authHeader(token))
    .send({ name: "Ender 3", type: "FDM", price: 3000, powerConsumptionWatts: 120 });
  const material = await request(app)
    .post("/api/materials")
    .set(authHeader(token))
    .send({
      brand: "PLA X",
      type: "FILAMENT",
      color: "Preto",
      totalWeightGrams: 1000,
      purchasePrice: 100,
    });

  return request(app)
    .post("/api/quotes")
    .set(authHeader(token))
    .send({
      customerName: "Cliente PDF",
      items: [
        {
          modelName: "Peca de teste",
          weightGrams: 100,
          printTimeHours: 2,
          machineId: machine.body.id,
          materialId: material.body.id,
        },
      ],
    });
};

describe("GET /api/quotes/:id/pdf — format", () => {
  it("defaults to FULL when no format is given", async () => {
    const company = await registerTestCompany(app, "pdf-format-default");
    await prisma.company.update({
      where: { id: company.companyId },
      data: { planId: PRO_PLAN_ID },
    });
    const quote = await buildQuote(company.token);

    const response = await request(app)
      .get(`/api/quotes/${quote.body.id}/pdf`)
      .set(authHeader(company.token));

    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).not.toContain("Resumido");
  });

  it("SUMMARY produces a smaller file than FULL and is named accordingly", async () => {
    const company = await registerTestCompany(app, "pdf-format-summary");
    await prisma.company.update({
      where: { id: company.companyId },
      data: { planId: PRO_PLAN_ID },
    });
    const quote = await buildQuote(company.token);

    const fullResponse = await request(app)
      .get(`/api/quotes/${quote.body.id}/pdf`)
      .query({ format: "FULL" })
      .set(authHeader(company.token));
    const summaryResponse = await request(app)
      .get(`/api/quotes/${quote.body.id}/pdf`)
      .query({ format: "SUMMARY" })
      .set(authHeader(company.token));

    expect(fullResponse.status).toBe(200);
    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.headers["content-disposition"]).toContain("Resumido");
    expect(fullResponse.headers["content-disposition"]).not.toContain("Resumido");
    // The item table (piece/material/machine/weight-time/per-item price)
    // only renders in FULL — its absence should make SUMMARY meaningfully
    // smaller, not just a few bytes off from filename length alone.
    expect(Number(summaryResponse.headers["content-length"])).toBeLessThan(
      Number(fullResponse.headers["content-length"]),
    );
  });

  it("rejects an invalid format value", async () => {
    const company = await registerTestCompany(app, "pdf-format-invalid");
    await prisma.company.update({
      where: { id: company.companyId },
      data: { planId: PRO_PLAN_ID },
    });
    const quote = await buildQuote(company.token);

    const response = await request(app)
      .get(`/api/quotes/${quote.body.id}/pdf`)
      .query({ format: "NOT_A_FORMAT" })
      .set(authHeader(company.token));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});
