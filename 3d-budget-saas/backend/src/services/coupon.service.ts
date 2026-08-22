import type { CouponResource } from "@3d-budget/shared";
import { Prisma, type Coupon } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import type {
  CouponCreateInput,
  CouponUpdateInput,
} from "../validators/coupon.validator";

type CouponWithUsage = Coupon & { _count: { companies: number } };

export const toCouponResource = (coupon: CouponWithUsage): CouponResource => ({
  id: coupon.id,
  code: coupon.code,
  discountPercent: coupon.discountPercent.toNumber(),
  type: coupon.type,
  isActive: coupon.isActive,
  usageCount: coupon._count.companies,
  createdAt: coupon.createdAt.toISOString(),
  updatedAt: coupon.updatedAt.toISOString(),
});

const isUniqueCodeViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export class CouponService {
  async listAll(): Promise<CouponResource[]> {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { companies: true } } },
    });

    return coupons.map(toCouponResource);
  }

  async getById(id: string): Promise<CouponWithUsage> {
    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: { _count: { select: { companies: true } } },
    });

    if (!coupon) {
      throw new AppError("Coupon not found.", 404, "COUPON_NOT_FOUND");
    }

    return coupon;
  }

  async create(input: CouponCreateInput): Promise<CouponResource> {
    try {
      const coupon = await prisma.coupon.create({
        data: {
          code: input.code,
          discountPercent: input.discountPercent,
          type: input.type ?? "RECURRING",
          isActive: input.isActive ?? true,
        },
        include: { _count: { select: { companies: true } } },
      });
      return toCouponResource(coupon);
    } catch (error) {
      if (isUniqueCodeViolation(error)) {
        throw new AppError(
          "A coupon with this code already exists.",
          409,
          "COUPON_CODE_TAKEN",
        );
      }

      throw error;
    }
  }

  async update(id: string, input: CouponUpdateInput): Promise<CouponResource> {
    await this.getById(id);

    try {
      const coupon = await prisma.coupon.update({
        where: { id },
        data: {
          code: input.code,
          discountPercent: input.discountPercent,
          type: input.type,
          isActive: input.isActive,
        },
        include: { _count: { select: { companies: true } } },
      });
      return toCouponResource(coupon);
    } catch (error) {
      if (isUniqueCodeViolation(error)) {
        throw new AppError(
          "A coupon with this code already exists.",
          409,
          "COUPON_CODE_TAKEN",
        );
      }

      throw error;
    }
  }

  // Used both by the checkout screen's live preview (GET /billing/coupons/
  // :code) and, again, by POST /billing/checkout right before creating the
  // Asaas session — a code accepted at preview time could still have been
  // deactivated in the seconds since, so checkout always re-validates
  // rather than trusting the earlier preview call.
  async validateActiveByCode(code: string): Promise<Coupon> {
    const normalized = code.trim().toUpperCase();
    const coupon = await prisma.coupon.findUnique({
      where: { code: normalized },
    });

    if (!coupon || !coupon.isActive) {
      throw new AppError(
        "Invalid or inactive coupon code.",
        404,
        "COUPON_INVALID",
      );
    }

    return coupon;
  }

  // Rounded the same way currency amounts are elsewhere (2 decimal places) —
  // this is the exact value handed to Asaas as the recurring item price.
  discountedPrice(price: Prisma.Decimal, coupon: Coupon): Prisma.Decimal {
    const rate = coupon.discountPercent.div(100);
    return price.mul(new Prisma.Decimal(1).sub(rate)).toDecimalPlaces(2);
  }
}

export const couponService = new CouponService();
