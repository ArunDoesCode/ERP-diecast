/**
 * Inventory stock tests (docs/specs/inventory.md v1): stock view, movement
 * list, manual movements (stock-take / opening stock), last rate.
 * BR-INV-07, 08, 19..24 (+ BR-INV-06 view, role table). Real DB, full HTTP
 * stack via createApp(). Fixtures are TEST_inv_s_ prefixed, removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, ilike, inArray } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import { roles } from "../db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../db/schemas/02_procurement-catalog";
import {
  purchaseOrderItems,
  purchaseOrders,
} from "../db/schemas/02_procurement-purchasing";
import {
  supplierItems,
  supplierMaster,
} from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { signAccessToken } from "../lib/token";

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
const RUN = `TEST_inv_s_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

let actorId = 0;
// The caller's role is read from the employee row (BR-AUTH-12), never from the
// token: each role gets its own real employee on first use. The owner's is actorId.
const roleUsers = new Map<string, number>();
async function userFor(role: string): Promise<number> {
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
      .values({ name: `${RUN}_u_${role}`, roleId: r.id, isActive: true })
      .returning({ id: employees.id });
    id = e!.id;
    roleUsers.set(role, id);
  }
  return id;
}

const supplierIds: number[] = [];

const tokens = new Map<Role, string>();
async function tokenFor(role: Role) {
  let t = tokens.get(role);
  if (!t) {
    t = await signAccessToken({
      userId: role === "owner" ? actorId : await userFor(role),
      userName: `${RUN}_${role}`,
      role,
      allowedPages: [],
    });
    tokens.set(role, t);
  }
  return t;
}

async function call(
  method: string,
  path: string,
  role: Role,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await app.request(`/api/asset${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await tokenFor(role)}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const msgOf = (j: any) => String(j?.message ?? j?.error?.message ?? "");

async function mkItem(over: Record<string, unknown> = {}) {
  const r = await call("POST", "/items", "back_office", {
    sku: uid(),
    name: `${RUN} item`,
    category: "Raw Material",
    uom: "kg",
    standardRatePaise: 24000,
    ...over,
  });
  if (r.status !== 201) {
    throw new Error(
      `fixture item failed: ${r.status} ${JSON.stringify(r.json)}`,
    );
  }
  return r.json.data as Record<string, any>;
}
async function mkLocation(over: Record<string, unknown> = {}) {
  const r = await call("POST", "/locations", "back_office", {
    name: uid(),
    type: "finished_goods",
    ...over,
  });
  if (r.status !== 201) {
    throw new Error(
      `fixture loc failed: ${r.status} ${JSON.stringify(r.json)}`,
    );
  }
  return r.json.data as Record<string, any>;
}
const opening = (
  itemId: number,
  locationId: number,
  qty: number,
  unitCostPaise = 20000,
  role: Role = "owner",
) =>
  call("POST", "/inventory/movements", role, {
    itemId,
    locationId,
    referenceType: "opening_stock",
    qty,
    unitCostPaise,
    reason: "test opening",
  });
const stockTake = (
  itemId: number,
  locationId: number,
  countedQty: number,
  extra: Record<string, unknown> = {},
  role: Role = "owner",
) =>
  call("POST", "/inventory/movements", role, {
    itemId,
    locationId,
    referenceType: "stock_adjustment",
    countedQty,
    reason: "test count",
    ...extra,
  });
async function mustOpen(
  itemId: number,
  locationId: number,
  qty: number,
  cost = 20000,
) {
  const r = await opening(itemId, locationId, qty, cost);
  if (r.status !== 201) {
    throw new Error(
      `fixture opening failed: ${r.status} ${JSON.stringify(r.json)}`,
    );
  }
  return r.json.data;
}
const itemRow = async (id: number) =>
  (await db.select().from(itemMaster).where(eq(itemMaster.id, id)))[0]!;
const ledgerFor = (itemId: number) =>
  db
    .select()
    .from(inventoryLedger)
    .where(eq(inventoryLedger.itemId, itemId))
    .orderBy(inventoryLedger.id);
async function stockRow(sku: string, itemId: number, query = "") {
  const r = await call(
    "GET",
    `/inventory/stock?q=${encodeURIComponent(sku)}&pageSize=100${query}`,
    "owner",
  );
  expect(r.status).toBe(200);
  return (r.json.data as any[]).find((x) => x.itemId === itemId);
}

beforeAll(async () => {
  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "owner"))
    .limit(1);
  const [a] = await db
    .insert(employees)
    .values({ name: `${RUN}_actor`, roleId: ownerRole!.id, isActive: true })
    .returning({ id: employees.id });
  actorId = a!.id;
});

afterAll(async () => {
  const items = await db
    .select({ id: itemMaster.id })
    .from(itemMaster)
    .where(ilike(itemMaster.sku, `${RUN}%`));
  const itemIds = items.map((i) => i.id);
  if (itemIds.length) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.itemId, itemIds));
    await db
      .delete(supplierItems)
      .where(inArray(supplierItems.itemId, itemIds));
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, itemIds));
  }
  await db
    .delete(purchaseOrders)
    .where(ilike(purchaseOrders.poNumber, `${RUN}%`));
  if (itemIds.length) {
    await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
  }
  await db.delete(locations).where(ilike(locations.name, `${RUN}%`));
  if (supplierIds.length) {
    await db
      .delete(supplierMaster)
      .where(inArray(supplierMaster.id, supplierIds));
  }
  await db
    .delete(employees)
    .where(inArray(employees.id, [actorId, ...roleUsers.values()]));
});

// ---------------------------------------------------------------- BR-INV-21..23
describe("manual movements: type gate (BR-INV-21)", () => {
  test("BR-INV-21 every document reference type is 400 'post from its source document' and posts nothing", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    for (const referenceType of [
      "grn",
      "grn_bypass",
      "grn_correction",
      "pro",
      "sco_issue",
      "sco_receipt",
      "sco_loss",
      "job_order_issue",
      "scrap_dispatch",
    ]) {
      const r = await call("POST", "/inventory/movements", "owner", {
        itemId: item.id,
        locationId: loc.id,
        referenceType,
        countedQty: 5,
        qty: 5,
        unitCostPaise: 100,
        reason: "x",
      });
      expect(r.status).toBe(400);
    }
    expect((await ledgerFor(item.id)).length).toBe(0);
  });

  test("BR-INV-21 no reference type does not default to a document type", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    const r = await call("POST", "/inventory/movements", "owner", {
      itemId: item.id,
      locationId: loc.id,
      countedQty: 5,
      unitCostPaise: 100,
      reason: "x",
    });
    expect(r.status).toBe(400);
    expect((await ledgerFor(item.id)).length).toBe(0);
  });

  test("BR-INV-21 reason is required for stock-take and opening stock", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    const a = await call("POST", "/inventory/movements", "owner", {
      itemId: item.id,
      locationId: loc.id,
      referenceType: "opening_stock",
      qty: 5,
      unitCostPaise: 100,
    });
    expect(a.status).toBe(400);
    const b = await call("POST", "/inventory/movements", "owner", {
      itemId: item.id,
      locationId: loc.id,
      referenceType: "stock_adjustment",
      countedQty: 5,
      unitCostPaise: 100,
      reason: "",
    });
    expect(b.status).toBe(400);
    expect((await ledgerFor(item.id)).length).toBe(0);
  });

  test("BR-INV-21 unknown item or location is 404", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    const noItem = await opening(2_000_000_000, loc.id, 5);
    expect(noItem.status).toBe(404);
    const noLoc = await opening(item.id, 2_000_000_000, 5);
    expect(noLoc.status).toBe(404);
  });
});

describe("opening stock (BR-INV-23)", () => {
  test("BR-INV-23 first opening stock for an item+location posts a ledger row and raises stock", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    const r = await opening(item.id, loc.id, 100, 21000);
    expect(r.status).toBe(201);
    const rows = await ledgerFor(item.id);
    expect(rows.length).toBe(1);
    expect(rows[0]!.quantityChange).toBe(100);
    expect(rows[0]!.balanceAfter).toBe(100);
    expect(rows[0]!.unitCostPaise).toBe(21000);
    expect(rows[0]!.totalValueChangePaise).toBe(2100000);
    expect(rows[0]!.locationId).toBe(loc.id);
    expect(rows[0]!.referenceType).toBe("opening_stock");
    const it = await itemRow(item.id);
    expect(it.currentStock).toBe(100);
    expect(it.averageCostPaise).toBe(21000);
  });

  test("BR-INV-23 second opening stock for the same item+location is 409 'use stock-take'", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 10);
    const r = await opening(item.id, loc.id, 5);
    expect(r.status).toBe(409);
    expect(msgOf(r.json).toLowerCase()).toContain("stock-take");
    expect((await ledgerFor(item.id)).length).toBe(1);
  });

  test("BR-INV-23 item+location that already has a stock-take row can't take opening stock", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 10);
    await stockTake(item.id, loc.id, 8);
    const loc2 = await mkLocation();
    // a different location without rows is still fine
    const ok = await opening(item.id, loc2.id, 3);
    expect(ok.status).toBe(201);
    const bad = await opening(item.id, loc.id, 3);
    expect(bad.status).toBe(409);
  });

  test("BR-INV-23 opening stock needs qty > 0, cost >= 1", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    for (const body of [
      { qty: 0, unitCostPaise: 100 },
      { qty: -1, unitCostPaise: 100 },
      { qty: 5, unitCostPaise: 0 },
      { qty: 5 },
    ]) {
      const r = await call("POST", "/inventory/movements", "owner", {
        itemId: item.id,
        locationId: loc.id,
        referenceType: "opening_stock",
        reason: "x",
        ...body,
      });
      expect(r.status).toBe(400);
    }
    expect((await ledgerFor(item.id)).length).toBe(0);
  });
});

describe("stock-take (BR-INV-22)", () => {
  test("BR-INV-22 balance 480, counted 470 posts -10 valued at average", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 480, 20000);
    const r = await stockTake(item.id, loc.id, 470);
    expect(r.status).toBe(201);
    const rows = await ledgerFor(item.id);
    expect(rows.length).toBe(2);
    const last = rows[1]!;
    expect(last.quantityChange).toBe(-10);
    expect(last.balanceAfter).toBe(470);
    expect(last.unitCostPaise).toBe(20000);
    expect(last.totalValueChangePaise).toBe(-200000);
    expect((await itemRow(item.id)).currentStock).toBe(470);
  });

  test("BR-INV-22 counted equal to balance is 400 'no difference' and posts nothing", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 480);
    const r = await stockTake(item.id, loc.id, 480);
    expect(r.status).toBe(400);
    expect(msgOf(r.json).toLowerCase()).toContain("no difference");
    expect((await ledgerFor(item.id)).length).toBe(1);
  });

  test("BR-INV-22 counted above balance posts the difference at the given cost", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 100, 20000);
    const r = await stockTake(item.id, loc.id, 130, { unitCostPaise: 25000 });
    expect(r.status).toBe(201);
    const last = (await ledgerFor(item.id))[1]!;
    expect(last.quantityChange).toBe(30);
    expect(last.balanceAfter).toBe(130);
    expect(last.unitCostPaise).toBe(25000);
    expect(last.totalValueChangePaise).toBe(750000);
  });

  test("BR-INV-22 counted above balance without a cost is 400", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 100);
    const r = await stockTake(item.id, loc.id, 130);
    expect(r.status).toBe(400);
    expect((await ledgerFor(item.id)).length).toBe(1);
  });

  test("BR-INV-22 the difference is against that location's balance, not the item total", async () => {
    const item = await mkItem();
    const a = await mkLocation();
    const b = await mkLocation();
    await mustOpen(item.id, a.id, 100);
    await mustOpen(item.id, b.id, 50);
    const r = await stockTake(item.id, a.id, 90);
    expect(r.status).toBe(201);
    const last = (await ledgerFor(item.id))[2]!;
    expect(last.locationId).toBe(a.id);
    expect(last.quantityChange).toBe(-10);
    expect((await itemRow(item.id)).currentStock).toBe(140);
  });

  test("BR-INV-22 counted qty can't be negative", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 10);
    const r = await stockTake(item.id, loc.id, -1);
    expect(r.status).toBe(400);
  });

  test("BR-INV-22 counting zero empties the location", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 12);
    const r = await stockTake(item.id, loc.id, 0);
    expect(r.status).toBe(201);
    expect((await itemRow(item.id)).currentStock).toBe(0);
  });
});

describe("quantity rules (BR-INV-08)", () => {
  test("BR-INV-08 kg accepts 3 decimals, rejects 4", async () => {
    const item = await mkItem({ uom: "kg" });
    const loc = await mkLocation();
    const bad = await opening(item.id, loc.id, 2.3456);
    expect(bad.status).toBe(400);
    const ok = await opening(item.id, loc.id, 2.345);
    expect(ok.status).toBe(201);
    expect((await itemRow(item.id)).currentStock).toBe(2.345);
  });

  test("BR-INV-08 pcs and set take whole numbers only (opening stock)", async () => {
    for (const uom of ["pcs", "set"]) {
      const item = await mkItem({ uom });
      const loc = await mkLocation();
      const bad = await opening(item.id, loc.id, 2.5);
      expect(bad.status).toBe(400);
      expect((await ledgerFor(item.id)).length).toBe(0);
      const ok = await opening(item.id, loc.id, 3);
      expect(ok.status).toBe(201);
    }
  });

  test("BR-INV-08 pcs stock-take with 2.5 is 400", async () => {
    const item = await mkItem({ uom: "pcs" });
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 10);
    const r = await stockTake(item.id, loc.id, 2.5);
    expect(r.status).toBe(400);
    expect((await ledgerFor(item.id)).length).toBe(1);
  });

  test("BR-INV-08 kg stock-take with 4 decimals is 400", async () => {
    const item = await mkItem({ uom: "kg" });
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 10);
    const r = await stockTake(item.id, loc.id, 5.1234);
    expect(r.status).toBe(400);
  });
});

describe("inactive item (BR-INV-06)", () => {
  test("BR-INV-06 an inactive item with stock can still be adjusted to zero", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 12);
    await call("PATCH", `/items/${item.id}`, "back_office", {
      isActive: false,
    });
    const r = await stockTake(item.id, loc.id, 0);
    expect(r.status).toBe(201);
    expect((await itemRow(item.id)).currentStock).toBe(0);
  });

  test("BR-INV-06 an inactive item with stock stays in the stock view marked inactive", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 12);
    await call("PATCH", `/items/${item.id}`, "back_office", {
      isActive: false,
    });
    const row = await stockRow(item.sku, item.id);
    expect(row).toBeDefined();
    expect(row.isActive).toBe(false);
    expect(row.currentStock).toBe(12);
  });
});

// ---------------------------------------------------------------- BR-INV-19 / 07
describe("stock view (BR-INV-19)", () => {
  test("BR-INV-19 1500 kg at 21333 paise has value 31999500 and unit kg", async () => {
    const item = await mkItem({ uom: "kg" });
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 1500, 21333);
    const row = await stockRow(item.sku, item.id);
    expect(row.uom).toBe("kg");
    expect(row.currentStock).toBe(1500);
    expect(row.averageCostPaise).toBe(21333);
    expect(row.valuePaise).toBe(31999500);
  });

  test("BR-INV-19 shows the balance at each location from the ledger", async () => {
    const item = await mkItem();
    const a = await mkLocation();
    const b = await mkLocation();
    await mustOpen(item.id, a.id, 100);
    await mustOpen(item.id, b.id, 50);
    await stockTake(item.id, a.id, 90);
    const row = await stockRow(item.sku, item.id);
    expect(row.currentStock).toBe(140);
    const byLoc = new Map<number, number>(
      row.locations.map((l: any) => [l.locationId, l.balance]),
    );
    expect(byLoc.get(a.id)).toBe(90);
    expect(byLoc.get(b.id)).toBe(50);
    expect(row.valuePaise).toBe(
      Math.round(row.currentStock * row.averageCostPaise),
    );
    const named = row.locations.find((l: any) => l.locationId === a.id);
    expect(named.locationName).toBe(a.name);
    expect(named.locationType).toBe("finished_goods");
  });

  test("BR-INV-19 locationId filter keeps only items with a ledger row there", async () => {
    const item1 = await mkItem();
    const item2 = await mkItem();
    const a = await mkLocation();
    const b = await mkLocation();
    await mustOpen(item1.id, a.id, 10);
    await mustOpen(item2.id, b.id, 10);
    const r = await call(
      "GET",
      `/inventory/stock?q=${RUN}&pageSize=100&locationId=${a.id}`,
      "owner",
    );
    const ids = r.json.data.map((x: any) => x.itemId);
    expect(ids).toContain(item1.id);
    expect(ids).not.toContain(item2.id);
  });

  test("BR-INV-19 active item with no stock is listed; inactive item with zero stock is not", async () => {
    const active = await mkItem();
    const inactive = await mkItem();
    await call("PATCH", `/items/${inactive.id}`, "back_office", {
      isActive: false,
    });
    expect(await stockRow(active.sku, active.id)).toBeDefined();
    expect(await stockRow(inactive.sku, inactive.id)).toBeUndefined();
  });

  test("BR-INV-19 is paginated with meta", async () => {
    const r = await call("GET", "/inventory/stock?page=1&pageSize=2", "owner");
    expect(r.status).toBe(200);
    expect(r.json.meta.page).toBe(1);
    expect(r.json.meta.pageSize).toBe(2);
    expect(r.json.data.length).toBeLessThanOrEqual(2);
  });
});

describe("reorder flag (BR-INV-07)", () => {
  test("BR-INV-07 reorder 500, stock 480 is flagged", async () => {
    const item = await mkItem({ reorderLevel: 500 });
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 480);
    expect((await stockRow(item.sku, item.id)).belowReorder).toBe(true);
  });

  test("BR-INV-07 stock exactly at the reorder level is flagged", async () => {
    const item = await mkItem({ reorderLevel: 500 });
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 500);
    expect((await stockRow(item.sku, item.id)).belowReorder).toBe(true);
  });

  test("BR-INV-07 stock above the reorder level is not flagged", async () => {
    const item = await mkItem({ reorderLevel: 500 });
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 501);
    expect((await stockRow(item.sku, item.id)).belowReorder).toBe(false);
  });

  test("BR-INV-07 reorder level 0 is never flagged, even at zero stock", async () => {
    const item = await mkItem({ reorderLevel: 0 });
    expect((await stockRow(item.sku, item.id)).belowReorder).toBe(false);
  });

  test("BR-INV-07 an inactive item is not flagged", async () => {
    const item = await mkItem({ reorderLevel: 500 });
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 10);
    await call("PATCH", `/items/${item.id}`, "back_office", {
      isActive: false,
    });
    expect((await stockRow(item.sku, item.id)).belowReorder).toBe(false);
  });

  test("BR-INV-07 belowReorder=true filter returns only flagged items", async () => {
    const low = await mkItem({ reorderLevel: 500 });
    const fine = await mkItem({ reorderLevel: 5 });
    const loc = await mkLocation();
    await mustOpen(low.id, loc.id, 10);
    await mustOpen(fine.id, loc.id, 10);
    const r = await call(
      "GET",
      `/inventory/stock?q=${RUN}&pageSize=100&belowReorder=true`,
      "owner",
    );
    const ids = r.json.data.map((x: any) => x.itemId);
    expect(ids).toContain(low.id);
    expect(ids).not.toContain(fine.id);
    expect(r.json.data.every((x: any) => x.belowReorder === true)).toBe(true);
  });
});

// ---------------------------------------------------------------- BR-INV-20
describe("movement list (BR-INV-20)", () => {
  async function seedMovements() {
    const item = await mkItem();
    const a = await mkLocation();
    const b = await mkLocation();
    await mustOpen(item.id, a.id, 100);
    await mustOpen(item.id, b.id, 40);
    await stockTake(item.id, a.id, 90);
    return { item, a, b };
  }
  const list = (query: string, role: Role = "owner") =>
    call("GET", `/inventory/movements?pageSize=100&${query}`, role);

  test("BR-INV-20 filter by item returns that item's rows, each naming item, location and source document", async () => {
    const { item, a } = await seedMovements();
    const r = await list(`itemId=${item.id}`);
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBe(3);
    for (const row of r.json.data) {
      expect(row.itemId).toBe(item.id);
      expect(row.itemSku).toBe(item.sku);
      expect(typeof row.locationName).toBe("string");
      expect(row.sourceDocument.type).toBe(row.referenceType);
      expect(typeof row.sourceDocument.id).toBe("number");
    }
    const opening = r.json.data.find(
      (x: any) => x.referenceType === "opening_stock" && x.locationId === a.id,
    );
    expect(opening.sourceDocument.number).toBeNull();
    expect(opening.locationName).toBe(a.name);
  });

  test("BR-INV-20 filter by location", async () => {
    const { item, b } = await seedMovements();
    const r = await list(`itemId=${item.id}&locationId=${b.id}`);
    expect(r.json.data.length).toBe(1);
    expect(r.json.data[0].locationId).toBe(b.id);
  });

  test("BR-INV-20 filter by source", async () => {
    const { item } = await seedMovements();
    const r = await list(`itemId=${item.id}&referenceType=stock_adjustment`);
    expect(r.json.data.length).toBe(1);
    expect(r.json.data[0].referenceType).toBe("stock_adjustment");
    const r2 = await list(`itemId=${item.id}&referenceType=opening_stock`);
    expect(r2.json.data.length).toBe(2);
  });

  test("BR-INV-20 filter by type", async () => {
    const { item } = await seedMovements();
    const all = await list(`itemId=${item.id}`);
    const type = all.json.data[0].transactionType;
    const r = await list(`itemId=${item.id}&transactionType=${type}`);
    expect(r.json.data.length).toBeGreaterThan(0);
    expect(r.json.data.every((x: any) => x.transactionType === type)).toBe(
      true,
    );
    expect(r.json.data.length).toBe(
      all.json.data.filter((x: any) => x.transactionType === type).length,
    );
  });

  test("BR-INV-20 filter by date", async () => {
    const { item } = await seedMovements();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    expect(
      (
        await list(
          `itemId=${item.id}&fromDate=${encodeURIComponent(yesterday)}`,
        )
      ).json.data.length,
    ).toBe(3);
    expect(
      (await list(`itemId=${item.id}&fromDate=${encodeURIComponent(tomorrow)}`))
        .json.data.length,
    ).toBe(0);
    expect(
      (await list(`itemId=${item.id}&toDate=${encodeURIComponent(yesterday)}`))
        .json.data.length,
    ).toBe(0);
    expect(
      (await list(`itemId=${item.id}&toDate=${encodeURIComponent(tomorrow)}`))
        .json.data.length,
    ).toBe(3);
  });

  test("BR-INV-20 no route edits or deletes a ledger row (PATCH, PUT, DELETE on a movement)", async () => {
    const { item } = await seedMovements();
    const rows = await ledgerFor(item.id);
    const id = rows[0]!.id;
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      const r = await call(
        method,
        `/inventory/movements/${id}`,
        "super-admin",
        {
          quantityChange: 999,
        },
      );
      expect([404, 405]).toContain(r.status);
    }
    const after = await ledgerFor(item.id);
    expect(after.length).toBe(rows.length);
    expect(after[0]!.quantityChange).toBe(rows[0]!.quantityChange);
  });

  test("BR-INV-20 floor_supervisor can view the list; qa_inspector can't", async () => {
    expect((await list("", "floor_supervisor")).status).toBe(200);
    expect((await list("", "qa_inspector")).status).toBe(403);
  });
});

// ---------------------------------------------------------------- roles
describe("who can do what: stock and adjustment", () => {
  test("adjust: owner, back_office and super-admin can; floor_supervisor, qa_inspector, operator get 403 and nothing posts", async () => {
    for (const role of ["owner", "back_office", "super-admin"] as Role[]) {
      const item = await mkItem();
      const loc = await mkLocation();
      const r = await opening(item.id, loc.id, 5, 100, role);
      expect(r.status).toBe(201);
    }
    for (const role of [
      "floor_supervisor",
      "qa_inspector",
      "operator",
    ] as Role[]) {
      const item = await mkItem();
      const loc = await mkLocation();
      const r = await opening(item.id, loc.id, 5, 100, role);
      expect(r.status).toBe(403);
      expect((await ledgerFor(item.id)).length).toBe(0);
    }
  });

  test("stock view: floor_supervisor can see it; qa_inspector and operator can't", async () => {
    expect(
      (await call("GET", "/inventory/stock?pageSize=1", "floor_supervisor"))
        .status,
    ).toBe(200);
    expect(
      (await call("GET", "/inventory/stock?pageSize=1", "qa_inspector")).status,
    ).toBe(403);
    expect(
      (await call("GET", "/inventory/stock?pageSize=1", "operator")).status,
    ).toBe(403);
  });

  test("no token on the stock view is 401", async () => {
    const res = await app.request("/api/asset/inventory/stock");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------- BR-INV-24
describe("last rate (BR-INV-24)", () => {
  async function mkSupplier() {
    const [s] = await db
      .insert(supplierMaster)
      .values({ name: `${RUN}_sup_${++seq}` })
      .returning({ id: supplierMaster.id });
    supplierIds.push(s!.id);
    return s!.id;
  }
  async function mkPo(
    supplier: number,
    itemId: number,
    pricePaise: number,
    status: string,
    createdAt: Date = new Date(),
  ) {
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        poNumber: uid(),
        supplierId: supplier,
        status: status as any,
        createdBy: actorId,
        createdAt,
      })
      .returning({ id: purchaseOrders.id });
    await db.insert(purchaseOrderItems).values({
      poId: po!.id,
      itemId,
      qty: 10,
      unitPricePaise: pricePaise,
      uom: "kg",
    });
  }
  async function addCatalog(supplier: number, itemId: number, price: number) {
    await db.insert(supplierItems).values({
      supplierId: supplier,
      itemId,
      supplierUnitPricePaise: price,
      uom: "kg",
    });
  }
  const lastRate = (itemId: number, supplier: number) =>
    call(
      "GET",
      `/items/${itemId}/last-rate?supplierId=${supplier}`,
      "back_office",
    );
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  test("BR-INV-24 only a cancelled PO @250 and catalog @240 gives 240 from the catalog", async () => {
    const item = await mkItem();
    const sup = await mkSupplier();
    await mkPo(sup, item.id, 250, "cancelled");
    await addCatalog(sup, item.id, 240);
    const r = await lastRate(item.id, sup);
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ ratePaise: 240, source: "supplier_catalog" });
  });

  test("BR-INV-24 draft and pending_approval POs are ignored", async () => {
    const item = await mkItem();
    const sup = await mkSupplier();
    await mkPo(sup, item.id, 250, "draft");
    await mkPo(sup, item.id, 260, "pending_approval");
    await addCatalog(sup, item.id, 240);
    const r = await lastRate(item.id, sup);
    expect(r.json.data).toEqual({ ratePaise: 240, source: "supplier_catalog" });
  });

  test("BR-INV-24 an approved PO price wins over the catalog", async () => {
    const item = await mkItem();
    const sup = await mkSupplier();
    await mkPo(sup, item.id, 260, "approved");
    await addCatalog(sup, item.id, 240);
    const r = await lastRate(item.id, sup);
    expect(r.json.data).toEqual({ ratePaise: 260, source: "po_history" });
  });

  test("BR-INV-24 later PO statuses (dispatched, partial_received, fully_received, invoiced, closed) count", async () => {
    for (const status of [
      "dispatched",
      "partial_received",
      "fully_received",
      "invoiced",
      "closed",
    ]) {
      const item = await mkItem();
      const sup = await mkSupplier();
      await mkPo(sup, item.id, 333, status);
      const r = await lastRate(item.id, sup);
      expect(r.json.data).toEqual({ ratePaise: 333, source: "po_history" });
    }
  });

  test("BR-INV-24 the newest qualifying PO line wins; a newer draft or cancelled PO is skipped", async () => {
    const item = await mkItem();
    const sup = await mkSupplier();
    await mkPo(sup, item.id, 260, "approved", hoursAgo(5));
    await mkPo(sup, item.id, 270, "dispatched", hoursAgo(3));
    await mkPo(sup, item.id, 300, "draft", hoursAgo(1));
    await mkPo(sup, item.id, 310, "cancelled", hoursAgo(0.5));
    const r = await lastRate(item.id, sup);
    expect(r.json.data).toEqual({ ratePaise: 270, source: "po_history" });
  });

  test("BR-INV-24 another supplier's PO is ignored", async () => {
    const item = await mkItem();
    const sup = await mkSupplier();
    const other = await mkSupplier();
    await mkPo(other, item.id, 999, "approved");
    await addCatalog(sup, item.id, 240);
    const r = await lastRate(item.id, sup);
    expect(r.json.data).toEqual({ ratePaise: 240, source: "supplier_catalog" });
  });

  test("BR-INV-24 another item's PO from the same supplier is ignored", async () => {
    const item = await mkItem();
    const otherItem = await mkItem();
    const sup = await mkSupplier();
    await mkPo(sup, otherItem.id, 999, "approved");
    await addCatalog(sup, item.id, 240);
    const r = await lastRate(item.id, sup);
    expect(r.json.data).toEqual({ ratePaise: 240, source: "supplier_catalog" });
  });

  test("BR-INV-24 no PO, no catalog, average > 0 gives the item average", async () => {
    const item = await mkItem({ standardRatePaise: 24000 });
    const loc = await mkLocation();
    await mustOpen(item.id, loc.id, 10, 21000);
    const sup = await mkSupplier();
    const r = await lastRate(item.id, sup);
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ ratePaise: 21000, source: "pr_estimate" });
  });

  test("BR-INV-24 no PO, no catalog, average 0, standard 24000 gives 24000 from the standard rate", async () => {
    const item = await mkItem({ standardRatePaise: 24000 });
    const sup = await mkSupplier();
    const r = await lastRate(item.id, sup);
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ ratePaise: 24000, source: "standard_rate" });
  });

  test("BR-INV-24 unknown item is 404", async () => {
    const sup = await mkSupplier();
    const r = await lastRate(2_000_000_000, sup);
    expect(r.status).toBe(404);
  });
});
