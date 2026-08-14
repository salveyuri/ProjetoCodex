import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { registerTestCompany } from "../test-utils/register-test-company";

/**
 * Regression coverage for the anti-IDOR pattern used everywhere in this
 * codebase: every mutation/read of a company-owned resource filters by
 * `{ id, companyId }`, so a resource ID from another tenant should always
 * come back as 403, never 200 (and never a silent 404 that could be used
 * to distinguish "doesn't exist" from "exists but isn't yours").
 */

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("machines — cross-tenant access", () => {
  it("blocks another company from reading, updating or deleting a machine", async () => {
    const companyA = await registerTestCompany(app, "mt-machine-a");
    const companyB = await registerTestCompany(app, "mt-machine-b");

    const createResponse = await request(app)
      .post("/api/machines")
      .set(authHeader(companyA.token))
      .send({
        name: "Machine A",
        type: "FDM",
        price: 3000,
        powerConsumptionWatts: 120,
      });

    expect(createResponse.status).toBe(201);
    const machineId = createResponse.body.id as string;

    const listAsB = await request(app)
      .get("/api/machines")
      .set(authHeader(companyB.token));

    expect(listAsB.status).toBe(200);
    expect(listAsB.body.find((machine: { id: string }) => machine.id === machineId)).toBeUndefined();

    const updateAsB = await request(app)
      .put(`/api/machines/${machineId}`)
      .set(authHeader(companyB.token))
      .send({ name: "Hijacked" });

    expect(updateAsB.status).toBe(403);
    expect(updateAsB.body.code).toBe("MACHINE_FORBIDDEN");

    const deleteAsB = await request(app)
      .delete(`/api/machines/${machineId}`)
      .set(authHeader(companyB.token));

    expect(deleteAsB.status).toBe(403);
    expect(deleteAsB.body.code).toBe("MACHINE_FORBIDDEN");

    const stillThereForA = await request(app)
      .get("/api/machines")
      .set(authHeader(companyA.token));

    expect(
      stillThereForA.body.find((machine: { id: string }) => machine.id === machineId),
    ).toBeDefined();
  });
});

describe("quotes — cross-tenant access", () => {
  const createMachineAndMaterial = async (token: string) => {
    const machine = await request(app)
      .post("/api/machines")
      .set(authHeader(token))
      .send({
        name: "Ender 3",
        type: "FDM",
        price: 3000,
        powerConsumptionWatts: 120,
      });
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

    return { machineId: machine.body.id as string, materialId: material.body.id as string };
  };

  it("blocks another company from reading, updating or deleting a quote", async () => {
    const companyA = await registerTestCompany(app, "mt-quote-a");
    const companyB = await registerTestCompany(app, "mt-quote-b");
    const { machineId, materialId } = await createMachineAndMaterial(companyA.token);

    const createQuote = await request(app)
      .post("/api/quotes")
      .set(authHeader(companyA.token))
      .send({
        customerName: "Cliente A",
        items: [
          {
            modelName: "Peca A",
            weightGrams: 100,
            printTimeHours: 2,
            machineId,
            materialId,
          },
        ],
      });

    expect(createQuote.status).toBe(201);
    const quoteId = createQuote.body.id as string;

    const showAsB = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set(authHeader(companyB.token));
    expect(showAsB.status).toBe(403);
    expect(showAsB.body.code).toBe("QUOTE_FORBIDDEN");

    const updateAsB = await request(app)
      .patch(`/api/quotes/${quoteId}`)
      .set(authHeader(companyB.token))
      .send({ customerName: "Sequestrado" });
    expect(updateAsB.status).toBe(403);
    expect(updateAsB.body.code).toBe("QUOTE_FORBIDDEN");

    const deleteAsB = await request(app)
      .delete(`/api/quotes/${quoteId}`)
      .set(authHeader(companyB.token));
    expect(deleteAsB.status).toBe(403);
    expect(deleteAsB.body.code).toBe("QUOTE_FORBIDDEN");

    const showAsA = await request(app)
      .get(`/api/quotes/${quoteId}`)
      .set(authHeader(companyA.token));
    expect(showAsA.status).toBe(200);
    expect(showAsA.body.customerName).toBe("Cliente A");
  });

  it("blocks calculating with another company's machine or material", async () => {
    const companyA = await registerTestCompany(app, "mt-calc-a");
    const companyB = await registerTestCompany(app, "mt-calc-b");
    const { machineId, materialId } = await createMachineAndMaterial(companyA.token);

    const response = await request(app)
      .post("/api/calculate")
      .set(authHeader(companyB.token))
      .send({ weightGrams: 100, printTimeHours: 2, machineId, materialId });

    expect(response.status).toBe(403);
    expect(["MACHINE_FORBIDDEN", "MATERIAL_FORBIDDEN"]).toContain(response.body.code);
  });
});
