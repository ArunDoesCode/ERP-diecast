/**
 * docs/specs/known-defects.md (v1) — bootstrap-admin (BL-004)
 * BR-KD-17 input from env, hidden prompt / exit 4, field named, value never printed
 * BR-KD-20 writes nothing on: roles missing (3), active super-admin (2), email taken (5);
 *          inactive-only super-admins -> proceeds
 * BR-KD-23 one active super-admin, same hash as normal creation, can log in, created/updated-by = self
 * BR-KD-25 no password / hash in any output; success prints id, name, email, role
 * BR-KD-27 parallel runs -> one exit 0, one exit 2
 * BR-KD-28 exit codes
 * BR-KD-29 no localhost guard
 *
 * The script is a separate process, so each test runs it against a scratch database
 * (`diecast_kd_bootstrap_test`, created on the same server as DATABASE_URL_TEST, dropped
 * afterwards). Nothing in the shared test DB is touched. Expected entry point:
 * `bun scripts/bootstrap-admin.ts` (= `bun run bootstrap-admin`).
 * Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";

const SCRATCH = "diecast_kd_bootstrap_test";
const BACKEND = new URL("../..", import.meta.url).pathname;
const SCRIPT = "scripts/bootstrap-admin.ts";
const ADMIN_NAME = "TEST KD Admin";
const ADMIN_EMAIL = "kd-admin@diecast.test";
const ADMIN_PASSWORD = "kd-Secret-Pass-9137";

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

const baseUrl = process.env.DATABASE_URL as string; // preload = DATABASE_URL_TEST
const scratchUrl = withDb(baseUrl, SCRATCH);
let sql: ReturnType<typeof postgres>;

type Run = { code: number; out: string };

async function run(
  env: Record<string, string | undefined> = {},
  dbUrl = scratchUrl,
): Promise<Run> {
  const proc = Bun.spawn(["bun", SCRIPT], {
    cwd: BACKEND,
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      BOOTSTRAP_ADMIN_NAME: ADMIN_NAME,
      BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL,
      BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD,
      ...env,
    } as Record<string, string>,
    stdin: "ignore", // no terminal
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

async function reset(opts: { roles: boolean } = { roles: true }) {
  await sql.unsafe(
    "TRUNCATE employees, roles, refresh_tokens RESTART IDENTITY CASCADE",
  );
  if (opts.roles) {
    await sql`INSERT INTO roles (name, is_system) VALUES ('super-admin', true), ('owner', true), ('back_office', true)`;
  }
}

async function countEmployees(): Promise<number> {
  const [r] = await sql`SELECT count(*)::int AS n FROM employees`;
  return r.n as number;
}

async function superAdmins(active?: boolean) {
  return sql`SELECT e.* FROM employees e JOIN roles r ON r.id = e.role_id
    WHERE r.name = 'super-admin' ${active === undefined ? sql`` : sql`AND e.is_active = ${active}`}`;
}

beforeAll(async () => {
  const admin = postgres(withDb(baseUrl, "postgres"), { max: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${SCRATCH}`);
  await admin.end({ timeout: 5 });

  const push = Bun.spawnSync(["bunx", "drizzle-kit", "push", "--force"], {
    cwd: BACKEND,
    env: { ...process.env, DATABASE_URL: scratchUrl },
    stdout: "ignore",
    stderr: "pipe",
  });
  if (push.exitCode !== 0) {
    throw new Error(`scratch schema push failed: ${push.stderr.toString()}`);
  }
  sql = postgres(scratchUrl, { max: 2, onnotice: () => {} });
}, 120_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  const admin = postgres(withDb(baseUrl, "postgres"), { max: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
  await admin.end({ timeout: 5 });
});

describe("bootstrap-admin: success (BR-KD-23, 25, 28)", () => {
  test("BR-KD-23 creates exactly one active super-admin, exit 0", async () => {
    await reset();
    const r = await run();
    expect(r.code).toBe(0);
    const rows =
      await sql`SELECT e.*, r.name AS role_name FROM employees e JOIN roles r ON r.id = e.role_id`;
    expect(rows.length).toBe(1);
    expect(rows[0].role_name).toBe("super-admin");
    expect(rows[0].role_name).not.toBe("owner");
    expect(rows[0].is_active).toBe(true);
    expect(rows[0].name).toBe(ADMIN_NAME);
    expect(rows[0].email).toBe(ADMIN_EMAIL);
  });

  test("BR-KD-23 created-by and updated-by are the admin's own id", async () => {
    await reset();
    expect((await run()).code).toBe(0);
    const [row] = await sql`SELECT * FROM employees`;
    expect(row.created_by).toBe(row.id);
    expect(row.last_updated_by).toBe(row.id);
  });

  test("BR-KD-23 password is hashed (verifies, is not plain) in the normal employee format", async () => {
    await reset();
    expect((await run()).code).toBe(0);
    const [row] = await sql`SELECT password_hash FROM employees`;
    expect(row.password_hash).not.toBe(ADMIN_PASSWORD);
    expect(await Bun.password.verify(ADMIN_PASSWORD, row.password_hash)).toBe(
      true,
    );
    const reference = await Bun.password.hash("some-other-pass-1");
    expect(row.password_hash.split("$")[1]).toBe(reference.split("$")[1]);
  });

  test("BR-KD-23 the new admin can log in right away", async () => {
    await reset();
    expect((await run()).code).toBe(0);
    const proc = Bun.spawn(
      [
        "bun",
        "-e",
        `const { authService } = await import("./src/service/authService");
         const { disconnectDb } = await import("./src/db/client");
         try {
           const r = await authService.login(${JSON.stringify(ADMIN_EMAIL)}, ${JSON.stringify(ADMIN_PASSWORD)});
           console.log(r.accessToken ? "LOGIN_OK" : "LOGIN_NO_TOKEN");
         } catch (e) { console.log("LOGIN_FAIL " + e); }
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
    expect(out).toContain("LOGIN_OK");
  }, 30_000);

  test("BR-KD-25 output has no password and no hash; prints id, name, email, role", async () => {
    await reset();
    const r = await run();
    expect(r.code).toBe(0);
    const [row] = await sql`SELECT id, password_hash FROM employees`;
    expect(r.out).not.toContain(ADMIN_PASSWORD);
    expect(r.out).not.toContain(row.password_hash);
    expect(r.out).toContain(String(row.id));
    expect(r.out).toContain(ADMIN_NAME);
    expect(r.out).toContain(ADMIN_EMAIL);
    expect(r.out).toContain("super-admin");
  });

  test("BR-KD-17 optional phone comes from BOOTSTRAP_ADMIN_PHONE", async () => {
    await reset();
    expect((await run({ BOOTSTRAP_ADMIN_PHONE: "9876543210" })).code).toBe(0);
    const [row] = await sql`SELECT phone FROM employees`;
    expect(row.phone).toBe("9876543210");
  });
});

describe("bootstrap-admin: input (BR-KD-17, 28)", () => {
  test("BR-KD-17 short password -> exit 4, names `password`, value not printed, nothing written", async () => {
    await reset();
    const r = await run({ BOOTSTRAP_ADMIN_PASSWORD: "short" });
    expect(r.code).toBe(4);
    expect(r.out.toLowerCase()).toContain("password");
    expect(r.out).not.toContain("short");
    expect(await countEmployees()).toBe(0);
  });

  test("BR-KD-17 invalid email -> exit 4, names `email`", async () => {
    await reset();
    const r = await run({ BOOTSTRAP_ADMIN_EMAIL: "not-an-email" });
    expect(r.code).toBe(4);
    expect(r.out.toLowerCase()).toContain("email");
    expect(r.out).not.toContain("not-an-email");
    expect(await countEmployees()).toBe(0);
  });

  test("BR-KD-17 no password env and no terminal -> exit 4, nothing written", async () => {
    await reset();
    const r = await run({ BOOTSTRAP_ADMIN_PASSWORD: undefined });
    expect(r.code).toBe(4);
    expect(await countEmployees()).toBe(0);
  });
});

describe("bootstrap-admin: refusals write nothing (BR-KD-20, 28)", () => {
  test("BR-KD-20 roles not seeded -> exit 3, mentions db:reset, nothing written", async () => {
    await reset({ roles: false });
    const r = await run();
    expect(r.code).toBe(3);
    expect(r.out).toContain("db:reset");
    expect(await countEmployees()).toBe(0);
  });

  test("BR-KD-20 active super-admin exists -> exit 2, 'already bootstrapped', count unchanged", async () => {
    await reset();
    expect((await run()).code).toBe(0);
    const before = await countEmployees();
    const r = await run({ BOOTSTRAP_ADMIN_EMAIL: "second@diecast.test" });
    expect(r.code).toBe(2);
    expect(r.out.toLowerCase()).toContain("already bootstrapped");
    expect(await countEmployees()).toBe(before);
  });

  test("BR-KD-20 email already belongs to someone -> exit 5, existing user not upgraded", async () => {
    await reset();
    const [owner] = await sql`SELECT id FROM roles WHERE name = 'owner'`;
    await sql`INSERT INTO employees (name, email, role_id) VALUES ('Existing', ${ADMIN_EMAIL}, ${owner.id})`;
    const r = await run();
    expect(r.code).toBe(5);
    expect(await countEmployees()).toBe(1);
    const [row] = await sql`SELECT role_id, password_hash FROM employees`;
    expect(row.role_id).toBe(owner.id);
    expect(row.password_hash).toBeNull();
  });

  test("BR-KD-20 only inactive super-admins -> proceeds (lock-out recovery)", async () => {
    await reset();
    const [sa] = await sql`SELECT id FROM roles WHERE name = 'super-admin'`;
    await sql`INSERT INTO employees (name, email, role_id, is_active) VALUES ('Old Admin', 'old@diecast.test', ${sa.id}, false)`;
    const r = await run();
    expect(r.code).toBe(0);
    expect((await superAdmins(true)).length).toBe(1);
    expect((await superAdmins(false)).length).toBe(1);
  });
});

describe("bootstrap-admin: concurrency and exit 1 (BR-KD-27, 28)", () => {
  test("BR-KD-27 two parallel runs -> one exit 0, one exit 2, one super-admin", async () => {
    await reset();
    const [a, b] = await Promise.all([run(), run()]);
    expect([a.code, b.code].sort()).toEqual([0, 2]);
    expect((await superAdmins()).length).toBe(1);
    expect(await countEmployees()).toBe(1);
  });

  test("BR-KD-28 unreachable DB -> exit 1", async () => {
    const r = await run({}, withDb(baseUrl, SCRATCH).replace(/:\d+\//, ":1/"));
    expect(r.code).toBe(1);
    expect(r.out).not.toContain(ADMIN_PASSWORD);
  });
});

describe("bootstrap-admin: no host guard (BR-KD-29)", () => {
  test("BR-KD-29 a non-localhost host name is not refused", async () => {
    await reset();
    // 0.0.0.0 reaches the same local server but is not in the localhost/127.0.0.1/::1 list.
    const u = new URL(scratchUrl);
    u.hostname = "0.0.0.0";
    const r = await run({}, u.toString());
    expect(r.code).toBe(0);
    expect((await superAdmins(true)).length).toBe(1);
  });
});
