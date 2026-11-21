/**
 * docs/specs/design-system/spec.md (v1): BR-DS-07, BR-DS-12, BR-DS-14, BR-DS-15, BR-DS-22, BR-DS-17, BR-DS-19, BR-DS-27
 * on the purchase-order list. Runs against the `bun run try` stack (see e2e/README.md).
 * Credentials: E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (or SEED_USER_PASSWORD).
 * BR-DS-15 (dark badges) and BR-DS-22 (PO-detail crumb) added per TEST-10.
 * BR-DS-27 also needs a login WITHOUT the PO create permission: E2E_NOCREATE_EMAIL (+ E2E_NOCREATE_PASSWORD,
 * default = admin password); skipped when unset. Written by test-writer from the spec only.
 *
 * The PO list reads the requisition list endpoint GET /api/pr/getprs (not /po/getpos).
 *
 * Not automated: BR-DS-08 (danger only for destructive actions: human review), BR-DS-25 (adoption changes
 * look only: commit review). BR-DS-18 and the rest are unit tests in tests/.
 */
import { expect, type Page } from "@playwright/test";
import { PASSWORD, test } from "./support/auth";

/** Separate login, only for the no-create-permission user (one login, one test). */
async function loginAs(page: Page, email: string, password: string) {
	await page.goto("/login");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(password);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL("**/home");
}

async function openPoList(page: Page) {
	await page.goto("/purchase-orders");
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
		timeout: 15_000,
	});
}

test.describe("BR-DS-17 the PO list is header + filter bar + table + pagination", () => {
	test("BR-DS-17 the list has one h1, a Filters toolbar and a table with column headers", async ({
		page,
	}) => {
		await openPoList(page);
		await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
		await expect(page.getByRole("toolbar", { name: "Filters" })).toBeVisible();
		await expect(page.getByRole("table")).toBeVisible();
		expect(await page.locator("table th[scope='col']").count()).toBeGreaterThan(
			0,
		);
	});

	test("BR-DS-17 a failed list request shows an alert with 'Try again', not an empty table", async ({
		page,
	}) => {
		await page.route("**/pr/getprs*", (route) =>
			route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({ success: false, error: "Server exploded" }),
			}),
		);
		await page.goto("/purchase-orders");
		const alert = page.getByRole("alert").filter({ hasText: /./ });
		await expect(alert.first()).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
		await expect(page.getByText("No results.")).toHaveCount(0);
	});
});

test.describe("BR-DS-14 skeleton sweep only while loading", () => {
	test("BR-DS-14 skeleton rows and aria-busy show while the list is slow; both are gone when it resolves", async ({
		page,
	}) => {
		await page.route("**/pr/getprs*", async (route) => {
			await new Promise((r) => setTimeout(r, 1500));
			await route.continue();
		});
		await page.goto("/purchase-orders");
		await expect(page.locator("[aria-busy='true']").first()).toBeVisible({
			timeout: 10_000,
		});
		const sweeping = await page.evaluate(
			() =>
				document
					.getAnimations()
					.filter((a) =>
						/skeleton/.test((a as CSSAnimation).animationName ?? ""),
					).length,
		);
		expect(sweeping).toBeGreaterThan(0);

		await expect(page.locator("[aria-busy='true']")).toHaveCount(0, {
			timeout: 15_000,
		});
		const after = await page.evaluate(
			() =>
				document
					.getAnimations()
					.filter((a) =>
						/skeleton/.test((a as CSSAnimation).animationName ?? ""),
					).length,
		);
		expect(after).toBe(0);
	});
});

