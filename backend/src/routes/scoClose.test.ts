/**
 * HTTP-level tests for closing an SCO, the loss write-off and the S4 reports:
 * BR-SCO-19, 22, 23, 24, 25 (docs/specs/subcontracting.md v2).
 * Real app (middleware + routers + onError) against the test DB.
 * Fixtures are TEST_scocl_ prefixed and removed in afterAll. The single
 * company_settings row is saved before and restored after.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, like } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import { documentNumberCounters, roles } from "../db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
  serviceMaster,
} from "../db/schemas/02_procurement-catalog";
import {
  scoChallanLines,
  scoChallans,
  scoReceiptSettlements,
  subcontractingGrnItems,
  subcontractingGrns,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../db/schemas/02_procurement-purchasing";
import {
  supplierMaster,
  supplierServices,
} from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { companySettings } from "../db/schemas/04_company";
import { authService } from "../service/authService";

const app = createApp();
const PREFIX = "TEST_scocl_";
const EMAIL_PREFIX = "test_scocl_";
const PASSWORD = "scocl-test-password-123";
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

async function lossRows(itemId: number) {
  return db
    .select()
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, itemId),
        eq(inventoryLedger.referenceType, "sco_loss"),
      ),
    )
    .orderBy(inventoryLedger.id);
}

async function scoStatus(scoId: number) {
  const [row] = await db
    .select({ status: subcontractingOrders.status })
    .from(subcontractingOrders)
    .where(eq(subcontractingOrders.id, scoId));
  return requireRow(row, "sco").status;
}

const close = (
  actor: string | null,
  scoId: number,
  body?: Record<string, unknown>,
) => call(actor, "POST", `/sco/${scoId}/close`, body ?? {});

/** 1000 sent, `back` received and accepted in full; the rest stays at the vendor. */
async function withBack(back: number, batch?: string) {
  const s = await makeIssued({
    lots: [1000],
    ...(batch ? { batch } : {}),
  });
  if (back > 0) {
    const r = await receive(s, back);
    const d = await qa("qa", r.receiptId, r.lineId, back, 0);
    if (d.status !== 200) throw new Error("qa fixture failed");
  }
  return s;
}

