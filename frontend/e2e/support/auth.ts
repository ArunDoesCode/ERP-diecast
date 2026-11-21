/**
 * Shared login for the design-system e2e specs (TEST-13).
 * BR-AUTH-30: the access token lives in memory and every page load uses up the single-use refresh
 * cookie, so a saved session goes stale at once. Each test logs in on its own (retries with a pause).
 */
import {
	type Browser,
	type BrowserContext,
	test as base,
} from "@playwright/test";

export const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@diecast.local";
export const PASSWORD =
	process.env.E2E_ADMIN_PASSWORD ?? process.env.SEED_USER_PASSWORD ?? "";
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export type AuthState = Awaited<ReturnType<BrowserContext["storageState"]>>;

async function loginOnce(browser: Browser): Promise<AuthState> {
	const context = await browser.newContext({ baseURL: BASE_URL });
	try {
		const page = await context.newPage();
		await page.goto("/login");
		await page.getByLabel("Email").fill(EMAIL);
		await page.getByLabel("Password").fill(PASSWORD);
		await page.getByRole("button", { name: "Sign in" }).click();
		await page.waitForURL("**/home", { timeout: 20_000 });
		return await context.storageState();
	} finally {
		await context.close();
	}
}

async function getAuthState(browser: Browser): Promise<AuthState> {
	if (!PASSWORD) {
		throw new Error(
			"Set E2E_ADMIN_PASSWORD (or SEED_USER_PASSWORD): the password of the seeded admin",
		);
	}
	let lastError: unknown;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			return await loginOnce(browser);
		} catch (e) {
			lastError = e;
			await new Promise((r) => setTimeout(r, attempt * 5_000));
		}
	}
	throw lastError;
}

/** `test` with a fresh admin login per test (BR-AUTH-30: single-use refresh cookie, token in memory). */
export const test = base.extend<{ storageState: AuthState }>({
	storageState: async ({ browser }, use) => {
		await use(await getAuthState(browser));
	},
});
