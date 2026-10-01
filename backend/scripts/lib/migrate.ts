/**
 * Shared migration runner for `db:migrate`, `db:reset` and `db:test:prepare`
 * (docs/specs/db-migrations.md BR-MIG-09..16).
 *
 * We do not use drizzle-orm's `migrate()`: it neither refuses a journal that is ahead of the repo
 * or edited (BR-MIG-14) nor prints the pending list (BR-MIG-13). The journal table has the same
 * shape drizzle uses (`drizzle.__drizzle_migrations`), so drizzle-kit still understands it.
 */
import { join } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;
type Queryable = Pick<Sql, "unsafe">;

export const MIGRATIONS_DIR = join(
  new URL("../..", import.meta.url).pathname,
  "src/db/migrations",
);
const LOCK_KEY = 7_531_001; // advisory lock: two db:migrate runs never overlap

export type Local = ReturnType<typeof readMigrationFiles>[number];
type JournalRow = {
  id: number;
  hash: string;
  created_at: string | null;
  name: string | null;
};

/** The journal does not match the repo: a migration is unknown, edited or out of order. */
export class JournalMismatchError extends Error {}

export function localMigrations(): Local[] {
  return readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR });
}

export async function readJournal(q: Queryable): Promise<JournalRow[]> {
  const t = await q.unsafe(
    "SELECT to_regclass('drizzle.__drizzle_migrations') AS t",
  );
  if (!t[0]?.t) return [];
  return (await q.unsafe(
    "SELECT id, hash, created_at, name FROM drizzle.__drizzle_migrations ORDER BY id",
  )) as unknown as JournalRow[];
}

export async function hasPublicTables(q: Queryable): Promise<boolean> {
  const r = await q.unsafe(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' LIMIT 1",
  );
  return r.length > 0;
}

/**
 * Compares the journal with the repo. Returns the pending list in order, or throws
 * JournalMismatchError naming the offending migration (BR-MIG-14).
 */
export function planFrom(local: Local[], journal: JournalRow[]): Local[] {
  const matched = new Set<string>();
  let newestApplied = 0;
  for (const row of journal) {
    const created = row.created_at === null ? null : Number(row.created_at);
    const mine = local.find((m) =>
      row.name ? m.name === row.name : m.folderMillis === created,
    );
    const label = row.name ?? `created_at ${row.created_at}`;
    if (!mine) {
      throw new JournalMismatchError(
        `Refused: the database has migration ${label} that this code does not have (database migrated by a newer branch?). Nothing was changed.`,
      );
    }
    if (mine.hash !== row.hash) {
      throw new JournalMismatchError(
        `Refused: migration ${mine.name} was edited after it was applied (file content differs from the journal). Nothing was changed.`,
      );
    }
    matched.add(mine.name);
    newestApplied = Math.max(newestApplied, mine.folderMillis);
  }
  const pending = local.filter((m) => !matched.has(m.name));
  const outOfOrder = pending.find((m) => m.folderMillis < newestApplied);
  if (outOfOrder) {
    throw new JournalMismatchError(
      `Refused: pending migration ${outOfOrder.name} is older than one already applied. Nothing was changed.`,
    );
  }
  return pending;
}

export async function plan(q: Queryable): Promise<Local[]> {
  return planFrom(localMigrations(), await readJournal(q));
}

/**
 * Applies every pending migration in order, in ONE transaction (BR-MIG-13). Prints the pending
 * list; prints "up to date" and writes nothing when there is none (BR-MIG-15).
 */
export async function applyMigrations(
  sql: Sql,
  log: (line: string) => void = console.log,
): Promise<string[]> {
  return sql.begin(async (tx) => {
    await tx.unsafe(`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
    const pending = await plan(tx);
    if (pending.length === 0) {
      log("Database is up to date. Nothing to apply.");
      return [];
    }
    log(`Pending migrations (${pending.length}):`);
    for (const m of pending) log(`  ${m.name}`);
    await tx.unsafe("CREATE SCHEMA IF NOT EXISTS drizzle");
    await tx.unsafe(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint,
      name text,
      applied_at timestamp with time zone DEFAULT now()
    )`);
    for (const m of pending) {
      try {
        for (const stmt of m.sql) {
          if (stmt.trim()) await tx.unsafe(stmt);
        }
        await tx.unsafe(
          "INSERT INTO drizzle.__drizzle_migrations (hash, created_at, name) VALUES ($1, $2, $3)",
          [m.hash, m.folderMillis, m.name],
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Migration ${m.name} failed: ${msg}. All pending migrations were rolled back.`,
        );
      }
      log(`  applied ${m.name}`);
    }
    return pending.map((m) => m.name);
  });
}

// ---------------------------------------------------------------- target

export type Target = {
  host: string;
  port: string;
  dbName: string;
  user: string;
  password: string;
  /** host:port/db, never the password */
  label: string;
  /** host is this machine (localhost, 127.0.0.1, ::1) */
  local: boolean;
  /** local host, name ends in `_test`, port 5432/5433 (BR-KD-30, v5): no confirm, no backup */
  usual: boolean;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Reads the DB the driver will really connect to (URL first, then PG* variables). */
export function parseTarget(
  raw: string,
  env: Record<string, string | undefined> = process.env,
): Target {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is missing or not a valid postgres URL.");
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) {
    throw new Error("DATABASE_URL is missing or not a valid postgres URL.");
  }
  if (/^[a-z]+:\/\/[^/?#]*,/i.test(raw)) {
    throw new Error("DATABASE_URL names more than one host; refused.");
  }
  const host = (u.hostname || env.PGHOST || "").toLowerCase();
  const port = u.port || env.PGPORT || "5432";
  // Not decoded: the driver sends the path as written, so the guard must judge that same name.
  const dbName = u.pathname.replace(/^\//, "") || env.PGDATABASE || "";
  if (!host || !dbName) {
    throw new Error("DATABASE_URL has no host or database name; refused.");
  }
  const local = LOCAL_HOSTS.has(host);
  const usual =
    local && dbName.endsWith("_test") && (port === "5432" || port === "5433");
  return {
    host,
    port,
    dbName,
    user: decodeURIComponent(u.username) || env.PGUSER || "",
    password: decodeURIComponent(u.password) || env.PGPASSWORD || "",
    label: `${host}:${port}/${dbName}`,
    local,
    usual,
  };
}

/**
 * The guard and the driver must agree (BR-MIG-17, SEC-2/4): compare what the built client will
 * really connect to with the parsed target. Reads options only, never connects. Throws a
 * "Refused: ..." Error when they differ (several hosts, encoded host, other port or database).
 */
export function assertDriverMatches(
  sql: Pick<Sql, "options">,
  target: Target,
): void {
  const o = sql.options;
  const hosts = o.host as string[];
  const ports = o.port as number[];
  const same =
    !o.path &&
    hosts.length === 1 &&
    ports.length === 1 &&
    hosts[0].toLowerCase() === target.host &&
    ports[0] === Number(target.port) &&
    o.database === target.dbName;
  if (!same) {
    throw new Error(
      `Refused: the database driver would connect to ${hosts.join(",")}:${ports.join(",")}/${o.database}, not ${target.label} (encoded or repeated host in the URL?). Nothing was changed.`,
    );
  }
}

/** A database name as a file-name part: letters, digits, `_` and `-` only, so it cannot leave its folder. */
export function safeFileName(dbName: string): string {
  return dbName.replace(/[^A-Za-z0-9_-]/g, "_");
}
