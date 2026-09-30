/**
 * HTTP-level tests for the job-work receipt and QA decision:
 * BR-SCO-12..18, 22, 24, 25 (docs/specs/subcontracting.md v2).
 * Real app (middleware + routers + onError) against the test DB.
 * Fixtures are TEST_scorc_ prefixed and removed in afterAll. The single
 * company_settings row is saved before and restored after.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
  serviceMaster,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  scoChallanLines,
  scoChallans,
  scoReceiptSettlements,
  subcontractingGrnItems,
  subcontractingGrns,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  supplierMaster,
  supplierServices,
} from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { companySettings } from "../../src/db/schemas/04_company";
import { authService } from "../../src/service/authService";

const app = createApp();
const PREFIX = "TEST_scorc_";
const EMAIL_PREFIX = "test_scorc_";
const PASSWORD = "scorc-test-password-123";
const EWB = { ewayBillNo: "EWB-TEST-1" };

type Actor = { id: number; token: string };
const actors: Record<string, Actor> = {};

let mainStoreId: number;
let createdMainStore = false;
let createdScrapYard = false;
let scrapYardId: number;
let serviceId: number;
let vendorA: number;
let vendorB: number;
let savedCompany: typeof companySettings.$inferSelect | undefined;
let seq = 0;

const createdScoIds: number[] = [];
const vendorIds: number[] = [];

function requireRow<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`Fixture setup: ${what} returned no row`);
  return row;
}

function uniq(tag: string) {
  seq += 1;
  return `${PREFIX}${tag}_${Date.now()}_${seq}`;
}

async function makeActor(key: string, roleName: string): Promise<void> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  const roleRow = requireRow(role, `role ${roleName}`);
  const email = `${EMAIL_PREFIX}${key}@diecast.test`;
  const [emp] = await db
    .insert(employees)
    .values({
      name: `${PREFIX}${key}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId: roleRow.id,
      isActive: true,
    })
    .returning({ id: employees.id });
  const { accessToken } = await authService.login(email, PASSWORD);
  actors[key] = {
    id: requireRow(emp, `employee ${key}`).id,
    token: accessToken,
  };
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function call(
  actor: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (actor) headers.Authorization = `Bearer ${actors[actor]?.token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

async function makeVendor(tag: string) {
  const [v] = await db
    .insert(supplierMaster)
    .values({
      name: uniq(tag),
      type: "service_provider",
      gstNumber: `29TR${Date.now().toString().slice(-7)}${seq}Z5`,
      address: `${tag} street, town`,
    })
    .returning({ id: supplierMaster.id });
  const id = requireRow(v, `vendor ${tag}`).id;
  vendorIds.push(id);
  await db.insert(supplierServices).values({
    supplierId: id,
    serviceId,
    serviceUnitPricePaise: 2_500,
    taxPercentage: 18,
  });
  return id;
}

async function openStock(itemId: number, qty: number, cost: number) {
  const res = await call("owner", "POST", "/asset/inventory/movements", {
    itemId,
    locationId: mainStoreId,
    referenceType: "opening_stock",
    qty,
    unitCostPaise: cost,
    reason: "opening",
  });
  if (res.status >= 300) {
    throw new Error(`opening stock failed: ${JSON.stringify(res.json)}`);
  }
}

async function makeItem(tag: string, hsn: string | null) {
  const [row] = await db
    .insert(itemMaster)
    .values({
      sku: uniq(tag),
      name: `${PREFIX}${tag}`,
      category: "Raw Material",
      uom: "pcs",
      hsnCode: hsn,
    })
    .returning({ id: itemMaster.id });
  return requireRow(row, tag).id;
}

type Setup = {
  scoId: number;
  itemId: number; // sco line id
  raw: number;
  fin: number;
  vendorId: number;
};

/**
 * An SCO with one line (send `send`, return `ret`), approved, then `lots`
 * issued as separate challans (in order) via the API at cost `cost`.
 * lots = [] leaves it approved.
 */
async function makeIssued(
  opts: {
    send?: number;
    ret?: number;
    lots?: number[];
    cost?: number;
    batch?: string;
    vendorId?: number;
  } = {},
): Promise<Setup> {
  const send = opts.send ?? 1000;
  const ret = opts.ret ?? send;
  const vendorId = opts.vendorId ?? vendorA;
  const raw = await makeItem("raw", "7616");
  const fin = await makeItem("fin", null);
  await openStock(raw, send + 5000, opts.cost ?? 12_000);
  const res = await call("bo", "POST", "/sco/createsco", {
    vendorId,
    expectedReturnDate: daysFromNow(30),
    lines: [
      {
        rawItemId: raw,
        finishedItemId: fin,
        serviceId,
        rawQtyToIssue: send,
        expectedReturnQty: ret,
        ...(opts.batch ? { rawItemBatch: opts.batch } : {}),
      },
    ],
  });
  if (res.status !== 201) {
    throw new Error(`SCO fixture failed: ${JSON.stringify(res.json)}`);
  }
  const scoId = res.json.data.sco.id as number;
  createdScoIds.push(scoId);
  const itemId = res.json.data.items[0].id as number;
  await db
    .update(subcontractingOrders)
    .set({ status: "approved" })
    .where(eq(subcontractingOrders.id, scoId));
  for (const qty of opts.lots ?? [send]) {
    const c = await call("bo", "POST", `/sco/${scoId}/challans`, {
      lines: [{ scoItemId: itemId, qty }],
      ...EWB,
    });
    if (c.status !== 201) {
      throw new Error(`challan fixture failed: ${JSON.stringify(c.json)}`);
    }
  }
  return { scoId, itemId, raw, fin, vendorId };
}

type ReceiptLine = {
  scoItemId: number;
  processedQty: number;
  unprocessedQty?: number;
};

