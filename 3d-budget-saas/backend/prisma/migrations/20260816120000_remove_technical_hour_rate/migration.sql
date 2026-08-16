-- "Hora tecnica" (technical hour rate) is not used anywhere in the current
-- pricing model and is being removed from the system entirely, along with
-- the labor cost it fed into.
ALTER TABLE "pricing_settings" DROP COLUMN "technical_hour_rate";
ALTER TABLE "print_items" DROP COLUMN "applied_technical_hour_rate";
ALTER TABLE "print_items" DROP COLUMN "labor_cost";
