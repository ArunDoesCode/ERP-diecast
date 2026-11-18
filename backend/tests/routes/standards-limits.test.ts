/**
 * docs/specs/api-standards/spec.md (v1) "Input limits" and "Money limit"
 * BR-STD-13 text limits   BR-STD-14 GSTIN 15   BR-STD-15 password 128   BR-STD-16 money upper bound
 * BR-STD-17 quantity 1,000,000,000   BR-STD-18 GST slabs   BR-STD-19 limits checked before any write
 * BR-STD-33 list sizes    BR-STD-39 computed amounts above the money limit -> 400 AMOUNT_TOO_LARGE
 *
 * HTTP-level through createApp(), real DB. Fixture shortcut (not a production path): the PR is set to
 * `approved` straight on the row so a PO can be drafted from it. Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  authAuditLog,
  documentNumberCounters,
  roles,
} from "../../src/db/schemas/01_auth";
import { approvalPolicies } from "../../src/db/schemas/02_procurement-approval";
import {
  itemMaster,
  locations,
  serviceMaster,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  supplierItems,
  supplierMaster,
  supplierServices,
} from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { PERMISSION_KEYS } from "../../src/lib/permissions";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const RUN = Date.now();
const TAG = `TEST_stdlim_${RUN}`;
const EMAIL = `test_stdlim_${RUN}@diecast.test`;
const POLICY_NAME = `${TAG}_policy`;
const AMOUNT_MSG = "Amount is above the largest value allowed (₹10,000 crore).";

// biome-ignore lint/suspicious/noExplicitAny: loose JSON in test responses
type Json = any;
let actorId: number;
let token: string;
let pcsItemId: number;
let supplierId: number;
let vendorId: number;
let rawItemId: number;
let finishedItemId: number;
let serviceId: number;
const prIds: number[] = [];
const poIds: number[] = [];
const scoIds: number[] = [];

async function call(
  method: string,
  path: string,
  body?: unknown,
  withToken = true,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (withToken) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    json: (await res.json().catch(() => null)) as Json,
  };
}

let seq = 0;
const uid = () => `${TAG}_${++seq}`;
const sku = () => uid().slice(-40);

const itemBody = (over: Record<string, unknown> = {}) => ({
  sku: sku(),
  name: uid(),
  category: "Raw Material",
  uom: "kg",
  standardRatePaise: 100,
  ...over,
});

const prCount = async () =>
  (
    await db
      .select({ id: purchaseRequests.id })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.requestedBy, actorId))
  ).length;

async function mkPr(qty: number, itemId = pcsItemId) {
  const r = await call("POST", "/api/pr/createpr", {
    type: "misc",
    notes: `${TAG} pr`,
    items: [{ itemId, requestedQty: qty }],
  });
  if (r.status !== 201) throw new Error(`Fixture PR: ${r.status}`);
  const prId = r.json.data.pr.id as number;
  prIds.push(prId);
  await db
    .update(purchaseRequests)
    .set({ status: "approved" })
    .where(eq(purchaseRequests.id, prId));
  const [line] = await db
    .select({ id: purchaseRequestItems.id })
    .from(purchaseRequestItems)
    .where(eq(purchaseRequestItems.prId, prId));
  if (!line) throw new Error("Fixture PR line missing");
  return line.id;
}

async function createPo(qty: number, unitPricePaise: number, gstPercent = 0) {
  const prItemId = await mkPr(qty);
  const r = await call("POST", "/api/po/createpo", {
    supplierId,
    expectedDeliveryDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    lines: [{ prItemId, unitPricePaise, gstPercent }],
  });
  if (r.status === 201) poIds.push(r.json.data.po.id);
  return r;
}

const poCountForSupplier = async () =>
  (
    await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.supplierId, supplierId))
  ).length;

function scoPayload(qty: number, over: Record<string, unknown> = {}) {
  return {
    vendorId,
    expectedReturnDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    lines: [
      {
        rawItemId,
        finishedItemId,
        serviceId,
        rawQtyToIssue: qty,
        expectedReturnQty: 1000,
      },
    ],
    ...over,
  };
}

beforeAll(async () => {
  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"));
  if (!sa) throw new Error("Fixture setup: super-admin missing");
  const [e] = await db
    .insert(employees)
    .values({ name: TAG, email: EMAIL, roleId: sa.id, isActive: true })
    .returning({ id: employees.id });
  if (!e) throw new Error("Fixture setup: employee");
  actorId = e.id;
  token = await signAccessToken({
    userId: actorId,
    userName: TAG,
    role: "super-admin",
    allowedPages: [],
  });

  const mkItem = async (key: string, uom: string) => {
    const [i] = await db
      .insert(itemMaster)
      .values({
        sku: `${TAG}_${key}`,
        name: `${TAG}_${key}`,
        category: "Raw Material",
        uom,
        averageCostPaise: 100,
      })
      .returning({ id: itemMaster.id });
    if (!i) throw new Error(`Fixture item ${key}`);
    return i.id;
  };
  pcsItemId = await mkItem("pcs", "pcs");
  rawItemId = await mkItem("raw", "pcs");
  finishedItemId = await mkItem("fin", "pcs");

  const mkSup = async (
    key: string,
    type: "raw_material" | "service_provider",
  ) => {
    const [s] = await db
      .insert(supplierMaster)
      .values({
        name: `${TAG}_${key}`,
        type,
        defaultPaymentTermsDays: 30,
        isActive: true,
      })
      .returning({ id: supplierMaster.id });
    if (!s) throw new Error(`Fixture supplier ${key}`);
    return s.id;
  };
  supplierId = await mkSup("sup", "raw_material");
  vendorId = await mkSup("vendor", "service_provider");
  await db.insert(supplierItems).values({
    supplierId,
    itemId: pcsItemId,
    supplierUnitPricePaise: 1000,
    taxPercentage: 0,
    uom: "pcs",
  });
  const [svc] = await db
    .insert(serviceMaster)
    .values({
      code: `${TAG}_svc`,
      name: `${TAG}_svc`,
      defaultUom: "pcs",
      isActive: true,
    })
    .returning({ id: serviceMaster.id });
  if (!svc) throw new Error("Fixture service");
  serviceId = svc.id;
  await db.insert(supplierServices).values({
    supplierId: vendorId,
    serviceId,
    serviceUnitPricePaise: 2500,
    taxPercentage: 18,
  });
});

afterAll(async () => {
  const staleVendors = await db
    .select({ id: supplierMaster.id })
    .from(supplierMaster)
    .where(like(supplierMaster.name, "TEST_stdlim_%"));
  if (staleVendors.length) {
    const vids = staleVendors.map((v) => v.id);
    const scos = await db
      .select({ id: subcontractingOrders.id })
      .from(subcontractingOrders)
      .where(inArray(subcontractingOrders.vendorId, vids));
    scoIds.push(...scos.map((x) => x.id));
  }
  if (scoIds.length) {
    await db
      .delete(subcontractingOrderItems)
      .where(inArray(subcontractingOrderItems.scoId, scoIds));
    await db
      .delete(subcontractingOrders)
      .where(inArray(subcontractingOrders.id, scoIds));
  }
  // PRs created by tests that failed before recording their id still belong to this actor
  const strayPrs = await db
    .select({ id: purchaseRequests.id })
    .from(purchaseRequests)
    .where(eq(purchaseRequests.requestedBy, actorId));
  prIds.push(...strayPrs.map((p) => p.id).filter((id) => !prIds.includes(id)));
  const prItems = prIds.length
    ? await db
        .select({ id: purchaseRequestItems.id })
        .from(purchaseRequestItems)
        .where(inArray(purchaseRequestItems.prId, prIds))
    : [];
  if (prItems.length) {
    await db.delete(prPoItemLinks).where(
      inArray(
        prPoItemLinks.prItemId,
        prItems.map((i) => i.id),
      ),
    );
  }
  if (poIds.length) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, poIds));
  }
  if (poIds.length) {
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
  }
  if (prIds.length) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, prIds));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, prIds));
  }
  await db
    .delete(purchaseRequests)
    .where(eq(purchaseRequests.requestedBy, actorId))
    .catch(() => {});
  await db
    .delete(approvalPolicies)
    .where(like(approvalPolicies.name, "TEST_stdlim_%"));
  await db.delete(locations).where(like(locations.name, "TEST_stdlim_%"));
  await db
    .delete(supplierServices)
    .where(inArray(supplierServices.supplierId, [vendorId]));
  await db
    .delete(supplierItems)
    .where(inArray(supplierItems.supplierId, [supplierId, vendorId]));
  await db
    .delete(supplierMaster)
    .where(like(supplierMaster.name, "TEST_stdlim_%"));
  await db
    .delete(serviceMaster)
    .where(like(serviceMaster.code, "TEST_stdlim_%"));
  await db.delete(itemMaster).where(like(itemMaster.sku, "TEST_stdlim_%"));
  await db.delete(roles).where(like(roles.name, "TEST_stdlim_%"));
  const mine = await db
    .select({ id: employees.id })
    .from(employees)
    .where(like(employees.name, "TEST_stdlim_%"));
  const mineIds = mine.map((m) => m.id);
  if (mineIds.length) {
    await db
      .update(documentNumberCounters)
      .set({ createdBy: null })
      .where(inArray(documentNumberCounters.createdBy, mineIds));
    await db
      .update(documentNumberCounters)
      .set({ lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.lastUpdatedBy, mineIds));
    await db.delete(authAuditLog).where(inArray(authAuditLog.actorId, mineIds));
    await db
      .update(employees)
      .set({ createdBy: null, lastUpdatedBy: null })
      .where(inArray(employees.id, mineIds));
    await db.delete(employees).where(inArray(employees.id, mineIds));
  }
});

const itemRowsByName = async (name: string) =>
  db
    .select({ id: itemMaster.id })
    .from(itemMaster)
    .where(eq(itemMaster.name, name));

describe("BR-STD-13 every text field has a maximum; at the limit saves, one more is 400", () => {
  test("BR-STD-13 item name of 200 characters is saved whole", async () => {
    const name = `${TAG}_`.padEnd(200, "n");
    const r = await call("POST", "/api/asset/items", itemBody({ name }));
    expect(r.status).toBe(201);
    expect(r.json.data.name).toBe(name);
  });

  test("BR-STD-13 item name of 201 characters -> 400, no item row, nothing cut", async () => {
    const name = `${TAG}_`.padEnd(201, "q");
    const r = await call("POST", "/api/asset/items", itemBody({ name }));
    expect(r.status).toBe(400);
    expect((await itemRowsByName(name)).length).toBe(0);
    expect((await itemRowsByName(name.slice(0, 200))).length).toBe(0);
  });

  test("BR-STD-13 item sku 50 characters saves, 51 -> 400", async () => {
    const ok = await call(
      "POST",
      "/api/asset/items",
      itemBody({ sku: `${TAG}_`.padEnd(50, "k") }),
    );
    expect(ok.status).toBe(201);
    const bad = await call(
      "POST",
      "/api/asset/items",
      itemBody({ sku: `${TAG}_`.padEnd(51, "k") }),
    );
    expect(bad.status).toBe(400);
  });

  test("BR-STD-13 item description 1,000 characters saves, 1,001 -> 400", async () => {
    const ok = await call(
      "POST",
      "/api/asset/items",
      itemBody({ description: "d".repeat(1000) }),
    );
    expect(ok.status).toBe(201);
    const bad = await call(
      "POST",
      "/api/asset/items",
      itemBody({ description: "d".repeat(1001) }),
    );
    expect(bad.status).toBe(400);
  });

  test("BR-STD-13 location name 201 characters -> 400", async () => {
    const r = await call("POST", "/api/asset/locations", {
      name: `${TAG}_`.padEnd(201, "l"),
      type: "finished_goods",
    });
    expect(r.status).toBe(400);
  });

  test("BR-STD-13 role name 201 characters -> 400", async () => {
    const r = await call("POST", "/api/setup/roles", {
      name: `${TAG}_`.padEnd(201, "r"),
    });
    expect(r.status).toBe(400);
  });

  test("BR-STD-13 employee phone 31 characters -> 400", async () => {
    const r = await call("POST", "/api/setup/employees", {
      name: `${TAG}_phone`,
      roleId: 1,
      loginMethod: "qr",
      phone: "9".repeat(31),
    });
    expect(r.status).toBe(400);
  });

  test("BR-STD-13 a status list of 201 characters in a query -> 400 (PR list)", async () => {
    const status = Array.from({ length: 40 }, () => "draft").join(",");
    expect(status.length).toBeGreaterThan(200);
    const r = await call("GET", `/api/pr/getprs?status=${status}`);
    expect(r.status).toBe(400);
  });
});

describe("BR-STD-14 fixed-length fields", () => {
  test("BR-STD-14 GSTIN of 16 characters -> 400", async () => {
    const r = await call("POST", "/api/supplier/createSupplier", {
      name: `${TAG}_gstin16`,
      type: "raw_material",
      gstNumber: "27ABCDE1234F1Z5X",
      defaultPaymentTermsDays: 0,
    });
    expect(r.status).toBe(400);
  });
});

describe("BR-STD-15 password at most 128 characters", () => {
  test("BR-STD-15 login with a 129-character password -> 400", async () => {
    const r = await call(
      "POST",
      "/api/auth/login",
      { email: EMAIL, password: "p".repeat(129) },
      false,
    );
    expect(r.status).toBe(400);
  });

  test("BR-STD-15 employee create with a 129-character password -> 400", async () => {
    const r = await call("POST", "/api/setup/employees", {
      name: `${TAG}_pw`,
      roleId: 1,
      loginMethod: "password",
      email: `test_stdlim_pw_${RUN}@diecast.test`,
      password: "p".repeat(129),
    });
    expect(r.status).toBe(400);
  });
});

describe("BR-STD-16 money in a request has an upper bound", () => {
  test("BR-STD-16 PO line unitPricePaise 10000000000000 -> accepted", async () => {
    const r = await createPo(1, 10_000_000_000_000);
    expect(r.status).toBe(201);
  });

  test("BR-STD-16 PO line unitPricePaise 10000000000001 -> 400", async () => {
    const r = await createPo(1, 10_000_000_000_001);
    expect(r.status).toBe(400);
  });

  test("BR-STD-16 approval policy maxAmountPaise 1000000000001 -> 400", async () => {
    const r = await call("POST", "/api/approval/createPolicy", {
      name: POLICY_NAME,
      priority: 91000 + (RUN % 1000),
      docType: "pr",
      subDocType: "misc",
      approvalChain: [{ level: 1, approverType: "role", role: "owner" }],
      maxAmountPaise: 1_000_000_000_001,
    });
    expect(r.status).toBe(400);
  });

  test("BR-STD-16 item standardRatePaise 10000000000001 -> 400; 3000000000 (above 32-bit) is saved", async () => {
    const bad = await call(
      "POST",
      "/api/asset/items",
      itemBody({ standardRatePaise: 10_000_000_000_001 }),
    );
    expect(bad.status).toBe(400);
    const ok = await call(
      "POST",
      "/api/asset/items",
      itemBody({ standardRatePaise: 3_000_000_000 }),
    );
    expect(ok.status).toBe(201);
    expect(ok.json.data.standardRatePaise).toBe(3_000_000_000);
  });

  test("BR-STD-16 supplier price 3000000000 paise (above 32-bit) is saved, 10000000000001 -> 400", async () => {
    const [i] = await db
      .insert(itemMaster)
      .values({
        sku: `${TAG}_sp`,
        name: `${TAG}_sp`,
        category: "Raw Material",
        uom: "kg",
      })
      .returning({ id: itemMaster.id });
    if (!i) throw new Error("Fixture item");
    const bad = await call("POST", `/api/supplier/${supplierId}/createItem`, {
      itemId: i.id,
      supplierUnitPricePaise: 10_000_000_000_001,
      uom: "kg",
    });
    expect(bad.status).toBe(400);
    const ok = await call("POST", `/api/supplier/${supplierId}/createItem`, {
      itemId: i.id,
      supplierUnitPricePaise: 3_000_000_000,
      uom: "kg",
    });
    expect(ok.status).toBe(201);
  });
});

describe("BR-STD-17 quantity at most 1,000,000,000", () => {
  test("BR-STD-17 SCO create with send qty 1000 -> 201", async () => {
    const r = await call("POST", "/api/sco/createsco", scoPayload(1000));
    expect(r.status).toBe(201);
    scoIds.push(r.json.data.sco.id);
  });

  test("BR-STD-17 the same request with send qty 1000000001 -> 400, no SCO", async () => {
    const before = (
      await db
        .select({ id: subcontractingOrders.id })
        .from(subcontractingOrders)
        .where(eq(subcontractingOrders.vendorId, vendorId))
    ).length;
    const r = await call(
      "POST",
      "/api/sco/createsco",
      scoPayload(1_000_000_001),
    );
    expect(r.status).toBe(400);
    const after = (
      await db
        .select({ id: subcontractingOrders.id })
        .from(subcontractingOrders)
        .where(eq(subcontractingOrders.vendorId, vendorId))
    ).length;
    expect(after).toBe(before);
  });
});

describe("BR-STD-18 GST % stays the slab list", () => {
  test("BR-STD-18 supplier item taxPercentage 41 -> 400; 18 -> ok", async () => {
    const [i] = await db
      .insert(itemMaster)
      .values({
        sku: `${TAG}_gst`,
        name: `${TAG}_gst`,
        category: "Raw Material",
        uom: "kg",
      })
      .returning({ id: itemMaster.id });
    if (!i) throw new Error("Fixture item");
    const base = { itemId: i.id, supplierUnitPricePaise: 1000, uom: "kg" };
    const bad = await call("POST", `/api/supplier/${supplierId}/createItem`, {
      ...base,
      taxPercentage: 41,
    });
    expect(bad.status).toBe(400);
    const ok = await call("POST", `/api/supplier/${supplierId}/createItem`, {
      ...base,
      taxPercentage: 18,
    });
    expect(ok.status).toBe(201);
  });
});

describe("BR-STD-19 limits are checked before any write", () => {
  test("BR-STD-19 PR create with one 2,001-character note -> 400, no PR, no number used", async () => {
    const seqOf = (n: string) => Number(n.match(/(\d+)$/)?.[1]);
    const first = await call("POST", "/api/pr/createpr", {
      type: "misc",
      notes: `${TAG} before`,
      items: [{ itemId: pcsItemId, requestedQty: 1 }],
    });
    expect(first.status).toBe(201);
    prIds.push(first.json.data.pr.id);
    const rowsBefore = await prCount();
    const bad = await call("POST", "/api/pr/createpr", {
      type: "misc",
      notes: "x".repeat(2001),
      items: [{ itemId: pcsItemId, requestedQty: 1 }],
    });
    expect(bad.status).toBe(400);
    expect(await prCount()).toBe(rowsBefore);
    const next = await call("POST", "/api/pr/createpr", {
      type: "misc",
      notes: `${TAG} after`,
      items: [{ itemId: pcsItemId, requestedQty: 1 }],
    });
    expect(next.status).toBe(201);
    prIds.push(next.json.data.pr.id);
    expect(seqOf(next.json.data.pr.prNumber)).toBe(
      seqOf(first.json.data.pr.prNumber) + 1,
    );
  });
});

describe("BR-STD-33 every list in a request has a maximum size", () => {
  test("BR-STD-33 PR create with 501 lines -> 400, no PR", async () => {
    const before = await prCount();
    const items = Array.from({ length: 501 }, () => ({
      itemId: pcsItemId,
      requestedQty: 1,
    }));
    const r = await call("POST", "/api/pr/createpr", {
      type: "misc",
      notes: `${TAG} big`,
      items,
    });
    expect(r.status).toBe(400);
    expect(await prCount()).toBe(before);
  });

  test("BR-STD-33 PR create with 500 lines -> 201", async () => {
    await db.insert(itemMaster).values(
      Array.from({ length: 500 }, (_, i) => ({
        sku: `${TAG}_bulk${i}`,
        name: `${TAG}_bulk${i}`,
        category: "Raw Material" as const,
        uom: "kg" as const,
      })),
    );
    const rows = await db
      .select({ id: itemMaster.id })
      .from(itemMaster)
      .where(like(itemMaster.sku, `${TAG}_bulk%`));
    expect(rows.length).toBe(500);
    const r = await call("POST", "/api/pr/createpr", {
      type: "misc",
      notes: `${TAG} 500`,
      items: rows.map((x) => ({ itemId: x.id, requestedQty: 1 })),
    });
    expect(r.status).toBe(201);
    prIds.push(r.json.data.pr.id);
  });

  test("BR-STD-33 role grants diff with 1,001 permission keys -> 400", async () => {
    const [role] = await db
      .insert(roles)
      .values({ name: `${TAG}_grants`, isSystem: false })
      .returning({ id: roles.id });
    if (!role) throw new Error("Fixture role");
    const keys = Array.from(
      { length: 1001 },
      () => PERMISSION_KEYS[0] as string,
    );
    const r = await call("POST", `/api/setup/roles/${role.id}/grants`, {
      added: keys,
      removed: [],
    });
    expect(r.status).toBe(400);
  });
});

describe("BR-STD-39 computed amounts above the money limit", () => {
  test("BR-STD-39 3 pcs at Rs 1,00,00,000.00 each, GST 0% -> 201, total 3000000000 paise", async () => {
    const r = await createPo(3, 1_000_000_000, 0);
    expect(r.status).toBe(201);
    expect(r.json.data.po.totalAmountPaise).toBe(3_000_000_000);
  });

  test("BR-STD-39 PO whose computed total is above 10,000 crore -> 400 AMOUNT_TOO_LARGE, no PO", async () => {
    const before = await poCountForSupplier();
    const r = await createPo(2, 10_000_000_000_000, 0);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("AMOUNT_TOO_LARGE");
    expect(r.json.message).toBe(AMOUNT_MSG);
    expect(await poCountForSupplier()).toBe(before);
  });

  test("BR-STD-39 a line tax that pushes the total over the limit -> 400 AMOUNT_TOO_LARGE", async () => {
    const r = await createPo(1, 10_000_000_000_000, 18);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("AMOUNT_TOO_LARGE");
  });
});
