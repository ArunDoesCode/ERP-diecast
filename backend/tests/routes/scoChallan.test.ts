/**
 * HTTP-level tests for the job-work challan (issue material to the vendor):
 * BR-SCO-07..11, 24, 25 (docs/specs/subcontracting.md v2).
 * Real app (middleware + routers + onError) against the test DB.
 * Fixtures are TEST_scoch_ prefixed and removed in afterAll. The single
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
const PREFIX = "TEST_scoch_";
const EMAIL_PREFIX = "test_scoch_";
const PASSWORD = "scoch-test-password-123";
const DECLARATION = "sent for job work u/s 143, no tax charged";

type Actor = { id: number; token: string };
const actors: Record<string, Actor> = {};

let mainStoreId: number;
let createdMainStore = false;
let serviceId: number;
let localVendorId: number; // GSTIN state 29 = ours
let interStateVendorId: number; // GSTIN state 27
let unregisteredVendorId: number; // no GSTIN, same state unknown
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

async function makeVendor(tag: string, gst: string | null) {
  const [v] = await db
    .insert(supplierMaster)
    .values({
      name: uniq(tag),
      type: "service_provider",
      gstNumber: gst,
      address: gst ? `${tag} street, town` : null,
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

/** Raw item with `stock` pcs in main store at `cost` paise average. */
async function makeRaw(opts: {
  stock: number;
  cost?: number;
  hsn?: string | null;
  tag?: string;
}) {
  const cost = opts.cost ?? 12_000;
  const [row] = await db
    .insert(itemMaster)
    .values({
      sku: uniq(opts.tag ?? "raw"),
      name: `${PREFIX}raw`,
      category: "Raw Material",
      uom: "pcs",
      hsnCode: opts.hsn === undefined ? "7616" : opts.hsn,
    })
    .returning({ id: itemMaster.id });
  const id = requireRow(row, "raw item").id;
  if (opts.stock > 0) {
    const res = await call("owner", "POST", "/asset/inventory/movements", {
      itemId: id,
      locationId: mainStoreId,
      referenceType: "opening_stock",
      qty: opts.stock,
      unitCostPaise: cost,
      reason: "opening",
    });
    if (res.status >= 300) {
      throw new Error(`opening stock failed: ${JSON.stringify(res.json)}`);
    }
  }
  return id;
}

async function makeFinished() {
  const [row] = await db
    .insert(itemMaster)
    .values({
      sku: uniq("fin"),
      name: `${PREFIX}fin`,
      category: "Raw Material",
      uom: "pcs",
    })
    .returning({ id: itemMaster.id });
  return requireRow(row, "finished item").id;
}

type LineSpec = { rawItemId: number; send?: number; batch?: string };

/** Approved SCO (status set directly: approval flow is not under test here). */
async function makeSco(vendorId: number, lines: LineSpec[]) {
  const finishedItemId = await makeFinished();
  const res = await call("bo", "POST", "/sco/createsco", {
    vendorId,
    expectedReturnDate: daysFromNow(30),
    lines: lines.map((l) => ({
      rawItemId: l.rawItemId,
      finishedItemId,
      serviceId,
      rawQtyToIssue: l.send ?? 1000,
      expectedReturnQty: l.send ?? 1000,
      ...(l.batch ? { rawItemBatch: l.batch } : {}),
    })),
  });
  if (res.status !== 201) {
    throw new Error(`SCO fixture failed: ${JSON.stringify(res.json)}`);
  }
  const scoId = res.json.data.sco.id as number;
  createdScoIds.push(scoId);
  await setStatus(scoId, "approved");
  const items = res.json.data.items as Array<{ id: number }>;
  return { scoId, itemIds: items.map((i) => i.id) };
}

async function setStatus(
  scoId: number,
  status: (typeof subcontractingOrders.$inferSelect)["status"],
) {
  await db
    .update(subcontractingOrders)
    .set({ status })
    .where(eq(subcontractingOrders.id, scoId));
}

// Challans of Rs 50,000 or more need an e-way bill number (BR-SCO-10).
const EWB = { ewayBillNo: "EWB-TEST-1" };

function challan(
  actor: string,
  scoId: number,
  lines: Array<{ scoItemId: number; qty: number; heatNumber?: string }>,
  extra: Record<string, unknown> = {},
) {
  return call(actor, "POST", `/sco/${scoId}/challans`, { lines, ...extra });
}

