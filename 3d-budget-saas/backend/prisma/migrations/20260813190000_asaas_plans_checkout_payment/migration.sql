-- Integracao de assinaturas via Asaas: tabela de planos administraveis
-- (plans), checkout hospedado (checkouts) e historico de pagamentos
-- (payments). Substitui o enum fixo SubscriptionPlan e os limites
-- hardcoded em Company por uma FK para Plan.

CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "CheckoutStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELED');

CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "max_machines_allowed" INTEGER,
    "max_materials_allowed" INTEGER,
    "max_quotes_per_month" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{"customFormulas":false,"pdfExport":false}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");
CREATE INDEX "plans_is_active_is_public_idx" ON "plans"("is_active", "is_public");

CREATE TABLE "checkouts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "asaas_checkout_id" TEXT,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkouts_asaas_checkout_id_key" ON "checkouts"("asaas_checkout_id");
CREATE INDEX "checkouts_company_id_idx" ON "checkouts"("company_id");
CREATE INDEX "checkouts_status_idx" ON "checkouts"("status");

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "asaas_payment_id" TEXT NOT NULL,
    "asaas_subscription_id" TEXT,
    "status" TEXT NOT NULL,
    "billing_type" TEXT,
    "value" DECIMAL(12,2) NOT NULL,
    "due_date" TIMESTAMP(3),
    "payment_date" TIMESTAMP(3),
    "invoice_url" TEXT,
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_asaas_payment_id_key" ON "payments"("asaas_payment_id");
CREATE INDEX "payments_company_id_created_at_idx" ON "payments"("company_id", "created_at");

ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed dos 3 planos existentes, com os mesmos limites que estavam
-- hardcoded em PLAN_DEFINITIONS (backend/src/services/billing.service.ts).
-- Preco de Pro/Enterprise e um placeholder inicial -- nunca existiu preco
-- real no sistema mock anterior; editar valores reais em /admin/plans.
INSERT INTO "plans" ("id", "code", "name", "description", "price", "currency", "billing_cycle", "max_machines_allowed", "max_materials_allowed", "max_quotes_per_month", "features", "is_active", "is_public", "display_order", "created_at", "updated_at")
VALUES
  ('00000000-0000-4000-8000-000000000001', 'free', 'Free', 'Plano gratuito para comecar', 0, 'BRL', 'MONTHLY', 2, 3, 10, '{"customFormulas":false,"pdfExport":false}', true, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'pro', 'Pro', 'Para quem esta crescendo', 49.90, 'BRL', 'MONTHLY', NULL, NULL, NULL, '{"customFormulas":true,"pdfExport":true}', true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000003', 'enterprise', 'Enterprise', 'Para operacoes maiores', 199.90, 'BRL', 'MONTHLY', NULL, NULL, NULL, '{"customFormulas":true,"pdfExport":true}', true, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- companies: troca plan_type (enum) por plan_id (FK), renomeia
-- stripe_customer_id, remove as colunas de limite (agora vivem em Plan).
ALTER TABLE "companies" ADD COLUMN "plan_id" UUID;

UPDATE "companies" SET "plan_id" = CASE "plan_type"
  WHEN 'FREE' THEN '00000000-0000-4000-8000-000000000001'
  WHEN 'PRO' THEN '00000000-0000-4000-8000-000000000002'
  WHEN 'ENTERPRISE' THEN '00000000-0000-4000-8000-000000000003'
END::UUID;

ALTER TABLE "companies" ALTER COLUMN "plan_id" SET NOT NULL;
ALTER TABLE "companies" ADD CONSTRAINT "companies_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "companies" RENAME COLUMN "stripe_customer_id" TO "asaas_customer_id";
ALTER TABLE "companies" ADD COLUMN "asaas_subscription_id" TEXT;

DROP INDEX IF EXISTS "companies_plan_type_idx";
DROP INDEX IF EXISTS "companies_plan_type_subscription_status_idx";

ALTER TABLE "companies"
  DROP COLUMN "plan_type",
  DROP COLUMN "max_machines_allowed",
  DROP COLUMN "max_materials_allowed",
  DROP COLUMN "max_quotes_per_month";

DROP TYPE "SubscriptionPlan";

CREATE INDEX "companies_plan_id_idx" ON "companies"("plan_id");
CREATE INDEX "companies_plan_id_subscription_status_idx" ON "companies"("plan_id", "subscription_status");
