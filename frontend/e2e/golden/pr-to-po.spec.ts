/**
 * api-standards spec, Tooling T-5, path (2): PR -> approval -> PO.
 * Back office raises and submits a PR on the full-page form (BR-FF-111), the owner approves it in the
 * approvals inbox (BR-FF-77..82), back office makes a PO from the PR page (BR-FF-48), submits it, the owner
 * approves it, back office sends it: PO `dispatched`, PR line `ordered`. Only the catalog (item, supplier)
 * is prepared through the API.
 */
import { expect, test } from "@playwright/test";
import {
	api,
	approveInQueue,
	type Json,
	makeCatalog,
	tokens,
	uid,
	uiLogin,
} from "../support/golden";

test("T-5 (2) PR is raised, approved, ordered, approved and sent: PO dispatched, PR line ordered", async ({
	page,
	browser,
}) => {
	test.setTimeout(120_000);
	const t = await tokens("admin", "back_office");
	const cat = await makeCatalog(t.admin);
	const notes = uid(" PR notes");

	// 1. Back office raises the PR on its own page and submits it for approval.
	await uiLogin(page, "back_office");
	await page.goto("/purchase-requisitions");
	await page.getByRole("link", { name: "New requisition" }).first().click();
	await expect(page).toHaveURL(/\/purchase-requisitions\/new/);
	await page.getByLabel("PR type").selectOption("tooling");
	await page.getByPlaceholder("Add notes").fill(notes);
	await page.getByText("Select item").first().click();
	await page.keyboard.type(cat.itemSku);
	await page.getByText(cat.itemName).click();
	await page.getByLabel("Quantity").fill("500");
	await page.getByRole("button", { name: "Save and submit" }).click();

	// BR-FF-46: the saved requisition's own page opens, waiting for approval.
	await page.waitForURL(/\/purchase-requisitions\/\d+$/, { timeout: 20_000 });
	const prUrl = page.url();
	await expect(page.getByText("Pending approval").first()).toBeVisible();
	const prNumber = (
		await page
			.getByText(/^PR-\d{4}-\d{2}-\d+$/)
			.first()
			.innerText()
	).trim();

	// 2. The owner approves it in the approvals inbox (own login, own context).
	const ownerCtx = await browser.newContext();
	const ownerPage = await ownerCtx.newPage();
	await uiLogin(ownerPage, "owner");
	await approveInQueue(ownerPage, prNumber);
	await ownerCtx.close();

	// 3. Back office makes a PO from the approved PR page (BR-FF-48, 49).
	await page.goto(prUrl);
	await page.getByRole("button", { name: "Create PO", exact: true }).click();
	const dlg = page.getByRole("dialog", { name: "Create purchase order" });
	await Promise.race([
		page.waitForURL(/\/purchase-orders\/\d+$/, { timeout: 20_000 }),
		dlg.waitFor({ state: "visible", timeout: 20_000 }),
	]);
	if (await dlg.isVisible()) {
		// Only when a line has no default supplier or rate.
		await dlg.getByText("Select supplier").first().click();
		await page.keyboard.type(cat.supplierName.slice(0, 14));
		await page.getByText(cat.supplierName).click();
		const rate = dlg.getByLabel(/^Rate for/);
		if ((await rate.count()) > 0) await rate.first().fill("100");
		await dlg.getByRole("button", { name: "Create PO", exact: true }).click();
	}
	await page.waitForURL(/\/purchase-orders\/\d+$/, { timeout: 20_000 });
	const poUrl = page.url();
	await expect(page.getByText("Draft").first()).toBeVisible();
	await page.getByRole("button", { name: "Submit for approval" }).click();
	await expect(page.getByText("Pending approval").first()).toBeVisible();
	const poNumber = (
		await page
			.getByText(/^PO-\d{4}-\d{2}-\d+$/)
			.first()
			.innerText()
	).trim();

	// 4. The owner approves the PO.
	const ownerCtx2 = await browser.newContext();
	const ownerPage2 = await ownerCtx2.newPage();
	await uiLogin(ownerPage2, "owner");
	await approveInQueue(ownerPage2, poNumber);
	await ownerCtx2.close();

	// 5. Back office sends it: PO dispatched, PR line ordered.
	await page.goto(poUrl);
	await page.getByRole("button", { name: "Send to supplier" }).click();
	await page.getByLabel("Channel").click();
	await page.getByRole("option", { name: /whatsapp/i }).click();
	await page.getByRole("button", { name: "Mark as sent" }).click();
	await expect(page.getByText("Dispatched").first()).toBeVisible();
	await page.goto(prUrl);
	await expect(
		page.getByText("Ordered", { exact: true }).first(),
	).toBeVisible();

	// Same facts in the API.
	const pos: Json = await api(t.back_office, "GET", `/po/getpos?q=${poNumber}`);
	const row = (pos.data.rows ?? pos.data).find(
		(p: Json) => p.poNumber === poNumber,
	);
	expect(row.status).toBe("dispatched");
});
