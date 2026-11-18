/**
 * Shared login for the design-system e2e specs (TEST-13).
 * One saved session file for the whole run: every worker (and every worker restarted after a failure)
 * reuses it instead of logging in again, so one failed test cannot cascade into login rate-limit
 * timeouts. If a login is needed it retries with a pause. Written by test-writer.
 */
import { createHash } from "node:crypto";
import {
	existsSync,
	readFileSync,
	renameSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const MAX_AGE_MS = 10 * 60 * 1000;
const STATE_FILE = join(
	tmpdir(),
	`diecast-e2e-auth-${createHash("sha1").update(`${BASE_URL}|${EMAIL}`).digest("hex").slice(0, 12)}.json`,
);

function readCached(): AuthState | null {
	try {
		if (!existsSync(STATE_FILE)) return null;
		if (Date.now() - statSync(STATE_FILE).mtimeMs > MAX_AGE_MS) return null;
		return JSON.parse(readFileSync(STATE_FILE, "utf8")) as AuthState;
	} catch {
		return null;
	}
}

async function loginOnce(browser: Browser): Promise<AuthState> {
	const context = await browser.newContext({ baseURL: BASE_URL });
	try {
		const page = await context.newPage();
		await page.goto("/login");
		await page.getByLabel("Email").fill(EMAIL);
		await page.getByLabel("Password").fill(PASSWORD);
		await page.getByRole("button", { name: "Sign in" }).click();
		await page.waitForURL("**/landing", { timeout: 20_000 });
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
	const cached = readCached();
	if (cached) return cached;
	let lastError: unknown;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const state = await loginOnce(browser);
			const tmp = `${STATE_FILE}.${process.pid}.tmp`;
			writeFileSync(tmp, JSON.stringify(state));
			renameSync(tmp, STATE_FILE);
			return state;
		} catch (e) {
			lastError = e;
			// Another worker may have saved a session meanwhile.
			const other = readCached();
			if (other) return other;
			await new Promise((r) => setTimeout(r, attempt * 5_000));
		}
	}
	throw lastError;
}

/** `test` with the admin session preloaded (login once per run, shared across workers). */
export const test = base.extend<
	{ storageState: AuthState },
	{ authState: AuthState }
>({
	authState: [
		async ({ browser }, use) => {
			await use(await getAuthState(browser));
		},
		{ scope: "worker" },
	],
	storageState: async ({ authState }, use) => {
		await use(authState);
	},
});
