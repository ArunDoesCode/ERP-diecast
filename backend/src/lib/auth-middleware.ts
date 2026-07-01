import type { MiddlewareHandler } from "hono";
import { type Role, verifyAccessToken } from "./token";
import type { AppEnv } from "./types";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token) {
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  try {
    const payload = await verifyAccessToken(token);
    c.set("user", payload);
    await next();
  } catch {
    return c.json({ success: false, message: "Invalid access token" }, 401);
  }
};

export function requireRole(...allowed: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!allowed.includes(user.role)) {
      return c.json({ success: false, message: "Forbidden" }, 403);
    }

    await next();
  };
}
