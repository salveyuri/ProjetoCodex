-- Seeds the PAYMENT_OVERDUE email template (pt-BR + en), same layout as
-- the other 6 templates. Fired from webhook.controller.ts on a real Asaas
-- PAYMENT_OVERDUE event (see email.service.ts's sendPaymentOverdue).
INSERT INTO "email_templates" ("id", "key", "language", "name", "description", "subject", "body_html", "is_active", "created_at", "updated_at")
VALUES
(
  '00000000-0000-4000-8000-000000000107',
  'PAYMENT_OVERDUE',
  'pt-BR',
  'Pagamento atrasado',
  'Enviado quando o Asaas confirma que uma fatura da assinatura venceu sem pagamento.',
  'Pagamento em atraso - {{planName}}',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Identificamos um pagamento em atraso</h1>
        <p style="margin:0 0 12px;">Ola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">A fatura da sua assinatura do plano <strong>{{planName}}</strong>, no valor de <strong>{{planPrice}}</strong>, venceu em <strong>{{dueDate}}</strong> e ainda nao foi confirmada.</p>
        <p style="margin:0 0 24px;">Regularize o pagamento para evitar a interrupcao do seu acesso.</p>
        <p style="text-align:center;margin:0;">
          <a href="{{invoiceUrl}}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Regularizar pagamento</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - sistema de precificacao para impressao 3D
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000117',
  'PAYMENT_OVERDUE',
  'en',
  'Payment overdue',
  'Sent when Asaas confirms a subscription invoice went unpaid past its due date.',
  'Overdue payment - {{planName}}',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">We found an overdue payment</h1>
        <p style="margin:0 0 12px;">Hi, {{accountName}}!</p>
        <p style="margin:0 0 12px;">The invoice for your <strong>{{planName}}</strong> subscription, worth <strong>{{planPrice}}</strong>, was due on <strong>{{dueDate}}</strong> and hasn't been confirmed yet.</p>
        <p style="margin:0 0 24px;">Please settle the payment to avoid any interruption to your access.</p>
        <p style="text-align:center;margin:0;">
          <a href="{{invoiceUrl}}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Pay now</a>
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
);
