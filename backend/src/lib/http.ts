import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { env } from "./env";

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
