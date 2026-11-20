/**
 * `bun run db:test:rebuild [--fixtures] [--dry-run]` — rebuild the TEST database the way CI does
 * (.github/workflows/ci.yml, step "Test DB schema + seed"): `db:reset --no-fixtures`.
 *
 * The target comes ONLY from DATABASE_URL_TEST. DATABASE_URL (the dev DB) is never read as a
 * target and never connected to. The reset itself is the existing `scripts/db-reset.ts`, started
 * as a child with DATABASE_URL set to the test URL for that child only, so its own guard
 * (known-defects BR-KD-30, 53) judges the target a second time.
 *
 * Refused (exit 2, nothing changed) unless the database name ends in `_test` AND the host is this
 * machine. `DB_RESET_CONFIRM`, `--allow-remote` and PG* variables are never passed on.
 *
 * Exit codes: 0 done / dry run, 2 refused, otherwise the exit code of db:reset
 * (1 a step failed, 2 its guard refused, 4 SEED_USER_PASSWORD missing or shorter than 8).
 * Never prints a password.
 */
import postgres from "postgres";
import { resolveTestDatabaseUrl } from "../src/lib/test-db-url";
import { assertDriverMatches, parseTarget, type Target } from "./lib/migrate";

const BACKEND_DIR = new URL("..", import.meta.url).pathname;
const KNOWN_FLAGS = new Set(["--fixtures", "--dry-run"]);

const args = process.argv.slice(2);
const withFixtures = args.includes("--fixtures");
const dryRun = args.includes("--dry-run");

function refuse(msg: string): never {
  console.error(`Refused: ${msg} Nothing was changed.`);
  process.exit(2);
}

const unknown = args.filter((a) => !KNOWN_FLAGS.has(a));
if (unknown.length > 0) {
  refuse(
    `unknown argument ${unknown.join(" ")} (allowed: --fixtures, --dry-run).`,
  );
}

const raw = process.env.DATABASE_URL_TEST ?? "";
if (raw === "") refuse("DATABASE_URL_TEST is not set.");

// Parse first, so every later refusal can name the target (host:port/db, never the password).
let target: Target;
try {
  // PG* variables are not allowed to fill gaps in the URL: the URL alone names the target.
  target = parseTarget(raw, {});
} catch (err) {
  refuse(
    (err instanceof Error ? err.message : String(err))
      .replace(/DATABASE_URL\b/g, "DATABASE_URL_TEST")
      .replace(/; refused\.$/, "."),
  );
}
console.log(`db:test:rebuild target: ${target.label} (password ***)`);

if (!target.dbName.endsWith("_test")) {
  refuse(
    `${target.label}: the database name must end in '_test'. This command only rebuilds a test database.`,
  );
}
if (!target.local) {
  refuse(
    `${target.label}: the host is not this machine (localhost, 127.0.0.1, ::1).`,
  );
}
try {
  resolveTestDatabaseUrl(); // same rule `bun test` uses: `_test` name, differs from DATABASE_URL
  const probe = postgres(raw, { max: 1 }); // lazy: builds options, never connects
  assertDriverMatches(probe, target);
} catch (err) {
  refuse(
    `${target.label}: ${(err instanceof Error ? err.message : String(err))
      .replace(/^Refused: /, "")
      .replace(/ Nothing was changed\.$/, "")}`,
  );
}

const resetArgs = withFixtures ? [] : ["--no-fixtures"];
const cmd = [process.execPath, "scripts/db-reset.ts", ...resetArgs];
console.log(
  `Steps: db:reset ${resetArgs.join(" ")}`.trimEnd() +
    ` on ${target.label} = drop schema -> apply migrations -> roles and permissions -> admin -> approval policies${withFixtures ? " -> fixtures" : " (fixtures skipped, as in CI)"}`,
);
console.log(
  `SEED_USER_PASSWORD: ${(process.env.SEED_USER_PASSWORD ?? "").length >= 8 ? "set" : "missing or shorter than 8 characters (db:reset will exit 4)"}`,
);

if (dryRun) {
  console.log("Dry run: nothing was changed.");
  process.exit(0);
}

// The child gets the test URL as its DATABASE_URL. Nothing that could widen or move the target
// is handed on.
const childEnv: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) {
  if (v !== undefined) childEnv[k] = v;
}
for (const k of [
  "DB_RESET_CONFIRM",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
]) {
  delete childEnv[k];
}
childEnv.DATABASE_URL = raw;

const proc = Bun.spawn(cmd, {
  cwd: BACKEND_DIR,
  env: childEnv,
  stdin: "ignore",
  stdout: "inherit",
  stderr: "inherit",
});
const code = await proc.exited;
if (code === 0) {
  console.log(`db:test:rebuild done: ${target.label}`);
} else {
  console.error(`db:test:rebuild: db:reset exited with code ${code}.`);
}
process.exit(code);
