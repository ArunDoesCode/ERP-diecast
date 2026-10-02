/**
 * docs/specs/known-defects.md (v5) — db:test:prepare (BL-071)
 * BR-KD-52 `bun run db:test:prepare` builds the test DB by running `db:reset --no-fixtures` with
 *          DATABASE_URL set to DATABASE_URL_TEST (one build path, local and CI never drift). It refuses
 *          with exit 2, nothing changed, if DATABASE_URL_TEST is missing, not a valid URL, names a DB not
 *          ending in `_test`, or equals DATABASE_URL. It needs SEED_USER_PASSWORD like db:reset (exit 4).
 * BR-KD-35 (the `--no-fixtures` build is the one test-DB build: same result as db:reset --no-fixtures)
 *
 * The script is a separate process, so it runs against scratch databases created on the same server as
 * the shared test DB (which is never touched):
 *   diecast_kd_prep_test      DATABASE_URL_TEST target of the good run
 *   diecast_kd_prep_dev       stands in for the dev DB (DATABASE_URL); must stay untouched
 *   diecast_kd_prep_ref_test  reference build made by `db:reset --no-fixtures` directly
 *   diecast_kd_prep_bad       name does not end in `_test`
 *   diecast_kd_prep_test_old  name contains `_test` but does not end in it
 * A target named `diecast` is only ever aimed at a port where nothing listens (never a real dev DB).
 * Entry point: `bun run db:test:prepare` (backend/). Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";

const TEST = "diecast_kd_prep_test";
const DEV = "diecast_kd_prep_dev";
const REF = "diecast_kd_prep_ref_test";
const BAD = "diecast_kd_prep_bad";
const BAD_SUFFIX = "diecast_kd_prep_test_old";
const ALL = [TEST, DEV, REF, BAD, BAD_SUFFIX];
const BACKEND = new URL("../..", import.meta.url).pathname;
const SEED_PASSWORD = "kd-Prep-Pass-5528";

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

const sharedUrl = process.env.DATABASE_URL as string; // preload = DATABASE_URL_TEST
const url = (db: string) => withDb(sharedUrl, db);
const sqls: Record<string, ReturnType<typeof postgres>> = {};
const deadPorts = new Set<string>();

type Run = { code: number; out: string };

async function isListening(host: string, port: number): Promise<boolean> {
  try {
    const s = await Bun.connect({
      hostname: host,
      port,
      socket: { data() {}, open() {}, close() {}, error() {} },
    });
    s.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Isolation guard: the script wipes a schema. DATABASE_URL_TEST may only be empty, unparsable, one of the
 * scratch DBs, or a `diecast`-style name on a verified-dead port.
 */
function assertSafeTarget(raw: string) {
  if (raw === "") return;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return;
  }
  const db = u.pathname.replace(/^\//, "");
  if (ALL.includes(db)) return;
  if (deadPorts.has(u.port)) return;
  throw new Error(
    `prepare-test-db.test: refusing DATABASE_URL_TEST "${db}" on port ${u.port}`,
  );
}

