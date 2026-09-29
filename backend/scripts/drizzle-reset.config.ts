import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config used only by `db:reset`. Same as drizzle.config.ts plus a `public`-only
 * schema filter, so other schemas in the database are never inspected or touched (BR-KD-35).
 * Paths are relative to backend/ (db-reset runs drizzle-kit from there).
 */
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  schema: "src/db/schemas/index.ts",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL },
});
