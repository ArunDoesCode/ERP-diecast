import type { MiddlewareHandler } from "hono";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { type Role, verifyAccessToken } from "./token";
import type { AppEnv } from "./types";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token) {
    throw new UnauthorizedError("Unauthorized");
  }

  let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError("Invalid access token");
  }

  c.set("user", payload);
  await next();
};

export function requireRole(...allowed: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!allowed.includes(user.role)) {
      throw new ForbiddenError("Forbidden");
    }

    await next();
  };
}
