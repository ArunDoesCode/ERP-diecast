/**
 * docs/specs/known-defects.md (v1) — db:reset (BL-005)
 * BR-KD-30 host guard, --allow-remote + DB_RESET_CONFIRM, production always refused
 * BR-KD-33 target printed with masked password, inputs checked before any write
 * BR-KD-35 step order outcome: public schema dropped (never the DB), seed, admin, policies, fixtures,
 *          --no-fixtures, idempotent row counts + document numbers
 * BR-KD-40 role + permission-key seed: system roles, back_office holds pr.manage
 * BR-KD-44 fixture content
 * BR-KD-46 fixtures through real services: real trails, stock only via GRN, paise, summary content
 *
 * The script is a separate process, so it runs against a scratch database
 * (`diecast_kd_reset_test`, created on the same server as DATABASE_URL_TEST, dropped afterwards).
 * Nothing in the shared test DB is touched. Entry point: `bun run db:reset` (backend/).
 * Written by test-writer from the spec only.
 *
 * Not covered (needs a production failure hook, see report): "fixtures throw -> exit 1, `fixtures`
 * printed, no summary"; BR-KD-40 "unknown key in the seed table fails naming it".
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";

const SCRATCH = "diecast_kd_reset_test";
// A local DB whose name is not "diecast" and does not end in "_test": needs DB_RESET_CONFIRM (v3).
const GUARD = "diecast_kd_reset_guard";
const BACKEND = new URL("../..", import.meta.url).pathname;
const SEED_PASSWORD = "kd-Seed-Pass-4471";

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}
function withHost(url: string, host: string): string {
  const u = new URL(url);
  u.hostname = host;
  return u.toString();
}

const baseUrl = process.env.DATABASE_URL as string; // preload = DATABASE_URL_TEST
const scratchUrl = withDb(baseUrl, SCRATCH);
const guardUrl = withDb(baseUrl, GUARD);
const dbPassword = decodeURIComponent(new URL(baseUrl).password);
let sql: ReturnType<typeof postgres>;
let guardSql: ReturnType<typeof postgres>;

type Run = { code: number; out: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Isolation guard (F-TEST-10): the script under test wipes a schema. It must never be pointed at the
 * shared test DB (or any DB but the scratch one). Any local target other than SCRATCH throws before
 * a process is spawned; remote / unparsable URLs are only used by refusal-path tests.
 */
