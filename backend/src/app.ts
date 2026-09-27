import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

import { env } from "./lib/env";
import { AppError } from "./lib/errors";
import { mainRouter } from "./routes";

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

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        { success: false, message: error.message, code: error.code },
        error.statusCode as ContentfulStatusCode,
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
  });

  return app;
}
