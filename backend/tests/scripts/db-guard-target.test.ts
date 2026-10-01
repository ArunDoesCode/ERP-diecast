/**
 * docs/specs/known-defects.md (v5) — BR-KD-53: the guard (BR-KD-30, BR-KD-52) judges the DB the driver will
 * really connect to. It reads host, port and database name the way the postgres driver does (PGHOST / PGPORT /
 * PGDATABASE count when the URL omits them). A URL with no database name, with more than one host, or whose
 * name can't be read exactly is refused: exit 2 before connecting, data untouched. An empty confirm counts as
 * no confirm. NODE_ENV is compared case-insensitively.
 *
 * The scripts are separate processes, so they run against a scratch database on the same server as the shared
 * test DB (`diecast_kd_target_test`, dropped afterwards). The shared test DB is never touched. Every target is
 * built so a guard bug cannot reach a real DB: names that look real (`diecast`) are only aimed at a port where
 * nothing listens, and everything else is the scratch DB or a name that exists nowhere.
 * Entry points: `bun run db:reset`, `bun run db:test:prepare` (backend/). Written by test-writer from the spec only.
 *
 * v5 SEC-7 clarification: a URL with any query string (`?database=`, `?user=`, `?host=`, `?sslmode=` ...) is
 * refused the same way, by both entry points, whatever the flags or confirm.
 *
 * Not covered (spec does not say what the right outcome is): a URL with no DB name but PGDATABASE set (refuse
 * for "no name", or judge PGDATABASE?); "name can't be read exactly" beyond the multi-host forms.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import postgres from "postgres";

// A guard bug lets the script run a full reset against the scratch DB; let it finish instead of leaking a process.
setDefaultTimeout(240_000);

const SCRATCH = "diecast_kd_target_test";
const NOWHERE = "diecast_kd_target_nowhere_test"; // exists on no server
const BACKEND = new URL("../..", import.meta.url).pathname;
const SEED_PASSWORD = "kd-Target-Pass-6613";
const NO_CONN = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|getaddrinfo/;

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

const sharedUrl = process.env.DATABASE_URL as string; // preload = DATABASE_URL_TEST
const shared = new URL(sharedUrl);
const serverPort = shared.port || "5432";
const serverHost = shared.hostname;
const auth = `${shared.username}:${shared.password}`; // already URL-encoded form from the parsed URL
let sql: ReturnType<typeof postgres>;
let deadPort: string; // a port where nothing listens

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
async function isDeadPort(port: number): Promise<boolean> {
  for (const h of ["127.0.0.1", "::1"])
    if (await isListening(h, port)) return false;
  return true;
}

const PG_VARS = [
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "PGSSLMODE",
];

function cleanEnv(env: Record<string, string | undefined>) {
  const merged: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: undefined,
    SEED_USER_PASSWORD: SEED_PASSWORD,
    DB_RESET_CONFIRM: undefined,
    BOOTSTRAP_ADMIN_PASSWORD: undefined,
    ...Object.fromEntries(PG_VARS.map((k) => [k, undefined])),
    ...env,
  };
  for (const k of Object.keys(merged))
    if (merged[k] === undefined) delete merged[k];
  return merged as Record<string, string>;
}

async function spawn(cmd: string[], env: Record<string, string>): Promise<Run> {
  const proc = Bun.spawn(cmd, {
    cwd: BACKEND,
    env,
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

/** Run `bun run db:reset` with DATABASE_URL = `dbUrl` (a raw string: the tests craft odd URLs on purpose). */
function reset(
  dbUrl: string,
  args: string[] = [],
  env: Record<string, string | undefined> = {},
) {
  return spawn(
    ["bun", "run", "db:reset", ...args],
    cleanEnv({ DATABASE_URL: dbUrl, DATABASE_URL_TEST: undefined, ...env }),
  );
}

/** Run `bun run db:test:prepare` with DATABASE_URL_TEST = `testUrl`. */
function prepare(
  testUrl: string,
  env: Record<string, string | undefined> = {},
) {
  return spawn(
    ["bun", "run", "db:test:prepare"],
    cleanEnv({
      DATABASE_URL: withDb(sharedUrl, "diecast_kd_target_dev"),
      DATABASE_URL_TEST: testUrl,
      ...env,
    }),
  );
}

