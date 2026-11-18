/** docs/specs/design-system/spec.md (v1): BR-DS-22 (breadcrumb built from the route). */
import { describe, expect, test } from "bun:test";
import { buildBreadcrumbs } from "@/lib/shell/breadcrumbs";

describe("buildBreadcrumbs", () => {
	test("BR-DS-22 PO detail is Purchase / Purchase orders / PO-2026-0187", () => {
		const crumbs = buildBreadcrumbs("/purchase-orders/abc-123", {
			group: "Purchase",
			docNumber: "PO-2026-0187",
		});
		expect(crumbs.map((c) => c.label)).toEqual([
			"Purchase",
			"Purchase orders",
			"PO-2026-0187",
		]);
	});

	test("BR-DS-22 the group crumb has no link, the list crumb links to its list route", () => {
		const crumbs = buildBreadcrumbs("/purchase-orders/abc-123", {
			group: "Purchase",
			docNumber: "PO-2026-0187",
		});
		expect(crumbs[0].href).toBeUndefined();
		expect(crumbs[1].href).toBe("/purchase-orders");
	});

	test("BR-DS-22 the last crumb is text only (no href)", () => {
		const crumbs = buildBreadcrumbs("/purchase-orders/abc-123", {
			group: "Purchase",
			docNumber: "PO-2026-0187",
		});
		expect(crumbs[crumbs.length - 1].href).toBeUndefined();
	});

	test("BR-DS-22 the PO list is Purchase / Purchase orders, last crumb is text", () => {
		const crumbs = buildBreadcrumbs("/purchase-orders", { group: "Purchase" });
		expect(crumbs.map((c) => c.label)).toEqual(["Purchase", "Purchase orders"]);
		expect(crumbs[crumbs.length - 1].href).toBeUndefined();
	});
});
