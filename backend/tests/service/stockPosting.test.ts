/**
 * Stock posting + average cost — spec docs/specs/grn-stock.md (BR-GRN-21, 22,
 * 24, 32, 33, 37..44). Real-DB integration test.
 *
 * GRN paths (accept / bypass / correction) go through `grnService`; manual
 * movements, items API and reconciliation go through the HTTP contract
 * (`createApp()`), since that is the stable interface for them.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
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
  purchaseOrderItems,
  purchaseOrders,
  qaTests,
} from "../../src/db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { loadActor } from "../../src/lib/auth-middleware";
import { ConflictError, NotFoundError } from "../../src/lib/errors";
import { signAccessToken } from "../../src/lib/token";
import { grnService } from "../../src/service/grnService";
import {
  grnBypassSchema,
  grnCorrectionSchema,
  grnQaActionSchema,
} from "../../src/types/grn.types";

const P = "TEST_stock_";
// Seed role names (test data), used to pick which real employee makes the call.
type Role =
  | "owner"
  | "back_office"
  | "floor_supervisor"
  | "qa_inspector"
  | "die_designer"
  | "operator"
  | "super-admin";

const app = createApp();

let actorId: number;
let supplierId: number;
let mainStoreId: number;
let createdMainStore = false;
const extraLocationIds: number[] = [];
const itemIds: number[] = [];
const poIds: number[] = [];
const grnIds: number[] = [];
let seq = 0;

// ---------- fixtures ----------

function uniq(tag: string) {
  seq += 1;
  return `${P}${tag}_${Date.now()}_${seq}`;
}

async function makeItem(tag: string, uom = "kg") {
  const [row] = await db
    .insert(itemMaster)
    .values({
      sku: uniq(`sku_${tag}`),
      name: `${P}${tag}`,
      category: "Raw Material",
      uom,
    })
    .returning({ id: itemMaster.id });
  if (!row) throw new Error("item fixture failed");
  itemIds.push(row.id);
  return row.id;
}

async function makeLocation(type: "scrap_yard" | "finished_goods") {
  const [row] = await db
    .insert(locations)
    .values({ name: uniq("loc"), type })
    .returning({ id: locations.id });
  if (!row) throw new Error("location fixture failed");
  extraLocationIds.push(row.id);
  return row.id;
}

/** A dispatched PO with one line per spec: [itemId, qty, ratePaise]. */
async function makePo(lines: Array<[number, number, number]>) {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: uniq("PO"),
      supplierId,
      status: "dispatched",
      createdBy: actorId,
    })
    .returning({ id: purchaseOrders.id });
  if (!po) throw new Error("po fixture failed");
  poIds.push(po.id);
  const poItems = await db
    .insert(purchaseOrderItems)
    .values(
      lines.map(([itemId, qty, unitPricePaise]) => ({
        poId: po.id,
        itemId,
        qty,
        unitPricePaise,
        uom: "kg",
      })),
    )
    .returning({ id: purchaseOrderItems.id });
  return { poId: po.id, poItemIds: poItems.map((r) => r.id) };
}

/** Draft GRN for the PO lines; returns grn id and its line ids in order. */
async function makeGrn(
  poId: number,
  lines: Array<{ poItemId: number; arrivedQty: number; batchNumber?: string }>,
) {
  const created = await grnService.create(
    { poId, challanNo: uniq("ch"), lines },
    actorId,
  );
  grnIds.push(created.grn.id);
  return {
    grnId: created.grn.id,
    lineIds: created.items.map((l: { id: number }) => l.id),
  };
}

/** One item, one PO line, one GRN line. */
async function setupLine(opts: {
  qty: number;
  arrived: number;
  rate: number;
  uom?: string;
  batch?: string;
  itemId?: number;
}) {
  const itemId = opts.itemId ?? (await makeItem("l", opts.uom));
  const po = await makePo([[itemId, opts.qty, opts.rate]]);
  const grn = await makeGrn(po.poId, [
    {
      poItemId: po.poItemIds[0] as number,
      arrivedQty: opts.arrived,
      ...(opts.batch ? { batchNumber: opts.batch } : {}),
    },
  ]);
  return {
    itemId,
    poId: po.poId,
    poItemId: po.poItemIds[0] as number,
    grnId: grn.grnId,
    lineId: grn.lineIds[0] as number,
  };
}

async function accept(
  grnId: number,
  lineId: number,
  acceptedQty: number,
  rejectedQty = 0,
) {
  return grnService.qaAction(
    grnId,
    lineId,
    grnQaActionSchema.parse({ acceptedQty, rejectedQty }),
    actorId,
    await ownerActor(),
  );
}

async function bypass(grnId: number, lineId: number, acceptedQty?: number) {
  return grnService.bypass(
    grnId,
    lineId,
    grnBypassSchema.parse({ bypassReason: "test bypass", acceptedQty }),
    actorId,
    await ownerActor(),
  );
}

async function correct(grnId: number, lineId: number, qty: number) {
  return grnService.correction(
    grnId,
    lineId,
    grnCorrectionSchema.parse({ qty, reason: "test correction" }),
    actorId,
  );
}

async function ledger(itemId: number) {
  return db
    .select()
    .from(inventoryLedger)
    .where(eq(inventoryLedger.itemId, itemId))
    .orderBy(inventoryLedger.id);
}

async function item(itemId: number) {
  const [row] = await db
    .select()
    .from(itemMaster)
    .where(eq(itemMaster.id, itemId));
  if (!row) throw new Error("item missing");
  return row;
}

async function lineRow(lineId: number) {
  const [row] = await db.select().from(grnItems).where(eq(grnItems.id, lineId));
  if (!row) throw new Error("line missing");
  return row;
}

async function expectRejects<T extends Error>(
  p: Promise<unknown>,
  cls: new (...a: never[]) => T,
) {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(cls);
}