async function prepare(
  testUrl: string,
  opts: {
    devUrl?: string;
    env?: Record<string, string | undefined>;
  } = {},
): Promise<Run> {
  assertSafeTarget(testUrl);
  const merged: Record<string, string | undefined> = {
    ...process.env,
    DATABASE_URL: opts.devUrl ?? url(DEV),
    DATABASE_URL_TEST: testUrl,
    // "" (not unset): a set-but-empty variable beats the auto-loaded backend/.env
    SEED_USER_PASSWORD: SEED_PASSWORD,
    DB_RESET_CONFIRM: undefined,
    BOOTSTRAP_ADMIN_PASSWORD: undefined,
    ...opts.env,
  };
  for (const k of Object.keys(merged)) {
    if (merged[k] === undefined) delete merged[k];
  }
  const proc = Bun.spawn(["bun", "run", "db:test:prepare"], {
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
  return { code: await proc.exited, out: `${o}\n${e}` };
}

async function resetNoFixtures(db: string): Promise<Run> {
  const proc = Bun.spawn(["bun", "run", "db:reset", "--no-fixtures"], {
    cwd: BACKEND,
    env: {
      ...process.env,
      DATABASE_URL: url(db),
      DATABASE_URL_TEST: "",
      SEED_USER_PASSWORD: SEED_PASSWORD,
      DB_RESET_CONFIRM: undefined,
      BOOTSTRAP_ADMIN_PASSWORD: undefined,
    } as unknown as Record<string, string>,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [o, e] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, out: `${o}\n${e}` };
}

async function plantSentinel(db: string) {
  await sqls[db].unsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
  await sqls[db].unsafe(`CREATE SCHEMA public`);
  await sqls[db].unsafe(`CREATE TABLE public.kd_old_data (x int)`);
  await sqls[db].unsafe(`INSERT INTO public.kd_old_data VALUES (42)`);
}
async function sentinelIntact(db: string): Promise<boolean> {
  try {
    const rows = await sqls[db]`SELECT x FROM public.kd_old_data`;
    return rows.length === 1 && rows[0].x === 42;
  } catch {
    return false;
  }
}

async function snapshot(db: string) {
  const s = sqls[db];
  const tables = await s`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const name = t.table_name as string;
    const [r] = await s.unsafe(
      `SELECT count(*)::int AS n FROM public."${name}"`,
    );
    counts[name] = r.n as number;
  }
  const roles = await s`SELECT name, is_system FROM roles ORDER BY name`;
  const grants = await s`SELECT r.name AS role, rp.permission_key AS key
    FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
    ORDER BY r.name, rp.permission_key`;
  const keys = await s`SELECT key FROM permissions ORDER BY key`;
  const emps = await s`SELECT e.email, e.is_active, r.name AS role
    FROM employees e JOIN roles r ON r.id = e.role_id ORDER BY e.email`;
  return {
    counts,
    roles: roles.map((x) => ({ ...x })),
    grants: grants.map((x) => ({ ...x })),
    keys: keys.map((x) => x.key),
    emps: emps.map((x) => ({ ...x })),
  };
}

beforeAll(async () => {
  const admin = postgres(withDb(sharedUrl, "postgres"), { max: 1 });
  for (const db of ALL) {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${db}`);
  }
  await admin.end({ timeout: 5 });
  for (const db of ALL)
    sqls[db] = postgres(url(db), { max: 2, onnotice: () => {} });
  const serverPort = new URL(sharedUrl).port || "5432";
  for (const p of ["5432", "5433"]) {
    if (
      p !== serverPort &&
      !(await isListening("127.0.0.1", Number(p))) &&
      !(await isListening("::1", Number(p)))
    )
      deadPorts.add(p);
  }
}, 60_000);

afterAll(async () => {
  for (const db of ALL) await sqls[db]?.end({ timeout: 5 });
  const admin = postgres(withDb(sharedUrl, "postgres"), { max: 1 });
  for (const db of ALL)
    await admin.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  await admin.end({ timeout: 5 });
});