async function scoDetails(scoId: number) {
  const res = await call("bo", "GET", `/sco/getscodetails/${scoId}`);
  return res.json.data as {
    // biome-ignore lint/suspicious/noExplicitAny: test reads arbitrary JSON
    sco: any;
    // biome-ignore lint/suspicious/noExplicitAny: test reads arbitrary JSON
    items: any[];
  };
}

async function issueRows(itemId: number) {
  return db
    .select()
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, itemId),
        eq(inventoryLedger.referenceType, "sco_issue"),
      ),
    )
    .orderBy(inventoryLedger.id);
}

async function vendorLocations(vendorId: number) {
  return db
    .select()
    .from(locations)
    .where(
      and(
        eq(locations.linkedVendorId, vendorId),
        eq(locations.type, "vendor_premise"),
      ),
    );
}

async function challanCount(scoId: number) {
  const rows = await db
    .select({ id: scoChallans.id })
    .from(scoChallans)
    .where(eq(scoChallans.scoId, scoId));
  return rows.length;
}

async function itemRow(itemId: number) {
  const [row] = await db
    .select()
    .from(itemMaster)
    .where(eq(itemMaster.id, itemId));
  return requireRow(row, "item");
}

beforeAll(async () => {
  await makeActor("owner", "owner");
  await makeActor("bo", "back_office");
  await makeActor("fs", "floor_supervisor");

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

  const [svc] = await db
    .insert(serviceMaster)
    .values({ code: uniq("CNC"), name: `${PREFIX}CNC`, defaultUom: "pcs" })
    .returning({ id: serviceMaster.id });
  serviceId = requireRow(svc, "service").id;

  // company_settings is a one-row shared table: save, then set ours (state 29).
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

  localVendorId = await makeVendor("local", "29TESTL0001A1Z5");
  interStateVendorId = await makeVendor("inter", "27TESTI0001A1Z5");
  unregisteredVendorId = await makeVendor("unreg", null);
});

