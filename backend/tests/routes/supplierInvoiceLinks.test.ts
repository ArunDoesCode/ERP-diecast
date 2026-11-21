/**
 * Supplier invoice links to other modules: PO "invoiced" (BR-SINV-29), GRN correction guard (BR-SINV-30),
 * debit-note link and net payable (BR-SINV-31, BR-PRT-43..45), billable lines and document flow
 * (BR-SINV-02, 38, 39). Real DB, full HTTP stack via createApp(). Fixtures are TEST_sinvlnk_ prefixed.
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

const RUN = `TEST_sinvlnk_${Date.now()}`;
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
const ln1 = (g: G, o: Partial<Ln> = {}, idx = 0): Ln[] => [
  {
    grnItemId: g.lineIds[idx]!,
    qty: 980,
    ratePaise: 24000,
    gstPercent: 18,
    ...o,
  },
];
const prApi = (
  method: string,
  path: string,
  who: Actor | null,
  body?: unknown,
) => raw(method, `/api/purchase-return${path}`, who, body);
/** create and post a return; lines = [lineIndex, source, qty] */
async function postReturn(
  g: G,
  lines: [number, "accepted" | "rejected", number][],
) {
  const c = await prApi("POST", "/createreturn", await bo(), {
    grnId: g.grnId,
    reason: "porosity in heat H-881",
    lines: lines.map(([i, source, qty]) => ({
      grnItemId: g.lineIds[i]!,
      source,
      qty,
    })),
  });
  if (c.status !== 201)
    throw new Error(`fixture return: ${c.status} ${JSON.stringify(c.json)}`);
  const id = c.json.data.id as number;
  const p = await prApi("POST", `/${id}/post`, await bo());
  if (p.status !== 200)
    throw new Error(
      `fixture return post: ${p.status} ${JSON.stringify(p.json)}`,
    );
  return id;
}
const cancelReturn = async (id: number) =>
  prApi("POST", `/${id}/cancel`, await bo(), {
    reason: "supplier agreed to keep the goods",
  });
const dnOf = async (proId: number) =>
  (
    await db
      .select()
      .from(purchaseDebitNotes)
      .where(eq(purchaseDebitNotes.proId, proId))
  )[0]!;
const correct = async (g: G, qty: number) =>
  grnApi("POST", `/${g.grnId}/lines/${g.lineIds[0]}/correction`, await bo(), {
    qty,
    reason: "short weight found",
  });
const billable = async (g: G, extra = "") => {
  const r = await sinv(
    "GET",
    `/getbillablelines?poId=${g.poId}${extra}`,
    await bo(),
  );
  expect(r.status).toBe(200);
  return r.json.data as {
    lines: Record<string, any>[];
    po: any;
    supplier: any;
  };
};
const lineOf = async (g: G, idx = 0) =>
  (await billable(g)).lines.find((l) => l.grnItemId === g.lineIds[idx]);
const mustLine = async (g: G): Promise<Record<string, any>> =>
  (await lineOf(g)) ?? {};