describe("BR-SCO-19 close", () => {
  test("BR-SCO-19 1000 issued, 1000 back, back office closes -> closed, no loss posted", async () => {
    const s = await withBack(1000);
    expect(await scoStatus(s.scoId)).toBe("material_received");
    const res = await close("bo", s.scoId);
    expect(res.status).toBe(200);
    expect(res.json.data.sco.status).toBe("closed");
    expect(res.json.data.sco.closedBy).toBe(actors.bo?.id);
    expect(res.json.data.sco.closedAt).toBeTruthy();
    expect(await lossRows(s.raw)).toHaveLength(0);
  });

  test("BR-SCO-19 nothing left: reason is optional, and is kept when given", async () => {
    const s = await withBack(1000);
    const res = await close("bo", s.scoId, { reason: "all done, closing" });
    expect(res.status).toBe(200);
    expect(res.json.data.sco.closeReason).toBe("all done, closing");
  });

  test("BR-SCO-19 close is allowed from material_issued when nothing is at the vendor; un-issued qty is dropped", async () => {
    const s = await makeIssued({ send: 1000, lots: [600] });
    const r = await receive(s, 600);
    await qa("qa", r.receiptId, r.lineId, 600, 0);
    // 400 never issued; SCO stays material_issued
    expect(await scoStatus(s.scoId)).toBe("material_issued");
    const res = await close("bo", s.scoId);
    expect(res.status).toBe(200);
    expect(res.json.data.sco.status).toBe("closed");
    expect(await lossRows(s.raw)).toHaveLength(0);
  });

  test("BR-SCO-19 990 back, back office closes -> 403 and nothing changes", async () => {
    const s = await withBack(990);
    const vloc = await vendorLocationId(s.vendorId);
    const before = await qtyAt(s.raw, vloc);
    const res = await close("bo", s.scoId, {
      reason: "chips lost in machining",
    });
    expect(res.status).toBe(403);
    expect(await scoStatus(s.scoId)).toBe("material_issued");
    expect(await lossRows(s.raw)).toHaveLength(0);
    expect(await qtyAt(s.raw, vloc)).toBe(before);
  });

  test("BR-SCO-19 owner closes with loss but no reason -> 400 SCO_CLOSE_REASON_REQUIRED, nothing changes", async () => {
    const s = await withBack(990);
    const res = await close("owner", s.scoId);
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("SCO_CLOSE_REASON_REQUIRED");
    expect(await scoStatus(s.scoId)).toBe("material_issued");
    expect(await lossRows(s.raw)).toHaveLength(0);
  });

  test("BR-SCO-19 reason shorter than 3 or longer than 500 chars -> 400", async () => {
    const s = await withBack(990);
    expect((await close("owner", s.scoId, { reason: "ab" })).status).toBe(400);
    expect(
      (await close("owner", s.scoId, { reason: "x".repeat(501) })).status,
    ).toBe(400);
    expect(await scoStatus(s.scoId)).toBe("material_issued");
  });

  test("BR-SCO-19 owner with reason: 10 written off from the vendor at issue cost (sco_loss), SCO closed", async () => {
    const s = await withBack(990);
    const vloc = await vendorLocationId(s.vendorId);
    const res = await close("owner", s.scoId, {
      reason: "chips lost in machining",
    });
    expect(res.status).toBe(200);
    expect(res.json.data.sco.status).toBe("closed");
    expect(res.json.data.sco.closeReason).toBe("chips lost in machining");
    expect(res.json.data.sco.closedBy).toBe(actors.owner?.id);
    expect(res.json.data.items[0].lossQty).toBe(10);
    const rows = await lossRows(s.raw);
    const atVendor = rows.filter((r) => r.locationId === vloc);
    expect(atVendor).toHaveLength(1);
    expect(atVendor[0]?.quantityChange).toBe(-10);
    expect(atVendor[0]?.unitCostPaise).toBe(12_000);
    expect(atVendor[0]?.referenceId).toBe(s.scoId);
    expect(await qtyAt(s.raw, vloc)).toBe(0);
  });

  test("BR-SCO-19 whole lot lost (nothing came back): owner writes off 1000", async () => {
    const s = await withBack(0);
    const res = await close("owner", s.scoId, {
      reason: "vendor lost the lot",
    });
    expect(res.status).toBe(200);
    expect(res.json.data.items[0].lossQty).toBe(1000);
    expect(await qtyAt(s.raw, await vendorLocationId(s.vendorId))).toBe(0);
  });

  test("BR-SCO-19 owner closes while a receipt line is pending QA -> 409, nothing written off, SCO unchanged", async () => {
    const s = await makeIssued({ lots: [1000] });
    await receive(s, 400); // 400 processed, pending QA; 600 still at vendor
    const vloc = await vendorLocationId(s.vendorId);
    const before = await qtyAt(s.raw, vloc);
    const res = await close("owner", s.scoId, { reason: "closing early" });
    expect(res.status).toBe(409);
    expect(await scoStatus(s.scoId)).toBe("material_issued");
    expect(await lossRows(s.raw)).toHaveLength(0);
    expect(await qtyAt(s.raw, vloc)).toBe(before);
    const d = await scoDetails(s.scoId);
    expect(d.items[0].lossQty).toBe(0);
    expect(d.sco.closedAt).toBeNull();
  });

  test("BR-SCO-19 back office closes with everything received but still pending QA -> 409, stays material_received", async () => {
    const s = await makeIssued({ lots: [1000] });
    await receive(s, 1000);
    expect(await scoStatus(s.scoId)).toBe("material_received");
    const res = await close("bo", s.scoId);
    expect(res.status).toBe(409);
    expect(await scoStatus(s.scoId)).toBe("material_received");
    expect(await lossRows(s.raw)).toHaveLength(0);
  });

  test("BR-SCO-19 pending QA on one of two receipts still blocks close; after the decision the remainder is written off", async () => {
    const s = await makeIssued({ lots: [1000] });
    const r1 = await receive(s, 300);
    const r2 = await receive(s, 200);
    expect((await qa("qa", r1.receiptId, r1.lineId, 300, 0)).status).toBe(200);
    expect(
      (await close("owner", s.scoId, { reason: "closing early" })).status,
    ).toBe(409);
    expect(await lossRows(s.raw)).toHaveLength(0);
    expect((await qa("qa", r2.receiptId, r2.lineId, 200, 0)).status).toBe(200);
    const res = await close("owner", s.scoId, { reason: "closing early" });
    expect(res.status).toBe(200);
    expect(res.json.data.items[0].lossQty).toBe(500);
    expect(await qtyAt(s.raw, await vendorLocationId(s.vendorId))).toBe(0);
  });

  test("BR-SCO-19 close on approved (nothing issued) or draft SCO -> 409", async () => {
    const s = await makeIssued({ lots: [] });
    expect(
      (await close("owner", s.scoId, { reason: "no reason" })).status,
    ).toBe(409);
    expect(await scoStatus(s.scoId)).toBe("approved");
  });

  test("BR-SCO-19 closing twice -> second is 409", async () => {
    const s = await withBack(1000);
    expect((await close("bo", s.scoId)).status).toBe(200);
    expect((await close("bo", s.scoId)).status).toBe(409);
  });

  test("BR-SCO-19 unknown SCO -> 404", async () => {
    expect((await close("bo", 999_999_999)).status).toBe(404);
  });

  test("BR-SCO-19 a closed SCO takes no more challans or receipts (409)", async () => {
    const s = await makeIssued({ send: 1000, lots: [600] });
    const r = await receive(s, 600);
    await qa("qa", r.receiptId, r.lineId, 600, 0);
    await close("bo", s.scoId);
    const c = await call("bo", "POST", `/sco/${s.scoId}/challans`, {
      lines: [{ scoItemId: s.itemId, qty: 100 }],
      ...EWB,
    });
    expect(c.status).toBe(409);
    const rc = await receipt("fs", s.scoId, [
      { scoItemId: s.itemId, processedQty: 1 },
    ]);
    expect(rc.status).toBe(409);
  });
});

