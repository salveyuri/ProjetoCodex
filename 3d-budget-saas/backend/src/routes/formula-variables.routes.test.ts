import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { registerTestCompany } from "../test-utils/register-test-company";

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("GET /api/formulas/variables — language", () => {
  it("returns pt-BR descriptions by default", async () => {
    const company = await registerTestCompany(app, "formula-vars-pt");

    const response = await request(app)
      .get("/api/formulas/variables")
      .set(authHeader(company.token));

    expect(response.status).toBe(200);
    const peso = response.body.find((variable: { name: string }) => variable.name === "peso");
    expect(peso.description).toBe(
      "Soma do peso de todas as mesas do orcamento, em gramas.",
    );
  });

  it("returns English descriptions once the user switches language", async () => {
    const company = await registerTestCompany(app, "formula-vars-en");

    await request(app)
      .patch("/api/auth/me")
      .set(authHeader(company.token))
      .send({ language: "en" });

    const response = await request(app)
      .get("/api/formulas/variables")
      .set(authHeader(company.token));

    expect(response.status).toBe(200);
    const peso = response.body.find((variable: { name: string }) => variable.name === "peso");
    expect(peso.description).toBe(
      "Sum of the weight of every table in the quote, in grams.",
    );
    // Every variable name/label stays the parser identifier (untranslated
    // on purpose — it has to match what's typeable in an expression) - only
    // the human-readable description changes with language.
    expect(peso.name).toBe("peso");
  });
});