describe("BR-SINV-29 PO becomes invoiced when approved bills cover every GRN line", () => {
  test("BR-SINV-29 approved 600 + 400 of 1,000 kg: invoiced only after the second; who and when stored", async () => {
    const g = await mkGrn([{ qty: 1000 }]);
    const a = await mkDraft(g, { lines: ln1(g, { qty: 600 }) });
    const b = await mkDraft(g, { lines: ln1(g, { qty: 400 }) });
    expect((await submit(a.id)).json.data.status).toBe("approved");
    expect((await poRow(g.poId)).status).toBe("fully_received");
    expect((await submit(b.id)).json.data.status).toBe("approved");
    const po = await poRow(g.poId);
    expect(po.status).toBe("invoiced");
    expect(po.invoicedBy).toBe((await bo()).id);
    expect(po.invoicedAt).toBeTruthy();
  });
  test("BR-SINV-29 cancelling the covering invoice sends the PO back to fully_received", async () => {
    const g = await mkGrn([{ qty: 1000 }]);
    const a = await mkSubmitted(g, { lines: ln1(g, { qty: 600 }) });
    const b = await mkSubmitted(g, { lines: ln1(g, { qty: 400 }) });
    expect((await poRow(g.poId)).status).toBe("invoiced");
    expect((await cancel(b.id)).status).toBe(200);
    const po = await poRow(g.poId);
    expect(po.status).toBe("fully_received");
    expect(po.invoicedBy).toBeNull();
    expect((await invRow(a.id))!.status).toBe("approved");
  });
  test("BR-SINV-29 a blocked bill does not cover; releasing it does (who = the releaser)", async () => {
    const g = await mkGrn([{ qty: 1000 }]);
    const d = await mkSubmitted(g, {
      lines: ln1(g, { qty: 1000, ratePaise: 24100 }),
    });
    expect(d.status).toBe("blocked");
    expect((await poRow(g.poId)).status).toBe("fully_received");
    const owner = await ownerB();
    expect((await release(d.id, owner)).status).toBe(200);
    const po = await poRow(g.poId);
    expect(po.status).toBe("invoiced");
    expect(po.invoicedBy).toBe(owner.id);
  });
  test("BR-SINV-29 a draft never covers", async () => {
    const g = await mkGrn([{ qty: 1000 }]);
    await mkDraft(g, { lines: ln1(g, { qty: 1000 }) });
    expect((await poRow(g.poId)).status).toBe("fully_received");
  });
  test.each(["partial_received", "closed"])(
    "BR-SINV-29 a %s PO keeps its status when fully billed",
    async (status) => {
      const g = await mkGrn([{ qty: 1000 }], { status });
      await mkSubmitted(g, { lines: ln1(g, { qty: 1000 }) });
      expect((await poRow(g.poId)).status).toBe(status);
    },
  );
  test("BR-SINV-29 every GRN line must be covered: two lines, one billed -> not invoiced", async () => {
    const g = await mkGrn([{ qty: 500 }, { qty: 500 }]);
    const l = (i: number): Ln => ({
      grnItemId: g.lineIds[i]!,
      qty: 500,
      ratePaise: 24000,
      gstPercent: 18,
    });
    await mkSubmitted(g, { lines: [l(0)] });
    expect((await poRow(g.poId)).status).toBe("fully_received");
    await mkSubmitted(g, { lines: [l(1)] });
    expect((await poRow(g.poId)).status).toBe("invoiced");
  });
  test("BR-SINV-29 approved 980 of 1,000 then 20 kg returned credit only -> invoiced; return cancelled -> fully_received", async () => {
    const g = await mkGrn([{ qty: 1000 }]);
    await mkSubmitted(g, { lines: ln1(g, { qty: 980 }) });
    expect((await poRow(g.poId)).status).toBe("fully_received");
    const ret = await postReturn(g, [[0, "accepted", 20]]);
    expect((await poRow(g.poId)).status).toBe("invoiced");
    expect((await cancelReturn(ret)).status).toBe(200);
    expect((await poRow(g.poId)).status).toBe("fully_received");
  });
  test("BR-SINV-29 the old POST /api/po/:id/invoice no longer exists (404)", async () => {
    const g = await mkGrn([{ qty: 1000 }]);
    const r = await raw("POST", `/api/po/${g.poId}/invoice`, await ownerA(), {
      invoiceNumber: "X1",
      invoiceDate: istDay(0),
      billedAmountPaise: 1000,
    });
    expect(r.status).toBe(404);
    expect((await poRow(g.poId)).status).toBe("fully_received");
  });
});

describe("BR-SINV-30 GRN correction below the billed qty", () => {
  test("BR-SINV-30 980 kg on a live invoice: correcting 30 kg is 409", async () => {
    const g = await std();
    const d = await mkDraft(g);
    const r = await correct(g, 30);
    expect(r.status).toBe(409);
    expect(
      (await sinv("DELETE", `/deletesupplierinvoice/${d.id}`, await bo()))
        .status,
    ).toBe(200);
    expect((await correct(g, 30)).status).toBe(201);
  });
  test("BR-SINV-30 an approved invoice also blocks it; cancelling the invoice frees the correction", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    expect((await correct(g, 30)).status).toBe(409);
    await cancel(d.id);
    expect((await correct(g, 30)).status).toBe(201);
  });
  test("BR-SINV-30 a correction that leaves net accepted at or above the billed qty is allowed", async () => {
    const g = await std();
    await mkSubmitted(g, { lines: ln1(g, { qty: 900 }) });
    expect((await correct(g, 30)).status).toBe(201);
    expect((await correct(g, 50)).status).toBe(201);
    expect((await correct(g, 1)).status).toBe(409);
  });
});

