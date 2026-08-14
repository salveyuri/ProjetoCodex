import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { registerTestCompany } from "../test-utils/register-test-company";

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

// FREE plan limits, per BillingService.PLAN_DEFINITIONS
// (backend/src/services/billing.service.ts).
const FREE_MAX_MACHINES = 2;

describe("FREE plan — usage limits", () => {
  it("allows machines up to the FREE limit and blocks the next one", async () => {
    const company = await registerTestCompany(app, "plan-machines");

    for (let index = 0; index < FREE_MAX_MACHINES; index += 1) {
      const response = await request(app)
        .post("/api/machines")
        .set(authHeader(company.token))
        .send({
          name: `Machine ${index + 1}`,
          type: "FDM",
          price: 3000,
          powerConsumptionWatts: 120,
        });

      expect(response.status).toBe(201);
    }

    const overLimit = await request(app)
      .post("/api/machines")
      .set(authHeader(company.token))
      .send({
        name: "One too many",
        type: "FDM",
        price: 3000,
        powerConsumptionWatts: 120,
      });

    expect(overLimit.status).toBe(403);
    expect(overLimit.body.code).toBe("PLAN_LIMIT_REACHED");
  });

  it("blocks PDF export as a paid-only feature", async () => {
    const company = await registerTestCompany(app, "plan-pdf");
    const machine = await request(app)
      .post("/api/machines")
      .set(authHeader(company.token))
      .send({
        name: "Ender 3",
        type: "FDM",
        price: 3000,
        powerConsumptionWatts: 120,
      });
    const material = await request(app)
      .post("/api/materials")
      .set(authHeader(company.token))
      .send({
        brand: "PLA X",
        type: "FILAMENT",
        color: "Preto",
        totalWeightGrams: 1000,
        purchasePrice: 100,
      });
    const quote = await request(app)
      .post("/api/quotes")
      .set(authHeader(company.token))
      .send({
        customerName: "Cliente",
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

    const pdfResponse = await request(app)
      .get(`/api/quotes/${quote.body.id}/pdf`)
      .set(authHeader(company.token));

    expect(pdfResponse.status).toBe(403);
    expect(pdfResponse.body.code).toBe("PLAN_FEATURE_UNAVAILABLE");
  });

  it("does not enforce usage limits for ADMIN users", async () => {
    const company = await registerTestCompany(app, "plan-admin-bypass");

    // Promoting to ADMIN has no public endpoint (admin.service.ts is only
    // reachable by an existing admin) — going straight to the DB here is
    // the same shortcut the manual Bloco 11 smoke test used.
    await prisma.user.update({
      where: { id: company.userId },
      data: { role: "ADMIN" },
    });

    for (let index = 0; index < FREE_MAX_MACHINES; index += 1) {
      await request(app)
        .post("/api/machines")
        .set(authHeader(company.token))
        .send({
          name: `Machine ${index + 1}`,
          type: "FDM",
          price: 3000,
          powerConsumptionWatts: 120,
        });
    }

    const overLimitAsAdmin = await request(app)
      .post("/api/machines")
      .set(authHeader(company.token))
      .send({
        name: "One too many, but admin",
        type: "FDM",
        price: 3000,
        powerConsumptionWatts: 120,
      });

    expect(overLimitAsAdmin.status).toBe(201);
  });
});
