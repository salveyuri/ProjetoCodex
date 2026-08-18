import { expect, test } from "@playwright/test";
import { registerViaUi } from "./test-data";

test("register -> create machine + material -> create a quote -> shows up in the list", async ({
  page,
}) => {
  await registerViaUi(page, "quote-flow");
  const customerName = `Cliente E2E ${Date.now()}`;

  // A fresh company starts with zero machines/materials — the quote form
  // gates print items behind having at least one of each (see
  // "quotes.configureProductionTitle" in QuoteForm.tsx), so both need to
  // exist before a quote can be created.
  await page.goto("/dashboard/settings");

  await page.getByRole("button", { name: "Nova Maquina" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("E2E Printer");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Maquina salva.")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Materiais" }).click();
  await page.getByRole("button", { name: "Novo Material" }).click();
  await page.getByLabel("Nome/Marca").fill("E2EMat");
  await page.getByLabel("Cor").fill("Azul");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Material salvo.")).toBeVisible({ timeout: 10_000 });

  await page.goto("/dashboard/quotes/new");

  await page.getByLabel("Cliente").fill(customerName);
  await page.getByLabel("Nome da peca").fill("Peca E2E");
  await page.getByLabel("Maquina").selectOption({ label: "E2E Printer - FDM" });
  await page.getByLabel("Material").selectOption({ label: "E2EMat - Azul" });
  await page.getByLabel("Peso").fill("150");
  await page.getByLabel("Tempo").fill("3");

  // The preview recalculates on a debounce as fields change — wait for a
  // real value (not "--") before submitting, otherwise the click can race
  // a still-in-flight /quotes/preview call.
  await expect(page.getByText("R$", { exact: false }).first()).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "Criar orcamento" }).click();

  await expect(page).toHaveURL(/\/dashboard\/quotes$/, { timeout: 15_000 });
  await expect(page.getByText(customerName)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Peca E2E")).toBeVisible();
});
