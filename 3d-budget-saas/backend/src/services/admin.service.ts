import type { AdminUserResource } from "@3d-budget/shared";
import { SubscriptionStatus, UserRole } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import type { AdminUserUpdateInput } from "../validators/admin.validator";
import { auditLogService } from "./audit-log.service";
import { billingService } from "./billing.service";

const toAdminUserResource = async (user: {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  company: {
    id: string;
    name: string;
    subscriptionStatus: SubscriptionStatus;
    asaasCustomerId: string | null;
    plan: { id: string; name: string };
  } | null;
}): Promise<AdminUserResource> => ({
  id: user.id,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
  company: user.company
    ? {
        id: user.company.id,
        name: user.company.name,
        planId: user.company.plan.id,
        planName: user.company.plan.name,
        subscriptionStatus: user.company.subscriptionStatus,
        asaasCustomerId: user.company.asaasCustomerId,
        usage: await billingService.getUsageSnapshot(user.company.id),
      }
    : null,
});

const userInclude = {
  company: {
    select: {
      id: true,
      name: true,
      subscriptionStatus: true,
      asaasCustomerId: true,
      plan: { select: { id: true, name: true } },
    },
  },
};

export class AdminService {
  async listUsers(): Promise<AdminUserResource[]> {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: userInclude,
    });

    return Promise.all(users.map(toAdminUserResource));
  }

  async updateUser(
    targetUserId: string,
    input: AdminUserUpdateInput,
    actingUserId: string,
  ): Promise<AdminUserResource> {
    const existing = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: userInclude,
    });

    if (!existing) {
      throw new AppError("User not found.", 404, "USER_NOT_FOUND");
    }

    if (targetUserId === actingUserId && input.isActive === false) {
      throw new AppError(
        "Admins cannot deactivate their own account.",
        409,
        "SELF_DEACTIVATION_BLOCKED",
      );
    }

    if (input.role !== undefined || input.isActive !== undefined) {
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          role: input.role,
          isActive: input.isActive,
        },
      });
    }

    if (
      existing.company &&
      (input.planId !== undefined || input.subscriptionStatus !== undefined)
    ) {
      if (input.planId !== undefined) {
        const plan = await prisma.plan.findUnique({
          where: { id: input.planId },
        });

        if (!plan) {
          throw new AppError("Plan not found.", 404, "PLAN_NOT_FOUND");
        }
      }

      await billingService.updateSubscription(existing.company.id, {
        planId: input.planId,
        subscriptionStatus: input.subscriptionStatus,
      });
    }

    const updated = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: userInclude,
    });

    if (!updated) {
      throw new AppError("User not found.", 404, "USER_NOT_FOUND");
    }

    await auditLogService.record({
      action: "ADMIN_USER_UPDATED",
      entityType: "User",
      entityId: targetUserId,
      actorUserId: actingUserId,
      targetUserId,
      companyId: updated.company?.id ?? null,
      before: {
        role: existing.role,
        isActive: existing.isActive,
        planId: existing.company?.plan.id ?? null,
        subscriptionStatus: existing.company?.subscriptionStatus ?? null,
      },
      after: {
        role: updated.role,
        isActive: updated.isActive,
        planId: updated.company?.plan.id ?? null,
        subscriptionStatus: updated.company?.subscriptionStatus ?? null,
      },
      metadata: {
        changedFields: Object.keys(input),
        targetEmail: updated.email,
      },
    });

    return toAdminUserResource(updated);
  }
}

export const adminService = new AdminService();
