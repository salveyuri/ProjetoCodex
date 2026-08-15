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
}

// Documents which {{variavel}} placeholders each template can use — shown
// to the admin in /admin/email-templates (same idea as the formula editor's
// "Variaveis disponiveis" panel) and used by EmailService to know what to
// render for each trigger.
export const EMAIL_TEMPLATE_VARIABLES: Record<
  EmailTemplateKey,
  EmailTemplateVariable[]
> = {
  ACCOUNT_CREATED: [
    { name: "accountName", description: "Nome da empresa/conta." },
    { name: "email", description: "E-mail de login cadastrado." },
    { name: "planName", description: "Nome do plano inicial (Free)." },
    { name: "loginUrl", description: "Link para a tela de login." },
    { name: "logoUrl", description: "URL da logo do Pricify3D." },
  ],
  PASSWORD_RESET: [
    { name: "accountName", description: "Nome da empresa/conta." },
    { name: "resetUrl", description: "Link com o token de redefinicao de senha." },
    { name: "expiresInMinutes", description: "Minutos ate o link expirar." },
    { name: "logoUrl", description: "URL da logo do Pricify3D." },
  ],
  SUBSCRIPTION_CONFIRMED: [
    { name: "accountName", description: "Nome da empresa/conta." },
    { name: "planName", description: "Nome do plano assinado." },
    { name: "planPrice", description: "Preco do plano, formatado em R$." },
    { name: "nextDueDate", description: "Data do proximo vencimento." },
    { name: "logoUrl", description: "URL da logo do Pricify3D." },
  ],
  SUBSCRIPTION_RENEWED: [
    { name: "accountName", description: "Nome da empresa/conta." },
    { name: "planName", description: "Nome do plano assinado." },
    { name: "planPrice", description: "Preco do plano, formatado em R$." },
    { name: "paymentDate", description: "Data em que o pagamento foi confirmado." },
    { name: "nextDueDate", description: "Data do proximo vencimento." },
    { name: "logoUrl", description: "URL da logo do Pricify3D." },
  ],
  SUBSCRIPTION_EXPIRING: [
    { name: "accountName", description: "Nome da empresa/conta." },
    { name: "planName", description: "Nome do plano assinado." },
    { name: "dueDate", description: "Data do vencimento." },
    { name: "daysRemaining", description: "Dias restantes ate o vencimento." },
    { name: "logoUrl", description: "URL da logo do Pricify3D." },
  ],
  QUOTE_SUMMARY: [
    { name: "accountName", description: "Nome da empresa/conta." },
    { name: "customerName", description: "Nome do cliente do orcamento." },
    { name: "totalAmount", description: "Valor total do orcamento, formatado em R$." },
    { name: "validUntil", description: "Data de validade do orcamento." },
    { name: "itemsHtml", description: "Lista das mesas/pecas, ja renderizada em HTML." },
    {
      name: "triggerLabel",
      description: "'exportado' ou 'aprovado', conforme o que disparou o envio.",
    },
    { name: "logoUrl", description: "URL da logo do Pricify3D." },
  ],
};
