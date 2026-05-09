import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import { apiRoutes } from "./routes";

const allowedOrigins = env.corsOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

