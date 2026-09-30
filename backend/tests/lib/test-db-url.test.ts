import { describe, expect, test } from "bun:test";
import { resolveTestDatabaseUrl } from "../../src/lib/test-db-url";

const DEV = "postgres://postgres:postgres@localhost:5432/diecast";
const TEST = "postgres://postgres:postgres@localhost:5433/diecast_test";

describe("resolveTestDatabaseUrl (BL-006)", () => {
  test("returns DATABASE_URL_TEST when it names a *_test database", () => {
    expect(
      resolveTestDatabaseUrl({ DATABASE_URL: DEV, DATABASE_URL_TEST: TEST }),
    ).toBe(TEST);
  });

  test("refuses when DATABASE_URL_TEST is missing", () => {
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL: DEV })).toThrow(
      /DATABASE_URL_TEST is not set/,
    );
  });

  test("refuses a database name without the _test suffix", () => {
    expect(() =>
      resolveTestDatabaseUrl({
        DATABASE_URL_TEST: DEV.replace("5432", "5433"),
      }),
    ).toThrow(/must end in '_test'/);
  });

  test("refuses when it equals DATABASE_URL", () => {
    expect(() =>
      resolveTestDatabaseUrl({ DATABASE_URL: TEST, DATABASE_URL_TEST: TEST }),
    ).toThrow(/must differ from DATABASE_URL/);
  });

  test("refuses an unparseable URL", () => {
    expect(() =>
      resolveTestDatabaseUrl({ DATABASE_URL_TEST: "not a url" }),
    ).toThrow(/not a valid postgres URL/);
  });

  test("the bun test preload has already swapped DATABASE_URL to the test DB", () => {
    expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_URL_TEST);
  });
});
