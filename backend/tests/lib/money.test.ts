/**
 * docs/specs/api-standards/spec.md (v1) "Money limit"
 * BR-STD-39 amounts above the money limit -> AMOUNT_TOO_LARGE (helper level)
 * BR-STD-43 JS-safe money: assertStockValueInRange, toSafePaise, the two limit constants
 *
 * `src/lib/money.ts` does not exist yet (design/api.md -> Money), so it is loaded dynamically: red until built.
 * Written by test-writer from the spec only.
 */
import { describe, expect, test } from "bun:test";
import { AppError } from "../../src/lib/errors";

type Money = {
  MAX_MONEY_PAISE: number;
  MAX_STOCK_VALUE_PAISE: number;
  assertMoneyInRange: (valuePaise: number) => void;
  assertStockValueInRange: (
    stockMilli: number,
    averageCostPaise: number,
  ) => void;
  toSafePaise: (value: string | number | bigint) => number;
};
async function money(): Promise<Money> {
  const path = "../../src/lib/money";
  return (await import(path)) as Money;
}

function expectTooLarge(fn: () => unknown) {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(AppError);
  expect((thrown as AppError).code).toBe("AMOUNT_TOO_LARGE");
  expect((thrown as AppError).statusCode).toBe(400);
}

describe("BR-STD-39 / BR-STD-16 the limits", () => {
  test("BR-STD-16 MAX_MONEY_PAISE is 10,000,000,000,000 and below 2^53", async () => {
    const m = await money();
    expect(m.MAX_MONEY_PAISE).toBe(10_000_000_000_000);
    expect(m.MAX_MONEY_PAISE).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  test("BR-STD-43 MAX_STOCK_VALUE_PAISE is 9,000,000,000,000,000, just under 2^53", async () => {
    const m = await money();
    expect(m.MAX_STOCK_VALUE_PAISE).toBe(9_000_000_000_000_000);
    expect(m.MAX_STOCK_VALUE_PAISE).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  test("BR-STD-39 assertMoneyInRange: the limit passes, one paise more is AMOUNT_TOO_LARGE", async () => {
    const m = await money();
    expect(() => m.assertMoneyInRange(10_000_000_000_000)).not.toThrow();
    expectTooLarge(() => m.assertMoneyInRange(10_000_000_000_001));
  });

  test("BR-STD-39 the 400 message names the limit", async () => {
    const m = await money();
    try {
      m.assertMoneyInRange(10_000_000_000_001);
      throw new Error("did not throw");
    } catch (e) {
      expect((e as Error).message).toBe(
        "Amount is above the largest value allowed (₹10,000 crore).",
      );
    }
  });
});

describe("BR-STD-43 stock value stays exact", () => {
  test("BR-STD-43 assertStockValueInRange(900_000_000_000, 10_000_000) is ok", async () => {
    const m = await money();
    expect(() =>
      m.assertStockValueInRange(900_000_000_000, 10_000_000),
    ).not.toThrow();
  });

  test("BR-STD-43 assertStockValueInRange(900_000_001_000, 10_000_000) -> AMOUNT_TOO_LARGE", async () => {
    const m = await money();
    expectTooLarge(() =>
      m.assertStockValueInRange(900_000_001_000, 10_000_000),
    );
  });

  test("BR-STD-43 a negative stock above the exact range is refused too (absolute value)", async () => {
    const m = await money();
    expectTooLarge(() =>
      m.assertStockValueInRange(-900_000_001_000, 10_000_000),
    );
  });

  test("BR-STD-43 toSafePaise keeps 2^53 - 1 exactly", async () => {
    const m = await money();
    expect(m.toSafePaise("9007199254740991")).toBe(9007199254740991);
  });

  test("BR-STD-43 toSafePaise('9007199254740992') -> AMOUNT_TOO_LARGE", async () => {
    const m = await money();
    expectTooLarge(() => m.toSafePaise("9007199254740992"));
  });

  test("BR-STD-43 toSafePaise maps a normal driver bigint text to a number", async () => {
    const m = await money();
    expect(m.toSafePaise("3000000000")).toBe(3_000_000_000);
    expect(m.toSafePaise("0")).toBe(0);
  });
});
