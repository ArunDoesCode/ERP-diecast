// Drizzle wraps driver errors in a DrizzleQueryError whose `cause` is the
// Postgres error, so walk the cause chain to find the 23505 code.
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      current.code === "23505"
    ) {
      return true;
    }
    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined;
  }
  return false;
}
