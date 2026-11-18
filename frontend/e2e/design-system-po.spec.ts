/**
 * docs/specs/design-system/spec.md (v1): BR-DS-07, BR-DS-12, BR-DS-14, BR-DS-17, BR-DS-19, BR-DS-27
 * on the purchase-order list. Runs against the `bun run try` stack (see e2e/README.md).
 * Credentials: E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (or SEED_USER_PASSWORD).
 * BR-DS-27 also needs a login WITHOUT the PO create permission: E2E_NOCREATE_EMAIL (+ E2E_NOCREATE_PASSWORD,
 * default = admin password); skipped when unset. Written by test-writer from the spec only.
 *
 * Not automated: BR-DS-08 (danger only for destructive actions: human review), BR-DS-25 (adoption changes
 * look only: commit review). BR-DS-18 and the rest are unit tests in tests/.
 */
import { expect, type Page, test } from "@playwright/test";

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@diecast.local";
const PASSWORD =
	process.env.E2E_ADMIN_PASSWORD ?? process.env.SEED_USER_PASSWORD ?? "";

async function login(page: Page, email = EMAIL, password = PASSWORD) {
	if (!password) {
		throw new Error(
			"Set E2E_ADMIN_PASSWORD (or SEED_USER_PASSWORD): the password of the seeded admin",
		);
	}
	await page.goto("/login");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(password);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL("**/landing");
}

async function openPoList(page: Page) {
	await page.goto("/purchase-orders");
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
		timeout: 15_000,
	});
}

test.describe("BR-DS-17 the PO list is header + filter bar + table + pagination", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

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
		await page.route("**/getpos*", (route) =>
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
		await login(page);
		await page.route("**/getpos*", async (route) => {
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
		await login(page);
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
		await login(page);
		await openPoList(page);
		const toolbar = page.getByRole("toolbar", { name: "Filters" });
		const target = toolbar.locator("button[aria-pressed='false']").first();
		const name = (await target.textContent()) ?? "";
		await target.click();
		await expect(
			toolbar.getByRole("button", { name, pressed: true }).first(),
		).toBeVisible();
	});
});

test.describe("BR-DS-19 mono document numbers, right-aligned tabular numbers", () => {
	test("BR-DS-19 PO numbers in the table use a monospace font", async ({
		page,
	}) => {
		await login(page);
		await openPoList(page);
		const doc = page.getByRole("link", { name: /^PO-\S+/ }).first();
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
		await login(page);
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
		await login(page, email, process.env.E2E_NOCREATE_PASSWORD ?? PASSWORD);
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

	test("BR-DS-27 admin sees the create control that the other user does not", async ({
		page,
	}) => {
		await login(page);
		await openPoList(page);
		await expect(
			page
				.getByRole("button", { name: /new purchase order/i })
				.or(page.getByRole("link", { name: /new purchase order/i }))
				.first(),
		).toBeVisible();
	});
});

test.describe("BR-DS-12 status flash", () => {
	test("BR-DS-12 a background refetch of the PO list never tints a row", async ({
		page,
	}) => {
		await login(page);
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
		await login(page);
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