afterAll(async () => {
  if (createdScoIds.length > 0) {
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
  // Restore the shared one-row settings.
  await db.delete(companySettings);
  if (savedCompany) await db.insert(companySettings).values(savedCompany);
  // Number counters are shared and never roll back: detach, don't delete.
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

describe("BR-SCO-07 lots", () => {
  test("BR-SCO-07 first challan of 600 on an approved SCO -> 201, SCO material_issued, issuedQty 600", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const res = await challan(
      "bo",
      scoId,
      [{ scoItemId: itemIds[0] as number, qty: 600 }],
      EWB,
    );
    expect(res.status).toBe(201);
    expect(res.json.data.lines).toHaveLength(1);
    expect(res.json.data.lines[0].qty).toBe(600);
    const d = await scoDetails(scoId);
    expect(d.sco.status).toBe("material_issued");
    expect(d.items[0].issuedQty).toBe(600);
  });

  test("BR-SCO-07 second challan of 400 on a material_issued SCO -> ok, issuedQty 1000", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const id = itemIds[0] as number;
    expect(
      (await challan("bo", scoId, [{ scoItemId: id, qty: 600 }], EWB)).status,
    ).toBe(201);
    const res = await challan("bo", scoId, [{ scoItemId: id, qty: 400 }], EWB);
    expect(res.status).toBe(201);
    const d = await scoDetails(scoId);
    expect(d.items[0].issuedQty).toBe(1000);
    expect(await challanCount(scoId)).toBe(2);
  });

  test("BR-SCO-07 issued 600, challan for 500 (only 400 left) -> 400, nothing changes", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const id = itemIds[0] as number;
    await challan("bo", scoId, [{ scoItemId: id, qty: 600 }], EWB);
    const res = await challan("bo", scoId, [{ scoItemId: id, qty: 500 }], EWB);
    expect(res.status).toBe(400);
    const d = await scoDetails(scoId);
    expect(d.items[0].issuedQty).toBe(600);
    expect(await challanCount(scoId)).toBe(1);
    expect(await issueRows(raw)).toHaveLength(2);
  });

  test("BR-SCO-07 qty above the send qty on the first challan -> 400", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 1001 },
    ]);
    expect(res.status).toBe(400);
  });

  test("BR-SCO-07 qty 0 -> 400", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 0 },
    ]);
    expect(res.status).toBe(400);
  });

  test("BR-SCO-07 fractional qty -> 400", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 10.5 },
    ]);
    expect(res.status).toBe(400);
  });

  test("BR-SCO-07 no lines -> 400", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId } = await makeSco(localVendorId, [{ rawItemId: raw }]);
    const res = await challan("bo", scoId, []);
    expect(res.status).toBe(400);
  });

  test("BR-SCO-07 store holds 300, challan for 400 -> 409, nothing posted", async () => {
    const raw = await makeRaw({ stock: 300 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 400 },
    ]);
    expect(res.status).toBe(409);
    expect(await issueRows(raw)).toHaveLength(0);
    expect(await challanCount(scoId)).toBe(0);
    const d = await scoDetails(scoId);
    expect(d.sco.status).toBe("approved");
    expect(d.items[0].issuedQty).toBe(0);
  });

  for (const status of [
    "draft",
    "pending_approval",
    "material_received",
    "closed",
    "cancelled",
  ] as const) {
    test(`BR-SCO-07 SCO in ${status} -> 409, nothing posted`, async () => {
      const raw = await makeRaw({ stock: 5000 });
      const { scoId, itemIds } = await makeSco(localVendorId, [
        { rawItemId: raw },
      ]);
      await setStatus(scoId, status);
      const res = await challan("bo", scoId, [
        { scoItemId: itemIds[0] as number, qty: 100 },
      ]);
      expect(res.status).toBe(409);
      expect(await issueRows(raw)).toHaveLength(0);
      expect(await challanCount(scoId)).toBe(0);
    });
  }

  test("BR-SCO-07 unknown SCO -> 404", async () => {
    const res = await challan("bo", 999_999_999, [{ scoItemId: 1, qty: 1 }]);
    expect(res.status).toBe(404);
  });

  test("BR-SCO-07 scoItemId of another SCO -> 404, nothing posted", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const a = await makeSco(localVendorId, [{ rawItemId: raw }]);
    const b = await makeSco(localVendorId, [{ rawItemId: raw }]);
    const res = await challan("bo", a.scoId, [
      { scoItemId: b.itemIds[0] as number, qty: 10 },
    ]);
    expect(res.status).toBe(404);
    expect(await issueRows(raw)).toHaveLength(0);
  });
});

describe("BR-SCO-08 ledger postings", () => {
  test("BR-SCO-08 600 out: store -600 and vendor location +600 at 12,000; item stock and average unchanged", async () => {
    const raw = await makeRaw({ stock: 5000, cost: 12_000 });
    const vendor = await makeVendor("fresh", "29TESTF0001A1Z5");
    const { scoId, itemIds } = await makeSco(vendor, [
      { rawItemId: raw, batch: "H-231" },
    ]);
    const before = await itemRow(raw);
    expect(await vendorLocations(vendor)).toHaveLength(0);

    const res = await challan(
      "bo",
      scoId,
      [{ scoItemId: itemIds[0] as number, qty: 600 }],
      EWB,
    );
    expect(res.status).toBe(201);

    const rows = await issueRows(raw);
    expect(rows).toHaveLength(2);
    const locs = await vendorLocations(vendor);
    expect(locs).toHaveLength(1);
    const vendorLoc = requireRow(locs[0], "vendor location");
    const out = rows.find((r) => r.locationId === mainStoreId);
    const inn = rows.find((r) => r.locationId === vendorLoc.id);
    expect(out?.quantityChange).toBe(-600);
    expect(out?.transactionType).toBe("out");
    expect(out?.unitCostPaise).toBe(12_000);
    expect(inn?.quantityChange).toBe(600);
    expect(inn?.transactionType).toBe("in");
    expect(inn?.unitCostPaise).toBe(12_000);
    expect(inn?.balanceAfter).toBe(600);

    const after = await itemRow(raw);
    expect(after.currentStock).toBe(before.currentStock);
    expect(after.averageCostPaise).toBe(before.averageCostPaise);
  });

  test("BR-SCO-08 heat number is copied to both rows (default = SCO line batch)", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw, batch: "H-231" },
    ]);
    await challan("bo", scoId, [{ scoItemId: itemIds[0] as number, qty: 100 }]);
    const rows = await issueRows(raw);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.batchNumber).toBe("H-231");
  });

  test("BR-SCO-08 an explicit heat number on the challan line is used", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw, batch: "H-231" },
    ]);
    await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 100, heatNumber: "H-999" },
    ]);
    const rows = await issueRows(raw);
    for (const r of rows) expect(r.batchNumber).toBe("H-999");
  });

  test("BR-SCO-08 a later challan to the same vendor reuses its location and uses the current average cost", async () => {
    const raw = await makeRaw({ stock: 5000, cost: 12_000 });
    const vendor = await makeVendor("reuse", "29TESTR0001A1Z5");
    const { scoId, itemIds } = await makeSco(vendor, [{ rawItemId: raw }]);
    const id = itemIds[0] as number;
    await challan("bo", scoId, [{ scoItemId: id, qty: 300 }]);
    await challan("bo", scoId, [{ scoItemId: id, qty: 200 }]);
    expect(await vendorLocations(vendor)).toHaveLength(1);
    const rows = await issueRows(raw);
    expect(rows).toHaveLength(4);
    const vendorLoc = requireRow((await vendorLocations(vendor))[0], "loc");
    const last = rows.filter((r) => r.locationId === vendorLoc.id).pop();
    expect(last?.balanceAfter).toBe(500);
  });

  test("BR-SCO-08 challan line records the issue cost; value = qty x cost", async () => {
    const raw = await makeRaw({ stock: 5000, cost: 12_000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 300 },
    ]);
    expect(res.status).toBe(201);
    expect(res.json.data.lines[0].unitIssueCostPaise).toBe(12_000);
    expect(res.json.data.lines[0].lineValuePaise).toBe(3_600_000);
    expect(res.json.data.challan.valuePaise).toBe(3_600_000);
  });
});

