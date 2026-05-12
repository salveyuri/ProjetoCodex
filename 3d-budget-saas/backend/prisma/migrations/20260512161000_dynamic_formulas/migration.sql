ALTER TABLE "formulas" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "quotes" ADD COLUMN "formula_id" UUID;

CREATE INDEX "formulas_company_id_is_default_idx" ON "formulas"("company_id", "is_default");
CREATE INDEX "quotes_formula_id_idx" ON "quotes"("formula_id");

ALTER TABLE "quotes"
ADD CONSTRAINT "quotes_formula_id_fkey"
FOREIGN KEY ("formula_id") REFERENCES "formulas"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
