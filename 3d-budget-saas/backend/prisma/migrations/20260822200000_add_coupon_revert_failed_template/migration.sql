-- Seeds the COUPON_REVERT_FAILED email template — só pt-BR de propósito
-- (alerta interno pro admin, não e-mail pro cliente; telas de admin ficam
-- só em português neste projeto). Disparado de
-- asaas.service.ts#revertSubscriptionToFullPrice quando a chamada ao Asaas
-- pra voltar o valor de uma assinatura com cupom de uso único falha.
INSERT INTO "email_templates" ("id", "key", "language", "name", "description", "subject", "body_html", "is_active", "created_at", "updated_at")
VALUES
(
  '00000000-0000-4000-8000-000000000108',
  'COUPON_REVERT_FAILED',
  'pt-BR',
  'Falha ao reverter cupom de uso unico',
  'Enviado pra todo admin ativo quando a chamada automatica pro Asaas (voltar o valor da assinatura ao preco cheio, depois da primeira cobranca de um cupom de uso unico) falha.',
  'Acao manual necessaria: assinatura de {{accountName}} precisa ser corrigida no Asaas',
  $body$<div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr>
      <td style="background-color:#111827;padding:24px 32px;text-align:center;">
        <img src="{{logoUrl}}" alt="Pricify3D" height="36" style="height:36px;" />
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#dc2626;">Acao manual necessaria no Asaas</h1>
        <p style="margin:0 0 12px;">O cupom de uso unico <strong>{{couponCode}}</strong>, usado pela empresa <strong>{{accountName}}</strong>, cobrou certo na primeira fatura - mas a tentativa automatica de voltar a assinatura pro preco cheio a partir da proxima cobranca falhou.</p>
        <p style="margin:0 0 12px;">Sem correcao manual, essa assinatura vai continuar cobrando o valor com desconto indefinidamente.</p>
        <table role="presentation" width="100%" style="margin:16px 0;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 12px;background-color:#fafafa;border:1px solid #e4e4e7;font-weight:600;width:40%;">Empresa</td>
            <td style="padding:8px 12px;background-color:#fafafa;border:1px solid #e4e4e7;">{{accountName}}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border:1px solid #e4e4e7;font-weight:600;">ID da assinatura (Asaas)</td>
            <td style="padding:8px 12px;border:1px solid #e4e4e7;font-family:monospace;">{{asaasSubscriptionId}}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background-color:#fafafa;border:1px solid #e4e4e7;font-weight:600;">Valor que deve ser configurado</td>
            <td style="padding:8px 12px;background-color:#fafafa;border:1px solid #e4e4e7;"><strong>{{fullPrice}}</strong> (preco cheio do plano)</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border:1px solid #e4e4e7;font-weight:600;">Erro retornado</td>
            <td style="padding:8px 12px;border:1px solid #e4e4e7;">{{errorMessage}}</td>
          </tr>
        </table>
        <p style="margin:0 0 12px;">No painel do Asaas: <strong>Cobrancas &gt; Assinaturas</strong>, pesquise pelo ID acima e edite o valor da assinatura manualmente.</p>
        <p style="text-align:center;margin:24px 0 0;">
          <a href="{{subscriptionsUrl}}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Abrir assinaturas no Asaas</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
        Pricify3D - alerta interno, nao enviado ao cliente
      </td>
    </tr>
  </table>
</div>$body$,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
