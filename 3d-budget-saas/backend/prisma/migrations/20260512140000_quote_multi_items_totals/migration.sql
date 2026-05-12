ALTER TABLE "quotes"
  ADD COLUMN "total_print_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "total_weight_grams" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "quotes" AS q
SET
  "total_print_hours" = COALESCE(t."total_print_hours", 0),
  "total_weight_grams" = COALESCE(t."total_weight_grams", 0),
  "total_amount" = COALESCE(t."total_amount", q."total_amount")
FROM (
  SELECT
    "quote_id",
    SUM("estimated_print_time_hours") AS "total_print_hours",
    SUM("material_weight_grams") AS "total_weight_grams",
    SUM("final_price") AS "total_amount"
  FROM "print_items"
  GROUP BY "quote_id"
) AS t
WHERE q."id" = t."quote_id";
