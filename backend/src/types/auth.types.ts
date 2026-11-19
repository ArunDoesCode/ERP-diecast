import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export type loginSchemaType = z.infer<typeof loginSchema>;

/** BR-AUTH-29: the raw token read from the operator's QR badge. */
export const qrLoginSchema = z.object({
  qrToken: z.string().min(1).max(256),
});

export type qrLoginSchemaType = z.infer<typeof qrLoginSchema>;
