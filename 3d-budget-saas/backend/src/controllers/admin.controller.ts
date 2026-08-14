import type { AdminUserResource, PlanResource } from "@3d-budget/shared";
import type { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { adminService } from "../services/admin.service";
import { auditLogService } from "../services/audit-log.service";
import { planService, toPlanResource } from "../services/plan.service";
import { idParamSchema } from "../validators/common.validator";
import { adminUserUpdateSchema } from "../validators/admin.validator";
import { planCreateSchema, planUpdateSchema } from "../validators/plan.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

// PlanResource is a plain JSON-serializable shape, but its structural type
// (fixed named fields) doesn't satisfy Prisma's InputJsonValue index
// signature — this is just an audit-log payload, not a query.
const toAuditJson = (value: PlanResource): Prisma.InputJsonValue =>
  value as unknown as Prisma.InputJsonValue;

export class AdminController {
  async users(
    _request: Request,
    response: Response<AdminUserResource[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const users = await adminService.listUsers();
      response.status(200).json(users);
    } catch (error) {
      next(error);
    }
  }

  async updateUser(
    request: Request,
    response: Response<AdminUserResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = idParamSchema.parse(request.params);
      const input = adminUserUpdateSchema.parse(request.body);
      const user = await adminService.updateUser(
        id,
        input,
        request.auth?.userId ?? "",
      );
      response.status(200).json(user);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async plans(
    _request: Request,
    response: Response<PlanResource[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const plans = await planService.listAll();
      response.status(200).json(plans);
    } catch (error) {
      next(error);
    }
  }

  async createPlan(
    request: Request,
    response: Response<PlanResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const input = planCreateSchema.parse(request.body);
      const plan = await planService.create(input);
      await auditLogService.record({
        action: "ADMIN_PLAN_CREATED",
        entityType: "Plan",
        entityId: plan.id,
        actorUserId: request.auth?.userId,
        after: toAuditJson(plan),
        metadata: { code: plan.code },
      });
      response.status(201).json(plan);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async updatePlan(
    request: Request,
    response: Response<PlanResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = idParamSchema.parse(request.params);
      const input = planUpdateSchema.parse(request.body);
      const before = toPlanResource(await planService.getById(id));
      const plan = await planService.update(id, input);
      await auditLogService.record({
        action: "ADMIN_PLAN_UPDATED",
        entityType: "Plan",
        entityId: id,
        actorUserId: request.auth?.userId,
        before: toAuditJson(before),
        after: toAuditJson(plan),
        metadata: { changedFields: Object.keys(input) },
      });
      response.status(200).json(plan);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async deletePlan(
    request: Request,
    response: Response<void>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = idParamSchema.parse(request.params);
      const before = toPlanResource(await planService.getById(id));
      await planService.remove(id);
      await auditLogService.record({
        action: "ADMIN_PLAN_DELETED",
        entityType: "Plan",
        entityId: id,
        actorUserId: request.auth?.userId,
        before: toAuditJson(before),
        metadata: { code: before.code },
      });
      response.status(204).send();
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }
}

export const adminController = new AdminController();
