/**
 * api-standards spec, Tooling T-5, path (5): SCO full cycle.
 * Back office creates an SCO and submits it, the floor supervisor approves it in the queue, back office
 * issues material on a challan and enters the receipt, QA decides, the order is closed: status `closed`,
 * vendor stock 0. Vendor, items, service, vendor location and opening stock are prepared through the API.
 */
import { expect, test } from "@playwright/test";
import {
	approveInQueue,
	makeScoSetup,
	tokens,
	uiLogin,
} from "../support/golden";

test("T-5 (5) SCO: create, approve, challan, receipt, QA, close: closed, vendor stock 0", async ({
	page,
	browser,
}) => {
	test.setTimeout(90_000);
	const t = await tokens("admin", "owner");
	const s = await makeScoSetup(t);

	// 1. Back office creates the SCO.
	await uiLogin(page, "back_office");
	await page.goto("/subcontracting/new");
	const pick = async (placeholder: string, search: string, text: string) => {
		await page.getByText(placeholder, { exact: true }).click();
		await page.keyboard.type(search);
		await page.locator('[data-slot="popover-content"]').getByText(text).click();
	};
	await pick("Select vendor", s.vendorName.slice(0, 14), s.vendorName);
	await pick("Select raw item", s.rawSku, s.rawName);
	await pick("Select finished item", s.finishedSku, s.finishedName);
	await page.getByLabel("Service").click();
	await page.getByRole("option", { name: s.serviceName }).click();
	const back = new Date(Date.now() + 20 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	await page.getByLabel("Expected return date").fill(back);
	await page.getByLabel("Send qty").fill("100");
	await page.getByLabel("Return qty").fill("100");
	await page.getByRole("button", { name: "Create draft" }).click();
	await expect(page).toHaveURL(/\/subcontracting\/\d+$/);
	await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
	const scoUrl = page.url();
	const scoNumber = (
		await page.getByRole("heading", { name: /^SCO-/ }).innerText()
	).trim();

	// 2. Submit; the floor supervisor approves in the approval queue.
	await page.getByRole("button", { name: "Submit for approval" }).click();
	await expect(page.getByText("Pending approval").first()).toBeVisible();
	const fsCtx = await browser.newContext();
	const fs = await fsCtx.newPage();
	await uiLogin(fs, "floor_supervisor");
	await approveInQueue(fs, scoNumber);
	await fsCtx.close();

	// 3. Back office issues the material on a challan.
	await page.reload();
	await expect(
		page.getByText("Approved", { exact: true }).first(),
	).toBeVisible();
	await page.getByRole("button", { name: "Issue material" }).click();
	const issue = page.getByRole("dialog", { name: /Issue material/ });
	await issue.getByLabel("E-way bill no.").fill(`EWB-${scoNumber}`);
	await issue.getByLabel(/^Qty/).fill("100");
	await issue.getByRole("button", { name: "Create challan" }).click();
	await expect(issue).toBeHidden();
	await expect(page.getByText("Material issued").first()).toBeVisible();
	await expect(page.getByText(/^JWC\//).first()).toBeVisible();

	// 4. The vendor returns all 100 processed pieces; back office enters the receipt.
	await page.getByRole("button", { name: "Enter receipt" }).click();
	const receipt = page.getByRole("dialog", { name: /Enter receipt/ });
	await receipt.getByLabel(/Vendor challan/).fill(`VC-${scoNumber}`);
	await receipt.getByLabel("Processed qty").fill("100");
	await receipt.getByRole("button", { name: "Save receipt" }).click();
	await expect(receipt).toBeHidden();

	// 5. QA accepts all 100.
	const qaCtx = await browser.newContext();
	const qa = await qaCtx.newPage();
	await uiLogin(qa, "qa_inspector");
	await qa.goto(scoUrl);
	await qa.getByRole("button", { name: "View" }).click();
	await qa.getByRole("button", { name: "QA decision" }).click();
	const qaDlg = qa.getByRole("dialog", { name: "QA decision" });
	await qaDlg.getByLabel(/Accepted/).fill("100");
	await qaDlg.getByLabel(/Rejected/).fill("0");
	await qaDlg.getByRole("button", { name: "Save decision" }).click();
	await expect(qaDlg).toBeHidden();
	await qaCtx.close();

	// 6. Close the order: closed, nothing left at the vendor.
	await page.reload();
	await page.getByRole("button", { name: "Close order" }).click();
	const close = page.getByRole("dialog", { name: /^Close SCO-/ });
	await close.getByRole("button", { name: "Close SCO" }).click();
	await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();

	// The vendor-stock report lists only what is still at a vendor: this vendor is gone from it.
	await page.goto("/subcontracting/reports");
	// Wait until the report has loaded: either the table or the empty state.
	await expect(
		page
			.getByRole("columnheader", { name: "Vendor" })
			.or(page.getByText("No material is at any vendor.")),
	).toBeVisible();
	await expect(page.getByText(s.vendorName)).toHaveCount(0);
});
