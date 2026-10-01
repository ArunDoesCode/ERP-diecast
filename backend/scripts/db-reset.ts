/**
 * `bun run db:reset [--no-fixtures] [--allow-remote]` (known-defects BR-KD-30..46)
 *
 * Wipes the `public` (and `drizzle`) schema of the database in DATABASE_URL, pushes the schema,
 * seeds roles + permission catalog + grants, creates admin@diecast.local, seeds approval
 * policies, then (unless --no-fixtures) loads demo data through the real services.
 *
 * Exit codes: 0 done, 1 a step failed, 2 refused by the guard / bad DATABASE_URL, 4 bad input.
 * Never prints the DB password, SEED_USER_PASSWORD or any hash.
 */

const EXIT = { ok: 0, step: 1, guard: 2, input: 4 } as const;
const BACKEND_DIR = new URL("..", import.meta.url).pathname;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const args = process.argv.slice(2);
const noFixtures = args.includes("--no-fixtures");
const allowRemote = args.includes("--allow-remote");

function refuse(code: number, msg: string): never {
  console.error(msg);
  process.exit(code);
}

// The target comes ONLY from process.env.DATABASE_URL as handed to this process. Never
// DATABASE_URL_TEST, never a file lookup by this script. Every child (drizzle-kit, bootstrap,
// policies) inherits that same value, and the in-process db client reads it too.
// --- BR-KD-33: parse the target first so it can be printed on every refusal ---
// BR-KD-53: the guard judges what the postgres driver will really connect to, so host, port and
// user are read from the driver's own parsed options (PGHOST/PGPORT count when the URL omits them).
const rawUrl = process.env.DATABASE_URL ?? "";
let dbName: string;
let dbHost: string;
let dbPort: string;
let dbUser: string;
let dbPass: string;
let urlSearch: string;
try {
  const parsed = new URL(rawUrl);
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error("not a postgres url");
  }
  const { default: postgres } = await import("postgres");
  const o = postgres(rawUrl).options; // lazy: does not connect
  if (o.host.length !== 1) {
    refuse(
      EXIT.guard,
      "Refused: DATABASE_URL names more than one host. Nothing was changed.",
    );
  }
  // The driver falls back to PGDATABASE / the user name; a URL without a name is never judged.
  if (parsed.pathname.replace(/^\//, "") === "") {
    refuse(
      EXIT.guard,
      "Refused: DATABASE_URL has no database name. Nothing was changed.",
    );
  }
  dbName = o.database;
  // The driver reads a bracketed IPv6 host as "[" (it then fails to connect: fails closed).
  dbHost = o.host[0] === "[" ? parsed.hostname : String(o.host[0]);
  dbPort = String(o.port[0] ?? 5432);
  dbUser = o.user;
  dbPass = o.pass ?? "";
  urlSearch = parsed.search;
} catch {
  refuse(
    EXIT.guard,
    "Refused: DATABASE_URL is missing or not a valid postgres URL.",
  );
}
// A name that is not plain ASCII word characters cannot be read back exactly (percent-escapes).
if (!/^[A-Za-z0-9_.$-]+$/.test(dbName)) {
  refuse(
    EXIT.guard,
    "Refused: the database name in DATABASE_URL cannot be read exactly (use letters, digits, _ . $ -).",
  );
}
const secrets = [dbPass, encodeURIComponent(dbPass)].filter(
  (s) => s.length > 0,
);
const targetLabel = `${dbHost}:${dbPort}/${dbName}`;
// Hand the resolved target on explicitly and drop PG* env, so every child and the in-process
// client connect to exactly what was judged here.
process.env.DATABASE_URL = `postgres://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPass)}@${dbHost}:${dbPort}/${dbName}${urlSearch}`;
for (const k of ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"]) {
  delete process.env[k];
}

/** Remove the DB password (and the seed password) from any text before it is printed. */
function scrub(text: string): string {
  let out = text;
  const seed = process.env.SEED_USER_PASSWORD;
  for (const s of [...secrets, ...(seed ? [seed] : [])]) {
    if (s.length >= 4) out = out.split(s).join("***");
  }
  return out;
}

console.log(`db:reset target: ${targetLabel} (password ***)`);

// --- BR-KD-30: guard ---
if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
  refuse(
    EXIT.guard,
    "Refused: NODE_ENV=production. db:reset never runs there.",
  );
}
const isLocal = LOCAL_HOSTS.has(dbHost.toLowerCase());
// An empty DB_RESET_CONFIRM counts as no confirm (BR-KD-53).
const confirm = process.env.DB_RESET_CONFIRM ?? "";
// A confirm that is set but does not match the DB name is always refused.
if (confirm !== "" && confirm !== dbName) {
  refuse(
    EXIT.guard,
    `Refused: DB_RESET_CONFIRM does not match the database name '${dbName}'.`,
  );
}
if (!isLocal) {
  if (!allowRemote) {
    refuse(
      EXIT.guard,
      `Refused: ${dbHost} is not a local host. Pass --allow-remote and set DB_RESET_CONFIRM=${dbName} to override.`,
    );
  }
  if (confirm !== dbName) {
    refuse(
      EXIT.guard,
      "Refused: DB_RESET_CONFIRM must equal the database name when using --allow-remote.",
    );
  }
} else {
  // BR-KD-30 (v5): "localhost" can be an SSH tunnel to a real database, and `diecast` is the
  // dev DB. Only a local `*_test` DB on 5432/5433 resets without a confirm; every other local
  // target needs DB_RESET_CONFIRM=<db name> (the confirm alone is enough for a local target).
  const noConfirmNeeded =
    dbName.endsWith("_test") && (dbPort === "5432" || dbPort === "5433");
  if (!noConfirmNeeded && confirm !== dbName) {
    refuse(
      EXIT.guard,
      `Refused: ${targetLabel} is not a local *_test database on port 5432/5433. Set DB_RESET_CONFIRM=${dbName} to override.`,
    );
  }
}

