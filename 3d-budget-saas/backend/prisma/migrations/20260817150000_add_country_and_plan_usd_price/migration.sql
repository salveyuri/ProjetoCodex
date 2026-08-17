-- Country per company (ISO 3166-1 alpha-2), drives billing currency
-- (BR -> BRL, else -> USD). Existing rows default to BR/BRL, matching the
-- current all-Brazilian customer base — no backfill needed beyond the
-- column default.
ALTER TABLE "companies" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'BR';

-- Admin-set reference USD price shown to non-Brazil companies. Nullable —
-- existing plans have no USD price until an admin fills one in on
-- /admin/plans. Display only: the actual Asaas charge always uses
-- "price" (BRL), since Asaas has no currency parameter.
ALTER TABLE "plans" ADD COLUMN "price_usd" DECIMAL(10, 2);