describe("BR-SCO-09 challan number and print data", () => {
  test("BR-SCO-09 number is JWC/<FY>/<seq>, at most 16 chars", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 10 },
    ]);
    expect(res.status).toBe(201);
    const n = res.json.data.challan.challanNumber as string;
    expect(n).toMatch(/^JWC\/\d{2}-\d{2}\/\d+$/);
    expect(n.length).toBeLessThanOrEqual(16);
  });

  test("BR-SCO-09 financial year runs Apr-Mar: 31 Mar 2026 is 25-26, 1 Apr 2026 is 26-27", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const id = itemIds[0] as number;
    const a = await challan("bo", scoId, [{ scoItemId: id, qty: 10 }], {
      challanDate: "2026-03-31T06:00:00.000Z",
    });
    const b = await challan("bo", scoId, [{ scoItemId: id, qty: 10 }], {
      challanDate: "2026-04-01T06:00:00.000Z",
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.json.data.challan.challanNumber).toMatch(/^JWC\/25-26\/\d+$/);
    expect(b.json.data.challan.challanNumber).toMatch(/^JWC\/26-27\/\d+$/);
  });

  test("BR-SCO-09 numbers are consecutive within a FY and a refused challan does not burn one", async () => {
    const date = { challanDate: "2026-04-05T06:00:00.000Z" };
    const raw = await makeRaw({ stock: 5000 });
    const noHsn = await makeRaw({ stock: 5000, hsn: null });
    const ok1 = await makeSco(localVendorId, [{ rawItemId: raw }]);
    const bad = await makeSco(localVendorId, [{ rawItemId: noHsn }]);
    const a = await challan(
      "bo",
      ok1.scoId,
      [{ scoItemId: ok1.itemIds[0] as number, qty: 10 }],
      date,
    );
    const refused = await challan(
      "bo",
      bad.scoId,
      [{ scoItemId: bad.itemIds[0] as number, qty: 10 }],
      date,
    );
    const b = await challan(
      "bo",
      ok1.scoId,
      [{ scoItemId: ok1.itemIds[0] as number, qty: 10 }],
      date,
    );
    expect(refused.status).toBe(400);
    const seqOf = (r: {
      json: { data: { challan: { challanNumber: string } } };
    }) => Number(r.json.data.challan.challanNumber.split("/")[2]);
    expect(seqOf(b)).toBe(seqOf(a) + 1);
  });

  test("BR-SCO-09 print data carries company, vendor, HSN, issue value and the declaration", async () => {
    const raw = await makeRaw({ stock: 5000, cost: 12_000, hsn: "7616" });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw, batch: "H-231" },
    ]);
    const created = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 100 },
    ]);
    const cid = created.json.data.challan.id;
    const res = await call("fs", "GET", `/sco/challans/${cid}`);
    expect(res.status).toBe(200);
    const d = res.json.data;
    expect(d.challan.challanNumber).toBe(
      created.json.data.challan.challanNumber,
    );
    expect(d.company.name).toBe(`${PREFIX}Diecast Works`);
    expect(d.company.address).toBe("1 Plant Road, Pune");
    expect(d.company.gstin).toBe("29AABCD1234E1Z5");
    expect(d.vendor.gstin).toBe("29TESTL0001A1Z5");
    expect(d.vendor.address).toBeTruthy();
    expect(String(d.declaration).toLowerCase()).toContain(DECLARATION);
    expect(d.lines[0].hsnCode).toBe("7616");
    expect(d.lines[0].qty).toBe(100);
    expect(d.lines[0].lineValuePaise).toBe(1_200_000);
    expect(d.challan.challanDate).toBeTruthy();
  });

  test("BR-SCO-09 vendor without GSTIN prints as unregistered (gstin null)", async () => {
    const raw = await makeRaw({ stock: 5000, cost: 1_000 });
    const { scoId, itemIds } = await makeSco(unregisteredVendorId, [
      { rawItemId: raw },
    ]);
    const created = await challan(
      "bo",
      scoId,
      [{ scoItemId: itemIds[0] as number, qty: 10 }],
      { ewayBillNo: "EWB-100" },
    );
    expect(created.status).toBe(201);
    const res = await call(
      "bo",
      "GET",
      `/sco/challans/${created.json.data.challan.id}`,
    );
    expect(res.json.data.vendor.gstin).toBeNull();
  });

  test("BR-SCO-09 challan date in the future -> 400, nothing posts, no number burned", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const id = itemIds[0] as number;
    const before = (await issueRows(raw)).length;
    const res = await challan("bo", scoId, [{ scoItemId: id, qty: 10 }], {
      challanDate: daysFromNow(3),
    });
    expect(res.status).toBe(400);
    expect(await challanCount(scoId)).toBe(0);
    expect((await issueRows(raw)).length).toBe(before);
    const far = await challan("bo", scoId, [{ scoItemId: id, qty: 10 }], {
      challanDate: "2027-04-01T06:00:00.000Z",
    });
    expect(far.status).toBe(400);
  });

  test("BR-SCO-09 challan date of today is accepted; a past date is accepted; omitted defaults to today", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const id = itemIds[0] as number;
    const today = await challan("bo", scoId, [{ scoItemId: id, qty: 10 }], {
      challanDate: new Date().toISOString(),
    });
    const past = await challan("bo", scoId, [{ scoItemId: id, qty: 10 }], {
      challanDate: daysFromNow(-10),
    });
    const dflt = await challan("bo", scoId, [{ scoItemId: id, qty: 10 }]);
    expect(today.status).toBe(201);
    expect(past.status).toBe(201);
    expect(dflt.status).toBe(201);
    // BR-SCO-09: "today" is the plant's calendar day in IST (UTC+05:30).
    const istDayOf = (t: number) =>
      new Date(t + 330 * 60_000).toISOString().slice(0, 10);
    expect(
      istDayOf(new Date(String(dflt.json.data.challan.challanDate)).getTime()),
    ).toBe(istDayOf(Date.now()));
  });

  test("BR-SCO-09 unknown challan -> 404", async () => {
    const res = await call("bo", "GET", "/sco/challans/999999999");
    expect(res.status).toBe(404);
  });

  test("BR-SCO-09 raw item without HSN -> 400, nothing posts", async () => {
    const raw = await makeRaw({ stock: 5000, hsn: null });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 100 },
    ]);
    expect(res.status).toBe(400);
    expect(await issueRows(raw)).toHaveLength(0);
    expect(await challanCount(scoId)).toBe(0);
    const d = await scoDetails(scoId);
    expect(d.sco.status).toBe("approved");
    expect(d.items[0].issuedQty).toBe(0);
  });

  test("BR-SCO-09 company details missing -> 400, nothing posts", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const [mine] = await db.select().from(companySettings).limit(1);
    await db.delete(companySettings);
    try {
      const res = await challan("bo", scoId, [
        { scoItemId: itemIds[0] as number, qty: 100 },
      ]);
      expect(res.status).toBe(400);
    } finally {
      if (mine) await db.insert(companySettings).values(mine);
    }
    expect(await issueRows(raw)).toHaveLength(0);
    expect(await challanCount(scoId)).toBe(0);
    const d = await scoDetails(scoId);
    expect(d.items[0].issuedQty).toBe(0);
  });
});

