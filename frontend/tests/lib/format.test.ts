/**
 * docs/specs/design-system/spec.md (v1): BR-DS-18 (format.ts is the one place for dates, money,
 * quantities) and the format.ts row of "Shared components". Written by test-writer from the spec only.
 */
import { describe, expect, test } from "bun:test";
import {
	formatDate,
	formatDateTime,
	formatDocNo,
	formatMoney,
	formatQty,
} from "@/lib/format";

describe("BR-DS-18 formatMoney", () => {
	test("BR-DS-18 48200000 paise is ₹4,82,000.00 (Indian grouping)", () => {
		expect(formatMoney(48200000)).toBe("₹4,82,000.00");
	});

	test("BR-DS-18 whole drops the paise", () => {
		expect(formatMoney(48200000, { whole: true })).toBe("₹4,82,000");
	});

	test("BR-DS-18 paise are kept below one rupee", () => {
		expect(formatMoney(5)).toBe("₹0.05");
	});

	test("BR-DS-18 null and undefined are an en dash", () => {
		expect(formatMoney(null)).toBe("–");
		expect(formatMoney(undefined)).toBe("–");
	});

	test("BR-DS-18 zero is a value, not empty", () => {
		expect(formatMoney(0)).toBe("₹0.00");
	});
});

describe("BR-DS-18 formatDate / formatDateTime", () => {
	test("BR-DS-18 date is '28 Nov 2026'", () => {
		expect(formatDate("2026-11-28T06:00:00.000Z")).toBe("28 Nov 2026");
	});

	test("BR-DS-18 date uses IST: 20:00Z on the 27th is already the 28th", () => {
		expect(formatDate("2026-11-27T20:00:00.000Z")).toBe("28 Nov 2026");
	});

	test("BR-DS-18 null date is an en dash", () => {
		expect(formatDate(null)).toBe("–");
		expect(formatDate(undefined)).toBe("–");
		expect(formatDateTime(null)).toBe("–");
	});

	test("BR-DS-18 date-time carries the IST clock time", () => {
		expect(formatDateTime("2026-11-28T06:00:00.000Z")).toContain("11:30");
	});
});

describe("BR-DS-18 formatQty / formatDocNo", () => {
	test("BR-DS-18 quantity shows the given decimals and the unit", () => {
		expect(formatQty(12.5, "kg", 3)).toBe("12.500 kg");
	});

	test("BR-DS-18 zero decimals for whole units", () => {
		expect(formatQty(1200, "pcs", 0)).toBe("1,200 pcs");
	});

	test("BR-DS-18 null quantity is an en dash", () => {
		expect(formatQty(null, "kg", 3)).toBe("–");
	});

	test("BR-DS-18 null document number is an en dash", () => {
		expect(formatDocNo(null)).toBe("–");
		expect(formatDocNo("PO-2026-0190")).toBe("PO-2026-0190");
	});
});