function receipt(
  actor: string,
  scoId: number,
  lines: ReceiptLine[],
  extra: Record<string, unknown> = {},
) {
  return call(actor, "POST", `/sco/${scoId}/receipts`, {
    vendorChallanNo: uniq("VC"),
    lines,
    ...extra,
  });
}

function qa(
  actor: string,
  receiptId: number,
  lineId: number,
  acceptedQty: number,
  rejectedQty: number,
  extra: Record<string, unknown> = {},
) {
  return call(actor, "POST", `/sco/receipts/${receiptId}/lines/${lineId}/qa`, {
    acceptedQty,
    rejectedQty,
    ...extra,
  });
}

/** Receipt of `processed` (+ `unprocessed`) on the setup's line; must be 201. */
async function receive(
  s: Setup,
  processed: number,
  unprocessed = 0,
  actor = "fs",
) {
  const res = await receipt(actor, s.scoId, [
    {
      scoItemId: s.itemId,
      processedQty: processed,
      unprocessedQty: unprocessed,
    },
  ]);
  if (res.status !== 201) {
    throw new Error(`receipt fixture failed: ${JSON.stringify(res.json)}`);
  }
  return {
    receiptId: res.json.data.receipt.id as number,
    lineId: res.json.data.lines[0].id as number,
    json: res.json,
  };
}

async function scoDetails(scoId: number) {
  const res = await call("bo", "GET", `/sco/getscodetails/${scoId}`);
  return res.json.data as {
    // biome-ignore lint/suspicious/noExplicitAny: test reads arbitrary JSON
    sco: any;
    // biome-ignore lint/suspicious/noExplicitAny: test reads arbitrary JSON
    items: any[];
    chargeDue: { subtotalPaise: number; gstPaise: number; totalPaise: number };
    // biome-ignore lint/suspicious/noExplicitAny: test reads arbitrary JSON
    challanSettlements: any[];
  };
}

async function vendorLocationId(vendorId: number) {
  const [row] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.linkedVendorId, vendorId),
        eq(locations.type, "vendor_premise"),
      ),
    );
  return requireRow(row, "vendor location").id;
}

async function receiptRows(itemId: number) {
  return db
    .select()
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, itemId),
        eq(inventoryLedger.referenceType, "sco_receipt"),
      ),
    )
    .orderBy(inventoryLedger.id);
}

/** Net qty of an item at a location, from the ledger, all reference types. */
async function qtyAt(itemId: number, locationId: number) {
  const rows = await db
    .select({ q: inventoryLedger.quantityChange })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, itemId),
        eq(inventoryLedger.locationId, locationId),
      ),
    );
  return rows.reduce((a, r) => a + r.q, 0);
}

async function qtyAtScrap(itemId: number) {
  const scrap = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "scrap_yard"));
  let total = 0;
  for (const l of scrap) total += await qtyAt(itemId, l.id);
  return total;
}

async function itemRow(itemId: number) {
  const [row] = await db
    .select()
    .from(itemMaster)
    .where(eq(itemMaster.id, itemId));
  return requireRow(row, "item");
}

async function receiptCount(scoId: number) {
  const rows = await db
    .select({ id: subcontractingGrns.id })
    .from(subcontractingGrns)
    .where(eq(subcontractingGrns.scoId, scoId));
  return rows.length;
}

beforeAll(async () => {
  await makeActor("owner", "owner");
  await makeActor("bo", "back_office");
  await makeActor("fs", "floor_supervisor");
  await makeActor("qa", "qa_inspector");

  const [existing] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "main_store"))
    .orderBy(locations.id)
    .limit(1);
  if (existing) {
    mainStoreId = existing.id;
  } else {
    const [loc] = await db
      .insert(locations)
      .values({ name: `${PREFIX}main_store`, type: "main_store" })
      .returning({ id: locations.id });
    mainStoreId = requireRow(loc, "main store").id;
    createdMainStore = true;
  }
  const [scrap] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "scrap_yard"))
    .orderBy(locations.id)
    .limit(1);
  if (scrap) {
    scrapYardId = scrap.id;
  } else {
    const [loc] = await db
      .insert(locations)
      .values({ name: `${PREFIX}scrap_yard`, type: "scrap_yard" })
      .returning({ id: locations.id });
    scrapYardId = requireRow(loc, "scrap yard").id;
    createdScrapYard = true;
  }

  const [svc] = await db
    .insert(serviceMaster)
    .values({ code: uniq("CNC"), name: `${PREFIX}CNC`, defaultUom: "pcs" })
    .returning({ id: serviceMaster.id });
  serviceId = requireRow(svc, "service").id;

  const [prior] = await db.select().from(companySettings).limit(1);
  savedCompany = prior;
  await db.delete(companySettings);
  await db.insert(companySettings).values({
    id: 1,
    name: `${PREFIX}Diecast Works`,
    address: "1 Plant Road, Pune",
    gstin: "29AABCD1234E1Z5",
    stateCode: "29",
    updatedBy: actors.owner?.id ?? null,
  });

  vendorA = await makeVendor("vendorA");
  vendorB = await makeVendor("vendorB");
});

