/**
 * SCM epic smoke (nine modules: bom, sale-order, reorder, purchase-returns, supplier-invoice, rfq +
 * rate contracts, stock-transfer, supplier-rating, dispatch).
 * Written from the module specs' screens sections (docs/specs/<module>/spec.md, BR-*-24 / -37 / -49 /
 * -60 next-step rules). Not a deep test: every new page opens with its heading and no console error,
 * plus one click path (sale order -> "Dispatch" action).
 *
 * Runs against the `bun run try` stack (API :4000 + UI :3000), seeded admin + owner logins, like the
 * golden-path specs. A part with a released BOM and a confirmed sale order are made through the API
 * with an `E2EG<run>` prefix so the run can be repeated on the same database.
 */
import { expect, type Page, test } from "@playwright/test";
import { api, type Json, tokens, uid, uiLogin } from "./support/golden";

const day = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

type Seed = {
	partId: number;
	partSku: string;
	soId: number;
	soNumber: string;
	customerPo: string;
};

/** A part with a released assembly BOM, and a confirmed sale order for it (10 pcs, open to dispatch). */
async function seed(): Promise<Seed> {
	const t = await tokens("admin", "owner");
	const mkItem = async (what: string, category: string) => {
		const sku = uid(`-${what}`);
		const res = await api(t.admin, "POST", "/asset/items", {
			sku,
			name: `${uid()} ${what}`,
			category,
			uom: "pcs",
			standardRatePaise: 10_000,
		});
		return { id: res.data.id as number, sku };
	};
	const part = await mkItem("PART", "Manufactured part");
	const component = await mkItem("COMP", "Raw Material");

	const bom = await api(t.admin, "POST", "/bom", {
		partId: part.id,
		kind: "assembly",
		lines: [{ componentItemId: component.id, qtyPerPiece: 2, buyAsIs: false }],
	});
	const bomId = bom.data.id as number;
	const detail: Json = await api(t.owner, "GET", `/bom/${bomId}`);
	await api(t.owner, "POST", `/bom/${bomId}/release`, {
		version: detail.data.version,
	});

	const customer = await api(t.admin, "POST", "/customers", {
		name: `${uid()} Rane Brakes`,
		stateCode: "27",
		address: "Plot 4, Rane Nagar",
	});
	const customerPo = uid("-PO");
	const so = await api(t.admin, "POST", "/sale-orders", {
		customerId: customer.data.id,
		orderDate: day(-1),
		customerPoNumber: customerPo,
		lines: [
			{
				itemId: part.id,
				qty: 10,
				unitPricePaise: 18_500,
				gstPercent: 18,
				deliveryDate: day(30),
			},
		],
	});
	await api(t.admin, "POST", `/sale-orders/${so.data.id}/confirm`, {
		editVersion: so.data.editVersion,
	});
	return {
		partId: part.id,
		partSku: part.sku,
		soId: so.data.id as number,
		soNumber: so.data.soNumber as string,
		customerPo,
	};
}

/** Collect console errors and server errors of one page; resource-load noise (favicon, 4xx) is ignored. */
function watch(page: Page) {
	const problems: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() !== "error") return;
		const text = msg.text();
		if (/Failed to load resource/i.test(text)) return;
		problems.push(`console: ${text}`);
	});
	page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
	page.on("response", (res) => {
		if (res.status() >= 500) problems.push(`HTTP ${res.status()} ${res.url()}`);
	});
	return problems;
}

const LIST_PAGES: { path: string; heading: string }[] = [
	{ path: "/bom", heading: "Bills of materials" },
	{ path: "/sale-orders", heading: "Sale orders" },
	{ path: "/inventory/reorder", heading: "Reorder" },
	{ path: "/purchase-returns", heading: "Purchase returns" },
	{ path: "/supplier-invoices", heading: "Supplier invoices" },
	{ path: "/rfq", heading: "Requests for quotation" },
	{ path: "/rate-contracts", heading: "Rate contracts" },
	{ path: "/inventory/stock-transfers", heading: "Stock transfers" },
	{ path: "/supplier-ratings", heading: "Supplier rating" },
	{ path: "/delivery-notes/pending", heading: "Pending dispatch" },
	{ path: "/delivery-notes", heading: "Delivery notes" },
];

test("SCM: every new page opens with its heading and no console error (owner)", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const s = await seed();
	const problems = watch(page);
	await uiLogin(page, "owner");

	for (const p of LIST_PAGES) {
		await test.step(`${p.path} shows "${p.heading}"`, async () => {
			await page.goto(p.path);
			await expect(
				page.getByRole("heading", { level: 1, name: p.heading }),
			).toBeVisible({ timeout: 20_000 });
		});
	}

	await test.step("BOM part page shows the part and its revision (BR-BOM-24, 25)", async () => {
		await page.goto(`/bom/part/${s.partId}`);
		await expect(
			page.getByRole("heading", { level: 1, name: s.partSku }),
		).toBeVisible({ timeout: 20_000 });
	});

	await test.step("sale order detail shows its number", async () => {
		await page.goto(`/sale-orders/${s.soId}`);
		await expect(
			page.getByRole("heading", { level: 1, name: s.soNumber }),
		).toBeVisible({ timeout: 20_000 });
	});

	expect(problems, problems.join("\n")).toEqual([]);
});

test("BR-DSP-37 / BR-SO-49 open a confirmed sale order from the list: the Dispatch action is there and opens a new note", async ({
	page,
}) => {
	test.setTimeout(90_000);
	const s = await seed();
	await uiLogin(page, "owner");

	await page.goto("/sale-orders");
	await page.getByLabel("Search SO no. or customer PO").fill(s.customerPo);
	const link = page.getByRole("link", { name: s.soNumber });
	await expect(link).toBeVisible({ timeout: 20_000 });
	await link.click();

	await expect(page).toHaveURL(new RegExp(`/sale-orders/${s.soId}$`));
	await expect(
		page.getByRole("heading", { level: 1, name: s.soNumber }),
	).toBeVisible();
	// A confirmed order with open qty: "Dispatch" sits beside the order's own next step.
	await expect(
		page.getByRole("link", { name: "Dispatch", exact: true }),
	).toBeVisible();

	await page.getByRole("link", { name: "Dispatch", exact: true }).click();
	await expect(page).toHaveURL(
		new RegExp(`/delivery-notes/new\\?so=${s.soId}`),
	);
});
