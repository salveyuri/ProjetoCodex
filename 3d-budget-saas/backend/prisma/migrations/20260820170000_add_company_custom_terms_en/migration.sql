-- Lets a company set English custom PDF terms separately from the
-- pt-BR ones (Company.customTerms) — see quote-pdf.service.ts's
-- resolveTerms(), which never mixes the two languages.
ALTER TABLE "companies" ADD COLUMN "custom_terms_en" TEXT;
