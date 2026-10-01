/**
 * docs/specs/db-migrations.md (v1) — push -> generated migrations (BL-011, BL-056)
 * BR-MIG-01..07  migration files, package scripts, push removed
 * BR-MIG-09..11  db:reset / db:test:prepare use migrations; rebuild of a push-built test DB
 * BR-MIG-12      CI workflow runs generate + check
 * BR-MIG-13..17  db:migrate: target + pending list, one transaction, refusals, no-op, backup, confirm
 * BR-MIG-22      the app never migrates on start
 *
 * BR-MIG-07 "docs" = repo docs, scripts, CI, package.json; `.claude/` files are the owner's (spec changelog).
 *
 * Not covered (see report): BR-MIG-08 (merged migrations are never edited: a review rule, not code),
 * BR-MIG-18..21 (db:adopt deferred, spec Q1 = B), the behaviour of `db:generate` after a schema edit
 * (needs a production schema change), the CI job itself going red (needs a real CI run).
 *
 * The scripts are separate processes, so they run against scratch databases on the same server as
 * DATABASE_URL_TEST (created here, dropped afterwards). The shared test DB is never touched.
 *  - SCRATCH / FRESH: local, name ends in `_test`, port 5432/5433, so they are the "usual local DB"
 *    of BR-KD-30 (known-defects v5): no confirm, no backup
 *  - GUARD: local but not named `*_test`, so it is NOT usual: it needs MIGRATE_CONFIRM + a backup
 *    (BR-MIG-16, 17). Local `diecast` is also unusual under v5, but is never connected to here.
 * pg_dump is replaced by a fake on PATH (host machines may not have it).
 * Written by test-writer from the spec only.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "../../src/db/schemas";

const SCRATCH = "diecast_mig_scratch_test";
const FRESH = "diecast_mig_fresh_test";
const GUARD = "diecast_mig_guard";
const BACKEND = new URL("../..", import.meta.url).pathname;
const REPO = join(BACKEND, "..");
const MIG_DIR = join(BACKEND, "src/db/migrations");
const BACKUPS = join(BACKEND, "backups");
const SEED_PASSWORD = "mig-Seed-Pass-4471";
const THIS_FILE = new URL(import.meta.url).pathname;

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

const baseUrl = process.env.DATABASE_URL as string; // preload = DATABASE_URL_TEST
const urlOf = (db: string) => withDb(baseUrl, db);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const ALLOWED = new Set([SCRATCH, FRESH, GUARD]);

/**
 * Isolation guard: the scripts under test drop schemas. A local target other than the scratch
 * databases throws before a process is spawned. Remote / unparsable URLs are for refusal tests only.
 */
