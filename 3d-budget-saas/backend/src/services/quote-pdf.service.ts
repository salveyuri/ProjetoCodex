import type { Prisma } from "@prisma/client";
import PDFDocument from "pdfkit";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";

const quotePdfInclude = {
  company: {
    include: {
      user: { select: { email: true } },
    },
  },
  formula: { select: { name: true } },
  printItems: {
    orderBy: { createdAt: "asc" as const },
    include: {
      machine: { select: { name: true } },
      material: { select: { brand: true, color: true, type: true } },
    },
  },
} satisfies Prisma.QuoteInclude;

type QuotePdfRecord = Prisma.QuoteGetPayload<{ include: typeof quotePdfInclude }>;

interface QuotePdfResult {
  buffer: Buffer;
  filename: string;
}

const colors = {
  primary: "#6366F1",
  primaryDark: "#4338CA",
  ink: "#111827",
  muted: "#6B7280",
  soft: "#F8FAFC",
  line: "#E5E7EB",
  white: "#FFFFFF",
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const decimalToNumber = (value: Prisma.Decimal): number =>
  Number(value.toString());

const formatMoney = (value: Prisma.Decimal | number): string =>
  currencyFormatter.format(
    typeof value === "number" ? value : decimalToNumber(value),
  );

const formatDate = (value: Date): string => dateFormatter.format(value);

const sanitizeFilenamePart = (value: string): string => {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return normalized.slice(0, 48) || "Cliente";
};

const buildFilename = (quote: QuotePdfRecord): string => {
  const shortId = quote.id.slice(0, 8);
  const customer = sanitizeFilenamePart(quote.customerName);

  return `Orcamento_${shortId}_${customer}.pdf`;
};

const collectDocument = (doc: PDFKit.PDFDocument): Promise<Buffer> => {
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer | Uint8Array) => {
    chunks.push(Buffer.from(chunk));
  });

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
};

const getLogoBuffer = (logoUrl: string | null): Buffer | null => {
  if (!logoUrl) {
    return null;
  }

  const dataUri = /^data:image\/(?:png|jpe?g);base64,(.+)$/i.exec(logoUrl);

  if (!dataUri) {
    return null;
  }

  try {
    return Buffer.from(dataUri[1], "base64");
  } catch {
    return null;
  }
};

const drawLogo = (
  doc: PDFKit.PDFDocument,
  quote: QuotePdfRecord,
  x: number,
  y: number,
): void => {
  const logoBuffer = getLogoBuffer(quote.company.logoUrl);

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, x, y, { fit: [58, 58] });
      return;
    } catch {
      // Falls back to monogram when an uploaded image is not readable.
    }
  }

  const initials = quote.company.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  doc
    .roundedRect(x, y, 58, 58, 12)
    .fill(colors.primary)
    .fillColor(colors.white)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(initials || "3D", x, y + 20, {
      width: 58,
      align: "center",
    });
};

