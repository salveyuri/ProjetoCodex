/**
 * One-off script: registers (or updates) the Resend webhook that reports
 * back delivery status (delivered/bounced/complained/delayed/failed) for
 * every email this app sends — see EmailLog.deliveryStatus and
 * /admin/email-templates' "Logs de envio" section. Purely additive: the
 * app already sends email fine without this ever being run, this only
 * unlocks the delivery-status column.
 *
 * Safe to re-run — if a webhook already points at the same URL, it's
 * updated in place (events refreshed) instead of creating a duplicate.
 *
 * IMPORTANT: unlike the Asaas equivalent, Resend only returns the signing
 * secret ONCE, at creation time. On first run, this script prints it —
 * copy it into RESEND_WEBHOOK_SECRET in the real .env and restart the
 * backend (docker compose up -d) for it to take effect. Re-running this
 * script later (e.g. to refresh the event list) updates the existing
 * webhook and does NOT print a new secret — the one you already saved
 * keeps working.
 *
 * Usage (from backend/, with the real production .env loaded):
 *   npx tsx scripts/register-resend-webhook.ts
 * or, inside the running container:
 *   docker compose exec backend npx tsx scripts/register-resend-webhook.ts
 *
 * Requires RESEND_API_KEY and a public https:// APP_BASE_URL already used
 * by the running app.
 */
import { env } from "../src/config/env";
import { HANDLED_RESEND_EVENTS } from "../src/controllers/webhook.controller";
import { resendClient } from "../src/services/resend-client";

async function main(): Promise<void> {
  if (!env.resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not set — this script needs it to call Resend's API.",
    );
  }

  if (!/^https:\/\//.test(env.appBaseUrl)) {
    throw new Error(
      `APP_BASE_URL ("${env.appBaseUrl}") must be a public https:// URL for Resend to ` +
        "be able to reach the webhook — this script refuses to register a localhost/http URL.",
    );
  }

  const targetUrl = `${env.appBaseUrl}/api/webhooks/resend`;
  const events = [...HANDLED_RESEND_EVENTS];

  console.log("Checking existing Resend webhooks...");
  const existing = await resendClient.listWebhooks();
  const current = existing.find((webhook) => webhook.endpoint === targetUrl);

  if (current) {
    console.log(`Found existing webhook (${current.id}) for this URL — updating it.`);
    await resendClient.updateWebhook(current.id, targetUrl, events);
    console.log("Webhook updated:", { id: current.id, url: targetUrl, events });
    console.log(
      "No new signing secret was issued — RESEND_WEBHOOK_SECRET (if already set) is unchanged.",
    );
    return;
  }

  console.log(`No webhook found for ${targetUrl} — creating one.`);
  const created = await resendClient.createWebhook(targetUrl, events);
  console.log("Webhook created:", { id: created.id, url: created.endpoint, events: created.events });
  console.log("");
  console.log("=".repeat(70));
  console.log("Copy this into RESEND_WEBHOOK_SECRET in your .env, then restart");
  console.log("the backend (docker compose up -d). Resend will not show this");
  console.log("secret again after this run.");
  console.log("");
  console.log(`RESEND_WEBHOOK_SECRET=${created.signingSecret}`);
  console.log("=".repeat(70));
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("Failed to register the Resend webhook:", error);
    process.exit(1);
  });