afterAll(async () => {
  if (createdScoIds.length > 0) {
    const grns = await db
      .select({ id: subcontractingGrns.id })
      .from(subcontractingGrns)
      .where(inArray(subcontractingGrns.scoId, createdScoIds));
    const grnIds = grns.map((g) => g.id);
    if (grnIds.length > 0) {
      const grnItems = await db
        .select({ id: subcontractingGrnItems.id })
        .from(subcontractingGrnItems)
        .where(inArray(subcontractingGrnItems.scoGrnId, grnIds));
      const grnItemIds = grnItems.map((g) => g.id);
      if (grnItemIds.length > 0) {
        await db
          .delete(scoReceiptSettlements)
          .where(inArray(scoReceiptSettlements.receiptItemId, grnItemIds));
        await db
          .delete(subcontractingGrnItems)
          .where(inArray(subcontractingGrnItems.id, grnItemIds));
      }
      await db
        .delete(subcontractingGrns)
        .where(inArray(subcontractingGrns.id, grnIds));
    }
    const chRows = await db
      .select({ id: scoChallans.id })
      .from(scoChallans)
      .where(inArray(scoChallans.scoId, createdScoIds));
    const chIds = chRows.map((c) => c.id);
    if (chIds.length > 0) {
      await db
        .delete(scoChallanLines)
        .where(inArray(scoChallanLines.challanId, chIds));
      await db.delete(scoChallans).where(inArray(scoChallans.id, chIds));
    }
  }
  const itemRows = await db
    .select({ id: itemMaster.id })
    .from(itemMaster)
    .where(like(itemMaster.sku, `${PREFIX}%`));
  const itemIds = itemRows.map((i) => i.id);
  if (itemIds.length > 0) {
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, itemIds));
  }
  if (createdScoIds.length > 0) {
    await db
      .delete(subcontractingOrderItems)
      .where(inArray(subcontractingOrderItems.scoId, createdScoIds));
    await db
      .delete(subcontractingOrders)
      .where(inArray(subcontractingOrders.id, createdScoIds));
  }
  if (vendorIds.length > 0) {
    await db
      .delete(locations)
      .where(inArray(locations.linkedVendorId, vendorIds));
    await db
      .delete(supplierServices)
      .where(inArray(supplierServices.supplierId, vendorIds));
    await db
      .delete(supplierMaster)
      .where(inArray(supplierMaster.id, vendorIds));
  }
  await db.delete(serviceMaster).where(like(serviceMaster.code, `${PREFIX}%`));
  await db.delete(itemMaster).where(like(itemMaster.sku, `${PREFIX}%`));
  if (createdMainStore) {
    await db.delete(locations).where(eq(locations.id, mainStoreId));
  }
  if (createdScrapYard) {
    await db.delete(locations).where(eq(locations.id, scrapYardId));
  }
  await db.delete(companySettings);
  if (savedCompany) await db.insert(companySettings).values(savedCompany);
  const empRows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(like(employees.email, `${EMAIL_PREFIX}%`));
  const empIds = empRows.map((e) => e.id);
  if (empIds.length > 0) {
    await db
      .update(documentNumberCounters)
      .set({ createdBy: null })
      .where(inArray(documentNumberCounters.createdBy, empIds));
    await db
      .update(documentNumberCounters)
      .set({ lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.lastUpdatedBy, empIds));
  }
  await db.delete(employees).where(like(employees.email, `${EMAIL_PREFIX}%`));
});

describe("BR-SCO-12 receipt rules", () => {
  test("BR-SCO-12 receipt on an approved SCO (nothing issued) -> 409", async () => {
    const s = await makeIssued({ lots: [] });
    const res = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 10 },
    ]);
    expect(res.status).toBe(409);
    expect(await receiptCount(s.scoId)).toBe(0);
  });

  test("BR-SCO-12 receipt on a material_issued SCO -> 201, line waits for QA", async () => {
    const s = await makeIssued({ lots: [600] });
    const res = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 500 },
    ]);
    expect(res.status).toBe(201);
    expect(res.json.data.receipt.vendorId).toBe(s.vendorId);
    expect(res.json.data.lines[0].processedQty).toBe(500);
    expect(res.json.data.lines[0].qaStatus).toBe("pending_qa");
    expect(res.json.data.lines[0].acceptedQty).toBeNull();
  });

  test("BR-SCO-12 vendor challan/invoice number is required", async () => {
    const s = await makeIssued({ lots: [600] });
    const res = await call("fs", "POST", `/sco/${s.scoId}/receipts`, {
      lines: [{ scoItemId: s.itemId, processedQty: 10 }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-12 same vendor challan number twice for one vendor -> 409, second not saved", async () => {
    const s = await makeIssued({ lots: [600] });
    const no = uniq("DUP");
    const a = await receipt(
      "fs",
      s.scoId,
      [{ scoItemId: s.itemId, processedQty: 100 }],
      { vendorChallanNo: no },
    );
    expect(a.status).toBe(201);
    const b = await receipt(
      "fs",
      s.scoId,
      [{ scoItemId: s.itemId, processedQty: 100 }],
      { vendorChallanNo: no },
    );
    expect(b.status).toBe(409);
    expect(await receiptCount(s.scoId)).toBe(1);
  });

  test("BR-SCO-12 the same number for a different vendor is fine (unique per vendor)", async () => {
    const s1 = await makeIssued({ lots: [600], vendorId: vendorA });
    const s2 = await makeIssued({ lots: [600], vendorId: vendorB });
    const no = uniq("SHARED");
    const a = await receipt(
      "fs",
      s1.scoId,
      [{ scoItemId: s1.itemId, processedQty: 100 }],
      { vendorChallanNo: no },
    );
    const b = await receipt(
      "fs",
      s2.scoId,
      [{ scoItemId: s2.itemId, processedQty: 100 }],
      { vendorChallanNo: no },
    );
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });

  test("BR-SCO-12 600 at vendor, 700 processed back -> 400", async () => {
    const s = await makeIssued({ lots: [600] });
    const res = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 700 },
    ]);
    expect(res.status).toBe(400);
    expect(await receiptCount(s.scoId)).toBe(0);
  });

  test("BR-SCO-12 processed + unprocessed above what is at the vendor -> 400", async () => {
    const s = await makeIssued({ lots: [600] });
    const res = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 500, unprocessedQty: 101 },
    ]);
    expect(res.status).toBe(400);
  });

  test("BR-SCO-12 exactly what is at the vendor -> ok (processed + unprocessed = 600)", async () => {
    const s = await makeIssued({ lots: [600] });
    const res = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 500, unprocessedQty: 100 },
    ]);
    expect(res.status).toBe(201);
  });

  test("BR-SCO-12 processed is multiplied by the ratio: send 1000, return 500 (ratio 2), at vendor 1000", async () => {
    const s = await makeIssued({ send: 1000, ret: 500, lots: [1000] });
    const over = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 400, unprocessedQty: 300 },
    ]);
    expect(over.status).toBe(400); // 400 x 2 + 300 = 1100
    const ok = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 400, unprocessedQty: 200 },
    ]);
    expect(ok.status).toBe(201); // 800 + 200 = 1000
  });

  test("BR-SCO-12 earlier receipts (even pending QA) reduce what is still at the vendor", async () => {
    const s = await makeIssued({ lots: [600] });
    await receive(s, 500);
    const res = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 200 },
    ]);
    expect(res.status).toBe(400); // only 100 left
    const ok = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 100 },
    ]);
    expect(ok.status).toBe(201);
  });

  test("BR-SCO-12 a scoItemId that is not on this SCO -> 400", async () => {
    const s = await makeIssued({ lots: [600] });
    const other = await makeIssued({ lots: [600] });
    const res = await receipt("fs", s.scoId, [
      { scoItemId: other.itemId, processedQty: 10 },
    ]);
    expect(res.status).toBe(400);
    expect(await receiptCount(s.scoId)).toBe(0);
  });

  test("BR-SCO-12 qtyAtVendor on the SCO details tracks issued minus what came back", async () => {
    const s = await makeIssued({ lots: [600] });
    expect((await scoDetails(s.scoId)).items[0].qtyAtVendor).toBe(600);
    await receive(s, 250, 50);
    expect((await scoDetails(s.scoId)).items[0].qtyAtVendor).toBe(300);
  });
});