function assertScratchOnly(dbUrl: string) {
  let u: URL;
  try {
    u = new URL(dbUrl);
  } catch {
    return;
  }
  if (!LOCAL_HOSTS.has(u.hostname)) return;
  const db = u.pathname.replace(/^\//, "");
  if (!ALLOWED.has(db) && !db.endsWith("_dummy")) {
    throw new Error(
      `db-migrations.test: refusing to run a script against local database "${db}"`,
    );
  }
}

type Run = { code: number; out: string };

async function run(
  args: string[],
  opts: {
    env?: Record<string, string | undefined>;
    dbUrl?: string;
    /** DATABASE_URL_TEST (db:test:prepare reads it) */
    testUrl?: string;
  } = {},
): Promise<Run> {
  const dbUrl = opts.dbUrl ?? urlOf(SCRATCH);
  assertScratchOnly(dbUrl);
  if (opts.testUrl) assertScratchOnly(opts.testUrl);
  const merged: Record<string, string | undefined> = {
    ...process.env,
    DATABASE_URL: dbUrl,
    DATABASE_URL_TEST: opts.testUrl, // undefined unless the script under test is db:test:prepare
    SEED_USER_PASSWORD: SEED_PASSWORD,
    DB_RESET_CONFIRM: undefined,
    MIGRATE_CONFIRM: undefined,
    BOOTSTRAP_ADMIN_PASSWORD: undefined,
    ...opts.env,
  };
  for (const k of Object.keys(merged)) {
    if (merged[k] === undefined) delete merged[k];
  }
  const proc = Bun.spawn([process.execPath, ...args], {
    cwd: BACKEND,
    env: merged as Record<string, string>,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [o, e] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, out: `${o}\n${e}` };
}

const migrate = (opts: Parameters<typeof run>[1] = {}) =>
  run(["run", "db:migrate"], opts);

// ---------------------------------------------------------------- database helpers
type Sql = ReturnType<typeof postgres>;

async function admin<T>(fn: (s: Sql) => Promise<T>): Promise<T> {
  const s = postgres(urlOf("postgres"), { max: 1, onnotice: () => {} });
  try {
    return await fn(s);
  } finally {
    await s.end({ timeout: 5 });
  }
}

async function recreateDb(name: string) {
  await admin(async (s) => {
    await s.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await s.unsafe(`CREATE DATABASE ${name}`);
  });
}

async function q<T>(db: string, fn: (s: Sql) => Promise<T>): Promise<T> {
  const s = postgres(urlOf(db), { max: 1, onnotice: () => {} });
  try {
    return await fn(s);
  } finally {
    await s.end({ timeout: 5 });
  }
}

type Row = Record<string, unknown>;

async function journal(s: Sql): Promise<Row[]> {
  const ex = await s`SELECT to_regclass('drizzle.__drizzle_migrations') AS t`;
  if (!ex[0].t) return [];
  return (await s.unsafe(
    `SELECT xmin::text AS _xmin, * FROM drizzle.__drizzle_migrations ORDER BY id`,
  )) as unknown as Row[];
}

async function publicTables(s: Sql): Promise<string[]> {
  const r = await s`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
  return r.map((x) => x.table_name as string);
}

async function relationOids(s: Sql): Promise<string[]> {
  const r = await s`SELECT n.nspname || '.' || c.relname || ':' || c.oid AS k
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'drizzle') AND c.relkind IN ('r', 'i', 'S')
    ORDER BY 1`;
  return r.map((x) => x.k as string);
}

async function count(s: Sql, table: string): Promise<number> {
  const r = await s.unsafe(`SELECT count(*)::int AS n FROM public."${table}"`);
  return r[0].n as number;
}

async function exists(s: Sql, qualified: string): Promise<boolean> {
  const r = await s`SELECT to_regclass(${qualified}) AS t`;
  return r[0].t !== null;
}

async function nothingApplied(db: string): Promise<boolean> {
  return q(db, async (s) => {
    const tables = await publicTables(s);
    const j = await journal(s);
    return tables.length === 0 && j.length === 0;
  });
}

async function snapshot(db: string) {
  return q(db, async (s) => ({
    j: await journal(s),
    rel: await relationOids(s),
  }));
}

/** Adds a journal row for a migration this repo does not have ("DB migrated by a newer branch"). */
const UNKNOWN_NAME = "20990101000000_from_a_newer_branch";
async function addUnknownJournalRow(s: Sql) {
  const last = (
    await s.unsafe(
      `SELECT * FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1`,
    )
  )[0] as Row;
  const row: Row = { ...last };
  delete row.id;
  if ("hash" in row) row.hash = "f".repeat(64);
  if ("name" in row) row.name = UNKNOWN_NAME;
  if ("created_at" in row) {
    const c = last.created_at;
    if (c instanceof Date) row.created_at = new Date(c.getTime() + 86_400_000);
    else row.created_at = String(BigInt(c as string) + 1000n);
  }
  const keys = Object.keys(row);
  await s.unsafe(
    `INSERT INTO drizzle.__drizzle_migrations (${keys.map((k) => `"${k}"`).join(",")})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
    keys.map((k) => row[k]) as never[],
  );
}

async function removeLastJournalRow(s: Sql) {
  await s.unsafe(
    `DELETE FROM drizzle.__drizzle_migrations
     WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations)`,
  );
}

// ---------------------------------------------------------------- repo helpers
function folders(): string[] {
  if (!existsSync(MIG_DIR)) return [];
  return readdirSync(MIG_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}
const sqlOf = (folder: string) =>
  readFileSync(join(MIG_DIR, folder, "migration.sql"), "utf8");

const schemaTables = Object.values(schema).filter((v) =>
  is(v, PgTable),
) as PgTable[];
const schemaEnums = Object.values(schema).filter(
  (v) =>
    typeof v === "function" &&
    typeof (v as { enumName?: unknown }).enumName === "string" &&
    Array.isArray((v as { enumValues?: unknown }).enumValues),
) as unknown as { enumName: string; enumValues: string[] }[];
const tableNames = schemaTables.map((t) => getTableConfig(t).name).sort();
const indexNames = schemaTables.flatMap((t) =>
  getTableConfig(t).indexes.map(
    (i) => (i as unknown as { config: { name: string } }).config.name,
  ),
);
const checkNames = schemaTables.flatMap((t) =>
  getTableConfig(t).checks.map((c) => c.name),
);

function listFiles(root: string, pattern: string): string[] {
  if (!existsSync(root)) return [];
  return [
    ...new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true }),
  ].map((f) => join(root, f));
}

