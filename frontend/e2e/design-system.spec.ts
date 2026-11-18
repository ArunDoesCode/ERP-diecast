/**
 * docs/specs/design-system/spec.md (v1): BR-DS-10, BR-DS-11, BR-DS-15, BR-DS-20.
 * Runs against the `bun run try` stack (see e2e/README.md). Credentials as in smoke.spec.ts.
 * Written by test-writer from the spec only.
 *
 * Scope: only what the foundation delivers on today's pages (tokens, motion, focus ring, dark theme).
 * Cases that need the adopted PO list/detail (doc-number links, one h1, status badges, PO-to-detail
 * navigation) belong to BR-DS-17/19/22 of sub-feature po-adoption and live in that sub-feature's e2e.
 * Also not covered: BR-DS-13 (count-up) - no page hosts a StatCard yet; first paint is a unit test.
 *
 * Login: once per worker (worker-scoped fixture), session reused via storage state. Logging in per test
 * trips the backend login rate limiter.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./support/auth";

/** A page that exists today and is behind login. Foundation-level checks only. */
async function openPage(page: Page) {
	await page.goto("/purchase-requisitions");
	await expect(page).toHaveURL(/\/purchase-requisitions/);
	await expect(page.getByRole("main")).toBeVisible({ timeout: 15_000 });
	await page.waitForLoadState("networkidle");
}

const MOTION_TOKENS_MS = {
	"--motion-fast": 120,
	"--motion-base": 180,
	"--motion-slow": 260,
	"--motion-emphasis": 600,
	"--motion-skeleton": 1400,
} as const;

const readToken = (page: Page, name: string) =>
	page.evaluate(
		(n) =>
			getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
		name,
	);

/** "120ms", ".12s", "0.12s", "0" -> milliseconds. The spec fixes the duration, not its spelling. */
function toMs(value: string): number {
	const m = /^(-?\d*\.?\d+)(ms|s)?$/.exec(value.trim());
	if (!m) throw new Error(`not a duration: "${value}"`);
	const n = Number.parseFloat(m[1]);
	return m[2] === "s" ? Math.round(n * 1000) : n;
}

test.describe("BR-DS-10 nothing on the never-list ships", () => {
	test("BR-DS-10 the motion tokens have the spec durations", async ({
		page,
	}) => {
		await openPage(page);
		for (const [name, ms] of Object.entries(MOTION_TOKENS_MS)) {
			expect(toMs(await readToken(page, name))).toBe(ms);
		}
	});

	test("BR-DS-10 no element loops an animation (skeleton excepted) or uses a delay", async ({
		page,
	}) => {
		await openPage(page);
		const offenders = await page.evaluate(() => {
			const bad: string[] = [];
			for (const el of Array.from(document.querySelectorAll("*"))) {
				const cs = getComputedStyle(el);
				const describe = `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 60)}`;
				if (
					cs.animationName !== "none" &&
					!/skeleton/.test(cs.animationName) &&
					cs.animationIterationCount.includes("infinite")
				) {
					bad.push(`loop: ${describe} ${cs.animationName}`);
				}
				const delays = `${cs.transitionDelay},${cs.animationDelay}`
					.split(",")
					.map((d) => d.trim());
				if (delays.some((d) => d !== "0s"))
					bad.push(`delay: ${describe} ${delays.join("|")}`);
			}
			return bad;
		});
		expect(offenders).toEqual([]);
	});

	test("BR-DS-10 a page navigation starts no running animation on the loaded content", async ({
		page,
	}) => {
		await openPage(page);
		await page.goto("/landing");
		await page.waitForLoadState("networkidle");
		const running = await page.evaluate(() =>
			document
				.getAnimations()
				.filter((a) => a.playState === "running")
				.map(
					(a) =>
						(a as CSSAnimation).animationName ??
						(a as CSSTransition).transitionProperty ??
						"?",
				),
		);
		// Only skeleton sweeps (while loading) may run; the page is loaded by now.
		expect(running.filter((n) => !/skeleton/.test(String(n)))).toEqual([]);
	});
});

