import { describe, expect, it } from "vitest";
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

const samplePayload = (overrides: Partial<Record<string, unknown>> = {}) => ({
  brand: "TestBrand",
  name: `Test Model ${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: "FDM",
  price: 2500,
  powerConsumptionWatts: 150,
  printVolumeXmm: 220,
  printVolumeYmm: 220,
  printVolumeZmm: 250,
  depreciationCostPerHour: 1.5,
  maintenanceCostPerHour: 0.5,
  ...overrides,
});

describe("GET /api/admin/machine-catalog", () => {
  it("rejects a non-admin caller", async () => {
    const company = await registerTestCompany(app, "catalog-list-non-admin");

    const response = await request(app)
      .get("/api/admin/machine-catalog")
      .set(authHeader(company.token));

    expect(response.status).toBe(403);
  });

  it("lists catalog entries for an admin", async () => {
    const company = await registerTestCompany(app, "catalog-list-admin");
    await promoteToAdmin(company.userId);

    const response = await request(app)
      .get("/api/admin/machine-catalog")
      .set(authHeader(company.token));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

describe("POST/PATCH/DELETE /api/admin/machine-catalog", () => {
  it("creates, updates and deletes a catalog entry as admin", async () => {
    const company = await registerTestCompany(app, "catalog-crud");
    await promoteToAdmin(company.userId);

    const createResponse = await request(app)
      .post("/api/admin/machine-catalog")
      .set(authHeader(company.token))
      .send(samplePayload());

    expect(createResponse.status).toBe(201);
    const catalogId = createResponse.body.id as string;

    const updateResponse = await request(app)
      .patch(`/api/admin/machine-catalog/${catalogId}`)
      .set(authHeader(company.token))
      .send({ price: 2999 });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.price).toBe(2999);

    const deleteResponse = await request(app)
      .delete(`/api/admin/machine-catalog/${catalogId}`)
      .set(authHeader(company.token));

    expect(deleteResponse.status).toBe(204);

    const getAfterDelete = await request(app)
      .patch(`/api/admin/machine-catalog/${catalogId}`)
      .set(authHeader(company.token))
      .send({ price: 1 });
    expect(getAfterDelete.status).toBe(404);
  });

  it("rejects a duplicate brand+name pair with a conflict", async () => {
    const company = await registerTestCompany(app, "catalog-conflict");
    await promoteToAdmin(company.userId);

    const payload = samplePayload({ brand: "DuplicateBrand", name: "DuplicateModel" });

    const first = await request(app)
      .post("/api/admin/machine-catalog")
      .set(authHeader(company.token))
      .send(payload);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/admin/machine-catalog")
      .set(authHeader(company.token))
      .send(payload);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("MACHINE_CATALOG_CONFLICT");

    await prisma.machineCatalog.delete({ where: { id: first.body.id } });
  });
});

describe("POST /api/admin/machine-catalog/import", () => {
  it("upserts by brand+name and reports per-row errors without failing the whole batch", async () => {
    const company = await registerTestCompany(app, "catalog-import");
    await promoteToAdmin(company.userId);

    const existing = await request(app)
      .post("/api/admin/machine-catalog")
      .set(authHeader(company.token))
      .send(samplePayload({ brand: "ImportBrand", name: "ExistingModel", price: 1000 }));
    expect(existing.status).toBe(201);

    const importResponse = await request(app)
      .post("/api/admin/machine-catalog/import")
      .set(authHeader(company.token))
      .send({
        rows: [
          // Updates the row created above (same brand+name).
          samplePayload({ brand: "ImportBrand", name: "ExistingModel", price: 1234 }),
          // Creates a brand-new row.
          samplePayload({ brand: "ImportBrand", name: "NewModel" }),
          // Invalid row (negative price) — caught per-row inside
          // importRows(), reported as an error, must not abort the rest
          // of the batch.
          { ...samplePayload({ brand: "ImportBrand", name: "BadModel" }), price: -5 },
        ],
      });

    expect(importResponse.status).toBe(200);
    expect(importResponse.body.created).toBe(1);
    expect(importResponse.body.updated).toBe(1);
    expect(importResponse.body.errors).toHaveLength(1);
    expect(importResponse.body.errors[0]).toMatchObject({
      row: 3,
      brand: "ImportBrand",
      name: "BadModel",
    });

    const updatedRow = await prisma.machineCatalog.findUniqueOrThrow({
      where: { brand_name: { brand: "ImportBrand", name: "ExistingModel" } },
    });
    expect(Number(updatedRow.price)).toBe(1234);

    const badRow = await prisma.machineCatalog.findUnique({
      where: { brand_name: { brand: "ImportBrand", name: "BadModel" } },
    });
    expect(badRow).toBeNull();

    await prisma.machineCatalog.deleteMany({ where: { brand: "ImportBrand" } });
  });

  it("rejects a non-admin caller", async () => {
    const company = await registerTestCompany(app, "catalog-import-non-admin");

    const response = await request(app)
      .post("/api/admin/machine-catalog/import")
      .set(authHeader(company.token))
      .send({ rows: [samplePayload()] });

    expect(response.status).toBe(403);
  });
});
