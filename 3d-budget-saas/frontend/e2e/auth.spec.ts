import { expect, test } from "@playwright/test";
import { TEST_PASSWORD, registerViaUi } from "./test-data";

test("register -> lands on dashboard -> logout -> login again", async ({ page }) => {
  const { email } = await registerViaUi(page, "auth-flow");

  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

  // The login page's field labels are "Email"/"Senha" (no exact match on
  // "Senha" — its label wrapper also contains the "Esqueci minha senha"
  // link text, so the accessible name is "Senha Esqueci minha senha").
  // Note: the register page instead labels its field "E-mail" (with a
  // hyphen) — a real i18n inconsistency between auth.login.email and
  // auth.register.email, flagged separately, not fixed here.
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
});

test("wrong password on login shows an error instead of navigating", async ({ page }) => {
  const { email } = await registerViaUi(page, "auth-wrongpass");

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Senha").fill("wrong-password-123");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText(/inv.lid|invalid/i)).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/login/);
});