const drawKeyValue = (
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): void => {
  doc
    .fillColor(colors.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(label.toUpperCase(), x, y, { width });
  doc
    .fillColor(colors.ink)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(value, x, y + 12, { width });
};

const drawHeader = (doc: PDFKit.PDFDocument, quote: QuotePdfRecord): void => {
  const margin = 48;
  const rightX = 365;

  drawLogo(doc, quote, margin, margin);

  doc
    .fillColor(colors.ink)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(quote.company.name, margin + 74, margin + 2, { width: 260 });
  doc
    .fillColor(colors.muted)
    .font("Helvetica")
    .fontSize(9)
    .text(`Contato: ${quote.company.user.email}`, margin + 74, margin + 28, {
      width: 260,
    })
    .text("CNPJ/CPF: nao informado", margin + 74, margin + 42, {
      width: 260,
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(colors.primaryDark)
    .text("ORCAMENTO", rightX, margin, { width: 180, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(colors.muted)
    .text(`#${quote.id.slice(0, 8).toUpperCase()}`, rightX, margin + 28, {
      width: 180,
      align: "right",
    })
    .text(`Status: ${quote.status}`, rightX, margin + 42, {
      width: 180,
      align: "right",
    });

  doc
    .moveTo(margin, 128)
    .lineTo(doc.page.width - margin, 128)
    .lineWidth(2)
    .strokeColor(colors.primary)
    .stroke();
};

const drawCustomerBlock = (
  doc: PDFKit.PDFDocument,
  quote: QuotePdfRecord,
  y: number,
): number => {
  const margin = 48;
  const width = doc.page.width - margin * 2;

  doc.roundedRect(margin, y, width, 72, 10).fill(colors.soft);
  drawKeyValue(doc, "Cliente", quote.customerName, margin + 18, y + 16, 210);
  drawKeyValue(doc, "Emitido em", formatDate(quote.createdAt), margin + 248, y + 16, 100);
  drawKeyValue(doc, "Validade", formatDate(quote.validUntil), margin + 365, y + 16, 100);

  return y + 98;
};

const tableColumns = [
  { label: "Peca", width: 132 },
  { label: "Qtd", width: 38 },
  { label: "Material", width: 105 },
  { label: "Maquina", width: 88 },
  { label: "Peso/Tempo", width: 62 },
  { label: "Valor", width: 74 },
];

const drawItemsHeader = (doc: PDFKit.PDFDocument, y: number): number => {
  const margin = 48;
  let x = margin;

  doc.roundedRect(margin, y, doc.page.width - margin * 2, 26, 7).fill(colors.primary);

  for (const column of tableColumns) {
    doc
      .fillColor(colors.white)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(column.label.toUpperCase(), x + 8, y + 9, {
        width: column.width - 12,
      });
    x += column.width;
  }

  return y + 30;
};

const ensurePageSpace = (
  doc: PDFKit.PDFDocument,
  y: number,
  neededHeight: number,
  withTableHeader = false,
): number => {
  const bottom = doc.page.height - 70;

  if (y + neededHeight <= bottom) {
    return y;
  }

  doc.addPage();
  return withTableHeader ? drawItemsHeader(doc, 48) : 48;
};

const drawItemsTable = (
  doc: PDFKit.PDFDocument,
  quote: QuotePdfRecord,
  y: number,
): number => {
  let currentY = drawItemsHeader(doc, y);
  const margin = 48;

  for (const [index, item] of quote.printItems.entries()) {
    const rowHeight = Math.max(
      46,
      doc.heightOfString(item.modelName, {
        width: tableColumns[0].width - 14,
      }) + 22,
    );

    currentY = ensurePageSpace(doc, currentY, rowHeight, true);

    if (index % 2 === 0) {
      doc
        .rect(margin, currentY - 3, doc.page.width - margin * 2, rowHeight)
        .fill("#FBFCFF");
    }

    let x = margin;
    const material = `${item.material.brand} ${item.material.color}`;
    const metrics = `${decimalToNumber(item.materialWeightGrams).toFixed(0)} g\n${decimalToNumber(
      item.estimatedPrintTimeHours,
    ).toFixed(2)} h`;
    const values = [
      item.modelName,
      "1",
      material,
      item.machine.name,
      metrics,
      formatMoney(item.finalPrice),
    ];

    values.forEach((value, columnIndex) => {
      const column = tableColumns[columnIndex];
      doc
        .fillColor(columnIndex === 5 ? colors.ink : colors.muted)
        .font(columnIndex === 0 || columnIndex === 5 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(columnIndex === 5 ? 9 : 8)
        .text(value, x + 8, currentY + 10, {
          width: column.width - 12,
          align: columnIndex === 5 ? "right" : "left",
        });
      x += column.width;
    });

    doc
      .moveTo(margin, currentY + rowHeight - 3)
      .lineTo(doc.page.width - margin, currentY + rowHeight - 3)
      .lineWidth(0.5)
      .strokeColor(colors.line)
      .stroke();

    currentY += rowHeight;
  }

  return currentY + 18;
};

const drawFinancialSummary = (
  doc: PDFKit.PDFDocument,
  quote: QuotePdfRecord,
  y: number,
): number => {
  const margin = 48;
  const boxWidth = 220;
  const x = doc.page.width - margin - boxWidth;
  const subtotal = quote.totalAmount;

  const currentY = ensurePageSpace(doc, y, 126);
  doc.roundedRect(x, currentY, boxWidth, 126, 10).fill(colors.soft);

  const rows = [
    ["Subtotal", formatMoney(subtotal)],
    ["Descontos", formatMoney(0)],
    ["Valor total", formatMoney(subtotal)],
  ] as const;

  rows.forEach(([label, value], index) => {
    const rowY = currentY + 18 + index * 31;
    doc
      .fillColor(index === 2 ? colors.primaryDark : colors.muted)
      .font(index === 2 ? "Helvetica-Bold" : "Helvetica")
      .fontSize(index === 2 ? 12 : 9)
      .text(label, x + 16, rowY, { width: 100 });
    doc
      .fillColor(index === 2 ? colors.primaryDark : colors.ink)
      .font("Helvetica-Bold")
      .fontSize(index === 2 ? 15 : 10)
      .text(value, x + 100, rowY - (index === 2 ? 2 : 0), {
        width: 104,
        align: "right",
      });
  });

  doc
    .fillColor(colors.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(
      `Formula aplicada: ${quote.formula?.name ?? "Formula Padrao do Sistema"}`,
      margin,
      currentY + 12,
      { width: x - margin - 18 },
    )
    .text(
      `Peso total: ${decimalToNumber(quote.totalWeightGrams).toFixed(2)} g`,
      margin,
      currentY + 30,
      { width: x - margin - 18 },
    )
    .text(
      `Tempo total: ${decimalToNumber(quote.totalPrintHours).toFixed(2)} h`,
      margin,
      currentY + 46,
      { width: x - margin - 18 },
    );

  return currentY + 148;
};

const drawTerms = (
  doc: PDFKit.PDFDocument,
  quote: QuotePdfRecord,
  y: number,
): void => {
  const margin = 48;
  const currentY = ensurePageSpace(doc, y, 120);

  doc
    .fillColor(colors.ink)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Termos e observacoes", margin, currentY);
  doc
    .fillColor(colors.muted)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      [
        "Garantia limitada a defeitos de fabricacao do servico de impressao.",
        "Prazo de entrega estimado sera confirmado apos aprovacao e disponibilidade de producao.",
        "Alteracoes de arquivo, escala, material ou acabamento podem exigir novo orcamento.",
        `Orcamento valido ate ${formatDate(quote.validUntil)}.`,
      ].join("\n"),
      margin,
      currentY + 18,
      { width: doc.page.width - margin * 2, lineGap: 4 },
    );

  doc
    .moveTo(margin, doc.page.height - 46)
    .lineTo(doc.page.width - margin, doc.page.height - 46)
    .lineWidth(0.5)
    .strokeColor(colors.line)
    .stroke();
  doc
    .fillColor(colors.muted)
    .fontSize(7)
    .text(
      `${quote.company.name} - Documento gerado pelo 3D Budget SaaS`,
      margin,
      doc.page.height - 34,
      { width: doc.page.width - margin * 2, align: "center" },
    );
};

const renderQuotePdf = (
  doc: PDFKit.PDFDocument,
  quote: QuotePdfRecord,
): void => {
  drawHeader(doc, quote);
  let y = drawCustomerBlock(doc, quote, 150);

  doc
    .fillColor(colors.ink)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Mesas de impressao", 48, y);

  y = drawItemsTable(doc, quote, y + 22);
  y = drawFinancialSummary(doc, quote, y);
  drawTerms(doc, quote, y);
};

export class QuotePdfService {
  async generate(companyId: string, quoteId: string): Promise<QuotePdfResult> {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, companyId },
      include: quotePdfInclude,
    });

    if (!quote) {
      // "Access denied." on purpose — see Contextos/Conhecimento.md.
      throw new AppError("Access denied.", 403, "QUOTE_FORBIDDEN");
    }

    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      bufferPages: true,
      info: {
        Title: `Orcamento ${quote.id.slice(0, 8).toUpperCase()}`,
        Author: quote.company.name,
        Subject: `Orcamento para ${quote.customerName}`,
        Creator: "3D Budget SaaS",
      },
    });
    const pdfBuffer = collectDocument(doc);

    renderQuotePdf(doc, quote);
    doc.end();

    return {
      buffer: await pdfBuffer,
      filename: buildFilename(quote),
    };
  }
}

export const quotePdfService = new QuotePdfService();