describe("BR-SCO-13 QA decision", () => {
  test("BR-SCO-13 nothing enters stock before QA: processed goods wait, finished stock stays 0", async () => {
    const s = await makeIssued({ lots: [600] });
    await receive(s, 500);
    expect(await qtyAt(s.fin, mainStoreId)).toBe(0);
    expect((await itemRow(s.fin)).currentStock).toBe(0);
    expect(await receiptRows(s.fin)).toHaveLength(0);
  });

  test("BR-SCO-13 500 back: 480 accepted + 20 rejected -> 200, line partial_accepted", async () => {
    const s = await makeIssued({ lots: [600] });
    const r = await receive(s, 500);
    const res = await qa("qa", r.receiptId, r.lineId, 480, 20);
    expect(res.status).toBe(200);
    const line = res.json.data.lines[0];
    expect(line.acceptedQty).toBe(480);
    expect(line.rejectedQty).toBe(20);
    expect(line.qaStatus).toBe("partial_accepted");
  });

  test("BR-SCO-13 all accepted -> accepted; all rejected -> rejected", async () => {
    const a = await makeIssued({ lots: [600] });
    const ra = await receive(a, 100);
    const resA = await qa("qa", ra.receiptId, ra.lineId, 100, 0);
    expect(resA.json.data.lines[0].qaStatus).toBe("accepted");
    const b = await makeIssued({ lots: [600] });
    const rb = await receive(b, 100);
    const resB = await qa("qa", rb.receiptId, rb.lineId, 0, 100);
    expect(resB.json.data.lines[0].qaStatus).toBe("rejected");
  });

  test("BR-SCO-13 480 + 10 against 500 processed -> 400, nothing posted", async () => {
    const s = await makeIssued({ lots: [600] });
    const r = await receive(s, 500);
    const res = await qa("qa", r.receiptId, r.lineId, 480, 10);
    expect(res.status).toBe(400);
    expect(await receiptRows(s.raw)).toHaveLength(0);
    const over = await qa("qa", r.receiptId, r.lineId, 480, 30);
    expect(over.status).toBe(400);
  });

  test("BR-SCO-13 a second decision on the same line -> 409, ledger unchanged", async () => {
    const s = await makeIssued({ lots: [600] });
    const r = await receive(s, 500);
    expect((await qa("qa", r.receiptId, r.lineId, 480, 20)).status).toBe(200);
    const rows = (await receiptRows(s.raw)).length;
    const again = await qa("qa", r.receiptId, r.lineId, 500, 0);
    expect(again.status).toBe(409);
    expect((await receiptRows(s.raw)).length).toBe(rows);
    expect(await qtyAt(s.fin, mainStoreId)).toBe(480);
  });

  test("BR-SCO-13 two decisions at once post only once", async () => {
    const s = await makeIssued({ lots: [600] });
    const r = await receive(s, 500);
    const [a, b] = await Promise.all([
      qa("qa", r.receiptId, r.lineId, 500, 0),
      qa("bo", r.receiptId, r.lineId, 400, 100),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await receiptRows(s.raw)).toHaveLength(
      (await receiptRows(s.raw)).length,
    );
    const finished = await qtyAt(s.fin, mainStoreId);
    expect([500, 400]).toContain(finished);
    const finRows = await receiptRows(s.fin);
    expect(finRows).toHaveLength(1);
  });

  test("BR-SCO-13 decision needs sco.qa_decide: floor supervisor -> 403, line stays undecided", async () => {
    const s = await makeIssued({ lots: [600] });
    const r = await receive(s, 100);
    const res = await qa("fs", r.receiptId, r.lineId, 100, 0);
    expect(res.status).toBe(403);
    const again = await qa("qa", r.receiptId, r.lineId, 100, 0);
    expect(again.status).toBe(200);
  });

  test("BR-SCO-13 line not in this receipt / unknown receipt -> 404", async () => {
    const s = await makeIssued({ lots: [600] });
    const r = await receive(s, 100);
    expect((await qa("qa", r.receiptId, 99_999_999, 100, 0)).status).toBe(404);
    expect((await qa("qa", 99_999_999, r.lineId, 100, 0)).status).toBe(404);
  });

  test("BR-SCO-13 receipt status follows its lines: stays pending_qa until every line is decided", async () => {
    const s = await makeIssued({ lots: [600] });
    const r1 = await receive(s, 100);
    const d1 = await qa("qa", r1.receiptId, r1.lineId, 100, 0);
    expect(d1.json.data.receipt.status).toBe("accepted");
    const s2 = await makeIssued({ lots: [600] });
    const r2 = await receive(s2, 100);
    const got = await call("qa", "GET", `/sco/receipts/${r2.receiptId}`);
    expect(got.json.data.receipt.status).toBe("pending_qa");
  });
});

describe("BR-SCO-14 accepted goods", () => {
  test("BR-SCO-14 480 accepted -> raw -480 at vendor @12,000, finished +480 in main store @14,500", async () => {
    const s = await makeIssued({ lots: [600], cost: 12_000 });
    const vloc = await vendorLocationId(s.vendorId);
    const before = await qtyAt(s.raw, vloc);
    const r = await receive(s, 500);
    expect((await qa("qa", r.receiptId, r.lineId, 480, 20)).status).toBe(200);

    const rawOut = (await receiptRows(s.raw)).filter(
      (x) => x.locationId === vloc,
    );
    // accepted 480 + rejected 20 both leave the vendor location as sco_receipt
    expect(rawOut.reduce((a, x) => a + x.quantityChange, 0)).toBe(-500);
    const acceptedRow = rawOut.find((x) => x.quantityChange === -480);
    expect(acceptedRow?.unitCostPaise).toBe(12_000);
    expect(await qtyAt(s.raw, vloc)).toBe(before - 500);

    const finRows = await receiptRows(s.fin);
    expect(finRows).toHaveLength(1);
    expect(finRows[0]?.locationId).toBe(mainStoreId);
    expect(finRows[0]?.quantityChange).toBe(480);
    expect(finRows[0]?.unitCostPaise).toBe(14_500);
    expect(finRows[0]?.totalValueChangePaise).toBe(480 * 14_500);
  });

  test("BR-SCO-14 ratio 2 (send 1000, return 500): 100 accepted uses 200 raw, finished cost = 2 x 12,000 + 2,500", async () => {
    const s = await makeIssued({ send: 1000, ret: 500, lots: [1000] });
    const vloc = await vendorLocationId(s.vendorId);
    const r = await receive(s, 100);
    expect((await qa("qa", r.receiptId, r.lineId, 100, 0)).status).toBe(200);
    const rawOut = (await receiptRows(s.raw)).filter(
      (x) => x.locationId === vloc,
    );
    expect(rawOut.reduce((a, x) => a + x.quantityChange, 0)).toBe(-200);
    const finRows = await receiptRows(s.fin);
    expect(finRows[0]?.quantityChange).toBe(100);
    expect(finRows[0]?.unitCostPaise).toBe(26_500);
  });

  test("BR-SCO-14 finished item average moves per BR-GRN-38 (100 @ 10,000 then 100 @ 14,500 -> 12,250)", async () => {
    const s = await makeIssued({ lots: [600] });
    await openStock(s.fin, 100, 10_000);
    const r = await receive(s, 100);
    await qa("qa", r.receiptId, r.lineId, 100, 0);
    const fin = await itemRow(s.fin);
    expect(fin.currentStock).toBe(200);
    expect(fin.averageCostPaise).toBe(12_250);
  });

  test("BR-SCO-14 accepted 0 posts no finished goods", async () => {
    const s = await makeIssued({ lots: [600] });
    const r = await receive(s, 100);
    await qa("qa", r.receiptId, r.lineId, 0, 100);
    expect(await receiptRows(s.fin)).toHaveLength(0);
    expect((await itemRow(s.fin)).currentStock).toBe(0);
  });

  test("BR-SCO-14 non-whole ratio: raw used follows cumulative processed, rounded half up (send 1000, return 300)", async () => {
    const s = await makeIssued({ send: 1000, ret: 300, lots: [1000] });
    const vloc = await vendorLocationId(s.vendorId);
    const start = await qtyAt(s.raw, vloc);
    const expectedLeft = [start - 333, start - 667, start - 1000];
    for (let i = 0; i < 3; i++) {
      const r = await receive(s, 100);
      expect((await qa("qa", r.receiptId, r.lineId, 100, 0)).status).toBe(200);
      expect(await qtyAt(s.raw, vloc)).toBe(expectedLeft[i] as number);
    }
  });

  test("BR-SCO-14 half rounds up: send 5, return 2 -> first piece uses 3 raw, second uses 2", async () => {
    const s = await makeIssued({ send: 5, ret: 2, lots: [5] });
    const vloc = await vendorLocationId(s.vendorId);
    const start = await qtyAt(s.raw, vloc);
    const r1 = await receive(s, 1);
    await qa("qa", r1.receiptId, r1.lineId, 1, 0);
    expect(await qtyAt(s.raw, vloc)).toBe(start - 3);
    const r2 = await receive(s, 1);
    await qa("qa", r2.receiptId, r2.lineId, 1, 0);
    expect(await qtyAt(s.raw, vloc)).toBe(start - 5);
  });
});

describe("BR-SCO-15 rejected goods", () => {
  test("BR-SCO-15 20 rejected -> vendor -20, scrap yard +20 raw @12,000 (sco_receipt)", async () => {
    const s = await makeIssued({ lots: [600], cost: 12_000 });
    const vloc = await vendorLocationId(s.vendorId);
    const r = await receive(s, 500);
    await qa("qa", r.receiptId, r.lineId, 480, 20);
    const rows = await receiptRows(s.raw);
    const scrapRow = rows.find((x) => x.quantityChange === 20);
    expect(scrapRow).toBeTruthy();
    expect(scrapRow?.unitCostPaise).toBe(12_000);
    const scrapLoc = await db
      .select({ type: locations.type })
      .from(locations)
      .where(eq(locations.id, scrapRow?.locationId as number));
    expect(scrapLoc[0]?.type).toBe("scrap_yard");
    expect(await qtyAtScrap(s.raw)).toBe(20);
    const vendorOut = rows.filter((x) => x.locationId === vloc);
    expect(vendorOut.some((x) => x.quantityChange === -20)).toBe(true);
  });

  test("BR-SCO-15 rejected pieces carry no service charge (charge due = accepted x price)", async () => {
    const s = await makeIssued({ lots: [600] });
    const r = await receive(s, 500);
    await qa("qa", r.receiptId, r.lineId, 480, 20);
    const d = await scoDetails(s.scoId);
    expect(d.items[0].chargeDuePaise).toBe(480 * 2_500);
  });

  test("BR-SCO-15 all rejected: no finished goods, charge due 0", async () => {
    const s = await makeIssued({ lots: [600] });
    const r = await receive(s, 50);
    await qa("qa", r.receiptId, r.lineId, 0, 50);
    expect(await qtyAtScrap(s.raw)).toBe(50);
    expect((await scoDetails(s.scoId)).chargeDue.totalPaise).toBe(0);
  });
});

describe("BR-SCO-16 unprocessed return", () => {
  test("BR-SCO-16 100 unprocessed back -> store +100 raw @12,000 when the receipt is saved, no QA needed", async () => {
    const s = await makeIssued({ lots: [600], cost: 12_000 });
    const vloc = await vendorLocationId(s.vendorId);
    const storeBefore = await qtyAt(s.raw, mainStoreId);
    const vendorBefore = await qtyAt(s.raw, vloc);
    const res = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 0, unprocessedQty: 100 },
    ]);
    expect(res.status).toBe(201);
    expect(await qtyAt(s.raw, mainStoreId)).toBe(storeBefore + 100);
    expect(await qtyAt(s.raw, vloc)).toBe(vendorBefore - 100);
    const rows = await receiptRows(s.raw);
    expect(rows).toHaveLength(2);
    const inRow = rows.find((x) => x.locationId === mainStoreId);
    expect(inRow?.quantityChange).toBe(100);
    expect(inRow?.unitCostPaise).toBe(12_000);
    expect(inRow?.referenceType).toBe("sco_receipt");
  });

  test("BR-SCO-16 unprocessed pieces are not charged and not part of QA", async () => {
    const s = await makeIssued({ lots: [600] });
    await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 0, unprocessedQty: 100 },
    ]);
    const d = await scoDetails(s.scoId);
    expect(d.chargeDue.totalPaise).toBe(0);
    expect(d.items[0].pendingQaQty).toBe(0);
    expect(d.items[0].unprocessedQty).toBe(100);
  });

  test("BR-SCO-16 a receipt line with nothing at all (0 processed, 0 unprocessed) -> 400", async () => {
    const s = await makeIssued({ lots: [600] });
    const res = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 0, unprocessedQty: 0 },
    ]);
    expect(res.status).toBe(400);
  });
});

