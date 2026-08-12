import type { MiddlewareHandler } from "hono";
import { ForbiddenError } from "./errors";
import type { AppEnv } from "./types";

// ponytail: in-memory, per-process — resets on restart, doesn't share state
// across instances. Fine for the current single-process dev-only deployment;
// swap for a shared store (Redis) if this ever runs behind multiple instances.
export function rateLimiter({
  windowMs,
  max,
}: {
  windowMs: number;
  max: number;
}): MiddlewareHandler<AppEnv> {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async (c, next) => {
    const key =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
    } else if (entry.count >= max) {
      throw new ForbiddenError(
        "Too many attempts, try again later",
        "RATE_LIMITED",
      );
    } else {
      entry.count += 1;
    }

    await next();
  };
}
