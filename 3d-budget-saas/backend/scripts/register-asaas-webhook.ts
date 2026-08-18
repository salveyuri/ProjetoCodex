/**
 * One-off script: registers (or updates) the production webhook with
 * Asaas so subscription payments confirm automatically instead of only
 * ever being reachable via manual polling. Safe to re-run — if a webhook
 * already points at the same URL, it's updated in place instead of
 * creating a duplicate (Asaas caps an account at 10 webhooks total).
 *
 * Usage (from backend/, with the real production .env loaded):
 *   npx tsx scripts/register-asaas-webhook.ts
 * or, inside the running container:
 *   docker compose exec backend npx tsx scripts/register-asaas-webhook.ts
 *
 * Requires ASAAS_ENV=production (or the script refuses to run against
 * sandbox by accident), plus the usual ASAAS_API_KEY/ASAAS_WEBHOOK_TOKEN/
 * APP_BASE_URL already used by the running app.
 */
import { env } from "../src/config/env";
import { HANDLED_ASAAS_EVENTS } from "../src/controllers/webhook.controller";
import { asaasClient } from "../src/services/asaas-client";

const WEBHOOK_NAME = "Pricify3D - assinaturas";

const extractPlainEmail = (fromAddress: string): string => {
  const match = fromAddress.match(/<([^>]+)>/);
  return match ? match[1] : fromAddress;
};

async function main(): Promise<void> {
  if (env.asaasEnv !== "production") {
    throw new Error(
      `ASAAS_ENV is "${env.asaasEnv}", not "production" — refusing to register a ` +
        "webhook against the sandbox by accident. Set ASAAS_ENV=production if this " +
        "really is the production environment.",
    );
  }

  if (env.asaasWebhookToken.length < 32 || env.asaasWebhookToken.length > 255) {
    throw new Error(
      `ASAAS_WEBHOOK_TOKEN must be 32-255 characters (currently ${env.asaasWebhookToken.length}) ` +
        "— Asaas rejects the webhook creation call otherwise. Generate a longer random " +
        'value (e.g. `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"`) ' +
        "and set it as ASAAS_WEBHOOK_TOKEN in both the backend env and this call.",
    );
  }

  // Confirmed against the real Asaas API while validating this script: a
  // token with more than 4 identical characters in a row (e.g. "aaaaa...")
  // is rejected with `invalid_object` — worth catching here with a clear
  // message instead of a generic 502 from asaas-client.ts's error wrapper.
  if (/(.)\1{4,}/.test(env.asaasWebhookToken)) {
    throw new Error(
      "ASAAS_WEBHOOK_TOKEN contains more than 4 identical consecutive characters — " +
        "Asaas rejects this. Generate a proper random token instead.",
    );
  }

  if (!/^https:\/\//.test(env.appBaseUrl)) {
    throw new Error(
      `APP_BASE_URL ("${env.appBaseUrl}") must be a public https:// URL for Asaas to ` +
        "be able to reach the webhook — this script refuses to register a localhost/http URL.",
    );
  }

  const targetUrl = `${env.appBaseUrl}/api/webhooks/asaas`;
  const payload = {
    name: WEBHOOK_NAME,
    url: targetUrl,
    email: extractPlainEmail(env.emailFromAddress),
    authToken: env.asaasWebhookToken,
    events: [...HANDLED_ASAAS_EVENTS],
  };

  console.log(`Checking existing Asaas webhooks (${env.asaasBaseUrl})...`);
  const existing = await asaasClient.listWebhooks();
  const current = existing.find((webhook) => webhook.url === targetUrl);

  if (current) {
    console.log(`Found existing webhook "${current.name}" (${current.id}) for this URL — updating it.`);
    const updated = await asaasClient.updateWebhook(current.id, payload);
    console.log("Webhook updated:", {
      id: updated.id,
      url: updated.url,
      events: updated.events,
      enabled: updated.enabled,
    });
    return;
  }

  console.log(`No webhook found for ${targetUrl} — creating one.`);
  const created = await asaasClient.createWebhook(payload);
  console.log("Webhook created:", {
    id: created.id,
    url: created.url,
    events: created.events,
    enabled: created.enabled,
  });
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("Failed to register the Asaas webhook:", error);
    process.exit(1);
  });
