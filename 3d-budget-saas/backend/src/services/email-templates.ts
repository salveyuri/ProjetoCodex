export const EMAIL_TEMPLATE_KEYS = [
  "ACCOUNT_CREATED",
  "PASSWORD_RESET",
  "SUBSCRIPTION_CONFIRMED",
  "SUBSCRIPTION_RENEWED",
  "SUBSCRIPTION_EXPIRING",
  "QUOTE_SUMMARY",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

interface EmailTemplateVariable {
  name: string;
  description: string;
  // Fake-but-plausible value used to render a preview (admin screen "Visualizar")
  // without needing a real user/company/payment on hand. Never sent for real —
  // EmailService.send() always fills these from actual data.
  sampleValue: string;
}

const SAMPLE_ITEMS_HTML =
  '<tr><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;">Suporte para vaso</td><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;text-align:right;">R$ 120,00</td></tr>' +
  '<tr><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;">Engrenagem customizada</td><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;text-align:right;">R$ 125,90</td></tr>';

// Documents which {{variavel}} placeholders each template can use — shown
// to the admin in /admin/email-templates (same idea as the formula editor's
// "Variaveis disponiveis" panel) and used by EmailService to know what to
// render for each trigger. sampleValue feeds the "Visualizar" preview.
export const EMAIL_TEMPLATE_VARIABLES: Record<
  EmailTemplateKey,
  EmailTemplateVariable[]
> = {
  ACCOUNT_CREATED: [
    { name: "accountName", description: "Nome da empresa/conta.", sampleValue: "Oficina 3D Exemplo" },
    { name: "email", description: "E-mail de login cadastrado.", sampleValue: "contato@exemplo.com" },
    { name: "planName", description: "Nome do plano inicial (Free).", sampleValue: "Free" },
    { name: "loginUrl", description: "Link para a tela de login.", sampleValue: "https://app.pricify3d.com/login" },
    { name: "logoUrl", description: "URL da logo do Pricify3D.", sampleValue: "/logo_full.webp" },
  ],
  PASSWORD_RESET: [
    { name: "accountName", description: "Nome da empresa/conta.", sampleValue: "Oficina 3D Exemplo" },
    {
      name: "resetUrl",
      description: "Link com o token de redefinicao de senha.",
      sampleValue: "https://app.pricify3d.com/reset-password?token=exemplo",
    },
    { name: "expiresInMinutes", description: "Minutos ate o link expirar.", sampleValue: "30" },
    { name: "logoUrl", description: "URL da logo do Pricify3D.", sampleValue: "/logo_full.webp" },
  ],
  SUBSCRIPTION_CONFIRMED: [
    { name: "accountName", description: "Nome da empresa/conta.", sampleValue: "Oficina 3D Exemplo" },
    { name: "planName", description: "Nome do plano assinado.", sampleValue: "Pro" },
    { name: "planPrice", description: "Preco do plano, formatado em R$.", sampleValue: "R$ 49,90" },
    { name: "nextDueDate", description: "Data do proximo vencimento.", sampleValue: "15/09/2026" },
    { name: "logoUrl", description: "URL da logo do Pricify3D.", sampleValue: "/logo_full.webp" },
  ],
  SUBSCRIPTION_RENEWED: [
    { name: "accountName", description: "Nome da empresa/conta.", sampleValue: "Oficina 3D Exemplo" },
    { name: "planName", description: "Nome do plano assinado.", sampleValue: "Pro" },
    { name: "planPrice", description: "Preco do plano, formatado em R$.", sampleValue: "R$ 49,90" },
    {
      name: "paymentDate",
      description: "Data em que o pagamento foi confirmado.",
      sampleValue: "15/08/2026",
    },
    { name: "nextDueDate", description: "Data do proximo vencimento.", sampleValue: "15/09/2026" },
    { name: "logoUrl", description: "URL da logo do Pricify3D.", sampleValue: "/logo_full.webp" },
  ],
  SUBSCRIPTION_EXPIRING: [
    { name: "accountName", description: "Nome da empresa/conta.", sampleValue: "Oficina 3D Exemplo" },
    { name: "planName", description: "Nome do plano assinado.", sampleValue: "Pro" },
    { name: "dueDate", description: "Data do vencimento.", sampleValue: "18/08/2026" },
    { name: "daysRemaining", description: "Dias restantes ate o vencimento.", sampleValue: "3" },
    { name: "logoUrl", description: "URL da logo do Pricify3D.", sampleValue: "/logo_full.webp" },
  ],
  QUOTE_SUMMARY: [
    { name: "accountName", description: "Nome da empresa/conta.", sampleValue: "Oficina 3D Exemplo" },
    { name: "customerName", description: "Nome do cliente do orcamento.", sampleValue: "Maria Cliente" },
    {
      name: "totalAmount",
      description: "Valor total do orcamento, formatado em R$.",
      sampleValue: "R$ 245,90",
    },
    { name: "validUntil", description: "Data de validade do orcamento.", sampleValue: "22/08/2026" },
    {
      name: "itemsHtml",
      description: "Lista das mesas/pecas, ja renderizada em HTML.",
      sampleValue: SAMPLE_ITEMS_HTML,
    },
    {
      name: "triggerLabel",
      description: "'exportado' ou 'aprovado', conforme o que disparou o envio.",
      sampleValue: "aprovado",
    },
    { name: "logoUrl", description: "URL da logo do Pricify3D.", sampleValue: "/logo_full.webp" },
  ],
};
