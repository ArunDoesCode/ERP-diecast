/**
 * docs/specs/design-system/spec.md (v1): BR-DS-22 (one breadcrumb trail in the top bar),
 * "Shell" table (top bar, breadcrumbs, user menu). Server-rendered to static HTML.
 */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import { TopBar } from "@/components/shell/TopBar";
import { UserMenu } from "@/components/shell/UserMenu";

const crumbs = [
	{ label: "Purchase" },
	{ label: "Purchase orders", href: "/purchase-orders" },
	{ label: "PO-2026-0187" },
];
const user = {
	name: "Asha Rao",
	role: "Back office",
	density: "comfortable" as const,
	onDensityChange: () => {},
	onLogout: () => {},
};

describe("Breadcrumbs", () => {
	const html = renderToStaticMarkup(createElement(Breadcrumbs, { crumbs }));

	test("BR-DS-22 is a nav named Breadcrumb holding an ol", () => {
		expect(html).toMatch(/<nav[^>]*aria-label="Breadcrumb"/);
		expect(html).toContain("<ol");
	});

	test("BR-DS-22 only the last item carries aria-current=page, and it is not a link", () => {
		expect(html.match(/aria-current="page"/g)?.length).toBe(1);
		expect(html).not.toMatch(/<a[^>]*aria-current="page"/);
		expect(html).toMatch(/aria-current="page"[^>]*>\s*PO-2026-0187/);
	});

	test("BR-DS-22 earlier items with an href are links", () => {
		expect(html).toMatch(
			/<a[^>]*href="\/purchase-orders"[^>]*>\s*Purchase orders/,
		);
	});
});

describe("TopBar", () => {
	const render = (folded: boolean) =>
		renderToStaticMarkup(
			createElement(TopBar, {
				crumbs,
				sidebarFolded: folded,
				onToggleSidebar: () => {},
				user,
			}),
		);

	test("BR-DS-22 the fold button is named Fold sidebar when open", () => {
		expect(render(false)).toMatch(/aria-label="Fold sidebar"|>Fold sidebar</);
	});

	test("BR-DS-22 the fold button is named Unfold sidebar when folded", () => {
		expect(render(true)).toMatch(
			/aria-label="Unfold sidebar"|>Unfold sidebar</,
		);
	});

	test("BR-DS-22 the search box is a disabled stub", () => {
		expect(render(false)).toMatch(/<input[^>]*disabled/);
	});

	test("BR-DS-22 the top bar holds the breadcrumb trail exactly once", () => {
		expect(render(false).match(/aria-label="Breadcrumb"/g)?.length).toBe(1);
	});

	test("BR-DS-22 the user menu trigger is shown in the top bar", () => {
		expect(render(false)).toContain("Asha Rao");
	});
});

describe("UserMenu", () => {
	test("BR-DS-22 the trigger button's accessible name is the user's name", () => {
		const html = renderToStaticMarkup(createElement(UserMenu, user));
		expect(html).toMatch(
			/<button[^>]*>[\s\S]*Asha Rao|<button[^>]*aria-label="Asha Rao"/,
		);
	});
});
