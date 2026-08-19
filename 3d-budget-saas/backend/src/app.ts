import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { requestLogger } from "./config/logger";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import { globalRateLimiter } from "./middlewares/rate-limit-middleware";
import { apiRoutes } from "./routes";

const allowedOrigins = env.corsOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const app = express();

if (env.trustProxyHops > 0) {
  // Only trust X-Forwarded-For up to this many hops out — matches the
  // number of reverse proxies actually in front of this process. See
  // config/env.ts for why this defaults to off.
  app.set("trust proxy", env.trustProxyHops);
}

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use("/api", globalRateLimiter);
app.use(
  express.json({
    limit: "1mb",
    // Stashes the exact bytes received (before JSON parsing) onto
    // request.rawBody — POST /api/webhooks/resend needs those to verify
    // Resend's svix signature, which is computed over the raw body, not
    // over a re-serialized copy of the parsed object (see
    // webhook.controller.ts).
    verify: (request, _response, buffer) => {
      // body-parser types this callback's `request` as the bare Node
      // http.IncomingMessage, not Express's Request — the rawBody
      // augmentation in types/express.d.ts only applies to the latter.
      (request as express.Request).rawBody = buffer;
    },
  }),
);
app.use(cookieParser());
app.use(requestLogger);

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
