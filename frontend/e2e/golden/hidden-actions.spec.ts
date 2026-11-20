/**
 * api-standards spec, Tooling T-5, path (7): hidden actions (BR-AUTH-15, BR-DS-27).
 * A QA inspector sees no PO menu and no "New" button it lacks the key for, and a typed PO URL
 * redirects home. Back office (holds the keys) is the control: it does see them.
 */
import { expect, test } from "@playwright/test";
import { uiLogin } from "../support/golden";

test("T-5 (7) QA inspector sees no PO menu and no New SCO button; typed PO URL redirects home", async ({
	page,
	browser,
}) => {
	// Control: back office holds the keys.
	const boCtx = await browser.newContext();
	const bo = await boCtx.newPage();
	await uiLogin(bo, "back_office");
	await expect(bo.getByRole("link", { name: /^POs/ })).toBeVisible();
	await bo.getByRole("link", { name: "Subcontracting" }).first().click();
	await expect(
		bo
			.getByRole("group", { name: "Page actions" })
			.getByRole("link", { name: "New SCO" }),
	).toBeVisible();
	await boCtx.close();

	// QA inspector: the menu has no PO entry, the SCO list has no "New SCO".
	await uiLogin(page, "qa_inspector");
	const nav = page;
	await expect(nav.getByRole("link", { name: /^GRN/ })).toBeVisible();
	for (const hidden of [/^POs/, /^PRs/, /^Suppliers/, /^Inventory/]) {
		await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
	}
	await nav.getByRole("link", { name: "Subcontracting" }).click();
	await expect(page).toHaveURL(/\/subcontracting/);
	await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
	await expect(page.getByRole("link", { name: "New SCO" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: /^New/ })).toHaveCount(0);

	// A typed PO URL does not open the PO screen; the user is sent home (the landing page).
	await page.goto("/purchase-orders");
	await expect(page.getByText("Purchase orders", { exact: true })).toHaveCount(
		0,
	);
	await expect.soft(page).toHaveURL(/\/landing/);
});
