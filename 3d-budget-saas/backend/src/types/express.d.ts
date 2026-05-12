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
    }
  }
}

export {};
