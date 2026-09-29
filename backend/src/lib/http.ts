import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { z } from "zod";
import { env } from "./env";
import { BadRequestError } from "./errors";

export function setRefreshCookie(c: Context, token: string) {
  setCookie(c, "refresh_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function clearRefreshCookie(c: Context) {
  deleteCookie(c, "refresh_token", {
    path: "/",
  });
}

export function readRefreshCookie(c: Context) {
  return getCookie(c, "refresh_token");
}

const cancelReasonSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

/**
 * Reads the `{ reason }` body of a cancel call (PR, PR line, PO). Trimmed,
 * 3-500 chars. A missing body or a bad reason is 400 `<code>`; unparsable
 * JSON is 400 `INVALID_JSON`.
 */
export async function parseCancelReason(
  c: Context,
  code: string,
): Promise<string> {
  const text = await c.req.text();
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new BadRequestError(
        "Request body is not valid JSON",
        "INVALID_JSON",
      );
    }
  }
  const parsed = cancelReasonSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(
      "A cancel reason of 3 to 500 characters is required",
      code,
    );
  }
  return parsed.data.reason;
}