test.describe("BR-DS-07 selection uses the accent", () => {
	test("BR-DS-07 the selected filter chip is aria-pressed and its fill differs from an unselected chip", async ({
		page,
	}) => {
		await openPoList(page);
		const toolbar = page.getByRole("toolbar", { name: "Filters" });
		const pressed = toolbar.locator("button[aria-pressed='true']").first();
		const unpressed = toolbar.locator("button[aria-pressed='false']").first();
		await expect(pressed).toBeVisible();
		await expect(unpressed).toBeVisible();
		const bg = (l: typeof pressed) =>
			l.evaluate((el) => getComputedStyle(el).backgroundColor);
		const accent = await page.evaluate(() => {
			const p = document.createElement("span");
			p.style.backgroundColor = "var(--brand-accent)";
			document.body.appendChild(p);
			const c = getComputedStyle(p).backgroundColor;
			p.remove();
			return c;
		});
		expect(await bg(pressed)).toBe(accent);
		expect(await bg(unpressed)).not.toBe(accent);
	});

	test("BR-DS-07 clicking another chip moves the selection", async ({
		page,
	}) => {
		await openPoList(page);
		const toolbar = page.getByRole("toolbar", { name: "Filters" });
		const target = toolbar.locator("button[aria-pressed='false']").first();
		// The chip text carries a count ("–" while loading); match the label part only.
		const raw = (await target.textContent()) ?? "";
		const label = raw.replace(/^[\s–\-\d.,]+|[\s–\-\d.,]+$/g, "");
		expect(label.length).toBeGreaterThan(0);
		await target.click();
		await expect(
			toolbar
				.getByRole("button", {
					name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
					pressed: true,
				})
				.first(),
		).toBeVisible();
	});
});

test.describe("BR-DS-19 mono document numbers, right-aligned tabular numbers", () => {
	test("BR-DS-19 PO numbers in the table use a monospace font", async ({
		page,
	}) => {
		await openPoList(page);
		const doc = page
			.locator("table tbody tr")
			.first()
			.getByRole("link")
			.first();
		await expect(doc).toBeVisible({ timeout: 15_000 });
		const mono = await doc.evaluate((el) => {
			const fam = getComputedStyle(el).fontFamily;
			const body = getComputedStyle(document.body).fontFamily;
			return { fam, body };
		});
		expect(mono.fam).not.toBe(mono.body);
		expect(mono.fam.toLowerCase()).toMatch(/mono/);
	});

	test("BR-DS-19 a Value / Qty column is right-aligned with tabular numbers", async ({
		page,
	}) => {
		await openPoList(page);
		await page.waitForLoadState("networkidle");
		const header = page
			.locator("table th[scope='col']")
			.filter({ hasText: /value|amount|total|qty|quantity/i })
			.first();
		test.skip((await header.count()) === 0, "no numeric column on the PO list");
		const idx = await header.evaluate((el) =>
			Array.from(el.parentElement?.children ?? []).indexOf(el),
		);
		const cell = page
			.locator(`table tbody tr td:nth-child(${idx + 1})`)
			.first();
		await expect(cell).toBeVisible();
		const style = await cell.evaluate((el) => {
			const cs = getComputedStyle(el);
			const inner = el.firstElementChild
				? getComputedStyle(el.firstElementChild)
				: cs;
			return {
				align: cs.textAlign,
				justify: inner.justifyContent,
				numeric: `${cs.fontVariantNumeric} ${inner.fontVariantNumeric}`,
			};
		});
		expect(
			["right", "end"].includes(style.align) ||
				["flex-end", "end", "right"].includes(style.justify),
		).toBe(true);
		expect(style.numeric).toContain("tabular-nums");
	});
});

test.describe("BR-DS-27 no permission, no element", () => {
	test("BR-DS-27 a user without PO create permission sees no 'New purchase order' control and the header keeps one h1", async ({
		page,
	}) => {
		const email = process.env.E2E_NOCREATE_EMAIL;
		test.skip(!email, "set E2E_NOCREATE_EMAIL to a login without po create");
		await page.context().clearCookies();
		await loginAs(
			page,
			email as string,
			process.env.E2E_NOCREATE_PASSWORD ?? PASSWORD,
		);
		await openPoList(page);
		await expect(
			page.getByRole("button", { name: /new purchase order/i }),
		).toHaveCount(0);
		await expect(
			page.getByRole("link", { name: /new purchase order/i }),
		).toHaveCount(0);
		// No disabled ghost in the header actions either.
		await expect(
			page
				.getByRole("group", { name: "Page actions" })
				.locator("[disabled], [aria-disabled='true']"),
		).toHaveCount(0);
		await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
	});
});

