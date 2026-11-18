/** docs/specs/design-system/spec.md (v1): BR-DS-21 (every sidebar item has a Tabler icon; icon map in "Shell"). */
import { describe, expect, test } from "bun:test";
import {
	IconArrowsExchange,
	IconChecklist,
	IconFileText,
	IconId,
	IconLayoutDashboard,
	IconPackage,
	IconSettings,
	IconShoppingCart,
	IconStack2,
	IconUsers,
} from "@tabler/icons-react";
import { getNavIcon } from "@/lib/shell/nav-icons";

const MAP: Array<[string, unknown]> = [
	["/landing", IconLayoutDashboard],
	["/", IconLayoutDashboard],
	["/purchase-requisitions", IconFileText],
	["/approvals", IconChecklist],
	["/purchase-orders", IconShoppingCart],
	["/suppliers", IconUsers],
	["/grn", IconPackage],
	["/inventory", IconStack2],
	["/subcontracting", IconArrowsExchange],
	["/employee-directory", IconId],
	["/setup", IconSettings],
];

describe("getNavIcon", () => {
	for (const [path, icon] of MAP) {
		test(`BR-DS-21 ${path} gets its spec icon`, () => {
			expect(getNavIcon(path)).toBe(icon as ReturnType<typeof getNavIcon>);
		});
	}

	test("BR-DS-21 a deeper path uses the icon of its first segment", () => {
		expect(getNavIcon("/purchase-orders/abc-123")).toBe(IconShoppingCart);
	});

	test("BR-DS-21 an unknown path still gets an icon", () => {
		expect(getNavIcon("/no-such-route")).toBeTruthy();
	});
});
