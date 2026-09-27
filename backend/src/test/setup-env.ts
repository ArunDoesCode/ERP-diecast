/**
 * `bun test` preload (see bunfig.toml): point every DB import at the test
 * database before any module reads `env`. Runs before test files are loaded.
 */
import { resolveTestDatabaseUrl } from "../lib/test-db-url";

process.env.DATABASE_URL = resolveTestDatabaseUrl();
