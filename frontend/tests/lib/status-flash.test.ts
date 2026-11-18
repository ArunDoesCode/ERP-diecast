/**
 * docs/specs/design-system/spec.md (v1): BR-DS-12 (status flash fires once, on a change by the
 * current user; never on first load). Written by test-writer from the spec only.
 */
import { describe, expect, test } from "bun:test";
import { shouldFlashStatus } from "@/lib/status-flash";

describe("BR-DS-12 shouldFlashStatus", () => {
	test("BR-DS-12 a status that changed after mount flashes", () => {
		expect(shouldFlashStatus("pending_approval", "approved")).toBe(true);
	});

	test("BR-DS-12 the same status (background refetch) does not flash", () => {
		expect(shouldFlashStatus("approved", "approved")).toBe(false);
	});

	test("BR-DS-12 first load (no previous status) does not flash", () => {
		expect(shouldFlashStatus(undefined, "approved")).toBe(false);
		expect(shouldFlashStatus(null, "approved")).toBe(false);
	});
});