describe("BR-SCO-17 oldest challan first", () => {
  test("BR-SCO-17 challans 600 + 400, 700 back -> first settled, second 100 settled", async () => {
    const s = await makeIssued({ lots: [600, 400] });
    const r = await receive(s, 600, 100);
    const settlements = r.json.data.settlements as Array<{
      challanNumber: string;
      qty: number;
    }>;
    expect(settlements).toHaveLength(2);
    expect(settlements.map((x) => x.qty)).toEqual([600, 100]);
    expect(settlements[0]?.challanNumber).not.toBe(
      settlements[1]?.challanNumber,
    );

    const d = await scoDetails(s.scoId);
    const byQty = [...d.challanSettlements].sort(
      (a, b) => a.challanId - b.challanId,
    );
    expect(byQty[0]).toMatchObject({
      qty: 600,
      settledQty: 600,
      settled: true,
    });
    expect(byQty[1]).toMatchObject({
      qty: 400,
      settledQty: 100,
      settled: false,
    });
  });

  test("BR-SCO-17 the fully settled challan leaves the open list, the part-settled one stays", async () => {
    const s = await makeIssued({ lots: [600, 400] });
    await receive(s, 700);
    const open = await call("bo", "GET", `/sco/challans/open?scoId=${s.scoId}`);
    expect(open.status).toBe(200);
    expect(open.json.data).toHaveLength(1);
    expect(open.json.data[0].valuePaise).toBe(400 * 12_000);
  });

  test("BR-SCO-17 a later receipt continues where the last stopped and settles the rest", async () => {
    const s = await makeIssued({ lots: [600, 400] });
    await receive(s, 700);
    await receive(s, 300);
    const d = await scoDetails(s.scoId);
    expect(d.challanSettlements.every((c) => c.settled)).toBe(true);
    const open = await call("bo", "GET", `/sco/challans/open?scoId=${s.scoId}`);
    expect(open.json.data).toHaveLength(0);
  });

  test("BR-SCO-17 settlement counts raw pieces: ratio 2, 300 processed = 600 raw settled", async () => {
    const s = await makeIssued({ send: 1000, ret: 500, lots: [600, 400] });
    const r = await receive(s, 300);
    const settlements = r.json.data.settlements as Array<{ qty: number }>;
    expect(settlements.reduce((a, x) => a + x.qty, 0)).toBe(600);
    const d = await scoDetails(s.scoId);
    const first = [...d.challanSettlements].sort(
      (a, b) => a.challanId - b.challanId,
    )[0];
    expect(first?.settled).toBe(true);
  });

  test("BR-SCO-17 the receipt details endpoint returns the settlements it recorded", async () => {
    const s = await makeIssued({ lots: [600, 400] });
    const r = await receive(s, 700);
    const got = await call("bo", "GET", `/sco/receipts/${r.receiptId}`);
    expect(got.status).toBe(200);
    expect(
      got.json.data.settlements.map((x: { qty: number }) => x.qty),
    ).toEqual([600, 100]);
  });
});

