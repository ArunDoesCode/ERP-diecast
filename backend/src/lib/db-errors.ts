// Drizzle wraps driver errors in a DrizzleQueryError whose `cause` is the
// Postgres error, so walk the cause chain to find the SQLSTATE code.
function findPgError(
  error: unknown,
  code: string,
): Record<string, unknown> | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      current.code === code
    ) {
      return current as Record<string, unknown>;
    }
    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined;
  }
  return undefined;
}

/** 23505: unique violation, anywhere in the cause chain. */
export function isUniqueViolation(error: unknown): boolean {
  return findPgError(error, "23505") !== undefined;
}

/** 55P03: lock_not_available, e.g. a `lock_timeout` that ran out. */
export function isLockTimeout(error: unknown): boolean {
  return findPgError(error, "55P03") !== undefined;
}

/** 23503: foreign-key violation, anywhere in the cause chain. */
export function isForeignKeyViolation(error: unknown): boolean {
  return findPgError(error, "23503") !== undefined;
}

/** The driver's constraint and table names of a 23505 / 23503 (for logs only). */
export function conflictLocation(error: unknown): {
  constraint: string;
  table: string;
} {
  const pg = findPgError(error, "23505") ?? findPgError(error, "23503");
  const text = (v: unknown) => (typeof v === "string" ? v : "unknown");
  return {
    constraint: text(pg?.constraint_name),
    table: text(pg?.table_name),
  };
}
