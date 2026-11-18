/**
 * docs/specs/design-system/spec.md (v1): BR-DS-06, BR-DS-16, BR-DS-21, BR-DS-22, BR-DS-26.
 * The PO-detail breadcrumb case (doc number) belongs to po-adoption (BR-DS-22 example) and lives in that e2e.
 * Runs against the `bun run try` stack (see e2e/README.md). Written by test-writer from the spec only.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./support/auth";

async function open(page: Page, path: string) {
	await page.goto(path);
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
		timeout: 15_000,
	});
}

/** Resolve a CSS colour (token via var()) to the browser's computed rgb string. */
const resolveColour = (page: Page, value: string) =>
	page.evaluate((v) => {
		const probe = document.createElement("div");
		probe.style.color = v;
		document.body.appendChild(probe);
		const c = getComputedStyle(probe).color;
		probe.remove();
		return c;
	}, value);

test.describe("BR-DS-22 one h1 and one breadcrumb trail in the top bar", () => {
	test("BR-DS-22 the PO list has one h1 and one Breadcrumb nav inside the top bar", async ({
		page,
	}) => {
		await open(page, "/purchase-orders");
		await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
		const trail = page.getByRole("navigation", { name: "Breadcrumb" });
		await expect(trail).toHaveCount(1);
		const crumb = trail.locator("[aria-current='page']");
		await expect(crumb).toHaveCount(1);
		await expect(crumb).not.toHaveText("");
	});

	test("BR-DS-22 the top bar fold button toggles its name", async ({
		page,
	}) => {
		await open(page, "/purchase-orders");
		await page.evaluate(() =>
			localStorage.removeItem("diecast.sidebar.folded"),
		);
		await page.reload();
		await page.getByRole("button", { name: "Fold sidebar" }).click();
		await expect(
			page.getByRole("button", { name: "Unfold sidebar" }),
		).toBeVisible();
	});
});

test.describe("BR-DS-21 sidebar icons and active item", () => {
	test("BR-DS-21 every sidebar link has an icon", async ({ page }) => {
		await open(page, "/purchase-orders");
		const links = page.locator("[data-sidebar='sidebar']").getByRole("link");
		await expect(links.first()).toBeVisible({ timeout: 15_000 });
		const n = await links.count();
		expect(n).toBeGreaterThan(0);
		for (let i = 0; i < n; i++) {
			await expect(
				links.nth(i).locator("svg.tabler-icon").first(),
			).toBeVisible();
		}
	});

	test("BR-DS-21 on /purchase-orders only the /purchase-orders item is current, tinted and bold", async ({
		page,
	}) => {
		await open(page, "/purchase-orders");
		const side = page.locator("[data-sidebar='sidebar']");
		const current = side.locator("a[aria-current='page']");
		await expect(current).toHaveCount(1);
		await expect(current).toHaveAttribute("href", "/purchase-orders");
		const style = await current.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { weight: Number(cs.fontWeight), bg: cs.backgroundColor };
		});
		expect(style.weight).toBeGreaterThanOrEqual(600);
		const tint = await resolveColour(page, "var(--sidebar-accent)");
		expect(style.bg).toBe(tint);
		// A non-active item is not tinted.
		const other = side
			.getByRole("link")
			.and(page.locator("a:not([href='/purchase-orders'])"))
			.first();
		const otherBg = await other.evaluate(
			(el) => getComputedStyle(el).backgroundColor,
		);
		expect(otherBg).not.toBe(tint);
	});

	test("BR-DS-21 the active item has a 3 px --sidebar-primary bar", async ({
		page,
	}) => {
		await open(page, "/purchase-orders");
		const current = page
			.locator("[data-sidebar='sidebar']")
			.locator("a[aria-current='page']");
		const bar = await resolveColour(page, "var(--sidebar-primary)");
		const found = await current.evaluate((el, expected) => {
			const probes = [el, ...Array.from(el.querySelectorAll("*"))];
			const view = (n: Element, pseudo?: string) => getComputedStyle(n, pseudo);
			for (const n of probes) {
				for (const pseudo of [undefined, "::before", "::after"]) {
					const cs = view(n, pseudo);
					if (
						cs.borderLeftColor === expected &&
						Number.parseFloat(cs.borderLeftWidth) === 3
					)
						return true;
					if (
						cs.backgroundColor === expected &&
						Number.parseFloat(cs.width) === 3
					)
						return true;
				}
			}
			return false;
		}, bar);
		expect(found).toBe(true);
	});
});

