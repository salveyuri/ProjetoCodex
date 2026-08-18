import { defineConfig, devices } from "@playwright/test";

// E2E suite against the real dev stack (frontend :3000 + backend :3001),
// same Postgres the backend integration tests use — no isolated test DB
// yet (see Contextos/Ambientes.md). No CI wiring yet either: run locally
// with `npm run test:e2e` from frontend/, after `npm run dev` is already
// running in both backend/ and frontend/ (or let Playwright start them —
// see webServer below, reuseExistingServer means it attaches instead of
// erroring if they're already up).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // The app auto-detects UI language from navigator.language on first
    // load (see LanguageContext.tsx's detectBrowserLanguage) — Playwright
    // defaults to en-US, which would silently flip every spec's copy to
    // English. Pin pt-BR so specs match this project's actual default
    // audience and their locators stay stable.
    locale: "pt-BR",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../backend",
      url: "http://localhost:3001/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm run dev",
      cwd: ".",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
