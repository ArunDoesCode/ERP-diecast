/**
 * api-standards spec, Tooling T-5, path (2): PR -> approval -> PO.
 * Back office raises and submits a PR on screen, the owner approves it in the approval queue, back office
 * makes a PO from the PR line, submits it, the owner approves it, back office sends it: PO `dispatched`,
 * PR line `ordered`. Only the catalog (item, supplier) is prepared through the API.
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

	// 1. Back office raises the PR and submits it for approval.
	await uiLogin(page, "back_office");
	await page.goto("/purchase-requisitions");
	await page.getByRole("button", { name: "Create PR" }).first().click();
	await page.getByLabel("PR type").selectOption("tooling");
	await page.getByPlaceholder("Add notes").fill(notes);
	await page.getByRole("button", { name: "Next", exact: true }).click();
	await page.getByText("Select item").first().click();
	await page.keyboard.type(cat.itemSku);
	await page.getByText(cat.itemName).click();
	await page.getByLabel("Qty").fill("500");
	await page
		.getByRole("button", { name: "Create PR", exact: true })
		.last()
		.click();
	await expect(page.getByText("PR created")).toBeVisible();

	await page.getByPlaceholder("Search PR number or notes").fill(notes);
	const prLink = page.getByText(/^PR-\d{4}-\d{2}-\d+$/).first();
	await expect(prLink).toBeVisible();
	const prNumber = (await prLink.innerText()).trim();
	await prLink.click();
	const editor = page.getByRole("dialog", {
		name: "Edit purchase requisition",
	});
	await editor.getByRole("button", { name: "Next", exact: true }).click();
	await editor.getByRole("button", { name: "Submit for approval" }).click();
	await expect(editor).toBeHidden();
	await expect(page.getByText("Pending approval").first()).toBeVisible();

	// 2. The owner approves it in the approval queue (own login, own context).
	const ownerCtx = await browser.newContext();
	const ownerPage = await ownerCtx.newPage();
	await uiLogin(ownerPage, "owner");
	await approveInQueue(ownerPage, prNumber);
	await ownerCtx.close();

	// 3. Back office makes a PO from the approved PR line.
	await page.goto("/purchase-orders");
	await page.getByPlaceholder("Search PR number").fill(prNumber);
	await page.getByText(prNumber).first().click();
	await expect(page.getByText("1 pending line", { exact: true })).toBeVisible();
	await page.getByRole("radio").or(page.getByRole("checkbox")).first().check();
	await page.getByRole("button", { name: /Create PO/ }).click();
	await page.getByText("Select supplier").click();
	await page.keyboard.type(cat.supplierName.slice(0, 14));
	await page.getByText(cat.supplierName).click();
	const due = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
	await page.locator('input[type="date"]').fill(due);
	await page.getByRole("button", { name: /Create draft PO/ }).click();
	await expect(page.getByText(/PO-\S+ draft created/)).toBeVisible();
	await page.getByRole("button", { name: "Submit for approval" }).click();
	await expect(page.getByText("Pending approval").first()).toBeVisible();

	// The PO number is read from the PR page.
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
	await page.reload();
	await page.getByRole("button", { name: "Send to supplier" }).click();
	await page.getByLabel("Channel").click();
	await page.getByRole("option", { name: /whatsapp/i }).click();
	await page.getByRole("button", { name: "Mark as sent" }).click();
	await expect(page.getByText("Dispatched").first()).toBeVisible();
	await expect(page.getByText("Ordered").first()).toBeVisible();

	// Same facts in the API.
	const pos: Json = await api(t.back_office, "GET", `/po/getpos?q=${poNumber}`);
	const row = (pos.data.rows ?? pos.data).find(
		(p: Json) => p.poNumber === poNumber,
	);
	expect(row.status).toBe("dispatched");
});
