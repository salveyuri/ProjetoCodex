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
    // Integration tests simulate many different "companies" registering
    // from many different IPs (via X-Forwarded-For in test-utils/
    // register-test-company.ts) to avoid tripping the real
    // registerRateLimiter — that only works if the app trusts the
    // forwarded header, same as it would behind a real reverse proxy.
    env: {
      TRUST_PROXY_HOPS: "1",
    },
  },
});
