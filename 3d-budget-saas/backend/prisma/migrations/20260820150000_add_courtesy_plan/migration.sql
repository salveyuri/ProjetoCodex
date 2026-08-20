-- "Cortesia" plan: same limits/features as Pro (unlimited machines/
-- materials/quotes, custom formulas + PDF export), price 0, never
-- charged. is_public = false keeps it out of the self-service billing
-- page (GET /plans -> planService.listPublic()) — only an admin can set
-- it on a company, via PATCH /admin/users/:id (planId), which never
-- touches Asaas (billingService.updateSubscription is a plain DB update).
INSERT INTO "plans" ("id", "code", "name", "description", "price", "currency", "billing_cycle", "max_machines_allowed", "max_materials_allowed", "max_quotes_per_month", "features", "is_active", "is_public", "display_order", "created_at", "updated_at")
VALUES
  ('00000000-0000-4000-8000-000000000004', 'cortesia', 'Cortesia', 'Acesso cortesia definido manualmente pelo admin - mesmos limites do Pro, sem cobranca', 0, 'BRL', 'MONTHLY', NULL, NULL, NULL, '{"customFormulas":true,"pdfExport":true}', true, false, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
