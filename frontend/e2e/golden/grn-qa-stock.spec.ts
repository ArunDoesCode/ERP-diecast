/**
 * api-standards spec, Tooling T-5, path (3): GRN -> QA -> stock.
 * A dispatched PO of 1000 kg. Back office records a GRN for 400, the QA inspector accepts it: the stock
 * view shows 400 at the main store and the PO is partly received. A second GRN for 600 completes it.
 * PO, PR and catalog are prepared through the API.
 */
import { expect, test } from "@playwright/test";
import {
	dispatchedPo,
	makeCatalog,
	openGrnOfPo,
	qaDecideOnScreen,
	receiveGoodsOnScreen,
	stockRowOnScreen,
	tokens,
	uiLogin,
} from "../support/golden";

test("T-5 (3) GRN accepted by QA puts the qty in the main store and moves the PO to partly, then fully received", async ({
	page,
	browser,
}) => {
	test.setTimeout(120_000);
	const t = await tokens("admin", "owner", "back_office");
	const cat = await makeCatalog(t.admin);
	const po = await dispatchedPo(t, cat, 1000);

	await uiLogin(page, "back_office");
	const qaCtx = await browser.newContext();
	const qa = await qaCtx.newPage();
	await uiLogin(qa, "qa_inspector");

	// First lot: 400 arrive, QA accepts.
	await receiveGoodsOnScreen(page, po.prId, `${po.poNumber}-A`, 400);
	await openGrnOfPo(qa, po.poNumber);
	await qaDecideOnScreen(qa, 400);

	let row = await stockRowOnScreen(page, cat.itemSku);
	await expect(row).toContainText("400 kg");
	await expect(row).toContainText(`${cat.mainStoreName}: 400 kg`);
	await page.goto(`/purchase-orders/${po.prId}`);
	await expect(
		page.getByText(/partly received|partial received/i).first(),
	).toBeVisible();

	// Second lot: the remaining 600, QA accepts: fully received.
	await receiveGoodsOnScreen(page, po.prId, `${po.poNumber}-B`, 600);
	await qa.goto("/grn");
	await qa
		.getByRole("row")
		.filter({ hasText: po.poNumber })
		.filter({ hasText: "Draft" })
		.getByText(/^GRN-/)
		.first()
		.click();
	await qaDecideOnScreen(qa, 600);

	row = await stockRowOnScreen(page, cat.itemSku);
	await expect(row).toContainText(`${cat.mainStoreName}: 1000 kg`);
	await page.goto(`/purchase-orders/${po.prId}`);
	await expect(page.getByText(/fully received/i).first()).toBeVisible();
	await qaCtx.close();
});
