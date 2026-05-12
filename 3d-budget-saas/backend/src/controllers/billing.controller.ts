import type {
  BillingOverview,
  BillingPlanChangeResponse,
} from "@3d-budget/shared";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { auditLogService } from "../services/audit-log.service";
import { billingService } from "../services/billing.service";
import { paymentService } from "../services/payment.service";
import { getAuthenticatedCompanyId } from "../utils/request-auth";
import { billingPlanChangeSchema } from "../validators/billing.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

export class BillingController {
  async current(
    request: Request,
    response: Response<BillingOverview>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const billing = await billingService.getOverview(companyId);
      response.status(200).json(billing);
    } catch (error) {
      next(error);
    }
  }

  async upgrade(
    request: Request,
    response: Response<BillingPlanChangeResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = billingPlanChangeSchema.parse(request.body);
      const before = await billingService.getOverview(companyId);
      const payment = await paymentService.checkout({
        companyId,
        planType: input.planType,
      });
      const billing = await billingService.applyPlan(
        companyId,
        input.planType as SubscriptionPlan,
        SubscriptionStatus.ACTIVE,
      );
      await auditLogService.record({
        action: "BILLING_UPGRADED",
        entityType: "Company",
        entityId: companyId,
        actorUserId: request.auth?.userId,
        companyId,
        before: {
          planType: before.planType,
          subscriptionStatus: before.subscriptionStatus,
        },
        after: {
          planType: billing.planType,
          subscriptionStatus: billing.subscriptionStatus,
        },
        metadata: {
          payment: {
            provider: payment.provider,
            status: payment.status,
            transactionId: payment.transactionId,
            planType: payment.planType,
          },
        },
      });

      response.status(200).json({ billing, payment });
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async cancel(
    request: Request,
    response: Response<BillingOverview>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const before = await billingService.getOverview(companyId);
      const billing = await billingService.applyPlan(
        companyId,
        SubscriptionPlan.FREE,
        SubscriptionStatus.CANCELED,
      );
      await auditLogService.record({
        action: "BILLING_CANCELED",
        entityType: "Company",
        entityId: companyId,
        actorUserId: request.auth?.userId,
        companyId,
        before: {
          planType: before.planType,
          subscriptionStatus: before.subscriptionStatus,
        },
        after: {
          planType: billing.planType,
          subscriptionStatus: billing.subscriptionStatus,
        },
      });

      response.status(200).json(billing);
    } catch (error) {
      next(error);
    }
  }
}

export const billingController = new BillingController();
