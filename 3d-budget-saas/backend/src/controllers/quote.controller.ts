import type {
  PaginatedQuoteList,
  QuoteResource,
} from "@3d-budget/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../middlewares/error-handler";
import { quotePdfService } from "../services/quote-pdf.service";
import { quoteService } from "../services/quote.service";
import { getAuthenticatedCompanyId } from "../utils/request-auth";
import {
  quoteCreateSchema,
  quoteListQuerySchema,
  quoteUpdateSchema,
} from "../validators/quote.validator";

const toValidationError = (error: ZodError): AppError =>
  new AppError("Invalid request payload.", 400, "VALIDATION_ERROR", {
    issues: error.issues,
  });

export class QuoteController {
  async index(
    request: Request,
    response: Response<PaginatedQuoteList>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const query = quoteListQuerySchema.parse(request.query);
      const quotes = await quoteService.list(companyId, query);
      response.status(200).json(quotes);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async show(
    request: Request,
    response: Response<QuoteResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const quote = await quoteService.show(companyId, request.params.id);
      response.status(200).json(quote);
    } catch (error) {
      next(error);
    }
  }

  async exportPdf(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const pdf = await quotePdfService.generate(companyId, request.params.id);

      response
        .status(200)
        .setHeader("Content-Type", "application/pdf")
        .setHeader("Content-Length", pdf.buffer.length)
        .setHeader(
          "Content-Disposition",
          `attachment; filename="${pdf.filename}"`,
        )
        .send(pdf.buffer);
    } catch (error) {
      next(error);
    }
  }

  async create(
    request: Request,
    response: Response<QuoteResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = quoteCreateSchema.parse(request.body);
      const quote = await quoteService.create(companyId, input);
      response.status(201).json(quote);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async update(
    request: Request,
    response: Response<QuoteResource>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      const input = quoteUpdateSchema.parse(request.body);
      const quote = await quoteService.update(companyId, request.params.id, input);
      response.status(200).json(quote);
    } catch (error) {
      next(error instanceof ZodError ? toValidationError(error) : error);
    }
  }

  async delete(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = getAuthenticatedCompanyId(request);
      await quoteService.delete(companyId, request.params.id);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const quoteController = new QuoteController();
