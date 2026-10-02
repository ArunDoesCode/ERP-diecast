/**
 * `bun run db:test:prepare` — apply pending migrations and the seed to the test database
 * (DATABASE_URL_TEST): roles, permission catalog + grants, the admin employee and the approval
 * policies, i.e. the same result as `db:reset --no-fixtures` (known-defects BR-KD-52, BR-KD-35;
 * db-migrations BR-MIG-10, 11). Safe to re-run: nothing pending changes no schema, the seed is
 * idempotent. A test DB built by push (tables, no journal) or whose journal does not match the repo
 * is dropped (`public` + `drizzle`) and rebuilt, with the reason printed.
 *
 * Exit codes: 0 done, 1 a step failed, 2 DATABASE_URL_TEST refused before connecting (missing or
 * invalid, several hosts, encoded host, query string, not a local `*_test` DB, equal to
 * DATABASE_URL), 4 bad SEED_USER_PASSWORD (before any write). Never prints the seed password.
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

const BACKEND_DIR = new URL("..", import.meta.url).pathname;

function refuse(code: number, msg: string): never {
  console.error(msg);
  process.exit(code);
}

// --- BR-KD-52 / BR-MIG-11: judge the target before any connection ---
let url: string;
let sql: ReturnType<typeof postgres>;
try {
  // Throws if missing, not a URL, name not ending in `_test`, or equal to DATABASE_URL.
  url = resolveTestDatabaseUrl();
  // SEC-2/4/7: query string, several hosts, encoded host: judge what the driver will really use.
  const target = parseTarget(url);
  sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} }); // lazy: no connect yet
  assertDriverMatches(sql, target);
  // The rebuild drops whole schemas: only ever on this machine.
  if (!target.local) {
    throw new Error(
      `${target.label} is not a local host; db:test:prepare only builds a test database on this machine.`,
    );
  }
} catch (err) {
  refuse(
    2,
    `Refused: ${(err instanceof Error ? err.message : String(err)).replace(/^Refused: /, "")} Nothing was changed.`,
  );
}

const seedPassword = process.env.SEED_USER_PASSWORD ?? "";
if (seedPassword.length < 8) {
  await sql.end({ timeout: 1 });
  refuse(
    4,
    "Refused: SEED_USER_PASSWORD is missing or shorter than 8 characters. Nothing was changed.",
  );
}

const scrub = (text: string) => text.split(seedPassword).join("***");

async function runChild(
  label: string,
  cmd: string[],
  env: Record<string, string> = {},
  okCodes: number[] = [0],
) {
  const proc = Bun.spawn(cmd, {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url, ...env } as Record<
      string,
      string
    >,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [o, e] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (!okCodes.includes(code)) {
    console.error(scrub(`${o}\n${e}`).trim());
    throw new Error(`${label} exited with code ${code}`);
  }
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
      rebuildReason = `its journal does not match the repo (${err.message.replace(/^Refused: /, "")})`;
    }
  }
  if (rebuildReason) {
    console.log(`Test database is being rebuilt: ${rebuildReason}.`);
    await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await sql.unsafe("CREATE SCHEMA public");
  }
  await applyMigrations(sql);
  await sql.unsafe(
    await Bun.file(new URL("../src/db/seed_roles.sql", import.meta.url)).text(),
  );
  // The shared db client reads DATABASE_URL at import time: point it at the test DB first.
  process.env.DATABASE_URL = url;
  const { syncCatalog, seedGrants } = await import(
    "../src/lib/permissions-sync"
  );
  await syncCatalog();
  await seedGrants();
  const { disconnectDb } = await import("../src/db/client");
  await disconnectDb();
  // Exit 2 = "already bootstrapped": fine on a re-run.
  await runChild(
    "bootstrap-admin",
    ["bun", "scripts/bootstrap-admin.ts"],
    {
      BOOTSTRAP_ADMIN_NAME: "Admin",
      BOOTSTRAP_ADMIN_EMAIL: "admin@diecast.local",
      BOOTSTRAP_ADMIN_PASSWORD: seedPassword,
    },
    [0, 2],
  );
  await runChild("seed-approval-policies", [
    "bun",
    "scripts/seed-approval-policies.ts",
  ]);
  console.log(
    "Test database ready: migrations applied, roles seeded, permission catalog synced, admin and approval policies in place.",
  );
} catch (err) {
  console.error(
    `db:test:prepare failed: ${scrub(err instanceof Error ? err.message : String(err))}`,
  );
  await sql.end({ timeout: 5 });
  process.exit(1);
}
await sql.end({ timeout: 5 });
