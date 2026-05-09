export type OverallServiceStatus = "ok" | "degraded";

export type DatabaseHealthStatus = "connected" | "unavailable";

export interface HealthCheckResponse {
  status: OverallServiceStatus;
  timestamp: string;
  uptimeSeconds: number;
  server: {
    status: "online";
  };
  database: {
    status: DatabaseHealthStatus;
    latencyMs: number | null;
    error?: string;
  };
}

export interface ApiErrorResponse {
  status: "error";
  message: string;
  code?: string;
  details?: unknown;
  timestamp: string;
}

