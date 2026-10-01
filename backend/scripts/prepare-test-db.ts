/**
 * `bun run db:test:prepare` (known-defects BR-KD-52, BR-KD-35)
 *
 * Builds the test database by running `db:reset --no-fixtures` with DATABASE_URL set to
 * DATABASE_URL_TEST: one build path, so local and CI test DBs never drift.
 *
 * Exit codes: 0 done, 2 DATABASE_URL_TEST refused (nothing changed), 4 bad SEED_USER_PASSWORD
 * (reported by db:reset before any write), otherwise the exit code of db:reset.
 */
import { resolveTestDatabaseUrl } from "../src/lib/test-db-url";

const BACKEND_DIR = new URL("..", import.meta.url).pathname;

let url: string;
try {
  // Throws if missing, not a URL, name not ending in `_test`, or equal to DATABASE_URL.
  url = resolveTestDatabaseUrl();
} catch (err) {
  console.error(
    `Refused: ${err instanceof Error ? err.message : String(err)} Nothing was changed.`,
  );
  process.exit(2);
}

const reset = Bun.spawnSync(["bun", "scripts/db-reset.ts", "--no-fixtures"], {
  cwd: BACKEND_DIR,
  env: { ...process.env, DATABASE_URL: url },
  stdin: "ignore",
  stdout: "inherit",
  stderr: "inherit",
});
if (reset.exitCode !== 0) {
  console.error(`db:test:prepare failed (db:reset exit ${reset.exitCode}).`);
  process.exit(reset.exitCode ?? 1);
}
console.log("Test database ready: built by db:reset --no-fixtures.");
