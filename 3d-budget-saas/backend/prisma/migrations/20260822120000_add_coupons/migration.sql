-- Cupons de desconto para assinaturas. discountPercent so e lido no
-- momento do checkout, pra calcular o valor com desconto enviado ao Asaas
-- (a recorrencia fica fixa nesse valor a partir dai, sem precisar reaplicar
-- nada a cada ciclo). companies.coupon_id/checkouts.coupon_id so registram
-- qual cupom foi usado, pra exibicao - nao entram em nenhum calculo aqui.
-- Ver Contextos/Decisoes.md (2026-08-22).

CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

ALTER TABLE "checkouts" ADD COLUMN "coupon_id" UUID;
ALTER TABLE "checkouts"
  ADD CONSTRAINT "checkouts_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "companies" ADD COLUMN "coupon_id" UUID;
ALTER TABLE "companies"
  ADD CONSTRAINT "companies_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
