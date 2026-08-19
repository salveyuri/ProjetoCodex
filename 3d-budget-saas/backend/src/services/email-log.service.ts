import type {
  EmailLogResource,
  EmailSendStatus,
  PaginatedEmailLogList,
} from "@3d-budget/shared";
import type { EmailLog } from "@prisma/client";
import { prisma } from "../config/prisma";
import type { EmailLogListQueryInput } from "../validators/email-template.validator";

export const toEmailLogResource = (log: EmailLog): EmailLogResource => ({
  id: log.id,
  templateKey: log.templateKey,
  toEmail: log.toEmail,
  subject: log.subject,
  status: log.status as EmailSendStatus,
  resendMessageId: log.resendMessageId,
  errorMessage: log.errorMessage,
  createdAt: log.createdAt.toISOString(),
});

// Read-only — every row is written by EmailService.send()/skipForPreference()
// as a side effect of an actual (or attempted) send, including the
// "Testar e-mail" button in /admin/email-templates. Nothing here creates or
// mutates a log entry.
export class EmailLogService {
  async list(query: EmailLogListQueryInput): Promise<PaginatedEmailLogList> {
    const where = query.status ? { status: query.status } : {};
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
}

export const emailLogService = new EmailLogService();
