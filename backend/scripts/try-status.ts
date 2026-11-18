/**
 * Read-only helper for `bun run try` (scripts/try.sh at the repo root). Looks at the database in
 * DATABASE_URL inside one READ ONLY transaction and prints `key=value` lines:
 *
 *   target=host:port/db          never the password
 *   state=ok|empty|push|mismatch|unreachable
 *   pending=<n>                  migrations the repo has and the DB lacks (state ok / empty)
 *   users=<n>                    rows in employees (0 when the table is not there)
 *   logins=a@x,b@y               active `@diecast.local` desk logins, names only
 *   detail=<one line>            why, for mismatch / unreachable
 *
 * It writes nothing and always exits 0, except 2 for a DATABASE_URL it cannot read.
 */
import postgres from "postgres";
import {
  assertDriverMatches,
  JournalMismatchError,
  localMigrations,
  parseTarget,
  planFrom,
  readJournal,
  type Target,
} from "./lib/migrate";

const out = (k: string, v: string | number) => console.log(`${k}=${v}`);

let target: Target;
try {
  target = parseTarget(process.env.DATABASE_URL ?? "");
} catch (err) {
  console.error(`Refused: ${(err as Error).message}`);
  process.exit(2);
}
out("target", target.label);

const sql = postgres(process.env.DATABASE_URL as string, {
  max: 1,
  onnotice: () => {},
  connect_timeout: 5,
});
const scrub = (t: string) =>
  target.password.length >= 4 ? t.split(target.password).join("***") : t;

try {
  assertDriverMatches(sql, target);
  await sql.begin("read only", async (tx) => {
    const journal = await readJournal(tx);
    const [tables] = await tx.unsafe(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    const [emp] = await tx.unsafe(
      "SELECT to_regclass('public.employees') AS t",
    );
    let users = 0;
    let logins: string[] = [];
    if (emp?.t) {
      const [c] = await tx.unsafe("SELECT count(*)::int AS n FROM employees");
      users = Number(c?.n ?? 0);
      const rows = await tx.unsafe(
        "SELECT email FROM employees WHERE is_active AND email LIKE '%@diecast.local' ORDER BY email LIMIT 12",
      );
      logins = rows.map((r) => String(r.email));
    }
    if (journal.length === 0 && Number(tables?.n ?? 0) > 0) {
      out("state", "push");
      out("detail", "tables but no migration journal (built by push)");
    } else {
      try {
        const pending = planFrom(localMigrations(), journal);
        out("state", journal.length === 0 ? "empty" : "ok");
        out("pending", pending.length);
      } catch (err) {
        if (!(err instanceof JournalMismatchError)) throw err;
        out("state", "mismatch");
        out("detail", err.message.replace(/\s+/g, " "));
      }
    }
    out("users", users);
    out("logins", logins.join(","));
  });
} catch (err) {
  out("state", "unreachable");
  out(
    "detail",
    scrub(err instanceof Error ? err.message : String(err)).replace(
      /\s+/g,
      " ",
    ),
  );
}
await sql.end({ timeout: 2 });
process.exit(0);
