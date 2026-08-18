-- Business info shown on the quote PDF header. All optional/nullable —
-- existing companies simply keep showing the "not provided" placeholder
-- until they fill these in via Settings > Perfil.
ALTER TABLE "companies" ADD COLUMN "tax_id" TEXT;
ALTER TABLE "companies" ADD COLUMN "phone" TEXT;
ALTER TABLE "companies" ADD COLUMN "address" TEXT;

-- Overrides the PDF's built-in localized terms/warranty text when set.
-- Null (the default) keeps the existing pt-BR/en defaults unchanged for
-- every company that never touches this.
ALTER TABLE "companies" ADD COLUMN "custom_terms" TEXT;
