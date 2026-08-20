import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../config/prisma";
import { runEmailLogCleanup } from "./email-log-cleanup.job";

const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 60 * 60 * 1000);

const createLog = (overrides: {
  isTest: boolean;
  createdAt: Date;
  toEmail: string;
}) =>
  prisma.emailLog.create({
    data: {
      templateKey: "ACCOUNT_CREATED",
      toEmail: overrides.toEmail,
      subject: "Test subject",
      status: "SENT",
      isTest: overrides.isTest,
      createdAt: overrides.createdAt,
    },
  });

describe("runEmailLogCleanup", () => {
  it("deletes only test rows older than 48h, leaving recent test rows and all real rows untouched", async () => {
    const suffix = randomUUID();

    const oldTest = await createLog({
      isTest: true,
      createdAt: hoursAgo(49),
      toEmail: `old-test-${suffix}@example.com`,
    });
    const recentTest = await createLog({
      isTest: true,
      createdAt: hoursAgo(1),
      toEmail: `recent-test-${suffix}@example.com`,
    });
    const oldReal = await createLog({
      isTest: false,
      createdAt: hoursAgo(1000),
      toEmail: `old-real-${suffix}@example.com`,
    });

    await runEmailLogCleanup();

    const [foundOldTest, foundRecentTest, foundOldReal] = await Promise.all([
      prisma.emailLog.findUnique({ where: { id: oldTest.id } }),
      prisma.emailLog.findUnique({ where: { id: recentTest.id } }),
      prisma.emailLog.findUnique({ where: { id: oldReal.id } }),
    ]);

    expect(foundOldTest).toBeNull();
    expect(foundRecentTest).not.toBeNull();
    expect(foundOldReal).not.toBeNull();

    // Clean up the rows this test itself left behind (real rows are never
    // auto-deleted by the job, so they'd otherwise accumulate forever).
    await prisma.emailLog.deleteMany({
      where: { id: { in: [recentTest.id, oldReal.id] } },
    });
  });
});
