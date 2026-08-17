-- Adds a per-user language preference (pt-BR default, browser-language
-- suggested at signup) and splits each email template into a per-language
-- row (key+language composite unique instead of key alone), so the same
-- trigger can render either variant. Seeds an English translation of all
-- 6 templates alongside the existing Portuguese ones. Admin screens stay
-- Portuguese-only for now — this is scoped to user-facing content (app UI,
-- quote PDF, transactional emails). See Contextos/Decisoes.md (2026-08-17).

ALTER TABLE "users" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'pt-BR';

ALTER TABLE "email_templates" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'pt-BR';

DROP INDEX "email_templates_key_key";
CREATE UNIQUE INDEX "email_templates_key_language_key" ON "email_templates"("key", "language");

INSERT INTO "email_templates" ("id", "key", "language", "name", "description", "subject", "body_html", "is_active", "created_at", "updated_at")
VALUES
(
  '00000000-0000-4000-8000-000000000111',
  'ACCOUNT_CREATED',
  'en',
  'Account created',
  'Sent when a new account is created, confirming the signup.',
  'Welcome to Pricify3D, {{accountName}}!',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Account created successfully</h1>
        <p style="margin:0 0 12px;">Hi, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Your Pricify3D account was created with the email <strong>{{email}}</strong>, on the <strong>{{planName}}</strong> plan.</p>
        <p style="margin:0 0 24px;">Now just sign in and set up your machines and materials to start generating accurate quotes.</p>
        <p style="text-align:center;margin:0;">
          <a href="{{loginUrl}}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Access my account</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - 3D printing pricing system
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000112',
  'PASSWORD_RESET',
  'en',
  'Password reset',
  'Sent when the user requests a password reset, with the reset link.',
  'Reset your Pricify3D password',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Password reset</h1>
        <p style="margin:0 0 12px;">Hi, {{accountName}}!</p>
        <p style="margin:0 0 12px;">We received a request to reset your account password. Click the button below to choose a new password:</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="{{resetUrl}}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Reset password</a>
        </p>
        <p style="margin:0;color:#71717a;font-size:13px;">This link expires in {{expiresInMinutes}} minutes and can only be used once. If you didn't request this reset, you can safely ignore this email - your current password remains valid.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - 3D printing pricing system
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000113',
  'SUBSCRIPTION_CONFIRMED',
  'en',
  'Subscription confirmed',
  'Sent on the first payment confirmation of a paid plan.',
  '{{planName}} subscription confirmed',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Subscription confirmed</h1>
        <p style="margin:0 0 12px;">Hi, {{accountName}}!</p>
        <p style="margin:0 0 12px;">We received the payment confirmation for your <strong>{{planName}}</strong> subscription ({{planPrice}}).</p>
        <p style="margin:0;">Your next due date is <strong>{{nextDueDate}}</strong>.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - 3D printing pricing system
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000114',
  'SUBSCRIPTION_RENEWED',
  'en',
  'Subscription renewed',
  'Sent when a renewal (recurring cycle) payment is confirmed.',
  '{{planName}} subscription renewed',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Subscription renewed</h1>
        <p style="margin:0 0 12px;">Hi, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Your <strong>{{planName}}</strong> subscription ({{planPrice}}) was successfully renewed on {{paymentDate}}.</p>
        <p style="margin:0;">Your next due date is <strong>{{nextDueDate}}</strong>.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - 3D printing pricing system
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000115',
  'SUBSCRIPTION_EXPIRING',
  'en',
  'Subscription expiring soon',
  'Automatic alert (daily cron) a few days before the invoice due date.',
  'Your subscription expires in {{daysRemaining}} days',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Your subscription is about to expire</h1>
        <p style="margin:0 0 12px;">Hi, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Your <strong>{{planName}}</strong> subscription is due on <strong>{{dueDate}}</strong> ({{daysRemaining}} days).</p>
        <p style="margin:0;">Make sure your payment method is up to date to avoid interruption of access.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - 3D printing pricing system
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000116',
  'QUOTE_SUMMARY',
  'en',
  'Quote summary',
  'Sent to the account owner when a quote is approved or exported as PDF.',
  'Quote summary - {{customerName}}',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Quote {{triggerLabel}}</h1>
        <p style="margin:0 0 12px;">Hi, {{accountName}}!</p>
        <p style="margin:0 0 16px;">The quote for <strong>{{customerName}}</strong> has been {{triggerLabel}}.</p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 16px;">
          {{itemsHtml}}
        </table>
        <p style="margin:0 0 4px;font-size:16px;"><strong>Total amount: {{totalAmount}}</strong></p>
        <p style="margin:0;color:#71717a;font-size:13px;">Valid until {{validUntil}}.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - 3D printing pricing system
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
