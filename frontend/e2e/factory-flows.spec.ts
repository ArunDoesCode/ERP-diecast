/**
 * docs/specs/factory-flows (v1, frozen) - UI paths, written from the spec (screens and rules), not from the code.
 * Data is prepared through the API with unique `E2EG<run>` names (support/golden.ts), so the file can be re-run on
 * a dirty database. Seeded `<role>@diecast.local` logins, as in the golden specs.
 * BR ids: BR-FF-04, 10, 12, 16, 44, 45, 49, 53, 60..64, 67, 82, 85, 100, 102.
 * Own sign-in step: after login the landing page is Home (`/home`, BR-FF-10), not `/landing`.
 */
import { expect, type Page, test } from "@playwright/test";
import {
	API_URL,
	api,
	dispatchedPo,
	emailOf,
	type Json,
	makeCatalog,
	type Role,
	SEED_PASSWORD,
	submittedPr,
	tokens,
	uid,
} from "./support/golden";

let ipSeq = 0;
const fakeIp = () =>
	`10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${++ipSeq % 250}`;

/** Sign in through the login screen; the first page after it is Home (BR-FF-10). */
async function signIn(page: Page, role: Role) {
	await page.route(`${API_URL}/auth/login`, (route) =>
		route.continue({
			headers: { ...route.request().headers(), "x-forwarded-for": fakeIp() },
		}),
	);
	await page.goto("/login");
	await page.getByLabel("Email").fill(emailOf(role));
	await page.getByLabel("Password").fill(SEED_PASSWORD);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL("**/home", { timeout: 20_000 });
}

const NO_ACCESS = /You do not have access to this document/i;

test.describe("Home and menu", () => {
	test("BR-FF-10 BR-FF-100 BR-FF-102 store keeper lands on Home; menu order; /landing redirects to /home", async ({
		page,
	}) => {
		await signIn(page, "floor_supervisor");
		await expect(page).toHaveURL(/\/home$/);
		const nav = page.getByRole("navigation").first();
		const texts = (await nav.getByRole("link").allInnerTexts()).map((t) =>
			t.replace(/\s+\d+\+?$/, "").trim(),
		);
		const want = [
			"Home",
			"Approvals",
			"Requisitions",
			"Goods receipts",
			"Subcontracting",
			"Inventory",
			"Suppliers",
		];
		const positions = want.map((w) => texts.findIndex((t) => t.startsWith(w)));
		expect(positions.every((p) => p >= 0)).toBe(true);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
		// BR-FF-45 / BR-FF-01: no PO entry without po.manage
		expect(texts.some((t) => t.startsWith("Purchase orders"))).toBe(false);

		await page.goto("/landing");
		await expect(page).toHaveURL(/\/home$/);
	});

	test("BR-FF-01 BR-FF-12 BR-FF-16 store keeper's tiles follow the keys; Goods expected opens the receive picker", async ({
		page,
	}) => {
		test.setTimeout(90_000);
		const t = await tokens("admin", "back_office", "owner");
		const cat = await makeCatalog(t.admin);
		const po = await dispatchedPo(t, cat, 40);

		await signIn(page, "floor_supervisor");
		await expect(page.getByText("Goods expected").first()).toBeVisible();
		// keys S does not hold -> tiles not rendered
		await expect(page.getByText("Orders to send")).toHaveCount(0);
		await expect(page.getByText("Receipts to inspect")).toHaveCount(0);
		// no money on Home (BR-FF-33)
		await expect(page.getByText("₹")).toHaveCount(0);

		await page.getByText("Goods expected").first().click();
		await expect(page).toHaveURL(/\/grn\/receive/);
		await expect(page.getByText(po.poNumber).first()).toBeVisible();
	});

	test("BR-FF-13 plant head: 'Waiting for my approval' is the first tile; clicking it opens the inbox", async ({
		page,
	}) => {
		await signIn(page, "owner");
		const first = page.getByText(
			/Waiting for my approval|Requisitions to finish/,
		);
		await expect(first.first()).toHaveText(/Waiting for my approval/);
		await page.getByText("Waiting for my approval").first().click();
		await expect(page).toHaveURL(/\/approvals/);
	});
});

