import "dotenv/config";

const parsePort = (value: string | undefined): number => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 3001;
  }

  return parsed;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePort(process.env.PORT),
  corsOrigin:
    process.env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000",
};
