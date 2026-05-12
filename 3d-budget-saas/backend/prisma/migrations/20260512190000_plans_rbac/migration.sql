-- Bloco 11: Planos, limites de uso e RBAC.

CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'PAST_DUE');

CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'USER');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING (
    CASE
      WHEN "role"::text = 'CUSTOMER' THEN 'USER'
      ELSE "role"::text
    END
  )::"UserRole_new";
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';

ALTER TABLE "users"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "companies"
  ADD COLUMN "plan_type" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "stripe_customer_id" TEXT,
  ADD COLUMN "current_quotes_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "quote_usage_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "max_machines_allowed" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "max_materials_allowed" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "max_quotes_per_month" INTEGER NOT NULL DEFAULT 10;

CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_is_active_idx" ON "users"("is_active");
CREATE INDEX "companies_plan_type_idx" ON "companies"("plan_type");
CREATE INDEX "companies_subscription_status_idx" ON "companies"("subscription_status");
