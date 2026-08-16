import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { registerTestCompany } from "../test-utils/register-test-company";

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

// Same DB shortcut used elsewhere in this suite — promoting to ADMIN has no
// public endpoint. adminMiddleware re-reads role from the DB on every
// request, so the token issued at registration (still USER at the time)
// keeps working after this.
const promoteToAdmin = async (userId: string): Promise<void> => {
  await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
};

describe("GET /api/admin/system-formulas", () => {
  it("rejects a non-admin caller", async () => {
    const company = await registerTestCompany(app, "sysformula-list-non-admin");

    const response = await request(app)
      .get("/api/admin/system-formulas")
      .set(authHeader(company.token));

    expect(response.status).toBe(403);
  });

  it("lists the seeded default system formula", async () => {
    const company = await registerTestCompany(app, "sysformula-list-admin");
    await promoteToAdmin(company.userId);

    const response = await request(app)
      .get("/api/admin/system-formulas")
      .set(authHeader(company.token));

    expect(response.status).toBe(200);
    expect(
      response.body.some(
        (formula: { code: string; isDefault: boolean }) =>
          formula.code === "system_default" && formula.isDefault,
      ),
    ).toBe(true);
  });
});

describe("POST/PATCH/DELETE /api/admin/system-formulas", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates, updates and deletes a system formula as admin", async () => {
    const company = await registerTestCompany(app, "sysformula-crud");
    await promoteToAdmin(company.userId);

    const createResponse = await request(app)
      .post("/api/admin/system-formulas")
      .set(authHeader(company.token))
      .send({
        name: "Formula de teste",
        expression: "custo_base * (1 + margem_lucro)",
        isActive: true,
        isDefault: false,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.isDefault).toBe(false);
    const formulaId = createResponse.body.id as string;

    const updateResponse = await request(app)
      .patch(`/api/admin/system-formulas/${formulaId}`)
      .set(authHeader(company.token))
      .send({ name: "Formula de teste renomeada" });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.name).toBe("Formula de teste renomeada");

    const deleteResponse = await request(app)
      .delete(`/api/admin/system-formulas/${formulaId}`)
      .set(authHeader(company.token));

    expect(deleteResponse.status).toBe(204);
  });

  it("rejects an expression that references an unknown variable", async () => {
    const company = await registerTestCompany(app, "sysformula-invalid-var");
    await promoteToAdmin(company.userId);

    const response = await request(app)
      .post("/api/admin/system-formulas")
      .set(authHeader(company.token))
      .send({ name: "Invalida", expression: "custo_base * variavel_inexistente" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("FORMULA_UNKNOWN_VARIABLE");
  });

  it("moves isDefault to the newly-created formula and refuses to delete the default", async () => {
    const company = await registerTestCompany(app, "sysformula-default-move");
    await promoteToAdmin(company.userId);

    const originalDefault = await prisma.systemFormula.findFirstOrThrow({
      where: { isDefault: true },
    });

    const createResponse = await request(app)
      .post("/api/admin/system-formulas")
      .set(authHeader(company.token))
      .send({
        name: "Novo padrao temporario",
        expression: "custo_base * (1 + margem_lucro)",
        isDefault: true,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.isDefault).toBe(true);

    const previousDefault = await prisma.systemFormula.findUniqueOrThrow({
      where: { id: originalDefault.id },
    });
    expect(previousDefault.isDefault).toBe(false);

    const deleteNewDefaultResponse = await request(app)
      .delete(`/api/admin/system-formulas/${createResponse.body.id}`)
      .set(authHeader(company.token));

    expect(deleteNewDefaultResponse.status).toBe(409);
    expect(deleteNewDefaultResponse.body.code).toBe(
      "SYSTEM_FORMULA_DEFAULT_DELETE_BLOCKED",
    );

    // Restore the original default so other tests in this file (and the
    // fallback-calculation regression below) keep seeing a sane default.
    await prisma.$transaction([
      prisma.systemFormula.updateMany({ data: { isDefault: false }, where: {} }),
      prisma.systemFormula.update({
        where: { id: originalDefault.id },
        data: { isDefault: true },
      }),
      prisma.systemFormula.delete({ where: { id: createResponse.body.id } }),
    ]);
  });
});

describe("Company formula list + calculation fallback", () => {
  it("shows the global system formula as read-only in the company's formula list", async () => {
    const company = await registerTestCompany(app, "sysformula-company-list");

    const response = await request(app)
      .get("/api/formulas")
      .set(authHeader(company.token));

    expect(response.status).toBe(200);
    const systemEntry = response.body.find(
      (formula: { code: string; isSystem: boolean }) =>
        formula.code === "system_default",
    );
    expect(systemEntry).toBeDefined();
    expect(systemEntry.isSystem).toBe(true);

    // Companies can't mutate it through the company-facing routes — it has
    // no row in their own formulas table.
    const updateAttempt = await request(app)
      .put(`/api/formulas/${systemEntry.id}`)
      .set(authHeader(company.token))
      .send({ name: "Tentando editar" });
    expect(updateAttempt.status).toBeGreaterThanOrEqual(400);

    const deleteAttempt = await request(app)
      .delete(`/api/formulas/${systemEntry.id}`)
      .set(authHeader(company.token));
    expect(deleteAttempt.status).toBeGreaterThanOrEqual(400);
  });

  it("falls back to the global default formula and card/administrative fees increase (never decrease) the price", async () => {
    const company = await registerTestCompany(app, "sysformula-calc-fallback");

    const machine = await request(app)
      .post("/api/machines")
      .set(authHeader(company.token))
      .send({ name: "Fallback Printer", type: "FDM", price: 3000, powerConsumptionWatts: 120 });
    const material = await request(app)
      .post("/api/materials")
      .set(authHeader(company.token))
      .send({
        brand: "PLA Fallback",
        type: "FILAMENT",
        color: "Verde",
        totalWeightGrams: 1000,
        purchasePrice: 100,
      });

    await request(app)
      .put("/api/settings")
      .set(authHeader(company.token))
      .send({
        desiredMarginPercent: 30,
        paintingHourRate: 0,
        finishingHourRate: 0,
        errorRate: 0,
        energyCostPerKwh: 1,
        cardFeePercent: 0,
        administrativeFeePercent: 0,
      });

    const baseline = await request(app)
      .post("/api/calculate")
      .set(authHeader(company.token))
      .send({
        machineId: machine.body.id,
        materialId: material.body.id,
        weightGrams: 100,
        printTimeHours: 2,
      });
    expect(baseline.status).toBe(200);
    expect(baseline.body.formula.source).toBe("DATABASE");

    await request(app)
      .put("/api/settings")
      .set(authHeader(company.token))
      .send({
        desiredMarginPercent: 30,
        paintingHourRate: 0,
        finishingHourRate: 0,
        errorRate: 0,
        energyCostPerKwh: 1,
        cardFeePercent: 5,
        administrativeFeePercent: 2,
      });

    const withFees = await request(app)
      .post("/api/calculate")
      .set(authHeader(company.token))
      .send({
        machineId: machine.body.id,
        materialId: material.body.id,
        weightGrams: 100,
        printTimeHours: 2,
      });
    expect(withFees.status).toBe(200);

    // This is the exact regression: card/administrative fees must raise
    // the final price relative to the fee-free baseline, never lower it.
    expect(withFees.body.breakdown.finalPrice).toBeGreaterThan(
      baseline.body.breakdown.finalPrice,
    );
  });
});
