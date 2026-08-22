import type { EmailSendStatus, SupportedLanguage } from "@3d-budget/shared";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { EMAIL_TEMPLATE_VARIABLES, type EmailTemplateKey } from "./email-templates";
import { resendClient } from "./resend-client";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Also read by auth.service.ts when it creates the token (both sides must
// agree on the same TTL — the value shown here and the one actually
// enforced on redemption).
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;

// Display-only formatting swap (no real currency conversion) — see
// Contextos/Decisoes.md, 2026-08-17.
const toMoney = (value: number, language: SupportedLanguage): string =>
  language === "en"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const toDateLabel = (date: Date, language: SupportedLanguage): string =>
  language === "en"
    ? new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date)
    : new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date);

const triggerLabels: Record<"EXPORTED" | "APPROVED", Record<SupportedLanguage, string>> = {
  APPROVED: { "pt-BR": "aprovado", en: "approved" },
  EXPORTED: { "pt-BR": "exportado", en: "exported" },
};

// Best-effort deep link, not a verified exact route — same public host the
// checkout page already uses (see asaas-client.ts/asaas.service.ts), just
// pointed at the subscriptions list instead of a specific record. Good
// enough to get an admin to the right screen to search by
// asaasSubscriptionId; never presented as more precise than that.
const asaasSubscriptionsDashboardUrl = (): string =>
  env.asaasEnv === "production"
    ? "https://www.asaas.com/subscriptions"
    : "https://sandbox.asaas.com/subscriptions";

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
  // Bypasses the "template must be isActive" gate — only meant for
  // sendTest() below, where the whole point is letting an admin check a
  // template (including one they haven't activated yet) rather than
  // simulating what a real trigger would do.
  force?: boolean;
  // Stamped on the EmailLog row so the admin UI can tell a test send
  // apart from a real one, and so jobs/email-log-cleanup.job.ts knows
  // which rows are safe to purge after 48h. Only ever true from
  // sendTest() below.
  isTest?: boolean;
}

export interface EmailSendResult {
  status: EmailSendStatus;
  error: string | null;
}

export class EmailService {
  // Records an opt-out skip in EmailLog (mirrors the SKIPPED_INACTIVE path
  // in send()) so it's still visible to an admin in the Logs screen, even
  // though no template render/Resend call happens.
  private async skipForPreference(key: EmailTemplateKey, to: string): Promise<void> {
    await prisma.emailLog.create({
      data: {
        templateKey: key,
        toEmail: to,
        subject: key,
        status: "SKIPPED_PREFERENCE",
      },
    });
    logger.info(
      { key, to },
      "Recipient opted out of this email category — skipping send",
    );
  }


