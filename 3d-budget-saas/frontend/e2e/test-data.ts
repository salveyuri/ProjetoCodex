import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

// Shared helper for E2E specs — every test registers its own fresh
// company (same approach as the backend integration tests'
// registerTestCompany) instead of relying on seeded fixtures, since there
// is no isolated E2E database yet (see Contextos/Ambientes.md). Emails
// are unique per run so specs never collide with each other or with a
// previous run's leftover data.
export const uniqueEmail = (label: string): string =>
  `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

export const TEST_PASSWORD = "Abcdef12";

export interface RegisteredCompany {
  email: string;
  companyName: string;
}

// Drives the real /register form (not an API shortcut) — this is the one
// piece of setup every E2E spec needs, so it's worth going through the
// actual UI once here rather than an API call, while keeping every other
// spec free to focus on its own flow.
export const registerViaUi = async (
  page: Page,
  label: string,
): Promise<RegisteredCompany> => {
  const email = uniqueEmail(label);
  const companyName = `E2E ${label} Co`;

  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Ada ${label}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Nome da empresa").fill(companyName);
  await page.getByLabel("Senha", { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel("Confirmar senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  return { email, companyName };
};