describe("BR-SINV-02 / BR-PRT-43 billable qty and returns", () => {
  test("BR-PRT-43 accepted 20 kg returned: billable 960 kg (credit only)", async () => {
    const g = await std();
    await postReturn(g, [[0, "accepted", 20]]);
    const l = await mustLine(g);
    expect(l.returnedQty).toBe(20);
    expect(l.billableQty).toBe(960);
  });
  test("BR-PRT-43 rejected 20 kg returned: billable stays 980 kg", async () => {
    const g = await std();
    await postReturn(g, [[0, "rejected", 20]]);
    expect((await mustLine(g)).billableQty).toBe(980);
  });
  test("BR-PRT-43 a cancelled return no longer reduces the billable qty", async () => {
    const g = await std();
    const ret = await postReturn(g, [[0, "accepted", 20]]);
    await cancelReturn(ret);
    expect((await mustLine(g)).billableQty).toBe(980);
  });
  test("BR-SINV-02 billable below zero counts as 0: the line drops out of the list", async () => {
    const g = await std();
    await mkSubmitted(g);
    await postReturn(g, [[0, "accepted", 20]]);
    expect(await lineOf(g)).toBeUndefined();
    expect((await create(g)).status).toBe(400);
  });
  test("BR-SINV-02 other live invoices reduce the billable qty", async () => {
    const g = await std();
    await mkDraft(g, { lines: ln1(g, { qty: 300 }) });
    const l = await mustLine(g);
    expect(l.billedQty).toBe(300);
    expect(l.billableQty).toBe(680);
  });
});