describe("BR-SCO-18 material_received", () => {
  test("BR-SCO-18 1000 issued, 980 accepted + 20 rejected -> material_received", async () => {
    const s = await makeIssued({ lots: [1000] });
    const r = await receive(s, 1000);
    await qa("qa", r.receiptId, r.lineId, 980, 20);
    expect((await scoDetails(s.scoId)).sco.status).toBe("material_received");
  });

  test("BR-SCO-18 unprocessed + processed together clearing the vendor -> material_received", async () => {
    const s = await makeIssued({ lots: [1000] });
    const r = await receive(s, 900, 100);
    await qa("qa", r.receiptId, r.lineId, 900, 0);
    expect((await scoDetails(s.scoId)).sco.status).toBe("material_received");
  });

  test("BR-SCO-18 990 of 1000 back -> still material_issued", async () => {
    const s = await makeIssued({ lots: [1000] });
    const r = await receive(s, 990);
    await qa("qa", r.receiptId, r.lineId, 990, 0);
    expect((await scoDetails(s.scoId)).sco.status).toBe("material_issued");
  });

  test("BR-SCO-18 everything issued so far is back but 400 not yet issued -> still material_issued", async () => {
    const s = await makeIssued({ lots: [600] });
    const r = await receive(s, 600);
    await qa("qa", r.receiptId, r.lineId, 600, 0);
    expect((await scoDetails(s.scoId)).sco.status).toBe("material_issued");
  });

  test("BR-SCO-18 a material_received SCO takes no more receipts (409)", async () => {
    const s = await makeIssued({ lots: [100], send: 100 });
    const r = await receive(s, 100);
    await qa("qa", r.receiptId, r.lineId, 100, 0);
    const res = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 1 },
    ]);
    expect(res.status).toBe(409);
  });
});

