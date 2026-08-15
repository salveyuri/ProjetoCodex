import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { app } from "./app";
import { startSubscriptionExpiringJob } from "./jobs/subscription-expiring.job";

const server = app.listen(env.port, () => {
  console.log(`3D Budget API running on http://localhost:${env.port}`);
});

startSubscriptionExpiringJob();

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  console.log(`${signal} received. Closing API server.`);

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
