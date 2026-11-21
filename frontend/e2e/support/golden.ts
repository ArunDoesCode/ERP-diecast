/**
 * Shared helpers for the golden-path specs (api-standards spec, T-5, issue #15).
 *
 * - `uiLogin` signs in through the login screen, one login per test (BR-AUTH-30: the access token lives
 *   in memory and the refresh cookie is single use, so no shared storage state).
 * - `api` talks to the backend directly with a token from `apiLogin`. Used only to prepare data
 *   (suppliers, items, documents) that a path needs before its first screen, with a unique
 *   `E2EG_<run>` prefix so the tests can be rerun on the same database.
 *
 * Users are the seeded `<role>@diecast.local` logins (db:reset with fixtures, as in CI) plus the admin.
 * Password: SEED_USER_PASSWORD (CI) or E2E_PASSWORD; locally `ci-seed-password-1`.
 */
import { expect, type Page } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:4000/api";
export const SEED_PASSWORD =
	process.env.SEED_USER_PASSWORD ??
	process.env.E2E_PASSWORD ??
	"ci-seed-password-1";

export type Role =
	| "admin"
	| "owner"
	| "back_office"
	| "floor_supervisor"
	| "qa_inspector";

export const emailOf = (role: Role) => `${role}@diecast.local`;

// biome-ignore lint/suspicious/noExplicitAny: API payloads are read loosely in test setup
export type Json = any;

/** One value per test run, so rows made by an earlier run never clash. */
export const RUN = Date.now().toString(36).toUpperCase();
let seq = 0;
/** Unique, upper-case, short text: `E2EG<run><n>` + suffix. */
export const uid = (suffix = "") => `E2EG${RUN}${++seq}${suffix}`;

/**
 * The login route allows 10 attempts per 15 minutes per client address (BR-AUTH, rate limiter keyed on
 * `x-forwarded-for`). A whole run signs in far more often than that, so every login here carries its own
 * made-up address and has its own bucket.
 */
let ipSeq = 0;
const fakeIp = () =>
	`10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${++ipSeq % 250}`;

export async function apiLogin(role: Role): Promise<string> {
	const res = await fetch(`${API_URL}/auth/login`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-forwarded-for": fakeIp(),
		},
		body: JSON.stringify({ email: emailOf(role), password: SEED_PASSWORD }),
	});
	if (!res.ok) throw new Error(`API login as ${role} -> ${res.status}`);
	const json = (await res.json()) as Json;
	return json.data.accessToken as string;
}

