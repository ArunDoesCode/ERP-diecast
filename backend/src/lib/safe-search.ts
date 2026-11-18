import { type Column, ilike, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";

/** Shortest search term that filters anything (BR-STD-38). */
export const MIN_SEARCH_LENGTH = 2;

/**
 * The one `q` field of every list query (BR-STD-10, 11): trimmed, at most 100
 * characters, optional. No transform, so the contract manifest keeps it as an
 * optional string. A term shorter than 2 characters (empty included) is "no
 * search" (BR-STD-38): `safeSearch` / `safeSearchSql` drop it.
 */
export const searchTermSchema = z.string().trim().max(100).optional();

/** The term to search for, or undefined when it is too short to filter anything. */
function usableTerm(term: string | undefined, minLength: number) {
  const trimmed = term?.trim();
  return trimmed && trimmed.length >= minLength ? trimmed : undefined;
}

/** The LIKE pattern for `term`: `\`, `%` and `_` are escaped (Postgres default escape). */
function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * `column ilike %term%` for each column, OR-ed. No usable term -> undefined
 * (no filter). The pattern is always a bound parameter (BR-STD-07, 08).
 * `minLength` is 2 for list searches; a picker with a required term passes 1.
 */
export function safeSearch(
  term: string | undefined,
  ...columns: Column[]
): SQL | undefined {
  return safeSearchMin(MIN_SEARCH_LENGTH, term, ...columns);
}

export function safeSearchMin(
  minLength: number,
  term: string | undefined,
  ...columns: Column[]
): SQL | undefined {
  const usable = usableTerm(term, minLength);
  if (!usable) return undefined;
  const pattern = containsPattern(usable);
  return or(...columns.map((column) => ilike(column, pattern)));
}

/** Same as `safeSearch`, for a SQL expression such as an enum cast to text. */
export function safeSearchSql(
  term: string | undefined,
  expression: SQL,
): SQL | undefined {
  const usable = usableTerm(term, MIN_SEARCH_LENGTH);
  if (!usable) return undefined;
  return sql`${expression} ilike ${containsPattern(usable)}`;
}
