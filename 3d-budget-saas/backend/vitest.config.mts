import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Default pool ("forks") intermittently crashed a worker on Windows
    // when the integration tests load Prisma's native query engine binary
    // in a freshly spawned child process (~1 in 4 runs) — same family of
    // issue as the documented "EPERM DLL locked" Prisma quirk in
    // Contextos/Conhecimento.md. Threads share one process/module cache
    // instead, which avoided it across a dozen repeated runs.
    pool: "threads",
    // Multiple test files independently `vi.spyOn(resendClient, "send")` —
    // resendClient is a real module-level singleton, and with threads
    // sharing one process/module cache (see above), two DIFFERENT test
    // files running in parallel can end up pointed at the very same spy
    // instance: a call meant for one file's assertion gets recorded
    // against another file's, intermittently failing an unrelated
    // "toHaveBeenCalledTimes(1)" check. Found while adding
    // resend-webhook.routes.test.ts / email-log.routes.test.ts (2026-08-20)
    // — more files touching resendClient.send raised the odds of hitting
    // this enough to reproduce reliably. Forcing files to run one at a
    // time removes the race; the suite already isn't optimized for raw
    // speed (integration tests hit a real shared Postgres).
    fileParallelism: false,
    // Integration tests simulate many different "companies" registering
    // from many different IPs (via X-Forwarded-For in test-utils/
    // register-test-company.ts) to avoid tripping the real
    // registerRateLimiter — that only works if the app trusts the
    // forwarded header, same as it would behind a real reverse proxy.
    env: {
      TRUST_PROXY_HOPS: "1",
      // Test-only secret (never used against the real Resend API) — lets
      // webhook.controller.resend.test.ts sign payloads with svix's own
      // Webhook.sign() and verify the controller accepts/rejects them
      // correctly.
      RESEND_WEBHOOK_SECRET: "whsec_gT+JQmKpl+MoHiKOOTiZ5vqECsXIjjIy",
    },
  },
});
