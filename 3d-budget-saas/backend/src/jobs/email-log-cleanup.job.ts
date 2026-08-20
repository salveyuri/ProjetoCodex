import cron from "node-cron";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";

// Only rows written by the "Testar e-mail" button (EmailLog.isTest) age
// out — real triggered sends (account created, password reset,
// subscription events, quote summary) are never auto-deleted, no matter
// how old.
const TEST_LOG_RETENTION_HOURS = 48;
const MS_PER_HOUR = 60 * 60 * 1000;

// Exported so it can also be triggered manually (ops/debugging) or driven
// directly from a test, instead of only ever firing from the cron schedule.
export const runEmailLogCleanup = async (): Promise<void> => {
  const cutoff = new Date(Date.now() - TEST_LOG_RETENTION_HOURS * MS_PER_HOUR);

  const result = await prisma.emailLog.deleteMany({
    where: { isTest: true, createdAt: { lt: cutoff } },
  });

  if (result.count > 0) {
    logger.info(
      { deleted: result.count, cutoff },
      "Email log cleanup: deleted expired test rows",
    );
  }
};

export const startEmailLogCleanupJob = (): void => {
  cron.schedule(
    "0 3 * * *",
    () => {
      runEmailLogCleanup().catch((error) => {
        logger.error({ err: error }, "Email log cleanup job failed");
      });
    },
    { timezone: "America/Sao_Paulo" },
  );
};
