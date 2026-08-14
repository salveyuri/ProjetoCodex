import { z } from "zod";

export const idParamSchema = z
  .object({
    id: z.string().trim().uuid(),
  })
  .strict();

export type IdParamInput = z.infer<typeof idParamSchema>;
