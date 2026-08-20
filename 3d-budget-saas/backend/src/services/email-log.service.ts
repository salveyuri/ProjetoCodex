import type {
  EmailDeliveryStatus,
  EmailLogDetailResource,
  EmailLogResource,
  EmailSendStatus,
  PaginatedEmailLogList,
} from "@3d-budget/shared";
import type { EmailLog, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import type { EmailLogListQueryInput } from "../validators/email-template.validator";

export const toEmailLogResource = (log: EmailLog): EmailLogResource => ({
  id: log.id,
  templateKey: log.templateKey,
  toEmail: log.toEmail,
  subject: log.subject,
  status: log.status as EmailSendStatus,
  resendMessageId: log.resendMessageId,
  errorMessage: log.errorMessage,
  deliveryStatus: log.deliveryStatus as EmailDeliveryStatus | null,
  deliveryDetail: log.deliveryDetail,
  deliveryUpdatedAt: log.deliveryUpdatedAt?.toISOString() ?? null,
  isTest: log.isTest,
  createdAt: log.createdAt.toISOString(),
});

export const toEmailLogDetailResource = (log: EmailLog): EmailLogDetailResource => ({
  ...toEmailLogResource(log),
  bodyHtml: log.bodyHtml,
});

// Read-only — every row is written by EmailService.send()/skipForPreference()
// as a side effect of an actual (or attempted) send, including the
// "Testar e-mail" button in /admin/email-templates. Nothing here creates or
// mutates a log entry.
export class EmailLogService {
  async list(query: EmailLogListQueryInput): Promise<PaginatedEmailLogList> {
    const where: Prisma.EmailLogWhereInput = {
      status: query.status,
      deliveryStatus: query.deliveryStatus,
      isTest: query.isTest,
    };
    const skip = (query.page - 1) * query.pageSize;

    const [logs, total] = await prisma.$transaction([
      prisma.emailLog.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.emailLog.count({ where }),
    ]);

    return {
      data: logs.map(toEmailLogResource),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async getById(id: string): Promise<EmailLogDetailResource> {
    const log = await prisma.emailLog.findUnique({ where: { id } });

    if (!log) {
      throw new AppError("Email log not found.", 404, "EMAIL_LOG_NOT_FOUND");
    }

    return toEmailLogDetailResource(log);
  }
}

export const emailLogService = new EmailLogService();
