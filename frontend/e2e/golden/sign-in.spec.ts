/**
 * api-standards spec, Tooling T-5, path (1): sign-in. Log in, a reload keeps the user signed in
 * (BR-AUTH-30), log out lands on the login page.
 */
import { expect, test } from "@playwright/test";
import { uiLogin } from "../support/golden";

test("T-5 (1) sign in, stay signed in after a reload, log out to the login page", async ({
	page,
}) => {
	await uiLogin(page, "back_office");
	await expect(page).toHaveURL(/\/landing/);
	await expect(page.getByText("Fixture back_office").first()).toBeVisible();

	await page.reload();
	await expect(page).toHaveURL(/\/landing/);
	await expect(page.getByText("Fixture back_office").first()).toBeVisible();

	await page.getByText("Fixture back_office").first().click();
	await page.getByRole("menuitem", { name: "Logout" }).click();
	await expect(page).toHaveURL(/\/login/);
	await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

	// Signed out for real: a protected page sends the visitor back to the login page.
	await page.goto("/purchase-requisitions");
	await expect(page).toHaveURL(/\/login/);
});
