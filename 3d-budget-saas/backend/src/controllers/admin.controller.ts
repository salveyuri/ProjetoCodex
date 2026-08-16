import type {
  AdminUserResource,
  EmailTemplateKey,
  EmailTemplateResource,
  EmailTemplateTestResult,
  PlanResource,
  SystemFormulaResource,
} from "@3d-budget/shared";
import type { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { adminService } from "../services/admin.service";
import { auditLogService } from "../services/audit-log.service";
import { emailService } from "../services/email.service";
import {
  emailTemplateService,
  toEmailTemplateResource,
} from "../services/email-template.service";
import { planService, toPlanResource } from "../services/plan.service";
import {
  systemFormulaService,
  toSystemFormulaResource,
} from "../services/system-formula.service";
import { idParamSchema } from "../validators/common.validator";
import { adminUserUpdateSchema } from "../validators/admin.validator";
import {
  emailTemplateTestSchema,
  emailTemplateUpdateSchema,
} from "../validators/email-template.validator";
import { planCreateSchema, planUpdateSchema } from "../validators/plan.validator";
import {
  systemFormulaSchema,
  systemFormulaUpdateSchema,
} from "../validators/system-formula.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

// These Resource shapes are plain JSON-serializable objects, but their
// structural types (fixed named fields) don't satisfy Prisma's
// InputJsonValue index signature — this is just an audit-log payload, not
// a query.
const toAuditJson = <T>(value: T): Prisma.InputJsonValue =>
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

  async emailTemplates(
    _request: Request,
    response: Response<EmailTemplateResource[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const templates = await emailTemplateService.listAll();
      response.status(200).json(templates);
    } catch (error) {
      next(error);
    }
  }

  async updateEmailTemplate(
    request: Request,
    response: Response<EmailTemplateResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = idParamSchema.parse(request.params);
      const input = emailTemplateUpdateSchema.parse(request.body);
      const before = toEmailTemplateResource(await emailTemplateService.getById(id));
      const template = await emailTemplateService.update(id, input);
      await auditLogService.record({
        action: "ADMIN_EMAIL_TEMPLATE_UPDATED",
        entityType: "EmailTemplate",
        entityId: id,
        actorUserId: request.auth?.userId,
        before: toAuditJson(before),
        after: toAuditJson(template),
        metadata: { changedFields: Object.keys(input) },
      });
      response.status(200).json(template);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async testEmailTemplate(
    request: Request,
    response: Response<EmailTemplateTestResult>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = idParamSchema.parse(request.params);
      const { to } = emailTemplateTestSchema.parse(request.body);
      const template = await emailTemplateService.getById(id);
      const result = await emailService.sendTest(
        template.key as EmailTemplateKey,
        to,
      );
      await auditLogService.record({
        action: "ADMIN_EMAIL_TEMPLATE_TESTED",
        entityType: "EmailTemplate",
        entityId: id,
        actorUserId: request.auth?.userId,
        metadata: { to, key: template.key, result: result.status },
      });
      response.status(200).json(result);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async systemFormulas(
    _request: Request,
    response: Response<SystemFormulaResource[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const formulas = await systemFormulaService.listAll();
      response.status(200).json(formulas);
    } catch (error) {
      next(error);
    }
  }

  async createSystemFormula(
    request: Request,
    response: Response<SystemFormulaResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const input = systemFormulaSchema.parse(request.body);
      const formula = await systemFormulaService.create(input);
      await auditLogService.record({
        action: input.isDefault
          ? "ADMIN_SYSTEM_FORMULA_CREATED_AS_DEFAULT"
          : "ADMIN_SYSTEM_FORMULA_CREATED",
        entityType: "SystemFormula",
        entityId: formula.id,
        actorUserId: request.auth?.userId,
        after: toAuditJson(formula),
        metadata: { code: formula.code },
      });
      response.status(201).json(formula);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async updateSystemFormula(
    request: Request,
    response: Response<SystemFormulaResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = idParamSchema.parse(request.params);
      const input = systemFormulaUpdateSchema.parse(request.body);
      const before = toSystemFormulaResource(await systemFormulaService.getById(id));
      const formula = await systemFormulaService.update(id, input);
      await auditLogService.record({
        action:
          !before.isDefault && formula.isDefault
            ? "ADMIN_SYSTEM_FORMULA_DEFAULT_CHANGED"
            : "ADMIN_SYSTEM_FORMULA_UPDATED",
        entityType: "SystemFormula",
        entityId: id,
        actorUserId: request.auth?.userId,
        before: toAuditJson(before),
        after: toAuditJson(formula),
        metadata: { changedFields: Object.keys(input) },
      });
      response.status(200).json(formula);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async deleteSystemFormula(
    request: Request,
    response: Response<void>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = idParamSchema.parse(request.params);
      const before = toSystemFormulaResource(await systemFormulaService.getById(id));
      await systemFormulaService.delete(id);
      await auditLogService.record({
        action: "ADMIN_SYSTEM_FORMULA_DELETED",
        entityType: "SystemFormula",
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
