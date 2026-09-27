/**
 * Resolves the database URL that tests (and `db:test:prepare`) may use.
 * Tests insert and delete fixtures, so they must never touch the dev DB:
 * the URL comes only from `DATABASE_URL_TEST`, its database name must end in
 * `_test`, and it must differ from `DATABASE_URL`. Throws with an actionable
 * message otherwise.
 */
export function resolveTestDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
): string {
  const raw = source.DATABASE_URL_TEST;
  if (!raw) {
    throw new Error(
      "DATABASE_URL_TEST is not set. Add DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/diecast_test to backend/.env, run `docker compose up -d` and `bun run db:test:prepare`.",
    );
  }

  let dbName: string;
  try {
    dbName = decodeURIComponent(new URL(raw).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("DATABASE_URL_TEST is not a valid postgres URL.");
  }

  if (!dbName.endsWith("_test")) {
    throw new Error(
      `DATABASE_URL_TEST points at database '${dbName}'; the name must end in '_test' so tests can never run against a dev or real database.`,
    );
  }

  if (raw === source.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL_TEST must differ from DATABASE_URL — tests would write into the dev database.",
    );
  }

  return raw;
}
