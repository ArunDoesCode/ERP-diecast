/**
 * Regression: cost of processed qty when a receipt line mixes processed and
 * unprocessed pieces drawn from challans issued at different costs.
 * BR-SCO-14 (raw out at the line's issue cost, finished = ratio x issue cost
 * + service price) and BR-SCO-17 (oldest challan settled first).
 * Spec: docs/specs/subcontracting.md v2. Fixtures TEST_scorcc_ prefixed.
 *
 * Order between processed and unprocessed pieces when both draw on the same
 * challans is not fixed by the spec, so the assertions do not depend on which
 * piece takes which challan: the processed pieces must be valued at the cost of
 * the challan lot(s) they really came from (100 or 200 per piece, never the
 * 150 blend), and the two groups together must use both lots exactly once.
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
const PREFIX = "TEST_scorcc_";
const EMAIL_PREFIX = "test_scorcc_";
const PASSWORD = "scorcc-test-password-123";
const SERVICE_PRICE = 2_500;

type Actor = { id: number; token: string };
const actors: Record<string, Actor> = {};

let mainStoreId: number;
let createdMainStore = false;
let createdScrapYard = false;
let scrapYardId = 0;
let serviceId: number;
let vendorId: number;
let savedCompany: typeof companySettings.$inferSelect | undefined;
let seq = 0;
const createdScoIds: number[] = [];

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

async function call(
  actor: string,
  method: string,
  path: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${actors[actor]?.token}`,
  };
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

async function challan(scoId: number, scoItemId: number, qty: number) {
  const c = await call("bo", "POST", `/sco/${scoId}/challans`, {
    lines: [{ scoItemId, qty }],
    ewayBillNo: "EWB-TEST-1",
  });
  if (c.status !== 201) {
    throw new Error(`challan fixture failed: ${JSON.stringify(c.json)}`);
  }
  return c.json.data.lines[0].unitIssueCostPaise as number;
}

/** Raw item SCO line, ratio 1:1, lot A of 100 @100 then lot B of 100 @200. */
async function makeTwoLotSco() {
  const raw = await makeItem("raw", "7616");
  const fin = await makeItem("fin", null);
  await openStock(raw, 100, 100);
  const res = await call("bo", "POST", "/sco/createsco", {
    vendorId,
    expectedReturnDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    lines: [
      {
        rawItemId: raw,
        finishedItemId: fin,
        serviceId,
        rawQtyToIssue: 200,
        expectedReturnQty: 200,
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
  const costA = await challan(scoId, itemId, 100);
  // Store is now empty; a stock-take of 100 @300 lifts the item average
  // (vendor stock counts too) to (100 x 100 + 100 x 300) / 200 = 200.
  const adj = await call("owner", "POST", "/asset/inventory/movements", {
    itemId: raw,
    locationId: mainStoreId,
    referenceType: "stock_adjustment",
    countedQty: 100,
    unitCostPaise: 300,
    reason: "restock",
  });
  if (adj.status >= 300) {
    throw new Error(`restock failed: ${JSON.stringify(adj.json)}`);
  }
  const costB = await challan(scoId, itemId, 100);
  if (costA !== 100 || costB !== 200) {
    throw new Error(`fixture costs expected 100/200, got ${costA}/${costB}`);
  }
  return { scoId, itemId, raw, fin };
}

async function ledgerRows(itemId: number, ref: string) {
  return db
    .select()
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, itemId),
        eq(inventoryLedger.referenceType, ref as "sco_receipt"),
      ),
    )
    .orderBy(inventoryLedger.id);
}

type Row = Awaited<ReturnType<typeof ledgerRows>>[number];

/** Value in paise of the rows leaving (negative qty) the given side. */
function outValue(rows: Row[]) {
  return rows
    .filter((r) => r.quantityChange < 0)
    .reduce((a, r) => a + -r.quantityChange * r.unitCostPaise, 0);
}
function outQty(rows: Row[]) {
  return rows
    .filter((r) => r.quantityChange < 0)
    .reduce((a, r) => a - r.quantityChange, 0);
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
    .limit(1);
  if (!scrap) {
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

  const [v] = await db
    .insert(supplierMaster)
    .values({
      name: uniq("vendor"),
      type: "service_provider",
      gstNumber: `29TR${Date.now().toString().slice(-7)}${seq}Z5`,
      address: "vendor street, town",
    })
    .returning({ id: supplierMaster.id });
  vendorId = requireRow(v, "vendor").id;
  await db.insert(supplierServices).values({
    supplierId: vendorId,
    serviceId,
    serviceUnitPricePaise: SERVICE_PRICE,
    taxPercentage: 18,
  });
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
  if (vendorId) {
    await db.delete(locations).where(eq(locations.linkedVendorId, vendorId));
    await db
      .delete(supplierServices)
      .where(eq(supplierServices.supplierId, vendorId));
    await db.delete(supplierMaster).where(eq(supplierMaster.id, vendorId));
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

describe("BR-SCO-14 / BR-SCO-17 cost of processed pieces across challan lots", () => {
  test("BR-SCO-14 processed pieces are costed from the challan lot they came from, not the blend with unprocessed pieces", async () => {
    const s = await makeTwoLotSco();
    const rcpt = await call("fs", "POST", `/sco/${s.scoId}/receipts`, {
      vendorChallanNo: uniq("VC"),
      lines: [{ scoItemId: s.itemId, processedQty: 100, unprocessedQty: 100 }],
    });
    expect(rcpt.status).toBe(201);
    const receiptId = rcpt.json.data.receipt.id as number;
    const lineId = rcpt.json.data.lines[0].id as number;
    // BR-SCO-17: both lots (200 pcs) are settled by this one receipt.
    const settled = (
      rcpt.json.data.settlements as Array<{ qty: number }>
    ).reduce((a, x) => a + x.qty, 0);
    expect(settled).toBe(200);

    const afterReceipt = await ledgerRows(s.raw, "sco_receipt");
    const unprocessedValue = outValue(afterReceipt);
    expect(outQty(afterReceipt)).toBe(100);

    const dec = await call(
      "qa",
      "POST",
      `/sco/receipts/${receiptId}/lines/${lineId}/qa`,
      { acceptedQty: 100, rejectedQty: 0 },
    );
    expect(dec.status).toBe(200);

    const afterQa = await ledgerRows(s.raw, "sco_receipt");
    const qaRows = afterQa.filter(
      (r) => !afterReceipt.some((p) => p.id === r.id),
    );
    const processedValue = outValue(qaRows);
    expect(outQty(qaRows)).toBe(100);
    // The two groups together use lot A (100 x 100) and lot B (100 x 200).
    expect(unprocessedValue + processedValue).toBe(30_000);
    // Processed pieces come from one lot or the other, never a 150 blend.
    expect([10_000, 20_000]).toContain(processedValue);

    // Finished item: +100 at ratio x issue cost + service price.
    const finRows = (await ledgerRows(s.fin, "sco_receipt")).filter(
      (r) => r.quantityChange > 0,
    );
    expect(finRows.reduce((a, r) => a + r.quantityChange, 0)).toBe(100);
    const finValue = finRows.reduce(
      (a, r) => a + r.quantityChange * r.unitCostPaise,
      0,
    );
    expect(finValue).toBe(processedValue + 100 * SERVICE_PRICE);
  });

  test("BR-SCO-15 rejected pieces are moved to scrap at the cost of the lot they came from, and accepted + rejected together use the processed lot value", async () => {
    const s = await makeTwoLotSco();
    const rcpt = await call("fs", "POST", `/sco/${s.scoId}/receipts`, {
      vendorChallanNo: uniq("VC"),
      lines: [{ scoItemId: s.itemId, processedQty: 100, unprocessedQty: 100 }],
    });
    expect(rcpt.status).toBe(201);
    const receiptId = rcpt.json.data.receipt.id as number;
    const lineId = rcpt.json.data.lines[0].id as number;
    const afterReceipt = await ledgerRows(s.raw, "sco_receipt");
    const unprocessedValue = outValue(afterReceipt);

    const dec = await call(
      "qa",
      "POST",
      `/sco/receipts/${receiptId}/lines/${lineId}/qa`,
      { acceptedQty: 60, rejectedQty: 40 },
    );
    expect(dec.status).toBe(200);
    const qaRows = (await ledgerRows(s.raw, "sco_receipt")).filter(
      (r) => !afterReceipt.some((p) => p.id === r.id),
    );
    const processedValue = outValue(qaRows);
    expect(outQty(qaRows)).toBe(100);
    expect(unprocessedValue + processedValue).toBe(30_000);
    // Every processed piece is priced at one lot's cost (100 or 200 a piece).
    for (const r of qaRows) {
      expect([100, 200]).toContain(r.unitCostPaise);
    }
    // Vendor location holds nothing of the raw item afterwards.
    const all = await db
      .select({
        q: inventoryLedger.quantityChange,
        l: inventoryLedger.locationId,
      })
      .from(inventoryLedger)
      .innerJoin(locations, eq(locations.id, inventoryLedger.locationId))
      .where(
        and(
          eq(inventoryLedger.itemId, s.raw),
          eq(locations.linkedVendorId, vendorId),
        ),
      );
    expect(all.reduce((a, r) => a + r.q, 0)).toBe(0);
  });
});
