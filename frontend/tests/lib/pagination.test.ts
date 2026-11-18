/**
 * docs/specs/design-system/spec.md (v1): BR-DS-17 (Pagination: "1 to 25 of 41", page numbers).
 * Helper contract: .pipeline/design-system-po/contract.md. Written by test-writer from the spec only.
 */
import { describe, expect, test } from "bun:test";
import { formatPageRange, getPageNumbers } from "@/lib/pagination";

describe("BR-DS-17 formatPageRange", () => {
	test("BR-DS-17 first page of 41 at 25 per page reads '1 to 25 of 41'", () => {
		expect(formatPageRange(1, 25, 41)).toBe("1 to 25 of 41");
	});

	test("BR-DS-17 last partial page ends at the total", () => {
		expect(formatPageRange(2, 25, 41)).toBe("26 to 41 of 41");
	});

	test("BR-DS-17 zero rows reads '0 of 0'", () => {
		expect(formatPageRange(1, 25, 0)).toBe("0 of 0");
	});
});

describe("BR-DS-17 getPageNumbers", () => {
	test("BR-DS-17 a few pages are all listed, no ellipsis", () => {
		expect(getPageNumbers(1, 3)).toEqual([1, 2, 3]);
	});

	test("BR-DS-17 a single page yields [1]", () => {
		expect(getPageNumbers(1, 1)).toEqual([1]);
	});

	test("BR-DS-17 many pages: first, last and current are always present, gaps are null", () => {
		const out = getPageNumbers(10, 20);
		expect(out[0]).toBe(1);
		expect(out[out.length - 1]).toBe(20);
		expect(out).toContain(10);
		expect(out).toContain(null);
		expect(out.length).toBeLessThan(20);
	});

	test("BR-DS-17 numbers are strictly ascending and never duplicated", () => {
		const nums = getPageNumbers(10, 20).filter((n): n is number => n !== null);
		expect([...nums]).toEqual([...new Set(nums)].sort((a, b) => a - b));
	});

	test("BR-DS-17 no two ellipsis gaps are adjacent", () => {
		const out = getPageNumbers(10, 20);
		for (let i = 1; i < out.length; i++) {
			expect(out[i] === null && out[i - 1] === null).toBe(false);
		}
	});
});