test.describe("BR-DS-16 table density", () => {
	const rowHeight = async (page: Page) => {
		const row = page.locator("tbody tr").first();
		await expect(row).toBeVisible({ timeout: 15_000 });
		return (await row.boundingBox())?.height ?? 0;
	};

	test("BR-DS-16 default is comfortable: <html data-density> and 36 px rows", async ({
		page,
	}) => {
		await open(page, "/purchase-orders");
		await page.evaluate(() => localStorage.removeItem("diecast.density"));
		await page.reload();
		await expect(page.locator("html")).toHaveAttribute(
			"data-density",
			"comfortable",
		);
		expect(Math.round(await rowHeight(page))).toBe(36);
	});

	test("BR-DS-16 a Compact choice from the user menu survives reload and shows 30 px rows", async ({
		page,
	}) => {
		await open(page, "/purchase-orders");
		await page.evaluate(() => localStorage.removeItem("diecast.density"));
		await page.reload();
		await page.locator("header").getByRole("button").last().click();
		await page.getByText("Compact", { exact: true }).click();
		await expect(page.locator("html")).toHaveAttribute(
			"data-density",
			"compact",
		);
		await page.reload();
		await expect(page.locator("html")).toHaveAttribute(
			"data-density",
			"compact",
		);
		expect(Math.round(await rowHeight(page))).toBe(30);
	});

	test("BR-DS-16 the saved Compact choice applies to the GRN list too", async ({
		page,
	}) => {
		await open(page, "/purchase-orders");
		await page.evaluate(() =>
			localStorage.setItem("diecast.density", "compact"),
		);
		await page.goto("/grn");
		await expect(page.locator("html")).toHaveAttribute(
			"data-density",
			"compact",
		);
		expect(Math.round(await rowHeight(page))).toBe(30);
	});
});

test.describe("BR-DS-06 and BR-DS-26 colour carries weight only where allowed", () => {
	test("BR-DS-06 at most one solid --primary button in the PO list page header", async ({
		page,
	}) => {
		await open(page, "/purchase-orders");
		const primary = await resolveColour(page, "var(--primary)");
		const count = await page.evaluate((expected) => {
			const header = document.querySelector("h1")?.closest("header, div");
			const root = header?.parentElement ?? document.body;
			return Array.from(root.querySelectorAll("button, a")).filter(
				(el) => getComputedStyle(el).backgroundColor === expected,
			).length;
		}, primary);
		expect(count).toBeLessThanOrEqual(1);
	});

	test("BR-DS-06 the sidebar active item is the only --primary-family fill on a nav link", async ({
		page,
	}) => {
		await open(page, "/purchase-orders");
		const primary = await resolveColour(page, "var(--primary)");
		const filled = await page
			.locator("[data-sidebar='sidebar']")
			.getByRole("link")
			.evaluateAll(
				(els, expected) =>
					els.filter((e) => getComputedStyle(e).backgroundColor === expected)
						.length,
				primary,
			);
		expect(filled).toBe(0);
	});

	test("BR-DS-26 no gradient anywhere on the PO list (skeleton sweep excepted)", async ({
		page,
	}) => {
		await open(page, "/purchase-orders");
		await page.waitForLoadState("networkidle");
		const offenders = await page.evaluate(() =>
			Array.from(document.querySelectorAll("*"))
				.filter((el) => /gradient/.test(getComputedStyle(el).backgroundImage))
				.filter(
					(el) => !el.closest("[class*='skeleton'], [data-slot='skeleton']"),
				)
				.map((el) => el.tagName.toLowerCase()),
		);
		expect(offenders).toEqual([]);
	});

	test("BR-DS-26 the page background is --background, not a colour", async ({
		page,
	}) => {
		await open(page, "/purchase-orders");
		const bg = await resolveColour(page, "var(--background)");
		const actual = await page.evaluate(
			() => getComputedStyle(document.body).backgroundColor,
		);
		expect(actual).toBe(bg);
	});
});