// The caller's role is read from the employee row (BR-AUTH-12), never from the
// token: each role gets its own real employee (P-prefixed, removed in afterAll).
// The owner's is actorId.
const roleUsers = new Map<string, number>();
async function userFor(role: string): Promise<number> {
  if (role === "owner") return actorId;
  let id = roleUsers.get(role);
  if (!id) {
    const [r] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, role))
      .limit(1);
    if (!r) throw new Error(`seed role ${role} missing`);
    const [e] = await db
      .insert(employees)
      .values({ name: `${P}u_${role}`, roleId: r.id, isActive: true })
      .returning({ id: employees.id });
    id = e!.id;
    roleUsers.set(role, id);
  }
  return id;
}

async function ownerActor() {
  const a = await loadActor(actorId);
  if (!a) throw new Error("actor fixture missing");
  return a;
}

async function token(role: Role) {
  return signAccessToken({
    userId: await userFor(role),
    userName: `${P}${role}`,
    role,
    allowedPages: [],
  });
}

async function http(method: string, path: string, role: Role, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${await token(role)}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    data?: Record<string, unknown> & { id?: number };
  } | null;
  return { status: res.status, json };
}

function manual(role: Role, body: Record<string, unknown>) {
  return http("POST", "/api/asset/inventory/movements", role, body);
}

function stockTake(
  role: Role,
  itemId: number,
  locationId: number,
  countedQty: number,
  extra: Record<string, unknown> = {},
) {
  return manual(role, {
    itemId,
    locationId,
    referenceType: "stock_adjustment",
    countedQty,
    reason: "stock-take",
    ...extra,
  });
}

function openingStock(
  role: Role,
  itemId: number,
  locationId: number,
  qty: number,
  unitCostPaise = 100,
  extra: Record<string, unknown> = {},
) {
  return manual(role, {
    itemId,
    locationId,
    referenceType: "opening_stock",
    qty,
    unitCostPaise,
    reason: "opening",
    ...extra,
  });
}

// ---------- setup / teardown ----------

beforeAll(async () => {
  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "owner"))
    .limit(1);
  if (!ownerRole) throw new Error("role owner missing");
  const [emp] = await db
    .insert(employees)
    .values({ name: `${P}actor`, roleId: ownerRole.id, isActive: true })
    .returning({ id: employees.id });
  if (!emp) throw new Error("employee fixture failed");
  actorId = emp.id;

  const [sup] = await db
    .insert(supplierMaster)
    .values({ name: `${P}supplier` })
    .returning({ id: supplierMaster.id });
  if (!sup) throw new Error("supplier fixture failed");
  supplierId = sup.id;

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
    if (!loc) throw new Error("main_store fixture failed");
    mainStoreId = loc.id;
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
  // items created through the HTTP test (BR-GRN-40) by sku prefix
  await db.delete(itemMaster).where(sql`${itemMaster.sku} like ${`${P}%`}`);
  if (extraLocationIds.length) {
    await db.delete(locations).where(inArray(locations.id, extraLocationIds));
  }
  if (createdMainStore) {
    await db.delete(locations).where(eq(locations.id, mainStoreId));
  }
  await db.delete(supplierMaster).where(eq(supplierMaster.id, supplierId));
  // shared document counters keep pointing at the last actor; release them
  await db
    .update(documentNumberCounters)
    .set({ createdBy: null, lastUpdatedBy: null })
    .where(
      inArray(
        sql`coalesce(${documentNumberCounters.lastUpdatedBy}, ${documentNumberCounters.createdBy})`,
        db
          .select({ id: employees.id })
          .from(employees)
          .where(sql`${employees.name} like ${`${P}%`}`),
      ),
    );
  await db.delete(employees).where(sql`${employees.name} like ${`${P}%`}`);
});

// ---------- BR-GRN-21 ----------

describe("BR-GRN-21 accept / bypass posts one ledger row", () => {
  test("BR-GRN-21 accept 980 of 1000 posts one `in` row at PO rate in main_store, with refs and batch", async () => {
    const s = await setupLine({
      qty: 1000,
      arrived: 1000,
      rate: 21000,
      batch: "HEAT-77",
    });
    await accept(s.grnId, s.lineId, 980, 20);

    const rows = await ledger(s.itemId);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r?.transactionType).toBe("in");
    expect(r?.quantityChange).toBe(980);
    expect(r?.unitCostPaise).toBe(21000);
    expect(r?.locationId).toBe(mainStoreId);
    expect(r?.referenceType).toBe("grn");
    expect(r?.referenceId).toBe(s.grnId);
    expect(r?.referenceLineId).toBe(s.lineId);
    expect(r?.batchNumber).toBe("HEAT-77");
  });

  test("BR-GRN-21 bypass posts one row with reference grn_bypass and line id", async () => {
    const s = await setupLine({ qty: 100, arrived: 100, rate: 5000 });
    await bypass(s.grnId, s.lineId);

    const rows = await ledger(s.itemId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.transactionType).toBe("in");
    expect(rows[0]?.quantityChange).toBe(100);
    expect(rows[0]?.unitCostPaise).toBe(5000);
    expect(rows[0]?.referenceType).toBe("grn_bypass");
    expect(rows[0]?.referenceId).toBe(s.grnId);
    expect(rows[0]?.referenceLineId).toBe(s.lineId);
  });

  test("BR-GRN-21 accepted qty 0 (full reject) posts no ledger row", async () => {
    const s = await setupLine({ qty: 50, arrived: 50, rate: 1000 });
    await accept(s.grnId, s.lineId, 0, 50);
    expect(await ledger(s.itemId)).toHaveLength(0);
    expect((await item(s.itemId)).currentStock).toBe(0);
  });

  test("BR-GRN-21 no main_store location -> 404 and nothing is saved", async () => {
    const s = await setupLine({ qty: 100, arrived: 100, rate: 1000 });
    const mains = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.type, "main_store"));
    const ids = mains.map((m) => m.id);
    await db
      .update(locations)
      .set({ type: "scrap_yard" })
      .where(inArray(locations.id, ids));
    try {
      await expectRejects(accept(s.grnId, s.lineId, 100), NotFoundError);
    } finally {
      await db
        .update(locations)
        .set({ type: "main_store" })
        .where(inArray(locations.id, ids));
    }
    expect(await ledger(s.itemId)).toHaveLength(0);
    expect((await item(s.itemId)).currentStock).toBe(0);
    const line = await lineRow(s.lineId);
    expect(line.qaStatus).toBe("pending");
    const tests = await db
      .select()
      .from(qaTests)
      .where(eq(qaTests.grnItemId, s.lineId));
    expect(tests).toHaveLength(0);
  });
});