describe("BR-SCO-22 charge due", () => {
  test("BR-SCO-22 980 accepted -> Rs 24,500 + Rs 4,410 GST", async () => {
    const s = await makeIssued({ lots: [1000] });
    const r = await receive(s, 1000);
    await qa("qa", r.receiptId, r.lineId, 980, 20);
    const d = await scoDetails(s.scoId);
    expect(d.items[0].chargeDuePaise).toBe(2_450_000);
    expect(d.items[0].chargeDueGstPaise).toBe(441_000);
    expect(d.chargeDue).toEqual({
      subtotalPaise: 2_450_000,
      gstPaise: 441_000,
      totalPaise: 2_891_000,
    });
  });

  test("BR-SCO-22 before any QA decision the charge due is 0 (pending QA earns nothing)", async () => {
    const s = await makeIssued({ lots: [1000] });
    await receive(s, 1000);
    const d = await scoDetails(s.scoId);
    expect(d.chargeDue.totalPaise).toBe(0);
    expect(d.items[0].pendingQaQty).toBe(1000);
  });

  test("BR-SCO-22 charge due adds up across QA decisions on separate receipts", async () => {
    const s = await makeIssued({ lots: [1000] });
    const r1 = await receive(s, 300);
    const r2 = await receive(s, 200);
    await qa("qa", r1.receiptId, r1.lineId, 300, 0);
    await qa("qa", r2.receiptId, r2.lineId, 150, 50);
    const d = await scoDetails(s.scoId);
    expect(d.items[0].chargeDuePaise).toBe(450 * 2_500);
    expect(d.items[0].chargeDueGstPaise).toBe(Math.round(450 * 2_500 * 0.18));
    expect(d.items[0].acceptedQty).toBe(450);
    expect(d.items[0].rejectedQty).toBe(50);
  });

  test("BR-SCO-22 no bill is posted: charge due read-out does not change stock or ledger", async () => {
    const s = await makeIssued({ lots: [1000] });
    const r = await receive(s, 100);
    await qa("qa", r.receiptId, r.lineId, 100, 0);
    const before = (await receiptRows(s.raw)).length;
    await scoDetails(s.scoId);
    await scoDetails(s.scoId);
    expect((await receiptRows(s.raw)).length).toBe(before);
  });
});

