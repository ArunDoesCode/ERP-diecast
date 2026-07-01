import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "./lib/env";
import { mainRouter } from "./routes";

const app = new Hono();

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
  console.error(error);
  return c.json({ success: false, message: "Internal server error" }, 500);
});

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Backend listening on http://localhost:${info.port}`);
  },
);
