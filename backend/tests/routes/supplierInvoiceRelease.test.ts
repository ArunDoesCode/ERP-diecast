/**
 * Supplier invoice: 3-way match, status flow, release, cancel (BR-SINV-19..27, 34, 35, 40, 41).
 * Real DB, full HTTP stack via createApp(). Fixtures are TEST_sinvrel_ prefixed and removed in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  grnCorrections,
  grnItems,
  grns,
  purchaseDebitNotes,
  purchaseOrderItems,
  purchaseOrders,
  purchaseReturnEvents,
  purchaseReturnItems,
  purchaseReturns,
  qaTests,
  supplierInvoiceHistory,
  supplierInvoiceLines,
  supplierInvoiceMismatches,
  supplierInvoices,
} from "../../src/db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import {
  companySettings,
  companySettingsHistory,
} from "../../src/db/schemas/04_company";
import { signAccessToken } from "../../src/lib/token";

const RUN = `TEST_sinvrel_${Date.now()}`;
const app = createApp();
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

// ---- actors: real employees with a seed role (the role is read from the row) ----
type Actor = { id: number; token: string };
const actorCache = new Map<string, Actor>();
const employeeIds: number[] = [];
async function actor(key: string, roleName: string): Promise<Actor> {
  const hit = actorCache.get(key);
  if (hit) return hit;
  const [r] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  if (!r) throw new Error(`seed role ${roleName} missing`);
  const [e] = await db
    .insert(employees)
    .values({ name: `${RUN}_${key}`, roleId: r.id, isActive: true })
    .returning({ id: employees.id });
  employeeIds.push(e!.id);
  const token = await signAccessToken({
    userId: e!.id,
    userName: `${RUN}_${key}`,
    role: roleName,
    allowedPages: [],
  });
  const a = { id: e!.id, token };
  actorCache.set(key, a);
  return a;
}
const ownerA = () => actor("ownerA", "owner");
const ownerB = () => actor("ownerB", "owner");
const bo = () => actor("bo", "back_office");
const superAdmin = () => actor("sa", "super-admin");
const floor = () => actor("fs", "floor_supervisor");

async function raw(
  method: string,
  url: string,
  who: Actor | null,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (who) headers.Authorization = `Bearer ${who.token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const sinv = (
  method: string,
  path: string,
  who: Actor | null,
  body?: unknown,
) => raw(method, `/api/supplier-invoice${path}`, who, body);
const grnApi = (method: string, path: string, who: Actor, body?: unknown) =>
  raw(method, `/api/grn${path}`, who, body);

// ---- dates (IST calendar days, built relative to now) ----
const istDay = (offsetDays = 0) =>
  new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400000)
    .toISOString()
    .slice(0, 10);

// ---- fixtures ----
const supplierIds: number[] = [];
const poIds: number[] = [];
const itemIds: number[] = [];
let mainStoreId = 0;
let createdMainStore = false;
let savedCompany: typeof companySettings.$inferSelect | undefined;

async function newSupplier(gst: string | null = `29${uid().slice(-12)}`) {
  const [s] = await db
    .insert(supplierMaster)
    .values({ name: uid(), gstNumber: gst, address: "Supplier Road, Mysuru" })
    .returning({ id: supplierMaster.id });
  supplierIds.push(s!.id);
  return s!.id;
}

async function ensureCompany(
  over: Partial<typeof companySettings.$inferInsert> = {},
) {
  await db.delete(companySettings);
  await db.insert(companySettings).values({
    name: `${RUN} Works`,
    address: "Plot 1, Peenya, Bengaluru",
    gstin: "29AAACD1234F1Z5",
    stateCode: "29",
    priceToleranceBp: 0,
    weightToleranceBp: 50,
    ...over,
  });
}

type L = {
  qty: number;
  accepted?: number;
  rejected?: number;
  uom?: string;
  price?: number;
  gst?: number;
  pending?: boolean;
};
type G = {
  poId: number;
  poNumber: string;
  poItemIds: number[];
  itemIds: number[];
  grnId: number;
  lineIds: number[];
  grnNumber: string;
  supplierId: number;
};

/** PO + GRN (via the API) + QA decisions; PO forced to `status` afterwards (default fully_received). */
async function mkGrn(
  lines: L[],
  opts: {
    supplier?: number;
    po?: Pick<G, "poId" | "poNumber" | "poItemIds" | "itemIds">;
    status?: string;
    terms?: number | null;
    poCreatedAt?: Date;
  } = {},
): Promise<G> {
  const sup = opts.supplier ?? (await newSupplier());
  let po = opts.po;
  if (!po) {
    const poNumber = uid();
    const [p] = await db
      .insert(purchaseOrders)
      .values({
        poNumber,
        supplierId: sup,
        status: "dispatched",
        paymentTermsDays: opts.terms === undefined ? 30 : opts.terms,
        createdAt: opts.poCreatedAt ?? new Date(Date.now() - 20 * 86400000),
        createdBy: (await ownerA()).id,
      })
      .returning({ id: purchaseOrders.id });
    poIds.push(p!.id);
    const poItemIds: number[] = [];
    const lineItemIds: number[] = [];
    for (const l of lines) {
      const [item] = await db
        .insert(itemMaster)
        .values({
          sku: uid(),
          name: `${RUN} item`,
          category: "Raw Material",
          uom: l.uom ?? "kg",
          hsnCode: "7601",
        })
        .returning({ id: itemMaster.id });
      itemIds.push(item!.id);
      lineItemIds.push(item!.id);
      const [pi] = await db
        .insert(purchaseOrderItems)
        .values({
          poId: p!.id,
          itemId: item!.id,
          qty: l.qty,
          receivedQty: 0,
          unitPricePaise: l.price ?? 24000,
          gstPercent: l.gst ?? 18,
          uom: l.uom ?? "kg",
        })
        .returning({ id: purchaseOrderItems.id });
      poItemIds.push(pi!.id);
    }
    po = { poId: p!.id, poNumber, poItemIds, itemIds: lineItemIds };
  }
  const r = await grnApi("POST", "/creategrn", await bo(), {
    poId: po.poId,
    challanNo: uid(),
    lines: lines.map((l, i) => ({
      poItemId: po!.poItemIds[i],
      arrivedQty: l.qty,
    })),
  });
  if (r.status !== 201)
    throw new Error(`fixture GRN: ${r.status} ${JSON.stringify(r.json)}`);
  const grnId = r.json.data.grn.id as number;
  const lineIds = (r.json.data.items as { id: number }[]).map((i) => i.id);
  for (const [i, l] of lines.entries()) {
    if (l.pending) continue;
    const q = await grnApi(
      "POST",
      `/${grnId}/lines/${lineIds[i]}/qa`,
      await bo(),
      {
        acceptedQty: l.accepted ?? l.qty - (l.rejected ?? 0),
        rejectedQty: l.rejected ?? 0,
        batchNumber: "H-881",
      },
    );
    if (q.status !== 200)
      throw new Error(`fixture QA: ${q.status} ${JSON.stringify(q.json)}`);
  }
  await setPoStatus(po.poId, opts.status ?? "fully_received");
  return {
    ...po,
    grnId,
    lineIds,
    grnNumber: r.json.data.grn.grnNumber,
    supplierId: sup,
  };
}
const setPoStatus = (id: number, status: string) =>
  db
    .update(purchaseOrders)
    .set({ status: status as any })
    .where(eq(purchaseOrders.id, id));
