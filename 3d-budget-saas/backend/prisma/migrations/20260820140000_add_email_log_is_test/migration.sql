-- Marks rows written by the "Testar e-mail" button (EmailService.sendTest)
-- so the admin UI can show an "Origem" column and jobs/email-log-cleanup.job.ts
-- can purge only test rows after 48h, never real ones.
ALTER TABLE "email_logs" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "email_logs_is_test_created_at_idx" ON "email_logs"("is_test", "created_at");