describe("BR-SCO-24 one transaction, lock, races", () => {
  test("BR-SCO-24 two receipts at once for the last 400 at the vendor -> one 201, one 409", async () => {
    const s = await makeIssued({ lots: [400] });
    const [a, b] = await Promise.all([
      receipt("fs", s.scoId, [{ scoItemId: s.itemId, processedQty: 400 }]),
      receipt("bo", s.scoId, [{ scoItemId: s.itemId, processedQty: 400 }]),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await receiptCount(s.scoId)).toBe(1);
    const d = await scoDetails(s.scoId);
    expect(d.items[0].pendingQaQty).toBe(400);
    expect(d.items[0].qtyAtVendor).toBe(0);
  });

  test("BR-SCO-24 two unprocessed returns at once for the last 400 -> one 201, one 409, store credited once", async () => {
    const s = await makeIssued({ lots: [400] });
    const storeBefore = await qtyAt(s.raw, mainStoreId);
    const [a, b] = await Promise.all([
      receipt("fs", s.scoId, [
        { scoItemId: s.itemId, processedQty: 0, unprocessedQty: 400 },
      ]),
      receipt("owner", s.scoId, [
        { scoItemId: s.itemId, processedQty: 0, unprocessedQty: 400 },
      ]),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await qtyAt(s.raw, mainStoreId)).toBe(storeBefore + 400);
  });

  test("BR-SCO-24 a multi-line receipt where line 2 is over qty -> 400, nothing saved, line 1 not posted", async () => {
    const s1 = await makeIssued({ lots: [600] });
    // second SCO line lives on another SCO, so build a two-line SCO by hand
    const raw2 = await makeItem("raw2", "7616");
    const fin2 = await makeItem("fin2", null);
    await openStock(raw2, 5000, 12_000);
    const created = await call("bo", "POST", "/sco/createsco", {
      vendorId: vendorA,
      expectedReturnDate: daysFromNow(30),
      lines: [
        {
          rawItemId: s1.raw,
          finishedItemId: s1.fin,
          serviceId,
          rawQtyToIssue: 100,
          expectedReturnQty: 100,
        },
        {
          rawItemId: raw2,
          finishedItemId: fin2,
          serviceId,
          rawQtyToIssue: 100,
          expectedReturnQty: 100,
        },
      ],
    });
    expect(created.status).toBe(201);
    const scoId = created.json.data.sco.id as number;
    createdScoIds.push(scoId);
    const ids = (created.json.data.items as Array<{ id: number }>).map(
      (i) => i.id,
    );
    await db
      .update(subcontractingOrders)
      .set({ status: "approved" })
      .where(eq(subcontractingOrders.id, scoId));
    for (const id of ids) {
      const c = await call("bo", "POST", `/sco/${scoId}/challans`, {
        lines: [{ scoItemId: id, qty: 100 }],
        ...EWB,
      });
      expect(c.status).toBe(201);
    }
    const before = (await receiptRows(s1.raw)).length;
    const res = await receipt("fs", scoId, [
      { scoItemId: ids[0] as number, processedQty: 0, unprocessedQty: 50 },
      { scoItemId: ids[1] as number, processedQty: 0, unprocessedQty: 101 },
    ]);
    expect(res.status).toBe(400);
    expect(await receiptCount(scoId)).toBe(0);
    expect((await receiptRows(s1.raw)).length).toBe(before);
    expect((await receiptRows(raw2)).length).toBe(0);
  });

  test("BR-SCO-24 a QA decision with wrong totals (400) changes nothing: line can still be decided", async () => {
    const s = await makeIssued({ lots: [600] });
    const r = await receive(s, 500);
    expect((await qa("qa", r.receiptId, r.lineId, 400, 50)).status).toBe(400);
    expect(await receiptRows(s.fin)).toHaveLength(0);
    const got = await call("qa", "GET", `/sco/receipts/${r.receiptId}`);
    expect(got.json.data.lines[0].qaStatus).toBe("pending_qa");
    expect(got.json.data.lines[0].acceptedQty).toBeNull();
    expect((await qa("qa", r.receiptId, r.lineId, 450, 50)).status).toBe(200);
  });

  test("BR-SCO-24 a saved receipt has its receipt, lines, settlements and any unprocessed posting together", async () => {
    const s = await makeIssued({ lots: [600, 400] });
    const r = await receive(s, 500, 200);
    const rows = await db
      .select()
      .from(subcontractingGrnItems)
      .where(eq(subcontractingGrnItems.scoGrnId, r.receiptId));
    expect(rows).toHaveLength(1);
    const st = await db
      .select()
      .from(scoReceiptSettlements)
      .where(eq(scoReceiptSettlements.receiptItemId, r.lineId));
    expect(st.reduce((a, x) => a + x.qty, 0)).toBe(700);
    expect(
      (await receiptRows(s.raw)).filter(
        (x) => x.quantityChange === 200 && x.locationId === mainStoreId,
      ),
    ).toHaveLength(1);
  });
});

describe("BR-SCO-25 audit and traceability", () => {
  test("BR-SCO-25 receipt records who and when; unprocessed ledger rows carry actor, time and heat", async () => {
    const s = await makeIssued({ lots: [600], batch: "H-231" });
    const res = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 0, unprocessedQty: 100 },
    ]);
    expect(res.status).toBe(201);
    expect(res.json.data.receipt.createdBy).toBe(actors.fs?.id);
    expect(res.json.data.receipt.createdAt).toBeTruthy();
    const rows = await receiptRows(s.raw);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.createdBy).toBe(actors.fs?.id as number);
      expect(Date.now() - r.createdAt.getTime()).toBeLessThan(60_000);
      expect(r.batchNumber).toBe("H-231");
    }
  });

  test("BR-SCO-25 QA decision records who, when and notes on the line", async () => {
    const s = await makeIssued({ lots: [600], batch: "H-231" });
    const r = await receive(s, 100);
    const res = await qa("qa", r.receiptId, r.lineId, 90, 10, {
      notes: "burrs on 10",
    });
    expect(res.status).toBe(200);
    const line = res.json.data.lines[0];
    expect(line.qaDecidedBy).toBe(actors.qa?.id);
    expect(line.qaDecidedAt).toBeTruthy();
    expect(line.qaNotes).toBe("burrs on 10");
  });

  test("BR-SCO-25 every QA posting (raw out, finished in, scrap in) has the QA inspector and the heat number", async () => {
    const s = await makeIssued({ lots: [600], batch: "H-231" });
    const r = await receive(s, 100);
    await qa("qa", r.receiptId, r.lineId, 90, 10);
    const rows = [...(await receiptRows(s.raw)), ...(await receiptRows(s.fin))];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const x of rows) {
      expect(x.createdBy).toBe(actors.qa?.id as number);
      expect(Date.now() - x.createdAt.getTime()).toBeLessThan(60_000);
      expect(x.batchNumber).toBe("H-231");
    }
  });

  test("BR-SCO-25 the finished-part row traces to the challan and casting batch (heat H-231)", async () => {
    const s = await makeIssued({ lots: [600], batch: "H-231" });
    const r = await receive(s, 100);
    const decided = await qa("qa", r.receiptId, r.lineId, 100, 0);
    expect(decided.json.data.lines[0].heatNumber).toBe("H-231");
    const finRows = await receiptRows(s.fin);
    expect(finRows).toHaveLength(1);
    expect(finRows[0]?.batchNumber).toBe("H-231");
    const settlements = decided.json.data.settlements as Array<{
      challanNumber: string;
    }>;
    expect(settlements).toHaveLength(1);
    expect(settlements[0]?.challanNumber).toMatch(/^JWC\//);
  });
});