const poRow = async (id: number) =>
  (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)))[0]!;
const invRow = async (id: number) =>
  (
    await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, id))
  )[0];
const historyOf = (id: number) =>
  db
    .select()
    .from(supplierInvoiceHistory)
    .where(eq(supplierInvoiceHistory.invoiceId, id))
    .orderBy(supplierInvoiceHistory.id);
const ledgerCount = (ids: number[]) =>
  db
    .select()
    .from(inventoryLedger)
    .where(inArray(inventoryLedger.itemId, ids))
    .then((r) => r.length);

// ---- invoice payload builders ----
type Ln = {
  grnItemId: number;
  qty: number;
  ratePaise: number;
  gstPercent: number;
};
type Ch = {
  type: string;
  description?: string;
  taxablePaise: number;
  gstPercent: number;
};
const halfUp = (n: number, d: number) => Math.floor((n * 2 + d) / (2 * d));
/** printed figures that match what the system computes (same state => CGST + SGST). */
function printed(lines: Ln[], charges: Ch[] = [], interstate = false) {
  let taxable = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const parts = [
    ...lines.map((l) => ({
      t: Math.round(l.qty * l.ratePaise),
      g: l.gstPercent,
    })),
    ...charges.map((c) => ({ t: c.taxablePaise, g: c.gstPercent })),
  ];
  for (const p of parts) {
    taxable += p.t;
    const bp = Math.round(p.g * 100);
    if (interstate) igst += halfUp(p.t * bp, 10000);
    else {
      cgst += halfUp(p.t * bp, 20000);
      sgst += halfUp(p.t * bp, 20000);
    }
  }
  return {
    taxablePaise: taxable,
    cgstPaise: cgst,
    sgstPaise: sgst,
    igstPaise: igst,
    totalPaise: taxable + cgst + sgst + igst,
  };
}
let invSeq = 0;
const newNo = () =>
  `T${Date.now().toString(36).slice(-6).toUpperCase()}${++invSeq}`.slice(0, 16);

