import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  schema: "src/db/schemas/index.ts",
  out: "src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Local Docker Postgres (docker-compose.yaml). `db:test:prepare` points
    // this at DATABASE_URL_TEST instead.
    url: process.env.DATABASE_URL,
  },
});
