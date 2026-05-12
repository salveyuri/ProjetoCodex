import type { Request } from "express";
import { AppError } from "../middlewares/error-handler";

export const getAuthenticatedCompanyId = (request: Request): string => {
  const companyId = request.auth?.companyId;

  if (!companyId) {
    throw new AppError(
      "Authenticated user is not linked to a company.",
      403,
      "COMPANY_CONTEXT_MISSING",
    );
  }

  return companyId;
};

