/**
 * `bun run db:test:prepare` — apply pending migrations and the role seed to the test database
 * (DATABASE_URL_TEST). Safe to re-run: nothing pending changes no schema, the seed is idempotent.
 * A test DB built by push (tables, no journal) or whose journal does not match the repo is
 * dropped (`public` + `drizzle`) and rebuilt, with the reason printed (db-migrations BR-MIG-10, 11).
 * Only a `*_test` DB gets this far: resolveTestDatabaseUrl refuses anything else.
 */
import postgres from "postgres";
import { resolveTestDatabaseUrl } from "../src/lib/test-db-url";
import {
  applyMigrations,
  assertDriverMatches,
  hasPublicTables,
  JournalMismatchError,
  parseTarget,
  plan,
  readJournal,
} from "./lib/migrate";

const url = resolveTestDatabaseUrl();

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
// SEC-2/4: judge the host, port and database the driver will really use, before connecting.
try {
  const target = parseTarget(url);
  assertDriverMatches(sql, target);
  // The rebuild drops whole schemas: only ever on this machine.
  if (!target.local) {
    throw new Error(
      `${target.label} is not a local host; db:test:prepare only builds a test database on this machine.`,
    );
  }
} catch (err) {
  console.error(`Refused: ${(err as Error).message.replace(/^Refused: /, "")}`);
  await sql.end({ timeout: 1 });
  process.exit(2);
}
try {
  const journal = await readJournal(sql);
  let rebuildReason: string | null = null;
  if (journal.length === 0 && (await hasPublicTables(sql))) {
    rebuildReason = "it has tables but no migration journal (built by push)";
  } else {
    try {
      await plan(sql);
    } catch (err) {
      if (!(err instanceof JournalMismatchError)) throw err; // CR-4: only a journal mismatch rebuilds
      rebuildReason = `its journal does not match the repo (${(err as Error).message.replace(/^Refused: /, "")})`;
    }
  }
  if (rebuildReason) {
    console.log(`Test database is being rebuilt: ${rebuildReason}.`);
    await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await sql.unsafe("CREATE SCHEMA public");
  }
  await applyMigrations(sql);
  const seed = await Bun.file(
    new URL("../src/db/seed_roles.sql", import.meta.url),
  ).text();
  await sql.unsafe(seed);
  // The shared db client reads DATABASE_URL at import time: point it at the test DB first.
  process.env.DATABASE_URL = url;
  const { syncCatalog, seedGrants } = await import(
    "../src/lib/permissions-sync"
  );
  await syncCatalog();
  await seedGrants();
  // BR-APR-22: the built-in fallback approval policy is seed data the code only reads.
  const { seedFallbackPolicies } = await import("./seed-approval-policies");
  await seedFallbackPolicies(null);
  const { disconnectDb } = await import("../src/db/client");
  await disconnectDb();
  console.log(
    "Test database ready: migrations applied, roles seeded, permission catalog synced.",
  );
} finally {
  await sql.end({ timeout: 5 });
}