describe("BR-SCO-10 e-way bill", () => {
  test("BR-SCO-10 inter-state vendor, value Rs 8,000, no EWB -> 400, nothing posts", async () => {
    const raw = await makeRaw({ stock: 500, cost: 8_000 });
    const { scoId, itemIds } = await makeSco(interStateVendorId, [
      { rawItemId: raw, send: 100 },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 100 },
    ]);
    expect(res.status).toBe(400);
    expect(await issueRows(raw)).toHaveLength(0);
    expect(await challanCount(scoId)).toBe(0);
  });

  test("BR-SCO-10 inter-state vendor with an EWB number -> 201 and the number is stored", async () => {
    const raw = await makeRaw({ stock: 500, cost: 8_000 });
    const { scoId, itemIds } = await makeSco(interStateVendorId, [
      { rawItemId: raw, send: 100 },
    ]);
    const res = await challan(
      "bo",
      scoId,
      [{ scoItemId: itemIds[0] as number, qty: 100 }],
      { ewayBillNo: "EWB123456789012" },
    );
    expect(res.status).toBe(201);
    expect(res.json.data.challan.ewayBillNo).toBe("EWB123456789012");
  });

  test("BR-SCO-10 unregistered vendor, value Rs 5,000, no EWB -> 400", async () => {
    const raw = await makeRaw({ stock: 500, cost: 10_000 });
    const { scoId, itemIds } = await makeSco(unregisteredVendorId, [
      { rawItemId: raw, send: 50 },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 50 },
    ]);
    expect(res.status).toBe(400);
    expect(await issueRows(raw)).toHaveLength(0);
  });

  test("BR-SCO-10 same-state registered vendor under Rs 50,000 needs no EWB", async () => {
    const raw = await makeRaw({ stock: 5000, cost: 1_000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw, send: 4999 },
    ]);
    // value 4,999 x 1,000 paise = Rs 49,990
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 4999 },
    ]);
    expect(res.status).toBe(201);
    expect(res.json.data.challan.ewayBillNo).toBeNull();
  });

  test("BR-SCO-10 same-state registered vendor at exactly Rs 50,000 needs an EWB", async () => {
    const raw = await makeRaw({ stock: 6000, cost: 1_000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw, send: 5000 },
    ]);
    const id = itemIds[0] as number;
    const without = await challan("bo", scoId, [{ scoItemId: id, qty: 5000 }]);
    expect(without.status).toBe(400);
    expect(await issueRows(raw)).toHaveLength(0);
    const withEwb = await challan("bo", scoId, [{ scoItemId: id, qty: 5000 }], {
      ewayBillNo: "EWB555",
    });
    expect(withEwb.status).toBe(201);
  });

  test("BR-SCO-10 the EWB rule is on the challan value, not the SCO value: small lot on a big SCO needs none", async () => {
    const raw = await makeRaw({ stock: 8000, cost: 1_000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw, send: 8000 },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 100 },
    ]);
    expect(res.status).toBe(201);
  });
});