describe("BR-SINV-31 / BR-PRT-44 / 45 debit note link and net payable", () => {
  test("BR-SINV-31 a bill with no debit note: net payable = total", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    expect(d.debitNotes).toEqual([]);
    expect(d.netPayablePaise).toBe(d.totalPaise);
  });
  test("BR-PRT-44 bill approved first, 20 kg accepted returned later: note links to the bill, offset Rs 5,664, net Rs 2,71,872", async () => {
    const g = await std();
    const bill = await mkSubmitted(g);
    const ret = await postReturn(g, [[0, "accepted", 20]]);
    const dn = await dnOf(ret);
    expect(dn.supplierInvoiceId).toBe(bill.id);
    expect(dn.billOffsetPaise).toBe(566400);
    const d = await detail(bill.id);
    expect(d.debitNotes).toHaveLength(1);
    expect(d.debitNotes[0].billOffsetPaise).toBe(566400);
    expect(d.netPayablePaise).toBe(27187200);
    expect(d.totalPaise).toBe(27753600);
  });
  test("BR-PRT-44 with two approved bills on the line the note links to the oldest", async () => {
    const g = await std();
    const first = await mkSubmitted(g, { lines: ln1(g, { qty: 500 }) });
    await mkSubmitted(g, { lines: ln1(g, { qty: 480 }) });
    const ret = await postReturn(g, [[0, "accepted", 20]]);
    expect((await dnOf(ret)).supplierInvoiceId).toBe(first.id);
  });
  test("BR-PRT-44 / BR-SINV-31 return first, then a bill of 980 kg is released: linked at release, offset Rs 5,664", async () => {
    const g = await std();
    const ret = await postReturn(g, [[0, "accepted", 20]]);
    expect((await dnOf(ret)).supplierInvoiceId).toBeNull();
    const bill = await mkSubmitted(g, { lines: ln1(g, { qty: 980 }) });
    expect(bill.status).toBe("blocked");
    expect((await dnOf(ret)).supplierInvoiceId).toBeNull();
    const r = await release(bill.id);
    expect(r.status).toBe(200);
    const dn = await dnOf(ret);
    expect(dn.supplierInvoiceId).toBe(bill.id);
    expect(dn.billOffsetPaise).toBe(566400);
    expect(r.json.data.netPayablePaise).toBe(27187200);
    const rel = (await historyOf(bill.id)).find((h) => h.action === "release")!;
    expect(JSON.stringify(rel.detail)).toContain(String(dn.id));
  });
  test("BR-PRT-44 / BR-SINV-31 return first, then a clean bill whose qty includes the returned kg is linked at submit", async () => {
    const g = await std();
    const ret = await postReturn(g, [[0, "accepted", 20]]);
    // 980 vs billable 960: use weight tolerance 3% so the bill is clean but still "includes" the returned qty
    await ensureCompany({ weightToleranceBp: 300 });
    try {
      const bill = await mkSubmitted(g, { lines: ln1(g, { qty: 980 }) });
      expect(bill.status).toBe("approved");
      const dn = await dnOf(ret);
      expect(dn.supplierInvoiceId).toBe(bill.id);
      expect(dn.billOffsetPaise).toBe(566400);
      expect((await detail(bill.id)).netPayablePaise).toBe(27187200);
    } finally {
      await ensureCompany();
    }
  });
  test("BR-SINV-31 a bill net of the return (960 kg) links nothing; net payable = its total Rs 2,71,872", async () => {
    const g = await std();
    const ret = await postReturn(g, [[0, "accepted", 20]]);
    const bill = await mkSubmitted(g, { lines: ln1(g, { qty: 960 }) });
    expect(bill.status).toBe("approved");
    const dn = await dnOf(ret);
    expect(dn.supplierInvoiceId).toBeNull();
    expect(dn.billOffsetPaise).toBe(0);
    const d = await detail(bill.id);
    expect(d.debitNotes).toEqual([]);
    expect(d.totalPaise).toBe(27187200);
    expect(d.netPayablePaise).toBe(27187200);
  });
  test("BR-PRT-45 a rejected-only note links with offset 0: net payable stays Rs 2,77,536", async () => {
    const g = await std();
    const bill = await mkSubmitted(g);
    const ret = await postReturn(g, [[0, "rejected", 20]]);
    const dn = await dnOf(ret);
    expect(dn.supplierInvoiceId).toBe(bill.id);
    expect(dn.billOffsetPaise).toBe(0);
    expect(dn.totalPaise).toBeGreaterThan(0);
    const d = await detail(bill.id);
    expect(d.netPayablePaise).toBe(27753600);
  });
  test("BR-PRT-45 offset counts only the accepted lines of a mixed note", async () => {
    const g = await std();
    const bill = await mkSubmitted(g);
    const ret = await postReturn(g, [
      [0, "accepted", 20],
      [0, "rejected", 20],
    ]);
    const dn = await dnOf(ret);
    expect(dn.supplierInvoiceId).toBe(bill.id);
    expect(dn.billOffsetPaise).toBe(566400);
    expect(dn.totalPaise).toBeGreaterThan(566400);
    expect((await detail(bill.id)).netPayablePaise).toBe(27187200);
  });
  test("BR-PRT-45 a cancelled debit note takes off nothing", async () => {
    const g = await std();
    const bill = await mkSubmitted(g);
    const ret = await postReturn(g, [[0, "accepted", 20]]);
    expect((await detail(bill.id)).netPayablePaise).toBe(27187200);
    expect((await cancelReturn(ret)).status).toBe(200);
    expect((await detail(bill.id)).netPayablePaise).toBe(27753600);
  });
  test("BR-SINV-31 cancelling the bill unlinks the note; a later approved covering bill re-links it", async () => {
    const g = await std();
    const first = await mkSubmitted(g);
    const ret = await postReturn(g, [[0, "accepted", 20]]);
    expect((await dnOf(ret)).supplierInvoiceId).toBe(first.id);
    expect((await cancel(first.id)).status).toBe(200);
    expect((await dnOf(ret)).supplierInvoiceId).toBeNull();
    const cancelRow = (await historyOf(first.id)).find(
      (h) => h.action === "cancel",
    )!;
    expect(JSON.stringify(cancelRow.detail)).toContain(
      String((await dnOf(ret)).id),
    );
    const second = await mkSubmitted(g, { lines: ln1(g, { qty: 980 }) });
    expect(second.status).toBe("blocked");
    expect((await release(second.id)).status).toBe(200);
    const dn = await dnOf(ret);
    expect(dn.supplierInvoiceId).toBe(second.id);
    expect(dn.billOffsetPaise).toBe(566400);
  });
  test("BR-SINV-31 a later covering bill of 960 kg after the cancel does not re-link", async () => {
    const g = await std();
    const first = await mkSubmitted(g);
    const ret = await postReturn(g, [[0, "accepted", 20]]);
    await cancel(first.id);
    await mkSubmitted(g, { lines: ln1(g, { qty: 960 }) });
    expect((await dnOf(ret)).supplierInvoiceId).toBeNull();
  });
});

