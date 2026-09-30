/**
 * docs/specs/purchase-order.md BR-PO-10: receipt status is worked out only from GRN postings
 * (BR-GRN-27, 34). Every line received >= ordered -> fully_received; some received ->
 * partial_received; nothing received after corrections -> dispatched. Moves both ways.
 *
 * Real DB. GRN accept / bypass / correction go through grnService; PO rows are raw fixtures
 * (a dispatched PO). Fixtures are TEST_poreceipt_ prefixed and removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
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
  purchaseOrderItems,
  purchaseOrders,
  qaTests,
} from "../../src/db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { loadActor } from "../../src/lib/auth-middleware";
import { grnService } from "../../src/service/grnService";
import {
  grnBypassSchema,
  grnCorrectionSchema,
  grnQaActionSchema,
} from "../../src/types/grn.types";

const P = "TEST_poreceipt_";
let actorId: number;
let supplierId: number;
let createdMainStore = false;
let mainStoreId: number;
const itemIds: number[] = [];
const poIds: number[] = [];
const grnIds: number[] = [];
let seq = 0;
const uniq = (t: string) => `${P}${t}_${Date.now()}_${++seq}`;

async function makePo(qtys: number[]) {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: uniq("PO"),
      supplierId,
      status: "dispatched",
      createdBy: actorId,
    })
    .returning({ id: purchaseOrders.id });
  poIds.push(po!.id);
  const lineItems: number[] = [];
  for (const _ of qtys) {
    const [it] = await db
      .insert(itemMaster)
      .values({
        sku: uniq("sku"),
        name: `${P}item`,
        category: "Raw Material",
        uom: "kg",
        standardRatePaise: 100,
      })
      .returning({ id: itemMaster.id });
    itemIds.push(it!.id);
    lineItems.push(it!.id);
  }
  const lines = await db
    .insert(purchaseOrderItems)
    .values(
      qtys.map((qty, i) => ({
        poId: po!.id,
        itemId: lineItems[i]!,
        qty,
        unitPricePaise: 100,
        uom: "kg",
      })),
    )
    .returning({ id: purchaseOrderItems.id });
  return { poId: po!.id, poItemIds: lines.map((l) => l.id) };
}

async function makeGrn(poId: number, poItemId: number, arrivedQty: number) {
  const c = await grnService.create(
    {
      poId,
      challanNo: uniq("ch"),
      lines: [{ poItemId, arrivedQty }],
    },
    actorId,
  );
  grnIds.push(c.grn.id);
  return { grnId: c.grn.id, lineId: c.items[0]!.id as number };
}

async function accept(
  g: { grnId: number; lineId: number },
  acceptedQty: number,
  rejectedQty = 0,
) {
  const actor = await loadActor(actorId);
  return grnService.qaAction(
    g.grnId,
    g.lineId,
    grnQaActionSchema.parse({ acceptedQty, rejectedQty }),
    actorId,
    actor!,
  );
}

async function bypass(g: { grnId: number; lineId: number }) {
  const actor = await loadActor(actorId);
  return grnService.bypass(
    g.grnId,
    g.lineId,
    grnBypassSchema.parse({ bypassReason: "test bypass" }),
    actorId,
    actor!,
  );
}

const correct = (g: { grnId: number; lineId: number }, qty: number) =>
  grnService.correction(
    g.grnId,
    g.lineId,
    grnCorrectionSchema.parse({ qty, reason: "test correction" }),
    actorId,
  );

async function poStatus(poId: number) {
  const [r] = await db
    .select({ s: purchaseOrders.status })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, poId));
  return r!.s;
}

beforeAll(async () => {
  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "owner"))
    .limit(1);
  const [emp] = await db
    .insert(employees)
    .values({ name: `${P}actor`, roleId: ownerRole!.id, isActive: true })
    .returning({ id: employees.id });
  actorId = emp!.id;
  const [sup] = await db
    .insert(supplierMaster)
    .values({ name: `${P}supplier` })
    .returning({ id: supplierMaster.id });
  supplierId = sup!.id;
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
      .values({ name: `${P}main_store`, type: "main_store" })
      .returning({ id: locations.id });
    mainStoreId = loc!.id;
    createdMainStore = true;
  }
});

afterAll(async () => {
  if (itemIds.length) {
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, itemIds));
  }
  if (grnIds.length) {
    const lines = await db
      .select({ id: grnItems.id })
      .from(grnItems)
      .where(inArray(grnItems.grnId, grnIds));
    const lineIds = lines.map((l) => l.id);
    if (lineIds.length) {
      await db
        .delete(grnCorrections)
        .where(inArray(grnCorrections.grnItemId, lineIds));
      await db.delete(qaTests).where(inArray(qaTests.grnItemId, lineIds));
      await db.delete(grnItems).where(inArray(grnItems.id, lineIds));
    }
    await db.delete(grns).where(inArray(grns.id, grnIds));
  }
  if (poIds.length) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, poIds));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
  }
  if (itemIds.length) {
    await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
  }
  if (createdMainStore) {
    await db.delete(locations).where(eq(locations.id, mainStoreId));
  }
  await db.delete(supplierMaster).where(eq(supplierMaster.id, supplierId));
  await db
    .update(documentNumberCounters)
    .set({ createdBy: null, lastUpdatedBy: null })
    .where(
      sql`coalesce(${documentNumberCounters.lastUpdatedBy}, ${documentNumberCounters.createdBy}) = ${actorId}`,
    );
  await db.delete(employees).where(eq(employees.id, actorId));
});

describe("BR-PO-10 receipt status from GRN postings", () => {
  test("BR-PO-10 nothing received yet -> dispatched", async () => {
    const po = await makePo([1000]);
    await makeGrn(po.poId, po.poItemIds[0]!, 1000);
    expect(await poStatus(po.poId)).toBe("dispatched");
  });

  test("BR-PO-10 980 of 1000 accepted -> partial_received; 20 more -> fully_received", async () => {
    const po = await makePo([1000]);
    const g1 = await makeGrn(po.poId, po.poItemIds[0]!, 980);
    await accept(g1, 980);
    expect(await poStatus(po.poId)).toBe("partial_received");
    const g2 = await makeGrn(po.poId, po.poItemIds[0]!, 20);
    await accept(g2, 20);
    expect(await poStatus(po.poId)).toBe("fully_received");
  });

  test("BR-PO-10 fully_received, correct 30 -> partial_received (moves back)", async () => {
    const po = await makePo([1000]);
    const g1 = await makeGrn(po.poId, po.poItemIds[0]!, 980);
    await accept(g1, 980);
    const g2 = await makeGrn(po.poId, po.poItemIds[0]!, 20);
    await accept(g2, 20);
    expect(await poStatus(po.poId)).toBe("fully_received");
    await correct(g1, 30);
    expect(await poStatus(po.poId)).toBe("partial_received");
  });

  test("BR-PO-10 correct everything received -> back to dispatched", async () => {
    const po = await makePo([1000]);
    const g = await makeGrn(po.poId, po.poItemIds[0]!, 980);
    await accept(g, 980);
    expect(await poStatus(po.poId)).toBe("partial_received");
    await correct(g, 500);
    expect(await poStatus(po.poId)).toBe("partial_received");
    await correct(g, 480);
    expect(await poStatus(po.poId)).toBe("dispatched");
  });

  test("BR-PO-10 a rejected qty is not received: full reject leaves the PO dispatched", async () => {
    const po = await makePo([1000]);
    const g = await makeGrn(po.poId, po.poItemIds[0]!, 1000);
    await accept(g, 0, 1000);
    expect(await poStatus(po.poId)).toBe("dispatched");
  });

  test("BR-PO-10 partly rejected: only the accepted part counts (900 accepted, 100 rejected -> partial_received)", async () => {
    const po = await makePo([1000]);
    const g = await makeGrn(po.poId, po.poItemIds[0]!, 1000);
    await accept(g, 900, 100);
    expect(await poStatus(po.poId)).toBe("partial_received");
  });

  test("BR-PO-10 received above ordered counts as fully_received (>=)", async () => {
    const po = await makePo([1000]);
    const g = await makeGrn(po.poId, po.poItemIds[0]!, 1000);
    await accept(g, 1000);
    expect(await poStatus(po.poId)).toBe("fully_received");
  });

  test("BR-PO-10 QA bypass counts as received", async () => {
    const po = await makePo([1000]);
    const g = await makeGrn(po.poId, po.poItemIds[0]!, 1000);
    await bypass(g);
    expect(await poStatus(po.poId)).toBe("fully_received");
  });

  test("BR-PO-10 two lines: one line full, other untouched -> partial_received; both full -> fully_received", async () => {
    const po = await makePo([100, 50]);
    const g1 = await makeGrn(po.poId, po.poItemIds[0]!, 100);
    await accept(g1, 100);
    expect(await poStatus(po.poId)).toBe("partial_received");
    const g2 = await makeGrn(po.poId, po.poItemIds[1]!, 50);
    await accept(g2, 50);
    expect(await poStatus(po.poId)).toBe("fully_received");
  });

  test("BR-PO-10 two lines: correcting one line's receipt to zero drops fully_received to partial_received", async () => {
    const po = await makePo([100, 50]);
    const g1 = await makeGrn(po.poId, po.poItemIds[0]!, 100);
    await accept(g1, 100);
    const g2 = await makeGrn(po.poId, po.poItemIds[1]!, 50);
    await accept(g2, 50);
    await correct(g2, 50);
    expect(await poStatus(po.poId)).toBe("partial_received");
  });
});
