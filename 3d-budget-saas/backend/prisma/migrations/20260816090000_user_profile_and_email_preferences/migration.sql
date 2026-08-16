-- Adds an editable display name and per-user notification preferences to
-- users. Account-creation and password-reset emails are never gated by
-- these preferences (enforced in application code, not the schema).
ALTER TABLE "users" ADD COLUMN "name" TEXT;
ALTER TABLE "users" ADD COLUMN "notify_financial_emails" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "notify_quote_emails" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "notify_newsletter" BOOLEAN NOT NULL DEFAULT false;
