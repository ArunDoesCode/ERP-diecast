/**
 * api-standards spec, Tooling T-5, path (4): over-receipt and correction (BR-GRN-15, 47).
 * PO of 100 kg, 110 arrive (above 105 %). A QA inspector cannot accept it; back office is asked for a reason
 * and accepts. A correction of 10 then lowers the stock and the PO received qty.
 */
import { expect, test } from "@playwright/test";
import {
	api,
	dispatchedPo,
	type Json,
	makeCatalog,
	receiveGoodsOnScreen,
	stockRowOnScreen,
	tokens,
	uiLogin,
} from "../support/golden";

test("T-5 (4) accepting above 105 % asks for a reason; a correction lowers stock and PO received qty", async ({
	page,
	browser,
}) => {
	test.setTimeout(120_000);
	const t = await tokens("admin", "owner", "back_office");
	const cat = await makeCatalog(t.admin);
	const po = await dispatchedPo(t, cat, 100);

	await uiLogin(page, "back_office");
	const grnId = await receiveGoodsOnScreen(
		page,
		po.poNumber,
		`${po.poNumber}-OVER`,
		110,
	);

	// The QA inspector has no override right: the decision screen says so.
	const qaCtx = await browser.newContext();
	const qa = await qaCtx.newPage();
	await uiLogin(qa, "qa_inspector");
	await qa.goto(`/grn/${grnId}`);
	await qa.getByRole("button", { name: "Inspect" }).first().click();
	const qaDlg = qa.getByRole("dialog", { name: /QA decision/ });
	await qaDlg.getByLabel("Accepted qty").fill("110");
	await qaDlg.getByLabel("Rejected qty").fill("0");
	await expect(qaDlg.getByText(/exceeds 105%/)).toBeVisible();
	await expect(qaDlg.getByText(/cannot override/)).toBeVisible();
	await qaCtx.close();

	// Back office is asked for the reason: no reason, no submit.
	await page.goto(`/grn/${grnId}`);
	await page.getByRole("button", { name: "Inspect" }).first().click();
	const dlg = page.getByRole("dialog", { name: /QA decision/ });
	await dlg.getByLabel("Accepted qty").fill("110");
	await dlg.getByLabel("Rejected qty").fill("0");
	await expect(dlg.getByText(/exceeds 105%/)).toBeVisible();
	const submit = dlg.getByRole("button", { name: "Submit decision" });
	await expect(submit).toBeDisabled();
	await dlg
		.getByLabel("Over-receipt override reason")
		.fill("Supplier loaded extra, accepted by back office");
	await expect(submit).toBeEnabled();
	await submit.click();
	await expect(dlg).toBeHidden();

	let row = await stockRowOnScreen(page, cat.itemSku);
	await expect(row).toContainText(`${cat.mainStoreName}: 110 kg`);

	// Correction of 10: stock 100, PO received qty 100.
	await page.goto(`/grn/${grnId}`);
	await page
		.getByRole("button", { name: `More actions for ${cat.itemName}` })
		.click();
	await page.getByRole("menuitem", { name: "Correction" }).click();
	const fix = page.getByRole("alertdialog");
	await fix.getByLabel("Correction qty").fill("10");
	await fix.getByLabel("Reason").fill("Ten kg were short-weighed");
	await fix.getByRole("button", { name: "Submit correction" }).click();
	await expect(fix).toBeHidden();
	await expect(page.getByText("10 corrected")).toBeVisible();

	row = await stockRowOnScreen(page, cat.itemSku);
	await expect(row).toContainText(`${cat.mainStoreName}: 100 kg`);
	const detail: Json = await api(
		t.back_office,
		"GET",
		`/po/getpodetails/${po.poId}`,
	);
	expect(Number(detail.data.items[0].receivedQty)).toBe(100);
});
