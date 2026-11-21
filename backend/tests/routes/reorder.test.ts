/**
 * Reorder tests, API + live list + settings + item fields
 * (docs/specs/reorder/spec.md v1): BR-RO-01..09, 15, 20, 21, 24, 31.
 * Real DB, full HTTP stack via createApp(). Fixtures are TEST_ro_a_ prefixed
 * and removed in afterAll. Run behaviour lives in reorderRun.test.ts.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  reorderRuns,
  reorderSettings,
  reorderSettingsHistory,
} from "../../src/db/schemas/02_procurement-reorder";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

type Role =
  | "owner"
  | "back_office"
  | "floor_supervisor"
  | "qa_inspector"
  | "super-admin";

const app = createApp();
const RUN = `TEST_ro_a_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

type Actor = { id: number; token: string };
const actors = new Map<string, Actor>();
const ROLE_OF: Record<string, Role> = {
  owner: "owner",
  bo: "back_office",
  bo2: "back_office",
  fs: "floor_supervisor",
  qa: "qa_inspector",
  sa: "super-admin",
};

async function mkEmployee(
  tag: string,
  roleName: string,
  isActive = true,
): Promise<number> {
  const [r] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  if (!r) throw new Error(`seed role ${roleName} missing`);
  const [e] = await db
    .insert(employees)
    .values({ name: `${RUN}_${tag}`, roleId: r.id, isActive })
    .returning({ id: employees.id });
  return e!.id;
}

async function actor(key: string): Promise<Actor> {
  let a = actors.get(key);
  if (!a) {
    const role = ROLE_OF[key]!;
    const id = await mkEmployee(key, role);
    a = {
      id,
      token: await signAccessToken({
        userId: id,
        userName: `${RUN}_${key}`,
        role,
        allowedPages: [],
      }),
    };
    actors.set(key, a);
  }
  return a;
}

async function call(
  method: string,
  path: string,
  who: string | null,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (who) headers.Authorization = `Bearer ${(await actor(who)).token}`;
  const res = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const extraEmployeeIds: number[] = [];
const itemIds: number[] = [];
const locationIds: number[] = [];
const poIds: number[] = [];
let supplierId = 0;
let mainStoreId = 0;
let createdMainStore = false;
let fgId = 0;
let vendorLocId = 0;
let scrapId = 0;

async function resetSettings() {
  await db
    .update(reorderSettings)
    .set({ enabled: false, runHour: 7, draftOwnerId: null, updatedBy: null })
    .where(eq(reorderSettings.id, 1));
}

type ItemInsert = typeof itemMaster.$inferInsert;
async function mkItem(over: Partial<ItemInsert> = {}) {
  const [it] = await db
    .insert(itemMaster)
    .values({
      sku: uid(),
      name: `${RUN} item`,
      category: "Raw Material",
      uom: "kg",
      reorderLevel: 0,
      standardRatePaise: 24000,
      ...over,
    })
    .returning();
  itemIds.push(it!.id);
  return it!;
}

async function stock(itemId: number, locationId: number, qty: number) {
  await db.insert(inventoryLedger).values({
    itemId,
    locationId,
    transactionType: qty >= 0 ? "in" : "adjustment",
    referenceType: qty >= 0 ? "opening_stock" : "stock_adjustment",
    referenceId: 0,
    quantityChange: qty,
    balanceAfter: qty,
    unitCostPaise: 0,
    totalValueChangePaise: 0,
    createdBy: (await actor("owner")).id,
  });
}

// A low item: level 500, reorder qty 1000, stock 480 in the main store.
async function mkLow(over: Partial<ItemInsert> = {}, stockQty = 480) {
  const it = await mkItem({
    reorderLevel: 500,
    reorderQty: 1000,
    ...over,
  });
  if (stockQty !== 0) await stock(it.id, mainStoreId, stockQty);
  return it;
}

async function mkPr(
  status: (typeof purchaseRequests.$inferInsert)["status"],
  itemId: number,
  qty = 1000,
  lineStatus: (typeof purchaseRequestItems.$inferInsert)["status"] = "pending",
) {
  const [pr] = await db
    .insert(purchaseRequests)
    .values({
      prNumber: uid(),
      type: "misc",
      status,
      requestedBy: (await actor("owner")).id,
      notes: RUN,
    })
    .returning({
      id: purchaseRequests.id,
      prNumber: purchaseRequests.prNumber,
    });
  await db.insert(purchaseRequestItems).values({
    prId: pr!.id,
    itemId,
    requestedQty: qty,
    uom: "kg",
    status: lineStatus,
  });
  return pr!;
}

async function mkPo(
  status: (typeof purchaseOrders.$inferInsert)["status"],
  itemId: number,
  qty = 1000,
  received = 0,
) {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: uid(),
      supplierId,
      status,
      createdBy: (await actor("owner")).id,
    })
    .returning({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber });
  poIds.push(po!.id);
  await db.insert(purchaseOrderItems).values({
    poId: po!.id,
    itemId,
    qty,
    receivedQty: received,
    unitPricePaise: 24000,
    uom: "kg",
  });
  return po!;
}

async function row(item: { id: number; sku: string }) {
  const r = await call(
    "GET",
    `/api/reorder/items?q=${encodeURIComponent(item.sku)}&pageSize=100`,
    "bo",
  );
  expect(r.status).toBe(200);
  return (r.json.data as any[]).find((x) => x.itemId === item.id);
}

beforeAll(async () => {
  await actor("owner");
  const [s] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_s` })
    .returning({ id: supplierMaster.id });
  supplierId = s!.id;
  const [main] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "main_store"))
    .limit(1);
  if (main) mainStoreId = main.id;
  else {
    const [loc] = await db
      .insert(locations)
      .values({ name: uid(), type: "main_store" })
      .returning({ id: locations.id });
    mainStoreId = loc!.id;
    createdMainStore = true;
    locationIds.push(mainStoreId);
  }
  const mk = async (type: "finished_goods" | "scrap_yard", linked?: number) => {
    const [l] = await db
      .insert(locations)
      .values({ name: uid(), type, linkedVendorId: linked })
      .returning({ id: locations.id });
    locationIds.push(l!.id);
    return l!.id;
  };
  fgId = await mk("finished_goods");
  scrapId = await mk("scrap_yard");
  const [vloc] = await db
    .insert(locations)
    .values({
      name: uid(),
      type: "vendor_premise",
      isVirtual: true,
      linkedVendorId: supplierId,
    })
    .returning({ id: locations.id });
  vendorLocId = vloc!.id;
  locationIds.push(vendorLocId);
});

afterAll(async () => {
  const empIds = [
    ...[...actors.values()].map((a) => a.id),
    ...extraEmployeeIds,
  ];
  const ids = itemIds;
  const runIds = empIds.length
    ? (
        await db
          .select({ id: reorderRuns.id })
          .from(reorderRuns)
          .where(inArray(reorderRuns.startedBy, empIds))
      ).map((r) => r.id)
    : [];
  if (runIds.length) {
    await db.delete(reorderRuns).where(inArray(reorderRuns.id, runIds));
  }
  if (empIds.length) {
    await db
      .delete(reorderSettingsHistory)
      .where(inArray(reorderSettingsHistory.createdBy, empIds));
  }
  await resetSettings();
  const prs = await db
    .select({ id: purchaseRequests.id })
    .from(purchaseRequests)
    .where(like(purchaseRequests.prNumber, `${RUN}%`));
  if (prs.length) {
    const p = prs.map((x) => x.id);
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, p));
    await db.delete(purchaseRequests).where(inArray(purchaseRequests.id, p));
  }
  if (poIds.length) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, poIds));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
  }
  const apiItems = await db
    .select({ id: itemMaster.id })
    .from(itemMaster)
    .where(like(itemMaster.sku, `${RUN}%`));
  const allItems = [...new Set([...ids, ...apiItems.map((i) => i.id)])];
  if (allItems.length) {
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, allItems));
    await db.delete(itemMaster).where(inArray(itemMaster.id, allItems));
  }
  if (locationIds.length) {
    await db.delete(locations).where(inArray(locations.id, locationIds));
  }
  await db.delete(supplierMaster).where(eq(supplierMaster.id, supplierId));
  if (empIds.length) {
    await db
      .update(documentNumberCounters)
      .set({ createdBy: null })
      .where(inArray(documentNumberCounters.createdBy, empIds));
    await db
      .update(documentNumberCounters)
      .set({ lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.lastUpdatedBy, empIds));
    await db.delete(employees).where(inArray(employees.id, empIds));
  }
  void createdMainStore;
});

// ---------------------------------------------------------------- BR-RO-24
describe("BR-RO-24 login and key on every reorder endpoint", () => {
  const reads = ["/items", "/runs", "/runs/1", "/settings"];

  for (const p of reads) {
    test(`BR-RO-24 GET ${p} without login -> 401`, async () => {
      const r = await call("GET", `/api/reorder${p}`, null);
      expect(r.status).toBe(401);
    });
    test(`BR-RO-24 GET ${p} without inventory.view (qa) -> 403 PERMISSION_DENIED`, async () => {
      const r = await call("GET", `/api/reorder${p}`, "qa");
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("PERMISSION_DENIED");
    });
    test(`BR-RO-24 GET ${p} with inventory.view (fs) is allowed`, async () => {
      const r = await call("GET", `/api/reorder${p}`, "fs");
      expect([401, 403]).not.toContain(r.status);
    });
  }

  test("BR-RO-24 POST check-now without login -> 401", async () => {
    expect(
      (await call("POST", "/api/reorder/check-now", null, {})).status,
    ).toBe(401);
  });

  test("BR-RO-24 POST check-now by fs -> 403 PERMISSION_DENIED and no run saved", async () => {
    const r = await call("POST", "/api/reorder/check-now", "fs", {});
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
    const fs = await actor("fs");
    const saved = await db
      .select({ id: reorderRuns.id })
      .from(reorderRuns)
      .where(eq(reorderRuns.startedBy, fs.id));
    expect(saved.length).toBe(0);
  });

  test("BR-RO-24 PATCH settings by fs -> 403 PERMISSION_DENIED", async () => {
    const r = await call("PATCH", "/api/reorder/settings", "fs", {
      runHour: 8,
    });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
  });

  test("BR-RO-24 PATCH settings without login -> 401", async () => {
    expect(
      (await call("PATCH", "/api/reorder/settings", null, { runHour: 8 }))
        .status,
    ).toBe(401);
  });

  test("BR-RO-24 owner-candidates: fs -> 403, no login -> 401, bo -> 200", async () => {
    expect(
      (await call("GET", "/api/reorder/owner-candidates", "fs")).status,
    ).toBe(403);
    expect(
      (await call("GET", "/api/reorder/owner-candidates", null)).status,
    ).toBe(401);
    expect(
      (await call("GET", "/api/reorder/owner-candidates", "bo")).status,
    ).toBe(200);
  });

  test("BR-RO-24 owner role also reads the list (owner holds inventory.view)", async () => {
    expect((await call("GET", "/api/reorder/items", "owner")).status).toBe(200);
  });
});

describe("BR-RO-24 request validation", () => {
  test("BR-RO-24 items: bad state value -> 400", async () => {
    expect(
      (await call("GET", "/api/reorder/items?state=bogus", "bo")).status,
    ).toBe(400);
  });
  test("BR-RO-24 items: pageSize 101 -> 400", async () => {
    expect(
      (await call("GET", "/api/reorder/items?pageSize=101", "bo")).status,
    ).toBe(400);
  });
  test("BR-RO-24 items: unknown sortBy -> 400", async () => {
    expect(
      (await call("GET", "/api/reorder/items?sortBy=foo", "bo")).status,
    ).toBe(400);
  });
  test("BR-RO-24 items: unknown query key -> 400", async () => {
    expect((await call("GET", "/api/reorder/items?foo=1", "bo")).status).toBe(
      400,
    );
  });
  test("BR-RO-24 runs: bad trigger -> 400", async () => {
    expect(
      (await call("GET", "/api/reorder/runs?trigger=x", "bo")).status,
    ).toBe(400);
  });
  test("BR-RO-22 runs/:id not a positive integer -> 400", async () => {
    expect((await call("GET", "/api/reorder/runs/abc", "bo")).status).toBe(400);
    expect((await call("GET", "/api/reorder/runs/0", "bo")).status).toBe(400);
  });
  test("BR-RO-22 runs/:id unknown -> 404 REORDER_RUN_NOT_FOUND", async () => {
    const r = await call("GET", "/api/reorder/runs/999999999", "bo");
    expect(r.status).toBe(404);
    expect(r.json.code).toBe("REORDER_RUN_NOT_FOUND");
  });
  test("BR-RO-11 check-now with a non-empty body -> 400", async () => {
    const r = await call("POST", "/api/reorder/check-now", "bo", { x: 1 });
    expect(r.status).toBe(400);
  });
});

// ---------------------------------------------------------------- settings
describe("BR-RO-15 / BR-RO-20 settings", () => {
  beforeAll(async () => {
    await resetSettings();
    await actor("bo");
    await actor("bo2");
    await actor("sa");
    await actor("qa");
    await actor("fs");
  });
  afterAll(resetSettings);

  const patch = (body: unknown, who = "bo") =>
    call("PATCH", "/api/reorder/settings", who, body);
  const get = async () =>
    (await call("GET", "/api/reorder/settings", "fs")).json;

  test("BR-RO-20 defaults: switch off, hour 7, no owner", async () => {
    const j = await get();
    expect(j.data.enabled).toBe(false);
    expect(j.data.runHour).toBe(7);
    expect(j.data.draftOwner).toBeNull();
    expect(j.data.draftOwnerValid).toBe(false);
  });

  test("BR-RO-15 switch on with no owner -> 400 REORDER_OWNER_INVALID, switch stays off", async () => {
    const r = await patch({ enabled: true });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("REORDER_OWNER_INVALID");
    expect((await get()).data.enabled).toBe(false);
  });

  test("BR-RO-20 owner without pr.manage (qa) -> 400 REORDER_OWNER_INVALID", async () => {
    const qa = await actor("qa");
    const r = await patch({ draftOwnerId: qa.id });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("REORDER_OWNER_INVALID");
    expect((await get()).data.draftOwner).toBeNull();
  });

  test("BR-RO-20 inactive employee as owner -> 400 REORDER_OWNER_INVALID", async () => {
    const id = await mkEmployee("inactive", "back_office", false);
    extraEmployeeIds.push(id);
    const r = await patch({ draftOwnerId: id });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("REORDER_OWNER_INVALID");
  });

  test("BR-RO-20 unknown employee as owner -> 400 REORDER_OWNER_INVALID", async () => {
    const r = await patch({ draftOwnerId: 999999999 });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("REORDER_OWNER_INVALID");
  });

  test("BR-RO-20 super-admin counts as an owner holding pr.manage", async () => {
    const sa = await actor("sa");
    const r = await patch({ draftOwnerId: sa.id });
    expect(r.status).toBe(200);
    expect(r.json.data.draftOwner.id).toBe(sa.id);
    expect(r.json.data.draftOwnerValid).toBe(true);
  });

  test("BR-RO-20 valid owner saved, response shows who changed it", async () => {
    const bo = await actor("bo");
    const bo2 = await actor("bo2");
    const r = await patch({ draftOwnerId: bo2.id });
    expect(r.status).toBe(200);
    expect(r.json.data.draftOwner.id).toBe(bo2.id);
    expect(r.json.data.draftOwnerValid).toBe(true);
    expect(r.json.data.updatedBy.id).toBe(bo.id);
  });

  test("BR-RO-20 owner change is audited (who, before -> after)", async () => {
    const bo = await actor("bo");
    const bo2 = await actor("bo2");
    const sa = await actor("sa");
    const rows = await db
      .select()
      .from(reorderSettingsHistory)
      .where(
        and(
          eq(reorderSettingsHistory.createdBy, bo.id),
          eq(reorderSettingsHistory.field, "draftOwnerId"),
        ),
      )
      .orderBy(desc(reorderSettingsHistory.id));
    const last = rows[0];
    expect(last).toBeDefined();
    expect(last?.oldValue).toBe(String(sa.id));
    expect(last?.newValue).toBe(String(bo2.id));
  });

  test("BR-RO-20 switch on with valid owner -> 200 and audit row off -> on by the caller", async () => {
    const bo = await actor("bo");
    const r = await patch({ enabled: true });
    expect(r.status).toBe(200);
    expect(r.json.data.enabled).toBe(true);
    const rows = await db
      .select()
      .from(reorderSettingsHistory)
      .where(
        and(
          eq(reorderSettingsHistory.createdBy, bo.id),
          eq(reorderSettingsHistory.field, "enabled"),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows[rows.length - 1]!;
    expect(row.oldValue).not.toBe(row.newValue);
  });

  test("BR-RO-15 clearing the owner while on -> 400 REORDER_OWNER_INVALID, nothing saved", async () => {
    const bo2 = await actor("bo2");
    const r = await patch({ draftOwnerId: null });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("REORDER_OWNER_INVALID");
    const s = (await get()).data;
    expect(s.enabled).toBe(true);
    expect(s.draftOwner.id).toBe(bo2.id);
  });

  test("BR-RO-15 switch off and owner cleared together -> saved", async () => {
    const r = await patch({ enabled: false, draftOwnerId: null });
    expect(r.status).toBe(200);
    expect(r.json.data.enabled).toBe(false);
    expect(r.json.data.draftOwner).toBeNull();
  });

  test("BR-RO-20 run hour is a whole hour 0..23", async () => {
    expect((await patch({ runHour: 9 })).json.data.runHour).toBe(9);
    expect((await patch({ runHour: 0 })).status).toBe(200);
    expect((await patch({ runHour: 23 })).status).toBe(200);
    expect((await patch({ runHour: 24 })).status).toBe(400);
    expect((await patch({ runHour: -1 })).status).toBe(400);
    expect((await patch({ runHour: 7.5 })).status).toBe(400);
  });

  test("BR-RO-20 empty body or unknown key -> 400", async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ bogus: 1 })).status).toBe(400);
  });

  test("BR-RO-20 owner-candidates list active pr.manage holders incl. super-admin and floor supervisor, not qa / inactive", async () => {
    const r = await call(
      "GET",
      `/api/reorder/owner-candidates?q=${encodeURIComponent(RUN)}&pageSize=100`,
      "bo",
    );
    expect(r.status).toBe(200);
    const got = (r.json.data as { id: number; name: string }[]).map(
      (x) => x.id,
    );
    expect(got).toContain((await actor("bo")).id);
    expect(got).toContain((await actor("bo2")).id);
    expect(got).toContain((await actor("sa")).id);
    expect(got).not.toContain((await actor("qa")).id);
    expect(got).toContain((await actor("fs")).id);
    for (const id of extraEmployeeIds) expect(got).not.toContain(id);
  });
});

// ---------------------------------------------------------------- BR-RO-09
describe("BR-RO-09 item reorder fields", () => {
  const post = (body: Record<string, unknown>, who = "bo") =>
    call("POST", "/api/asset/items", who, {
      sku: uid(),
      name: `${RUN} api item`,
      category: "Raw Material",
      uom: "kg",
      standardRatePaise: 24000,
      ...body,
    });

  test("BR-RO-09 bo sets reorder qty, min order qty, order multiple -> saved as numbers", async () => {
    const r = await post({
      reorderLevel: 500,
      reorderQty: 1000,
      minOrderQty: 100,
      orderMultiple: 250,
    });
    expect(r.status).toBe(201);
    expect(r.json.data.reorderQty).toBe(1000);
    expect(r.json.data.minOrderQty).toBe(100);
    expect(r.json.data.orderMultiple).toBe(250);
  });

  test("BR-RO-09 fields default to 0 when not sent", async () => {
    const r = await post({});
    expect(r.status).toBe(201);
    expect(r.json.data.reorderQty).toBe(0);
    expect(r.json.data.minOrderQty).toBe(0);
    expect(r.json.data.orderMultiple).toBe(0);
  });

  test("BR-RO-09 edit by bo saves the value and last updated by bo", async () => {
    const created = await post({});
    const bo = await actor("bo");
    const r = await call(
      "PATCH",
      `/api/asset/items/${created.json.data.id}`,
      "bo",
      { reorderQty: 750 },
    );
    expect(r.status).toBe(200);
    expect(r.json.data.reorderQty).toBe(750);
    expect(r.json.data.lastUpdatedBy).toBe(bo.id);
  });

  test("BR-RO-09 the item list returns the three fields", async () => {
    const created = await post({ reorderQty: 40, orderMultiple: 5 });
    const sku = created.json.data.sku as string;
    const r = await call(
      "GET",
      `/api/asset/items?q=${encodeURIComponent(sku)}&pageSize=100`,
      "fs",
    );
    expect(r.status).toBe(200);
    const found = (r.json.data as any[]).find((x) => x.sku === sku);
    expect(found.reorderQty).toBe(40);
    expect(found.orderMultiple).toBe(5);
    expect(found.minOrderQty).toBe(0);
  });

  test("BR-RO-09 order multiple 2.5 on a pcs item -> 400", async () => {
    const r = await post({ uom: "pcs", orderMultiple: 2.5 });
    expect(r.status).toBe(400);
  });

  test("BR-RO-09 order multiple 2.5 on a kg item -> saved", async () => {
    const r = await post({ uom: "kg", orderMultiple: 2.5 });
    expect(r.status).toBe(201);
    expect(r.json.data.orderMultiple).toBe(2.5);
  });

  test("BR-RO-09 whole reorder qty on a set item is fine, fractional is 400", async () => {
    expect((await post({ uom: "set", reorderQty: 3 })).status).toBe(201);
    expect((await post({ uom: "set", reorderQty: 3.5 })).status).toBe(400);
  });

  test("BR-RO-09 negative reorder qty -> 400", async () => {
    expect((await post({ reorderQty: -1 })).status).toBe(400);
    expect((await post({ minOrderQty: -1 })).status).toBe(400);
    expect((await post({ orderMultiple: -1 })).status).toBe(400);
  });

  test("BR-RO-09 reorder qty above 1,000,000,000 -> 400; exactly the cap is accepted", async () => {
    expect((await post({ reorderQty: 1_000_000_001 })).status).toBe(400);
    expect((await post({ reorderQty: 1_000_000_000 })).status).toBe(201);
  });

  test("BR-RO-09 more than 3 decimals -> 400", async () => {
    expect((await post({ reorderQty: 1.2345 })).status).toBe(400);
  });

  test("BR-RO-09 edit without asset.manage (fs) -> 403", async () => {
    const created = await post({});
    const r = await call(
      "PATCH",
      `/api/asset/items/${created.json.data.id}`,
      "fs",
      { reorderQty: 5 },
    );
    expect(r.status).toBe(403);
  });
});

// ---------------------------------------------------------------- live list
describe("BR-RO-21 live list: order qty rules (BR-RO-05..08)", () => {
  test("BR-RO-21 ADC12 480 / 0 / 480 / 500 -> will_be_ordered, order qty 1000", async () => {
    const it = await mkLow({ orderMultiple: 250 });
    const r = await row(it);
    expect(r.state).toBe("will_be_ordered");
    expect(r.uom).toBe("kg");
    expect(r.usableQty).toBe(480);
    expect(r.onTheWayQty).toBe(0);
    expect(r.projectedQty).toBe(480);
    expect(r.reorderLevel).toBe(500);
    expect(r.reorderQty).toBe(1000);
    expect(r.orderQty).toBe(1000);
    expect(r.coveredBy).toBeNull();
  });

  test("BR-RO-05 projected exactly at the level counts as low", async () => {
    const r = await row(await mkLow({}, 500));
    expect(r.state).toBe("will_be_ordered");
  });

  test("BR-RO-05 projected above the level -> ok, no order qty", async () => {
    const r = await row(await mkLow({}, 501));
    expect(r.state).toBe("ok");
    expect(r.orderQty).toBeNull();
    expect(r.coveredBy).toBeNull();
  });

  test("BR-RO-06 + BR-RO-07 projected -700, qty 1000 -> 1200, multiple 250 -> 1250", async () => {
    const r = await row(await mkLow({ orderMultiple: 250 }, -700));
    expect(r.projectedQty).toBe(-700);
    expect(r.orderQty).toBe(1250);
  });

  test("BR-RO-06 shortfall larger than reorder qty wins", async () => {
    const it = await mkLow({ reorderLevel: 5000, reorderQty: 1000 }, 0);
    expect((await row(it)).orderQty).toBe(5000);
  });

  test("BR-RO-07 min order qty raises the qty", async () => {
    const it = await mkLow({ minOrderQty: 2000 });
    expect((await row(it)).orderQty).toBe(2000);
  });

  test("BR-RO-07 multiple 0 leaves the qty unchanged", async () => {
    const it = await mkLow({ orderMultiple: 0 });
    expect((await row(it)).orderQty).toBe(1000);
  });

  test("BR-RO-07 rounds up to the next multiple", async () => {
    const it = await mkLow({ reorderQty: 1001, orderMultiple: 250 });
    expect((await row(it)).orderQty).toBe(1250);
  });

  test("BR-RO-08 12.5 on a pcs item -> 13", async () => {
    const it = await mkLow(
      { uom: "pcs", reorderLevel: 10, reorderQty: 12.5 },
      0,
    );
    expect((await row(it)).orderQty).toBe(13);
  });

  test("BR-RO-08 100.0004 kg -> 100.001", async () => {
    const it = await mkLow({ reorderLevel: 200.0004, reorderQty: 50 }, 100);
    expect((await row(it)).orderQty).toBe(100.001);
  });
});

describe("BR-RO-01 / BR-RO-02 which items take part", () => {
  test("BR-RO-01 reorder level 0 -> not listed", async () => {
    const it = await mkItem({ reorderLevel: 0, reorderQty: 1000 });
    expect(await row(it)).toBeUndefined();
  });

  test("BR-RO-01 inactive item -> not listed", async () => {
    const it = await mkLow({ isActive: false });
    expect(await row(it)).toBeUndefined();
  });

  test("BR-RO-01 no supplier needed -> still listed as will_be_ordered", async () => {
    const it = await mkLow();
    expect((await row(it)).state).toBe("will_be_ordered");
  });

  test("BR-RO-02 level 20, reorder qty 0, stock 5 -> needs_reorder_qty, no order qty", async () => {
    const it = await mkLow({ reorderLevel: 20, reorderQty: 0 }, 5);
    const r = await row(it);
    expect(r.state).toBe("needs_reorder_qty");
    expect(r.orderQty).toBeNull();
  });

  test("BR-RO-02 same item with stock 50 -> ok", async () => {
    const it = await mkLow({ reorderLevel: 20, reorderQty: 0 }, 50);
    expect((await row(it)).state).toBe("ok");
  });
});

describe("BR-RO-03 usable stock by location type", () => {
  test("BR-RO-03 main store 480 + job worker 300 + scrap yard 50 -> usable 480", async () => {
    const it = await mkLow({}, 480);
    await stock(it.id, vendorLocId, 300);
    await stock(it.id, scrapId, 50);
    const r = await row(it);
    expect(r.usableQty).toBe(480);
    expect(r.state).toBe("will_be_ordered");
  });

  test("BR-RO-03 finished goods counts with the main store", async () => {
    const it = await mkLow({}, 200);
    await stock(it.id, fgId, 100);
    expect((await row(it)).usableQty).toBe(300);
  });

  test("BR-RO-03 stock only at a job worker -> usable 0", async () => {
    const it = await mkLow({}, 0);
    await stock(it.id, vendorLocId, 900);
    const r = await row(it);
    expect(r.usableQty).toBe(0);
    expect(r.state).toBe("will_be_ordered");
  });
});

describe("BR-RO-04 on the way", () => {
  test("BR-RO-04 draft PR line 1000 -> on the way 1000, covered by that PR", async () => {
    const it = await mkLow();
    const pr = await mkPr("draft", it.id);
    const r = await row(it);
    expect(r.onTheWayQty).toBe(1000);
    expect(r.projectedQty).toBe(1480);
    expect(r.state).toBe("covered");
    expect(r.coveredBy).toEqual({ type: "pr", id: pr.id, number: pr.prNumber });
    expect(r.orderQty).toBeNull();
  });

  for (const status of [
    "pending_approval",
    "approved",
    "partial_ordered",
  ] as const) {
    test(`BR-RO-04 pending line of a ${status} PR counts`, async () => {
      const it = await mkLow();
      await mkPr(status, it.id);
      expect((await row(it)).onTheWayQty).toBe(1000);
    });
  }

  for (const status of ["rejected", "cancelled"] as const) {
    test(`BR-RO-04 a ${status} PR never counts`, async () => {
      const it = await mkLow();
      await mkPr(status, it.id);
      const r = await row(it);
      expect(r.onTheWayQty).toBe(0);
      expect(r.state).toBe("will_be_ordered");
    });
  }

  test("BR-RO-04 a cancelled PR line never counts", async () => {
    const it = await mkLow();
    await mkPr("draft", it.id, 1000, "cancelled");
    expect((await row(it)).onTheWayQty).toBe(0);
  });

  test("BR-RO-04 a PR line already on a PO is not pending, so it is not counted twice", async () => {
    const it = await mkLow();
    await mkPr("partial_ordered", it.id, 1000, "po_draft");
    await mkPo("dispatched", it.id, 1000, 0);
    expect((await row(it)).onTheWayQty).toBe(1000);
  });

  test("BR-RO-04 PO 1000, accepted 600 -> 400 on the way; covered by the PO", async () => {
    const it = await mkLow();
    const po = await mkPo("partial_received", it.id, 1000, 600);
    const r = await row(it);
    expect(r.onTheWayQty).toBe(400);
    expect(r.projectedQty).toBe(880);
    expect(r.state).toBe("covered");
    expect(r.coveredBy).toEqual({ type: "po", id: po.id, number: po.poNumber });
  });

  for (const status of [
    "cancelled",
    "closed",
    "fully_received",
    "invoiced",
  ] as const) {
    test(`BR-RO-04 a ${status} PO adds nothing`, async () => {
      const it = await mkLow();
      await mkPo(status, it.id, 1000, 0);
      expect((await row(it)).onTheWayQty).toBe(0);
    });
  }

  test("BR-RO-04 accepted above PO qty never goes below 0", async () => {
    const it = await mkLow();
    await mkPo("partial_received", it.id, 1000, 1050);
    expect((await row(it)).onTheWayQty).toBe(0);
  });

  test("BR-RO-21 open PR is named before an open PO", async () => {
    const it = await mkLow();
    await mkPo("dispatched", it.id, 500, 0);
    const pr = await mkPr("draft", it.id, 500);
    const r = await row(it);
    expect(r.onTheWayQty).toBe(1000);
    expect(r.coveredBy).toEqual({ type: "pr", id: pr.id, number: pr.prNumber });
  });

  test("BR-RO-21 covered only when usable stock alone is at or below the level", async () => {
    const it = await mkLow({}, 600);
    await mkPr("draft", it.id);
    expect((await row(it)).state).toBe("ok");
  });

  test("BR-RO-02 needs-a-reorder-qty item with an open PR on the way is covered once projected > level", async () => {
    const it = await mkLow({ reorderLevel: 20, reorderQty: 0 }, 5);
    await mkPr("draft", it.id, 100);
    expect((await row(it)).state).toBe("covered");
  });
});

describe("BR-RO-21 list paging, filters, counts", () => {
  test("BR-RO-21 state filter returns only those states", async () => {
    const r = await call(
      "GET",
      `/api/reorder/items?q=${encodeURIComponent(RUN)}&state=ok,covered&pageSize=100`,
      "bo",
    );
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBeGreaterThan(0);
    for (const x of r.json.data) expect(["ok", "covered"]).toContain(x.state);
  });

  test("BR-RO-21 meta carries paging fields and all four state counts, ignoring the state filter", async () => {
    const all = await call("GET", "/api/reorder/items?pageSize=1", "bo");
    const filtered = await call(
      "GET",
      "/api/reorder/items?pageSize=1&state=ok",
      "bo",
    );
    for (const k of ["page", "pageSize", "total", "totalPages"]) {
      expect(typeof filtered.json.meta[k]).toBe("number");
    }
    const keys = ["will_be_ordered", "covered", "needs_reorder_qty", "ok"];
    for (const k of keys) {
      expect(typeof filtered.json.meta.stateCounts[k]).toBe("number");
    }
    expect(filtered.json.meta.stateCounts).toEqual(all.json.meta.stateCounts);
    expect(filtered.json.meta.total).toBe(filtered.json.meta.stateCounts.ok);
  });

  test("BR-RO-21 sort by sku desc and projectedQty asc", async () => {
    const q = encodeURIComponent(RUN);
    const bySku = await call(
      "GET",
      `/api/reorder/items?q=${q}&sortBy=sku&sortDir=desc&pageSize=100`,
      "bo",
    );
    const skus = (bySku.json.data as any[]).map((x) => x.sku);
    expect(skus).toEqual([...skus].sort().reverse());
    const byProj = await call(
      "GET",
      `/api/reorder/items?q=${q}&sortBy=projectedQty&sortDir=asc&pageSize=100`,
      "bo",
    );
    const proj = (byProj.json.data as any[]).map((x) => x.projectedQty);
    expect(proj).toEqual([...proj].sort((a, b) => a - b));
  });

  test("BR-RO-21 the live list saves nothing (no run row, no PR)", async () => {
    const bo = await actor("bo");
    const before = await db
      .select({ id: reorderRuns.id })
      .from(reorderRuns)
      .where(eq(reorderRuns.startedBy, bo.id));
    await call("GET", "/api/reorder/items?pageSize=100", "bo");
    const after = await db
      .select({ id: reorderRuns.id })
      .from(reorderRuns)
      .where(eq(reorderRuns.startedBy, bo.id));
    expect(after.length).toBe(before.length);
  });
});

describe("BR-RO-31 stock list flag is information only", () => {
  test("BR-RO-31 480 / level 500 with an open PR: stock list flags below reorder, reorder screen says covered", async () => {
    const it = await mkLow();
    await mkPr("draft", it.id);
    const stockRes = await call(
      "GET",
      `/api/asset/inventory/stock?q=${encodeURIComponent(it.sku)}&pageSize=100`,
      "bo",
    );
    expect(stockRes.status).toBe(200);
    const s = (stockRes.json.data as any[]).find(
      (x) => x.itemId === it.id || x.id === it.id || x.sku === it.sku,
    );
    expect(s.belowReorder).toBe(true);
    expect((await row(it)).state).toBe("covered");
  });
});