describe("db:test:prepare refuses, nothing changed (BR-KD-52)", () => {
  test("BR-KD-52 DATABASE_URL_TEST missing -> exit 2, dev and test data untouched", async () => {
    await plantSentinel(TEST);
    await plantSentinel(DEV);
    const r = await prepare("");
    expect(r.code).toBe(2);
    expect(await sentinelIntact(TEST)).toBe(true);
    expect(await sentinelIntact(DEV)).toBe(true);
  });

  test("BR-KD-52 DATABASE_URL_TEST not a valid URL -> exit 2", async () => {
    await plantSentinel(DEV);
    const r = await prepare("this is not a url");
    expect(r.code).toBe(2);
    expect(await sentinelIntact(DEV)).toBe(true);
  });

  test("BR-KD-52 DATABASE_URL_TEST names a DB not ending in _test -> exit 2, that DB untouched", async () => {
    await plantSentinel(BAD);
    await plantSentinel(DEV);
    const r = await prepare(url(BAD));
    expect(r.code).toBe(2);
    expect(await sentinelIntact(BAD)).toBe(true);
    expect(await sentinelIntact(DEV)).toBe(true);
  });

  test("BR-KD-52 a name that merely contains _test (not at the end) -> exit 2, that DB untouched", async () => {
    await plantSentinel(BAD_SUFFIX);
    const r = await prepare(url(BAD_SUFFIX));
    expect(r.code).toBe(2);
    expect(await sentinelIntact(BAD_SUFFIX)).toBe(true);
  });

  test("BR-KD-52 DATABASE_URL_TEST = .../diecast (the dev DB name) -> exit 2 before connecting", async () => {
    const port = ["5432", "5433"].find((p) => deadPorts.has(p));
    if (!port) return; // something listens on both usual ports: do not aim a `diecast` URL at it
    const u = new URL(sharedUrl);
    u.hostname = "localhost";
    u.port = port;
    u.pathname = "/diecast";
    await plantSentinel(DEV);
    const r = await prepare(u.toString());
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|getaddrinfo/);
    expect(await sentinelIntact(DEV)).toBe(true);
  });

  test("BR-KD-52 DATABASE_URL_TEST equals DATABASE_URL -> exit 2, that DB untouched", async () => {
    await plantSentinel(TEST);
    const r = await prepare(url(TEST), { devUrl: url(TEST) });
    expect(r.code).toBe(2);
    expect(await sentinelIntact(TEST)).toBe(true);
  });

  test("BR-KD-52 SEED_USER_PASSWORD missing -> exit 4, test DB data still there", async () => {
    await plantSentinel(TEST);
    const r = await prepare(url(TEST), { env: { SEED_USER_PASSWORD: "" } });
    expect(r.code).toBe(4);
    expect(await sentinelIntact(TEST)).toBe(true);
  });

  test("BR-KD-52 SEED_USER_PASSWORD shorter than 8 -> exit 4, value not printed, data still there", async () => {
    await plantSentinel(TEST);
    const r = await prepare(url(TEST), {
      env: { SEED_USER_PASSWORD: "short7!" },
    });
    expect(r.code).toBe(4);
    expect(r.out).not.toContain("short7!");
    expect(await sentinelIntact(TEST)).toBe(true);
  });
});

describe("db:test:prepare good run (BR-KD-52, BR-KD-35)", () => {
  let good: Run;
  let ref: Run;

  beforeAll(async () => {
    await plantSentinel(TEST);
    await plantSentinel(DEV);
    good = await prepare(url(TEST));
    ref = await resetNoFixtures(REF);
  }, 600_000);

  test("BR-KD-52 exit 0; the old data in the test DB is gone", async () => {
    expect(good.code).toBe(0);
    const gone = await sqls[
      TEST
    ]`SELECT to_regclass('public.kd_old_data') AS t`;
    expect(gone[0].t).toBeNull();
  });

  test("BR-KD-52 DATABASE_URL (the dev DB) is untouched: the build ran on DATABASE_URL_TEST", async () => {
    expect(await sentinelIntact(DEV)).toBe(true);
  });

  test("BR-KD-52 result is the --no-fixtures build: 1 admin employee, 0 PRs, approval policies present", async () => {
    const emps = await sqls[TEST]`SELECT e.email, e.is_active, r.name AS role
      FROM employees e JOIN roles r ON r.id = e.role_id`;
    expect(emps.length).toBe(1);
    expect(emps[0].email).toBe("admin@diecast.local");
    expect(emps[0].role).toBe("super-admin");
    expect(emps[0].is_active).toBe(true);
    const [pr] = await sqls[
      TEST
    ]`SELECT count(*)::int AS n FROM purchase_requests`;
    expect(pr.n).toBe(0);
    const [pol] = await sqls[
      TEST
    ]`SELECT count(*)::int AS n FROM approval_policies`;
    expect(pol.n).toBeGreaterThan(0);
  });

  test("BR-KD-52 same roles, permission keys, approval policies and employee count as db:reset --no-fixtures", async () => {
    expect(ref.code).toBe(0);
    const a = await snapshot(TEST);
    const b = await snapshot(REF);
    expect(a.roles).toEqual(b.roles);
    expect(a.keys).toEqual(b.keys);
    expect(a.grants).toEqual(b.grants);
    expect(a.emps).toEqual(b.emps);
    expect(a.counts.approval_policies).toBe(b.counts.approval_policies);
    expect(a.counts).toEqual(b.counts);
    expect(a.keys.length).toBeGreaterThan(0);
  });

  test("BR-KD-52 the seed password is not printed", () => {
    expect(good.out).not.toContain(SEED_PASSWORD);
  });
});
