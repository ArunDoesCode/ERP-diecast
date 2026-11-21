/**
 * api-standards spec, Tooling T-5, path (6): stock-take and stock check (BR-INV-22, 29).
 * The owner posts a stock-take for a new item, the movement list shows the row, the stock check
 * shows "Stock agrees with the ledger".
 */
import { expect, test } from "@playwright/test";
import { makeCatalog, tokens, uiLogin } from "../support/golden";

test("T-5 (6) owner posts a stock-take; movement list shows it; stock check agrees with the ledger", async ({
	page,
}) => {
	const t = await tokens("admin");
	const cat = await makeCatalog(t.admin);

	await uiLogin(page, "owner");
	await page.goto("/inventory/movements");
	await page
		.getByRole("button", { name: "Stock-take / opening stock" })
		.click();
	const dialog = page.getByRole("dialog", { name: "Manual stock entry" });

	await dialog.getByText("Select item").click();
	await page.keyboard.type(cat.itemSku);
	await page.getByText(cat.itemName).click();
	await dialog.getByText("Select location").click();
	await page
		.locator('[data-slot="popover-content"]')
		.getByText(cat.mainStoreName, { exact: true })
		.click();
	await dialog.getByLabel("Counted quantity").fill("25");
	await dialog.getByLabel(/Cost per unit/).fill("100");
	await dialog.getByLabel("Reason").fill("E2E golden path stock-take");
	await dialog.getByRole("button", { name: "Post stock-take" }).click();
	await expect(dialog).toBeHidden();

	// The movement list shows the new row: stock-take, +25 at the main store.
	await page.getByText("Filter by item").click();
	await page.keyboard.type(cat.itemSku);
	// The new movement row also shows the name: pick it from the open list only.
	await page
		.locator('[data-slot="popover-content"]')
		.getByText(cat.itemName)
		.click();
	const row = page.getByRole("row").filter({ hasText: cat.itemName });
	await expect(row).toBeVisible();
	await expect(row).toContainText("Adjustment");
	await expect(row).toContainText("25");
	await expect(row).toContainText(cat.mainStoreName);

	// The stock check finds nothing wrong.
	await page.goto("/inventory/stock-check");
	await expect(page.getByText("Stock agrees with the ledger")).toBeVisible();
});
