/**
 * docs/specs/design-system/spec.md (v2): BR-DS-02, 06, 07, 16, 20, 26, 28, 29 as one user journey.
 * A user opens the PO list, checks colour and size rules, tabs through it, opens the supplier form,
 * switches to Compact, visits GRN, and finally checks contrast in light and dark.
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

const resolveColour = (page: Page, value: string) =>
	page.evaluate((v) => {
		const probe = document.createElement("div");
		probe.style.color = v;
		document.body.appendChild(probe);
		const c = getComputedStyle(probe).color;
		probe.remove();
		return c;
	}, value);

async function firstRowHeight(page: Page) {
	await expect(page.locator("tbody tr").first()).toBeVisible({
		timeout: 15_000,
	});
	await expect(
		page.locator("tbody [data-slot='skeleton'], tbody .animate-pulse"),
	).toHaveCount(0, { timeout: 15_000 });
	const row = page.locator("tbody tr:not(:has(td[colspan]))").first();
	await expect(row).toBeVisible({ timeout: 15_000 });
	return Math.round((await row.boundingBox())?.height ?? 0);
}

/** WCAG 2 contrast ratio for two computed colours, resolved in the page (token -> sRGB). */
async function contrastPairs(page: Page, pairs: [string, string][]) {
	return page.evaluate((list) => {
		const toRgb = (v: string) => {
			const c = document.createElement("canvas");
			c.width = c.height = 1;
			const ctx = c.getContext("2d") as CanvasRenderingContext2D;
			const probe = document.createElement("div");
			probe.style.color = `var(${v})`;
			document.body.appendChild(probe);
			const resolved = getComputedStyle(probe).color;
			probe.remove();
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillStyle = resolved;
			ctx.fillRect(0, 0, 1, 1);
			const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
			return [r, g, b];
		};
		const lum = ([r, g, b]: number[]) => {
			const f = (n: number) => {
				const s = n / 255;
				return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
			};
			return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
		};
		return list.map(([fg, bg]) => {
			const a = lum(toRgb(fg));
			const b = lum(toRgb(bg));
			return {
				pair: `${fg} on ${bg}`,
				ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
			};
		});
	}, pairs);
}