describe("BR-SCO-11 return due date and days left", () => {
  test("BR-SCO-11 return due date = challan date + 1 year", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const res = await challan(
      "bo",
      scoId,
      [{ scoItemId: itemIds[0] as number, qty: 10 }],
      { challanDate: "2026-06-01T06:00:00.000Z" },
    );
    expect(res.status).toBe(201);
    expect(String(res.json.data.challan.returnDueDate).slice(0, 10)).toBe(
      "2027-06-01",
    );
  });

  test("BR-SCO-11 a challan of today is 'ok' with about a year left", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    await challan("bo", scoId, [{ scoItemId: itemIds[0] as number, qty: 10 }]);
    const list = await call("bo", "GET", `/sco/${scoId}/challans`);
    expect(list.status).toBe(200);
    const c = list.json.data[0];
    expect(c.dueStatus).toBe("ok");
    expect(c.daysLeft).toBeGreaterThanOrEqual(364);
    expect(c.daysLeft).toBeLessThanOrEqual(366);
  });

  test("BR-SCO-11 45 days left -> warning", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    await challan("bo", scoId, [{ scoItemId: itemIds[0] as number, qty: 10 }], {
      challanDate: daysFromNow(-320),
    });
    const list = await call("bo", "GET", `/sco/${scoId}/challans`);
    const c = list.json.data[0];
    expect(c.daysLeft).toBeGreaterThanOrEqual(44);
    expect(c.daysLeft).toBeLessThanOrEqual(46);
    expect(c.dueStatus).toBe("warning");
  });

  test("BR-SCO-11 past due -> overdue with negative days left", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    await challan("bo", scoId, [{ scoItemId: itemIds[0] as number, qty: 10 }], {
      challanDate: daysFromNow(-400),
    });
    const list = await call("bo", "GET", `/sco/${scoId}/challans`);
    const c = list.json.data[0];
    expect(c.daysLeft).toBeLessThan(0);
    expect(c.dueStatus).toBe("overdue");
  });

  test("BR-SCO-11 an overdue challan blocks nothing: a new challan to the same vendor is ok", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const id = itemIds[0] as number;
    const old = await challan("bo", scoId, [{ scoItemId: id, qty: 10 }], {
      challanDate: daysFromNow(-400),
    });
    expect(old.status).toBe(201);
    const fresh = await challan("bo", scoId, [{ scoItemId: id, qty: 10 }]);
    expect(fresh.status).toBe(201);
    const other = await makeSco(localVendorId, [{ rawItemId: raw }]);
    const onOtherSco = await challan("bo", other.scoId, [
      { scoItemId: other.itemIds[0] as number, qty: 10 },
    ]);
    expect(onOtherSco.status).toBe(201);
  });

  test("BR-SCO-11 the open-challans list filters by dueStatus and scoId", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const id = itemIds[0] as number;
    await challan("bo", scoId, [{ scoItemId: id, qty: 10 }], {
      challanDate: daysFromNow(-400),
    });
    await challan("bo", scoId, [{ scoItemId: id, qty: 10 }]);
    const overdue = await call(
      "bo",
      "GET",
      `/sco/challans/open?scoId=${scoId}&dueStatus=overdue`,
    );
    expect(overdue.status).toBe(200);
    expect(overdue.json.data).toHaveLength(1);
    expect(overdue.json.data[0].dueStatus).toBe("overdue");
    const all = await call("bo", "GET", `/sco/challans/open?scoId=${scoId}`);
    expect(all.json.data).toHaveLength(2);
    expect(all.json.meta.total).toBe(2);
  });
});

