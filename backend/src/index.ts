import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { connectDb, disconnectDb } from "./db/client";
import { env } from "./lib/env";

const app = createApp();

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
