import "dotenv/config";

const parsePort = (value: string | undefined): number => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 3001;
  }

  return parsed;
};

const resolveJwtSecret = (): string => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be defined in production.");
  }

  return "dev-only-change-me-3d-budget";
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePort(process.env.PORT),
  corsOrigin:
    process.env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000",
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  logLevel: process.env.LOG_LEVEL ?? "info",
};
