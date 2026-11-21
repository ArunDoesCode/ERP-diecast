import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import {
  conflictLocation,
  isForeignKeyViolation,
  isUniqueViolation,
} from "./lib/db-errors";
import { env } from "./lib/env";
import { AppError } from "./lib/errors";
import { isPublicPath } from "./lib/public-routes";
import { mainRouter } from "./routes";

/** Logs a mapped 23505 / 23503 once, with ids only: never values, body or the error object. */
function logConflict(error: unknown, c: Context, pgCode: "23505" | "23503") {
  const actor = c.get("actor") as { id?: number } | undefined;
  const fields = {
    pgCode,
    ...conflictLocation(error),
    method: c.req.method,
    path: c.req.path,
    actorId: actor?.id ?? "none",
  };
  if (pgCode === "23505") console.warn("db-conflict", fields);
  else console.error("db-conflict", fields);
}

/** The app's one error handler (also used by tests on a bare Hono). */
export function handleAppError(error: Error, c: Context) {
  if (error instanceof AppError) {
    return c.json(
      {
        ...error.details,
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
      error.statusCode as ContentfulStatusCode,
    );
  }

  const pgCode = isUniqueViolation(error)
    ? "23505"
    : isForeignKeyViolation(error)
      ? "23503"
      : null;
  if (pgCode) {
    logConflict(error, c, pgCode);
    if (isPublicPath(c.req.path)) {
      return c.json({ success: false, message: "Internal server error" }, 500);
    }
    return pgCode === "23505"
      ? c.json(
          {
            success: false,
            message: "This record already exists.",
            code: "DUPLICATE_RECORD",
          },
          409,
        )
      : c.json(
          {
            success: false,
            message:
              "This record is linked to another record that is missing or still in use.",
            code: "LINKED_RECORD",
          },
          409,
        );
  }

  if (error instanceof HTTPException) {
    return c.json({ success: false, message: error.message }, error.status);
  }

  if (error instanceof ZodError) {
    return c.json({ success: false, message: "Validation failed" }, 400);
  }

  if (error instanceof Error && error.message === "Invalid credentials") {
    return c.json({ success: false, message: error.message }, 401);
  }

  if (error instanceof Error && error.message === "Login failed") {
    return c.json({ success: false, message: error.message }, 401);
  }

  const message =
    env.NODE_ENV === "development" && error instanceof Error
      ? error.message
      : "Internal server error";
  return c.json({ success: false, message }, 500);
}

/**
 * Builds the full Hono app (middleware, routes, error handler) without
 * connecting to the DB or listening on a port. `src/index.ts` serves it;
 * HTTP tests call `createApp().request(...)` to exercise the real stack.
 */
export function createApp() {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const start = Date.now();

    await next();

    if (env.NODE_ENV === "test") return;
    const durationMs = Date.now() - start;
    console.log(
      `${c.req.method} ${c.req.path} -> ${c.res.status} (${durationMs}ms)`,
    );
  });

  app.use(
    "*",
    cors({
      origin: env.APP_ORIGIN,
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.use("*", bodyLimit({ maxSize: 5 * 1024 * 1024 }));

  app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));

  app.route("/api", mainRouter);

  app.onError(handleAppError);

  return app;
}
