import type {
  EmailTemplateKey,
  EmailTemplateResource,
  SupportedLanguage,
} from "@3d-budget/shared";
import type { EmailTemplate } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { EMAIL_TEMPLATE_VARIABLES } from "./email-templates";
import type { EmailTemplateUpdateInput } from "../validators/email-template.validator";

export const toEmailTemplateResource = (
  template: EmailTemplate,
): EmailTemplateResource => {
  const key = template.key as EmailTemplateKey;

  return {
    id: template.id,
    key,
    language: template.language as SupportedLanguage,
    name: template.name,
    description: template.description,
    subject: template.subject,
    bodyHtml: template.bodyHtml,
    isActive: template.isActive,
    availableVariables: EMAIL_TEMPLATE_VARIABLES[key] ?? [],
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
};

// 12 rows total (6 keys x pt-BR/en), seeded by migration — each key is
// wired to a specific send-trigger in email.service.ts, which picks the
// row matching the recipient's language. Deliberately no create/delete
// here, only listing and editing content (name/subject/bodyHtml/isActive).
export class EmailTemplateService {
  async listAll(): Promise<EmailTemplateResource[]> {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: [{ key: "asc" }, { language: "asc" }],
    });

    return templates.map(toEmailTemplateResource);
  }

  async getById(id: string): Promise<EmailTemplate> {
    const template = await prisma.emailTemplate.findUnique({ where: { id } });

    if (!template) {
      throw new AppError("Email template not found.", 404, "EMAIL_TEMPLATE_NOT_FOUND");
    }

    return template;
  }

  async update(
    id: string,
    input: EmailTemplateUpdateInput,
  ): Promise<EmailTemplateResource> {
    await this.getById(id);

    const template = await prisma.emailTemplate.update({
      where: { id },
      data: {
        name: input.name,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        isActive: input.isActive,
      },
    });

    return toEmailTemplateResource(template);
  }
}

export const emailTemplateService = new EmailTemplateService();
