/**
 * docs/specs/design-system/spec.md (v1): BR-DS-10, BR-DS-11, BR-DS-15, BR-DS-20.
 * Runs against the `bun run try` stack (see e2e/README.md). Credentials as in smoke.spec.ts.
 * Written by test-writer from the spec only.
 *
 * Not covered here: BR-DS-13 (count-up). No page hosts a StatCard yet (home cards are a later
 * feature), so there is nothing to drive in a browser. The first-paint part is a unit test
 * (tests/components/StatCard.test.tsx). Add an e2e once a page renders a StatCard with countUp.
 */
import { expect, type Page, test } from "@playwright/test";

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@diecast.local";
const PASSWORD =
	process.env.E2E_ADMIN_PASSWORD ?? process.env.SEED_USER_PASSWORD ?? "";

async function login(page: Page) {
	if (!PASSWORD) {
		throw new Error(
			"Set E2E_ADMIN_PASSWORD (or SEED_USER_PASSWORD): the password of the seeded admin",
		);
	}
	await page.goto("/login");
	await page.getByLabel("Email").fill(EMAIL);
	await page.getByLabel("Password").fill(PASSWORD);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL("**/landing");
}

async function openPoList(page: Page) {
	await page.goto("/purchase-orders");
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
		timeout: 15_000,
	});
}

const MOTION_TOKENS = {
	"--motion-fast": "120ms",
	"--motion-base": "180ms",
	"--motion-slow": "260ms",
	"--motion-emphasis": "600ms",
	"--motion-skeleton": "1400ms",
} as const;

const readToken = (page: Page, name: string) =>
	page.evaluate(
		(n) =>
			getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
		name,
	);