describe("BR-SINV-38 billable lines (prefill of the entry form)", () => {
  test("BR-SINV-38 lists billable GRN lines at PO rate and GST %", async () => {
    const g = await std();
    const d = await billable(g);
    expect(d.po).toMatchObject({
      id: g.poId,
      status: "fully_received",
      paymentTermsDays: 30,
    });
    expect(d.supplier.id).toBe(g.supplierId);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]).toMatchObject({
      grnItemId: g.lineIds[0],
      grnId: g.grnId,
      grnNumber: g.grnNumber,
      uom: "kg",
      netAcceptedQty: 980,
      billedQty: 0,
      returnedQty: 0,
      billableQty: 980,
      poRatePaise: 24000,
      poGstPercent: 18,
    });
  });
  test("BR-SINV-38 a fully billed GRN offers nothing", async () => {
    const g = await std();
    await mkSubmitted(g);
    expect((await billable(g)).lines).toEqual([]);
  });
  test("BR-SINV-38 the grnId filter keeps only that GRN's lines", async () => {
    const g = await std();
    const d = await billable(g, `&grnId=${g.grnId}`);
    expect(d.lines.map((l) => l.grnId)).toEqual([g.grnId]);
    const none = await billable(g, "&grnId=2147483000");
    expect(none.lines).toEqual([]);
  });
  test("BR-SINV-38 lines pending QA are not listed", async () => {
    const g = await mkGrn([{ qty: 500 }, { qty: 500, pending: true }]);
    const d = await billable(g);
    expect(d.lines.map((l) => l.grnItemId)).toEqual([g.lineIds[0]]);
  });
  test("BR-SINV-38 unknown PO is 404; poId is required", async () => {
    expect(
      (await sinv("GET", "/getbillablelines?poId=2147483000", await bo()))
        .status,
    ).toBe(404);
    expect((await sinv("GET", "/getbillablelines", await bo())).status).toBe(
      400,
    );
  });
});

describe("BR-SINV-39 document flow on the detail", () => {
  test("BR-SINV-39 the detail shows PO and GRN numbers with their status", async () => {
    const g = await std();
    const d = await mkDraft(g);
    const det = await detail(d.id);
    expect(det.flow.po).toMatchObject({
      id: g.poId,
      number: g.poNumber,
      status: "fully_received",
    });
    expect(det.flow.grns.map((x: any) => x.number)).toContain(g.grnNumber);
    expect(Array.isArray(det.flow.pr)).toBe(true);
  });
  test("BR-SINV-39 each item line carries its GRN number and billable qty", async () => {
    const g = await std();
    const d = await mkDraft(g);
    const det = await detail(d.id);
    expect(det.lines[0].grnNumber).toBe(g.grnNumber);
    expect(det.lines[0].grnItemId).toBe(g.lineIds[0]);
  });
  test("BR-SINV-39 unknown invoice is 404", async () => {
    expect(
      (await sinv("GET", "/getsupplierinvoicedetails/2147483000", await bo()))
        .status,
    ).toBe(404);
  });
});
