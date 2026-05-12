-- Update quote lifecycle enum from the initial Portuguese MVP states to the
-- product workflow used by the SaaS UI/API.
ALTER TABLE "quotes" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "QuoteStatus" RENAME TO "QuoteStatus_old";
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED');

ALTER TABLE "quotes"
  ALTER COLUMN "status" TYPE "QuoteStatus"
  USING (
    CASE "status"::text
      WHEN 'Pendente' THEN 'DRAFT'
      WHEN 'Aprovado' THEN 'APPROVED'
      WHEN 'Finalizado' THEN 'APPROVED'
      ELSE 'DRAFT'
    END
  )::"QuoteStatus";

ALTER TABLE "quotes" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "QuoteStatus_old";

-- Store immutable calculation snapshots on each quote item so historical
-- proposals do not change when machine, material, or settings prices change.
ALTER TABLE "print_items"
  ADD COLUMN "material_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "energy_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "depreciation_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "labor_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "base_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "margin_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "fees_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "final_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "applied_margin_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "applied_technical_hour_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "applied_energy_cost_per_kwh" DECIMAL(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN "applied_card_fee_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "applied_administrative_fee_percent" DECIMAL(7,4) NOT NULL DEFAULT 0;

UPDATE "print_items"
SET "final_price" = "calculated_cost";