function removeNewFolders(before: string[]) {
  for (const f of folders()) {
    if (!before.includes(f)) {
      rmSync(join(MIG_DIR, f), { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------- fake pg_dump
let fakeDir: string;
let emptyPathDir: string;
const fakeLog = () => join(fakeDir, "pg_dump.log");
const FAKE_SCRIPT = `#!/bin/sh
echo "ARGS: $* PGDATABASE=$PGDATABASE" >> "$FAKE_PGDUMP_LOG"
out=""
prev=""
for a in "$@"; do
  case "$a" in --file=*) out="\${a#--file=}";; esac
  if [ "$prev" = "-f" ] || [ "$prev" = "--file" ]; then out="$a"; fi
  prev="$a"
done
case "$FAKE_PGDUMP_MODE" in
  fail) echo "pg_dump: error: fake failure" >&2; exit 1;;
  empty) [ -n "$out" ] && : > "$out"; exit 0;;
  *) echo "FAKE-PGDUMP-CONTENT"; [ -n "$out" ] && echo "FAKE-PGDUMP-CONTENT" > "$out"; exit 0;;
esac
`;

function withFakeDump(mode: "ok" | "fail" | "empty") {
  return {
    PATH: `${fakeDir}:${process.env.PATH}`,
    FAKE_PGDUMP_MODE: mode,
    FAKE_PGDUMP_LOG: fakeLog(),
  };
}

const backupsBefore = new Set<string>();
function listBackups(): string[] {
  return existsSync(BACKUPS) ? readdirSync(BACKUPS) : [];
}
function newBackups(): string[] {
  return listBackups().filter((f) => !backupsBefore.has(f));
}

beforeAll(async () => {
  for (const f of listBackups()) backupsBefore.add(f);
  fakeDir = mkdtempSync(join(tmpdir(), "fake-pgdump-"));
  writeFileSync(join(fakeDir, "pg_dump"), FAKE_SCRIPT);
  chmodSync(join(fakeDir, "pg_dump"), 0o755);
  // a PATH dir that has no pg_dump (bun's own dir is appended where needed)
  emptyPathDir = mkdtempSync(join(tmpdir(), "no-pgdump-"));
  for (const db of [SCRATCH, FRESH, GUARD]) await recreateDb(db);
}, 60_000);

afterEach(() => {
  rmSync(fakeLog(), { force: true });
  for (const f of newBackups()) {
    if (f.startsWith(`${GUARD}-`)) rmSync(join(BACKUPS, f), { force: true });
  }
});

afterAll(async () => {
  for (const db of [SCRATCH, FRESH, GUARD]) {
    await admin((s) => s.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`));
  }
  rmSync(fakeDir, { recursive: true, force: true });
  rmSync(emptyPathDir, { recursive: true, force: true });
});

// =====================================================================================
describe("migration files (BR-MIG-02, 03, 04)", () => {
  test("BR-MIG-02 old files and July 2026 folders are gone; only generated folders remain", () => {
    const entries = existsSync(MIG_DIR) ? readdirSync(MIG_DIR) : [];
    for (const old of ["schema.ts", "relations.ts", "index.ts"]) {
      expect(entries).not.toContain(old);
    }
    expect(entries.filter((e) => e.startsWith("202607"))).toEqual([]);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (const e of entries) {
      expect(e).toMatch(/^\d{14}_\w+$/);
      expect(existsSync(join(MIG_DIR, e, "migration.sql"))).toBe(true);
      expect(existsSync(join(MIG_DIR, e, "snapshot.json"))).toBe(true);
    }
  });

  test("BR-MIG-02 nothing in src/, scripts/ or tests/ imports the old schema/relations/index files", () => {
    const bad =
      /from\s+["'][^"']*migrations\/(schema|relations|index)["']|from\s+["'][^"']*db\/migrations["']/;
    const offenders: string[] = [];
    for (const dir of ["src", "scripts", "tests"]) {
      for (const f of listFiles(join(BACKEND, dir), "**/*.ts")) {
        if (f === THIS_FILE) continue;
        if (bad.test(readFileSync(f, "utf8"))) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("BR-MIG-03 baseline SQL has every index, partial index and check constraint of the schema, by name", () => {
    const [baseline] = folders();
    expect(baseline).toBeDefined();
    const sql = sqlOf(baseline);
    const required = [
      "uq_locations_name_norm",
      "uq_locations_one_main_store",
      "uq_open_approval_request_per_doc",
      "idx_inventory_ledger_sco_loss",
      "company_settings_single_row",
      ...indexNames,
      ...checkNames,
    ];
    const missing = [...new Set(required)].filter((n) => !sql.includes(n));
    expect(missing).toEqual([]);
    // the *_norm indexes are on expressions, not plain columns
    expect(sql).toMatch(
      /lower\(\s*btrim\(\s*(?:"[a-z_]+"\.)?"name"\s*\)\s*\)/i,
    );
    for (const partial of [
      "uq_locations_one_main_store",
      "uq_open_approval_request_per_doc",
      "idx_inventory_ledger_sco_loss",
    ]) {
      expect(sql).toMatch(new RegExp(`"${partial}"[^;]*\\bWHERE\\b`, "i"));
    }
    expect(sql).toMatch(/company_settings_single_row"?\s+CHECK/i);
  });

  test("BR-MIG-04 the second migration is exactly DROP TABLE IF EXISTS role_pages; then pages;", () => {
    const f = folders();
    expect(f.length).toBeGreaterThanOrEqual(2);
    const text = sqlOf(f[1])
      .replace(/-->\s*statement-breakpoint/g, "")
      .replace(/--[^\n]*/g, "")
      .replace(/"/g, "")
      .replace(/\s+/g, " ")
      .trim();
    expect(text).toBe(
      "DROP TABLE IF EXISTS role_pages; DROP TABLE IF EXISTS pages;",
    );
  });
});

// =====================================================================================
describe("fresh DB gets the full schema from db:migrate (BR-MIG-01, 03, 13)", () => {
  let result: Run;
  beforeAll(async () => {
    await recreateDb(FRESH);
    result = await migrate({ dbUrl: urlOf(FRESH) });
  }, 180_000);

  test("BR-MIG-01 db:migrate on an empty DB exits 0 and journals every migration", async () => {
    expect(result.code).toBe(0);
    const rows = await q(FRESH, journal);
    expect(rows.length).toBe(folders().length);
  });

  test("BR-MIG-01 every table in the schema exists, and nothing else (pages / role_pages not created)", async () => {
    const tables = await q(FRESH, publicTables);
    expect(tables).toEqual(tableNames);
  });

  test("BR-MIG-01 every column of every table exists", async () => {
    await q(FRESH, async (s) => {
      for (const t of schemaTables) {
        const cfg = getTableConfig(t);
        const cols = await s`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${cfg.name}`;
        expect(cols.map((c) => c.column_name as string).sort()).toEqual(
          cfg.columns.map((c) => c.name).sort(),
        );
      }
    });
  });

  test("BR-MIG-01 every enum exists with its values in order", async () => {
    await q(FRESH, async (s) => {
      for (const e of schemaEnums) {
        const r = await s`SELECT e.enumlabel FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = ${e.enumName} ORDER BY e.enumsortorder`;
        expect(r.map((x) => x.enumlabel as string)).toEqual(e.enumValues);
      }
    });
  });

  test("BR-MIG-01 every foreign key exists (count per table)", async () => {
    await q(FRESH, async (s) => {
      for (const t of schemaTables) {
        const cfg = getTableConfig(t);
        const r = await s`SELECT count(*)::int AS n FROM pg_constraint
          WHERE contype = 'f' AND conrelid = ${`public."${cfg.name}"`}::regclass`;
        expect([cfg.name, r[0].n]).toEqual([cfg.name, cfg.foreignKeys.length]);
      }
    });
  });

  test("BR-MIG-01 every named index in the schema exists", async () => {
    const r = await q(
      FRESH,
      (s) => s`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const have = new Set(r.map((x) => x.indexname as string));
    expect(indexNames.filter((n) => !have.has(n))).toEqual([]);
  });

  test("BR-MIG-03 expression and partial indexes are in the database with their expressions / predicates", async () => {
    const r = await q(
      FRESH,
      (s) =>
        s`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const defs = new Map(
      r.map((x) => [x.indexname as string, x.indexdef as string]),
    );
    const norm = indexNames.filter((n) => n.endsWith("_norm"));
    expect(norm).toContain("uq_locations_name_norm");
    for (const n of norm) {
      expect(defs.get(n)).toMatch(/lower\(/i);
    }
    expect(defs.get("uq_locations_name_norm")).toMatch(/btrim\(/i);
    for (const p of [
      "uq_locations_one_main_store",
      "uq_open_approval_request_per_doc",
      "idx_inventory_ledger_sco_loss",
    ]) {
      expect(defs.get(p)).toMatch(/\bWHERE\b/i);
    }
  });

  test("BR-MIG-03 CHECK company_settings_single_row exists", async () => {
    const r = await q(
      FRESH,
      (s) => s`SELECT conname FROM pg_constraint
        WHERE contype = 'c' AND conname = 'company_settings_single_row'`,
    );
    expect(r.length).toBe(1);
  });

  test("BR-MIG-13 prints the target as host:port/db without the password, and the pending list in order", () => {
    const u = new URL(baseUrl);
    expect(result.out).toContain(`${u.host}/${FRESH}`);
    expect(result.out).not.toContain(`:${decodeURIComponent(u.password)}@`);
    const f = folders();
    const first = result.out.indexOf(f[0]);
    const second = result.out.indexOf(f[1]);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
  });

  test("BR-MIG-01 / 06 drizzle-kit generate right after says nothing to do, and drizzle-kit check passes", async () => {
    const before = folders();
    try {
      const gen = await run(["run", "drizzle-kit", "generate"], {
        dbUrl: urlOf(FRESH),
      });
      expect(gen.code).toBe(0);
      expect(gen.out).toMatch(/no schema changes|nothing to migrate/i);
      expect(folders()).toEqual(before);
      const chk = await run(["run", "drizzle-kit", "check"], {
        dbUrl: urlOf(FRESH),
      });
      expect(chk.code).toBe(0);
    } finally {
      removeNewFolders(before);
    }
  }, 120_000);
});

// =====================================================================================
describe("package scripts (BR-MIG-05, 07)", () => {
  const pkg = JSON.parse(
    readFileSync(join(BACKEND, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  test("BR-MIG-05 package.json has db:generate (drizzle-kit generate) and db:migrate", () => {
    expect(pkg.scripts["db:generate"]).toMatch(/drizzle-kit\s+generate/);
    expect(pkg.scripts["db:generate"]).not.toMatch(/--custom/);
    expect(pkg.scripts["db:migrate"]).toBeTruthy();
    expect(pkg.scripts["db:migrate"]).not.toMatch(/push/);
  });

  test("BR-MIG-05 db:generate with the schema in sync writes no new folder", async () => {
    const before = folders();
    try {
      const r = await run(["run", "db:generate"], { dbUrl: urlOf(FRESH) });
      expect(r.code).toBe(0);
      expect(folders()).toEqual(before);
    } finally {
      removeNewFolders(before);
    }
  }, 120_000);

  test("BR-MIG-07 package.json has no db:push", () => {
    expect(pkg.scripts["db:push"]).toBeUndefined();
  });

  test("BR-MIG-07 `bun run db:push` -> script not found", async () => {
    const r = await run(["run", "db:push"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not found|missing script/i);
  });

  test("BR-MIG-07 no script, workflow or live doc mentions db:push or drizzle-kit push", () => {
    const targets = [
      join(BACKEND, "package.json"),
      join(BACKEND, "CLAUDE.md"),
      join(REPO, "CLAUDE.md"),
      join(REPO, "docs/WORKFLOW.md"),
      ...listFiles(join(BACKEND, "scripts"), "**/*.ts"),
      ...listFiles(join(REPO, ".github"), "**/*.yml"),
    ];
    const offenders = targets.filter(
      (f) =>
        existsSync(f) &&
        /db:push|drizzle-kit\s+push/i.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  // Separate test: whether agent/skill instructions count as "docs" is a judgement call (see report).
  test("BR-MIG-07 agent and skill instructions do not tell anyone to run db:push", () => {
    const targets = [
      ...listFiles(join(REPO, ".claude/skills"), "**/SKILL.md"),
      ...listFiles(join(REPO, ".claude/agents"), "*.md"),
    ];
    const offenders = targets.filter((f) =>
      /db:push|drizzle-kit\s+push/i.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

// =====================================================================================
describe("db:migrate behaviour (BR-MIG-04, 13, 14, 15, 22)", () => {
  test("BR-MIG-04 old DB with pages + role_pages: second migration drops both, modules and its rows stay", async () => {
    await recreateDb(SCRATCH);
    expect((await migrate()).code).toBe(0);
    await q(SCRATCH, async (s) => {
      await s.unsafe(
        `INSERT INTO public.modules (name) VALUES ('mig_keep_a'), ('mig_keep_b')`,
      );
      await s.unsafe(
        `CREATE TABLE public.pages (id serial PRIMARY KEY, path text)`,
      );
      await s.unsafe(
        `CREATE TABLE public.role_pages (role_id int, page_id int REFERENCES public.pages(id))`,
      );
      await s.unsafe(`INSERT INTO public.pages (path) VALUES ('/x')`);
      await s.unsafe(`INSERT INTO public.role_pages VALUES (1, 1)`);
      await removeLastJournalRow(s); // as if the DB was built before the second migration
    });
    const modulesBefore = await q(SCRATCH, (s) => count(s, "modules"));
    const r = await migrate();
    expect(r.code).toBe(0);
    await q(SCRATCH, async (s) => {
      expect(await exists(s, "public.pages")).toBe(false);
      expect(await exists(s, "public.role_pages")).toBe(false);
      expect(await count(s, "modules")).toBe(modulesBefore);
      expect((await journal(s)).length).toBe(folders().length);
    });
  }, 240_000);

  test("BR-MIG-15 nothing pending -> 'up to date', exit 0, journal and relations untouched", async () => {
    await recreateDb(SCRATCH);
    expect((await migrate()).code).toBe(0);
    const before = await snapshot(SCRATCH);
    const r = await migrate();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/up to date/i);
    // same rows, same xmin (no update), same table/index oids
    expect(await snapshot(SCRATCH)).toEqual(before);
  }, 240_000);

  test("BR-MIG-13 a failing 2nd migration rolls back the 1st: exit non-zero, error names it, DB as before", async () => {
    await recreateDb(SCRATCH);
    // DROP TABLE on a view is an error even with IF EXISTS -> the 2nd migration fails
    await q(SCRATCH, (s) =>
      s.unsafe(`CREATE VIEW public.role_pages AS SELECT 1 AS x`),
    );
    const r = await migrate();
    expect(r.code).not.toBe(0);
    const second = folders()[1];
    expect(r.out.includes(second) || r.out.includes(second.slice(0, 14))).toBe(
      true,
    );
    await q(SCRATCH, async (s) => {
      expect(await publicTables(s)).toEqual([]); // baseline tables rolled back
      expect((await journal(s)).length).toBe(0);
      expect(await exists(s, "public.role_pages")).toBe(true); // untouched
    });
  }, 240_000);

  test("BR-MIG-14 journal has a migration the repo doesn't have -> refused, names it, nothing changed", async () => {
    await recreateDb(SCRATCH);
    expect((await migrate()).code).toBe(0);
    await q(SCRATCH, async (s) => {
      await addUnknownJournalRow(s);
      await s.unsafe(`CREATE TABLE public.pages (id serial)`); // canary: the 2nd migration must not run
      // make the real 2nd migration pending as well
      const rows = await journal(s);
      await s.unsafe(
        `DELETE FROM drizzle.__drizzle_migrations WHERE id = ${rows[1].id}`,
      );
    });
    const before = await snapshot(SCRATCH);
    const r = await migrate();
    expect(r.code).not.toBe(0);
    if ("name" in before.j[0]) expect(r.out).toContain(UNKNOWN_NAME);
    expect(await snapshot(SCRATCH)).toEqual(before);
    await q(SCRATCH, async (s) => {
      expect(await exists(s, "public.pages")).toBe(true);
    });
  }, 240_000);

  test("BR-MIG-14 journal row whose file content changed -> refused, nothing changed", async () => {
    await recreateDb(SCRATCH);
    expect((await migrate()).code).toBe(0);
    await q(SCRATCH, async (s) => {
      const cols = await s`SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'`;
      expect(cols.map((c) => c.column_name)).toContain("hash");
      await s.unsafe(
        `UPDATE drizzle.__drizzle_migrations SET hash = 'edited-after-apply'
         WHERE id = (SELECT min(id) FROM drizzle.__drizzle_migrations)`,
      );
      await s.unsafe(`CREATE TABLE public.pages (id serial)`);
      await removeLastJournalRow(s); // a pending migration that must NOT be applied
    });
    const before = await snapshot(SCRATCH);
    const r = await migrate();
    expect(r.code).not.toBe(0);
    expect(await snapshot(SCRATCH)).toEqual(before);
  }, 240_000);

  test("BR-MIG-22 the server starts with a migration pending and does not apply it", async () => {
    await recreateDb(SCRATCH);
    expect((await migrate()).code).toBe(0);
    await q(SCRATCH, async (s) => {
      await s.unsafe(
        readFileSync(join(BACKEND, "src/db/seed_roles.sql"), "utf8"),
      );
      await s.unsafe(`CREATE TABLE public.pages (id serial)`); // canary
      await removeLastJournalRow(s); // 1 pending
    });
    const port = 47391;
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      DATABASE_URL: urlOf(SCRATCH),
      PORT: String(port),
    };
    delete env.DATABASE_URL_TEST;
    assertScratchOnly(env.DATABASE_URL);
    const proc = Bun.spawn([process.execPath, "src/index.ts"], {
      cwd: BACKEND,
      env,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    let up = false;
    try {
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline && proc.exitCode === null) {
        try {
          await fetch(`http://localhost:${port}/`);
          up = true;
          break;
        } catch {
          await Bun.sleep(300);
        }
      }
      expect(up).toBe(true); // "starts"
    } finally {
      proc.kill();
      await proc.exited;
    }
    await q(SCRATCH, async (s) => {
      expect((await journal(s)).length).toBe(folders().length - 1);
      expect(await exists(s, "public.pages")).toBe(true);
    });
  }, 120_000);

  test("BR-MIG-22 no application code imports the drizzle migrator", () => {
    const offenders = listFiles(join(BACKEND, "src"), "**/*.ts").filter((f) =>
      /drizzle-orm\/[\w-]+\/migrator/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

// =====================================================================================
describe("db:migrate guard, confirm and backup (BR-MIG-16, 17)", () => {
  async function freshGuard() {
    await recreateDb(GUARD);
  }

  test("BR-MIG-17 unusual DB without MIGRATE_CONFIRM -> exit 2, no dump, nothing applied", async () => {
    await freshGuard();
    const r = await migrate({ dbUrl: urlOf(GUARD), env: withFakeDump("ok") });
    expect(r.code).toBe(2);
    expect(existsSync(fakeLog())).toBe(false); // refused before the backup
    expect(newBackups()).toEqual([]);
    expect(await nothingApplied(GUARD)).toBe(true);
  }, 120_000);

  test("BR-MIG-17 wrong MIGRATE_CONFIRM -> exit 2, no dump, nothing applied", async () => {
    await freshGuard();
    const r = await migrate({
      dbUrl: urlOf(GUARD),
      env: { ...withFakeDump("ok"), MIGRATE_CONFIRM: "somethingelse" },
    });
    expect(r.code).toBe(2);
    expect(existsSync(fakeLog())).toBe(false);
    expect(newBackups()).toEqual([]);
    expect(await nothingApplied(GUARD)).toBe(true);
  }, 120_000);

  test("BR-MIG-17 remote host without MIGRATE_CONFIRM -> exit 2 before connecting", async () => {
    const r = await migrate({
      dbUrl: "postgres://u:pw-remote@db.example.com:5432/somedb",
      env: withFakeDump("ok"),
    });
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(/ENOTFOUND|getaddrinfo|ECONNREFUSED|ETIMEDOUT/);
    expect(existsSync(fakeLog())).toBe(false);
  }, 120_000);

  test("BR-MIG-17 local port other than 5432/5433 without MIGRATE_CONFIRM -> exit 2 before connecting (ssh tunnel)", async () => {
    const u = new URL(urlOf(SCRATCH));
    u.port = "15432";
    const r = await migrate({ dbUrl: u.toString(), env: withFakeDump("ok") });
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(/ECONNREFUSED|ETIMEDOUT/);
    expect(existsSync(fakeLog())).toBe(false);
  }, 120_000);

  test("BR-MIG-16 unusual DB with matching MIGRATE_CONFIRM: dump file written, path printed, migrations applied", async () => {
    await freshGuard();
    const r = await migrate({
      dbUrl: urlOf(GUARD),
      env: { ...withFakeDump("ok"), MIGRATE_CONFIRM: GUARD },
    });
    expect(r.code).toBe(0);
    const files = newBackups();
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(new RegExp(`^${GUARD}-\\d{8}-\\d{4}\\.dump$`));
    expect(statSync(join(BACKUPS, files[0])).size).toBeGreaterThan(0);
    expect(r.out).toContain(files[0]);
    expect(existsSync(fakeLog())).toBe(true);
    expect(readFileSync(fakeLog(), "utf8")).toContain(GUARD);
    await q(GUARD, async (s) => {
      expect((await journal(s)).length).toBe(folders().length);
      expect(await publicTables(s)).toEqual(tableNames);
    });
  }, 240_000);

  test("BR-MIG-16 backend/backups/ is gitignored (a dump file there is ignored by git)", () => {
    const p = Bun.spawnSync(
      [
        "git",
        "check-ignore",
        "-q",
        "backend/backups/diecast_uat-20261001-1030.dump",
      ],
      { cwd: REPO },
    );
    expect(p.exitCode).toBe(0);
  });

  test("BR-MIG-16 pg_dump fails -> refused, nothing applied", async () => {
    await freshGuard();
    const r = await migrate({
      dbUrl: urlOf(GUARD),
      env: { ...withFakeDump("fail"), MIGRATE_CONFIRM: GUARD },
    });
    expect(r.code).not.toBe(0);
    expect(existsSync(fakeLog())).toBe(true);
    expect(await nothingApplied(GUARD)).toBe(true);
  }, 120_000);

  test("BR-MIG-16 pg_dump writes an empty dump -> refused, nothing applied", async () => {
    await freshGuard();
    const r = await migrate({
      dbUrl: urlOf(GUARD),
      env: { ...withFakeDump("empty"), MIGRATE_CONFIRM: GUARD },
    });
    expect(r.code).not.toBe(0);
    expect(existsSync(fakeLog())).toBe(true); // pg_dump was really called
    expect(await nothingApplied(GUARD)).toBe(true);
  }, 120_000);

  test("BR-MIG-16 pg_dump not installed -> refused (says so), nothing applied", async () => {
    await freshGuard();
    const r = await migrate({
      dbUrl: urlOf(GUARD),
      env: {
        PATH: `${emptyPathDir}:${dirname(process.execPath)}`,
        MIGRATE_CONFIRM: GUARD,
      },
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/pg_dump/i);
    expect(await nothingApplied(GUARD)).toBe(true);
  }, 120_000);

  test("BR-MIG-16 usual local test DB (name ends _test): no dump taken, no confirm needed", async () => {
    await recreateDb(SCRATCH);
    const r = await migrate({
      dbUrl: urlOf(SCRATCH),
      env: withFakeDump("fail"), // would refuse if pg_dump were called
    });
    expect(r.code).toBe(0);
    expect(existsSync(fakeLog())).toBe(false);
    expect(newBackups()).toEqual([]);
  }, 240_000);
});

// =====================================================================================
describe("db:test:prepare (BR-MIG-10, 11)", () => {
  const DUMMY = urlOf("diecast_mig_unused_dummy"); // must never be connected to
  const prepare = (db: string = SCRATCH) =>
    run(["run", "db:test:prepare"], { dbUrl: DUMMY, testUrl: urlOf(db) });

  async function seedCounts(db: string) {
    return q(db, async (s) => ({
      roles: await count(s, "roles"),
      permissions: await count(s, "permissions"),
      policies: await count(s, "approval_policies"),
    }));
  }

  test("BR-MIG-10 applies the migrations and the seed to an empty test DB", async () => {
    await recreateDb(SCRATCH);
    const r = await prepare();
    expect(r.code).toBe(0);
    await q(SCRATCH, async (s) => {
      expect((await journal(s)).length).toBe(folders().length);
      expect(await publicTables(s)).toEqual(tableNames);
    });
    const c = await seedCounts(SCRATCH);
    expect(c.roles).toBeGreaterThan(0);
    expect(c.permissions).toBeGreaterThan(0);
    expect(c.policies).toBeGreaterThan(0);
  }, 240_000);

  test("BR-MIG-10 a re-run with nothing pending says 'up to date', changes no schema, seed stays idempotent", async () => {
    await recreateDb(SCRATCH);
    expect((await prepare()).code).toBe(0);
    const before = await snapshot(SCRATCH);
    const countsBefore = await seedCounts(SCRATCH);
    const r = await prepare();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/up to date/i);
    expect(await snapshot(SCRATCH)).toEqual(before);
    expect(await seedCounts(SCRATCH)).toEqual(countsBefore);
  }, 240_000);

  test("BR-MIG-11 tables but no journal (built by push) -> says why, drops public + drizzle, rebuilds", async () => {
    await recreateDb(SCRATCH);
    await q(SCRATCH, async (s) => {
      await s.unsafe(`CREATE TABLE public.pages (id serial PRIMARY KEY)`);
      await s.unsafe(`CREATE TABLE public.mig_old_sentinel (x int)`);
    });
    const r = await prepare();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/rebuil/i);
    expect(r.out).toMatch(/push|journal/i);
    await q(SCRATCH, async (s) => {
      expect(await exists(s, "public.mig_old_sentinel")).toBe(false);
      expect(await exists(s, "public.pages")).toBe(false);
      expect(await publicTables(s)).toEqual(tableNames);
      expect((await journal(s)).length).toBe(folders().length);
    });
  }, 240_000);

  test("BR-MIG-11 journal row the repo doesn't have -> rebuilt", async () => {
    await recreateDb(SCRATCH);
    expect((await prepare()).code).toBe(0);
    await q(SCRATCH, async (s) => {
      await addUnknownJournalRow(s);
      await s.unsafe(`CREATE TABLE public.mig_old_sentinel (x int)`);
    });
    const r = await prepare();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/rebuil/i);
    await q(SCRATCH, async (s) => {
      expect(await exists(s, "public.mig_old_sentinel")).toBe(false);
      const j = await journal(s);
      expect(j.length).toBe(folders().length);
      if (j.length > 0 && "name" in j[0]) {
        expect(j.map((x) => x.name)).not.toContain(UNKNOWN_NAME);
      }
    });
  }, 240_000);

  test("BR-MIG-11 only a *_test DB: a non-test DB is refused and left untouched", async () => {
    await recreateDb(GUARD);
    await q(GUARD, async (s) => {
      await s.unsafe(`CREATE TABLE public.mig_old_sentinel (x int)`);
      await s.unsafe(`INSERT INTO public.mig_old_sentinel VALUES (7)`);
    });
    const r = await prepare(GUARD);
    expect(r.code).not.toBe(0);
    await q(GUARD, async (s) => {
      const rows = await s`SELECT x FROM public.mig_old_sentinel`;
      expect(rows.length).toBe(1);
      expect(rows[0].x).toBe(7);
    });
  }, 120_000);
});

// =====================================================================================
describe("db:reset (BR-MIG-09)", () => {
  test("BR-MIG-09 db:reset drops public and drizzle, applies the migrations, then seeds roles, admin, policies", async () => {
    await recreateDb(SCRATCH);
    await q(SCRATCH, async (s) => {
      await s.unsafe(`CREATE TABLE public.mig_old_sentinel (x int)`);
      await s.unsafe(`CREATE SCHEMA drizzle`);
      await s.unsafe(`CREATE TABLE drizzle.mig_old_junk (x int)`);
    });
    const r = await run(["run", "db:reset", "--no-fixtures"]);
    expect(r.code).toBe(0);
    await q(SCRATCH, async (s) => {
      expect(await exists(s, "public.mig_old_sentinel")).toBe(false);
      expect(await exists(s, "drizzle.mig_old_junk")).toBe(false);
      expect((await journal(s)).length).toBe(folders().length);
      expect(await publicTables(s)).toEqual(tableNames);
      expect(await count(s, "roles")).toBeGreaterThan(0);
      expect(await count(s, "approval_policies")).toBeGreaterThan(0);
      const adm =
        await s`SELECT 1 FROM public.employees WHERE email = 'admin@diecast.local'`;
      expect(adm.length).toBe(1);
    });
  }, 300_000);

  test("BR-MIG-09 a second db:reset gives the same journal and the same seed row counts", async () => {
    const stats = (db: string) =>
      q(db, async (s) => ({
        j: (await journal(s)).length,
        roles: await count(s, "roles"),
        policies: await count(s, "approval_policies"),
        employees: await count(s, "employees"),
      }));
    await recreateDb(SCRATCH);
    expect((await run(["run", "db:reset", "--no-fixtures"])).code).toBe(0);
    const first = await stats(SCRATCH);
    expect(first.j).toBe(folders().length);
    expect(first.roles).toBeGreaterThan(0);
    const r = await run(["run", "db:reset", "--no-fixtures"]);
    expect(r.code).toBe(0);
    expect(await stats(SCRATCH)).toEqual(first);
  }, 300_000);
});

// =====================================================================================
describe("CI workflow (BR-MIG-12)", () => {
  const ci = readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8");

  test("BR-MIG-12 after db:reset --no-fixtures, CI runs drizzle-kit generate and drizzle-kit check", () => {
    const reset = ci.indexOf("db:reset --no-fixtures");
    expect(reset).toBeGreaterThanOrEqual(0);
    const after = ci.slice(reset);
    expect(after).toMatch(/drizzle-kit\s+generate/);
    expect(after).toMatch(/drizzle-kit\s+check/);
  });

  test("BR-MIG-12 CI fails when generate adds or changes a file under src/db/migrations", () => {
    const after = ci.slice(ci.indexOf("db:reset --no-fixtures"));
    expect(after).toMatch(/git\s+(status|diff|ls-files)[^\n]*migrations/);
  });

  test("BR-MIG-12 CI builds the DB by migrations, never by push", () => {
    expect(ci).not.toMatch(/db:push|drizzle-kit\s+push/);
  });
});