// ---------- BR-GRN-22 ----------

describe("BR-GRN-22 all-or-nothing save", () => {
  async function withFailingPoItemUpdate<T>(
    poItemId: number,
    fn: () => Promise<T>,
  ) {
    const fnName = `${P}fail_fn_${poItemId}`;
    const trgName = `${P}fail_trg_${poItemId}`;
    await db.execute(
      sql.raw(
        `create or replace function ${fnName}() returns trigger as $$ begin if new.id = ${poItemId} then raise exception 'forced failure'; end if; return new; end; $$ language plpgsql`,
      ),
    );
    await db.execute(
      sql.raw(
        `create trigger ${trgName} before update on purchase_order_items for each row execute function ${fnName}()`,
      ),
    );
    try {
      return await fn();
    } finally {
      await db.execute(
        sql.raw(`drop trigger if exists ${trgName} on purchase_order_items`),
      );
      await db.execute(sql.raw(`drop function if exists ${fnName}()`));
    }
  }

  test("BR-GRN-22 accept with PO update forced to fail -> no ledger row, stock unchanged, line pending", async () => {
    const s = await setupLine({ qty: 100, arrived: 100, rate: 1000 });
    await withFailingPoItemUpdate(s.poItemId, async () => {
      let threw = false;
      try {
        await accept(s.grnId, s.lineId, 100);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
    expect(await ledger(s.itemId)).toHaveLength(0);
    const it = await item(s.itemId);
    expect(it.currentStock).toBe(0);
    expect(it.averageCostPaise).toBe(0);
    expect((await lineRow(s.lineId)).qaStatus).toBe("pending");
    const tests = await db
      .select()
      .from(qaTests)
      .where(eq(qaTests.grnItemId, s.lineId));
    expect(tests).toHaveLength(0);
  });

  test("BR-GRN-22 bypass with PO update forced to fail -> nothing saved", async () => {
    const s = await setupLine({ qty: 100, arrived: 100, rate: 1000 });
    await withFailingPoItemUpdate(s.poItemId, async () => {
      let threw = false;
      try {
        await bypass(s.grnId, s.lineId);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
    expect(await ledger(s.itemId)).toHaveLength(0);
    expect((await item(s.itemId)).currentStock).toBe(0);
    const line = await lineRow(s.lineId);
    expect(line.qaStatus).toBe("pending");
    expect(line.isQaBypassed).toBeFalsy();
  });

  test("BR-GRN-22 correction with PO update forced to fail -> nothing saved", async () => {
    const s = await setupLine({ qty: 100, arrived: 100, rate: 1000 });
    await accept(s.grnId, s.lineId, 100);
    await withFailingPoItemUpdate(s.poItemId, async () => {
      let threw = false;
      try {
        await correct(s.grnId, s.lineId, 10);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
    expect(await ledger(s.itemId)).toHaveLength(1);
    expect((await item(s.itemId)).currentStock).toBe(100);
    const corr = await db
      .select()
      .from(grnCorrections)
      .where(eq(grnCorrections.grnItemId, s.lineId));
    expect(corr).toHaveLength(0);
  });
});

// ---------- BR-GRN-24 ----------

describe("BR-GRN-24 row value rounding", () => {
  test("BR-GRN-24 2.5 kg @ 1 paise -> +3; its correction -> -3; net exactly 0", async () => {
    const s = await setupLine({ qty: 10, arrived: 2.5, rate: 1 });
    await accept(s.grnId, s.lineId, 2.5);
    await correct(s.grnId, s.lineId, 2.5);
    const rows = await ledger(s.itemId);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.totalValueChangePaise).toBe(3);
    expect(rows[1]?.totalValueChangePaise).toBe(-3);
    const net = rows.reduce((a, r) => a + r.totalValueChangePaise, 0);
    expect(net).toBe(0);
  });

  test("BR-GRN-24 0.5 kg @ 1 paise rounds half away from zero -> +1", async () => {
    const s = await setupLine({ qty: 10, arrived: 0.5, rate: 1 });
    await accept(s.grnId, s.lineId, 0.5);
    expect((await ledger(s.itemId))[0]?.totalValueChangePaise).toBe(1);
  });
});

// ---------- BR-GRN-32 / 39 ----------

describe("BR-GRN-32 correction ledger row", () => {
  test("BR-GRN-32 correction posts adjustment -qty at the posted cost (not the current average) with grn_correction refs", async () => {
    const itemId = await makeItem("corr");
    const a = await setupLine({ itemId, qty: 100, arrived: 100, rate: 21000 });
    const b = await setupLine({ itemId, qty: 100, arrived: 100, rate: 20000 });
    await accept(a.grnId, a.lineId, 100);
    await accept(b.grnId, b.lineId, 100);
    expect((await item(itemId)).averageCostPaise).toBe(20500);

    await correct(a.grnId, a.lineId, 30);

    const rows = await ledger(itemId);
    const last = rows[rows.length - 1];
    expect(rows).toHaveLength(3);
    expect(last?.transactionType).toBe("adjustment");
    expect(last?.quantityChange).toBe(-30);
    expect(last?.unitCostPaise).toBe(21000);
    expect(last?.referenceType).toBe("grn_correction");
    expect(last?.referenceId).toBe(a.grnId);
    expect(last?.referenceLineId).toBe(a.lineId);
    expect(last?.locationId).toBe(mainStoreId);
  });

  test("BR-GRN-39 correction takes value out at posted cost: (200*20500 - 30*21000)/170 -> 20412", async () => {
    const itemId = await makeItem("avgcorr");
    const a = await setupLine({ itemId, qty: 100, arrived: 100, rate: 21000 });
    const b = await setupLine({ itemId, qty: 100, arrived: 100, rate: 20000 });
    await accept(a.grnId, a.lineId, 100);
    await accept(b.grnId, b.lineId, 100);
    await correct(a.grnId, a.lineId, 30);
    const it = await item(itemId);
    expect(it.currentStock).toBe(170);
    expect(it.averageCostPaise).toBe(20412);
  });

  test("BR-GRN-39 1500 @ 21333, correct 500 received @ 22000 -> average 21000", async () => {
    const itemId = await makeItem("avgspec");
    const a = await setupLine({
      itemId,
      qty: 1000,
      arrived: 1000,
      rate: 21000,
    });
    const b = await setupLine({ itemId, qty: 500, arrived: 500, rate: 22000 });
    await accept(a.grnId, a.lineId, 1000);
    await accept(b.grnId, b.lineId, 500);
    expect((await item(itemId)).averageCostPaise).toBe(21333);
    await correct(b.grnId, b.lineId, 500);
    const it = await item(itemId);
    expect(it.currentStock).toBe(1000);
    expect(it.averageCostPaise).toBe(21000);
  });

  test("BR-GRN-39 negative computed average -> average stays", async () => {
    const itemId = await makeItem("avgneg");
    const a = await setupLine({ itemId, qty: 100, arrived: 100, rate: 1000 });
    const b = await setupLine({ itemId, qty: 100, arrived: 100, rate: 30000 });
    await accept(a.grnId, a.lineId, 100);
    await accept(b.grnId, b.lineId, 100);
    expect((await item(itemId)).averageCostPaise).toBe(15500);
    // count 100 of the 200 -> posts -100
    const out = await stockTake("owner", itemId, mainStoreId, 100);
    expect([200, 201]).toContain(out.status);
    // (100*15500 - 60*30000) / 40 < 0
    await correct(b.grnId, b.lineId, 60);
    const it = await item(itemId);
    expect(it.currentStock).toBe(40);
    expect(it.averageCostPaise).toBe(15500);
  });

  test("BR-GRN-39 correction that takes stock to 0 leaves the average unchanged", async () => {
    const s = await setupLine({ qty: 500, arrived: 500, rate: 21000 });
    await accept(s.grnId, s.lineId, 500);
    await correct(s.grnId, s.lineId, 500);
    const it = await item(s.itemId);
    expect(it.currentStock).toBe(0);
    expect(it.averageCostPaise).toBe(21000);
  });
});

// ---------- BR-GRN-33 ----------

describe("BR-GRN-33 no negative balance", () => {
  test("BR-GRN-33 received 980, 900 issued (balance 80), correct 100 -> 409, nothing posted", async () => {
    const s = await setupLine({ qty: 980, arrived: 980, rate: 21000 });
    await accept(s.grnId, s.lineId, 980);
    // count 80 of 980 -> posts -900
    const out = await stockTake("owner", s.itemId, mainStoreId, 80);
    expect([200, 201]).toContain(out.status);
    const before = await ledger(s.itemId);
    const stockBefore = (await item(s.itemId)).currentStock;
    expect(stockBefore).toBe(80);

    await expectRejects(correct(s.grnId, s.lineId, 100), ConflictError);

    expect(await ledger(s.itemId)).toHaveLength(before.length);
    expect((await item(s.itemId)).currentStock).toBe(80);
    const corr = await db
      .select()
      .from(grnCorrections)
      .where(eq(grnCorrections.grnItemId, s.lineId));
    expect(corr).toHaveLength(0);
  });

  test("BR-GRN-33 stock-take can never take a balance below zero: negative counted qty -> 400, nothing posted", async () => {
    const itemId = await makeItem("neg");
    const loc = await makeLocation("scrap_yard");
    const inn = await openingStock("owner", itemId, loc, 10);
    expect([200, 201]).toContain(inn.status);
    const res = await stockTake("owner", itemId, loc, -1);
    expect(res.status).toBe(400);
    expect(await ledger(itemId)).toHaveLength(1);
    expect((await item(itemId)).currentStock).toBe(10);
  });

  test("BR-GRN-33 stock-take is per location: counted 0 at an empty location while another holds stock -> 400 no difference, nothing posted", async () => {
    const itemId = await makeItem("negloc");
    const full = await makeLocation("scrap_yard");
    const empty = await makeLocation("finished_goods");
    await openingStock("owner", itemId, full, 50);
    const res = await stockTake("owner", itemId, empty, 0);
    expect(res.status).toBe(400);
    expect(await ledger(itemId)).toHaveLength(1);
    expect((await item(itemId)).currentStock).toBe(50);
  });
});

// ---------- BR-GRN-37 ----------

describe("BR-GRN-37 item stock = ledger total", () => {
  test("BR-GRN-37 accept 980 -> stock 980; correction 30 -> 950", async () => {
    const s = await setupLine({ qty: 1000, arrived: 980, rate: 21000 });
    await accept(s.grnId, s.lineId, 980);
    expect((await item(s.itemId)).currentStock).toBe(980);
    await correct(s.grnId, s.lineId, 30);
    expect((await item(s.itemId)).currentStock).toBe(950);
  });

  test("BR-GRN-37 stock is the sum across locations, kept right by manual postings", async () => {
    const itemId = await makeItem("multi");
    const loc = await makeLocation("scrap_yard");
    const s = await setupLine({ itemId, qty: 100, arrived: 100, rate: 1000 });
    await accept(s.grnId, s.lineId, 100);
    await openingStock("owner", itemId, loc, 25, 1000);
    // main store holds 100; count 93 -> posts -7
    await stockTake("back_office", itemId, mainStoreId, 93);
    const rows = await ledger(itemId);
    const total = rows.reduce((a, r) => a + r.quantityChange, 0);
    expect(total).toBe(118);
    expect((await item(itemId)).currentStock).toBe(118);
  });

  test("BR-GRN-37 bypass path also updates item stock", async () => {
    const s = await setupLine({ qty: 40, arrived: 40, rate: 1000 });
    await bypass(s.grnId, s.lineId);
    expect((await item(s.itemId)).currentStock).toBe(40);
  });
});

// ---------- BR-GRN-38 ----------

describe("BR-GRN-38 moving average on stock in", () => {
  test("BR-GRN-38 0 stock, 1000 @ 21000 -> 21000; then 500 @ 22000 -> 21333", async () => {
    const itemId = await makeItem("avg");
    const a = await setupLine({
      itemId,
      qty: 1000,
      arrived: 1000,
      rate: 21000,
    });
    await accept(a.grnId, a.lineId, 1000);
    expect((await item(itemId)).averageCostPaise).toBe(21000);
    const b = await setupLine({ itemId, qty: 500, arrived: 500, rate: 22000 });
    await accept(b.grnId, b.lineId, 500);
    const it = await item(itemId);
    expect(it.currentStock).toBe(1500);
    expect(it.averageCostPaise).toBe(21333);
  });

  test("BR-GRN-38 average rounds half up", async () => {
    // 1 @ 100 then 1 @ 101 -> 100.5 -> 101
    const itemId = await makeItem("avghalf");
    const a = await setupLine({ itemId, qty: 1, arrived: 1, rate: 100 });
    const b = await setupLine({ itemId, qty: 1, arrived: 1, rate: 101 });
    await accept(a.grnId, a.lineId, 1);
    await accept(b.grnId, b.lineId, 1);
    expect((await item(itemId)).averageCostPaise).toBe(101);
  });

  test("BR-GRN-38 old stock <= 0: new average = cost (stock -5, 10 @ 100 -> 100)", async () => {
    const itemId = await makeItem("avgneg");
    await db
      .update(itemMaster)
      .set({ currentStock: -5, averageCostPaise: 7777 })
      .where(eq(itemMaster.id, itemId));
    const s = await setupLine({ itemId, qty: 10, arrived: 10, rate: 100 });
    await accept(s.grnId, s.lineId, 10);
    expect((await item(itemId)).averageCostPaise).toBe(100);
  });

  test("BR-GRN-38 bypass stock-in also moves the average", async () => {
    const itemId = await makeItem("avgbyp");
    const a = await setupLine({ itemId, qty: 100, arrived: 100, rate: 1000 });
    const b = await setupLine({ itemId, qty: 100, arrived: 100, rate: 2000 });
    await accept(a.grnId, a.lineId, 100);
    await bypass(b.grnId, b.lineId);
    expect((await item(itemId)).averageCostPaise).toBe(1500);
  });

  test("BR-GRN-39 any other stock out (manual) leaves the average unchanged", async () => {
    const s = await setupLine({ qty: 100, arrived: 100, rate: 3000 });
    await accept(s.grnId, s.lineId, 100);
    await stockTake("owner", s.itemId, mainStoreId, 90);
    const it = await item(s.itemId);
    expect(it.currentStock).toBe(90);
    expect(it.averageCostPaise).toBe(3000);
  });
});

// ---------- BR-GRN-40 ----------

describe("BR-GRN-40 stock and average not settable via item API", () => {
  test("BR-GRN-40 create item with currentStock -> 400 and no item created", async () => {
    const sku = uniq("http_item");
    const res = await http("POST", "/api/asset/items", "back_office", {
      sku,
      name: `${P}n`,
      category: "Raw Material",
      uom: "kg",
      currentStock: 50,
    });
    expect(res.status).toBe(400);
    const found = await db
      .select({ id: itemMaster.id })
      .from(itemMaster)
      .where(eq(itemMaster.sku, sku));
    expect(found).toHaveLength(0);
  });

  test("BR-GRN-40 create item with averageCostPaise -> 400", async () => {
    const res = await http("POST", "/api/asset/items", "back_office", {
      sku: uniq("http_item"),
      name: `${P}n`,
      category: "Raw Material",
      uom: "kg",
      averageCostPaise: 100,
    });
    expect(res.status).toBe(400);
  });

  test("BR-GRN-40 edit item with stock 50 -> 400, stock unchanged", async () => {
    const itemId = await makeItem("edit");
    const res = await http(
      "PATCH",
      `/api/asset/items/${itemId}`,
      "back_office",
      {
        currentStock: 50,
      },
    );
    expect(res.status).toBe(400);
    expect((await item(itemId)).currentStock).toBe(0);
  });

  test("BR-GRN-40 edit item with averageCostPaise -> 400, average unchanged", async () => {
    const itemId = await makeItem("editavg");
    const res = await http(
      "PATCH",
      `/api/asset/items/${itemId}`,
      "back_office",
      {
        name: `${P}renamed`,
        averageCostPaise: 999,
      },
    );
    expect(res.status).toBe(400);
    expect((await item(itemId)).averageCostPaise).toBe(0);
  });

  test("BR-GRN-40 opening stock goes in as a manual adjustment of type opening_stock with qty and rate", async () => {
    const itemId = await makeItem("open");
    const res = await openingStock("owner", itemId, mainStoreId, 50, 1200, {
      reason: "opening balance",
    });
    expect([200, 201]).toContain(res.status);
    const it = await item(itemId);
    expect(it.currentStock).toBe(50);
    expect(it.averageCostPaise).toBe(1200);
    const rows = await ledger(itemId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.transactionType).toBe("adjustment");
    expect(rows[0]?.referenceType).toBe("opening_stock");
    expect(rows[0]?.unitCostPaise).toBe(1200);
  });
});

// ---------- BR-GRN-41 ----------

type ReconRow = {
  kind: "item_stock" | "item_location_balance";
  itemId: number;
  locationId: number | null;
  storedQty: number;
  ledgerQty: number;
};

async function reconRowsFor(ids: number[]) {
  const found: ReconRow[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await app.request(
      `/api/asset/inventory/reconciliation?page=${page}&pageSize=100&sortBy=itemId`,
      { headers: { Authorization: `Bearer ${await token("owner")}` } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: ReconRow[];
      meta: { totalPages: number };
    };
    found.push(...body.data.filter((r) => ids.includes(r.itemId)));
    if (page >= body.meta.totalPages) break;
  }
  return found;
}

describe("BR-GRN-41 reconciliation", () => {
  test("BR-GRN-41 after a mix of accepts, bypasses, corrections and adjustments there are zero rows for those items", async () => {
    const itemId = await makeItem("recon");
    const loc = await makeLocation("scrap_yard");
    const a = await setupLine({ itemId, qty: 100, arrived: 100, rate: 1000 });
    const b = await setupLine({ itemId, qty: 50, arrived: 50, rate: 1500 });
    await accept(a.grnId, a.lineId, 90, 10);
    await bypass(b.grnId, b.lineId);
    await correct(a.grnId, a.lineId, 15);
    await openingStock("owner", itemId, loc, 12.5, 900);
    // main store: 90 + 50 - 15 = 125; count 121 -> posts -4
    await stockTake("owner", itemId, mainStoreId, 121);
    expect(await reconRowsFor([itemId])).toEqual([]);
  });

  test("BR-GRN-41 flags an item whose stored stock differs from the ledger total", async () => {
    const s = await setupLine({ qty: 10, arrived: 10, rate: 100 });
    await accept(s.grnId, s.lineId, 10);
    await db
      .update(itemMaster)
      .set({ currentStock: 99 })
      .where(eq(itemMaster.id, s.itemId));
    const rows = await reconRowsFor([s.itemId]);
    const r = rows.find((x) => x.kind === "item_stock");
    expect(r?.storedQty).toBe(99);
    expect(r?.ledgerQty).toBe(10);
    expect(r?.locationId).toBeNull();
  });

  test("BR-GRN-41 flags an item+location whose last balance differs from the ledger total", async () => {
    const s = await setupLine({ qty: 10, arrived: 10, rate: 100 });
    await accept(s.grnId, s.lineId, 10);
    const rows = await ledger(s.itemId);
    const last = rows[rows.length - 1];
    await db
      .update(inventoryLedger)
      .set({ balanceAfter: 77 })
      .where(eq(inventoryLedger.id, last?.id as number));
    const found = await reconRowsFor([s.itemId]);
    const r = found.find((x) => x.kind === "item_location_balance");
    expect(r?.locationId).toBe(mainStoreId);
    expect(r?.storedQty).toBe(77);
    expect(r?.ledgerQty).toBe(10);
  });
});

// ---------- BR-GRN-42 ----------

describe("BR-GRN-42 postings for one item are serialised", () => {
  test("BR-GRN-42 new item, two simultaneous accepts of 10 (first posting at the location) -> balances 10 and 20, stock 20", async () => {
    const itemId = await makeItem("conc2");
    const a = await setupLine({ itemId, qty: 10, arrived: 10, rate: 100 });
    const b = await setupLine({ itemId, qty: 10, arrived: 10, rate: 100 });
    await Promise.all([
      accept(a.grnId, a.lineId, 10),
      accept(b.grnId, b.lineId, 10),
    ]);
    const rows = await ledger(itemId);
    expect(rows.map((r) => r.balanceAfter).sort((x, y) => x - y)).toEqual([
      10, 20,
    ]);
    expect((await item(itemId)).currentStock).toBe(20);
  });

  test("BR-GRN-42 five simultaneous accepts give distinct running balances 10..50", async () => {
    const itemId = await makeItem("conc5");
    const lines = [];
    for (let n = 0; n < 5; n++) {
      lines.push(await setupLine({ itemId, qty: 10, arrived: 10, rate: 100 }));
    }
    await Promise.all(lines.map((l) => accept(l.grnId, l.lineId, 10)));
    const rows = await ledger(itemId);
    expect(rows.map((r) => r.balanceAfter).sort((x, y) => x - y)).toEqual([
      10, 20, 30, 40, 50,
    ]);
    expect((await item(itemId)).currentStock).toBe(50);
  });

  test("BR-GRN-42 concurrent accept and opening stock (other location) on the same item both land, stock = ledger total", async () => {
    const itemId = await makeItem("concmix");
    const loc = await makeLocation("scrap_yard");
    const s = await setupLine({ itemId, qty: 100, arrived: 100, rate: 1000 });
    const [a, m] = await Promise.all([
      accept(s.grnId, s.lineId, 100).then(
        () => "ok",
        () => "fail",
      ),
      openingStock("owner", itemId, loc, 30, 1000),
    ]);
    expect(a).toBe("ok");
    expect([200, 201]).toContain(m.status);
    const rows = await ledger(itemId);
    const total = rows.reduce((x, r) => x + r.quantityChange, 0);
    expect(total).toBe(130);
    expect((await item(itemId)).currentStock).toBe(130);
    expect(rows.map((r) => r.balanceAfter).sort((x, y) => x - y)).toEqual([
      30, 100,
    ]);
  });

  test("BR-GRN-42 + BR-INV-23 two simultaneous opening stocks for the same new item+location -> one succeeds, the other 409, balance 10", async () => {
    const itemId = await makeItem("concopen");
    const loc = await makeLocation("scrap_yard");
    const results = await Promise.all([
      openingStock("owner", itemId, loc, 10),
      openingStock("owner", itemId, loc, 10),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect([200, 201]).toContain(statuses[0] as number);
    expect(statuses[1]).toBe(409);
    const rows = await ledger(itemId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.balanceAfter).toBe(10);
    expect((await item(itemId)).currentStock).toBe(10);
  });
});

// ---------- BR-GRN-43 ----------

describe("BR-GRN-43 manual movements: allowed types and roles", () => {
  const docTypes = [
    "grn",
    "grn_bypass",
    "grn_correction",
    "pro",
    "sco_issue",
    "sco_receipt",
    "sco_loss",
    "job_order_issue",
    "scrap_dispatch",
  ];

  for (const referenceType of docTypes) {
    test(`BR-GRN-43 back_office posting type ${referenceType} -> 400 "post from its source document", nothing posted`, async () => {
      const itemId = await makeItem("doc");
      const res = await manual("back_office", {
        itemId,
        locationId: mainStoreId,
        referenceType,
        countedQty: 5,
        unitCostPaise: 100,
        reason: "try",
      });
      expect(res.status).toBe(400);
      expect(res.json?.message?.toLowerCase()).toContain("source document");
      expect(await ledger(itemId)).toHaveLength(0);
    });
  }

  test("BR-GRN-43 no reason -> 400", async () => {
    const itemId = await makeItem("noreason");
    const res = await manual("back_office", {
      itemId,
      locationId: mainStoreId,
      referenceType: "stock_adjustment",
      countedQty: 5,
      unitCostPaise: 100,
    });
    expect(res.status).toBe(400);
    expect(await ledger(itemId)).toHaveLength(0);
  });

  test("BR-GRN-43 blank reason -> 400", async () => {
    const itemId = await makeItem("blankreason");
    const res = await manual("back_office", {
      itemId,
      locationId: mainStoreId,
      referenceType: "stock_adjustment",
      countedQty: 5,
      unitCostPaise: 100,
      reason: "   ",
    });
    expect(res.status).toBe(400);
  });

  test("BR-GRN-43 floor_supervisor (no inventory.adjust) -> 403, nothing posted", async () => {
    const itemId = await makeItem("fs");
    const res = await manual("floor_supervisor", {
      itemId,
      locationId: mainStoreId,
      referenceType: "stock_adjustment",
      countedQty: 5,
      unitCostPaise: 100,
      reason: "try",
    });
    expect(res.status).toBe(403);
    expect(await ledger(itemId)).toHaveLength(0);
  });

  test("BR-GRN-43 qa_inspector -> 403", async () => {
    const itemId = await makeItem("qa");
    const res = await manual("qa_inspector", {
      itemId,
      locationId: mainStoreId,
      referenceType: "stock_adjustment",
      countedQty: 5,
      unitCostPaise: 100,
      reason: "try",
    });
    expect(res.status).toBe(403);
  });

  test("BR-GRN-43 owner posts stock_adjustment -> success, one row of type adjustment", async () => {
    const itemId = await makeItem("own");
    const res = await manual("owner", {
      itemId,
      locationId: mainStoreId,
      referenceType: "stock_adjustment",
      countedQty: 5,
      unitCostPaise: 100,
      reason: "stock-take found extra",
    });
    expect([200, 201]).toContain(res.status);
    const rows = await ledger(itemId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.transactionType).toBe("adjustment");
    expect(rows[0]?.referenceType).toBe("stock_adjustment");
    expect(rows[0]?.quantityChange).toBe(5);
  });

  test("BR-GRN-43 back_office and super-admin may post", async () => {
    for (const role of ["back_office", "super-admin"] as Role[]) {
      const itemId = await makeItem(`bo_${role}`);
      const res = await openingStock(role, itemId, mainStoreId, 1);
      expect([200, 201]).toContain(res.status);
      expect(await ledger(itemId)).toHaveLength(1);
    }
  });

  test("BR-GRN-43 unauthenticated -> 401", async () => {
    const res = await app.request("/api/asset/inventory/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});

// ---------- BR-GRN-44 ----------

describe("BR-GRN-44 manual cost rules", () => {
  test("BR-GRN-44 manual stock-in with cost 0 -> 400", async () => {
    const itemId = await makeItem("cost0");
    const res = await openingStock("owner", itemId, mainStoreId, 5, 0);
    expect(res.status).toBe(400);
    expect(await ledger(itemId)).toHaveLength(0);
  });

  test("BR-GRN-44 manual stock-in with no cost -> 400", async () => {
    const itemId = await makeItem("costnone");
    const res = await manual("owner", {
      itemId,
      locationId: mainStoreId,
      referenceType: "stock_adjustment",
      countedQty: 5,
      reason: "found",
    });
    expect(res.status).toBe(400);
    expect(await ledger(itemId)).toHaveLength(0);
  });

  test("BR-GRN-44 manual stock-out sent with cost 1 is valued at the current average", async () => {
    const s = await setupLine({ qty: 10, arrived: 10, rate: 2500 });
    await accept(s.grnId, s.lineId, 10);
    // balance 10, counted 8 -> -2, cost sent 1
    const res = await stockTake("owner", s.itemId, mainStoreId, 8, {
      unitCostPaise: 1,
    });
    expect([200, 201]).toContain(res.status);
    const rows = await ledger(s.itemId);
    const last = rows[rows.length - 1];
    expect(last?.quantityChange).toBe(-2);
    expect(last?.unitCostPaise).toBe(2500);
    expect(last?.totalValueChangePaise).toBe(-5000);
  });

  test("BR-GRN-44 manual stock-out with no cost sent is also valued at the current average", async () => {
    const s = await setupLine({ qty: 10, arrived: 10, rate: 2500 });
    await accept(s.grnId, s.lineId, 10);
    const res = await stockTake("owner", s.itemId, mainStoreId, 9);
    expect([200, 201]).toContain(res.status);
    const rows = await ledger(s.itemId);
    expect(rows[rows.length - 1]?.unitCostPaise).toBe(2500);
  });

  test("BR-GRN-44 manual stock-in at a cost feeds the moving average (BR-GRN-38)", async () => {
    const s = await setupLine({ qty: 100, arrived: 100, rate: 1000 });
    await accept(s.grnId, s.lineId, 100);
    await stockTake("owner", s.itemId, mainStoreId, 200, {
      unitCostPaise: 2000,
    });
    expect((await item(s.itemId)).averageCostPaise).toBe(1500);
  });
});

// ---------- BR-INV-22 stock-take ----------

describe("BR-INV-22 stock-take posts counted minus current balance at the location", () => {
  test("BR-INV-22 balance 480, counted 470 -> one adjustment row of -10 at the average cost", async () => {
    const s = await setupLine({ qty: 480, arrived: 480, rate: 2500 });
    await accept(s.grnId, s.lineId, 480);
    const res = await stockTake("owner", s.itemId, mainStoreId, 470);
    expect([200, 201]).toContain(res.status);
    const rows = await ledger(s.itemId);
    expect(rows).toHaveLength(2);
    const last = rows[1];
    expect(last?.transactionType).toBe("adjustment");
    expect(last?.referenceType).toBe("stock_adjustment");
    expect(last?.quantityChange).toBe(-10);
    expect(last?.unitCostPaise).toBe(2500);
    expect(last?.locationId).toBe(mainStoreId);
    expect(last?.balanceAfter).toBe(470);
    expect((await item(s.itemId)).currentStock).toBe(470);
  });

  test("BR-INV-22 counted equals balance -> 400 no difference, nothing posted", async () => {
    const s = await setupLine({ qty: 480, arrived: 480, rate: 2500 });
    await accept(s.grnId, s.lineId, 480);
    const res = await stockTake("owner", s.itemId, mainStoreId, 480);
    expect(res.status).toBe(400);
    expect(res.json?.message?.toLowerCase()).toContain("no difference");
    expect(await ledger(s.itemId)).toHaveLength(1);
  });

  test("BR-INV-22 counted above balance -> posts the positive difference at the sent cost", async () => {
    const s = await setupLine({ qty: 100, arrived: 100, rate: 1000 });
    await accept(s.grnId, s.lineId, 100);
    const res = await stockTake("owner", s.itemId, mainStoreId, 125.5, {
      unitCostPaise: 1000,
    });
    expect([200, 201]).toContain(res.status);
    const last = (await ledger(s.itemId)).at(-1);
    expect(last?.quantityChange).toBe(25.5);
    expect(last?.unitCostPaise).toBe(1000);
    expect(last?.balanceAfter).toBe(125.5);
  });

  test("BR-INV-22 the difference uses the balance at that location, not the item total", async () => {
    const itemId = await makeItem("perloc");
    const loc = await makeLocation("scrap_yard");
    const s = await setupLine({ itemId, qty: 100, arrived: 100, rate: 1000 });
    await accept(s.grnId, s.lineId, 100);
    await openingStock("owner", itemId, loc, 25);
    const res = await stockTake("owner", itemId, loc, 20);
    expect([200, 201]).toContain(res.status);
    const last = (await ledger(itemId)).at(-1);
    expect(last?.locationId).toBe(loc);
    expect(last?.quantityChange).toBe(-5);
    expect(last?.balanceAfter).toBe(20);
    expect((await item(itemId)).currentStock).toBe(120);
  });

  test("BR-INV-22 counted 0 with balance > 0 posts the full stock-out", async () => {
    const s = await setupLine({ qty: 10, arrived: 10, rate: 1000 });
    await accept(s.grnId, s.lineId, 10);
    const res = await stockTake("owner", s.itemId, mainStoreId, 0);
    expect([200, 201]).toContain(res.status);
    expect((await ledger(s.itemId)).at(-1)?.quantityChange).toBe(-10);
    expect((await item(s.itemId)).currentStock).toBe(0);
  });

  test("BR-INV-22 stock-take on an item+location with no ledger rows, counted 0 -> 400 no difference", async () => {
    const itemId = await makeItem("emptytake");
    const res = await stockTake("owner", itemId, mainStoreId, 0);
    expect(res.status).toBe(400);
    expect(await ledger(itemId)).toHaveLength(0);
  });

  test("BR-INV-22 sending quantityChange (old shape) is not accepted -> 400", async () => {
    const itemId = await makeItem("oldshape");
    const res = await manual("owner", {
      itemId,
      locationId: mainStoreId,
      referenceType: "stock_adjustment",
      quantityChange: 5,
      unitCostPaise: 100,
      reason: "old",
    });
    expect(res.status).toBe(400);
    expect(await ledger(itemId)).toHaveLength(0);
  });
});

// ---------- BR-INV-23 opening stock ----------

describe("BR-INV-23 opening stock only for an item+location with no ledger rows", () => {
  test("BR-INV-23 item with a GRN posted at main store, opening stock there -> 409, nothing posted", async () => {
    const s = await setupLine({ qty: 100, arrived: 100, rate: 1000 });
    await accept(s.grnId, s.lineId, 100);
    const res = await openingStock("owner", s.itemId, mainStoreId, 5);
    expect(res.status).toBe(409);
    expect(await ledger(s.itemId)).toHaveLength(1);
    expect((await item(s.itemId)).currentStock).toBe(100);
  });

  test("BR-INV-23 second opening stock at the same item+location -> 409", async () => {
    const itemId = await makeItem("open2");
    const loc = await makeLocation("scrap_yard");
    const first = await openingStock("owner", itemId, loc, 10);
    expect([200, 201]).toContain(first.status);
    const second = await openingStock("owner", itemId, loc, 10);
    expect(second.status).toBe(409);
    expect(await ledger(itemId)).toHaveLength(1);
  });

  test("BR-INV-23 opening stock at another location of an item that already has stock elsewhere is allowed", async () => {
    const itemId = await makeItem("openother");
    const loc = await makeLocation("scrap_yard");
    const s = await setupLine({ itemId, qty: 100, arrived: 100, rate: 1000 });
    await accept(s.grnId, s.lineId, 100);
    const res = await openingStock("owner", itemId, loc, 7, 900);
    expect([200, 201]).toContain(res.status);
    const last = (await ledger(itemId)).at(-1);
    expect(last?.referenceType).toBe("opening_stock");
    expect(last?.locationId).toBe(loc);
    expect(last?.quantityChange).toBe(7);
    expect((await item(itemId)).currentStock).toBe(107);
  });

  test("BR-INV-23 opening stock qty 0 -> 400", async () => {
    const itemId = await makeItem("open0");
    const res = await openingStock("owner", itemId, mainStoreId, 0);
    expect(res.status).toBe(400);
    expect(await ledger(itemId)).toHaveLength(0);
  });

  test("BR-INV-23 opening stock without unitCostPaise -> 400", async () => {
    const itemId = await makeItem("opennocost");
    const res = await manual("owner", {
      itemId,
      locationId: mainStoreId,
      referenceType: "opening_stock",
      qty: 5,
      reason: "opening",
    });
    expect(res.status).toBe(400);
    expect(await ledger(itemId)).toHaveLength(0);
  });
});
