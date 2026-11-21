/**
 * Supplier invoice: entry, GST, list, tolerances, permissions, history (BR-SINV-01..18, 28, 32, 33, 35..37).
 * Real DB, full HTTP stack via createApp(). Fixtures are TEST_sinv_ prefixed and removed in afterAll.
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

const RUN = `TEST_sinv_${Date.now()}`;
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
const ID = 2147483000;

describe("BR-SINV-33 login and keys on every endpoint", () => {
  const routes: [string, string, unknown][] = [
    ["GET", "/getsupplierinvoices", undefined],
    ["GET", "/getbillablelines?poId=1", undefined],
    ["GET", `/getsupplierinvoicedetails/${ID}`, undefined],
    ["POST", "/createsupplierinvoice", {}],
    ["PATCH", "/updatesupplierinvoice", {}],
    ["DELETE", `/deletesupplierinvoice/${ID}`, undefined],
    ["POST", `/${ID}/submit`, {}],
    ["POST", `/${ID}/back-to-draft`, {}],
    ["POST", `/${ID}/release`, { reason: "agreed by phone" }],
    ["POST", `/${ID}/cancel`, { reason: "wrong qty billed" }],
  ];
  test.each(routes)(
    "BR-SINV-33 %s %s without a token -> 401",
    async (m, p, b) => {
      expect((await sinv(m, p, null, b)).status).toBe(401);
    },
  );
  test.each(routes)(
    "BR-SINV-33 %s %s as floor supervisor -> 403 PERMISSION_DENIED",
    async (m, p, b) => {
      const r = await sinv(m, p, await floor(), b);
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("PERMISSION_DENIED");
    },
  );
  test("BR-SINV-33 tolerances: no token 401; floor supervisor 403 on both verbs", async () => {
    for (const m of ["GET", "PATCH"]) {
      expect(
        (
          await raw(
            m,
            "/api/company/invoice-tolerances",
            null,
            m === "GET" ? undefined : { weightTolerancePercent: 1 },
          )
        ).status,
      ).toBe(401);
      const r = await raw(
        m,
        "/api/company/invoice-tolerances",
        await floor(),
        m === "GET" ? undefined : { weightTolerancePercent: 1 },
      );
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("PERMISSION_DENIED");
    }
  });
  test("BR-SINV-33 back_office cannot release (invoice.release is owner only)", async () => {
    const r = await sinv("POST", `/${ID}/release`, await bo(), {
      reason: "agreed by phone",
    });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
  });
  test("BR-SINV-33 back_office reads the tolerances but cannot set them (company.manage is owner only)", async () => {
    expect(
      (await raw("GET", "/api/company/invoice-tolerances", await bo())).status,
    ).toBe(200);
    const r = await raw(
      "PATCH",
      "/api/company/invoice-tolerances",
      await bo(),
      { weightTolerancePercent: 1 },
    );
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
  });
  test("BR-SINV-33 owner and back_office can list", async () => {
    expect(
      (await sinv("GET", "/getsupplierinvoices", await ownerA())).status,
    ).toBe(200);
    expect((await sinv("GET", "/getsupplierinvoices", await bo())).status).toBe(
      200,
    );
  });
});

describe("BR-SINV-01 one supplier, one PO, one GRN line once", () => {
  test("BR-SINV-01 supplier is copied from the PO and the bill starts as a draft", async () => {
    const g = await std();
    const d = await mkDraft(g);
    expect(d.status).toBe("draft");
    expect(d.poId).toBe(g.poId);
    expect(d.supplier.id).toBe(g.supplierId);
  });
  test("BR-SINV-01 a line pointing to a GRN line of another PO is 400", async () => {
    const g = await std();
    const other = await std();
    const r = await create(g, {
      lines: [
        {
          grnItemId: other.lineIds[0]!,
          qty: 980,
          ratePaise: 24000,
          gstPercent: 18,
        },
      ],
    });
    expect(r.status).toBe(400);
  });
  test("BR-SINV-01 the same GRN line twice on one invoice is 400", async () => {
    const g = await std();
    const l = {
      grnItemId: g.lineIds[0]!,
      qty: 400,
      ratePaise: 24000,
      gstPercent: 18,
    };
    expect((await create(g, { lines: [l, { ...l, qty: 300 }] })).status).toBe(
      400,
    );
  });
  test("BR-SINV-01 editing a draft with another poId is 400", async () => {
    const g = await std();
    const other = await std();
    const d = await mkDraft(g);
    const r = await sinv("PATCH", "/updatesupplierinvoice", await bo(), {
      id: d.id,
      poId: other.poId,
    });
    expect(r.status).toBe(400);
    expect((await invRow(d.id))!.poId).toBe(g.poId);
  });
  test("BR-SINV-01 unknown PO is 404", async () => {
    const g = await std();
    const r = await create(g, { poId: 2147483000 });
    expect(r.status).toBe(404);
  });
});

describe("BR-SINV-02 / 03 / 04 what can be billed", () => {
  test("BR-SINV-02 a GRN line still pending QA is 400", async () => {
    const g = await mkGrn([{ qty: 1000, pending: true }]);
    expect((await create(g)).status).toBe(400);
  });
  test("BR-SINV-02 billable qty is net accepted (accepted minus corrections)", async () => {
    const g = await std();
    const r = await sinv("GET", `/getbillablelines?poId=${g.poId}`, await bo());
    expect(r.status).toBe(200);
    const line = r.json.data.lines.find(
      (l: any) => l.grnItemId === g.lineIds[0],
    );
    expect(line.netAcceptedQty).toBe(980);
    expect(line.billableQty).toBe(980);
  });
  test("BR-SINV-02 a line fully on an approved invoice cannot be billed again (400)", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    expect(d.status).toBe("approved");
    expect((await create(g)).status).toBe(400);
  });
  test("BR-SINV-03 a draft reserves its qty: a second draft on the same line is 400", async () => {
    const g = await std();
    const a = await mkDraft(g);
    expect((await create(g)).status).toBe(400);
    expect(
      (await sinv("DELETE", `/deletesupplierinvoice/${a.id}`, await bo()))
        .status,
    ).toBe(200);
    expect((await create(g)).status).toBe(201);
  });
  test.each(["partial_received", "fully_received", "closed"])(
    "BR-SINV-04 PO in %s can be billed",
    async (status) => {
      const g = await std();
      await setPoStatus(g.poId, status);
      expect((await create(g)).status).toBe(201);
    },
  );
  test.each([
    "cancelled",
    "draft",
    "pending_approval",
    "approved",
    "dispatched",
    "invoiced",
  ])("BR-SINV-04 PO in %s cannot be billed (400)", async (status) => {
    const g = await std();
    await setPoStatus(g.poId, status);
    expect((await create(g)).status).toBe(400);
  });
  test("BR-SINV-04 getbillablelines on a cancelled PO is refused (409)", async () => {
    const g = await std();
    await setPoStatus(g.poId, "cancelled");
    expect(
      (await sinv("GET", `/getbillablelines?poId=${g.poId}`, await bo()))
        .status,
    ).toBe(409);
  });
  test("BR-SINV-04 a PO with a legacy invoice row is never billed again (400)", async () => {
    const g = await std();
    await db.insert(supplierInvoices).values({
      ourNumber: `LEGACY-${uid()}`,
      invoiceNumber: "OLD-1",
      invoiceDate: istDay(-3),
      poId: g.poId,
      supplierId: g.supplierId,
      status: "legacy",
      billedAmountPaise: 1000,
      createdBy: (await ownerA()).id,
    });
    expect((await create(g)).status).toBe(400);
  });
});

describe("BR-SINV-05 supplier invoice number", () => {
  test("BR-SINV-05 trimmed and upper-cased", async () => {
    const g = await std();
    const no = newNo().toLowerCase();
    const d = await mkDraft(g, { invoiceNumber: ` ${no} ` });
    expect(d.invoiceNumber).toBe(no.toUpperCase());
  });
  test("BR-SINV-05 slash and dash are allowed", async () => {
    const g = await std();
    const d = await mkDraft(g, { invoiceNumber: "A/26-27/1" });
    expect(d.invoiceNumber).toBe("A/26-27/1");
  });
  test.each([
    ["INV 44"],
    ["X".repeat(17)],
    [""],
    ["   "],
    ["INV_44"],
    ["INV.44"],
  ])("BR-SINV-05 %p is 400", async (no) => {
    const g = await std();
    expect((await create(g, { invoiceNumber: no })).status).toBe(400);
  });
  test("BR-SINV-05 16 characters is fine", async () => {
    const g = await std();
    expect((await create(g, { invoiceNumber: "A".repeat(16) })).status).toBe(
      201,
    );
  });
});

describe("BR-SINV-06 duplicate supplier number per financial year", () => {
  const old = (d: string) => new Date(`${d}T06:00:00Z`);
  test("BR-SINV-06 same supplier, same number, same FY on a live invoice is 409", async () => {
    const sup = await newSupplier();
    const a = await mkGrn([{ qty: 1000 }], {
      supplier: sup,
      poCreatedAt: old("2025-01-01"),
    });
    const b = await mkGrn([{ qty: 1000 }], {
      supplier: sup,
      poCreatedAt: old("2025-01-01"),
    });
    await mkDraft(a, { invoiceNumber: "DUP-1", invoiceDate: "2025-05-10" });
    expect(
      (await create(b, { invoiceNumber: "DUP-1", invoiceDate: "2025-06-12" }))
        .status,
    ).toBe(409);
  });
  test("BR-SINV-06 another supplier may use the same number", async () => {
    const a = await mkGrn([{ qty: 1000 }], { poCreatedAt: old("2025-01-01") });
    const b = await mkGrn([{ qty: 1000 }], { poCreatedAt: old("2025-01-01") });
    await mkDraft(a, { invoiceNumber: "DUP-2", invoiceDate: "2025-05-10" });
    expect(
      (await create(b, { invoiceNumber: "DUP-2", invoiceDate: "2025-05-10" }))
        .status,
    ).toBe(201);
  });
  test("BR-SINV-06 another financial year (April-March) does not clash", async () => {
    const sup = await newSupplier();
    const a = await mkGrn([{ qty: 1000 }], {
      supplier: sup,
      poCreatedAt: old("2025-01-01"),
    });
    const b = await mkGrn([{ qty: 1000 }], {
      supplier: sup,
      poCreatedAt: old("2025-01-01"),
    });
    await mkDraft(a, { invoiceNumber: "DUP-3", invoiceDate: "2025-03-31" });
    const r = await create(b, {
      invoiceNumber: "DUP-3",
      invoiceDate: "2025-04-01",
    });
    expect(r.status).toBe(201);
    expect(r.json.data.fy).toBe("25-26");
  });
  test("BR-SINV-06 a legacy invoice with the number clashes too (409)", async () => {
    const sup = await newSupplier();
    const a = await mkGrn([{ qty: 1000 }], {
      supplier: sup,
      poCreatedAt: old("2025-01-01"),
    });
    const b = await mkGrn([{ qty: 1000 }], {
      supplier: sup,
      poCreatedAt: old("2025-01-01"),
    });
    await db.insert(supplierInvoices).values({
      ourNumber: `LEGACY-${uid()}`,
      invoiceNumber: "DUP-4",
      invoiceDate: "2025-05-10",
      poId: a.poId,
      supplierId: sup,
      status: "legacy",
      billedAmountPaise: 1000,
      createdBy: (await ownerA()).id,
    });
    expect(
      (await create(b, { invoiceNumber: "DUP-4", invoiceDate: "2025-05-11" }))
        .status,
    ).toBe(409);
  });
  test("BR-SINV-06 the same number on a cancelled invoice does not clash", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { invoiceNumber: "DUP-5" });
    expect((await cancel(d.id)).status).toBe(200);
    expect((await create(g, { invoiceNumber: "DUP-5" })).status).toBe(201);
  });
});

describe("BR-SINV-07 invoice date", () => {
  test("BR-SINV-07 tomorrow (IST) is 400", async () => {
    const g = await std();
    expect((await create(g, { invoiceDate: istDay(1) })).status).toBe(400);
  });
  test("BR-SINV-07 before the PO date is 400, the PO day itself is fine", async () => {
    const g = await std();
    const g2 = await mkGrn([{ qty: 1000 }], {
      poCreatedAt: new Date(`${istDay(-5)}T06:00:00Z`),
    });
    expect((await create(g2, { invoiceDate: istDay(-6) })).status).toBe(400);
    expect((await create(g2, { invoiceDate: istDay(-5) })).status).toBe(201);
    expect((await create(g, { invoiceDate: istDay(0) })).status).toBe(201);
  });
  test("BR-SINV-07 the date is required and must be a real date", async () => {
    const g = await std();
    const b: Record<string, unknown> = payload(g);
    delete b.invoiceDate;
    expect(
      (await sinv("POST", "/createsupplierinvoice", await bo(), b)).status,
    ).toBe(400);
    expect((await create(g, { invoiceDate: "2026-13-45" })).status).toBe(400);
  });
});

describe("BR-SINV-08 / 13 item lines and line value", () => {
  const l = (g: G, o: Partial<Ln> = {}): Ln => ({
    grnItemId: g.lineIds[0]!,
    qty: 100,
    ratePaise: 24000,
    gstPercent: 18,
    ...o,
  });
  test("BR-SINV-08 / 13 980.5 kg at 24,000 paise and 18% is saved, line value 23,532,000", async () => {
    const g = await std({ qty: 1010, accepted: 1000, rejected: 10 });
    const d = await mkDraft(g, { lines: [l(g, { qty: 980.5 })] });
    expect(d.lines[0].taxablePaise).toBe(23532000);
    expect(d.taxablePaise).toBe(23532000);
  });
  test("BR-SINV-13 980 kg x 24,000 paise is 23,520,000 paise", async () => {
    const g = await std();
    const d = await mkDraft(g);
    expect(d.lines[0].taxablePaise).toBe(23520000);
  });
  test("BR-SINV-08 12.5 of a whole-number unit (pcs) is 400, 12 is fine", async () => {
    const g = await mkGrn([{ qty: 100, uom: "pcs" }]);
    expect((await create(g, { lines: [l(g, { qty: 12.5 })] })).status).toBe(
      400,
    );
    expect((await create(g, { lines: [l(g, { qty: 12 })] })).status).toBe(201);
  });
  test.each([
    ["qty 0", { qty: 0 }],
    ["negative qty", { qty: -1 }],
    ["4 decimals", { qty: 1.0001 }],
    ["GST 15%", { gstPercent: 15 }],
    ["rate 0", { ratePaise: 0 }],
    ["fractional paise", { ratePaise: 240.5 }],
  ])("BR-SINV-08 %s is 400", async (_n, o) => {
    const g = await std();
    expect((await create(g, { lines: [l(g, o as Partial<Ln>)] })).status).toBe(
      400,
    );
  });
  test.each([0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40])(
    "BR-SINV-08 GST slab %p is accepted",
    async (gst) => {
      const g = await std();
      expect(
        (await create(g, { lines: [l(g, { gstPercent: gst })] })).status,
      ).toBe(201);
    },
  );
  test("BR-SINV-13 totals are the sum of item and charge lines", async () => {
    const g = await std();
    const ch = { type: "freight", taxablePaise: 200000, gstPercent: 18 };
    const d = await mkDraft(g, { lines: [l(g, { qty: 100 })], charges: [ch] });
    expect(d.taxablePaise).toBe(2400000 + 200000);
    expect(d.totalPaise).toBe(
      d.taxablePaise + d.cgstPaise + d.sgstPaise + d.igstPaise,
    );
  });
  test("BR-SINV-36 qty 1e9 x rate 1e9 is 400", async () => {
    const g = await std();
    expect(
      (await create(g, { lines: [l(g, { qty: 1e9, ratePaise: 1e9 })] })).status,
    ).toBe(400);
  });
});

describe("BR-SINV-09 charge lines", () => {
  const g0 = async () => std();
  test("BR-SINV-09 freight Rs 2,000 at 18% is saved as a charge line", async () => {
    const g = await g0();
    const d = await mkDraft(g, {
      charges: [
        {
          type: "freight",
          description: "Transport",
          taxablePaise: 200000,
          gstPercent: 18,
        },
      ],
    });
    const c = d.lines.filter((x: any) => x.kind === "charge");
    expect(c).toHaveLength(1);
    expect(c[0].chargeType).toBe("freight");
    expect(c[0].grnItemId).toBeNull();
    expect(c[0].taxablePaise).toBe(200000);
  });
  test.each([
    ["taxable 0", { type: "freight", taxablePaise: 0, gstPercent: 18 }],
    ["GST 15%", { type: "freight", taxablePaise: 100, gstPercent: 15 }],
    ["unknown type", { type: "rent", taxablePaise: 100, gstPercent: 18 }],
    [
      "description over 200",
      {
        type: "other",
        description: "x".repeat(201),
        taxablePaise: 100,
        gstPercent: 18,
      },
    ],
    [
      "type other without description",
      { type: "other", taxablePaise: 100, gstPercent: 18 },
    ],
  ])("BR-SINV-09 charge with %s is 400", async (_n, c) => {
    const g = await g0();
    expect((await create(g, { charges: [c as Ch] })).status).toBe(400);
  });
  test("BR-SINV-09 at most 10 charge lines: 10 ok, 11 is 400", async () => {
    const g = await g0();
    const mk = (n: number) =>
      Array.from({ length: n }, () => ({
        type: "packing",
        taxablePaise: 1000,
        gstPercent: 18,
      }));
    expect((await create(g, { charges: mk(11) })).status).toBe(400);
    expect((await create(g, { charges: mk(10) })).status).toBe(201);
  });
});

describe("BR-SINV-10 printed figures", () => {
  test("BR-SINV-10 printed figures are kept as typed, even when they differ from the computed ones", async () => {
    const g = await std();
    const pr = {
      taxablePaise: 23520000,
      cgstPaise: 2116850,
      sgstPaise: 2116800,
      igstPaise: 7,
      totalPaise: 27753601,
    };
    const d = await mkDraft(g, { printed: pr });
    expect(d.printed).toEqual(pr);
    expect(d.billedAmountPaise).toBe(27753601);
    expect(d.totalPaise).toBe(27753600);
  });
  test("BR-SINV-10 a negative printed figure is 400", async () => {
    const g = await std();
    expect((await create(g, { printed: { cgstPaise: -1 } })).status).toBe(400);
  });
  test("BR-SINV-10 printed figures are required", async () => {
    const g = await std();
    const b: Record<string, unknown> = payload(g);
    delete b.printed;
    expect(
      (await sinv("POST", "/createsupplierinvoice", await bo(), b)).status,
    ).toBe(400);
  });
});

describe("BR-SINV-11 our number, edit and delete of drafts", () => {
  test("BR-SINV-11 our number is SINV-<YYYY-MM>-<seq> with the IST month", async () => {
    const g = await std();
    const d = await mkDraft(g);
    const m = /^SINV-(\d{4}-\d{2})-(\d+)$/.exec(d.ourNumber);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(istDay(0).slice(0, 7));
  });
  test("BR-SINV-11 delete a draft: gone, history kept, number not reused", async () => {
    const g = await std();
    const a = await mkDraft(g);
    const seqOf = (n: string) => Number(n.split("-").pop());
    expect(
      (await sinv("DELETE", `/deletesupplierinvoice/${a.id}`, await bo()))
        .status,
    ).toBe(200);
    expect(
      (await sinv("GET", `/getsupplierinvoicedetails/${a.id}`, await bo()))
        .status,
    ).toBe(404);
    const rows = await db
      .select()
      .from(supplierInvoiceHistory)
      .where(eq(supplierInvoiceHistory.ourNumber, a.ourNumber));
    expect(rows.map((r) => r.action).sort()).toEqual(["create", "delete"]);
    const b = await mkDraft(g);
    expect(seqOf(b.ourNumber)).toBeGreaterThan(seqOf(a.ourNumber));
  });
  test("BR-SINV-11 a draft can be edited", async () => {
    const g = await std();
    const d = await mkDraft(g);
    const r = await sinv("PATCH", "/updatesupplierinvoice", await bo(), {
      id: d.id,
      invoiceNumber: "edited-1",
    });
    expect(r.status).toBe(200);
    expect(r.json.data.invoiceNumber).toBe("EDITED-1");
  });
  test("BR-SINV-11 an edit with nothing but the id is 400", async () => {
    const g = await std();
    const d = await mkDraft(g);
    expect(
      (await sinv("PATCH", "/updatesupplierinvoice", await bo(), { id: d.id }))
        .status,
    ).toBe(400);
  });
  test("BR-SINV-11 edit and delete of a blocked invoice are 409", async () => {
    const g = await std();
    const d = await mkSubmitted(g, {
      lines: [
        {
          grnItemId: g.lineIds[0]!,
          qty: 980,
          ratePaise: 24100,
          gstPercent: 18,
        },
      ],
    });
    expect(d.status).toBe("blocked");
    expect(
      (
        await sinv("PATCH", "/updatesupplierinvoice", await bo(), {
          id: d.id,
          invoiceNumber: "NEWNO",
        })
      ).status,
    ).toBe(409);
    expect(
      (await sinv("DELETE", `/deletesupplierinvoice/${d.id}`, await bo()))
        .status,
    ).toBe(409);
  });
  test("BR-SINV-11 delete of an approved invoice is 409", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    expect(
      (await sinv("DELETE", `/deletesupplierinvoice/${d.id}`, await bo()))
        .status,
    ).toBe(409);
  });
});

describe("BR-SINV-12 inactive supplier", () => {
  test("BR-SINV-12 a bill from a deactivated supplier can still be entered", async () => {
    const g = await std();
    await db
      .update(supplierMaster)
      .set({ isActive: false })
      .where(eq(supplierMaster.id, g.supplierId));
    expect((await create(g)).status).toBe(201);
  });
});

describe("BR-SINV-14 / 15 / 16 / 17 / 18 GST", () => {
  test("BR-SINV-14 same state: CGST + SGST at half the rate each, no IGST", async () => {
    const g = await std();
    const d = await mkDraft(g);
    expect(d.taxType).toBe("cgst_sgst");
    expect(d.cgstPaise).toBe(2116800);
    expect(d.sgstPaise).toBe(2116800);
    expect(d.igstPaise).toBe(0);
    expect(d.totalPaise).toBe(27753600);
  });
  test("BR-SINV-14 different state: IGST at the full rate, no CGST or SGST", async () => {
    const sup = await newSupplier(`27${uid().slice(-12)}`);
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }], {
      supplier: sup,
    });
    const d = await mkDraft(g, {}, undefined, true);
    expect(d.taxType).toBe("igst");
    expect(d.igstPaise).toBe(4233600);
    expect(d.cgstPaise).toBe(0);
    expect(d.sgstPaise).toBe(0);
  });
  test("BR-SINV-14 GSTINs and state codes are stored at submit; a later supplier edit does not change the bill", async () => {
    const g = await std();
    const d = await mkSubmitted(g);
    expect(d.supplierStateCode).toBe("29");
    expect(d.plantStateCode).toBe("29");
    const gstin = d.supplierGstin;
    expect(gstin).toBeTruthy();
    await db
      .update(supplierMaster)
      .set({ gstNumber: `27${uid().slice(-12)}` })
      .where(eq(supplierMaster.id, g.supplierId));
    const after = await detail(d.id);
    expect(after.taxType).toBe("cgst_sgst");
    expect(after.supplierGstin).toBe(gstin);
    expect(after.cgstPaise).toBe(2116800);
  });
  test("BR-SINV-15 each head is rounded per line, then summed", async () => {
    const g = await mkGrn([
      { qty: 10, price: 333, gst: 5 },
      { qty: 10, price: 333, gst: 5 },
    ]);
    const lines = g.lineIds.map((id) => ({
      grnItemId: id,
      qty: 1,
      ratePaise: 333,
      gstPercent: 5,
    }));
    const d = await mkDraft(g, { lines });
    // per line: 333 x 2.5% = 8.325 -> 8; two lines -> 16 (not 17 from 16.65)
    expect(d.cgstPaise).toBe(16);
    expect(d.sgstPaise).toBe(16);
    expect(d.totalPaise).toBe(666 + 32);
  });
  test("BR-SINV-15 a head of exactly half a paisa rounds up", async () => {
    const g = await mkGrn([{ qty: 10, price: 20, gst: 5 }]);
    const d = await mkDraft(g, {
      lines: [
        { grnItemId: g.lineIds[0]!, qty: 1, ratePaise: 20, gstPercent: 5 },
      ],
    });
    expect(d.cgstPaise).toBe(1);
    expect(d.sgstPaise).toBe(1);
  });
  test("BR-SINV-16 unregistered supplier: expected GST is 0, clean bill without tax is approved", async () => {
    const sup = await newSupplier(null);
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }], {
      supplier: sup,
    });
    const zero = {
      taxablePaise: 23520000,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      totalPaise: 23520000,
    };
    const d = await mkSubmitted(g, { printed: zero });
    expect(d.taxType).toBe("none");
    expect(d.totalPaise).toBe(23520000);
    expect(d.status).toBe("approved");
  });
  test("BR-SINV-16 unregistered supplier: any GST on the paper bill is a tax mismatch", async () => {
    const sup = await newSupplier(null);
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }], {
      supplier: sup,
    });
    const pr = {
      taxablePaise: 23520000,
      cgstPaise: 50000,
      sgstPaise: 0,
      igstPaise: 0,
      totalPaise: 23520000,
    };
    const d = await mkSubmitted(g, { printed: pr });
    expect(d.status).toBe("blocked");
    expect(checks(d)).toContain("tax");
  });
  test("BR-SINV-17 reverse charge and ITC-not-eligible are stored and change nothing", async () => {
    const g = await std();
    const d = await mkSubmitted(g, {
      reverseCharge: true,
      itcNotEligible: true,
    });
    expect(d.reverseCharge).toBe(true);
    expect(d.itcIneligible).toBe(true);
    expect(d.status).toBe("approved");
    expect(d.mismatches).toHaveLength(0);
  });
  test("BR-SINV-18 missing plant state code: submit is 400 naming the field", async () => {
    const g = await std();
    const d = await mkDraft(g);
    await ensureCompany({ stateCode: "" });
    const r = await submit(d.id);
    await ensureCompany();
    expect(r.status).toBe(400);
    expect(String(r.json.message).toLowerCase()).toContain("state code");
    expect((await invRow(d.id))!.status).toBe("draft");
  });
  test("BR-SINV-18 missing plant GSTIN: submit is 400 naming the field", async () => {
    const g = await std();
    const d = await mkDraft(g);
    await ensureCompany({ gstin: "" });
    const r = await submit(d.id);
    await ensureCompany();
    expect(r.status).toBe(400);
    expect(String(r.json.message).toLowerCase()).toContain("gstin");
  });
  test("BR-SINV-18 no company settings row at all: submit is 400", async () => {
    const g = await std();
    const d = await mkDraft(g);
    await db.delete(companySettings);
    const r = await submit(d.id);
    await ensureCompany();
    expect(r.status).toBe(400);
  });
});

describe("BR-SINV-28 due date and overdue", () => {
  test("BR-SINV-28 due = invoice date + PO payment terms; not overdue while in the future", async () => {
    const g = await std();
    const d = await mkSubmitted(g, { invoiceDate: istDay(-10) });
    expect(d.dueDate).toBe(istDay(20));
    expect(d.overdue).toBe(false);
    expect(d.paymentStatus).toBe("unpaid");
  });
  test("BR-SINV-28 an approved invoice past its due date is overdue, payment status stays unpaid", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }], {
      terms: 30,
      poCreatedAt: new Date("2025-01-01T06:00:00Z"),
    });
    const d = await mkSubmitted(g, { invoiceDate: "2025-11-10" });
    expect(d.dueDate).toBe("2025-12-10");
    expect(d.overdue).toBe(true);
    expect(d.paymentStatus).toBe("unpaid");
  });
  test("BR-SINV-28 a draft past its due date is not overdue", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }], {
      terms: 30,
      poCreatedAt: new Date("2025-01-01T06:00:00Z"),
    });
    const d = await mkDraft(g, { invoiceDate: "2025-11-10" });
    expect(d.overdue).toBe(false);
  });
});

describe("BR-SINV-32 tolerances in company settings", () => {
  test("BR-SINV-32 defaults are price 0% and weight 0.5%", async () => {
    await ensureCompany();
    const r = await raw(
      "GET",
      "/api/company/invoice-tolerances",
      await ownerA(),
    );
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({
      priceTolerancePercent: 0,
      weightTolerancePercent: 0.5,
    });
  });
  test("BR-SINV-32 owner saves weight 1%, it is logged as basis points old -> new", async () => {
    await ensureCompany();
    const owner = await ownerA();
    const r = await raw("PATCH", "/api/company/invoice-tolerances", owner, {
      weightTolerancePercent: 1,
    });
    expect(r.status).toBe(200);
    expect(r.json.data.weightTolerancePercent).toBe(1);
    expect(r.json.data.priceTolerancePercent).toBe(0);
    const rows = await db
      .select()
      .from(companySettingsHistory)
      .where(eq(companySettingsHistory.createdBy, owner.id));
    const row = rows.find((h) => h.field === "weightToleranceBp");
    expect(row?.oldValue).toBe("50");
    expect(row?.newValue).toBe("100");
    await ensureCompany();
  });
  test.each([
    ["weight 12", { weightTolerancePercent: 12 }],
    ["price 10.01", { priceTolerancePercent: 10.01 }],
    ["3 decimals", { weightTolerancePercent: 0.505 }],
    ["negative", { priceTolerancePercent: -1 }],
    ["empty body", {}],
  ])("BR-SINV-32 %s is 400", async (_n, body) => {
    await ensureCompany();
    expect(
      (
        await raw(
          "PATCH",
          "/api/company/invoice-tolerances",
          await ownerA(),
          body,
        )
      ).status,
    ).toBe(400);
    const r = await raw(
      "GET",
      "/api/company/invoice-tolerances",
      await ownerA(),
    );
    expect(r.json.data).toEqual({
      priceTolerancePercent: 0,
      weightTolerancePercent: 0.5,
    });
  });
  test("BR-SINV-32 0 and 10 are accepted limits", async () => {
    await ensureCompany();
    const o = await ownerA();
    expect(
      (
        await raw("PATCH", "/api/company/invoice-tolerances", o, {
          priceTolerancePercent: 10,
          weightTolerancePercent: 0,
        })
      ).status,
    ).toBe(200);
    await ensureCompany();
  });
  test("BR-SINV-32 without a company row the change is 409", async () => {
    await db.delete(companySettings);
    const r = await raw(
      "PATCH",
      "/api/company/invoice-tolerances",
      await ownerA(),
      { weightTolerancePercent: 1 },
    );
    await ensureCompany();
    expect(r.status).toBe(409);
  });
  test("BR-SINV-32 a change does not re-check a blocked invoice and applies to the next submit only", async () => {
    await ensureCompany();
    const g = await std();
    const lines = [
      { grnItemId: g.lineIds[0]!, qty: 980, ratePaise: 24100, gstPercent: 18 },
    ];
    const d = await mkSubmitted(g, { lines });
    expect(d.status).toBe("blocked");
    expect(d.tolerances.priceTolBpUsed).toBe(0);
    expect(
      (
        await raw("PATCH", "/api/company/invoice-tolerances", await ownerA(), {
          priceTolerancePercent: 5,
        })
      ).status,
    ).toBe(200);
    const same = await detail(d.id);
    expect(same.status).toBe("blocked");
    expect(same.tolerances.priceTolBpUsed).toBe(0);
    expect((await backToDraft(d.id)).status).toBe(200);
    const again = await submit(d.id);
    expect(again.json.data.status).toBe("approved");
    expect(again.json.data.tolerances.priceTolBpUsed).toBe(500);
    await ensureCompany();
  });
});

describe("BR-SINV-35 history of create, edit and delete", () => {
  test("BR-SINV-35 create writes a history row with who and the new status", async () => {
    const g = await std();
    const d = await mkDraft(g);
    const rows = await historyOf(d.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("create");
    expect(rows[0]!.toStatus).toBe("draft");
    expect(rows[0]!.createdBy).toBe((await bo()).id);
  });
  test("BR-SINV-35 an edit row stores the changed field, old -> new", async () => {
    const g = await std();
    const d = await mkDraft(g, {
      lines: [
        {
          grnItemId: g.lineIds[0]!,
          qty: 980,
          ratePaise: 24100,
          gstPercent: 18,
        },
      ],
    });
    const fixed = [
      { grnItemId: g.lineIds[0]!, qty: 980, ratePaise: 24000, gstPercent: 18 },
    ];
    const r = await sinv("PATCH", "/updatesupplierinvoice", await bo(), {
      id: d.id,
      lines: fixed,
      printed: printed(fixed),
    });
    expect(r.status).toBe(200);
    const edit = (await historyOf(d.id)).find((h) => h.action === "edit");
    expect(edit).toBeDefined();
    const s = JSON.stringify(edit!.detail);
    expect(s).toContain("24100");
    expect(s).toContain("24000");
  });
  test("BR-SINV-35 the detail returns the history, newest data with who (name)", async () => {
    const g = await std();
    const d = await mkDraft(g);
    const det = await detail(d.id);
    expect(det.history[0].action).toBe("create");
    expect(det.history[0].createdBy).toBe((await bo()).id);
  });
});

describe("BR-SINV-37 list, chips, search", () => {
  test("BR-SINV-37 status filters, chip counts, legacy only under All", async () => {
    const sup = await newSupplier();
    const g = await mkGrn(
      Array.from({ length: 6 }, () => ({
        qty: 1000,
        accepted: 980,
        rejected: 20,
      })),
      {
        supplier: sup,
        terms: 30,
        poCreatedAt: new Date("2025-01-01T06:00:00Z"),
      },
    );
    const one = (i: number, o: Over = {}) =>
      mkDraft(g, {
        lines: [
          {
            grnItemId: g.lineIds[i]!,
            qty: 980,
            ratePaise: 24000,
            gstPercent: 18,
          },
        ],
        ...o,
      });
    const draft = await one(0);
    const blockedD = await one(1, {
      lines: [
        {
          grnItemId: g.lineIds[1]!,
          qty: 980,
          ratePaise: 24100,
          gstPercent: 18,
        },
      ],
    });
    await submit(blockedD.id);
    const payable = await one(2);
    await submit(payable.id);
    const overdue = await one(3, { invoiceDate: "2025-11-10" });
    await submit(overdue.id);
    const cancelled = await one(4);
    await submit(cancelled.id);
    await cancel(cancelled.id);
    const [legacy] = await db
      .insert(supplierInvoices)
      .values({
        ourNumber: `LEGACY-${uid()}`,
        invoiceNumber: "OLD-9",
        invoiceDate: "2025-02-01",
        poId: g.poId,
        supplierId: sup,
        status: "legacy",
        billedAmountPaise: 100,
        createdBy: (await ownerA()).id,
      })
      .returning({ id: supplierInvoices.id });
    const list = async (q: string) => {
      const r = await sinv(
        "GET",
        `/getsupplierinvoices?supplierId=${sup}&pageSize=100${q}`,
        await ownerA(),
      );
      expect(r.status).toBe(200);
      return r;
    };
    const ids = (r: { json: any }) =>
      (r.json.data as { id: number }[]).map((x) => x.id);
    expect(ids(await list("&status=draft"))).toEqual([draft.id]);
    expect(ids(await list("&status=blocked"))).toEqual([blockedD.id]);
    expect(ids(await list("&status=cancelled"))).toEqual([cancelled.id]);
    expect(ids(await list("&status=overdue"))).toEqual([overdue.id]);
    expect(ids(await list("&status=payable"))).toContain(payable.id);
    expect(ids(await list("&status=payable"))).not.toContain(blockedD.id);
    const all = ids(await list(""));
    expect(all).toContain(legacy!.id);
    for (const s of ["draft", "blocked", "payable", "overdue", "cancelled"])
      expect(ids(await list(`&status=${s}`))).not.toContain(legacy!.id);
    const counts = (await list("")).json.meta.statusCounts;
    expect(counts.draft).toBeGreaterThanOrEqual(1);
    expect(counts.blocked).toBeGreaterThanOrEqual(1);
    expect(counts.cancelled).toBeGreaterThanOrEqual(1);
    expect(counts.overdue).toBeGreaterThanOrEqual(1);
    expect(counts.payable).toBeGreaterThanOrEqual(1);
  });
  test("BR-SINV-37 search by our number, supplier bill number, supplier name and PO number", async () => {
    const g = await std();
    const d = await mkDraft(g, {
      invoiceNumber: `ZQ${Date.now().toString(36).toUpperCase().slice(-6)}`,
    });
    const [sup] = await db
      .select()
      .from(supplierMaster)
      .where(eq(supplierMaster.id, g.supplierId));
    for (const q of [d.ourNumber, d.invoiceNumber, sup!.name, g.poNumber]) {
      const r = await sinv(
        "GET",
        `/getsupplierinvoices?q=${encodeURIComponent(q)}`,
        await ownerA(),
      );
      expect(r.status).toBe(200);
      expect((r.json.data as { id: number }[]).map((x) => x.id)).toContain(
        d.id,
      );
    }
  });
  test("BR-SINV-37 supplierId, poId and grnId filters narrow the list", async () => {
    const g = await std();
    const d = await mkDraft(g);
    for (const f of [
      `supplierId=${g.supplierId}`,
      `poId=${g.poId}`,
      `grnId=${g.grnId}`,
    ]) {
      const r = await sinv("GET", `/getsupplierinvoices?${f}`, await ownerA());
      expect((r.json.data as { id: number }[]).map((x) => x.id)).toEqual([
        d.id,
      ]);
    }
  });
  test("BR-SINV-37 rows carry supplier, PO number and overdue; paging in meta", async () => {
    const g = await std();
    await mkDraft(g);
    const r = await sinv(
      "GET",
      `/getsupplierinvoices?poId=${g.poId}&page=1&pageSize=1`,
      await ownerA(),
    );
    const row = r.json.data[0];
    expect(row.supplier.id).toBe(g.supplierId);
    expect(row.poNumber).toBe(g.poNumber);
    expect(row.overdue).toBe(false);
    expect(r.json.meta.page).toBe(1);
    expect(r.json.meta.pageSize).toBe(1);
    expect(r.json.meta.total).toBe(1);
  });
  test("BR-SINV-37 pageSize above 100 and a search over 100 chars are 400", async () => {
    expect(
      (await sinv("GET", "/getsupplierinvoices?pageSize=101", await ownerA()))
        .status,
    ).toBe(400);
    expect(
      (
        await sinv(
          "GET",
          `/getsupplierinvoices?q=${"x".repeat(101)}`,
          await ownerA(),
        )
      ).status,
    ).toBe(400);
  });
  test("BR-SINV-37 a legacy row is read-only: submit, edit, delete, cancel are 409", async () => {
    const g = await std();
    const [legacy] = await db
      .insert(supplierInvoices)
      .values({
        ourNumber: `LEGACY-${uid()}`,
        invoiceNumber: "OLD-7",
        invoiceDate: istDay(-3),
        poId: g.poId,
        supplierId: g.supplierId,
        status: "legacy",
        billedAmountPaise: 100,
        createdBy: (await ownerA()).id,
      })
      .returning({ id: supplierInvoices.id });
    const b = await bo();
    const id = legacy!.id;
    expect((await submit(id)).status).toBe(409);
    expect(
      (
        await sinv("PATCH", "/updatesupplierinvoice", b, {
          id,
          invoiceNumber: "NEW",
        })
      ).status,
    ).toBe(409);
    expect(
      (await sinv("DELETE", `/deletesupplierinvoice/${id}`, b)).status,
    ).toBe(409);
    expect((await cancel(id)).status).toBe(409);
    expect(
      (
        await sinv("POST", `/${id}/release`, await ownerB(), {
          reason: "agreed by phone",
        })
      ).status,
    ).toBe(409);
  });
});

describe("BR-SINV-11 stock is never touched by an invoice", () => {
  test("BR-SINV-11 create, submit and cancel post nothing to the ledger", async () => {
    const g = await std();
    const before = await ledgerCount(g.itemIds);
    const d = await mkSubmitted(g);
    await cancel(d.id);
    expect(await ledgerCount(g.itemIds)).toBe(before);
  });
});

describe("BR-SINV-10 / A-48 strict bodies: computed and unknown fields are 400", () => {
  test.each([
    ["status", "approved"],
    ["totalCgstPaise", 100],
    ["totalPaise", 100],
    ["dueDate", "2030-01-01"],
    ["supplierId", 1],
    ["notAField", "x"],
  ])("A-48 create with %s in the body is 400", async (field, value) => {
    const g = await std();
    const b = await bo();
    const r = await sinv("POST", "/createsupplierinvoice", b, {
      ...payload(g),
      [field]: value,
    });
    expect(r.status).toBe(400);
  });
  test("A-48 create with a computed taxablePaise on a line is 400", async () => {
    const g = await std();
    const b = await bo();
    const body = payload(g);
    const r = await sinv("POST", "/createsupplierinvoice", b, {
      ...body,
      lines: body.lines.map((l) => ({ ...l, taxablePaise: 23520000 })),
    });
    expect(r.status).toBe(400);
  });
  test("A-48 a refused create leaves no invoice behind", async () => {
    const g = await std();
    const b = await bo();
    await sinv("POST", "/createsupplierinvoice", b, {
      ...payload(g),
      totalCgstPaise: 1,
    });
    const rows = await db
      .select({ id: supplierInvoices.id })
      .from(supplierInvoices)
      .where(eq(supplierInvoices.poId, g.poId));
    expect(rows).toHaveLength(0);
  });
  test.each([
    ["status", "approved"],
    ["totalCgstPaise", 100],
    ["notAField", "x"],
  ])("A-48 update with %s in the body is 400", async (field, value) => {
    const g = await std();
    const d = await mkDraft(g);
    const r = await sinv("PATCH", "/updatesupplierinvoice", await bo(), {
      id: d.id,
      invoiceNumber: "STRICT-1",
      [field]: value,
    });
    expect(r.status).toBe(400);
    expect((await invRow(d.id))!.invoiceNumber).toBe(d.invoiceNumber);
  });
  test("A-48 update with a computed taxablePaise on a line is 400", async () => {
    const g = await std();
    const d = await mkDraft(g);
    const r = await sinv("PATCH", "/updatesupplierinvoice", await bo(), {
      id: d.id,
      lines: [
        {
          grnItemId: g.lineIds[0],
          qty: 980,
          ratePaise: 24000,
          gstPercent: 18,
          taxablePaise: 1,
        },
      ],
    });
    expect(r.status).toBe(400);
  });
});

describe("BR-SINV-04 / 38 getbillablelines by PO status", () => {
  test.each([
    "invoiced",
    "cancelled",
    "draft",
    "pending_approval",
    "approved",
    "dispatched",
  ])(
    "BR-SINV-04 getbillablelines on a PO in %s is 409 SINV_PO_NOT_BILLABLE",
    async (status) => {
      const g = await std();
      await setPoStatus(g.poId, status);
      const r = await sinv(
        "GET",
        `/getbillablelines?poId=${g.poId}`,
        await bo(),
      );
      expect(r.status).toBe(409);
      expect(r.json.code).toBe("SINV_PO_NOT_BILLABLE");
    },
  );
  test.each(["partial_received", "fully_received", "closed"])(
    "BR-SINV-38 getbillablelines on a PO in %s lists the billable line",
    async (status) => {
      const g = await std();
      await setPoStatus(g.poId, status);
      const r = await sinv(
        "GET",
        `/getbillablelines?poId=${g.poId}`,
        await bo(),
      );
      expect(r.status).toBe(200);
      expect(r.json.data.lines.map((l: any) => l.grnItemId)).toContain(
        g.lineIds[0],
      );
    },
  );
});
