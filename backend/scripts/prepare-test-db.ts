/**
 * `bun run db:test:prepare` — push the current schema and the page-access seed
 * into the test database (DATABASE_URL_TEST). Safe to re-run: drizzle-kit push
 * diffs the schema and the seed is idempotent.
 */
import postgres from "postgres";
import { resolveTestDatabaseUrl } from "../src/lib/test-db-url";

const url = resolveTestDatabaseUrl();

const push = Bun.spawnSync(["bunx", "drizzle-kit", "push", "--force"], {
  env: { ...process.env, DATABASE_URL: url },
  stdout: "inherit",
  stderr: "inherit",
});
if (push.exitCode !== 0) {
  console.error("drizzle-kit push failed against DATABASE_URL_TEST");
  process.exit(push.exitCode ?? 1);
}

const sql = postgres(url, { prepare: false, max: 1 });
try {
  const seed = await Bun.file(
    new URL("../src/db/seed_page_access.sql", import.meta.url),
  ).text();
  await sql.unsafe(seed);
  console.log("Test database ready: schema pushed, page access seeded.");
} finally {
  await sql.end({ timeout: 5 });
}