test.describe("BR-DS-12 status flash", () => {
	test("BR-DS-12 a background refetch of the PO list never tints a row", async ({
		page,
	}) => {
		await openPoList(page);
		await page.waitForLoadState("networkidle");
		// Force a refetch without a user status change: tab away and back.
		await page.evaluate(() => {
			window.dispatchEvent(new Event("blur"));
			document.dispatchEvent(new Event("visibilitychange"));
			window.dispatchEvent(new Event("focus"));
		});
		await page.waitForTimeout(300);
		const flashing = await page.evaluate(
			() =>
				document
					.getAnimations()
					.filter((a) =>
						/status-flash/.test((a as CSSAnimation).animationName ?? ""),
					).length,
		);
		expect(flashing).toBe(0);
	});

	test("BR-DS-12 no status-flash animation is running on first load of the list", async ({
		page,
	}) => {
		await openPoList(page);
		const flashing = await page.evaluate(
			() =>
				document
					.getAnimations()
					.filter((a) =>
						/status-flash/.test((a as CSSAnimation).animationName ?? ""),
					).length,
		);
		expect(flashing).toBe(0);
	});
});

test.describe("BR-DS-15 PO list in dark", () => {
	test("BR-DS-15 PO list in dark: badges use the dark subtle tints, not the light ones", async ({
		page,
	}) => {
		const badgeFills = () =>
			page.evaluate(() => {
				const probe = (v: string) => {
					const e = document.createElement("div");
					e.style.backgroundColor = v;
					document.body.appendChild(e);
					const c = getComputedStyle(e).backgroundColor;
					e.remove();
					return c;
				};
				const tones = [
					"success",
					"warning",
					"info",
					"neutral",
					"destructive",
				].map((t) => probe(`var(--${t}-subtle)`));
				const fills = Array.from(document.querySelectorAll("table tbody span"))
					.filter((el) => getComputedStyle(el).borderRadius.length > 0)
					.map((el) => getComputedStyle(el).backgroundColor)
					.filter((c) => c !== "rgba(0, 0, 0, 0)");
				return { tones, fills };
			});

		await page.emulateMedia({ colorScheme: "light" });
		await openPoList(page);
		await expect(page.locator("table tbody tr").first()).toBeVisible({
			timeout: 15_000,
		});
		await page.waitForLoadState("networkidle");
		const light = await badgeFills();
		const lightTone = new Set(light.tones);

		await page.emulateMedia({ colorScheme: "dark" });
		await page.reload();
		await expect(page.locator("html")).toHaveClass(/\bdark\b/);
		await expect(page.locator("table tbody tr").first()).toBeVisible({
			timeout: 15_000,
		});
		await page.waitForLoadState("networkidle");
		await page.screenshot({ path: "test-results/design-system-po-dark.png" });
		const dark = await badgeFills();
		const darkTone = new Set(dark.tones);

		const badges = dark.fills.filter((c) => darkTone.has(c));
		test.skip(dark.fills.length === 0, "no badges on the PO list to inspect");
		expect(badges.length).toBeGreaterThan(0);
		// None of the badge fills in dark may be a light-mode subtle tint.
		expect(
			dark.fills.filter((c) => lightTone.has(c) && !darkTone.has(c)),
		).toEqual([]);
	});
});

test.describe("BR-DS-22 PO detail breadcrumb", () => {
	test("BR-DS-22 PO detail shows one h1 and the trail Purchase / Purchase orders / <document number>", async ({
		page,
	}) => {
		await openPoList(page);
		const link = page
			.locator("table tbody tr")
			.first()
			.getByRole("link")
			.first();
		await expect(link).toBeVisible({ timeout: 15_000 });
		const docNo = ((await link.textContent()) ?? "").trim();
		await link.click();
		await page.waitForURL(/purchase-orders\/.+/);
		await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1, {
			timeout: 15_000,
		});
		const trail = page.getByRole("navigation", { name: "Breadcrumb" });
		await expect(trail).toHaveCount(1);
		await expect(trail).toContainText("Purchase");
		await expect(trail).toContainText("Purchase orders");
		await expect(trail.locator("[aria-current='page']")).toContainText(docNo);
	});
});
