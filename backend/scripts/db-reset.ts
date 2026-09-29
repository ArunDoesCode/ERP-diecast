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
const rawUrl = process.env.DATABASE_URL ?? "";
let target: URL;
try {
  target = new URL(rawUrl);
  if (!/^postgres(ql)?:$/.test(target.protocol) || !target.hostname) {
    throw new Error("not a postgres url");
  }
} catch {
  refuse(
    EXIT.guard,
    "Refused: DATABASE_URL is missing or not a valid postgres URL.",
  );
}
const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));
const secrets = [decodeURIComponent(target.password), target.password].filter(
  (s) => s.length > 0,
);
const targetLabel = `${target.hostname}:${target.port || "5432"}/${dbName}`;

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
if (process.env.NODE_ENV === "production") {
  refuse(
    EXIT.guard,
    "Refused: NODE_ENV=production. db:reset never runs there.",
  );
}
const isLocal = LOCAL_HOSTS.has(target.hostname.toLowerCase());
if (!isLocal) {
  if (!allowRemote) {
    refuse(
      EXIT.guard,
      `Refused: ${target.hostname} is not a local host. Pass --allow-remote and set DB_RESET_CONFIRM=${dbName} to override.`,
    );
  }
  if (process.env.DB_RESET_CONFIRM !== dbName) {
    refuse(
      EXIT.guard,
      "Refused: DB_RESET_CONFIRM must equal the database name when using --allow-remote.",
    );
  }
} else {
  // SEC-P1 (known-defects v3): "localhost" can be an SSH tunnel to a real database. A local
  // target that is not the usual dev/test one needs DB_RESET_CONFIRM=<db name>; for such a
  // target the confirm alone is enough (--allow-remote stays for non-local hosts).
  const port = target.port || "5432";
  const usualTarget =
    (dbName === "diecast" || dbName.endsWith("_test")) &&
    (port === "5432" || port === "5433");
  if (!usualTarget) {
    if (process.env.DB_RESET_CONFIRM !== dbName) {
      refuse(
        EXIT.guard,
        `Refused: ${targetLabel} is not the usual local dev/test database (name diecast or *_test, port 5432/5433). Set DB_RESET_CONFIRM=${dbName} to override.`,
      );
    }
  } else if (process.env.DB_RESET_CONFIRM && !allowRemote) {
    // A confirmation with no override flag is a sign of a wrong command line; do nothing.
    refuse(
      EXIT.guard,
      "Refused: DB_RESET_CONFIRM is set without --allow-remote.",
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
      const sql = postgres(rawUrl, {
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
