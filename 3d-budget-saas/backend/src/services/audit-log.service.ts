import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { cacheService } from "./cache.service";

interface AuditLogInput {
  action: string;
  entityType: string;
  actorUserId?: string | null;
  companyId?: string | null;
  targetUserId?: string | null;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

export class AuditLogService {
  async record(input: AuditLogInput): Promise<void> {
    try {
      const actor = input.actorUserId
        ? await prisma.user.findUnique({
            where: { id: input.actorUserId },
            select: { email: true },
          })
        : null;

      await prisma.auditLog.create({
        data: {
          action: input.action,
          entityType: input.entityType,
          actorUserId: input.actorUserId ?? null,
          actorEmail: actor?.email ?? null,
          companyId: input.companyId ?? null,
          targetUserId: input.targetUserId ?? null,
          entityId: input.entityId ?? null,
          before: input.before ?? undefined,
          after: input.after ?? undefined,
          metadata: input.metadata ?? {},
        },
      });
      cacheService.del("admin-analytics:global");
    } catch (error) {
      logger.warn({ error, action: input.action }, "Audit log write failed");
    }
  }
}

export const auditLogService = new AuditLogService();
