/**
 * `bun run db:migrate` — apply pending migrations to DATABASE_URL (db-migrations BR-MIG-13..17).
 *
 * - Prints the target (host:port/db, password hidden) and the pending list.
 * - A DB that is not a local `*_test` DB on port 5432/5433 needs MIGRATE_CONFIRM=<db name>
 *   (refused with exit 2 before connecting or backing up) and gets a pg_dump in backend/backups/
 *   first; no dump, no migration.
 * - Refuses (exit 3, nothing changed) when the journal has a migration this code lacks or an
 *   edited one. All pending migrations run in one transaction (exit 1 and rolled back on error).
 *
 * Exit codes: 0 done / up to date, 1 failed, 2 refused by the guard, 3 journal mismatch.
 * The app never runs this itself (BR-MIG-22).
 */
import { chmodSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import {
  applyMigrations,
  assertDriverMatches,
  hasPublicTables,
  JournalMismatchError,
  parseTarget,
  plan,
  readJournal,
  safeFileName,
  type Target,
} from "./lib/migrate";

const EXIT = { ok: 0, fail: 1, guard: 2, journal: 3 } as const;
const BACKUPS_DIR = join(new URL("..", import.meta.url).pathname, "backups");

function refuse(code: number, msg: string): never {
  console.error(msg);
  process.exit(code);
}

let target: Target;
try {
  target = parseTarget(process.env.DATABASE_URL ?? "");
} catch (err) {
  refuse(EXIT.guard, `Refused: ${(err as Error).message}`);
}
const secrets = [target.password].filter((s) => s.length >= 4);
const scrub = (text: string) =>
  secrets.reduce((t, s) => t.split(s).join("***"), text);

console.log(`db:migrate target: ${target.label} (password ***)`);

if (!target.usual && process.env.MIGRATE_CONFIRM !== target.dbName) {
  refuse(
    EXIT.guard,
    `Refused: ${target.label} is not a local *_test database on port 5432/5433. Set MIGRATE_CONFIRM=${target.dbName} to migrate it (a pg_dump backup is taken first). Nothing was changed.`,
  );
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** BR-MIG-16: pg_dump to backend/backups/; returns the file path or refuses. */
async function backup(): Promise<string> {
  if (!Bun.which("pg_dump")) {
    refuse(
      EXIT.guard,
      "Refused: pg_dump is not installed or not on PATH, so no backup can be taken. Nothing was changed.",
    );
  }
  // SEC-1: a dump holds the whole DB. Folder 0700, file born 0600 (umask), then chmod as a belt.
  mkdirSync(BACKUPS_DIR, { recursive: true, mode: 0o700 });
  chmodSync(BACKUPS_DIR, 0o700);
  const file = join(
    BACKUPS_DIR,
    `${safeFileName(target.dbName)}-${stamp(new Date())}.dump`,
  );
  if (existsSync(file)) {
    refuse(
      EXIT.guard,
      `Refused: backup file ${file} already exists (same minute). Wait a minute and retry. Nothing was changed.`,
    );
  }
  // Credentials go through the environment, never the command line.
  const oldUmask = process.umask(0o077);
  const proc = Bun.spawn(["pg_dump", "--format=custom", `--file=${file}`], {
    env: {
      ...process.env,
      PGHOST: target.host,
      PGPORT: target.port,
      PGDATABASE: target.dbName,
      ...(target.user ? { PGUSER: target.user } : {}),
      ...(target.password ? { PGPASSWORD: target.password } : {}),
    } as Record<string, string>,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  });
  process.umask(oldUmask);
  const [err, code] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (existsSync(file)) chmodSync(file, 0o600);
  const size = existsSync(file) ? statSync(file).size : 0;
  if (code !== 0 || size === 0) {
    rmSync(file, { force: true });
    refuse(
      EXIT.guard,
      `Refused: pg_dump ${code !== 0 ? `failed (exit ${code})` : "wrote an empty file"}: ${scrub(err.trim())}\nNothing was changed.`,
    );
  }
  return file;
}

const sql = postgres(process.env.DATABASE_URL as string, {
  max: 1,
  onnotice: () => {},
  connect_timeout: 10,
});
// Judge what the driver will really use, before connecting or backing up anything (SEC-2).
try {
  assertDriverMatches(sql, target);
} catch (err) {
  await sql.end({ timeout: 1 });
  refuse(EXIT.guard, scrub((err as Error).message));
}

try {
  // BR-MIG-21: tables but no journal = built by push; the baseline would fail on "already exists".
  if ((await readJournal(sql)).length === 0 && (await hasPublicTables(sql))) {
    console.error(
      `Refused: ${target.label} has tables but no migration journal (built by push? use db:reset). Nothing was changed.`,
    );
    await sql.end({ timeout: 5 });
    process.exit(EXIT.guard);
  }
  // Look first: no backup when nothing is pending, none when the journal is refused anyway.
  const pending = await plan(sql);
  if (pending.length === 0) {
    console.log("Database is up to date. Nothing to apply.");
  } else {
    if (!target.usual) console.log(`Backup written: ${await backup()}`);
    await applyMigrations(sql);
    console.log(`db:migrate done: ${target.label}`);
  }
} catch (err) {
  const msg = scrub(err instanceof Error ? err.message : String(err));
  console.error(msg);
  await sql.end({ timeout: 5 });
  process.exit(err instanceof JournalMismatchError ? EXIT.journal : EXIT.fail);
}
await sql.end({ timeout: 5 });
process.exit(EXIT.ok);
