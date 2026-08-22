import type {
  BillingOverview,
  CheckoutResponse,
  CouponPreviewResponse,
  PaymentResource,
} from "@3d-budget/shared";
import { SubscriptionStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { asaasService } from "../services/asaas.service";
import { auditLogService } from "../services/audit-log.service";
import { billingService } from "../services/billing.service";
import { couponService } from "../services/coupon.service";
import { planService } from "../services/plan.service";
import { getAuthenticatedCompanyId } from "../utils/request-auth";
import {
  checkoutRequestSchema,
  couponCodeParamSchema,
} from "../validators/billing.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

const toPaymentResource = (payment: {
  id: string;
  status: string;
  billingType: string | null;
  value: { toNumber: () => number };
  dueDate: Date | null;
  paymentDate: Date | null;
  invoiceUrl: string | null;
  createdAt: Date;
}): PaymentResource => ({
  id: payment.id,
  status: payment.status,
  billingType: payment.billingType,
  value: payment.value.toNumber(),
  dueDate: payment.dueDate ? payment.dueDate.toISOString() : null,
  paymentDate: payment.paymentDate ? payment.paymentDate.toISOString() : null,
  invoiceUrl: payment.invoiceUrl,
  createdAt: payment.createdAt.toISOString(),
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

  // Free plan: applied immediately, nothing to pay. Paid plan: creates a
  // Checkout row and an Asaas hosted-checkout session; the frontend
  // redirects the browser to `checkoutUrl` and the plan only activates once
  // the Asaas webhook confirms payment (see webhook.controller.ts) — never
  // here, since Checkout Asaas confirms asynchronously.
  async checkout(
    request: Request,
    response: Response<CheckoutResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = checkoutRequestSchema.parse(request.body);
      const plan = await planService.getById(input.planId);

      if (!plan.isActive) {
        throw new AppError("This plan is not available.", 404, "PLAN_NOT_FOUND");
      }

      if (plan.price.isZero()) {
        const before = await billingService.getOverview(companyId);
        const company = await prisma.company.findUniqueOrThrow({
          where: { id: companyId },
        });
        await asaasService.cancelSubscription(company.asaasSubscriptionId);
        const billing = await billingService.applyPlan(
          companyId,
          plan.id,
          SubscriptionStatus.ACTIVE,
        );

        await auditLogService.record({
          action: "BILLING_PLAN_CHANGED",
          entityType: "Company",
          entityId: companyId,
          actorUserId: request.auth?.userId,
          companyId,
          before: {
            planCode: before.plan.code,
            subscriptionStatus: before.subscriptionStatus,
          },
          after: {
            planCode: billing.plan.code,
            subscriptionStatus: billing.subscriptionStatus,
          },
        });

        response.status(200).json({
          checkoutUrl: null,
          checkoutId: null,
          billing,
        });
        return;
      }

      // Re-validated here even if the frontend already called the preview
      // endpoint (GET /billing/coupons/:code) — a code accepted a moment
      // ago could have been deactivated since, and this is the value that
      // actually gets charged, every renewal, from now on.
      const coupon = input.couponCode
        ? await couponService.validateActiveByCode(input.couponCode)
        : null;
      const overridePrice = coupon
        ? couponService.discountedPrice(plan.price, coupon).toNumber()
        : undefined;

      const checkout = await prisma.checkout.create({
        data: { companyId, planId: plan.id, couponId: coupon?.id },
      });

      const { checkoutUrl, asaasCheckoutId } =
        await asaasService.createSubscriptionCheckout({
          checkoutId: checkout.id,
          plan,
          overridePrice,
        });

      await prisma.checkout.update({
        where: { id: checkout.id },
        data: { asaasCheckoutId },
      });

      response.status(200).json({
        checkoutUrl,
        checkoutId: checkout.id,
        billing: null,
      });
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
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
      });
      await asaasService.cancelSubscription(company.asaasSubscriptionId);
      const freePlan = await planService.getFreePlan();
      const billing = await billingService.applyPlan(
        companyId,
        freePlan.id,
        SubscriptionStatus.CANCELED,
      );

      await auditLogService.record({
        action: "BILLING_CANCELED",
        entityType: "Company",
        entityId: companyId,
        actorUserId: request.auth?.userId,
        companyId,
        before: {
          planCode: before.plan.code,
          subscriptionStatus: before.subscriptionStatus,
        },
        after: {
          planCode: billing.plan.code,
          subscriptionStatus: billing.subscriptionStatus,
        },
      });

      response.status(200).json(billing);
    } catch (error) {
      next(error);
    }
  }

  async payments(
    request: Request,
    response: Response<PaymentResource[]>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const payments = await prisma.payment.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });

      response.status(200).json(payments.map(toPaymentResource));
    } catch (error) {
      next(error);
    }
  }

  // Lets the checkout screen show the discount before the person commits —
  // does not touch the database or Asaas at all. See CouponPreviewResponse.
  async couponPreview(
    request: Request,
    response: Response<CouponPreviewResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { code } = couponCodeParamSchema.parse(request.params);
      const coupon = await couponService.validateActiveByCode(code);
      response.status(200).json({
        code: coupon.code,
        discountPercent: coupon.discountPercent.toNumber(),
        type: coupon.type,
      });
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }
}

export const billingController = new BillingController();