function assertScratchOnly(dbUrl: string) {
  let u: URL;
  try {
    u = new URL(dbUrl);
  } catch {
    return; // unparsable: the script must refuse it (BR-KD-33)
  }
  if (!LOCAL_HOSTS.has(u.hostname)) return; // remote: must be refused / cannot reach a local DB
  const db = u.pathname.replace(/^\//, "");
  if (db !== SCRATCH && db !== GUARD) {
    throw new Error(
      `db-reset.test: refusing to run db:reset against local database "${db}"; only "${SCRATCH}" and "${GUARD}" are allowed`,
    );
  }
}

async function run(
  args: string[] = [],
  env: Record<string, string | undefined> = {},
  dbUrl = scratchUrl,
): Promise<Run> {
  assertScratchOnly(dbUrl);
  const base: Record<string, string | undefined> = {
    ...process.env,
    DATABASE_URL: dbUrl,
    DATABASE_URL_TEST: undefined, // the script must not be able to fall back to the shared test DB
    SEED_USER_PASSWORD: SEED_PASSWORD,
    DB_RESET_CONFIRM: undefined,
    BOOTSTRAP_ADMIN_PASSWORD: undefined,
  };
  const merged = { ...base, ...env };
  for (const k of Object.keys(merged)) {
    if (merged[k] === undefined) delete merged[k];
  }
  const proc = Bun.spawn(["bun", "run", "db:reset", ...args], {
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

async function tableCounts(): Promise<Record<string, number>> {
  const tables = await sql`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
  const out: Record<string, number> = {};
  for (const t of tables) {
    const name = t.table_name as string;
    const [r] = await sql.unsafe(
      `SELECT count(*)::int AS n FROM public."${name}"`,
    );
    out[name] = r.n as number;
  }
  return out;
}
async function docNumbers() {
  const pr =
    await sql`SELECT pr_number FROM purchase_requests ORDER BY pr_number`;
  const po =
    await sql`SELECT po_number FROM purchase_orders ORDER BY po_number`;
  const grn = await sql`SELECT grn_number FROM grns ORDER BY grn_number`;
  return {
    pr: pr.map((r) => r.pr_number),
    po: po.map((r) => r.po_number),
    grn: grn.map((r) => r.grn_number),
  };
}

beforeAll(async () => {
  if (new URL(baseUrl).pathname.replace(/^\//, "") === SCRATCH) {
    throw new Error("scratch DB name must differ from the shared test DB");
  }
  const admin = postgres(withDb(baseUrl, "postgres"), { max: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${SCRATCH}`);
  await admin.unsafe(`DROP DATABASE IF EXISTS ${GUARD} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${GUARD}`);
  await admin.end({ timeout: 5 });
  sql = postgres(scratchUrl, { max: 2, onnotice: () => {} });
  guardSql = postgres(guardUrl, { max: 2, onnotice: () => {} });
}, 60_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await guardSql?.end({ timeout: 5 });
  const admin = postgres(withDb(baseUrl, "postgres"), { max: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
  await admin.unsafe(`DROP DATABASE IF EXISTS ${GUARD} WITH (FORCE)`);
  await admin.end({ timeout: 5 });
});

describe("db:reset guard (BR-KD-30)", () => {
  const remote = "postgres://u:pw-remote@db.example.com:5432/somedb";

  test("BR-KD-30 remote host -> exit 2 before connecting", async () => {
    const r = await run([], {}, remote);
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(/ENOTFOUND|getaddrinfo|ECONNREFUSED|ETIMEDOUT/);
  });

  test("BR-KD-30 --allow-remote without DB_RESET_CONFIRM -> exit 2", async () => {
    const r = await run(["--allow-remote"], {}, remote);
    expect(r.code).toBe(2);
  });

  test("BR-KD-30 --allow-remote with wrong DB_RESET_CONFIRM -> exit 2", async () => {
    const r = await run(
      ["--allow-remote"],
      { DB_RESET_CONFIRM: "otherdb" },
      remote,
    );
    expect(r.code).toBe(2);
  });

  test("BR-KD-30 DB_RESET_CONFIRM without --allow-remote -> exit 2", async () => {
    const r = await run([], { DB_RESET_CONFIRM: "somedb" }, remote);
    expect(r.code).toBe(2);
  });

  test("BR-KD-30 --allow-remote + matching DB_RESET_CONFIRM passes the guard (fails later on connect, not exit 2)", async () => {
    const r = await run(
      ["--allow-remote"],
      { DB_RESET_CONFIRM: "somedb" },
      remote,
    );
    expect(r.code).not.toBe(2);
    expect(r.code).not.toBe(0);
  }, 60_000);

  test("BR-KD-30 NODE_ENV=production on localhost -> exit 2, data untouched", async () => {
    await plantSentinel();
    const r = await run([], { NODE_ENV: "production" });
    expect(r.code).toBe(2);
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-30 NODE_ENV=production cannot be overridden by --allow-remote + confirm", async () => {
    await plantSentinel();
    const r = await run(["--allow-remote"], {
      NODE_ENV: "production",
      DB_RESET_CONFIRM: SCRATCH,
    });
    expect(r.code).toBe(2);
    expect(await sentinelIntact()).toBe(true);
  });
});

describe("db:reset local guard needs DB_RESET_CONFIRM for unusual targets (BR-KD-30, v3)", () => {
  async function plantGuardSentinel() {
    await guardSql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
    await guardSql.unsafe(`CREATE SCHEMA public`);
    await guardSql.unsafe(`CREATE TABLE public.kd_old_data (x int)`);
    await guardSql.unsafe(`INSERT INTO public.kd_old_data VALUES (42)`);
  }
  async function guardSentinelIntact() {
    try {
      const rows = await guardSql`SELECT x FROM public.kd_old_data`;
      return rows.length === 1 && rows[0].x === 42;
    } catch {
      return false;
    }
  }

  test("BR-KD-30 local DB not named diecast and not ending _test, no DB_RESET_CONFIRM -> exit 2, data untouched", async () => {
    await plantGuardSentinel();
    const r = await run([], {}, guardUrl);
    expect(r.code).toBe(2);
    expect(await guardSentinelIntact()).toBe(true);
  });

  test("BR-KD-30 same target with a wrong DB_RESET_CONFIRM -> exit 2, data untouched", async () => {
    await plantGuardSentinel();
    const r = await run(
      ["--allow-remote"],
      { DB_RESET_CONFIRM: "somethingelse" },
      guardUrl,
    );
    expect(r.code).toBe(2);
    expect(await guardSentinelIntact()).toBe(true);
  });

  test("BR-KD-30 local port other than 5432/5433 without DB_RESET_CONFIRM -> exit 2 before connecting (ssh tunnel case)", async () => {
    const tunnel = withHost(scratchUrl, "localhost").replace(
      /:\d+\//,
      ":15432/",
    );
    const r = await run([], {}, tunnel);
    expect(r.code).toBe(2);
    expect(r.out).not.toMatch(/ECONNREFUSED|ETIMEDOUT/);
  });

  test("BR-KD-30 local DB not named diecast/_test with matching DB_RESET_CONFIRM -> guard passes and the reset runs", async () => {
    await plantGuardSentinel();
    const r = await run(
      ["--no-fixtures", "--allow-remote"],
      { DB_RESET_CONFIRM: GUARD },
      guardUrl,
    );
    expect(r.code).toBe(0);
    const gone = await guardSql`SELECT to_regclass('public.kd_old_data') AS t`;
    expect(gone[0].t).toBeNull();
  }, 240_000);

  test("BR-KD-30 after a run with --allow-remote the summary says to rotate the seed admin password now", async () => {
    const r = await run(
      ["--no-fixtures", "--allow-remote"],
      { DB_RESET_CONFIRM: SCRATCH },
      scratchUrl,
    );
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/rotate the seed admin password now/i);
  }, 240_000);
});

describe("db:reset inputs and output before any write (BR-KD-33)", () => {
  test("BR-KD-33 missing SEED_USER_PASSWORD -> exit 4, old data still there", async () => {
    await plantSentinel();
    const r = await run([], { SEED_USER_PASSWORD: undefined });
    expect(r.code).toBe(4);
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-33 SEED_USER_PASSWORD shorter than 8 -> exit 4, old data still there, value not printed", async () => {
    await plantSentinel();
    const r = await run([], { SEED_USER_PASSWORD: "short7!" });
    expect(r.code).toBe(4);
    expect(r.out).not.toContain("short7!");
    expect(await sentinelIntact()).toBe(true);
  });

  test("BR-KD-33 unparsable DATABASE_URL -> exit 2", async () => {
    const r = await run([], {}, "this is not a url");
    expect(r.code).toBe(2);
  });

  test("BR-KD-33 target printed as host:port/db with the password masked (also on refusal)", async () => {
    await plantSentinel();
    const u = new URL(scratchUrl);
    const r = await run([], { SEED_USER_PASSWORD: undefined });
    expect(r.out).toContain(`${u.hostname}:${u.port}/${SCRATCH}`);
    expect(r.out).toContain("***");
    if (dbPassword.length >= 4) expect(r.out).not.toContain(dbPassword);
  });
});

describe("db:reset --no-fixtures (BR-KD-35, 40)", () => {
  let r: Run;
  let oidBefore: number;

  beforeAll(async () => {
    await plantSentinel();
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS kd_keep`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS kd_keep.t (x int)`);
    const [d] =
      await sql`SELECT oid::int AS oid FROM pg_database WHERE datname = ${SCRATCH}`;
    oidBefore = d.oid;
    // 127.0.0.1 must count as local (BR-KD-30)
    r = await run(["--no-fixtures"], {}, withHost(scratchUrl, "127.0.0.1"));
  }, 240_000);

  test("BR-KD-35 exit 0 on 127.0.0.1; target printed masked", () => {
    expect(r.code).toBe(0);
    expect(r.out).toContain("***");
    if (dbPassword.length >= 4) expect(r.out).not.toContain(dbPassword);
  });

  test("BR-KD-30 a run without --allow-remote does not print the rotate-password warning", () => {
    expect(r.out).not.toMatch(/rotate the seed admin password now/i);
  });

  test("BR-KD-35 drops the public schema only, never the database", async () => {
    const [d] =
      await sql`SELECT oid::int AS oid FROM pg_database WHERE datname = ${SCRATCH}`;
    expect(d.oid).toBe(oidBefore);
    const gone = await sql`SELECT to_regclass('public.kd_old_data') AS t`;
    expect(gone[0].t).toBeNull();
    const kept = await sql`SELECT to_regclass('kd_keep.t') AS t`;
    expect(kept[0].t).not.toBeNull();
  });

  test("BR-KD-35 --no-fixtures leaves 1 employee (admin@diecast.local, active super-admin) and 0 PRs", async () => {
    const emps = await sql`SELECT e.email, e.is_active, r.name AS role
      FROM employees e JOIN roles r ON r.id = e.role_id`;
    expect(emps.length).toBe(1);
    expect(emps[0].email).toBe("admin@diecast.local");
    expect(emps[0].role).toBe("super-admin");
    expect(emps[0].is_active).toBe(true);
    const [pr] = await sql`SELECT count(*)::int AS n FROM purchase_requests`;
    expect(pr.n).toBe(0);
    const [po] = await sql`SELECT count(*)::int AS n FROM purchase_orders`;
    expect(po.n).toBe(0);
  });

  test("BR-KD-35 approval policies are seeded", async () => {
    const [p] = await sql`SELECT count(*)::int AS n FROM approval_policies`;
    expect(p.n).toBeGreaterThan(0);
  });

  test("BR-KD-40 super-admin, owner and back_office exist and are system roles", async () => {
    const rows = await sql`SELECT name, is_system FROM roles
      WHERE name IN ('super-admin', 'owner', 'back_office')`;
    expect(rows.length).toBe(3);
    for (const row of rows) expect(row.is_system).toBe(true);
  });

  test("BR-KD-40 back_office holds pr.manage; permission catalog is synced", async () => {
    const rows = await sql`SELECT rp.permission_key FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      WHERE r.name = 'back_office' AND rp.permission_key = 'pr.manage'`;
    expect(rows.length).toBe(1);
    const [c] = await sql`SELECT count(*)::int AS n FROM permissions`;
    expect(c.n).toBeGreaterThan(0);
  });

  test("BR-KD-40 every granted key exists in the catalog (no dangling rows)", async () => {
    const rows = await sql`SELECT rp.permission_key FROM role_permissions rp
      LEFT JOIN permissions p ON p.key = rp.permission_key WHERE p.key IS NULL`;
    expect(rows.length).toBe(0);
  });

  test("BR-KD-35 a failing step exits 1 (unreachable DB on localhost)", async () => {
    const dead = withHost(scratchUrl, "localhost").replace(/:\d+\//, ":1/");
    // v3: a local port other than 5432/5433 needs DB_RESET_CONFIRM; with it the guard passes and connecting fails.
    const r2 = await run(
      ["--no-fixtures", "--allow-remote"],
      { DB_RESET_CONFIRM: SCRATCH },
      dead,
    );
    expect(r2.code).toBe(1);
  }, 60_000);
});

describe("db:reset with fixtures (BR-KD-35, 44, 46)", () => {
  let first: Run;
  let second: Run;
  let counts1: Record<string, number>;
  let counts2: Record<string, number>;
  let nums1: Awaited<ReturnType<typeof docNumbers>>;
  let nums2: Awaited<ReturnType<typeof docNumbers>>;

  beforeAll(async () => {
    first = await run();
    if (first.code === 0) {
      counts1 = await tableCounts();
      nums1 = await docNumbers();
      second = await run();
      counts2 = await tableCounts();
      nums2 = await docNumbers();
    }
  }, 600_000);

  test("BR-KD-35 full reset exits 0, twice in a row", () => {
    expect(first.code).toBe(0);
    expect(second?.code).toBe(0);
  });

  test("BR-KD-35 two runs give the same row counts", () => {
    expect(counts2).toEqual(counts1);
    expect(Object.keys(counts1).length).toBeGreaterThan(5);
  });

  test("BR-KD-35 two runs give the same document numbers", () => {
    expect(nums1.pr.length).toBeGreaterThan(0);
    expect(nums2).toEqual(nums1);
  });

  test("BR-KD-44 Main Store and Scrap Yard exist", async () => {
    const rows = await sql`SELECT name, type FROM locations`;
    expect(
      rows.some((x) => x.name === "Main Store" && x.type === "main_store"),
    ).toBe(true);
    expect(
      rows.some((x) => x.name === "Scrap Yard" && x.type === "scrap_yard"),
    ).toBe(true);
  });

  test("BR-KD-44 at least 2 HPDC machines", async () => {
    const [m] = await sql`SELECT count(*)::int AS n FROM machines
      WHERE type ILIKE '%hpdc%' OR name ILIKE '%hpdc%'`;
    expect(m.n).toBeGreaterThanOrEqual(2);
  });

  test("BR-KD-44 the 8 named items exist with the right units", async () => {
    const items = await sql`SELECT name, uom FROM item_master`;
    expect(items.length).toBeGreaterThanOrEqual(8);
    const find = (re: RegExp) => items.find((i) => re.test(i.name as string));
    expect(find(/adc\s*12/i)?.uom).toBe("kg");
    expect(find(/lm\s*24/i)?.uom).toBe("kg");
    expect(find(/release agent/i)?.uom).toBe("ltr");
    expect(find(/cover flux/i)?.uom).toBe("kg");
    expect(find(/h13/i)?.uom).toBe("kg");
    expect(find(/plunger tip/i)).toBeDefined();
    expect(find(/shot sleeve/i)).toBeDefined();
    expect(find(/gloves/i)).toBeDefined();
  });

  test("BR-KD-44 every item has a standard rate: whole paise > 0", async () => {
    const cols = await sql`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'item_master'
        AND column_name ~ 'standard.*(rate|price|cost)'`;
    expect(cols.length).toBe(1);
    const col = cols[0].column_name as string;
    const rows = await sql.unsafe(`SELECT "${col}" AS r FROM item_master`);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      expect(Number.isInteger(Number(row.r))).toBe(true);
      expect(Number(row.r)).toBeGreaterThan(0);
    }
  });

  test("BR-KD-44 4 suppliers with valid-format GSTIN and PAN, each with priced items", async () => {
    const sup =
      await sql`SELECT id, gst_number, pan_number FROM supplier_master`;
    expect(sup.length).toBeGreaterThanOrEqual(4);
    for (const s of sup) {
      expect(s.gst_number).toMatch(
        /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
      );
      expect(s.pan_number).toMatch(/^[A-Z]{5}\d{4}[A-Z]$/);
      const [c] = await sql`SELECT count(*)::int AS n FROM supplier_items
        WHERE supplier_id = ${s.id} AND supplier_unit_price_paise > 0`;
      expect(c.n).toBeGreaterThan(0);
    }
  });

  test("BR-KD-44 one login per desk role plus one QR-only operator", async () => {
    const roles = [
      "owner",
      "back_office",
      "floor_supervisor",
      "qa_inspector",
      "die_designer",
    ];
    for (const role of roles) {
      const rows = await sql`SELECT e.is_active, r.name AS role, e.password_hash
        FROM employees e JOIN roles r ON r.id = e.role_id
        WHERE e.email = ${`${role}@diecast.local`}`;
      expect(rows.length).toBe(1);
      expect(rows[0].role).toBe(role);
      expect(rows[0].is_active).toBe(true);
      expect(rows[0].password_hash).toBeTruthy();
    }
    const qr = await sql`SELECT id FROM employees
      WHERE email IS NULL AND qr_token IS NOT NULL AND password_hash IS NULL AND is_active`;
    expect(qr.length).toBeGreaterThanOrEqual(1);
  });

  test("BR-KD-44 each desk role can log in with SEED_USER_PASSWORD", async () => {
    const emails = [
      "owner",
      "back_office",
      "floor_supervisor",
      "qa_inspector",
      "die_designer",
    ].map((r) => `${r}@diecast.local`);
    const proc = Bun.spawn(
      [
        "bun",
        "-e",
        `const { authService } = await import("./src/service/authService");
         const { disconnectDb } = await import("./src/db/client");
         const res = {};
         for (const e of ${JSON.stringify(emails)}) {
           try { const r = await authService.login(e, ${JSON.stringify(SEED_PASSWORD)}); res[e] = !!r.accessToken; }
           catch (err) { res[e] = false; }
         }
         try { await authService.login(${JSON.stringify(emails[0])}, "wrong-password-1"); res.wrong = true; }
         catch { res.wrong = false; }
         console.log("RESULT " + JSON.stringify(res));
         await disconnectDb();`,
      ],
      {
        cwd: BACKEND,
        env: { ...process.env, DATABASE_URL: scratchUrl } as Record<
          string,
          string
        >,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const line = out.split("\n").find((l) => l.startsWith("RESULT "));
    expect(line).toBeDefined();
    const res = JSON.parse((line as string).slice(7));
    for (const e of emails) expect(res[e]).toBe(true);
    expect(res.wrong).toBe(false);
  }, 60_000);

  test("BR-KD-44 at least one PR in each of the 7 PR statuses", async () => {
    const rows =
      await sql`SELECT DISTINCT status::text AS s FROM purchase_requests`;
    const have = new Set(rows.map((x) => x.s));
    for (const s of [
      "draft",
      "pending_approval",
      "approved",
      "rejected",
      "partial_ordered",
      "fully_ordered",
      "cancelled",
    ])
      expect(have.has(s)).toBe(true);
  });

  test("BR-KD-44 at least one PO in each PO status", async () => {
    const rows =
      await sql`SELECT DISTINCT status::text AS s FROM purchase_orders`;
    const have = new Set(rows.map((x) => x.s));
    for (const s of [
      "draft",
      "pending_approval",
      "approved",
      "dispatched",
      "partial_received",
      "fully_received",
      "invoiced",
      "closed",
      "cancelled",
    ])
      expect(have.has(s)).toBe(true);
  });

  test("BR-KD-44 at least one GRN in each GRN status", async () => {
    const rows = await sql`SELECT DISTINCT status::text AS s FROM grns`;
    const have = new Set(rows.map((x) => x.s));
    for (const s of [
      "draft",
      "pending_qa",
      "accepted",
      "rejected",
      "partial_accepted",
    ])
      expect(have.has(s)).toBe(true);
  });

  test("BR-KD-44 one QA-bypassed GRN line with a reason and a person", async () => {
    const rows =
      await sql`SELECT qa_bypass_reason, qa_bypassed_by FROM grn_items
      WHERE is_qa_bypassed = true`;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(
      String(rows[0].qa_bypass_reason ?? "").trim().length,
    ).toBeGreaterThan(0);
    expect(rows[0].qa_bypassed_by).not.toBeNull();
  });

  test("BR-KD-44 at least one overdue open PO; dates relative to the run date", async () => {
    const overdue = await sql`SELECT id FROM purchase_orders
      WHERE status IN ('approved', 'dispatched', 'partial_received')
        AND COALESCE(revised_delivery_date, expected_delivery_date) < now()`;
    expect(overdue.length).toBeGreaterThanOrEqual(1);
    const far = await sql`SELECT id FROM purchase_orders
      WHERE expected_delivery_date IS NOT NULL
        AND (expected_delivery_date < now() - interval '400 days'
          OR expected_delivery_date > now() + interval '400 days')`;
    expect(far.length).toBe(0);
  });

  test("BR-KD-46 every approve/reject was done by a non-requester holding the step's role, with a comment", async () => {
    const trails =
      await sql`SELECT t.action::text AS action, t.level, t.action_by, t.notes,
        r.requested_by, r.chain_snapshot, er.name AS actor_role
      FROM approval_trails t
      JOIN approval_requests r ON r.id = t.request_id
      JOIN employees e ON e.id = t.action_by
      JOIN roles er ON er.id = e.role_id
      WHERE t.action IN ('approved', 'rejected')`;
    expect(trails.length).toBeGreaterThan(0);
    for (const t of trails) {
      expect(t.action_by).not.toBe(t.requested_by);
      expect(String(t.notes ?? "").trim().length).toBeGreaterThan(0);
      const chain = t.chain_snapshot as Array<{
        level: number;
        approverType: string;
        role?: string;
        employeeId?: number;
      }>;
      const step = chain.find((s) => s.level === t.level);
      expect(step).toBeDefined();
      if (step?.approverType === "role") {
        expect(
          t.actor_role === step.role || t.actor_role === "super-admin",
        ).toBe(true);
      } else if (step?.employeeId !== undefined) {
        expect(t.action_by).toBe(step.employeeId);
      }
    }
  });

  test("BR-KD-46 every submitted (non-draft) PR has an approval request", async () => {
    const rows = await sql`SELECT p.id FROM purchase_requests p
      WHERE p.status <> 'draft' AND NOT EXISTS (
        SELECT 1 FROM approval_requests a WHERE a.doc_type = 'pr' AND a.doc_id = p.id)`;
    expect(rows.length).toBe(0);
  });

  test("BR-KD-46 every ledger row points to an existing GRN", async () => {
    const ledger = await sql`SELECT reference_type::text AS rt, reference_id
      FROM inventory_ledger`;
    expect(ledger.length).toBeGreaterThan(0);
    const grnIds = new Set(
      (await sql`SELECT id FROM grns`).map((g) => g.id as number),
    );
    for (const l of ledger) {
      expect(["grn", "grn_bypass"]).toContain(l.rt);
      expect(grnIds.has(l.reference_id as number)).toBe(true);
    }
  });

  test("BR-KD-46 after reset each item's currentStock equals its ledger balance (no direct writes)", async () => {
    const rows = await sql`SELECT i.id, i.current_stock,
        COALESCE((SELECT sum(l.quantity_change) FROM inventory_ledger l
                  WHERE l.item_id = i.id), 0) AS ledger
      FROM item_master i`;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Number(r.current_stock)).toBeCloseTo(Number(r.ledger), 6);
    }
    // stock exists only where the ledger has rows
    const stocked = rows.filter((r) => Number(r.current_stock) !== 0);
    expect(stocked.length).toBeGreaterThan(0);
  });

  test("BR-KD-46 money is integer paise: PO subtotal equals sum of qty x rate (24_500 not 245.00)", async () => {
    const pos = await sql`SELECT po.id, po.subtotal_paise,
        COALESCE(sum(i.qty * i.unit_price_paise), 0) AS calc
      FROM purchase_orders po LEFT JOIN purchase_order_items i ON i.po_id = po.id
      GROUP BY po.id, po.subtotal_paise`;
    expect(pos.length).toBeGreaterThan(0);
    for (const p of pos) {
      expect(
        Math.abs(Number(p.subtotal_paise) - Number(p.calc)),
      ).toBeLessThanOrEqual(1);
    }
    const tiny =
      await sql`SELECT id FROM purchase_order_items WHERE unit_price_paise < 500`;
    expect(tiny.length).toBe(0);
  });

  test("BR-KD-46 summary prints login emails and per-item ledger balance, no passwords or hashes", async () => {
    const out = second.out;
    expect(out).toContain("admin@diecast.local");
    for (const r of [
      "owner",
      "back_office",
      "floor_supervisor",
      "qa_inspector",
      "die_designer",
    ])
      expect(out).toContain(`${r}@diecast.local`);
    expect(out).not.toContain(SEED_PASSWORD);
    const hashes =
      await sql`SELECT password_hash FROM employees WHERE password_hash IS NOT NULL`;
    for (const h of hashes)
      expect(out).not.toContain(h.password_hash as string);
    const withLedger = await sql`SELECT DISTINCT i.name FROM inventory_ledger l
      JOIN item_master i ON i.id = l.item_id`;
    expect(withLedger.length).toBeGreaterThan(0);
    for (const i of withLedger) expect(out).toContain(i.name as string);
  });
});
