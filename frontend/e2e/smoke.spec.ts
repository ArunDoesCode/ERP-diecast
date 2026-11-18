/**
 * docs/specs/api-standards/spec.md (v1) T-4: Playwright smoke.
 * Log in as the seeded admin, open the purchase requisitions list, see at least one row.
 *
 * Runs against the `bun run try` stack (API :4000 + UI :3000) on the dev database with its demo data.
 * Credentials: E2E_ADMIN_EMAIL (default admin@diecast.local) and E2E_ADMIN_PASSWORD (or SEED_USER_PASSWORD,
 * the password given to `db:reset`). Written by test-writer from the spec only.
 */
import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@diecast.local";
const PASSWORD =
	process.env.E2E_ADMIN_PASSWORD ?? process.env.SEED_USER_PASSWORD ?? "";

test("T-4 seeded admin logs in and sees at least one purchase requisition row", async ({
	page,
}) => {
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

	await page.goto("/purchase-requisitions");
	await expect(page).toHaveURL(/\/purchase-requisitions/);
	await expect(page.locator("tbody tr").first()).toBeVisible({
		timeout: 15_000,
	});
	expect(await page.locator("tbody tr").count()).toBeGreaterThan(0);
});