test.describe("Receiving from the goods-receipt screen", () => {
	test("BR-FF-60 BR-FF-61 BR-FF-62 BR-FF-63 BR-FF-64 BR-FF-67 picker has no prices; Fill open quantity; saving opens the new GRN; QA gets Inspect, store keeper does not", async ({
		page,
		browser,
	}) => {
		test.setTimeout(150_000);
		const t = await tokens("admin", "back_office", "owner");
		const cat = await makeCatalog(t.admin);
		const po = await dispatchedPo(t, cat, 60);

		await signIn(page, "floor_supervisor");
		await page.goto("/grn");
		await page.getByRole("link", { name: "Receive goods" }).click();
		await expect(page).toHaveURL(/\/grn\/receive/);

		// BR-FF-63: narrow by supplier name
		await page
			.getByLabel("Search order number or supplier")
			.fill(cat.supplierName);
		const row = page.getByRole("listitem").filter({ hasText: po.poNumber });
		await expect(row).toBeVisible();
		await expect(row).toContainText(cat.supplierName);
		await expect(row).toContainText(cat.itemName);
		await expect(row).toContainText("60");
		// BR-FF-62: never a price
		await expect(row).not.toContainText("₹");

		await row
			.getByRole("link", { name: /Receive/ })
			.or(row.getByRole("button", { name: /Receive/ }))
			.first()
			.click();
		await expect(page).toHaveURL(/\/grn\/new\?po=\d+/);

		// BR-FF-64: arrived box starts empty; Fill open quantity fills it
		const arrived = page.getByRole("spinbutton").first();
		await expect(arrived).toHaveValue("");
		await page.getByRole("button", { name: "Fill open quantity" }).click();
		await expect(arrived).toHaveValue("60");

		// BR-FF-65: nothing arrived -> refused
		await arrived.fill("");
		await page
			.getByLabel(/Challan/i)
			.first()
			.fill(uid("-CH"));
		await page.getByRole("button", { name: "Save goods receipt" }).click();
		await expect(
			page.getByText("Enter at least one arrived quantity"),
		).toBeVisible();

		// BR-FF-66: above the open quantity warns, does not block
		await arrived.fill("70");
		await expect(page.getByText(/above the order/i)).toBeVisible();
		await arrived.fill("60");

		await page.getByRole("button", { name: "Save goods receipt" }).click();
		await expect(page).toHaveURL(/\/grn\/\d+$/, { timeout: 20_000 });
		await expect(page.getByText(/^GRN-/).first()).toBeVisible();
		await expect(page.getByText("Draft").first()).toBeVisible();
		// BR-FF-44: S holds no grn.qa_decide -> no Inspect
		await expect(page.getByRole("button", { name: "Inspect" })).toHaveCount(0);
		const grnUrl = page.url();

		// QA inspector sees Inspect and no PO link (BR-FF-03, 44)
		const qaCtx = await browser.newContext();
		const qa = await qaCtx.newPage();
		await signIn(qa, "qa_inspector");
		await qa.goto(grnUrl);
		await expect(
			qa.getByRole("button", { name: "Inspect" }).first(),
		).toBeVisible();
		await expect(qa.getByRole("link", { name: po.poNumber })).toHaveCount(0);
		await expect(qa.getByText(po.poNumber).first()).toBeVisible(); // plain text
		await qaCtx.close();
	});

	test("BR-FF-60 BR-FF-45 a QA inspector has no Receive goods button on the goods-receipt list", async ({
		page,
	}) => {
		await signIn(page, "qa_inspector");
		await page.goto("/grn");
		await expect(page.getByRole("link", { name: "Receive goods" })).toHaveCount(
			0,
		);
	});
});