// --- BR-KD-33: inputs checked before any write ---
const seedPassword = process.env.SEED_USER_PASSWORD ?? "";
if (seedPassword.length < 8) {
  refuse(
    EXIT.input,
    "Refused: SEED_USER_PASSWORD is missing or shorter than 8 characters. Nothing was changed.",
  );
}

const ADMIN_EMAIL = "admin@diecast.local";

type Step = { name: string; run: () => Promise<void> };

async function runChild(
  cmd: string[],
  env: Record<string, string> = {},
): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: BACKEND_DIR,
    env: { ...process.env, ...env } as Record<string, string>,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [o, e] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, out: scrub(`${o}\n${e}`) };
}

async function runChildOrThrow(
  label: string,
  cmd: string[],
  env: Record<string, string> = {},
) {
  const r = await runChild(cmd, env);
  if (r.code !== 0) {
    console.error(r.out.trim());
    throw new Error(`${label} exited with code ${r.code}`);
  }
}

let fixtureSummary: string[] = [];

const steps: Step[] = [
  {
    name: "drop schema",
    run: async () => {
      const postgres = (await import("postgres")).default;
      const sql = postgres(process.env.DATABASE_URL as string, {
        max: 1,
        onnotice: () => {},
        connect_timeout: 10,
      });
      try {
        // Schemas only, never the database (BR-KD-35).
        await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
        await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
        await sql.unsafe("CREATE SCHEMA public");
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
  },
  {
    name: "push schema",
    run: () =>
      runChildOrThrow("drizzle-kit push", [
        "bunx",
        "drizzle-kit",
        "push",
        "--force",
        "--config=scripts/drizzle-reset.config.ts",
      ]),
  },
  {
    name: "roles and permissions",
    run: async () => {
      const { db } = await import("../src/db/client");
      const { roles, permissions } = await import("../src/db/schemas/01_auth");
      const { PERMISSIONS, SEED_GRANTS } = await import(
        "../src/lib/permissions"
      );
      const { syncCatalog, seedGrants } = await import(
        "../src/lib/permissions-sync"
      );

      // BR-KD-40: fail loudly on an unknown key, naming it.
      for (const [role, keys] of Object.entries(SEED_GRANTS)) {
        for (const key of keys) {
          if (!(key in PERMISSIONS)) {
            throw new Error(
              `seed grant for role '${role}' names unknown permission key '${key}'`,
            );
          }
        }
      }
      const roleNames = Object.keys(SEED_GRANTS);
      await db
        .insert(roles)
        .values(roleNames.map((name) => ({ name })))
        .onConflictDoNothing();
      await syncCatalog();
      await seedGrants();

      const have = new Set(
        (await db.select({ n: roles.name }).from(roles)).map((r) => r.n),
      );
      const missing = roleNames.filter((n) => !have.has(n));
      if (missing.length > 0) {
        throw new Error(
          `seed role(s) missing after insert: ${missing.join(", ")}`,
        );
      }
      const catalog = await db.select({ k: permissions.key }).from(permissions);
      console.log(
        `  ${roleNames.length} roles, ${catalog.length} permission keys`,
      );
    },
  },
  {
    name: "admin",
    run: () =>
      runChildOrThrow(
        "bootstrap-admin",
        ["bun", "scripts/bootstrap-admin.ts"],
        {
          BOOTSTRAP_ADMIN_NAME: "Admin",
          BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL,
          BOOTSTRAP_ADMIN_PASSWORD: seedPassword,
        },
      ),
  },
  {
    name: "approval policies",
    run: () =>
      runChildOrThrow("seed-approval-policies", [
        "bun",
        "scripts/seed-approval-policies.ts",
      ]),
  },
];

if (!noFixtures) {
  steps.push({
    name: "fixtures",
    run: async () => {
      const { runFixtures } = await import("./db-reset-fixtures");
      fixtureSummary = await runFixtures({
        adminEmail: ADMIN_EMAIL,
        password: seedPassword,
      });
    },
  });
}

console.log(
  `Steps: ${steps.map((s) => s.name).join(" -> ")}${noFixtures ? " (fixtures skipped)" : ""}`,
);

async function main() {
  for (const step of steps) {
    console.log(`[${step.name}]`);
    try {
      await step.run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`db:reset failed at step '${step.name}': ${scrub(msg)}`);
      process.exit(EXIT.step);
    }
  }
  if (fixtureSummary.length > 0) {
    console.log("\nSummary");
    for (const line of fixtureSummary) console.log(line);
  }
  console.log(`\ndb:reset done: ${targetLabel}`);
  if (allowRemote) {
    // SEC-P2 (known-defects v3): the seed admin password is shared; change it at once.
    console.log(
      "Warning: rotate the seed admin password now (this run used the shared seed password).",
    );
  }
  try {
    const { disconnectDb } = await import("../src/db/client");
    await disconnectDb();
  } catch {
    // Nothing was connected in-process (e.g. failed early); exit anyway.
  }
  process.exit(EXIT.ok);
}

await main();
