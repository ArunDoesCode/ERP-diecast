/**
 * Inventory masters tests (docs/specs/inventory.md v1): items, services,
 * locations, machines, roles, audit. BR-INV-01..06, 09..18, 25 (+ BR-INV-03).
 * Real DB, full HTTP stack via createApp(). Fixtures are TEST_inv_m_ prefixed
 * and removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, ilike, inArray } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import { documentNumberCounters, roles } from "../db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
  machines,
  serviceMaster,
} from "../db/schemas/02_procurement-catalog";
import {
  grnItems,
  grns,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  qaTests,
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
const RUN = `TEST_inv_m_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

let actorA = 0;
let actorB = 0;
let supplierId = 0;
let createdMainStoreId: number | undefined;
let mainStoreId = 0;

// The caller's role is read from the employee row (BR-AUTH-12), never from the
// token. actorA / actorB are back_office employees; any other role gets its own
// real employee per slot, created on first use.
const ACTOR_ROLE = "back_office";
const siblings = new Map<string, number>();
async function employeeFor(role: Role, slot: number) {
  if (role === ACTOR_ROLE) return slot;
  const key = `${role}:${slot}`;
  let id = siblings.get(key);
  if (!id) {
    const [r] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, role))
      .limit(1);
    if (!r) throw new Error(`seed role ${role} missing`);
    const [e] = await db
      .insert(employees)
      .values({ name: `${RUN}_${key}`, roleId: r.id, isActive: true })
      .returning({ id: employees.id });
    id = e!.id;
    siblings.set(key, id);
  }
  return id;
}

const tokens = new Map<string, string>();
async function tokenFor(role: Role, slot: number) {
  const key = `${role}:${slot}`;
  let t = tokens.get(key);
  if (!t) {
    const userId = await employeeFor(role, slot);
    t = await signAccessToken({
      userId,
      userName: `${RUN}_${role}`,
      role,
      allowedPages: [],
    });
    tokens.set(key, t);
  }
  return t;
}

async function callAt(
  base: string,
  method: string,
  path: string,
  role: Role,
  body?: unknown,
  userId = actorA,
): Promise<{ status: number; json: any }> {
  const res = await app.request(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await tokenFor(role, userId)}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const call = (
  method: string,
  path: string,
  role: Role,
  body?: unknown,
  userId = actorA,
) => callAt("/api/asset", method, path, role, body, userId);

const codeOf = (j: any) => j?.code ?? j?.error?.code;
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
async function openingStock(itemId: number, locationId: number, qty = 10) {
  const r = await call("POST", "/inventory/movements", "owner", {
    itemId,
    locationId,
    referenceType: "opening_stock",
    qty,
    unitCostPaise: 20000,
    reason: "test opening",
  });
  if (r.status !== 201) {
    throw new Error(
      `fixture opening failed: ${r.status} ${JSON.stringify(r.json)}`,
    );
  }
}
const itemRow = async (id: number) =>
  (await db.select().from(itemMaster).where(eq(itemMaster.id, id)))[0]!;

beforeAll(async () => {
  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, ACTOR_ROLE))
    .limit(1);
  const [a] = await db
    .insert(employees)
    .values({ name: `${RUN}_actorA`, roleId: ownerRole!.id, isActive: true })
    .returning({ id: employees.id });
  actorA = a!.id;
  const [b] = await db
    .insert(employees)
    .values({ name: `${RUN}_actorB`, roleId: ownerRole!.id, isActive: true })
    .returning({ id: employees.id });
  actorB = b!.id;
  const [s] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_supplier` })
    .returning({ id: supplierMaster.id });
  supplierId = s!.id;
  const [main] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "main_store"))
    .limit(1);
  if (main) {
    mainStoreId = main.id;
  } else {
    const [loc] = await db
      .insert(locations)
      .values({ name: `${RUN}_main_store`, type: "main_store" })
      .returning({ id: locations.id });
    createdMainStoreId = loc!.id;
    mainStoreId = loc!.id;
  }
});

afterAll(async () => {
  const items = await db
    .select({ id: itemMaster.id })
    .from(itemMaster)
    .where(ilike(itemMaster.sku, `${RUN}%`));
  const itemIds = items.map((i) => i.id);
  const pos = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(ilike(purchaseOrders.poNumber, `${RUN}%`));
  const poIds = pos.map((p) => p.id);
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
  }
  if (itemIds.length) {
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, itemIds));
  }
  if (lineIds.length) {
    await db.delete(grnItems).where(inArray(grnItems.id, lineIds));
  }
  if (grnIds.length) await db.delete(grns).where(inArray(grns.id, grnIds));
  if (poIds.length) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, poIds));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
  }
  const prs = await db
    .select({ id: purchaseRequests.id })
    .from(purchaseRequests)
    .where(inArray(purchaseRequests.requestedBy, [actorA, actorB]));
  const prIds = prs.map((p) => p.id);
  if (prIds.length) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, prIds));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, prIds));
  }
  await db
    .delete(supplierItems)
    .where(eq(supplierItems.supplierId, supplierId));
  if (itemIds.length) {
    await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
  }
  await db.delete(serviceMaster).where(ilike(serviceMaster.code, `${RUN}%`));
  await db.delete(machines).where(ilike(machines.name, `${RUN}%`));
  await db.delete(locations).where(ilike(locations.name, `${RUN}%`));
  await db.delete(supplierMaster).where(eq(supplierMaster.id, supplierId));
  for (const col of [
    documentNumberCounters.createdBy,
    documentNumberCounters.lastUpdatedBy,
  ]) {
    for (const id of [actorA, actorB, ...siblings.values()]) {
      await db
        .update(documentNumberCounters)
        .set(
          col === documentNumberCounters.createdBy
            ? { createdBy: null }
            : { lastUpdatedBy: null },
        )
        .where(eq(col, id));
    }
  }
  await db
    .delete(employees)
    .where(inArray(employees.id, [actorA, actorB, ...siblings.values()]));
  if (createdMainStoreId) {
    await db.delete(locations).where(eq(locations.id, createdMainStoreId));
  }
});

// ---------------------------------------------------------------- items
describe("items: create and validation", () => {
  test("BR-INV-01 SKU clash ignoring case and outer spaces is 409 'Item SKU already exists'", async () => {
    const base = uid().toUpperCase();
    await mkItem({ sku: base });
    const r = await call("POST", "/items", "back_office", {
      sku: ` ${base.toLowerCase()} `,
      name: "dup",
      category: "Raw Material",
      uom: "kg",
      standardRatePaise: 100,
    });
    expect(r.status).toBe(409);
    expect(msgOf(r.json)).toContain("Item SKU already exists");
  });

  test("BR-INV-01 SKU is required (missing and blank are 400)", async () => {
    for (const sku of [undefined, "", "   "]) {
      const r = await call("POST", "/items", "back_office", {
        ...(sku === undefined ? {} : { sku }),
        name: "x",
        category: "Raw Material",
        uom: "kg",
        standardRatePaise: 100,
      });
      expect(r.status).toBe(400);
    }
  });

  test("BR-INV-02 name, category and unit are each required", async () => {
    const full = {
      sku: "",
      name: "n",
      category: "Raw Material",
      uom: "kg",
      standardRatePaise: 100,
    };
    for (const missing of ["name", "category", "uom"]) {
      const body: Record<string, unknown> = { ...full, sku: uid() };
      delete body[missing];
      const r = await call("POST", "/items", "back_office", body);
      expect(r.status).toBe(400);
    }
  });

  test("BR-INV-02 unit outside the fixed list is 400", async () => {
    const r = await call("POST", "/items", "back_office", {
      sku: uid(),
      name: "n",
      category: "Raw Material",
      uom: "kgs",
      standardRatePaise: 100,
    });
    expect(r.status).toBe(400);
  });

  test("BR-INV-02 category outside the fixed list is 400", async () => {
    const r = await call("POST", "/items", "back_office", {
      sku: uid(),
      name: "n",
      category: "Furniture",
      uom: "kg",
      standardRatePaise: 100,
    });
    expect(r.status).toBe(400);
  });

  test("BR-INV-02 every listed category and unit is accepted", async () => {
    const cats = [
      "Raw Material",
      "Consumable",
      "Spare Part",
      "Tooling",
      "Packing",
    ];
    const uoms = ["kg", "pcs", "ltr", "m", "set"];
    for (let i = 0; i < 5; i++) {
      const r = await call("POST", "/items", "back_office", {
        sku: uid(),
        name: "n",
        category: cats[i],
        uom: uoms[i],
        standardRatePaise: 100,
      });
      expect(r.status).toBe(201);
    }
  });

  test("BR-INV-03 create without standard rate is 400", async () => {
    const r = await call("POST", "/items", "back_office", {
      sku: uid(),
      name: "n",
      category: "Raw Material",
      uom: "kg",
    });
    expect(r.status).toBe(400);
  });

  test("BR-INV-03 standard rate must be whole paise > 0", async () => {
    for (const v of [0, -5, 12.5]) {
      const r = await call("POST", "/items", "back_office", {
        sku: uid(),
        name: "n",
        category: "Raw Material",
        uom: "kg",
        standardRatePaise: v,
      });
      expect(r.status).toBe(400);
    }
  });

  test("BR-INV-03 currentStock or averageCostPaise on create is 400", async () => {
    for (const extra of [{ currentStock: 50 }, { averageCostPaise: 100 }]) {
      const r = await call("POST", "/items", "back_office", {
        sku: uid(),
        name: "n",
        category: "Raw Material",
        uom: "kg",
        standardRatePaise: 100,
        ...extra,
      });
      expect(r.status).toBe(400);
    }
  });

  test("BR-INV-03 new item starts with zero stock and zero average cost", async () => {
    const item = await mkItem();
    expect(item.currentStock).toBe(0);
    expect(item.averageCostPaise).toBe(0);
    expect(item.standardRatePaise).toBe(24000);
  });

  test("BR-INV-03 edit standard rate saves it and leaves average cost unchanged", async () => {
    const item = await mkItem({ standardRatePaise: 24000 });
    const loc = await mkLocation();
    await openingStock(item.id, loc.id, 10); // average becomes 20000
    const before = await itemRow(item.id);
    expect(before.averageCostPaise).toBe(20000);
    const r = await call("PATCH", `/items/${item.id}`, "back_office", {
      standardRatePaise: 25000,
    });
    expect(r.status).toBe(200);
    const after = await itemRow(item.id);
    expect(after.standardRatePaise).toBe(25000);
    expect(after.averageCostPaise).toBe(20000);
  });

  test("BR-INV-03 a posting never changes the standard rate", async () => {
    const item = await mkItem({ standardRatePaise: 24000 });
    const loc = await mkLocation();
    await openingStock(item.id, loc.id, 5);
    expect((await itemRow(item.id)).standardRatePaise).toBe(24000);
  });

  test("BR-INV-03 edit with currentStock or averageCostPaise is 400 and changes nothing", async () => {
    const item = await mkItem();
    for (const extra of [{ currentStock: 50 }, { averageCostPaise: 999 }]) {
      const r = await call("PATCH", `/items/${item.id}`, "back_office", {
        name: "changed",
        ...extra,
      });
      expect(r.status).toBe(400);
    }
    const row = await itemRow(item.id);
    expect(row.currentStock).toBe(0);
    expect(row.averageCostPaise).toBe(0);
    expect(row.name).not.toBe("changed");
  });

  test("BR-INV-03 edit with standard rate 0 is 400", async () => {
    const item = await mkItem();
    const r = await call("PATCH", `/items/${item.id}`, "back_office", {
      standardRatePaise: 0,
    });
    expect(r.status).toBe(400);
  });

  test("BR-INV-07 negative reorder level is 400; zero and decimals up to 3 ok", async () => {
    const bad = await call("POST", "/items", "back_office", {
      sku: uid(),
      name: "n",
      category: "Raw Material",
      uom: "kg",
      standardRatePaise: 100,
      reorderLevel: -1,
    });
    expect(bad.status).toBe(400);
    const ok = await call("POST", "/items", "back_office", {
      sku: uid(),
      name: "n",
      category: "Raw Material",
      uom: "kg",
      standardRatePaise: 100,
      reorderLevel: 12.345,
    });
    expect(ok.status).toBe(201);
    expect(ok.json.data.reorderLevel).toBe(12.345);
  });

  test("BR-INV-07 editing reorder level: negative is 400 and unchanged; zero is ok", async () => {
    const item = await mkItem();
    const bad = await call("PATCH", `/items/${item.id}`, "back_office", {
      reorderLevel: -5,
    });
    expect(bad.status).toBe(400);
    const ok = await call("PATCH", `/items/${item.id}`, "back_office", {
      reorderLevel: 0,
    });
    expect(ok.status).toBe(200);
    expect(ok.json.data.reorderLevel).toBe(0);
  });
});

describe("items: in use, deactivate, delete", () => {
  test("BR-INV-04 unused item: SKU and unit can change", async () => {
    const item = await mkItem();
    const r = await call("PATCH", `/items/${item.id}`, "back_office", {
      sku: uid(),
      uom: "pcs",
    });
    expect(r.status).toBe(200);
    expect(r.json.data.uom).toBe("pcs");
  });

  test("BR-INV-04 item with a ledger row: unit change is 409 ITEM_IN_USE", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await openingStock(item.id, loc.id);
    const r = await call("PATCH", `/items/${item.id}`, "back_office", {
      uom: "pcs",
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.json)).toBe("ITEM_IN_USE");
    expect((await itemRow(item.id)).uom).toBe("kg");
  });

  test("BR-INV-04 item with a ledger row: SKU change is 409 ITEM_IN_USE", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await openingStock(item.id, loc.id);
    const r = await call("PATCH", `/items/${item.id}`, "back_office", {
      sku: uid(),
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.json)).toBe("ITEM_IN_USE");
  });

  test("BR-INV-04 item on a PR line: unit change is 409 ITEM_IN_USE", async () => {
    const item = await mkItem();
    const [pr] = await db
      .insert(purchaseRequests)
      .values({ prNumber: uid(), type: "misc", requestedBy: actorA })
      .returning({ id: purchaseRequests.id });
    await db
      .insert(purchaseRequestItems)
      .values({ prId: pr!.id, itemId: item.id, requestedQty: 1, uom: "kg" });
    const r = await call("PATCH", `/items/${item.id}`, "back_office", {
      uom: "pcs",
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.json)).toBe("ITEM_IN_USE");
  });

  test("BR-INV-04 item on a PO line: SKU change is 409 ITEM_IN_USE", async () => {
    const item = await mkItem();
    const [po] = await db
      .insert(purchaseOrders)
      .values({ poNumber: uid(), supplierId, createdBy: actorA })
      .returning({ id: purchaseOrders.id });
    await db.insert(purchaseOrderItems).values({
      poId: po!.id,
      itemId: item.id,
      qty: 1,
      unitPricePaise: 100,
      uom: "kg",
    });
    const r = await call("PATCH", `/items/${item.id}`, "back_office", {
      sku: uid(),
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.json)).toBe("ITEM_IN_USE");
  });

  test("BR-INV-04 item in a supplier catalog: unit change is 409 ITEM_IN_USE", async () => {
    const item = await mkItem();
    await db.insert(supplierItems).values({
      supplierId,
      itemId: item.id,
      supplierUnitPricePaise: 100,
      uom: "kg",
    });
    const r = await call("PATCH", `/items/${item.id}`, "back_office", {
      uom: "pcs",
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.json)).toBe("ITEM_IN_USE");
  });

  test("BR-INV-04 item in use: name, description, category, reorder level still change", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await openingStock(item.id, loc.id);
    const r = await call("PATCH", `/items/${item.id}`, "back_office", {
      name: "renamed",
      description: "d",
      category: "Consumable",
      reorderLevel: 7,
    });
    expect(r.status).toBe(200);
    const row = await itemRow(item.id);
    expect(row.name).toBe("renamed");
    expect(row.description).toBe("d");
    expect(row.category).toBe("Consumable");
    expect(row.reorderLevel).toBe(7);
  });

  test("BR-INV-05 items are never deleted: no DELETE route", async () => {
    const item = await mkItem();
    const r = await call("DELETE", `/items/${item.id}`, "super-admin");
    expect([404, 405]).toContain(r.status);
    expect(await itemRow(item.id)).toBeDefined();
  });

  test("BR-INV-05 deactivate then reactivate an item", async () => {
    const item = await mkItem();
    const off = await call("PATCH", `/items/${item.id}`, "back_office", {
      isActive: false,
    });
    expect(off.status).toBe(200);
    expect((await itemRow(item.id)).isActive).toBe(false);
    const on = await call("PATCH", `/items/${item.id}`, "back_office", {
      isActive: true,
    });
    expect(on.status).toBe(200);
    expect((await itemRow(item.id)).isActive).toBe(true);
  });

  test("BR-INV-05 an inactive item can't go on a new PR", async () => {
    const item = await mkItem();
    await call("PATCH", `/items/${item.id}`, "back_office", {
      isActive: false,
    });
    const r = await callAt("/api/pr", "POST", "/createpr", "back_office", {
      type: "misc",
      notes: "test",
      items: [{ itemId: item.id, requestedQty: 1 }],
    });
    expect(r.status).toBe(400);
  });

  test("BR-INV-05 an inactive item can't be linked to a supplier", async () => {
    const item = await mkItem();
    await call("PATCH", `/items/${item.id}`, "back_office", {
      isActive: false,
    });
    const r = await callAt(
      "/api/supplier",
      "POST",
      `/${supplierId}/createItem`,
      "back_office",
      { itemId: item.id, supplierUnitPricePaise: 100, uom: "kg" },
    );
    expect(r.status).toBe(400);
  });

  test("BR-INV-05 a reactivated item can go on a new PR again", async () => {
    const item = await mkItem();
    await call("PATCH", `/items/${item.id}`, "back_office", {
      isActive: false,
    });
    await call("PATCH", `/items/${item.id}`, "back_office", { isActive: true });
    const r = await callAt("/api/pr", "POST", "/createpr", "back_office", {
      type: "misc",
      notes: "test",
      items: [{ itemId: item.id, requestedQty: 1 }],
    });
    expect(r.status).toBe(201);
  });

  test("BR-INV-06 an item with stock can be deactivated and keeps its stock", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    await openingStock(item.id, loc.id, 12);
    const r = await call("PATCH", `/items/${item.id}`, "back_office", {
      isActive: false,
    });
    expect(r.status).toBe(200);
    const row = await itemRow(item.id);
    expect(row.isActive).toBe(false);
    expect(row.currentStock).toBe(12);
  });

  test("BR-INV-05 an open PO with an inactive item can still be received", async () => {
    const item = await mkItem();
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        poNumber: uid(),
        supplierId,
        status: "dispatched",
        createdBy: actorA,
      })
      .returning({ id: purchaseOrders.id });
    const [pi] = await db
      .insert(purchaseOrderItems)
      .values({
        poId: po!.id,
        itemId: item.id,
        qty: 100,
        unitPricePaise: 21000,
        uom: "kg",
      })
      .returning({ id: purchaseOrderItems.id });
    await call("PATCH", `/items/${item.id}`, "back_office", {
      isActive: false,
    });
    const g = await callAt("/api/grn", "POST", "/creategrn", "back_office", {
      poId: po!.id,
      challanNo: uid(),
      lines: [{ poItemId: pi!.id, arrivedQty: 10 }],
    });
    expect(g.status).toBe(201);
    const lineId = g.json.data.items[0].id;
    const q = await callAt(
      "/api/grn",
      "POST",
      `/${g.json.data.grn.id}/lines/${lineId}/qa`,
      "qa_inspector",
      { acceptedQty: 10, rejectedQty: 0 },
    );
    expect(q.status).toBe(200);
    expect((await itemRow(item.id)).currentStock).toBe(10);
  });
});

// ---------------------------------------------------------------- services
describe("services", () => {
  test("BR-INV-09 create with SAC 998898 is ok", async () => {
    const r = await call("POST", "/services", "back_office", {
      code: uid(),
      name: "Anodizing",
      defaultUom: "job",
      sacCode: "998898",
    });
    expect(r.status).toBe(201);
    expect(r.json.data.sacCode).toBe("998898");
  });

  test("BR-INV-09 SAC must be 6 digits starting with 99", async () => {
    for (const sacCode of ["1234", "123456", "99889", "9988981", "99abcd"]) {
      const r = await call("POST", "/services", "back_office", {
        code: uid(),
        name: "s",
        defaultUom: "job",
        sacCode,
      });
      expect(r.status).toBe(400);
    }
  });

  test("BR-INV-09 SAC is optional", async () => {
    const r = await call("POST", "/services", "back_office", {
      code: uid(),
      name: "s",
      defaultUom: "job",
    });
    expect(r.status).toBe(201);
  });

  test("BR-INV-09 code, name and default unit are required", async () => {
    const full: Record<string, unknown> = {
      code: "",
      name: "s",
      defaultUom: "job",
    };
    for (const missing of ["code", "name", "defaultUom"]) {
      const body = { ...full, code: uid() };
      delete (body as Record<string, unknown>)[missing];
      const r = await call("POST", "/services", "back_office", body);
      expect(r.status).toBe(400);
    }
  });

  test("BR-INV-09 code clash ignoring case is 409", async () => {
    const code = uid();
    await call("POST", "/services", "back_office", {
      code,
      name: "s",
      defaultUom: "job",
    });
    const r = await call("POST", "/services", "back_office", {
      code: code.toLowerCase(),
      name: "s2",
      defaultUom: "job",
    });
    expect(r.status).toBe(409);
  });

  test("BR-INV-09 edit rejects a bad SAC code", async () => {
    const c = await call("POST", "/services", "back_office", {
      code: uid(),
      name: "s",
      defaultUom: "job",
    });
    const r = await call(
      "PATCH",
      `/services/${c.json.data.id}`,
      "back_office",
      {
        sacCode: "1234",
      },
    );
    expect(r.status).toBe(400);
  });

  test("BR-INV-10 a service id sent as itemId to a stock movement is 400 and posts nothing", async () => {
    const [maxItem] = await db
      .select({ id: itemMaster.id })
      .from(itemMaster)
      .orderBy(itemMaster.id);
    const bigId =
      900_000_000 + (maxItem?.id ?? 0) + Math.floor(Math.random() * 1000);
    await db.insert(serviceMaster).values({
      id: bigId,
      code: uid(),
      name: "svc",
      defaultUom: "job",
    });
    const loc = await mkLocation();
    const r = await call("POST", "/inventory/movements", "owner", {
      itemId: bigId,
      locationId: loc.id,
      referenceType: "opening_stock",
      qty: 5,
      unitCostPaise: 100,
      reason: "x",
    });
    expect(r.status).toBe(400);
    const rows = await db
      .select()
      .from(inventoryLedger)
      .where(eq(inventoryLedger.locationId, loc.id));
    expect(rows.length).toBe(0);
  });

  test("BR-INV-05/25 services can be deactivated and reactivated; never deleted", async () => {
    const c = await call("POST", "/services", "back_office", {
      code: uid(),
      name: "s",
      defaultUom: "job",
    });
    const id = c.json.data.id;
    const off = await call("PATCH", `/services/${id}`, "back_office", {
      isActive: false,
    });
    expect(off.status).toBe(200);
    expect(off.json.data.isActive).toBe(false);
    const on = await call("PATCH", `/services/${id}`, "back_office", {
      isActive: true,
    });
    expect(on.json.data.isActive).toBe(true);
    const del = await call("DELETE", `/services/${id}`, "super-admin");
    expect([404, 405]).toContain(del.status);
  });
});

// ---------------------------------------------------------------- locations
describe("locations", () => {
  test("BR-INV-11 name clash ignoring case is 409", async () => {
    const name = uid();
    await mkLocation({ name });
    const r = await call("POST", "/locations", "back_office", {
      name: ` ${name.toLowerCase()} `,
      type: "scrap_yard",
    });
    expect(r.status).toBe(409);
  });

  test("BR-INV-11 name required and type from the fixed list", async () => {
    const noName = await call("POST", "/locations", "back_office", {
      type: "scrap_yard",
    });
    expect(noName.status).toBe(400);
    const badType = await call("POST", "/locations", "back_office", {
      name: uid(),
      type: "warehouse",
    });
    expect(badType.status).toBe(400);
  });

  test("BR-INV-11 finished_goods and scrap_yard are accepted", async () => {
    for (const type of ["finished_goods", "scrap_yard"]) {
      const r = await call("POST", "/locations", "back_office", {
        name: uid(),
        type,
      });
      expect(r.status).toBe(201);
    }
  });

  test("BR-INV-12 vendor_premise without a supplier is 400", async () => {
    const r = await call("POST", "/locations", "back_office", {
      name: uid(),
      type: "vendor_premise",
    });
    expect(r.status).toBe(400);
  });

  test("BR-INV-12 vendor_premise with an inactive supplier is 400", async () => {
    const [s] = await db
      .insert(supplierMaster)
      .values({ name: `${RUN}_inactive_supplier`, isActive: false })
      .returning({ id: supplierMaster.id });
    const r = await call("POST", "/locations", "back_office", {
      name: uid(),
      type: "vendor_premise",
      linkedVendorId: s!.id,
    });
    await db.delete(supplierMaster).where(eq(supplierMaster.id, s!.id));
    expect(r.status).toBe(400);
  });

  test("BR-INV-12 vendor_premise with an unknown supplier is rejected", async () => {
    const r = await call("POST", "/locations", "back_office", {
      name: uid(),
      type: "vendor_premise",
      linkedVendorId: 2_000_000_000,
    });
    expect([400, 404]).toContain(r.status);
  });

  test("BR-INV-12 non-vendor type with a supplier is 400", async () => {
    for (const type of ["main_store", "finished_goods", "scrap_yard"]) {
      const r = await call("POST", "/locations", "back_office", {
        name: uid(),
        type,
        linkedVendorId: supplierId,
      });
      expect(r.status).toBe(400);
    }
  });

  test("BR-INV-12 vendor_premise is always virtual, even if sent false", async () => {
    const [s] = await db
      .insert(supplierMaster)
      .values({ name: `${RUN}_vp_supplier` })
      .returning({ id: supplierMaster.id });
    const r = await call("POST", "/locations", "back_office", {
      name: uid(),
      type: "vendor_premise",
      linkedVendorId: s!.id,
      isVirtual: false,
    });
    expect(r.status).toBe(201);
    expect(r.json.data.isVirtual).toBe(true);
    expect(r.json.data.linkedVendorId).toBe(s!.id);
    // each supplier has at most one
    const again = await call("POST", "/locations", "back_office", {
      name: uid(),
      type: "vendor_premise",
      linkedVendorId: s!.id,
    });
    expect(again.status).toBe(409);
    await db.delete(locations).where(eq(locations.id, r.json.data.id));
    await db.delete(supplierMaster).where(eq(supplierMaster.id, s!.id));
  });

  test("BR-INV-13 creating a second main_store is 409", async () => {
    const before = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.type, "main_store"));
    const r = await call("POST", "/locations", "back_office", {
      name: uid(),
      type: "main_store",
    });
    expect(r.status).toBe(409);
    const after = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.type, "main_store"));
    expect(after.length).toBe(before.length);
  });

  test("BR-INV-13 changing the only main_store to another type is 409", async () => {
    const r = await call("PATCH", `/locations/${mainStoreId}`, "back_office", {
      type: "scrap_yard",
    });
    if (r.status === 200) {
      // restore shared data if the rule is broken
      await db
        .update(locations)
        .set({ type: "main_store" })
        .where(eq(locations.id, mainStoreId));
    }
    expect(r.status).toBe(409);
  });

  test("BR-INV-14 location with ledger rows: type change is 409 LOCATION_IN_USE, name change ok", async () => {
    const loc = await mkLocation({ type: "scrap_yard" });
    const item = await mkItem();
    await openingStock(item.id, loc.id);
    const bad = await call("PATCH", `/locations/${loc.id}`, "back_office", {
      type: "finished_goods",
    });
    expect(bad.status).toBe(409);
    expect(codeOf(bad.json)).toBe("LOCATION_IN_USE");
    const ok = await call("PATCH", `/locations/${loc.id}`, "back_office", {
      name: uid(),
    });
    expect(ok.status).toBe(200);
  });

  test("BR-INV-14 location with ledger rows: linked supplier change is 409 LOCATION_IN_USE", async () => {
    const [s1] = await db
      .insert(supplierMaster)
      .values({ name: `${RUN}_lk_s1` })
      .returning({ id: supplierMaster.id });
    const [s2] = await db
      .insert(supplierMaster)
      .values({ name: `${RUN}_lk_s2` })
      .returning({ id: supplierMaster.id });
    const loc = await mkLocation({
      type: "vendor_premise",
      linkedVendorId: s1!.id,
    });
    const item = await mkItem();
    await openingStock(item.id, loc.id);
    const r = await call("PATCH", `/locations/${loc.id}`, "back_office", {
      linkedVendorId: s2!.id,
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.json)).toBe("LOCATION_IN_USE");
    await db
      .delete(inventoryLedger)
      .where(eq(inventoryLedger.locationId, loc.id));
    await db.delete(locations).where(eq(locations.id, loc.id));
    await db
      .delete(supplierMaster)
      .where(inArray(supplierMaster.id, [s1!.id, s2!.id]));
  });

  test("BR-INV-14 location without rows: type can change", async () => {
    const loc = await mkLocation({ type: "scrap_yard" });
    const r = await call("PATCH", `/locations/${loc.id}`, "back_office", {
      type: "finished_goods",
    });
    expect(r.status).toBe(200);
  });

  test("BR-INV-14 locations are never deleted: no DELETE route", async () => {
    const loc = await mkLocation();
    const r = await call("DELETE", `/locations/${loc.id}`, "super-admin");
    expect([404, 405]).toContain(r.status);
  });

  test("BR-INV-15 inactive location is hidden from isActive=true list but kept", async () => {
    const loc = await mkLocation();
    const off = await call("PATCH", `/locations/${loc.id}`, "back_office", {
      isActive: false,
    });
    expect(off.status).toBe(200);
    const active = await call(
      "GET",
      `/locations?isActive=true&pageSize=100&q=${RUN}`,
      "back_office",
    );
    expect(active.json.data.map((l: any) => l.id)).not.toContain(loc.id);
    const inactive = await call(
      "GET",
      `/locations?isActive=false&pageSize=100&q=${RUN}`,
      "back_office",
    );
    expect(inactive.json.data.map((l: any) => l.id)).toContain(loc.id);
  });

  test("BR-INV-15 an inactive location can't take new postings", async () => {
    const loc = await mkLocation();
    const item = await mkItem();
    await call("PATCH", `/locations/${loc.id}`, "back_office", {
      isActive: false,
    });
    const r = await call("POST", "/inventory/movements", "owner", {
      itemId: item.id,
      locationId: loc.id,
      referenceType: "opening_stock",
      qty: 5,
      unitCostPaise: 100,
      reason: "x",
    });
    expect(r.status).toBe(400);
    const rows = await db
      .select()
      .from(inventoryLedger)
      .where(eq(inventoryLedger.locationId, loc.id));
    expect(rows.length).toBe(0);
  });

  test("BR-INV-13 changing another location to main_store is 409 and leaves its type", async () => {
    const loc = await mkLocation({ type: "scrap_yard" });
    const r = await call("PATCH", `/locations/${loc.id}`, "back_office", {
      type: "main_store",
    });
    expect(r.status).toBe(409);
    const [row] = await db
      .select({ type: locations.type })
      .from(locations)
      .where(eq(locations.id, loc.id));
    expect(row!.type).toBe("scrap_yard");
  });

  test("BR-INV-13 concurrent main_store creates are all 409 and none is added", async () => {
    const count = async () =>
      (
        await db
          .select({ id: locations.id })
          .from(locations)
          .where(eq(locations.type, "main_store"))
      ).length;
    const before = await count();
    const rs = await Promise.all(
      [1, 2, 3, 4].map(() =>
        call("POST", "/locations", "back_office", {
          name: uid(),
          type: "main_store",
        }),
      ),
    );
    expect(rs.map((r) => r.status)).toEqual([409, 409, 409, 409]);
    expect(await count()).toBe(before);
  });

  test("BR-INV-15 a deactivated location keeps its movement history", async () => {
    const loc = await mkLocation();
    const item = await mkItem();
    await openingStock(item.id, loc.id, 7);
    const off = await call("PATCH", `/locations/${loc.id}`, "back_office", {
      isActive: false,
    });
    expect(off.status).toBe(200);
    const rows = await db
      .select()
      .from(inventoryLedger)
      .where(eq(inventoryLedger.locationId, loc.id));
    expect(rows.length).toBe(1);
    const list = await call(
      "GET",
      `/inventory/movements?itemId=${item.id}&locationId=${loc.id}`,
      "owner",
    );
    expect(list.status).toBe(200);
    expect(list.json.data.length).toBe(1);
  });

  test("BR-INV-15 a stock-take into an inactive location is 400 and posts nothing", async () => {
    const loc = await mkLocation();
    const item = await mkItem();
    await openingStock(item.id, loc.id, 10);
    await call("PATCH", `/locations/${loc.id}`, "back_office", {
      isActive: false,
    });
    const r = await call("POST", "/inventory/movements", "owner", {
      itemId: item.id,
      locationId: loc.id,
      referenceType: "stock_adjustment",
      countedQty: 4,
      reason: "count",
    });
    expect(r.status).toBe(400);
    const rows = await db
      .select()
      .from(inventoryLedger)
      .where(eq(inventoryLedger.locationId, loc.id));
    expect(rows.length).toBe(1);
  });

  test("BR-INV-15 a reactivated location takes postings again", async () => {
    const loc = await mkLocation();
    const item = await mkItem();
    await call("PATCH", `/locations/${loc.id}`, "back_office", {
      isActive: false,
    });
    await call("PATCH", `/locations/${loc.id}`, "back_office", {
      isActive: true,
    });
    await openingStock(item.id, loc.id, 3);
  });
});

// ---------------------------------------------------------------- machines
describe("machines", () => {
  const mk = (over: Record<string, unknown> = {}) =>
    call("POST", "/machines", "back_office", {
      name: uid(),
      code: uid(),
      ...over,
    });

  test("BR-INV-16 create with name and code; status defaults to idle", async () => {
    const r = await mk({ type: "cold chamber" });
    expect(r.status).toBe(201);
    expect(r.json.data.status).toBe("idle");
  });

  test("BR-INV-16 name and code are required", async () => {
    const noCode = await call("POST", "/machines", "back_office", {
      name: uid(),
    });
    expect(noCode.status).toBe(400);
    const noName = await call("POST", "/machines", "back_office", {
      code: uid(),
    });
    expect(noName.status).toBe(400);
  });

  test("BR-INV-16 duplicate code ignoring case is 409", async () => {
    const code = uid();
    await mk({ code });
    const r = await mk({ code: code.toLowerCase() });
    expect(r.status).toBe(409);
  });

  test("BR-INV-16 duplicate name ignoring case is 409", async () => {
    const name = uid();
    await mk({ name });
    const r = await mk({ name: name.toLowerCase() });
    expect(r.status).toBe(409);
  });

  test("BR-INV-16 editing a machine into another's code is 409", async () => {
    const a = await mk();
    const b = await mk();
    const r = await call(
      "PATCH",
      `/machines/${b.json.data.id}`,
      "back_office",
      {
        code: a.json.data.code.toUpperCase(),
      },
    );
    expect(r.status).toBe(409);
  });

  test("BR-INV-17 status is one of the four; other value is 400", async () => {
    const m = await mk();
    const r = await call(
      "PATCH",
      `/machines/${m.json.data.id}`,
      "back_office",
      {
        status: "broken",
      },
    );
    expect(r.status).toBe(400);
  });

  test("BR-INV-17 any status change is allowed and saves who and when", async () => {
    const m = await mk();
    const id = m.json.data.id;
    const t0 = Date.now() - 5000;
    for (const status of [
      "breakdown",
      "running",
      "maintenance",
      "idle",
      "breakdown",
    ]) {
      const r = await call(
        "PATCH",
        `/machines/${id}`,
        "back_office",
        { status },
        actorB,
      );
      expect(r.status).toBe(200);
      expect(r.json.data.status).toBe(status);
    }
    const [row] = await db.select().from(machines).where(eq(machines.id, id));
    expect(row!.status).toBe("breakdown");
    expect(row!.lastUpdatedBy).toBe(actorB);
    expect(row!.lastUpdatedAt.getTime()).toBeGreaterThan(t0);
  });

  test("BR-INV-17 last maintenance date tomorrow is 400, past date ok", async () => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const bad = await mk({ lastMaintenanceAt: tomorrow });
    expect(bad.status).toBe(400);
    const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const ok = await mk({ lastMaintenanceAt: past });
    expect(ok.status).toBe(201);
    const m = await mk();
    const patchBad = await call(
      "PATCH",
      `/machines/${m.json.data.id}`,
      "back_office",
      { lastMaintenanceAt: tomorrow },
    );
    expect(patchBad.status).toBe(400);
  });

  test("BR-INV-15 inactive machine is hidden from isActive=true list but kept", async () => {
    const m = await mk();
    const id = m.json.data.id;
    const off = await call("PATCH", `/machines/${id}`, "back_office", {
      isActive: false,
    });
    expect(off.status).toBe(200);
    const active = await call(
      "GET",
      `/machines?isActive=true&pageSize=100&q=${RUN}`,
      "back_office",
    );
    expect(active.json.data.map((x: any) => x.id)).not.toContain(id);
    const inactive = await call(
      "GET",
      `/machines?isActive=false&pageSize=100&q=${RUN}`,
      "back_office",
    );
    expect(inactive.json.data.map((x: any) => x.id)).toContain(id);
  });

  test("BR-INV-18 machines are never deleted: no DELETE route", async () => {
    const m = await mk();
    const r = await call(
      "DELETE",
      `/machines/${m.json.data.id}`,
      "super-admin",
    );
    expect([404, 405]).toContain(r.status);
  });

  test("BR-INV-18 a PR that points to a machine keeps it after the machine is deactivated", async () => {
    const m = await mk();
    const id = m.json.data.id;
    const pr = await callAt("/api/pr", "POST", "/createpr", "back_office", {
      type: "maintenance",
      assetId: id,
      notes: "spares",
      items: [{ itemId: (await mkItem()).id, requestedQty: 1 }],
    });
    expect(pr.status).toBe(201);
    await call("PATCH", `/machines/${id}`, "back_office", { isActive: false });
    const d = await callAt(
      "/api/pr",
      "GET",
      `/getprdetails/${pr.json.data.pr.id}`,
      "back_office",
    );
    expect(d.status).toBe(200);
    expect(d.json.data.pr.assetId).toBe(id);
  });
});

// ---------------------------------------------------------------- audit
describe("BR-INV-25 audit: who and when", () => {
  test("BR-INV-25 item create, edit, deactivate, reactivate save the actor and time", async () => {
    const created = await call(
      "POST",
      "/items",
      "back_office",
      {
        sku: uid(),
        name: "audit",
        category: "Raw Material",
        uom: "kg",
        standardRatePaise: 100,
      },
      actorA,
    );
    expect(created.json.data.createdBy).toBe(actorA);
    expect(created.json.data.lastUpdatedBy).toBe(actorA);
    const id = created.json.data.id;
    let last = Date.parse(created.json.data.lastUpdatedAt);
    for (const body of [
      { name: "audit2" },
      { isActive: false },
      { isActive: true },
    ]) {
      await new Promise((res) => setTimeout(res, 15));
      const r = await call(
        "PATCH",
        `/items/${id}`,
        "back_office",
        body,
        actorB,
      );
      expect(r.status).toBe(200);
      expect(r.json.data.lastUpdatedBy).toBe(actorB);
      const t = Date.parse(r.json.data.lastUpdatedAt);
      expect(t).toBeGreaterThan(last);
      expect(t).toBeLessThanOrEqual(Date.now() + 1000);
      last = t;
    }
    expect((await itemRow(id)).createdBy).toBe(actorA);
  });

  test("BR-INV-25 service create, edit and deactivate save the actor", async () => {
    const c = await call(
      "POST",
      "/services",
      "back_office",
      {
        code: uid(),
        name: "s",
        defaultUom: "job",
      },
      actorA,
    );
    expect(c.json.data.createdBy).toBe(actorA);
    const id = c.json.data.id;
    for (const body of [
      { name: "s2" },
      { isActive: false },
      { isActive: true },
    ]) {
      const r = await call(
        "PATCH",
        `/services/${id}`,
        "back_office",
        body,
        actorB,
      );
      expect(r.json.data.lastUpdatedBy).toBe(actorB);
    }
  });

  test("BR-INV-25 location create, edit and deactivate save the actor", async () => {
    const c = await call(
      "POST",
      "/locations",
      "back_office",
      {
        name: uid(),
        type: "scrap_yard",
      },
      actorA,
    );
    expect(c.json.data.createdBy).toBe(actorA);
    const id = c.json.data.id;
    for (const body of [
      { name: uid() },
      { isActive: false },
      { isActive: true },
    ]) {
      const r = await call(
        "PATCH",
        `/locations/${id}`,
        "back_office",
        body,
        actorB,
      );
      expect(r.json.data.lastUpdatedBy).toBe(actorB);
    }
  });

  test("BR-INV-25 machine create, edit and deactivate save the actor", async () => {
    const c = await call(
      "POST",
      "/machines",
      "back_office",
      {
        name: uid(),
        code: uid(),
      },
      actorA,
    );
    expect(c.json.data.createdBy).toBe(actorA);
    const id = c.json.data.id;
    for (const body of [
      { name: uid() },
      { isActive: false },
      { isActive: true },
    ]) {
      const r = await call(
        "PATCH",
        `/machines/${id}`,
        "back_office",
        body,
        actorB,
      );
      expect(r.json.data.lastUpdatedBy).toBe(actorB);
    }
  });
});

// ---------------------------------------------------------------- roles
describe("who can do what (inventory spec table)", () => {
  test("only asset.manage roles create items: owner and floor_supervisor get 403, nothing saved", async () => {
    for (const role of [
      "owner",
      "floor_supervisor",
      "qa_inspector",
    ] as Role[]) {
      const sku = uid();
      const r = await call("POST", "/items", role, {
        sku,
        name: "n",
        category: "Raw Material",
        uom: "kg",
        standardRatePaise: 100,
      });
      expect(r.status).toBe(403);
      const rows = await db
        .select()
        .from(itemMaster)
        .where(eq(itemMaster.sku, sku));
      expect(rows.length).toBe(0);
    }
  });

  test("super-admin and back_office can create items", async () => {
    for (const role of ["super-admin", "back_office"] as Role[]) {
      const r = await call("POST", "/items", role, {
        sku: uid(),
        name: "n",
        category: "Raw Material",
        uom: "kg",
        standardRatePaise: 100,
      });
      expect(r.status).toBe(201);
    }
  });

  test("owner can't edit items, services, locations or machines", async () => {
    const item = await mkItem();
    const loc = await mkLocation();
    const mach = await call("POST", "/machines", "back_office", {
      name: uid(),
      code: uid(),
    });
    const svc = await call("POST", "/services", "back_office", {
      code: uid(),
      name: "s",
      defaultUom: "job",
    });
    expect(
      (await call("PATCH", `/items/${item.id}`, "owner", { name: "x" })).status,
    ).toBe(403);
    expect(
      (await call("PATCH", `/locations/${loc.id}`, "owner", { name: uid() }))
        .status,
    ).toBe(403);
    expect(
      (
        await call("PATCH", `/machines/${mach.json.data.id}`, "owner", {
          name: uid(),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("PATCH", `/services/${svc.json.data.id}`, "owner", {
          name: "x",
        })
      ).status,
    ).toBe(403);
  });

  test("inventory.view roles can list items; qa_inspector and operator can't", async () => {
    for (const role of [
      "owner",
      "back_office",
      "floor_supervisor",
      "super-admin",
    ] as Role[]) {
      const r = await call("GET", "/items?pageSize=1", role);
      expect(r.status).toBe(200);
    }
    for (const role of ["qa_inspector", "operator"] as Role[]) {
      const r = await call("GET", "/items?pageSize=1", role);
      expect(r.status).toBe(403);
    }
  });

  test("no token is 401", async () => {
    const res = await app.request("/api/asset/items");
    expect(res.status).toBe(401);
  });

  test("item list supports isActive and category filters", async () => {
    const a = await mkItem({ category: "Tooling" });
    const b = await mkItem({ category: "Packing" });
    await call("PATCH", `/items/${b.id}`, "back_office", { isActive: false });
    const r = await call(
      "GET",
      `/items?isActive=true&category=Tooling&pageSize=100&q=${RUN}`,
      "back_office",
    );
    const ids = r.json.data.map((i: any) => i.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
    expect(r.json.meta.page).toBe(1);
  });
});