describe("BR-SCO-24 one transaction, lock, races", () => {
  test("BR-SCO-24 two challans at once for the last 400 -> one 201, one 409, issued exactly once", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const id = itemIds[0] as number;
    await challan("bo", scoId, [{ scoItemId: id, qty: 600 }], EWB);
    const [a, b] = await Promise.all([
      challan("bo", scoId, [{ scoItemId: id, qty: 400 }], EWB),
      challan("owner", scoId, [{ scoItemId: id, qty: 400 }], EWB),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const d = await scoDetails(scoId);
    expect(d.items[0].issuedQty).toBe(1000);
    expect(await challanCount(scoId)).toBe(2);
    expect(await issueRows(raw)).toHaveLength(4);
  });

  test("BR-SCO-24 two first challans for the full qty at once -> one 201, one 409", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw },
    ]);
    const id = itemIds[0] as number;
    const [a, b] = await Promise.all([
      challan("bo", scoId, [{ scoItemId: id, qty: 1000 }], EWB),
      challan("fs", scoId, [{ scoItemId: id, qty: 1000 }], EWB),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await challanCount(scoId)).toBe(1);
    expect(await issueRows(raw)).toHaveLength(2);
    expect((await scoDetails(scoId)).items[0].issuedQty).toBe(1000);
  });

  test("BR-SCO-24 a multi-line challan where line 2 is over qty -> 400 and line 1 is not posted", async () => {
    const rawA = await makeRaw({ stock: 5000 });
    const rawB = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: rawA, send: 500 },
      { rawItemId: rawB, send: 500 },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 100 },
      { scoItemId: itemIds[1] as number, qty: 501 },
    ]);
    expect(res.status).toBe(400);
    expect(await issueRows(rawA)).toHaveLength(0);
    expect(await issueRows(rawB)).toHaveLength(0);
    expect(await challanCount(scoId)).toBe(0);
    const d = await scoDetails(scoId);
    expect(d.sco.status).toBe("approved");
    for (const it of d.items) expect(it.issuedQty).toBe(0);
  });

  test("BR-SCO-24 a multi-line challan where line 2 is short of stock -> 409 and line 1 is rolled back", async () => {
    const rawA = await makeRaw({ stock: 5000 });
    const rawB = await makeRaw({ stock: 50 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: rawA, send: 500 },
      { rawItemId: rawB, send: 500 },
    ]);
    const before = await itemRow(rawA);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 100 },
      { scoItemId: itemIds[1] as number, qty: 100 },
    ]);
    expect(res.status).toBe(409);
    expect(await issueRows(rawA)).toHaveLength(0);
    expect(await issueRows(rawB)).toHaveLength(0);
    expect(await challanCount(scoId)).toBe(0);
    const d = await scoDetails(scoId);
    expect(d.sco.status).toBe("approved");
    for (const it of d.items) expect(it.issuedQty).toBe(0);
    expect((await itemRow(rawA)).currentStock).toBe(before.currentStock);
  });

  test("BR-SCO-24 a successful multi-line challan saves everything together", async () => {
    const rawA = await makeRaw({ stock: 5000 });
    const rawB = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: rawA, send: 500 },
      { rawItemId: rawB, send: 500 },
    ]);
    const res = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 100 },
      { scoItemId: itemIds[1] as number, qty: 200 },
    ]);
    expect(res.status).toBe(201);
    expect(await issueRows(rawA)).toHaveLength(2);
    expect(await issueRows(rawB)).toHaveLength(2);
    const d = await scoDetails(scoId);
    expect(d.sco.status).toBe("material_issued");
    expect(d.items.map((i) => i.issuedQty).sort()).toEqual([100, 200]);
    const lines = await db
      .select()
      .from(scoChallanLines)
      .where(eq(scoChallanLines.challanId, res.json.data.challan.id));
    expect(lines).toHaveLength(2);
    expect(res.json.data.challan.valuePaise).toBe(300 * 12_000);
  });
});

