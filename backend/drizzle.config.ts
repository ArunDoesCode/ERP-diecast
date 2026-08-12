import type { Config } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

// export default {
//   schema: "./src/db/schema.ts",
//   out: "./drizzle",
//   dialect: "postgresql",
//   dbCredentials: {
//     url: process.env.DATABASE_URL,
//   },
// } satisfies Config;

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "src/db/schemas/index.ts",
  out: "src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!, // Supabase direct connection string (port 5432)
  },
});
