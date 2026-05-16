-- Bloco 8.3: variaveis operacionais e globais para formulas dinamicas.

ALTER TABLE "pricing_settings"
  ADD COLUMN "painting_hour_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "finishing_hour_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "error_rate" DECIMAL(10,4) NOT NULL DEFAULT 0;

ALTER TABLE "quotes"
  ADD COLUMN "painting_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "finishing_hours" DECIMAL(10,2) NOT NULL DEFAULT 0;
