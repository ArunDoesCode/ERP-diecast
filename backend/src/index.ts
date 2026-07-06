import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

import { connectDb, disconnectDb } from "./db/client";
import { env } from "./lib/env";
import { AppError } from "./lib/errors";
import { mainRouter } from "./routes";

const app = new Hono();

app.use("*", async (c, next) => {
  const start = Date.now();

  await next();

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
    error instanceof Error ? error.message : "Internal server error";
  return c.json({ success: false, message }, 500);
});

const startServer = async () => {
  await connectDb();
  console.log("Database connected");

  serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      console.log(`Backend listening on http://localhost:${info.port}`);
    },
  );
};

let isShuttingDown = false;

const shutdown = async (signal: NodeJS.Signals) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received, disconnecting database...`);

  try {
    await disconnectDb();
    console.log("Database disconnected");
    process.exit(0);
  } catch (error) {
    console.error("Failed to disconnect database", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