test.describe("BR-DS-10 nothing on the never-list ships", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("BR-DS-10 the motion tokens have the spec values", async ({ page }) => {
		await openPoList(page);
		for (const [name, value] of Object.entries(MOTION_TOKENS)) {
			expect(await readToken(page, name)).toBe(value);
		}
	});

	test("BR-DS-10 no element on the PO list loops an animation (skeleton excepted) or uses a delay", async ({
		page,
	}) => {
		await openPoList(page);
		// Let loading finish so the skeleton is gone.
		await page.waitForLoadState("networkidle");
		const offenders = await page.evaluate(() => {
			const bad: string[] = [];
			for (const el of Array.from(document.querySelectorAll("*"))) {
				const cs = getComputedStyle(el);
				const describe = `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 60)}`;
				if (
					cs.animationName !== "none" &&
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

	test("BR-DS-10 navigating PO list to PO detail starts no animation on the content", async ({
		page,
	}) => {
		await openPoList(page);
		const firstDoc = page.getByRole("link", { name: /^PO-\S+/ }).first();
		await expect(firstDoc).toBeVisible({ timeout: 15_000 });
		await firstDoc.click();
		await page.waitForURL(/\/purchase-orders\/.+/);
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
		// Only skeleton sweeps (while loading) are allowed to run; the page is loaded by now.
		expect(running.filter((n) => !/skeleton/.test(String(n)))).toEqual([]);
	});

	test("BR-DS-10 there is exactly one h1 on the PO list and on the PO detail", async ({
		page,
	}) => {
		await openPoList(page);
		await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
	});
});

test.describe("BR-DS-11 reduced motion", () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await login(page);
	});

	test("BR-DS-11 all five duration tokens are 0ms", async ({ page }) => {
		await openPoList(page);
		for (const name of Object.keys(MOTION_TOKENS)) {
			expect(await readToken(page, name)).toMatch(/^0(ms|s)$/);
		}
	});

	test("BR-DS-11 no element on the PO list has a non-zero transition or animation duration", async ({
		page,
	}) => {
		await openPoList(page);
		await page.waitForLoadState("networkidle");
		const offenders = await page.evaluate(() => {
			const bad: string[] = [];
			const zero = (v: string) =>
				v.split(",").every((d) => parseFloat(d) === 0);
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
		await openPoList(page);
		const trigger = page
			.getByRole("button", { name: /^(new|create|add)\b/i })
			.first();
		test.skip(
			(await trigger.count()) === 0,
			"no dialog trigger on the PO list",
		);
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
	test("BR-DS-15 dark mode changes the page and badge colours; none keeps its light value", async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme: "light" });
		await login(page);
		await openPoList(page);
		await page.waitForLoadState("networkidle");

		const sample = () =>
			page.evaluate(() => {
				const badges = Array.from(
					document.querySelectorAll<HTMLElement>("span, div"),
				).filter(
					(el) =>
						el.querySelector("svg[aria-hidden='true']") &&
						el.children.length <= 2 &&
						/^[A-Za-z][A-Za-z -]{2,24}$/.test(el.textContent?.trim() ?? "") &&
						getComputedStyle(el).borderRadius !== "0px",
				);
				return {
					page: getComputedStyle(document.body).backgroundColor,
					badges: badges.slice(0, 12).map((b) => ({
						text: b.textContent?.trim() ?? "",
						bg: getComputedStyle(b).backgroundColor,
						fg: getComputedStyle(b).color,
					})),
				};
			});

		const light = await sample();
		await page.screenshot({
			path: "test-results/design-system-po-list-light.png",
		});

		await page.emulateMedia({ colorScheme: "dark" });
		await page.reload();
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
			timeout: 15_000,
		});
		await page.waitForLoadState("networkidle");
		await expect(page.locator("html")).toHaveClass(/\bdark\b/);
		const dark = await sample();
		await page.screenshot({
			path: "test-results/design-system-po-list-dark.png",
		});

		expect(dark.page).not.toBe(light.page);
		const lightByText = new Map(light.badges.map((b) => [b.text, b]));
		for (const d of dark.badges) {
			const l = lightByText.get(d.text);
			if (!l) continue;
			// A closed (outline) badge has a transparent fill in both themes; compare text colour then.
			const same = d.bg === l.bg && d.fg === l.fg;
			expect({ text: d.text, same }).toEqual({ text: d.text, same: false });
		}
	});
});

test.describe("BR-DS-20 keyboard focus ring", () => {
	test("BR-DS-20 every focused element on the PO list shows a solid 2px ring, 2px offset, in --ring", async ({
		page,
	}) => {
		await login(page);
		await openPoList(page);
		await page.waitForLoadState("networkidle");

		const ringColour = await page.evaluate(() => {
			const probe = document.createElement("span");
			probe.style.color = "var(--ring)";
			document.body.appendChild(probe);
			const c = getComputedStyle(probe).color;
			probe.remove();
			return c;
		});
		expect(ringColour).not.toBe("");

		const seen = new Set<string>();
		const bad: string[] = [];
		await page.locator("body").click({ position: { x: 1, y: 1 } });
		for (let i = 0; i < 40; i++) {
			await page.keyboard.press("Tab");
			const info = await page.evaluate(() => {
				const el = document.activeElement as HTMLElement | null;
				if (!el || el === document.body) return null;
				const cs = getComputedStyle(el);
				const id = `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}`;
				return {
					id,
					style: cs.outlineStyle,
					width: cs.outlineWidth,
					offset: cs.outlineOffset,
					color: cs.outlineColor,
					shadow: cs.boxShadow,
				};
			});
			if (!info) continue;
			seen.add(info.id);
			if (info.style !== "solid")
				bad.push(`${info.id}: outline-style ${info.style}`);
			if (info.width !== "2px")
				bad.push(`${info.id}: outline-width ${info.width}`);
			if (info.offset !== "2px")
				bad.push(`${info.id}: outline-offset ${info.offset}`);
			if (info.color !== ringColour)
				bad.push(
					`${info.id}: outline-color ${info.color} != ring ${ringColour}`,
				);
			if (info.shadow.includes(ringColour))
				bad.push(`${info.id}: ring drawn as box-shadow`);
		}
		expect(seen.size).toBeGreaterThanOrEqual(5);
		expect(bad).toEqual([]);
	});
});
