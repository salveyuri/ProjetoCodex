import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { EmailTemplateKey } from "./email-templates";
import { resendClient } from "./resend-client";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Also read by auth.service.ts when it creates the token (both sides must
// agree on the same TTL — the value shown here and the one actually
// enforced on redemption).
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;

const toBRL = (value: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );

const toDateLabel = (date: Date): string =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Subject lines are plain text (never HTML-rendered by a mail client) — only
// strip newlines, which would otherwise let a variable (e.g. a company name)
// inject extra header-like lines.
const substituteSubject = (
  text: string,
  variables: Record<string, string>,
): string =>
  text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in variables)) {
      logger.warn({ key }, "Email template variable not provided");
      return "";
    }

    return variables[key].replace(/[\r\n]+/g, " ");
  });

// HTML body: every variable is escaped by default (company/customer names
// are user-controlled input) except pre-rendered HTML fragments we built
// ourselves, flagged by a "...Html" key suffix (e.g. itemsHtml).
const substituteHtml = (
  text: string,
  variables: Record<string, string>,
): string =>
  text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in variables)) {
      logger.warn({ key }, "Email template variable not provided");
      return "";
    }

    const value = variables[key];
    return key.endsWith("Html") ? value : escapeHtml(value);
  });

interface SendOptions {
  dedupeKey?: string;
}

export class EmailService {
  // Renders and sends one templated email. Never throws — callers fire
  // this without awaiting (see the call sites in auth.service.ts,
  // webhook.controller.ts, quote.service.ts) because a Resend outage must
  // never fail or slow down the action the email rides along with.
  async send(
    key: EmailTemplateKey,
    to: string,
    variables: Record<string, string>,
    options: SendOptions = {},
  ): Promise<void> {
    try {
      if (options.dedupeKey) {
        const alreadySent = await prisma.emailLog.findUnique({
          where: { dedupeKey: options.dedupeKey },
          select: { id: true },
        });

        if (alreadySent) {
          logger.debug(
            { key, dedupeKey: options.dedupeKey },
            "Email already sent for this dedupe key, skipping",
          );
          return;
        }
      }

      const template = await prisma.emailTemplate.findUnique({ where: { key } });

      if (!template || !template.isActive) {
        await prisma.emailLog.create({
          data: {
            templateKey: key,
            toEmail: to,
            subject: template?.subject ?? key,
            status: "SKIPPED_INACTIVE",
            dedupeKey: options.dedupeKey,
          },
        });
        logger.info(
          { key, to, found: Boolean(template) },
          "Email template missing or inactive — skipping send",
        );
        return;
      }

      const allVariables = {
        logoUrl: `${env.appBaseUrl}/logo_full.webp`,
        ...variables,
      };
      const subject = substituteSubject(template.subject, allVariables);
      const html = substituteHtml(template.bodyHtml, allVariables);
      const result = await resendClient.send({ to, subject, html });

      await prisma.emailLog.create({
        data: {
          templateKey: key,
          toEmail: to,
          subject,
          status: result.error ? "FAILED" : "SENT",
          resendMessageId: result.id,
          errorMessage: result.error,
          dedupeKey: options.dedupeKey,
        },
      });
    } catch (error) {
      logger.error({ err: error, key, to }, "Unexpected error sending email");
    }
  }

  async sendAccountCreated(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: { include: { plan: { select: { name: true } } } } },
    });

    if (!user || !user.company) {
      return;
    }

    await this.send("ACCOUNT_CREATED", user.email, {
      accountName: user.company.name,
      email: user.email,
      planName: user.company.plan.name,
      loginUrl: `${env.appBaseUrl}/login`,
    });
  }

  async sendPasswordReset(userId: string, rawToken: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: { select: { name: true } } },
    });

    if (!user) {
      return;
    }

    await this.send("PASSWORD_RESET", user.email, {
      accountName: user.company?.name ?? user.email,
      resetUrl: `${env.appBaseUrl}/reset-password?token=${rawToken}`,
      expiresInMinutes: String(PASSWORD_RESET_TOKEN_TTL_MINUTES),
    });
  }

  async sendSubscriptionConfirmed(
    companyId: string,
    paymentId: string,
  ): Promise<void> {
    const [company, payment] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        include: { user: { select: { email: true } }, plan: { select: { name: true } } },
      }),
      prisma.payment.findUnique({ where: { id: paymentId } }),
    ]);

    if (!company || !payment) {
      return;
    }

    await this.send(
      "SUBSCRIPTION_CONFIRMED",
      company.user.email,
      {
        accountName: company.name,
        planName: company.plan.name,
        planPrice: toBRL(Number(payment.value)),
        nextDueDate: payment.dueDate ? toDateLabel(payment.dueDate) : "-",
      },
      { dedupeKey: `SUBSCRIPTION_CONFIRMED:${payment.id}` },
    );
  }

  async sendSubscriptionRenewed(
    companyId: string,
    paymentId: string,
  ): Promise<void> {
    const [company, payment] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        include: { user: { select: { email: true } }, plan: { select: { name: true } } },
      }),
      prisma.payment.findUnique({ where: { id: paymentId } }),
    ]);

    if (!company || !payment) {
      return;
    }

    await this.send(
      "SUBSCRIPTION_RENEWED",
      company.user.email,
      {
        accountName: company.name,
        planName: company.plan.name,
        planPrice: toBRL(Number(payment.value)),
        paymentDate: payment.paymentDate ? toDateLabel(payment.paymentDate) : "-",
        nextDueDate: payment.dueDate ? toDateLabel(payment.dueDate) : "-",
      },
      { dedupeKey: `SUBSCRIPTION_RENEWED:${payment.id}` },
    );
  }

  async sendSubscriptionExpiring(
    companyId: string,
    paymentId: string,
  ): Promise<void> {
    const [company, payment] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        include: { user: { select: { email: true } }, plan: { select: { name: true } } },
      }),
      prisma.payment.findUnique({ where: { id: paymentId } }),
    ]);

    if (!company || !payment || !payment.dueDate) {
      return;
    }

    const daysRemaining = Math.max(
      0,
      Math.ceil((payment.dueDate.getTime() - Date.now()) / MS_PER_DAY),
    );

    await this.send(
      "SUBSCRIPTION_EXPIRING",
      company.user.email,
      {
        accountName: company.name,
        planName: company.plan.name,
        dueDate: toDateLabel(payment.dueDate),
        daysRemaining: String(daysRemaining),
      },
      { dedupeKey: `SUBSCRIPTION_EXPIRING:${payment.id}` },
    );
  }

  async sendQuoteSummary(
    companyId: string,
    quoteId: string,
    trigger: "EXPORTED" | "APPROVED",
  ): Promise<void> {
    const [company, quote] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        include: { user: { select: { email: true } } },
      }),
      prisma.quote.findFirst({
        where: { id: quoteId, companyId },
        include: { printItems: { orderBy: { createdAt: "asc" } } },
      }),
    ]);

    if (!company || !quote) {
      return;
    }

    const itemsHtml = quote.printItems
      .map(
        (item) =>
          `<tr><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;">${escapeHtml(item.modelName)}</td><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;text-align:right;">${toBRL(Number(item.finalPrice))}</td></tr>`,
      )
      .join("");

    await this.send("QUOTE_SUMMARY", company.user.email, {
      accountName: company.name,
      customerName: quote.customerName,
      totalAmount: toBRL(Number(quote.totalAmount)),
      validUntil: toDateLabel(quote.validUntil),
      itemsHtml,
      triggerLabel: trigger === "APPROVED" ? "aprovado" : "exportado",
    });
  }
}

export const emailService = new EmailService();