type Over = {
  lines?: Ln[];
  charges?: Ch[];
  printed?: Record<string, number>;
  [k: string]: unknown;
};
/** create body for a bill of `qty` kg of GRN line `idx` at PO rate / GST by default */
function payload(g: G, over: Over = {}, interstate = false) {
  const lines = over.lines ?? [
    { grnItemId: g.lineIds[0]!, qty: 980, ratePaise: 24000, gstPercent: 18 },
  ];
  const charges = over.charges;
  const { lines: _l, charges: _c, printed: pr, ...rest } = over;
  return {
    poId: g.poId,
    invoiceNumber: newNo(),
    invoiceDate: istDay(0),
    printed: { ...printed(lines, charges ?? [], interstate), ...(pr ?? {}) },
    lines,
    ...(charges ? { charges } : {}),
    ...rest,
  };
}
const create = (
  g: G,
  over: Over = {},
  who?: Actor | null,
  interstate = false,
) =>
  bo().then((b) =>
    sinv(
      "POST",
      "/createsupplierinvoice",
      who === undefined ? b : who,
      payload(g, over, interstate),
    ),
  );
async function mkDraft(g: G, over: Over = {}, who?: Actor, interstate = false) {
  const r = await create(g, over, who, interstate);
  if (r.status !== 201)
    throw new Error(`fixture invoice: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.data as Record<string, any>;
}
const submit = async (id: number, who?: Actor) =>
  sinv("POST", `/${id}/submit`, who ?? (await bo()), {});
const backToDraft = async (id: number, who?: Actor) =>
  sinv("POST", `/${id}/back-to-draft`, who ?? (await bo()), {});
const release = async (
  id: number,
  who?: Actor,
  reason = "agreed by phone with supplier",
) => sinv("POST", `/${id}/release`, who ?? (await ownerB()), { reason });
const cancel = async (id: number, reason = "wrong qty billed", who?: Actor) =>
  sinv("POST", `/${id}/cancel`, who ?? (await bo()), { reason });
const detail = async (id: number) =>
  (await sinv("GET", `/getsupplierinvoicedetails/${id}`, await ownerA())).json
    .data;
/** draft -> submit; returns the submitted detail */
async function mkSubmitted(
  g: G,
  over: Over = {},
  who?: Actor,
  interstate = false,
) {
  const d = await mkDraft(g, over, who, interstate);
  const s = await submit(d.id, who);
  if (s.status !== 200)
    throw new Error(`fixture submit: ${s.status} ${JSON.stringify(s.json)}`);
  return s.json.data as Record<string, any>;
}
const checks = (d: Record<string, any>) =>
  (d.mismatches as { check: string }[]).map((m) => m.check).sort();

beforeAll(async () => {
  await ownerA();
  const [main] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "main_store"))
    .limit(1);
  if (main) mainStoreId = main.id;
  else {
    const [loc] = await db
      .insert(locations)
      .values({ name: `${RUN}_main_store`, type: "main_store" })
      .returning({ id: locations.id });
    mainStoreId = loc!.id;
    createdMainStore = true;
  }
  [savedCompany] = await db.select().from(companySettings).limit(1);
  await ensureCompany();
});

afterAll(async () => {
  const invRows = poIds.length
    ? await db
        .select({ id: supplierInvoices.id })
        .from(supplierInvoices)
        .where(inArray(supplierInvoices.poId, poIds))
    : [];
  const invIds = invRows.map((i) => i.id);
  const proRows = poIds.length
    ? await db
        .select({ id: purchaseReturns.id })
        .from(purchaseReturns)
        .where(inArray(purchaseReturns.poId, poIds))
    : [];
  const proIds = proRows.map((p) => p.id);
  if (proIds.length) {
    await db
      .delete(purchaseDebitNotes)
      .where(inArray(purchaseDebitNotes.proId, proIds));
    await db
      .delete(purchaseReturnEvents)
      .where(inArray(purchaseReturnEvents.proId, proIds));
    await db
      .delete(purchaseReturnItems)
      .where(inArray(purchaseReturnItems.proId, proIds));
    await db.delete(purchaseReturns).where(inArray(purchaseReturns.id, proIds));
  }
  if (invIds.length) {
    await db
      .delete(supplierInvoiceHistory)
      .where(inArray(supplierInvoiceHistory.invoiceId, invIds));
    await db
      .delete(supplierInvoiceMismatches)
      .where(inArray(supplierInvoiceMismatches.invoiceId, invIds));
    await db
      .delete(supplierInvoiceLines)
      .where(inArray(supplierInvoiceLines.invoiceId, invIds));
    await db
      .delete(supplierInvoices)
      .where(inArray(supplierInvoices.id, invIds));
  }
  // history rows of deleted drafts keep invoice_id = null and our_number only: remove ours by actor
  if (employeeIds.length)
    await db
      .delete(supplierInvoiceHistory)
      .where(inArray(supplierInvoiceHistory.createdBy, employeeIds));
  const grnRows = poIds.length
    ? await db
        .select({ id: grns.id })
        .from(grns)
        .where(inArray(grns.poId, poIds))
    : [];
  const grnIds = grnRows.map((g) => g.id);
  const lineRows = grnIds.length
    ? await db
        .select({ id: grnItems.id })
        .from(grnItems)
        .where(inArray(grnItems.grnId, grnIds))
    : [];
  const lineIds = lineRows.map((l) => l.id);
  if (lineIds.length) {
    await db.delete(qaTests).where(inArray(qaTests.grnItemId, lineIds));
    await db
      .delete(grnCorrections)
      .where(inArray(grnCorrections.grnItemId, lineIds));
  }
  if (itemIds.length)
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, itemIds));
  if (lineIds.length)
    await db.delete(grnItems).where(inArray(grnItems.id, lineIds));
  if (grnIds.length) await db.delete(grns).where(inArray(grns.id, grnIds));
  if (poIds.length) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, poIds));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
  }
  if (itemIds.length)
    await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
  if (supplierIds.length)
    await db
      .delete(supplierMaster)
      .where(inArray(supplierMaster.id, supplierIds));
  if (createdMainStore)
    await db.delete(locations).where(eq(locations.id, mainStoreId));
  // Company row is a shared singleton: put back what was there.
  if (employeeIds.length)
    await db
      .delete(companySettingsHistory)
      .where(inArray(companySettingsHistory.createdBy, employeeIds));
  await db.delete(companySettings);
  if (savedCompany) await db.insert(companySettings).values(savedCompany);
  await db
    .update(documentNumberCounters)
    .set({ createdBy: null })
    .where(inArray(documentNumberCounters.createdBy, employeeIds));
  await db
    .update(documentNumberCounters)
    .set({ lastUpdatedBy: null })
    .where(inArray(documentNumberCounters.lastUpdatedBy, employeeIds));
  await db.delete(employees).where(inArray(employees.id, employeeIds));
});

const std = (over: Partial<L> = {}) =>
  mkGrn([{ qty: 1000, accepted: 980, rejected: 20, ...over }]);
const ln1 = (g: G, o: Partial<Ln> = {}): Ln[] => [
  {
    grnItemId: g.lineIds[0]!,
    qty: 980,
    ratePaise: 24000,
    gstPercent: 18,
    ...o,
  },
];
const withTol = async (over: Partial<typeof companySettings.$inferInsert>) =>
  ensureCompany(over);
const first = (d: Record<string, any>, check: string): Record<string, any> =>
  find(d, check)[0] ?? {};
const find = (d: Record<string, any>, check: string) =>
  (d.mismatches as Record<string, any>[]).filter((m) => m.check === check);
/** blocked bill: rate Rs 241 against PO Rs 240 */
const mkBlocked = (g: G, who?: Actor) =>
  mkSubmitted(g, { lines: ln1(g, { ratePaise: 24100 }) }, who);

describe("BR-SINV-23 submit result", () => {
  test("BR-SINV-23 a clean bill is approved with no mismatches and the tolerances used stored", async () => {
    await ensureCompany();
    const g = await std();
    const d = await mkSubmitted(g);
    expect(d.status).toBe("approved");
    expect(d.mismatches).toEqual([]);
    expect(d.tolerances).toEqual({ priceTolBpUsed: 0, weightTolBpUsed: 50 });
    expect(d.submittedBy).toBe((await bo()).id);
    expect(d.submittedAt).toBeTruthy();
  });
  test("BR-SINV-23 a bill outside tolerance is saved as blocked (200), with expected vs billed", async () => {
    const g = await std();
    const d = await mkDraft(g, { lines: ln1(g, { ratePaise: 24100 }) });
    const r = await submit(d.id);
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("blocked");
    const m = find(r.json.data, "price");
    expect(m).toHaveLength(1);
    expect(m[0]?.expected).toBe(24000);
    expect(m[0]?.billed).toBe(24100);
    expect(m[0]?.unit).toBe("paise");
    expect(m[0]?.lineId).toBe(r.json.data.lines[0].id);
  });
  test("BR-SINV-23 submit of a bill that is not a draft is 409", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    expect((await submit(d.id)).status).toBe(409);
  });
  test("BR-SINV-23 submit is a history row with the match result", async () => {
    const g = await std();
    const d = await mkBlocked(g);
    const sub = (await historyOf(d.id)).find((h) => h.action === "submit")!;
    expect(sub.fromStatus).toBe("draft");
    expect(sub.toStatus).toBe("blocked");
    expect(JSON.stringify(sub.detail)).toContain("price");
  });
});

describe("BR-SINV-19 tax check (CGST, SGST, IGST within Rs 1)", () => {
  const fig = (o: Record<string, number>) => ({
    taxablePaise: 23520000,
    cgstPaise: 2116800,
    sgstPaise: 2116800,
    igstPaise: 0,
    totalPaise: 27753600,
    ...o,
  });
  test("BR-SINV-19 a head 50 paise off passes", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { printed: fig({ cgstPaise: 2116850 }) });
    expect(d.status).toBe("approved");
  });
  test("BR-SINV-19 exactly 100 paise off passes", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { printed: fig({ sgstPaise: 2116700 }) });
    expect(d.status).toBe("approved");
  });
  test("BR-SINV-19 a head 101 paise off is a tax mismatch on that head", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { printed: fig({ cgstPaise: 2116901 }) });
    expect(d.status).toBe("blocked");
    expect(checks(d)).toEqual(["tax"]);
    const m = first(d, "tax");
    expect(m.head).toBe("cgst");
    expect(m.expected).toBe(2116800);
    expect(m.billed).toBe(2116901);
    expect(m.unit).toBe("paise");
  });
  test("BR-SINV-19 IGST printed on a same-state bill is a tax mismatch", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { printed: fig({ igstPaise: 500000 }) });
    expect(d.status).toBe("blocked");
    expect(find(d, "tax").map((m) => m.head)).toContain("igst");
  });
  test("BR-SINV-19 CGST printed on an other-state bill is a tax mismatch", async () => {
    const sup = await newSupplier(`27${uid().slice(-12)}`);
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }], {
      supplier: sup,
    });
    const d = await mkSubmitted(
      g,
      {
        printed: {
          cgstPaise: 2116800,
          igstPaise: 4233600,
          totalPaise: 27753600,
        },
      },
      undefined,
      true,
    );
    expect(d.status).toBe("blocked");
    expect(find(d, "tax").map((m) => m.head)).toContain("cgst");
  });
});

describe("BR-SINV-20 total check", () => {
  test.each([27753600, 27753650, 27753700, 27753500])(
    "BR-SINV-20 printed total %p passes",
    async (t) => {
      const g = await std();
      const d = await mkSubmitted(g, { printed: { totalPaise: t } });
      expect(d.status).toBe("approved");
    },
  );
  test("BR-SINV-20 printed total Rs 2,78,000 is a total mismatch and nothing else", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { printed: { totalPaise: 27800000 } });
    expect(d.status).toBe("blocked");
    expect(checks(d)).toEqual(["total"]);
    expect(first(d, "total").expected).toBe(27753600);
    expect(first(d, "total").billed).toBe(27800000);
  });
  test("BR-SINV-20 a total 101 paise below the computed one is a total mismatch", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { printed: { totalPaise: 27753499 } });
    expect(checks(d)).toEqual(["total"]);
  });
});

describe("BR-SINV-21 price check", () => {
  test("BR-SINV-21 tolerance 0%: Rs 241 against PO Rs 240 is a price mismatch", async () => {
    await ensureCompany();
    const g = await std();
    const d = await mkBlocked(g);
    expect(checks(d)).toEqual(["price"]);
  });
  test("BR-SINV-21 a rate below the PO rate passes and is marked below PO rate", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { lines: ln1(g, { ratePaise: 23800 }) });
    expect(d.status).toBe("approved");
    expect(d.lines[0].belowPoRate).toBe(true);
    expect(d.lines[0].poRatePaise).toBe(24000);
  });
  test("BR-SINV-21 a rate equal to the PO rate is not marked below PO rate", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    expect(d.lines[0].belowPoRate).toBe(false);
  });
  test("BR-SINV-21 tolerance 1%: Rs 242.40 passes, Rs 242.41 is a price mismatch", async () => {
    await withTol({ priceToleranceBp: 100 });
    try {
      const g = await std();
      const ok = await mkSubmitted(g, { lines: ln1(g, { ratePaise: 24240 }) });
      expect(ok.status).toBe("approved");
      const g2 = await std();
      const bad = await mkSubmitted(g2, {
        lines: ln1(g2, { ratePaise: 24241 }),
      });
      expect(checks(bad)).toEqual(["price"]);
      expect(bad.tolerances.priceTolBpUsed).toBe(100);
    } finally {
      await ensureCompany();
    }
  });
});

describe("BR-SINV-22 qty check", () => {
  test("BR-SINV-22 weight tolerance 0.5%: 984 of 980 kg passes, 990 is a qty mismatch", async () => {
    await ensureCompany();
    const g = await std();
    expect((await mkSubmitted(g, { lines: ln1(g, { qty: 984 }) })).status).toBe(
      "approved",
    );
    const g2 = await std();
    const d = await mkSubmitted(g2, { lines: ln1(g2, { qty: 990 }) });
    expect(d.status).toBe("blocked");
    const m = first(d, "qty");
    expect(m.expected).toBe(980000);
    expect(m.billed).toBe(990000);
    expect(m.unit).toBe("milli_qty");
  });
  test("BR-SINV-22 tonne and g are weight units too: tolerance applies", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, uom: "g" }]);
    const d = await mkSubmitted(g, { lines: ln1(g, { qty: 1004 }) });
    expect(d.status).toBe("approved");
  });
  test("BR-SINV-22 other units have no tolerance: 101 of 100 pcs is a qty mismatch, 100 passes", async () => {
    const g = await mkGrn([{ qty: 100, uom: "pcs" }]);
    const bad = await mkSubmitted(g, { lines: ln1(g, { qty: 101 }) });
    expect(checks(bad)).toEqual(["qty"]);
    const g2 = await mkGrn([{ qty: 100, uom: "pcs" }]);
    expect(
      (await mkSubmitted(g2, { lines: ln1(g2, { qty: 100 }) })).status,
    ).toBe("approved");
  });
  test("BR-SINV-22 billing less is fine and the rest stays billable", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { lines: ln1(g, { qty: 600 }) });
    expect(d.status).toBe("approved");
    const r = await sinv("GET", `/getbillablelines?poId=${g.poId}`, await bo());
    const line = r.json.data.lines.find(
      (l: any) => l.grnItemId === g.lineIds[0],
    );
    expect(line.billedQty).toBe(600);
    expect(line.billableQty).toBe(380);
  });
  test("BR-SINV-22 a weight tolerance of 0 makes 981 of 980 kg a qty mismatch", async () => {
    await withTol({ weightToleranceBp: 0 });
    try {
      const g = await std();
      const d = await mkSubmitted(g, { lines: ln1(g, { qty: 981 }) });
      expect(checks(d)).toEqual(["qty"]);
    } finally {
      await ensureCompany();
    }
  });
});

describe("BR-SINV-40 / 41 GST rate and charges", () => {
  test("BR-SINV-40 bill line at 12% against a 18% PO line is a tax rate mismatch", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { lines: ln1(g, { gstPercent: 12 }) });
    expect(d.status).toBe("blocked");
    expect(checks(d)).toEqual(["tax_rate"]);
    const m = first(d, "tax_rate");
    expect(m.expected).toBe(1800);
    expect(m.billed).toBe(1200);
    expect(m.unit).toBe("bp");
  });
  test("BR-SINV-41 a charge line is always a charge-not-on-PO mismatch", async () => {
    const g = await std();
    const d = await mkSubmitted(g, {
      charges: [{ type: "freight", taxablePaise: 200000, gstPercent: 18 }],
    });
    expect(d.status).toBe("blocked");
    expect(checks(d)).toEqual(["charge"]);
  });
  test("BR-SINV-41 a charge-only blocked bill can be released and becomes approved", async () => {
    const g = await std();
    const d = await mkSubmitted(g, {
      charges: [{ type: "freight", taxablePaise: 200000, gstPercent: 18 }],
    });
    expect((await release(d.id)).json.data.status).toBe("approved");
  });
  test("BR-SINV-23 several failures are all stored", async () => {
    const g = await std();
    const d = await mkSubmitted(g, {
      lines: ln1(g, { ratePaise: 24100, gstPercent: 12 }),
      charges: [{ type: "freight", taxablePaise: 100000, gstPercent: 18 }],
    });
    expect(checks(d)).toEqual(
      expect.arrayContaining(["price", "tax_rate", "charge"]),
    );
  });
});

describe("BR-SINV-24 back to draft", () => {
  test("BR-SINV-24 blocked -> draft clears the mismatch list; the old result stays in history; fix and resubmit approves", async () => {
    const g = await std();
    const d = await mkBlocked(g);
    const r = await backToDraft(d.id);
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("draft");
    expect(r.json.data.mismatches).toEqual([]);
    const fixed = ln1(g);
    const e = await sinv("PATCH", "/updatesupplierinvoice", await bo(), {
      id: d.id,
      lines: fixed,
      printed: printed(fixed),
    });
    expect(e.status).toBe(200);
    expect((await submit(d.id)).json.data.status).toBe("approved");
    const h = await historyOf(d.id);
    const first = h.find((x) => x.action === "submit")!;
    expect(JSON.stringify(first.detail)).toContain("price");
    expect(h.map((x) => x.action)).toEqual([
      "create",
      "submit",
      "back_to_draft",
      "edit",
      "submit",
    ]);
  });
  test("BR-SINV-24 back to draft on an approved or draft invoice is 409", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    expect((await backToDraft(d.id)).status).toBe(409);
    const g2 = await std();
    const dr = await mkDraft(g2);
    expect((await backToDraft(dr.id)).status).toBe(409);
  });
  test("BR-SINV-24 owner may also send back (invoice.manage)", async () => {
    const g = await std();
    const d = await mkBlocked(g);
    expect((await backToDraft(d.id, await ownerA())).status).toBe(200);
  });
});

describe("BR-SINV-25 release", () => {
  test("BR-SINV-25 the owner with no history row releases with a reason: approved, who, when, why stored", async () => {
    const g = await std();
    const d = await mkBlocked(g);
    const owner = await ownerB();
    const r = await release(d.id, owner, "metal price rose, agreed by phone");
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("approved");
    expect(r.json.data.releasedBy).toBe(owner.id);
    expect(r.json.data.releasedAt).toBeTruthy();
    expect(r.json.data.releaseReason).toBe("metal price rose, agreed by phone");
    const rel = (await historyOf(d.id)).find((h) => h.action === "release")!;
    expect(rel.reason).toBe("metal price rose, agreed by phone");
    expect(rel.fromStatus).toBe("blocked");
    expect(rel.toStatus).toBe("approved");
    expect(JSON.stringify(rel.detail)).toContain("price");
  });
  test("BR-SINV-25 the one who created it cannot release it: 403 SINV_SELF_RELEASE", async () => {
    const g = await std();
    const creator = await ownerA();
    const d = await mkBlocked(g, creator);
    const r = await release(d.id, creator);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("SINV_SELF_RELEASE");
    expect((await invRow(d.id))!.status).toBe("blocked");
  });
  test("BR-SINV-25 the one who only submitted it cannot release it", async () => {
    const g = await std();
    const d = await mkDraft(
      g,
      { lines: ln1(g, { ratePaise: 24100 }) },
      await bo(),
    );
    const submitter = await ownerA();
    expect((await submit(d.id, submitter)).json.data.status).toBe("blocked");
    const r = await release(d.id, submitter);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("SINV_SELF_RELEASE");
  });
  test("BR-SINV-25 the one who only edited it cannot release it", async () => {
    const g = await std();
    const d = await mkDraft(
      g,
      { lines: ln1(g, { ratePaise: 24100 }) },
      await bo(),
    );
    const editor = await ownerA();
    const e = await sinv("PATCH", "/updatesupplierinvoice", editor, {
      id: d.id,
      invoiceNumber: newNo(),
    });
    expect(e.status).toBe(200);
    await submit(d.id, await bo());
    const r = await release(d.id, editor);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("SINV_SELF_RELEASE");
    expect((await release(d.id, await ownerB())).status).toBe(200);
  });
  test("BR-SINV-25 the one who sent it back to draft cannot release it after a re-submit by someone else", async () => {
    const g = await std();
    const d = await mkBlocked(g);
    const sender = await ownerA();
    expect((await backToDraft(d.id, sender)).status).toBe(200);
    await submit(d.id, await bo());
    const r = await release(d.id, sender);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("SINV_SELF_RELEASE");
    expect((await release(d.id, await ownerB())).status).toBe(200);
  });
  test("BR-SINV-25 super-admin who created it is refused too (exception to BR-AUTH-18)", async () => {
    const g = await std();
    const sa = await superAdmin();
    const d = await mkBlocked(g, sa);
    const r = await release(d.id, sa);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("SINV_SELF_RELEASE");
  });
  test("BR-SINV-25 super-admin with no history row on the invoice can release", async () => {
    const g = await std();
    const d = await mkBlocked(g);
    expect((await release(d.id, await superAdmin())).status).toBe(200);
  });
  test.each(["ok", "  ab  ", "x".repeat(501)])(
    "BR-SINV-25 reason %p is 400",
    async (reason) => {
      const g = await std();
      const d = await mkBlocked(g);
      expect((await release(d.id, await ownerB(), reason)).status).toBe(400);
      expect((await invRow(d.id))!.status).toBe("blocked");
    },
  );
  test("BR-SINV-25 a 3 character reason is enough", async () => {
    const g = await std();
    const d = await mkBlocked(g);
    expect((await release(d.id, await ownerB(), "abc")).status).toBe(200);
  });
  test("BR-SINV-25 release of an approved, draft or cancelled invoice is 409", async () => {
    const g = await std();
    const a = await mkSubmitted(g);
    expect((await release(a.id)).status).toBe(409);
    const g2 = await std();
    const dr = await mkDraft(g2);
    expect((await release(dr.id)).status).toBe(409);
    const g3 = await std();
    const b = await mkBlocked(g3);
    await cancel(b.id, "abc");
    expect((await release(b.id)).status).toBe(409);
  });
  test("BR-SINV-25 release of an unknown invoice is 404", async () => {
    expect((await release(2147483000)).status).toBe(404);
  });
});

describe("BR-SINV-26 / 27 cancel", () => {
  test("BR-SINV-26 an approved invoice is never edited: PATCH is 409", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    const r = await sinv("PATCH", "/updatesupplierinvoice", await bo(), {
      id: d.id,
      invoiceNumber: newNo(),
    });
    expect(r.status).toBe(409);
  });
  test("BR-SINV-26 approved: a 9 character reason is 400, 10 characters cancels", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    expect((await cancel(d.id, "wrong qty")).status).toBe(400);
    expect((await invRow(d.id))!.status).toBe("approved");
    const r = await cancel(d.id, "wrong qty billed");
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("cancelled");
    expect(r.json.data.cancelReason).toBe("wrong qty billed");
    expect(r.json.data.cancelledBy).toBe((await bo()).id);
    expect(r.json.data.cancelledAt).toBeTruthy();
  });
  test("BR-SINV-26 blocked: a 2 character reason is 400, 3 characters cancels", async () => {
    const g = await std();
    const d = await mkBlocked(g);
    expect((await cancel(d.id, "ab")).status).toBe(400);
    expect((await cancel(d.id, "abc")).status).toBe(200);
  });
  test("BR-SINV-26 a reason over 500 characters is 400", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    expect((await cancel(d.id, "x".repeat(501))).status).toBe(400);
  });
  test("BR-SINV-26 a draft is deleted, not cancelled (409)", async () => {
    const g = await std();
    const d = await mkDraft(g);
    expect((await cancel(d.id, "not needed any more")).status).toBe(409);
  });
  test("BR-SINV-26 a cancelled invoice cannot be cancelled again (409)", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    await cancel(d.id);
    expect((await cancel(d.id)).status).toBe(409);
  });
  test("BR-SINV-26 cancel writes a history row with the reason", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    await cancel(d.id, "wrong qty billed");
    const row = (await historyOf(d.id)).find((h) => h.action === "cancel")!;
    expect(row.reason).toBe("wrong qty billed");
    expect(row.fromStatus).toBe("approved");
    expect(row.toStatus).toBe("cancelled");
  });
  test("BR-SINV-27 cancelled keeps its number, its qty is billable again, and a new bill can use the same supplier number", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { invoiceNumber: "CAN-27" });
    await cancel(d.id);
    const after = await detail(d.id);
    expect(after.status).toBe("cancelled");
    expect(after.ourNumber).toBe(d.ourNumber);
    const r = await sinv("GET", `/getbillablelines?poId=${g.poId}`, await bo());
    const line = r.json.data.lines.find(
      (l: any) => l.grnItemId === g.lineIds[0],
    );
    expect(line.billableQty).toBe(980);
    expect(line.billedQty).toBe(0);
    expect((await create(g, { invoiceNumber: "CAN-27" })).status).toBe(201);
  });
  test("BR-SINV-27 a cancelled invoice cannot be released, submitted or sent back", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    await cancel(d.id);
    expect((await submit(d.id)).status).toBe(409);
    expect((await backToDraft(d.id)).status).toBe(409);
    expect((await release(d.id)).status).toBe(409);
  });
});

describe("BR-SINV-34 races: one result, the other 409", () => {
  test("BR-SINV-34 two submits at once: one 200, one 409", async () => {
    const g = await std();
    const d = await mkDraft(g);
    const b = await bo();
    const res = await Promise.all([submit(d.id, b), submit(d.id, b)]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await invRow(d.id))!.status).toBe("approved");
    expect(
      (await historyOf(d.id)).filter((h) => h.action === "submit"),
    ).toHaveLength(1);
  });
  test("BR-SINV-34 release and cancel at once: exactly one wins", async () => {
    const g = await std();
    const d = await mkBlocked(g);
    const res = await Promise.all([
      release(d.id, await ownerB()),
      cancel(d.id, "abc"),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    const st = (await invRow(d.id))!.status;
    expect(["approved", "cancelled"]).toContain(st);
  });
  test("BR-SINV-34 two creates of the same kg at once: one 201, the other refused", async () => {
    const g = await std();
    const res = await Promise.all([create(g), create(g)]);
    const codes = res.map((r) => r.status).sort();
    expect(codes[0]).toBe(201);
    expect([400, 409]).toContain(codes[1]!);
    const rows = await db
      .select()
      .from(supplierInvoices)
      .where(eq(supplierInvoices.poId, g.poId));
    expect(rows).toHaveLength(1);
  });
  test("BR-SINV-34 two cancels at once: one 200, one 409", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    const res = await Promise.all([cancel(d.id), cancel(d.id)]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

describe("BR-SINV-35 history is append-only and complete", () => {
  test("BR-SINV-35 a full life leaves one row per action in order", async () => {
    const g = await std();
    const d = await mkBlocked(g);
    await release(d.id, await ownerB());
    await cancel(d.id, "wrong qty billed", await ownerA());
    const actions = (await historyOf(d.id)).map((h) => h.action);
    expect(actions).toEqual(["create", "submit", "release", "cancel"]);
    const det = await detail(d.id);
    expect(det.history.map((h: any) => h.action)).toEqual(actions);
    expect(det.history[2].reason).toBe("agreed by phone with supplier");
  });
  test("BR-SINV-35 the detail shows mismatches per line with expected vs billed (BR-SINV-39)", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { lines: ln1(g, { qty: 990 }) });
    const m = first(d, "qty");
    expect(m.lineId).toBe(d.lines[0].id);
    expect(m.expected).toBe(980000);
    expect(m.billed).toBe(990000);
    expect(d.lines[0].billableQty).toBe(980);
  });
});
