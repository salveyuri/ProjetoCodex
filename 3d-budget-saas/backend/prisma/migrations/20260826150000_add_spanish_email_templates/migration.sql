-- Seeds a Spanish (es) translation of the 6 base email templates plus
-- PAYMENT_OVERDUE (7 total — same set that already has pt-BR + en, minus
-- COUPON_REVERT_FAILED, which is deliberately admin-only/pt-BR-only, see
-- email.service.ts). Same layout as the existing templates. See
-- Contextos/Decisoes.md (2026-08-26).
INSERT INTO "email_templates" ("id", "key", "language", "name", "description", "subject", "body_html", "is_active", "created_at", "updated_at")
VALUES
(
  '00000000-0000-4000-8000-000000000121',
  'ACCOUNT_CREATED',
  'es',
  'Cuenta creada',
  'Se envia cuando se crea una cuenta nueva, confirmando el registro.',
  '¡Bienvenido a Pricify3D, {{accountName}}!',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Cuenta creada exitosamente</h1>
        <p style="margin:0 0 12px;">¡Hola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Tu cuenta de Pricify3D fue creada con el correo <strong>{{email}}</strong>, en el plan <strong>{{planName}}</strong>.</p>
        <p style="margin:0 0 24px;">Ahora solo inicia sesion y configura tus maquinas y materiales para empezar a generar presupuestos precisos.</p>
        <p style="text-align:center;margin:0;">
          <a href="{{loginUrl}}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Acceder a mi cuenta</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - sistema de precios para impresion 3D
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000122',
  'PASSWORD_RESET',
  'es',
  'Restablecer contraseña',
  'Se envia cuando el usuario solicita restablecer su contraseña, con el enlace de restablecimiento.',
  'Restablece tu contraseña de Pricify3D',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Restablecer contraseña</h1>
        <p style="margin:0 0 12px;">¡Hola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el boton de abajo para elegir una nueva contraseña:</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="{{resetUrl}}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Restablecer contraseña</a>
        </p>
        <p style="margin:0;color:#71717a;font-size:13px;">Este enlace vence en {{expiresInMinutes}} minutos y solo puede usarse una vez. Si no solicitaste este restablecimiento, puedes ignorar este correo con tranquilidad - tu contraseña actual sigue siendo valida.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - sistema de precios para impresion 3D
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000123',
  'SUBSCRIPTION_CONFIRMED',
  'es',
  'Suscripcion confirmada',
  'Se envia al confirmar el primer pago de un plan pago.',
  'Suscripcion {{planName}} confirmada',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Suscripcion confirmada</h1>
        <p style="margin:0 0 12px;">¡Hola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Recibimos la confirmacion del pago de tu suscripcion <strong>{{planName}}</strong> ({{planPrice}}).</p>
        <p style="margin:0;">Tu proximo vencimiento es el <strong>{{nextDueDate}}</strong>.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - sistema de precios para impresion 3D
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000124',
  'SUBSCRIPTION_RENEWED',
  'es',
  'Suscripcion renovada',
  'Se envia cuando se confirma un pago de renovacion (ciclo recurrente).',
  'Suscripcion {{planName}} renovada',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Suscripcion renovada</h1>
        <p style="margin:0 0 12px;">¡Hola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Tu suscripcion <strong>{{planName}}</strong> ({{planPrice}}) se renovo exitosamente el {{paymentDate}}.</p>
        <p style="margin:0;">Tu proximo vencimiento es el <strong>{{nextDueDate}}</strong>.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - sistema de precios para impresion 3D
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000125',
  'SUBSCRIPTION_EXPIRING',
  'es',
  'Suscripcion por vencer',
  'Alerta automatica (cron diario) unos dias antes del vencimiento de la factura.',
  'Tu suscripcion vence en {{daysRemaining}} dias',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Tu suscripcion esta por vencer</h1>
        <p style="margin:0 0 12px;">¡Hola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Tu suscripcion <strong>{{planName}}</strong> vence el <strong>{{dueDate}}</strong> ({{daysRemaining}} dias).</p>
        <p style="margin:0;">Asegurate de que tu metodo de pago este al dia para evitar la interrupcion de tu acceso.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - sistema de precios para impresion 3D
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000126',
  'QUOTE_SUMMARY',
  'es',
  'Resumen de presupuesto',
  'Se envia al titular de la cuenta cuando un presupuesto es aprobado o exportado como PDF.',
  'Resumen de presupuesto - {{customerName}}',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Presupuesto {{triggerLabel}}</h1>
        <p style="margin:0 0 12px;">¡Hola, {{accountName}}!</p>
        <p style="margin:0 0 16px;">El presupuesto para <strong>{{customerName}}</strong> fue {{triggerLabel}}.</p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 16px;">
          {{itemsHtml}}
        </table>
        <p style="margin:0 0 4px;font-size:16px;"><strong>Valor total: {{totalAmount}}</strong></p>
        <p style="margin:0;color:#71717a;font-size:13px;">Valido hasta {{validUntil}}.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - sistema de precios para impresion 3D
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '00000000-0000-4000-8000-000000000127',
  'PAYMENT_OVERDUE',
  'es',
  'Pago atrasado',
  'Se envia cuando Asaas confirma que una factura de la suscripcion vencio sin pago.',
  'Pago atrasado - {{planName}}',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Encontramos un pago atrasado</h1>
        <p style="margin:0 0 12px;">¡Hola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">La factura de tu suscripcion del plan <strong>{{planName}}</strong>, por valor de <strong>{{planPrice}}</strong>, vencio el <strong>{{dueDate}}</strong> y aun no fue confirmada.</p>
        <p style="margin:0 0 24px;">Regulariza el pago para evitar la interrupcion de tu acceso.</p>
        <p style="text-align:center;margin:0;">
          <a href="{{invoiceUrl}}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Pagar ahora</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - sistema de precios para impresion 3D
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