describe("BR-SCO-22 charge due survives close", () => {
  test("BR-SCO-22 980 accepted, 20 rejected: charge due 24,500 + 4,410 GST after close", async () => {
    const s = await makeIssued({ lots: [1000] });
    const r = await receive(s, 1000);
    await qa("qa", r.receiptId, r.lineId, 980, 20);
    expect((await close("bo", s.scoId)).status).toBe(200);
    const d = await scoDetails(s.scoId);
    expect(d.chargeDue).toEqual({
      subtotalPaise: 2_450_000,
      gstPaise: 441_000,
      totalPaise: 2_891_000,
    });
  });
});

describe("BR-SCO-23 permissions", () => {
  test("BR-SCO-23 floor supervisor and QA inspector cannot close -> 403, nothing changes", async () => {
    const s = await withBack(1000);
    expect((await close("fs", s.scoId)).status).toBe(403);
    expect((await close("qa", s.scoId)).status).toBe(403);
    expect(await scoStatus(s.scoId)).toBe("material_received");
  });

  test("BR-SCO-23 unauthenticated close -> 401", async () => {
    const s = await withBack(1000);
    expect((await close(null, s.scoId)).status).toBe(401);
  });

  test("BR-SCO-23 owner can close a clean SCO too (holds sco.close)", async () => {
    const s = await withBack(1000);
    expect((await close("owner", s.scoId)).status).toBe(200);
  });

  test("BR-SCO-23 reports need sco.view: fs and qa ok, unauthenticated 401", async () => {
    for (const path of ["/sco/reports/vendor-stock", "/sco/reports/loss-log"]) {
      expect((await call("fs", "GET", path)).status).toBe(200);
      expect((await call("qa", "GET", path)).status).toBe(200);
      expect((await call(null, "GET", path)).status).toBe(401);
    }
  });
});

