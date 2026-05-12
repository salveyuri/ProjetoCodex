import type { SubscriptionPlan } from "@3d-budget/shared";

export interface PaymentCheckoutInput {
  companyId: string;
  planType: Exclude<SubscriptionPlan, "FREE">;
}

export interface PaymentCheckoutResult {
  provider: "mock";
  status: "succeeded";
  transactionId: string;
  planType: SubscriptionPlan;
}

const createMockTransactionId = (): string =>
  `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export class PaymentService {
  async checkout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    return {
      provider: "mock",
      status: "succeeded",
      transactionId: createMockTransactionId(),
      planType: input.planType,
    };
  }
}

export const paymentService = new PaymentService();