  // Renders and sends one templated email. Never throws — most callers
  // fire this without awaiting (see the call sites in auth.service.ts,
  // webhook.controller.ts, quote.service.ts) because a Resend outage must
  // never fail or slow down the action the email rides along with. The
  // returned result exists for callers that DO want to know what
  // happened (sendTest() below, surfaced to the admin UI) — everyone else
  // is free to ignore it.
  async send(
    key: EmailTemplateKey,
    language: SupportedLanguage,
    to: string,
    variables: Record<string, string>,
    options: SendOptions = {},
  ): Promise<EmailSendResult> {
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
          return { status: "SENT", error: null };
        }
      }

      const template = await prisma.emailTemplate.findUnique({
        where: { key_language: { key, language } },
      });

      if (!template || (!template.isActive && !options.force)) {
        await prisma.emailLog.create({
          data: {
            templateKey: key,
            toEmail: to,
            subject: template?.subject ?? key,
            status: "SKIPPED_INACTIVE",
            dedupeKey: options.dedupeKey,
            isTest: options.isTest ?? false,
          },
        });
        logger.info(
          { key, to, found: Boolean(template) },
          "Email template missing or inactive — skipping send",
        );
        return {
          status: "SKIPPED_INACTIVE",
          error: template
            ? "Template esta inativo."
            : "Template nao encontrado.",
        };
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
          bodyHtml: html,
          isTest: options.isTest ?? false,
        },
      });

      return {
        status: result.error ? "FAILED" : "SENT",
        error: result.error,
      };
    } catch (error) {
      logger.error({ err: error, key, to }, "Unexpected error sending email");
      return {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Sends a real email through the exact same path as every real trigger
  // (send(), Resend, EmailLog) but to an address the admin chooses, filled
  // with the same sampleValue data the "Visualizar" preview uses — so what
  // lands in the inbox matches what the preview showed. logoUrl is
  // excluded: it's a relative path in the registry (fine for the
  // preview's own-origin trick in the frontend), but send() already
  // computes the real absolute URL itself and would have it overridden by
  // a broken relative one otherwise.
  async sendTest(
    key: EmailTemplateKey,
    language: SupportedLanguage,
    to: string,
  ): Promise<EmailSendResult> {
    const sampleVariables = Object.fromEntries(
      EMAIL_TEMPLATE_VARIABLES[key]
        .filter((variable) => variable.name !== "logoUrl")
        .map((variable) => [variable.name, variable.sampleValue]),
    );

    return this.send(key, language, to, sampleVariables, { force: true, isTest: true });
  }

  async sendAccountCreated(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: { include: { plan: { select: { name: true } } } } },
    });

    if (!user || !user.company) {
      return;
    }

    const language = user.language as SupportedLanguage;

    await this.send("ACCOUNT_CREATED", language, user.email, {
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

    const language = user.language as SupportedLanguage;

    await this.send("PASSWORD_RESET", language, user.email, {
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
        include: {
          user: { select: { email: true, language: true, notifyFinancialEmails: true } },
          plan: { select: { name: true } },
        },
      }),
      prisma.payment.findUnique({ where: { id: paymentId } }),
    ]);

    if (!company || !payment) {
      return;
    }

    if (!company.user.notifyFinancialEmails) {
      await this.skipForPreference("SUBSCRIPTION_CONFIRMED", company.user.email);
      return;
    }

    const language = company.user.language as SupportedLanguage;

    await this.send(
      "SUBSCRIPTION_CONFIRMED",
      language,
      company.user.email,
      {
        accountName: company.name,
        planName: company.plan.name,
        planPrice: toMoney(Number(payment.value), language),
        nextDueDate: payment.dueDate ? toDateLabel(payment.dueDate, language) : "-",
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
        include: {
          user: { select: { email: true, language: true, notifyFinancialEmails: true } },
          plan: { select: { name: true } },
        },
      }),
      prisma.payment.findUnique({ where: { id: paymentId } }),
    ]);

    if (!company || !payment) {
      return;
    }

    if (!company.user.notifyFinancialEmails) {
      await this.skipForPreference("SUBSCRIPTION_RENEWED", company.user.email);
      return;
    }

    const language = company.user.language as SupportedLanguage;

    await this.send(
      "SUBSCRIPTION_RENEWED",
      language,
      company.user.email,
      {
        accountName: company.name,
        planName: company.plan.name,
        planPrice: toMoney(Number(payment.value), language),
        paymentDate: payment.paymentDate ? toDateLabel(payment.paymentDate, language) : "-",
        nextDueDate: payment.dueDate ? toDateLabel(payment.dueDate, language) : "-",
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
        include: {
          user: { select: { email: true, language: true, notifyFinancialEmails: true } },
          plan: { select: { name: true } },
        },
      }),
      prisma.payment.findUnique({ where: { id: paymentId } }),
    ]);

    if (!company || !payment || !payment.dueDate) {
      return;
    }

    if (!company.user.notifyFinancialEmails) {
      await this.skipForPreference("SUBSCRIPTION_EXPIRING", company.user.email);
      return;
    }

    const language = company.user.language as SupportedLanguage;
    const daysRemaining = Math.max(
      0,
      Math.ceil((payment.dueDate.getTime() - Date.now()) / MS_PER_DAY),
    );

    await this.send(
      "SUBSCRIPTION_EXPIRING",
      language,
      company.user.email,
      {
        accountName: company.name,
        planName: company.plan.name,
        dueDate: toDateLabel(payment.dueDate, language),
        daysRemaining: String(daysRemaining),
      },
      { dedupeKey: `SUBSCRIPTION_EXPIRING:${payment.id}` },
    );
  }

  // Fired from webhook.controller.ts on a PAYMENT_OVERDUE event, guarded
  // the same way sendSubscriptionConfirmed/Renewed are (isNewPaymentRecord,
  // checked before the Payment upsert) so a redelivered webhook for the
  // same overdue invoice never sends this twice.
  async sendPaymentOverdue(companyId: string, paymentId: string): Promise<void> {
    const [company, payment] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        include: {
          user: { select: { email: true, language: true, notifyFinancialEmails: true } },
          plan: { select: { name: true } },
        },
      }),
      prisma.payment.findUnique({ where: { id: paymentId } }),
    ]);

    if (!company || !payment) {
      return;
    }

    if (!company.user.notifyFinancialEmails) {
      await this.skipForPreference("PAYMENT_OVERDUE", company.user.email);
      return;
    }

    const language = company.user.language as SupportedLanguage;

    await this.send(
      "PAYMENT_OVERDUE",
      language,
      company.user.email,
      {
        accountName: company.name,
        planName: company.plan.name,
        planPrice: toMoney(Number(payment.value), language),
        dueDate: payment.dueDate ? toDateLabel(payment.dueDate, language) : "-",
        // Asaas doesn't always send an invoiceUrl on this event — fall back
        // to the billing dashboard so the button never points nowhere.
        invoiceUrl: payment.invoiceUrl ?? `${env.appBaseUrl}/dashboard/billing`,
      },
      { dedupeKey: `PAYMENT_OVERDUE:${payment.id}` },
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
        include: {
          user: { select: { email: true, language: true, notifyQuoteEmails: true } },
        },
      }),
      prisma.quote.findFirst({
        where: { id: quoteId, companyId },
        include: { printItems: { orderBy: { createdAt: "asc" } } },
      }),
    ]);

    if (!company || !quote) {
      return;
    }

    if (!company.user.notifyQuoteEmails) {
      await this.skipForPreference("QUOTE_SUMMARY", company.user.email);
      return;
    }

    const language = company.user.language as SupportedLanguage;
    const itemsHtml = quote.printItems
      .map(
        (item) =>
          `<tr><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;">${escapeHtml(item.modelName)}</td><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;text-align:right;">${toMoney(Number(item.finalPrice), language)}</td></tr>`,
      )
      .join("");

    await this.send("QUOTE_SUMMARY", language, company.user.email, {
      accountName: company.name,
      customerName: quote.customerName,
      totalAmount: toMoney(Number(quote.totalAmount), language),
      validUntil: toDateLabel(quote.validUntil, language),
      itemsHtml,
      triggerLabel: triggerLabels[trigger][language],
    });
  }

  // Fired from asaas.service.ts#revertSubscriptionToFullPrice's catch block
  // when the automatic call to push a ONE_TIME coupon's subscription back
  // to full price fails — this is a real revenue leak until an admin fixes
  // it by hand in the Asaas dashboard, so every active admin gets notified,
  // always in pt-BR (admin screens/alerts stay Portuguese-only regardless
  // of who's on call — see Contextos/Decisoes.md). dedupeKey is per
  // admin+payment so a retried/redelivered webhook (which itself never
  // re-enters this path — see webhook.controller.ts's isFirstActivation
  // guard) can never double-send even if this were ever called twice.
  async sendCouponRevertFailed(input: {
    companyName: string;
    couponCode: string;
    asaasSubscriptionId: string;
    fullPrice: number;
    errorMessage: string;
    paymentId: string;
  }): Promise<void> {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { email: true },
    });

    if (admins.length === 0) {
      logger.error(
        { ...input },
        "No active admin user to notify about a failed coupon price revert — fix this subscription manually in the Asaas dashboard",
      );
      return;
    }

    const variables = {
      accountName: input.companyName,
      couponCode: input.couponCode,
      asaasSubscriptionId: input.asaasSubscriptionId,
      fullPrice: toMoney(input.fullPrice, "pt-BR"),
      errorMessage: input.errorMessage,
      subscriptionsUrl: asaasSubscriptionsDashboardUrl(),
    };

    await Promise.all(
      admins.map((admin) =>
        this.send("COUPON_REVERT_FAILED", "pt-BR", admin.email, variables, {
          dedupeKey: `COUPON_REVERT_FAILED:${input.paymentId}:${admin.email}`,
        }),
      ),
    );
  }
}

export const emailService = new EmailService();