test("design-system v2 journey: PO list, focus, supplier form, density, GRN, contrast", async ({
	page,
}) => {
	await open(page, "/purchase-orders");
	await page.evaluate(() => localStorage.removeItem("diecast.density"));
	await page.reload();
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
		timeout: 15_000,
	});

	await test.step("BR-DS-16 default density is comfortable: 44 px rows", async () => {
		await expect(page.locator("html")).toHaveAttribute(
			"data-density",
			"comfortable",
		);
		expect(await firstRowHeight(page)).toBe(44);
	});

	await test.step("BR-DS-26 no gradient and the page background is --background", async () => {
		await page.waitForLoadState("networkidle");
		const gradients = await page.evaluate(() =>
			Array.from(document.querySelectorAll("*"))
				.filter((el) => /gradient/.test(getComputedStyle(el).backgroundImage))
				.filter(
					(el) => !el.closest("[class*='skeleton'], [data-slot='skeleton']"),
				)
				.map((el) => el.tagName.toLowerCase()),
		);
		expect(gradients).toEqual([]);
		const bg = await resolveColour(page, "var(--background)");
		expect(
			await page.evaluate(
				() => getComputedStyle(document.body).backgroundColor,
			),
		).toBe(bg);
	});

	await test.step("BR-DS-06 at most one solid --primary button in the page header; no primary fill on sidebar links", async () => {
		const primary = await resolveColour(page, "var(--primary)");
		const inHeader = await page.evaluate((expected) => {
			const header = document.querySelector("h1")?.closest("header, div");
			const root = header?.parentElement ?? document.body;
			return Array.from(root.querySelectorAll("button, a")).filter(
				(el) => getComputedStyle(el).backgroundColor === expected,
			).length;
		}, primary);
		expect(inHeader).toBeLessThanOrEqual(1);
		const sidebarFilled = await page
			.locator("[data-sidebar='sidebar']")
			.getByRole("link")
			.evaluateAll(
				(els, expected) =>
					els.filter((e) => getComputedStyle(e).backgroundColor === expected)
						.length,
				primary,
			);
		expect(sidebarFilled).toBe(0);
	});

	await test.step("BR-DS-07 document-number links use --brand-accent text", async () => {
		const accent = await resolveColour(page, "var(--brand-accent)");
		const links = page.locator("tbody a[href^='/purchase-orders/']");
		if ((await links.count()) > 0) {
			expect(
				await links.first().evaluate((el) => getComputedStyle(el).color),
			).toBe(accent);
		}
	});

	await test.step("BR-DS-28 no text under 12 px (12 only in a badge); no button or field under 32 px", async () => {
		const bad = await page.evaluate(() => {
			const out: string[] = [];
			for (const el of Array.from(document.querySelectorAll("body *"))) {
				if (el.closest("nextjs-portal")) continue;
				const cs = getComputedStyle(el);
				if (cs.display === "none" || cs.visibility === "hidden") continue;
				const hasText = Array.from(el.childNodes).some(
					(n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "",
				);
				if (hasText) {
					const size = Number.parseFloat(cs.fontSize);
					const inBadge = el.closest("[data-slot='badge']") !== null;
					if (size < 12) out.push(`text ${size}px: ${el.tagName}`);
					else if (size < 13 && !inBadge)
						out.push(`12px outside badge: ${el.tagName}`);
				}
				if (
					el.matches(
						"button, input:not([type=checkbox]):not([type=radio]), select, [role=combobox]",
					)
				) {
					const r = el.getBoundingClientRect();
					if (r.width > 0 && r.height > 0 && r.height < 32)
						out.push(`${el.tagName} ${r.height}px high`);
				}
			}
			return out;
		});
		expect(bad).toEqual([]);
	});

	await test.step("BR-DS-20 keyboard focus shows a solid 2 px ring, 2 px offset, in --ring", async () => {
		const ring = await resolveColour(page, "var(--ring)");
		const sidebarRing = await resolveColour(page, "var(--sidebar-ring)");
		await page.locator("body").click({ position: { x: 1, y: 1 } });
		const bad: string[] = [];
		let seen = 0;
		for (let i = 0; i < 25; i++) {
			await page.keyboard.press("Tab");
			const info = await page.evaluate(() => {
				const el = document.activeElement as HTMLElement | null;
				if (!el || el === document.body || el.closest("nextjs-portal"))
					return null;
				const cs = getComputedStyle(el);
				return {
					id: `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}`,
					inSidebar: el.closest("[data-sidebar='sidebar']") !== null,
					style: cs.outlineStyle,
					width: cs.outlineWidth,
					offset: cs.outlineOffset,
					color: cs.outlineColor,
				};
			});
			if (!info) continue;
			seen++;
			const want = info.inSidebar ? sidebarRing : ring;
			if (
				info.style !== "solid" ||
				info.width !== "2px" ||
				info.offset !== "2px" ||
				info.color !== want
			)
				bad.push(
					`${info.id}: ${info.style} ${info.width} ${info.offset} ${info.color}`,
				);
		}
		expect(seen).toBeGreaterThanOrEqual(5);
		expect(bad).toEqual([]);
	});

	await test.step("BR-DS-29 supplier form: label above a 36 px field", async () => {
		await open(page, "/suppliers");
		await page.getByRole("button", { name: "Create supplier" }).first().click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		const label = dialog.getByText("GST number", { exact: false }).first();
		const field = dialog.locator("#supplier-gst");
		await expect(field).toBeVisible();
		const l = await label.boundingBox();
		const f = await field.boundingBox();
		expect(l && f).toBeTruthy();
		if (l && f) {
			expect(l.y + l.height).toBeLessThanOrEqual(f.y + 1);
			expect(Math.round(f.height)).toBe(36);
		}
		// no floating label: the label is not inside the field box
		expect(await dialog.locator("[data-slot='floating-label']").count()).toBe(
			0,
		);
		await page.keyboard.press("Escape");
	});

	await test.step("BR-DS-16 Compact survives reload and applies to GRN: 36 px rows", async () => {
		await open(page, "/purchase-orders");
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
		expect(await firstRowHeight(page)).toBe(36);
		await page.goto("/grn");
		await expect(page.locator("html")).toHaveAttribute(
			"data-density",
			"compact",
		);
		expect(await firstRowHeight(page)).toBe(36);
	});

	await test.step("BR-DS-02 text pairs >= 4.5:1, field border and ring >= 3:1, light and dark", async () => {
		const textPairs: [string, string][] = [
			["--foreground", "--background"],
			["--card-foreground", "--card"],
			["--primary-foreground", "--primary"],
			["--brand-accent-foreground", "--brand-accent"],
			["--muted-foreground", "--background"],
			["--success", "--success-subtle"],
			["--warning", "--warning-subtle"],
			["--info", "--info-subtle"],
			["--neutral", "--neutral-subtle"],
			["--destructive", "--destructive-subtle"],
		];
		const edgePairs: [string, string][] = [
			["--input", "--card"],
			["--ring", "--background"],
		];
		for (const scheme of ["light", "dark"] as const) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto("/purchase-orders");
			await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
				timeout: 15_000,
			});
			if (scheme === "dark")
				await expect(page.locator("html")).toHaveClass(/\bdark\b/);
			for (const r of await contrastPairs(page, textPairs))
				expect(r.ratio, `${scheme} ${r.pair}`).toBeGreaterThanOrEqual(4.5);
			for (const r of await contrastPairs(page, edgePairs))
				expect(r.ratio, `${scheme} ${r.pair}`).toBeGreaterThanOrEqual(3);
		}
	});
});
