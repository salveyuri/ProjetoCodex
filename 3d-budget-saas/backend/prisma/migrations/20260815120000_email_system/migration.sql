-- Sistema de e-mails transacionais (Resend): templates editaveis pelo
-- admin, log de envio (idempotencia + auditoria), e tokens de reset de
-- senha (mesmo padrao de hash de refresh_tokens - nunca guarda o token
-- cru).

CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_by_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_templates_key_key" ON "email_templates"("key");

CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "template_key" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resend_message_id" TEXT,
    "error_message" TEXT,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_logs_dedupe_key_key" ON "email_logs"("dedupe_key");
CREATE INDEX "email_logs_template_key_to_email_idx" ON "email_logs"("template_key", "to_email");

-- Seed: 6 templates com layout generico (card branco, header com logo,
-- rodape) - o Yuri ajusta o HTML de verdade depois pela tela
-- /admin/email-templates. Placeholders no formato {{variavel}}.

INSERT INTO "email_templates" ("id", "key", "name", "description", "subject", "body_html", "is_active", "created_at", "updated_at")
VALUES
(
  '00000000-0000-4000-8000-000000000101',
  'ACCOUNT_CREATED',
  'Conta criada',
  'Enviado quando uma nova conta e criada, confirmando o cadastro.',
  'Bem-vindo ao Pricify3D, {{accountName}}!',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Conta criada com sucesso</h1>
        <p style="margin:0 0 12px;">Ola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Sua conta no Pricify3D foi criada com o e-mail <strong>{{email}}</strong>, no plano <strong>{{planName}}</strong>.</p>
        <p style="margin:0 0 24px;">Agora e so entrar e configurar suas maquinas e materiais para comecar a gerar orcamentos precisos.</p>
        <p style="text-align:center;margin:0;">
          <a href="{{loginUrl}}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Acessar minha conta</a>
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
  '00000000-0000-4000-8000-000000000102',
  'PASSWORD_RESET',
  'Redefinicao de senha',
  'Enviado quando o usuario pede para redefinir a senha, com o link de reset.',
  'Redefina sua senha no Pricify3D',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Redefinicao de senha</h1>
        <p style="margin:0 0 12px;">Ola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Recebemos um pedido para redefinir a senha da sua conta. Clique no botao abaixo para escolher uma nova senha:</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="{{resetUrl}}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Redefinir senha</a>
        </p>
        <p style="margin:0;color:#71717a;font-size:13px;">Este link expira em {{expiresInMinutes}} minutos e so pode ser usado uma vez. Se voce nao pediu essa redefinicao, pode ignorar este e-mail com seguranca - sua senha atual continua valida.</p>
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
  '00000000-0000-4000-8000-000000000103',
  'SUBSCRIPTION_CONFIRMED',
  'Assinatura confirmada',
  'Enviado na primeira confirmacao de pagamento de um plano pago.',
  'Assinatura {{planName}} confirmada',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Assinatura confirmada</h1>
        <p style="margin:0 0 12px;">Ola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Recebemos a confirmacao do pagamento da sua assinatura do plano <strong>{{planName}}</strong> ({{planPrice}}).</p>
        <p style="margin:0;">Seu proximo vencimento e em <strong>{{nextDueDate}}</strong>.</p>
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
  '00000000-0000-4000-8000-000000000104',
  'SUBSCRIPTION_RENEWED',
  'Assinatura renovada',
  'Enviado quando um pagamento de renovacao (ciclo recorrente) e confirmado.',
  'Assinatura {{planName}} renovada',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Assinatura renovada</h1>
        <p style="margin:0 0 12px;">Ola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Sua assinatura do plano <strong>{{planName}}</strong> ({{planPrice}}) foi renovada com sucesso em {{paymentDate}}.</p>
        <p style="margin:0;">Seu proximo vencimento e em <strong>{{nextDueDate}}</strong>.</p>
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
  '00000000-0000-4000-8000-000000000105',
  'SUBSCRIPTION_EXPIRING',
  'Assinatura perto de vencer',
  'Alerta automatico (cron diario) alguns dias antes do vencimento da fatura.',
  'Sua assinatura vence em {{daysRemaining}} dias',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Sua assinatura esta perto de vencer</h1>
        <p style="margin:0 0 12px;">Ola, {{accountName}}!</p>
        <p style="margin:0 0 12px;">Sua assinatura do plano <strong>{{planName}}</strong> vence em <strong>{{dueDate}}</strong> ({{daysRemaining}} dias).</p>
        <p style="margin:0;">Garanta que a forma de pagamento cadastrada esteja em dia para evitar interrupcao no acesso.</p>
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
  '00000000-0000-4000-8000-000000000106',
  'QUOTE_SUMMARY',
  'Resumo de orcamento',
  'Enviado ao dono da conta quando um orcamento e aprovado ou exportado em PDF.',
  'Resumo do orcamento - {{customerName}}',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Orcamento {{triggerLabel}}</h1>
        <p style="margin:0 0 12px;">Ola, {{accountName}}!</p>
        <p style="margin:0 0 16px;">O orcamento para <strong>{{customerName}}</strong> foi {{triggerLabel}}.</p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 16px;">
          {{itemsHtml}}
        </table>
        <p style="margin:0 0 4px;font-size:16px;"><strong>Valor total: {{totalAmount}}</strong></p>
        <p style="margin:0;color:#71717a;font-size:13px;">Valido ate {{validUntil}}.</p>
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
);