describe("BR-SCO-25 audit and traceability", () => {
  test("BR-SCO-25 ledger rows and challan record who, when and the heat number", async () => {
    const raw = await makeRaw({ stock: 5000 });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw, batch: "H-231" },
    ]);
    const res = await challan("fs", scoId, [
      { scoItemId: itemIds[0] as number, qty: 100 },
    ]);
    expect(res.status).toBe(201);
    const c = res.json.data.challan;
    expect(c.createdBy).toBe(actors.fs?.id);
    expect(c.createdAt).toBeTruthy();
    expect(res.json.data.lines[0].heatNumber).toBe("H-231");

    const rows = await issueRows(raw);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.createdBy).toBe(actors.fs?.id as number);
      expect(r.createdAt).toBeInstanceOf(Date);
      expect(Date.now() - r.createdAt.getTime()).toBeLessThan(60_000);
      expect(r.batchNumber).toBe("H-231");
      // the row points back at this challan or its SCO
      expect([c.id, scoId]).toContain(r.referenceId);
    }
  });

  test("BR-SCO-25 the challan line keeps the raw item, HSN and heat for tracing to the casting batch", async () => {
    const raw = await makeRaw({ stock: 5000, hsn: "7616" });
    const { scoId, itemIds } = await makeSco(localVendorId, [
      { rawItemId: raw, batch: "H-777" },
    ]);
    const created = await challan("bo", scoId, [
      { scoItemId: itemIds[0] as number, qty: 100 },
    ]);
    const res = await call(
      "bo",
      "GET",
      `/sco/challans/${created.json.data.challan.id}`,
    );
    const line = res.json.data.lines[0];
    expect(line.itemId).toBe(raw);
    expect(line.scoItemId).toBe(itemIds[0]);
    expect(line.heatNumber).toBe("H-777");
    expect(line.hsnCode).toBe("7616");
  });
});
