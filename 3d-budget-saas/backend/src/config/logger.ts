import pino from "pino";
import pinoHttp from "pino-http";
import { env } from "./env";

export const logger = pino({
  level: env.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "request.headers.authorization",
      "password",
      "passwordHash",
    ],
    remove: true,
  },
});

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (request) => request.url === "/api/health",
  },
  customSuccessMessage: (request, response) =>
    `${request.method} ${request.url} ${response.statusCode}`,
  customErrorMessage: (request, response) =>
    `${request.method} ${request.url} ${response.statusCode}`,
});
