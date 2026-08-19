-- Stores the exact rendered HTML for each send attempt (after variable
-- substitution), so an admin can re-read what a specific customer was
-- actually sent — e.g. a password reset link they claim never arrived.
ALTER TABLE "email_logs" ADD COLUMN "body_html" TEXT;
