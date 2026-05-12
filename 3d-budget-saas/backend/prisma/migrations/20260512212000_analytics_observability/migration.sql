-- Bloco 12: Analytics, observabilidade, auditoria e indices de relatorio.

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID,
  "actor_email" TEXT,
  "company_id" UUID,
  "target_user_id" UUID,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" UUID,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_errors" (
  "id" UUID NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "code" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'error',
  "method" TEXT,
  "path" TEXT,
  "status_code" INTEGER,
  "user_id" UUID,
  "company_id" UUID,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_errors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "users_created_at_idx" ON "users"("created_at");
CREATE INDEX "companies_plan_type_subscription_status_idx" ON "companies"("plan_type", "subscription_status");

CREATE INDEX "quotes_created_at_idx" ON "quotes"("created_at");
CREATE INDEX "quotes_company_id_created_at_idx" ON "quotes"("company_id", "created_at");
CREATE INDEX "quotes_company_id_status_created_at_idx" ON "quotes"("company_id", "status", "created_at");

CREATE INDEX "print_items_machine_id_created_at_idx" ON "print_items"("machine_id", "created_at");
CREATE INDEX "print_items_material_id_created_at_idx" ON "print_items"("material_id", "created_at");

CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_target_user_id_created_at_idx" ON "audit_logs"("target_user_id", "created_at");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

CREATE INDEX "system_errors_created_at_idx" ON "system_errors"("created_at");
CREATE INDEX "system_errors_company_id_created_at_idx" ON "system_errors"("company_id", "created_at");
CREATE INDEX "system_errors_code_idx" ON "system_errors"("code");
