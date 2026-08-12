import { type ZodType, z } from "zod";

/** Shared shape for every list endpoint's pagination envelope. */
export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

/** `{ success: true, data: T }` — the default single-resource response shape. */
export function successResponse<T extends ZodType>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}

/** `{ success: true, data: T, message: string }` — used by mutations that return a human-readable confirmation. */
export function successResponseWithMessage<T extends ZodType>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string(),
  });
}

/** `{ success: true, data: T[], meta: paginationMeta }` — the mandatory shape for every list/index endpoint. */
export function paginatedResponse<T extends ZodType>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(dataSchema),
    meta: paginationMetaSchema,
  });
}

/** `{ success: true }` — used by delete/remove endpoints that return no payload. */
export function deleteResponse() {
  return z.object({
    success: z.literal(true),
  });
}

/** `{ success: false, message: string, code?: string }` — the global error envelope. */
export function errorResponse() {
  return z.object({
    success: z.literal(false),
    message: z.string(),
    code: z.string().optional(),
  });
}