describe("BR-SCO-24 atomic close", () => {
  test("BR-SCO-24 two closes with a loss at once: one 200, one 409, loss posted once", async () => {
    const s = await withBack(990);
    const [a, b] = await Promise.all([
      close("owner", s.scoId, { reason: "chips lost in machining" }),
      close("owner", s.scoId, { reason: "chips lost in machining" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const vloc = await vendorLocationId(s.vendorId);
    const rows = (await lossRows(s.raw)).filter((r) => r.locationId === vloc);
    expect(rows).toHaveLength(1);
    expect(await qtyAt(s.raw, vloc)).toBe(0);
    const d = await scoDetails(s.scoId);
    expect(d.items[0].lossQty).toBe(10);
  });
});

describe("BR-SCO-25 loss audit", () => {
  test("BR-SCO-25 the loss posting carries who, when and the heat number", async () => {
    const s = await withBack(990, "H-231");
    await close("owner", s.scoId, { reason: "chips lost in machining" });
    const rows = await lossRows(s.raw);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(r.createdBy).toBe(actors.owner?.id as number);
      expect(Date.now() - r.createdAt.getTime()).toBeLessThan(60_000);
      expect(r.batchNumber).toBe("H-231");
    }
  });
});

describe("S4 reports (BR-SCO-19, 22)", () => {
  test("vendor stock lists what is at the vendor at issue cost; zero rows are not listed", async () => {
    const s = await withBack(990);
    const res = await call(
      "bo",
      "GET",
      `/sco/reports/vendor-stock?vendorId=${s.vendorId}&pageSize=100`,
    );
    expect(res.status).toBe(200);
    expect(res.json.meta.page).toBe(1);
    // biome-ignore lint/suspicious/noExplicitAny: test reads arbitrary JSON
    const row = res.json.data.find((r: any) => r.itemId === s.raw);
    expect(row.qty).toBe(10);
    expect(row.valuePaise).toBe(10 * 12_000);
    expect(row.vendorId).toBe(s.vendorId);
    await close("owner", s.scoId, { reason: "chips lost in machining" });
    const after = await call(
      "bo",
      "GET",
      `/sco/reports/vendor-stock?vendorId=${s.vendorId}&pageSize=100`,
    );
    const left = (after.json.data as Array<{ itemId: number }>).filter(
      (r) => r.itemId === s.raw,
    );
    expect(left).toHaveLength(0);
  });

  test("loss log shows the write-off with SCO, qty, cost and the close reason; filters by scoId", async () => {
    const s = await withBack(990, "H-231");
    await close("owner", s.scoId, { reason: "chips lost in machining" });
    const res = await call(
      "bo",
      "GET",
      `/sco/reports/loss-log?scoId=${s.scoId}`,
    );
    expect(res.status).toBe(200);
    expect(res.json.data).toHaveLength(1);
    const row = res.json.data[0];
    expect(row.scoId).toBe(s.scoId);
    expect(row.vendorId).toBe(s.vendorId);
    expect(row.itemId).toBe(s.raw);
    expect(row.qty).toBe(10);
    expect(row.costPaise).toBe(120_000);
    expect(row.reason).toBe("chips lost in machining");
    expect(row.batchNumber).toBe("H-231");
    expect(row.createdBy).toBe(actors.owner?.id);
  });

  test("loss log excludes SCOs closed without a loss", async () => {
    const s = await withBack(1000);
    await close("bo", s.scoId);
    const res = await call(
      "bo",
      "GET",
      `/sco/reports/loss-log?scoId=${s.scoId}`,
    );
    expect(res.status).toBe(200);
    expect(res.json.data).toHaveLength(0);
  });

  test("loss log date filter is inclusive and excludes future ranges", async () => {
    const s = await withBack(990);
    await close("owner", s.scoId, { reason: "chips lost in machining" });
    const day = (n: number) => daysFromNow(n).slice(0, 10);
    const inRange = await call(
      "bo",
      "GET",
      `/sco/reports/loss-log?scoId=${s.scoId}&createdFrom=${day(-1)}&createdTo=${day(1)}`,
    );
    expect(inRange.json.data).toHaveLength(1);
    const future = await call(
      "bo",
      "GET",
      `/sco/reports/loss-log?scoId=${s.scoId}&createdFrom=${day(2)}`,
    );
    expect(future.json.data).toHaveLength(0);
  });

  test("report paging: pageSize over 100 -> 400", async () => {
    const res = await call("bo", "GET", "/sco/reports/loss-log?pageSize=101");
    expect(res.status).toBe(400);
  });

  test("register date filter on getscos: created today is in range, from tomorrow is out", async () => {
    const s = await makeIssued({ lots: [] });
    const day = (n: number) => daysFromNow(n).slice(0, 10);
    const inRange = await call(
      "bo",
      "GET",
      `/sco/getscos?vendorId=${s.vendorId}&pageSize=100&createdFrom=${day(-1)}&createdTo=${day(1)}`,
    );
    expect(inRange.status).toBe(200);
    // biome-ignore lint/suspicious/noExplicitAny: test reads arbitrary JSON
    expect(inRange.json.data.map((x: any) => x.id)).toContain(s.scoId);
    const out = await call(
      "bo",
      "GET",
      `/sco/getscos?vendorId=${s.vendorId}&pageSize=100&createdFrom=${day(2)}`,
    );
    // biome-ignore lint/suspicious/noExplicitAny: test reads arbitrary JSON
    expect(out.json.data.map((x: any) => x.id)).not.toContain(s.scoId);
  });
});