async function plantSentinel() {
  await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
  await sql.unsafe(`CREATE SCHEMA public`);
  await sql.unsafe(`CREATE TABLE public.kd_old_data (x int)`);
  await sql.unsafe(`INSERT INTO public.kd_old_data VALUES (42)`);
}
async function sentinelIntact(): Promise<boolean> {
  try {
    const rows = await sql`SELECT x FROM public.kd_old_data`;
    return rows.length === 1 && rows[0].x === 42;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  const admin = postgres(withDb(sharedUrl, "postgres"), { max: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${SCRATCH}`);
  await admin.end({ timeout: 5 });
  const dead = ["6543", "5433", "5432", "15432"].find(
    (p) => p !== serverPort,
  ) as string;
  for (const p of ["6543", "15432", "5433", "5432"]) {
    if (p !== serverPort && (await isDeadPort(Number(p)))) {
      deadPort = p;
      break;
    }
  }
  deadPort ??= dead;
  sql = postgres(withDb(sharedUrl, SCRATCH), { max: 2, onnotice: () => {} });
}, 60_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  const admin = postgres(withDb(sharedUrl, "postgres"), { max: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
  await admin.end({ timeout: 5 });
});

describe("db:reset reads the real target (BR-KD-53)", () => {
  test("BR-KD-53 URL with no database name -> exit 2 before connecting", async () => {
    const r = await reset(`postgres://u:p@localhost:${deadPort}`);
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  });

  test("BR-KD-53 URL with a trailing slash but no database name -> exit 2 before connecting", async () => {
    const r = await reset(`postgres://u:p@localhost:${deadPort}/`);
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  });

  test("BR-KD-53 no database name even with --allow-remote and a confirm -> exit 2", async () => {
    const r = await reset(
      `postgres://u:p@localhost:${deadPort}`,
      ["--allow-remote"],
      { DB_RESET_CONFIRM: "diecast" },
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  });

  test("BR-KD-53 URL with no database name + PGDATABASE=diecast and no confirm -> exit 2 (never judged as a `_test` DB)", async () => {
    const r = await reset(`postgres://u:p@localhost:${deadPort}`, [], {
      PGDATABASE: "diecast",
    });
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  });

  test("BR-KD-53 userinfo that hides a second host (a@b,prod.example.com:p@localhost:port/db_test) -> exit 2, data untouched", async () => {
    await plantSentinel();
    const r = await reset(
      `postgres://a@b,prod.example.com:p@${serverHost}:${serverPort}/${SCRATCH}`,
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-53 two hosts in the URL (h1:port,prod.example.com:port/db_test) -> exit 2, data untouched", async () => {
    await plantSentinel();
    const r = await reset(
      `postgres://${auth}@${serverHost}:${serverPort},prod.example.com:5432/${SCRATCH}`,
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-53 two hosts, second one local, on a `_test` DB -> exit 2 (more than one host is never accepted)", async () => {
    await plantSentinel();
    const r = await reset(
      `postgres://${auth}@localhost:${serverPort},127.0.0.1:${serverPort}/${SCRATCH}`,
    );
    expect(r.code).toBe(2);
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-53 URL without a port + PGPORT=6543 on a `_test` DB -> judged on port 6543, exit 2, data untouched", async () => {
    await plantSentinel();
    const r = await reset(`postgres://${auth}@localhost/${SCRATCH}`, [], {
      PGPORT: "6543",
    });
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-53 PGPORT is only a fallback: a port in the URL wins over PGPORT -> guard passes on a usual port", async () => {
    // URL port 5432/5433 (usual, dead here) beats PGPORT=6543, so the `_test` shortcut applies.
    const usualDead = ["5432", "5433"].find((p) => p !== serverPort);
    if (!usualDead || !(await isDeadPort(Number(usualDead)))) return;
    const r = await reset(
      `postgres://u:p@localhost:${usualDead}/${NOWHERE}`,
      [],
      { PGPORT: "6543" },
    );
    expect(r.code).not.toBe(2);
    expect(r.code).not.toBe(0);
  }, 60_000);

  test("BR-KD-53 URL without a port, PGPORT set to a usual port -> the `_test` shortcut applies to that port (guard passes)", async () => {
    const usualDead = ["5432", "5433"].find((p) => p !== serverPort);
    if (!usualDead || !(await isDeadPort(Number(usualDead)))) return;
    const r = await reset(`postgres://u:p@localhost/${NOWHERE}`, [], {
      PGPORT: usualDead,
    });
    expect(r.code).not.toBe(2);
    expect(r.code).not.toBe(0);
  }, 60_000);

  test("BR-KD-53 URL without a host + PGHOST=remote on a `_test` DB -> judged non-local, exit 2 before connecting", async () => {
    const r = await reset(`postgres:///${NOWHERE}`, [], {
      PGHOST: "db.example.com",
    });
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  });

  test("BR-KD-53 URL host is local but PGHOST is remote -> the URL host wins (guard judges localhost)", async () => {
    // PGHOST must not turn a local URL into a remote one: a `_test` DB on a usual dead port still passes.
    const usualDead = ["5432", "5433"].find((p) => p !== serverPort);
    if (!usualDead || !(await isDeadPort(Number(usualDead)))) return;
    const r = await reset(
      `postgres://u:p@localhost:${usualDead}/${NOWHERE}`,
      [],
      { PGHOST: "db.example.com" },
    );
    expect(r.code).not.toBe(2);
    expect(r.code).not.toBe(0);
  }, 60_000);

  test("BR-KD-53 empty DB_RESET_CONFIRM on local `diecast` -> exit 2 (counts as no confirm)", async () => {
    const r = await reset(`postgres://u:p@localhost:${deadPort}/diecast`, [], {
      DB_RESET_CONFIRM: "",
    });
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  });

  test("BR-KD-53 empty DB_RESET_CONFIRM with --allow-remote on a remote host -> exit 2 before connecting", async () => {
    const r = await reset(
      "postgres://u:pw@db.example.com:5432/somedb",
      ["--allow-remote"],
      { DB_RESET_CONFIRM: "" },
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  });

  test("BR-KD-53 empty DB_RESET_CONFIRM is not 'a wrong confirm': local `_test` DB on a usual port still runs without a confirm", async () => {
    const usualDead = ["5432", "5433"].find((p) => p !== serverPort);
    if (!usualDead || !(await isDeadPort(Number(usualDead)))) return;
    const r = await reset(
      `postgres://u:p@localhost:${usualDead}/${NOWHERE}`,
      [],
      { DB_RESET_CONFIRM: "" },
    );
    expect(r.code).not.toBe(2);
    expect(r.code).not.toBe(0);
  }, 60_000);

  for (const value of ["Production", "PRODUCTION", "pRoDuCtIoN"]) {
    test(`BR-KD-53 NODE_ENV=${value} -> exit 2, data untouched`, async () => {
      await plantSentinel();
      const r = await reset(withDb(sharedUrl, SCRATCH), [], {
        NODE_ENV: value,
      });
      expect(r.code).toBe(2);
      expect(await sentinelIntact()).toBe(true);
    });
  }

  test("BR-KD-53 NODE_ENV=Production cannot be overridden by --allow-remote + matching confirm", async () => {
    await plantSentinel();
    const r = await reset(withDb(sharedUrl, SCRATCH), ["--allow-remote"], {
      NODE_ENV: "Production",
      DB_RESET_CONFIRM: SCRATCH,
    });
    expect(r.code).toBe(2);
    expect(await sentinelIntact()).toBe(true);
  });
});

describe("db:test:prepare reads the real target (BR-KD-53 via BR-KD-52)", () => {
  test("BR-KD-53 DATABASE_URL_TEST with no database name -> exit 2, nothing changed", async () => {
    const r = await prepare(`postgres://u:p@localhost:${deadPort}`);
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  });

  test("BR-KD-53 DATABASE_URL_TEST hiding a second host in the userinfo -> exit 2, data untouched", async () => {
    await plantSentinel();
    const r = await prepare(
      `postgres://a@b,prod.example.com:p@${serverHost}:${serverPort}/${SCRATCH}`,
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-53 DATABASE_URL_TEST with two hosts -> exit 2, data untouched", async () => {
    await plantSentinel();
    const r = await prepare(
      `postgres://${auth}@${serverHost}:${serverPort},prod.example.com:5432/${SCRATCH}`,
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
    expect(await sentinelIntact()).toBe(true);
  });
});

// Spec v5 changelog (SEC-7): BR-KD-53 also covers the URL query string. The driver applies ?database=, ?user=,
// ?host= and similar keys at connect time, so a URL with any query string is refused: exit 2 before connecting.
// Targets are built so a guard miss cannot reach a real DB: a `?database=diecast` URL only ever points at a usual
// port where nothing listens; everything on the live server port names the scratch DB.
describe("a URL with a query string is refused (BR-KD-53, SEC-7)", () => {
  async function usualDeadPort(): Promise<string | undefined> {
    for (const p of ["5432", "5433"])
      if (p !== serverPort && (await isDeadPort(Number(p)))) return p;
    return undefined;
  }

  test("BR-KD-53 db:reset: ?database=diecast on a `_test` URL -> exit 2 before connecting", async () => {
    const port = await usualDeadPort();
    if (!port) return;
    const r = await reset(
      `postgres://u:p@localhost:${port}/${NOWHERE}?database=diecast`,
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  }, 60_000);

  test("BR-KD-53 db:reset: ?user=other on a `_test` URL -> exit 2 before connecting", async () => {
    const port = await usualDeadPort();
    if (!port) return;
    const r = await reset(
      `postgres://u:p@localhost:${port}/${NOWHERE}?user=other`,
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  }, 60_000);

  test("BR-KD-53 db:reset: ?host=prod.example.com on a `_test` URL -> exit 2, data untouched", async () => {
    await plantSentinel();
    const r = await reset(
      `postgres://${auth}@${serverHost}:${serverPort}/${SCRATCH}?host=prod.example.com`,
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-53 db:reset: even a harmless-looking ?sslmode=disable is refused (any query string), data untouched", async () => {
    await plantSentinel();
    const r = await reset(`${withDb(sharedUrl, SCRATCH)}?sslmode=disable`);
    expect(r.code).toBe(2);
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-53 db:reset: query string cannot be overridden by --allow-remote + matching confirm", async () => {
    await plantSentinel();
    const r = await reset(
      `${withDb(sharedUrl, SCRATCH)}?sslmode=disable`,
      ["--allow-remote"],
      { DB_RESET_CONFIRM: SCRATCH },
    );
    expect(r.code).toBe(2);
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-53 db:reset: query string on a non-`_test` local DB with a matching confirm is still refused", async () => {
    const r = await reset(
      `postgres://u:p@localhost:${deadPort}/diecast?database=other`,
      [],
      { DB_RESET_CONFIRM: "diecast" },
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  });

  test("BR-KD-53 db:test:prepare: DATABASE_URL_TEST with ?database=diecast -> exit 2 before connecting", async () => {
    const port = await usualDeadPort();
    if (!port) return;
    const r = await prepare(
      `postgres://u:p@localhost:${port}/${NOWHERE}?database=diecast`,
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
  }, 60_000);

  test("BR-KD-53 db:test:prepare: DATABASE_URL_TEST with ?host=prod.example.com -> exit 2, data untouched", async () => {
    await plantSentinel();
    const r = await prepare(
      `postgres://${auth}@${serverHost}:${serverPort}/${SCRATCH}?host=prod.example.com`,
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(NO_CONN);
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-53 db:test:prepare: DATABASE_URL_TEST with ?sslmode=disable -> exit 2, data untouched", async () => {
    await plantSentinel();
    const r = await prepare(`${withDb(sharedUrl, SCRATCH)}?sslmode=disable`);
    expect(r.code).toBe(2);
    expect(await sentinelIntact()).toBe(true);
  });
});
