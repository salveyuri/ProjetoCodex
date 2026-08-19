declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user_id?: string;
      auth?: {
        userId: string;
        email: string;
        role: "ADMIN" | "USER";
        companyId?: string;
      };
      // Captured by the express.json() verify callback in app.ts — needed
      // as the exact bytes Resend signed, since re-serializing the parsed
      // req.body would produce a different string and break signature
      // verification (see webhook.controller.ts's resend() handler).
      rawBody?: Buffer;
    }
  }
}

export {};