test.describe("BR-DS-11 reduced motion", () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
	});

	test("BR-DS-11 all five duration tokens are 0 ms", async ({ page }) => {
		await openPage(page);
		for (const name of Object.keys(MOTION_TOKENS_MS)) {
			expect(toMs(await readToken(page, name))).toBe(0);
		}
	});

	test("BR-DS-11 no element has a non-zero transition or animation duration", async ({
		page,
	}) => {
		await openPage(page);
		const offenders = await page.evaluate(() => {
			const bad: string[] = [];
			const zero = (v: string) =>
				v.split(",").every((d) => Number.parseFloat(d) === 0);
			for (const el of Array.from(document.querySelectorAll("*"))) {
				const cs = getComputedStyle(el);
				if (!zero(cs.transitionDuration) || !zero(cs.animationDuration)) {
					bad.push(
						`${el.tagName.toLowerCase()} t=${cs.transitionDuration} a=${cs.animationDuration}`,
					);
				}
			}
			return bad;
		});
		expect(offenders).toEqual([]);
	});

	test("BR-DS-11 a dialog appears at once (no running animation right after it opens)", async ({
		page,
	}) => {
		await openPage(page);
		const trigger = page
			.getByRole("button", { name: /^(new|create|add)\b/i })
			.first();
		test.skip((await trigger.count()) === 0, "no dialog trigger on this page");
		await trigger.click();
		const dialog = page.getByRole("dialog");
		test.skip((await dialog.count()) === 0, "trigger did not open a dialog");
		await expect(dialog).toBeVisible();
		const running = await page.evaluate(
			() =>
				document
					.getAnimations()
					.filter(
						(a) =>
							a.playState === "running" &&
							Number(a.effect?.getComputedTiming().duration ?? 0) > 0,
					).length,
		);
		expect(running).toBe(0);
	});
});

test.describe("BR-DS-15 light and dark", () => {
	test("BR-DS-15 dark mode changes the page background and text colour; none keeps its light value", async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme: "light" });
		await openPage(page);

		const sample = () =>
			page.evaluate(() => ({
				bg: getComputedStyle(document.body).backgroundColor,
				fg: getComputedStyle(document.body).color,
				main: getComputedStyle(document.querySelector("main") ?? document.body)
					.backgroundColor,
			}));

		const light = await sample();
		await page.screenshot({ path: "test-results/design-system-light.png" });

		await page.emulateMedia({ colorScheme: "dark" });
		await page.reload();
		await expect(page.getByRole("main")).toBeVisible({ timeout: 15_000 });
		await page.waitForLoadState("networkidle");
		await expect(page.locator("html")).toHaveClass(/\bdark\b/);
		const dark = await sample();
		await page.screenshot({ path: "test-results/design-system-dark.png" });

		expect(dark.bg).not.toBe(light.bg);
		expect(dark.fg).not.toBe(light.fg);
	});
});

test.describe("BR-DS-20 keyboard focus ring", () => {
	test("BR-DS-20 every keyboard-focused element shows a solid 2px ring, 2px offset, in --ring (--sidebar-ring in the sidebar)", async ({
		page,
	}) => {
		await openPage(page);

		const colours = await page.evaluate(() => {
			const resolve = (v: string) => {
				const probe = document.createElement("span");
				probe.style.color = `var(${v})`;
				document.body.appendChild(probe);
				const c = getComputedStyle(probe).color;
				probe.remove();
				return c;
			};
			return { ring: resolve("--ring"), sidebar: resolve("--sidebar-ring") };
		});
		expect(colours.ring).not.toBe("");

		const seen = new Set<string>();
		const bad: string[] = [];
		await page.locator("body").click({ position: { x: 1, y: 1 } });
		for (let i = 0; i < 40; i++) {
			await page.keyboard.press("Tab");
			const info = await page.evaluate(() => {
				const el = document.activeElement as HTMLElement | null;
				if (!el || el === document.body) return null;
				// Next.js dev overlay is tooling, not app UI.
				if (el.closest("nextjs-portal") !== null) return null;
				const cs = getComputedStyle(el);
				return {
					id: `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}`,
					inSidebar: el.closest('[data-sidebar="sidebar"]') !== null,
					style: cs.outlineStyle,
					width: cs.outlineWidth,
					offset: cs.outlineOffset,
					color: cs.outlineColor,
					shadow: cs.boxShadow,
				};
			});
			if (!info) continue;
			seen.add(info.id);
			const want = info.inSidebar ? colours.sidebar : colours.ring;
			if (info.style !== "solid")
				bad.push(`${info.id}: outline-style ${info.style}`);
			if (info.width !== "2px")
				bad.push(`${info.id}: outline-width ${info.width}`);
			if (info.offset !== "2px")
				bad.push(`${info.id}: outline-offset ${info.offset}`);
			if (info.color !== want)
				bad.push(`${info.id}: outline-color ${info.color} != ${want}`);
			if (info.shadow.includes(want))
				bad.push(`${info.id}: ring drawn as box-shadow`);
		}
		expect(seen.size).toBeGreaterThanOrEqual(5);
		expect(bad).toEqual([]);
	});
});
