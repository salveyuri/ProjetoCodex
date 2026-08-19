-- Tracks Resend's asynchronous delivery outcome (delivered/bounced/
-- complained/delayed/failed) for each email_logs row, filled in later by
-- the POST /api/webhooks/resend handler once Resend reports back.
ALTER TABLE "email_logs" ADD COLUMN "delivery_status" TEXT;
ALTER TABLE "email_logs" ADD COLUMN "delivery_detail" TEXT;
ALTER TABLE "email_logs" ADD COLUMN "delivery_payload" JSONB;
ALTER TABLE "email_logs" ADD COLUMN "delivery_updated_at" TIMESTAMP(3);

CREATE INDEX "email_logs_resend_message_id_idx" ON "email_logs"("resend_message_id");