test.describe("Document pages and access", () => {
	test("BR-FF-04 BR-FF-40 QA inspector typing a PO URL sees the access message and none of its data; a missing id is 'not found'", async ({
		page,
	}) => {
		test.setTimeout(90_000);
		const t = await tokens("admin", "back_office", "owner");
		const cat = await makeCatalog(t.admin);
		const po = await dispatchedPo(t, cat, 10);

		await signIn(page, "qa_inspector");
		await page.goto(`/purchase-orders/${po.poId}`);
		await expect(page.getByText(NO_ACCESS)).toBeVisible();
		await expect(page.getByText(cat.supplierName)).toHaveCount(0);
		await expect(page.getByText(po.poNumber)).toHaveCount(0);

		// back office: the PO page, then a missing id
		const ctx = await page.context().browser()!.newContext();
		const bo = await ctx.newPage();
		await signIn(bo, "back_office");
		await bo.goto(`/purchase-orders/${po.poId}`);
		await expect(bo.getByText(po.poNumber).first()).toBeVisible();
		await expect(bo.getByText(cat.supplierName).first()).toBeVisible();
		// BR-FF-44: dispatched, B has no grn.edit_draft? back_office holds it -> "Receive goods" is the primary button
		await expect(bo.getByRole("link", { name: "Receive goods" })).toBeVisible();
		await bo.goto("/purchase-orders/2147483000");
		await expect(bo.getByText(/Document not found/i)).toBeVisible();
		await ctx.close();
	});

	test("BR-FF-41 /purchase-orders/tracking redirects to the PO list", async ({
		page,
	}) => {
		await signIn(page, "back_office");
		await page.goto("/purchase-orders/tracking");
		await expect(page).toHaveURL(/\/purchase-orders\/?$/);
	});

	test("BR-FF-49 BR-FF-45 Create PO on an approved requisition asks for a supplier when there is no default; closing the dialog makes no PO", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const t = await tokens("admin", "back_office", "owner");
		const cat = await makeCatalog(t.admin);
		const pr = await submittedPr(t.back_office, cat.itemId, 25, uid(" PR"));

		await signIn(page, "back_office");
		await page.goto(`/purchase-requisitions/${pr.prId}`);
		// pending approval: the button is hidden, not disabled (BR-FF-45)
		await expect(page.getByRole("button", { name: "Create PO" })).toHaveCount(
			0,
		);

		await api(
			t.owner,
			"GET",
			"/approval/getCurrentApprovalByDoc/pr/" + pr.prId,
		).then(async (cur: Json) => {
			const requestId = cur.data.id ?? cur.data.request?.id;
			await api(t.owner, "POST", `/approval/actOnRequest/${requestId}`, {
				action: "approve",
				notes: "E2E factory flows",
			});
		});
		await page.reload();
		await page.getByRole("button", { name: "Create PO" }).click();
		const dlg = page.getByRole("dialog");
		await expect(dlg).toBeVisible();
		await expect(dlg).toContainText(cat.itemName);
		await page.keyboard.press("Escape");
		await expect(dlg).toBeHidden();

		const d: Json = await api(
			t.back_office,
			"GET",
			`/pr/getprdetails/${pr.prId}`,
		);
		expect(d.data.items.every((i: Json) => i.onPoId == null)).toBe(true);
	});
});

test.describe("Approvals inbox with preview", () => {
	test("BR-FF-80 BR-FF-81 BR-FF-82 BR-FF-85 owner previews a pending requisition, is refused an empty note, approves with a note; the row leaves", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const t = await tokens("admin", "back_office", "owner");
		const cat = await makeCatalog(t.admin);
		const pr = await submittedPr(t.back_office, cat.itemId, 30, uid(" PR"));

		await signIn(page, "owner");
		await page.goto("/approvals");
		await expect(page.getByText(/Requisition/).first()).toBeVisible();
		const row = page.getByRole("row").filter({ hasText: pr.prNumber });
		await expect(row).toBeVisible({ timeout: 15_000 });
		await expect(row).toContainText("1 of 1");

		await row.click();
		// BR-FF-81: lines, amount and the note box, then the act buttons
		await expect(page.getByText(cat.itemName).first()).toBeVisible();
		await expect(
			page.getByRole("link", { name: /Open full page/ }),
		).toBeVisible();
		const approve = page.getByRole("button", { name: "Approve", exact: true });
		await expect(approve).toBeVisible();
		await expect(page.getByRole("button", { name: "Send back" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();

		// BR-FF-82: empty note -> error at the box, still pending
		await approve.click();
		await expect(page.getByText("Note is required")).toBeVisible();
		await expect(row).toBeVisible();

		await page.getByLabel(/Note/i).fill("ok");
		await approve.click();
		await expect(row).toBeHidden({ timeout: 15_000 });
		const d: Json = await api(
			t.back_office,
			"GET",
			`/pr/getprdetails/${pr.prId}`,
		);
		expect(d.data.pr.status).toBe("approved");
	});

	test("BR-FF-86 BR-FF-85 a user with nothing waiting sees the empty message and no menu badge", async ({
		page,
	}) => {
		await signIn(page, "qa_inspector");
		await page.goto("/approvals");
		await expect(
			page.getByText("Nothing is waiting for your approval"),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: /^Approvals\s*\d/ }),
		).toHaveCount(0);
	});
});