export async function api(
	token: string,
	method: string,
	path: string,
	body?: unknown,
	ok: number[] = [200, 201],
): Promise<Json> {
	const res = await fetch(`${API_URL}${path}`, {
		method,
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${token}`,
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const json = (await res.json().catch(() => null)) as Json;
	if (!ok.includes(res.status)) {
		throw new Error(
			`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`,
		);
	}
	return json;
}

/** Sign in through the login screen and wait for Home. */
export async function uiLogin(page: Page, role: Role) {
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

/** Tokens for the roles a path needs, logged in once per test through the API. */
export async function tokens<R extends Role>(...roles: R[]) {
	const out = {} as Record<R, string>;
	for (const r of roles) out[r] = await apiLogin(r);
	return out;
}

// ---------------------------------------------------------------- data builders (API)

export type Catalog = {
	itemId: number;
	itemSku: string;
	itemName: string;
	supplierId: number;
	supplierName: string;
	mainStoreId: number;
	mainStoreName: string;
};

/** The one main-store location (created if the database has none). */
export async function mainStore(
	admin: string,
): Promise<{ id: number; name: string }> {
	const list = await api(admin, "GET", "/asset/locations?pageSize=100");
	const rows: Json[] = list.data?.rows ?? list.data ?? [];
	const found = rows.find((l) => l.type === "main_store");
	if (found) return { id: found.id as number, name: found.name as string };
	const name = `${uid()} Main store`;
	const made = await api(admin, "POST", "/asset/locations", {
		name,
		type: "main_store",
	});
	return { id: made.data.id as number, name };
}

/** One raw-material item (kg, unit price 100 rupees) and one supplier with that item on its price list. */
export async function makeCatalog(admin: string): Promise<Catalog> {
	const itemSku = uid("-SKU");
	const itemName = `${uid()} Aluminium ingot`;
	const item = await api(admin, "POST", "/asset/items", {
		sku: itemSku,
		name: itemName,
		category: "Raw Material",
		uom: "kg",
		standardRatePaise: 10_000,
	});
	const itemId = item.data.id as number;
	const supplierName = `${uid()} Metals Pvt Ltd`;
	const sup = await api(admin, "POST", "/supplier/createSupplier", {
		name: supplierName,
		type: "raw_material",
		supplierItems: [
			{
				itemId,
				supplierUnitPricePaise: 10_000,
				taxPercentage: 0,
				leadTimeDays: 3,
				uom: "kg",
			},
		],
	});
	const supplierId = (sup.data.id ?? sup.data.supplier?.id) as number;
	const store = await mainStore(admin);
	return {
		itemId,
		itemSku,
		itemName,
		supplierId,
		supplierName,
		mainStoreId: store.id,
		mainStoreName: store.name,
	};
}

/** A `tooling` PR (owner is its only approver) with one line, submitted for approval. */
export async function submittedPr(
	token: string,
	itemId: number,
	qty: number,
	notes: string,
) {
	const res = await api(token, "POST", "/pr/createpr", {
		type: "tooling",
		notes,
		items: [{ itemId, requestedQty: qty }],
	});
	const prId = res.data.pr.id as number;
	const prNumber = res.data.pr.prNumber as string;
	await api(token, "POST", "/approval/submitRequest", {
		docType: "pr",
		docId: prId,
	});
	return { prId, prNumber, lineId: res.data.items[0].id as number };
}

/** Approve every pending approval request for one document, acting as whoever the chain asks for. */
export async function approveDoc(
	owner: string,
	docType: "pr" | "po" | "sco",
	docId: number,
) {
	const cur = await api(
		owner,
		"GET",
		`/approval/getCurrentApprovalByDoc/${docType}/${docId}`,
	);
	const requestId = (cur.data.id ?? cur.data.request?.id) as number;
	await api(owner, "POST", `/approval/actOnRequest/${requestId}`, {
		action: "approve",
		notes: "E2E golden path",
	});
}

/** An approved PR line made into a PO draft for the supplier (rate 100 rupees, GST 0). */
export async function draftPo(
	token: string,
	supplierId: number,
	prLineId: number,
) {
	const res = await api(token, "POST", "/po/createpo", {
		supplierId,
		expectedDeliveryDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
		lines: [{ prItemId: prLineId, unitPricePaise: 10_000, gstPercent: 0 }],
	});
	return {
		poId: res.data.po.id as number,
		poNumber: res.data.po.poNumber as string,
		poItemId: res.data.items[0].id as number,
	};
}

/** Full chain through the API: PR -> approved -> PO -> approved -> sent. Returns a dispatched PO. */
export async function dispatchedPo(
	t: { back_office: string; owner: string },
	cat: Catalog,
	qty: number,
) {
	const pr = await submittedPr(t.back_office, cat.itemId, qty, uid(" PR"));
	await approveDoc(t.owner, "pr", pr.prId);
	const po = await draftPo(t.back_office, cat.supplierId, pr.lineId);
	await api(t.back_office, "POST", "/approval/submitRequest", {
		docType: "po",
		docId: po.poId,
	});
	await approveDoc(t.owner, "po", po.poId);
	await api(t.back_office, "POST", `/po/${po.poId}/send`, {
		channel: "whatsapp",
	});
	return { ...pr, ...po };
}

/** Read the stock row of one item (the stock list API). */
export async function stockOf(token: string, sku: string): Promise<Json> {
	const res = await api(
		token,
		"GET",
		`/asset/inventory/stock?q=${encodeURIComponent(sku)}`,
	);
	const rows: Json[] = res.data?.rows ?? res.data ?? [];
	return rows.find((r) => r.sku === sku || r.itemSku === sku);
}

export async function expectNoErrorToast(page: Page) {
	await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
}

// ---------------------------------------------------------------- shared screen steps

/**
 * Receive goods the way the store keeper does (BR-FF-60, 63, 64, 67, 111): GRN list -> "Receive goods" ->
 * pick the order by number -> receive form -> "Save goods receipt" opens the new GRN page.
 * Returns the id of the new GRN.
 */
export async function receiveGoodsOnScreen(
	page: Page,
	poNumber: string,
	challanNo: string,
	qty: number,
): Promise<number> {
	await page.goto("/grn");
	await page.getByRole("link", { name: "Receive goods" }).first().click();
	await expect(page).toHaveURL(/\/grn\/receive/);
	await page.getByLabel("Search order number or supplier").fill(poNumber);
	const row = page
		.getByRole("listitem")
		.filter({ hasText: new RegExp(`${poNumber}(?!\\d)`) });
	await row.getByRole("link", { name: "Receive", exact: true }).click();
	await expect(page).toHaveURL(/\/grn\/new\?po=\d+/);
	await page.getByLabel("Challan number").fill(challanNo);
	await page.getByLabel("Arrived").first().fill(String(qty));
	await page.getByRole("button", { name: "Save goods receipt" }).click();
	await page.waitForURL(/\/grn\/\d+$/, { timeout: 20_000 });
	return Number(new URL(page.url()).pathname.split("/").pop());
}

/** Open the GRN of a PO from the GRN list (newest GRN of that PO) and return its number. */
export async function openGrnOfPo(page: Page, poNumber: string) {
	await page.goto("/grn");
	const link = page
		.getByRole("row")
		.filter({ hasText: poNumber })
		.getByText(/^GRN-/)
		.first();
	await expect(link).toBeVisible({ timeout: 15_000 });
	const grnNumber = (await link.innerText()).trim();
	await link.click();
	await expect(page).toHaveURL(/\/grn\/\d+/);
	return grnNumber;
}

/** On a GRN page: inspect (QA-decide) the first pending line (accepted + rejected = arrived). */
export async function qaDecideOnScreen(
	page: Page,
	accepted: number,
	rejected = 0,
	overrideReason?: string,
) {
	await page.getByRole("button", { name: "Inspect" }).first().click();
	const dlg = page.getByRole("dialog", { name: /QA decision/ });
	await dlg.getByLabel("Accepted qty").fill(String(accepted));
	await dlg.getByLabel("Rejected qty").fill(String(rejected));
	if (overrideReason) {
		await dlg.getByLabel("Over-receipt override reason").fill(overrideReason);
	}
	await dlg.getByRole("button", { name: "Submit decision" }).click();
	await expect(dlg).toBeHidden();
}

/** Stock view: the row of one SKU, found with the search box. */
export async function stockRowOnScreen(page: Page, sku: string) {
	await page.goto("/inventory/stock");
	await page.getByPlaceholder("SKU or item name").fill(sku);
	const row = page.getByRole("row").filter({ hasText: sku });
	await expect(row).toBeVisible({ timeout: 15_000 });
	return row;
}

// ---------------------------------------------------------------- subcontracting setup (API)

export type ScoSetup = {
	vendorId: number;
	vendorName: string;
	rawItemId: number;
	rawName: string;
	rawSku: string;
	finishedName: string;
	finishedSku: string;
	serviceName: string;
	serviceCode: string;
};

/**
 * A job-work vendor with one service (Rs 25 a piece, GST 18 %), its vendor-premise location, a raw item with
 * 500 pcs at the main store (opening stock) and a finished item. Also makes sure the company settings exist
 * (a challan prints them).
 */
export async function makeScoSetup(t: {
	admin: string;
	owner: string;
}): Promise<ScoSetup> {
	const mk = async (what: string) => {
		const sku = uid(`-${what}`);
		const name = `${uid()} ${what} casting`;
		const res = await api(t.admin, "POST", "/asset/items", {
			sku,
			name,
			category: "Raw Material",
			uom: "pcs",
			standardRatePaise: 12_000,
		});
		// The job-work challan needs an HSN code on the raw item (BR-SCO-09).
		await api(t.admin, "PATCH", `/asset/items/${res.data.id}`, {
			hsnCode: "76169990",
		});
		return { id: res.data.id as number, sku, name };
	};
	const raw = await mk("RAW");
	const fin = await mk("FIN");

	const vendorName = `${uid()} Sai CNC Works`;
	const vendor = await api(t.admin, "POST", "/supplier/createSupplier", {
		name: vendorName,
		type: "service_provider",
	});
	const vendorId = (vendor.data.id ?? vendor.data.supplier?.id) as number;

	const serviceCode = uid("-CNC");
	const serviceName = `${uid()} CNC machining`;
	const svc = await api(t.admin, "POST", "/asset/services", {
		code: serviceCode,
		name: serviceName,
		defaultUom: "pcs",
	});
	await api(t.admin, "POST", `/supplier/${vendorId}/createService`, {
		serviceId: svc.data.id,
		serviceUnitPricePaise: 2_500,
		taxPercentage: 18,
		leadTimeDays: 2,
	});

	await api(t.admin, "POST", "/asset/locations", {
		name: `${uid()} ${vendorName} premises`,
		type: "vendor_premise",
		isVirtual: true,
		linkedVendorId: vendorId,
	});

	const store = await mainStore(t.admin);
	await api(t.owner, "POST", "/asset/inventory/movements", {
		itemId: raw.id,
		locationId: store.id,
		referenceType: "opening_stock",
		qty: 500,
		unitCostPaise: 12_000,
		reason: "E2E golden path opening stock",
	});

	const company = await fetch(`${API_URL}/company/settings`, {
		headers: { authorization: `Bearer ${t.admin}` },
	});
	const body = (await company.json().catch(() => null)) as Json;
	if (!body?.data?.gstin) {
		await api(t.admin, "PATCH", "/company/settings", {
			name: "E2E Diecast Pvt Ltd",
			address: "Plot 12, GIDC, Rajkot",
			gstin: "24AAACF1234K1Z5",
			stateCode: "24",
		});
	}
	return {
		vendorId,
		vendorName,
		rawItemId: raw.id,
		rawName: raw.name,
		rawSku: raw.sku,
		finishedName: fin.name,
		finishedSku: fin.sku,
		serviceName,
		serviceCode,
	};
}

// ---------------------------------------------------------------- approval queue

/**
 * Approvals inbox (BR-FF-77..82): the signed-in approver opens the row of one document number, types the
 * required note in the preview pane and approves; the row leaves the list.
 */
export async function approveInQueue(ownerPage: Page, docNumber: string) {
	await ownerPage.goto("/approvals");
	const rowLink = ownerPage.getByRole("button", {
		name: docNumber,
		exact: true,
	});
	await expect(rowLink).toBeVisible({ timeout: 15_000 });
	await rowLink.click();
	const pane = ownerPage.getByRole("complementary", {
		name: `Preview of ${docNumber}`,
	});
	await pane
		.getByLabel("Note (required)")
		.fill("Approved in the e2e golden path");
	await pane.getByRole("button", { name: "Approve", exact: true }).click();
	await expect(rowLink).toBeHidden({ timeout: 15_000 });
}
