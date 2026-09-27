/**
 * `bun test` preload (see bunfig.toml): point every DB import at the test
 * database before any module reads `env`. Runs before test files are loaded.
 */
import { afterAll } from "bun:test";
import { resolveTestDatabaseUrl } from "../lib/test-db-url";

process.env.DATABASE_URL = resolveTestDatabaseUrl();

// Every test file shares one DB client in one process. Close it once, after
// all files — a per-file disconnectDb() breaks every file that runs later.
// Dynamic import so env.ts is read only after DATABASE_URL is swapped above.
afterAll(async () => {
  const { disconnectDb } = await import("../db/client");
  await disconnectDb();
});
