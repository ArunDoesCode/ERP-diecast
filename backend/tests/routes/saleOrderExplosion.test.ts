/**
 * HTTP-level tests for the BOM explosion of a sale order and the draft PR / SCO
 * creation: BR-SO-09, 14, 16, 17, 19, 20, 21..47, 50, 51, 52, 53, 60, 62.
 * Spec: docs/specs/sale-order/spec.md v1 (example data from its Summary).
 * Fixtures are TEST_soe_ prefixed and removed in afterAll.
 * Not covered here: BR-SO-28 (loops can't be built through the BOM API),
 * BR-SO-32 (needs a dated PO), dispatch hooks BR-SO-54, 55, 58 (service hooks,
 * not routes), BR-SO-49 (screens).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  documentNumberCounters,
  rolePermissions,
  roles,
} from "../../src/db/schemas/01_auth";
import {
  bomHistory,
  bomLines,
  bomPartSeq,
  boms,
} from "../../src/db/schemas/02_procurement-bom";
import {
  inventoryLedger,
  itemMaster,
  locations,
  serviceMaster,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  purchaseRequestItems,
  purchaseRequests,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  supplierMaster,
  supplierServices,
} from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import {
  customers,
  saleExplosionRows,
  saleExplosionSources,
  saleExplosions,
  saleOrderLines,
  saleOrders,
  saleReservations,
  salesAuditLog,
} from "../../src/db/schemas/05_sales";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const RUN = `TEST_soe_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;
const EMAIL_PREFIX = "test_soe_";

type Actor = { id: number; token: string; name: string };
const actors: Record<string, Actor> = {};
const customerIds: number[] = [];
const itemIds: number[] = [];
const partIds: number[] = [];
const soIds: number[] = [];
const prIds: number[] = [];
const scoIds: number[] = [];
const roleIds: number[] = [];
const vendorIds: number[] = [];
const serviceIds: number[] = [];

function must<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`Fixture setup: ${what} returned no row`);
  return row;
}

function istDay(offsetDays = 0): string {
  const ms = Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function actorWithRoleId(key: string, roleId: number, roleName: string) {
  const name = `${RUN}_${key}`;
  const [emp] = await db
    .insert(employees)
    .values({
      name,
      email: `${EMAIL_PREFIX}${Date.now()}_${key}@diecast.test`,
      roleId,
      isActive: true,
    })
    .returning({ id: employees.id });
  const id = must(emp, key).id;
  const token = await signAccessToken({
    userId: id,
    userName: name,
    role: roleName,
    allowedPages: [],
  });
  actors[key] = { id, token, name };
}

async function makeActor(key: string, roleName: string) {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  await actorWithRoleId(key, must(role, roleName).id, roleName);
}

async function makeCustomRole(key: string, keys: string[]) {
  const [r] = await db
    .insert(roles)
    .values({ name: `${RUN}_role_${key}` })
    .returning({ id: roles.id });
  const roleId = must(r, "role").id;
  roleIds.push(roleId);
  await db
    .insert(rolePermissions)
    .values(keys.map((permissionKey) => ({ roleId, permissionKey })));
  await actorWithRoleId(key, roleId, `${RUN}_role_${key}`);
}

async function raw(
  actor: string | null,
  method: string,
  fullPath: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (actor) headers.Authorization = `Bearer ${actors[actor]?.token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(fullPath, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}
const call = (
  actor: string | null,
  method: string,
  path: string,
  body?: unknown,
) => raw(actor, method, `/api/sale-orders${path}`, body);

// ---------------------------------------------------------------- fixtures
let vendorId: number; // job worker with the service
let otherVendorId: number; // active, but without the service
let serviceId: number;
let fgLocationId: number;
let scrapLocationId: number;

async function mkItem(
  opts: { uom?: string; part?: boolean; isActive?: boolean } = {},
) {
  const sku = uid();
  const [row] = await db
    .insert(itemMaster)
    .values({
      sku,
      name: sku,
      category: opts.part ? "Manufactured part" : "Raw Material",
      uom: opts.uom ?? "pcs",
      isActive: opts.isActive ?? true,
    })
    .returning({ id: itemMaster.id, sku: itemMaster.sku });
  const r = must(row, "item");
  itemIds.push(r.id);
  if (opts.part) partIds.push(r.id);
  return r;
}

async function bomCreate(body: Record<string, unknown>) {
  const res = await raw("bo", "POST", "/api/bom", body);
  expect(res.status).toBe(201);
  const id = res.json.data.id as number;
  const d = await raw("owner", "GET", `/api/bom/${id}`);
  const rel = await raw("owner", "POST", `/api/bom/${id}/release`, {
    version: d.json.data.version,
  });
  expect(rel.status).toBe(200);
  return id;
}

type Tree = {
  mc: { id: number; sku: string };
  rc: { id: number; sku: string };
  adc: { id: number; sku: string };
  bush: { id: number; sku: string };
};

/** The spec's example: HSG-MC (job work) -> HSG-RC (casting) -> ADC12, BUSH-M6. */
async function tree(): Promise<Tree> {
  const adc = await mkItem({ uom: "kg" });
  const bush = await mkItem();
  const rc = await mkItem({ part: true });
  const mc = await mkItem({ part: true });
  await bomCreate({
    partId: rc.id,
    kind: "casting",
    casting: {
      alloyItemId: adc.id,
      netWeightKg: 0.85,
      shotWeightKg: 2,
      cavities: 2,
      meltLossPct: 3,
      castingRejectPct: 5,
    },
    lines: [{ componentItemId: bush.id, qtyPerPiece: 2, buyAsIs: false }],
  });
  await bomCreate({
    partId: mc.id,
    kind: "job_work",
    jobWork: {
      sentItemId: rc.id,
      sendQty: 1,
      returnQty: 1,
      jobWorkerId: vendorId,
      serviceId,
      jobWorkLossPct: 2,
    },
  });
  return { mc, rc, adc, bush };
}

async function stock(itemId: number, qty: number, locationId = fgLocationId) {
  const r = await raw("owner", "POST", "/api/asset/inventory/movements", {
    itemId,
    locationId,
    referenceType: "opening_stock",
    qty,
    unitCostPaise: 10000,
    reason: "test opening",
  });
  expect(r.status).toBe(201);
}

async function ledgerSum(itemId: number): Promise<number> {
  const [r] = await db
    .select({
      s: sql<number>`coalesce(sum(${inventoryLedger.quantityChange}),0)`,
    })
    .from(inventoryLedger)
    .where(eq(inventoryLedger.itemId, itemId));
  return Number(r?.s ?? 0);
}

async function mkCustomer() {
  const res = await raw("bo", "POST", "/api/customers", {
    name: uid(),
    stateCode: "33",
    address: "Plot 4, Hosur",
  });
  expect(res.status).toBe(201);
  customerIds.push(res.json.data.id);
  return res.json.data.id as number;
}

type LineIn = {
  itemId: number;
  qty: number;
  deliveryDate?: string;
  unitPricePaise?: number;
};
const soLine = (l: LineIn) => ({
  unitPricePaise: 18500,
  gstPercent: 18,
  deliveryDate: istDay(30),
  ...l,
});

let sharedCustomer: number;

async function mkConfirmedSo(lines: LineIn[]) {
  const res = await call("bo", "POST", "", {
    customerId: sharedCustomer,
    orderDate: istDay(0),
    lines: lines.map(soLine),
  });
  expect(res.status).toBe(201);
  const id = res.json.data.id as number;
  soIds.push(id);
  const c = await call("bo", "POST", `/${id}/confirm`, {
    editVersion: res.json.data.editVersion,
  });
  expect(c.status).toBe(200);
  return detail(id);
}

async function detail(id: number) {
  const r = await call("owner", "GET", `/${id}`);
  return r.json.data;
}

async function act(
  id: number,
  action: string,
  extra: Record<string, unknown> = {},
) {
  const d = await detail(id);
  return call("bo", "POST", `/${id}/${action}`, {
    editVersion: d.editVersion,
    ...extra,
  });
}

async function patchSo(id: number, body: Record<string, unknown>) {
  const d = await detail(id);
  return call("bo", "PATCH", `/${id}`, { editVersion: d.editVersion, ...body });
}

const explode = (soId: number, actor = "bo") =>
  call(actor, "POST", `/${soId}/explosions`, {});

async function mustExplode(soId: number) {
  const r = await explode(soId);
  expect(r.status).toBe(201);
  return r.json.data as { id: number; runNo: number; number: string };
}

type Row = {
  id: number;
  itemId: number;
  level: number;
  type: string;
  tag: string | null;
  blockReason: string | null;
  grossQty: number;
  onHandQty: number;
  reservedOtherQty: number;
  freeQty: number;
  openPrQty: number;
  openPoQty: number;
  openScoQty: number;
  netQty: number;
  pourQty: number | null;
  sendQty: number | null;
  pastDue: boolean;
  selectable: boolean;
  raised: { type: string; docId: number } | null;
  sources: { soLineId: number; lineNo: number; qty: number }[];
  jobWorker: {
    defaultVendorId: number | null;
    candidates: { vendorId: number; name: string }[];
  } | null;
};

async function rowsOf(soId: number, eid: number, actor = "bo"): Promise<Row[]> {
  const r = await call(
    actor,
    "GET",
    `/${soId}/explosions/${eid}/rows?pageSize=100`,
  );
  expect(r.status).toBe(200);
  return r.json.data;
}
const rowFor = (rows: Row[], itemId: number) =>
  must(
    rows.find((r) => r.itemId === itemId),
    `row for item ${itemId}`,
  );

const drafts = (
  soId: number,
  eid: number,
  rows: {
    rowId: number;
    qty: number;
    vendorId?: number;
    expectedReturnDate?: string;
  }[],
  actor = "bo",
) => call(actor, "POST", `/${soId}/explosions/${eid}/drafts`, { rows });

// biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
function track(res: { status: number; json: any }) {
  if (res.status === 201) {
    for (const p of res.json.data.prs) prIds.push(p.id);
    for (const s of res.json.data.scos) scoIds.push(s.id);
  }
  return res;
}

async function prCountForSo(soId: number) {
  const r = await db
    .select({ id: purchaseRequests.id })
    .from(purchaseRequests)
    .where(eq(purchaseRequests.saleOrderId, soId));
  for (const x of r) prIds.push(x.id);
  return r.length;
}

function keysDeep(o: unknown, out: string[] = []): string[] {
  if (Array.isArray(o)) {
    for (const x of o) keysDeep(x, out);
  } else if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  return out;
}

/** Explode the spec example: HSG-MC 1000, HSG-RC 200 free, BUSH 500 free. */
async function exampleSo() {
  const t = await tree();
  await stock(t.rc.id, 200);
  await stock(t.bush.id, 500);
  const so = await mkConfirmedSo([{ itemId: t.mc.id, qty: 1000 }]);
  const ex = await mustExplode(so.id);
  const rows = await rowsOf(so.id, ex.id);
  return { t, so, ex, rows };
}

beforeAll(async () => {
  await makeActor("owner", "owner");
  await makeActor("bo", "back_office");
  await makeActor("fs", "floor_supervisor");
  await makeCustomRole("viewer", ["so.view"]);
  await makeCustomRole("prOnly", ["so.view", "so.explode", "pr.manage"]);
  await makeCustomRole("scoOnly", ["so.view", "so.explode", "sco.manage"]);
  await makeCustomRole("explodeOnly", ["so.view", "so.explode"]);

  const mkVendor = async () => {
    const [v] = await db
      .insert(supplierMaster)
      .values({ name: uid(), type: "service_provider", isActive: true })
      .returning({ id: supplierMaster.id });
    const id = must(v, "vendor").id;
    vendorIds.push(id);
    return id;
  };
  vendorId = await mkVendor();
  otherVendorId = await mkVendor();
  const [s] = await db
    .insert(serviceMaster)
    .values({ code: uid(), name: uid(), defaultUom: "pcs", isActive: true })
    .returning({ id: serviceMaster.id });
  serviceId = must(s, "service").id;
  serviceIds.push(serviceId);
  await db.insert(supplierServices).values({
    supplierId: vendorId,
    serviceId,
    serviceUnitPricePaise: 2500,
    taxPercentage: 18,
  });

  const mkLoc = async (type: string) => {
    const r = await raw("bo", "POST", "/api/asset/locations", {
      name: uid(),
      type,
    });
    expect(r.status).toBe(201);
    return r.json.data.id as number;
  };
  fgLocationId = await mkLoc("finished_goods");
  scrapLocationId = await mkLoc("scrap_yard");
  sharedCustomer = await mkCustomer();
});

afterAll(async () => {
  if (soIds.length > 0) {
    await db
      .delete(saleReservations)
      .where(inArray(saleReservations.soId, soIds));
    const exps = await db
      .select({ id: saleExplosions.id })
      .from(saleExplosions)
      .where(inArray(saleExplosions.soId, soIds));
    const eids = exps.map((e) => e.id);
    if (eids.length > 0) {
      const rws = await db
        .select({ id: saleExplosionRows.id })
        .from(saleExplosionRows)
        .where(inArray(saleExplosionRows.explosionId, eids));
      const rids = rws.map((r) => r.id);
      if (rids.length > 0) {
        await db
          .delete(saleReservations)
          .where(inArray(saleReservations.rowId, rids));
        await db
          .delete(saleExplosionSources)
          .where(inArray(saleExplosionSources.rowId, rids));
        await db
          .delete(saleExplosionRows)
          .where(inArray(saleExplosionRows.id, rids));
      }
      await db.delete(saleExplosions).where(inArray(saleExplosions.id, eids));
    }
    await db.delete(salesAuditLog).where(inArray(salesAuditLog.soId, soIds));
  }
  if (prIds.length > 0) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, prIds));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, prIds));
  }
  if (scoIds.length > 0) {
    await db
      .delete(subcontractingOrderItems)
      .where(inArray(subcontractingOrderItems.scoId, scoIds));
    await db
      .delete(subcontractingOrders)
      .where(inArray(subcontractingOrders.id, scoIds));
  }
  if (soIds.length > 0) {
    await db.delete(saleOrderLines).where(inArray(saleOrderLines.soId, soIds));
    await db.delete(saleOrders).where(inArray(saleOrders.id, soIds));
  }
  if (customerIds.length > 0) {
    await db
      .delete(salesAuditLog)
      .where(
        and(
          eq(salesAuditLog.targetType, "customer"),
          inArray(salesAuditLog.targetId, customerIds),
        ),
      );
    await db.delete(customers).where(inArray(customers.id, customerIds));
  }
  if (itemIds.length > 0)
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, itemIds));
  if (partIds.length > 0) {
    const bomRows = await db
      .select({ id: boms.id })
      .from(boms)
      .where(inArray(boms.partId, partIds));
    const bomIds = bomRows.map((b) => b.id);
    await db.delete(bomHistory).where(inArray(bomHistory.partId, partIds));
    if (bomIds.length > 0)
      await db.delete(bomLines).where(inArray(bomLines.bomId, bomIds));
    await db.delete(boms).where(inArray(boms.partId, partIds));
    await db.delete(bomPartSeq).where(inArray(bomPartSeq.partId, partIds));
  }
  if (vendorIds.length > 0) {
    await db
      .delete(supplierServices)
      .where(inArray(supplierServices.supplierId, vendorIds));
    await db
      .delete(supplierMaster)
      .where(inArray(supplierMaster.id, vendorIds));
  }
  if (serviceIds.length > 0)
    await db.delete(serviceMaster).where(inArray(serviceMaster.id, serviceIds));
  if (itemIds.length > 0)
    await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
  await db.delete(locations).where(like(locations.name, `${RUN}%`));
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
    await db.delete(employees).where(inArray(employees.id, empIds));
  }
  if (roleIds.length > 0)
    await db.delete(roles).where(inArray(roles.id, roleIds));
});

// ================================================================ BR-SO-21
describe("BR-SO-21 running an explosion", () => {
  test("BR-SO-21 a draft SO cannot be exploded -> 409 SO_NOT_CONFIRMED", async () => {
    const t = await tree();
    const res = await call("bo", "POST", "", {
      customerId: sharedCustomer,
      orderDate: istDay(0),
      lines: [soLine({ itemId: t.mc.id, qty: 10 })],
    });
    soIds.push(res.json.data.id);
    const r = await explode(res.json.data.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("SO_NOT_CONFIRMED");
  });

  test("BR-SO-21 numbered snapshots: first run E1, second E2", async () => {
    const t = await tree();
    const so = await mkConfirmedSo([{ itemId: t.mc.id, qty: 10 }]);
    const e1 = await mustExplode(so.id);
    const e2 = await mustExplode(so.id);
    expect(e1.number).toBe(`${so.soNumber}/E1`);
    expect(e2.number).toBe(`${so.soNumber}/E2`);
    expect(e1.runNo).toBe(1);
    expect(e2.runNo).toBe(2);
  });

  test("BR-SO-21 header shows who ran it, when, and the BOM revision used per item", async () => {
    const { t, so, ex } = await exampleSo();
    const h = await call("bo", "GET", `/${so.id}/explosions/${ex.id}`);
    expect(h.status).toBe(200);
    expect(h.json.data.createdBy).toBe(actors.bo?.id as number);
    expect(h.json.data.createdByName).toBe(actors.bo?.name as string);
    expect(h.json.data.createdAt).toBeTruthy();
    expect(h.json.data.status).toBe("current");
    const revs = h.json.data.bomRevisions as {
      partSku: string;
      revision: string;
    }[];
    expect(revs.find((r) => r.partSku === t.mc.sku)?.revision).toBe("A");
    expect(revs.find((r) => r.partSku === t.rc.sku)?.revision).toBe("A");
  });

  test("BR-SO-21 needs so.explode: floor supervisor, so.view-only and no login are refused", async () => {
    const t = await tree();
    const so = await mkConfirmedSo([{ itemId: t.mc.id, qty: 10 }]);
    expect((await explode(so.id, "fs")).status).toBe(403);
    const v = await explode(so.id, "viewer");
    expect(v.status).toBe(403);
    expect(v.json.code).toBe("PERMISSION_DENIED");
    expect((await call(null, "POST", `/${so.id}/explosions`, {})).status).toBe(
      401,
    );
  });

  test("BR-SO-21 so.view reads the list, header and rows of explosions", async () => {
    const { so, ex } = await exampleSo();
    expect((await call("viewer", "GET", `/${so.id}/explosions`)).status).toBe(
      200,
    );
    expect(
      (await call("viewer", "GET", `/${so.id}/explosions/${ex.id}`)).status,
    ).toBe(200);
    expect(
      (await call("viewer", "GET", `/${so.id}/explosions/${ex.id}/rows`))
        .status,
    ).toBe(200);
    expect((await call("fs", "GET", `/${so.id}/explosions`)).status).toBe(403);
  });

  test("BR-SO-21 a snapshot id that belongs to another SO -> 404", async () => {
    const a = await exampleSo();
    const b = await exampleSo();
    expect(
      (await call("bo", "GET", `/${a.so.id}/explosions/${b.ex.id}`)).status,
    ).toBe(404);
    expect(
      (await call("bo", "GET", `/${a.so.id}/explosions/${b.ex.id}/rows`))
        .status,
    ).toBe(404);
  });

  test("BR-SO-16 on-hold SO cannot be exploded, nor used for drafts -> 409", async () => {
    const { t, so, ex, rows } = await exampleSo();
    await act(so.id, "hold", { reason: "credit check" });
    expect((await explode(so.id)).status).toBe(409);
    const buy = rowFor(rows, t.bush.id);
    expect(
      (await drafts(so.id, ex.id, [{ rowId: buy.id, qty: 1 }])).status,
    ).toBe(409);
  });

  test("BR-SO-21 closed and cancelled SOs cannot be exploded -> 409", async () => {
    const t = await tree();
    const a = await mkConfirmedSo([{ itemId: t.mc.id, qty: 10 }]);
    await act(a.id, "close", { reason: "done by hand" });
    expect((await explode(a.id)).status).toBe(409);
    const b = await mkConfirmedSo([{ itemId: t.mc.id, qty: 10 }]);
    await act(b.id, "cancel", { reason: "withdrawn" });
    expect((await explode(b.id)).status).toBe(409);
  });
});

// ================================================================ BR-SO-22..24, 29
describe("BR-SO-22..24, 29 walk and quantities (spec example)", () => {
  test("BR-SO-22 each row gets a type: job work, cast, buy", async () => {
    const { t, rows } = await exampleSo();
    expect(rowFor(rows, t.mc.id).type).toBe("job_work");
    expect(rowFor(rows, t.rc.id).type).toBe("cast");
    expect(rowFor(rows, t.adc.id).type).toBe("buy");
    expect(rowFor(rows, t.bush.id).type).toBe("buy");
  });

  test("BR-SO-22 levels run top down: job-work part < casting < bought items", async () => {
    const { t, rows } = await exampleSo();
    const mc = rowFor(rows, t.mc.id).level;
    const rc = rowFor(rows, t.rc.id).level;
    expect(mc).toBeLessThan(rc);
    expect(rc).toBeLessThan(rowFor(rows, t.adc.id).level);
    expect(rc).toBeLessThan(rowFor(rows, t.bush.id).level);
  });

  test("BR-SO-23 HSG-MC net 1000 -> send 1021 HSG-RC", async () => {
    const { t, rows } = await exampleSo();
    const mc = rowFor(rows, t.mc.id);
    expect(mc.grossQty).toBe(1000);
    expect(mc.netQty).toBe(1000);
    expect(mc.sendQty).toBe(1021);
  });

  test("BR-SO-23/29 HSG-RC gross 1021, free 200 -> net 821 -> pour 865", async () => {
    const { t, rows } = await exampleSo();
    const rc = rowFor(rows, t.rc.id);
    expect(rc.grossQty).toBe(1021);
    expect(rc.freeQty).toBe(200);
    expect(rc.netQty).toBe(821);
    expect(rc.pourQty).toBe(865);
  });

  test("BR-SO-24/29 below the casting: ADC12 and BUSH-M6 come from net 821 (pour 865), not 1021", async () => {
    const { t, rows } = await exampleSo();
    expect(rowFor(rows, t.adc.id).grossQty).toBeCloseTo(723.8, 3);
    expect(rowFor(rows, t.bush.id).grossQty).toBe(1730);
  });

  test("BR-SO-29 BUSH-M6 gross 1730, free 500 -> net 1230", async () => {
    const { t, rows } = await exampleSo();
    const b = rowFor(rows, t.bush.id);
    expect(b.freeQty).toBe(500);
    expect(b.netQty).toBe(1230);
  });

  test("BR-SO-29 ADC12 with no stock and no supply: net = gross", async () => {
    const { t, rows } = await exampleSo();
    const a = rowFor(rows, t.adc.id);
    expect(a.netQty).toBeCloseTo(723.8, 3);
  });

  test("BR-SO-29 net never goes below 0 when free stock exceeds the need", async () => {
    const t = await tree();
    await stock(t.mc.id, 5000);
    const so = await mkConfirmedSo([{ itemId: t.mc.id, qty: 100 }]);
    const ex = await mustExplode(so.id);
    const rows = await rowsOf(so.id, ex.id);
    expect(rowFor(rows, t.mc.id).netQty).toBe(0);
    const rc = rows.find((r) => r.itemId === t.rc.id);
    if (rc) expect(rc.netQty).toBe(0);
  });

  test("BR-SO-44 cast rows show qty to make and pour qty but are not selectable", async () => {
    const { t, rows } = await exampleSo();
    const rc = rowFor(rows, t.rc.id);
    expect(rc.selectable).toBe(false);
    expect(rc.pourQty).toBe(865);
  });
});

// ================================================================ BR-SO-25, 26, 27
describe("BR-SO-25..27 merging, missing BOM, inactive item", () => {
  test("BR-SO-25 an item needed twice is one row, gross summed, netted once, two sources", async () => {
    const t = await tree();
    await stock(t.rc.id, 200);
    const so = await mkConfirmedSo([
      { itemId: t.mc.id, qty: 1000 },
      { itemId: t.rc.id, qty: 400 },
    ]);
    const ex = await mustExplode(so.id);
    const rows = await rowsOf(so.id, ex.id);
    expect(rows.filter((r) => r.itemId === t.rc.id)).toHaveLength(1);
    const rc = rowFor(rows, t.rc.id);
    expect(rc.grossQty).toBe(1421);
    expect(rc.freeQty).toBe(200);
    expect(rc.netQty).toBe(1221);
    expect(rc.sources).toHaveLength(2);
    expect(rc.level).toBeGreaterThan(rowFor(rows, t.mc.id).level);
  });

  test("BR-SO-26 a line item with no active BOM is flagged, not selectable, others still explode", async () => {
    const t = await tree();
    const noBom = await mkItem({ part: true });
    const so = await mkConfirmedSo([
      { itemId: t.mc.id, qty: 100 },
      { itemId: noBom.id, qty: 10 },
    ]);
    const ex = await mustExplode(so.id);
    expect(ex.id).toBeGreaterThan(0);
    const rows = await rowsOf(so.id, ex.id);
    const flagged = rowFor(rows, noBom.id);
    expect(flagged.blockReason).toBe("no_active_bom");
    expect(flagged.selectable).toBe(false);
    expect(rowFor(rows, t.mc.id).netQty).toBe(100);
    const h = await call("bo", "GET", `/${so.id}/explosions/${ex.id}`);
    expect(h.json.data.totals.flaggedCount).toBeGreaterThanOrEqual(1);
    const pick = await drafts(so.id, ex.id, [{ rowId: flagged.id, qty: 1 }]);
    expect(pick.status).toBe(400);
  });

  test("BR-SO-26 below the top level, an item without a BOM is a buy row tagged no_bom", async () => {
    const { t, rows } = await exampleSo();
    const b = rowFor(rows, t.bush.id);
    expect(b.type).toBe("buy");
    expect(b.tag).toBe("no_bom");
    expect(b.selectable).toBe(true);
  });

  test("BR-SO-27 an inactive item is flagged 'inactive_item' and cannot be raised", async () => {
    const t = await tree();
    await db
      .update(itemMaster)
      .set({ isActive: false })
      .where(eq(itemMaster.id, t.bush.id));
    const so = await mkConfirmedSo([{ itemId: t.mc.id, qty: 100 }]);
    const ex = await mustExplode(so.id);
    const rows = await rowsOf(so.id, ex.id);
    const b = rowFor(rows, t.bush.id);
    expect(b.blockReason).toBe("inactive_item");
    expect(b.selectable).toBe(false);
    const pick = await drafts(so.id, ex.id, [{ rowId: b.id, qty: 1 }]);
    expect(pick.status).toBe(400);
  });

  test("BR-SO-09 the explosion uses open qty (qty - delivered)", async () => {
    const t = await tree();
    const so = await mkConfirmedSo([{ itemId: t.mc.id, qty: 1000 }]);
    await db
      .update(saleOrderLines)
      .set({ deliveredQty: "600" })
      .where(eq(saleOrderLines.soId, so.id));
    const ex = await mustExplode(so.id);
    const rows = await rowsOf(so.id, ex.id);
    expect(rowFor(rows, t.mc.id).grossQty).toBe(400);
    expect(rowFor(rows, t.mc.id).netQty).toBe(400);
  });

  test("BR-SO-60 a removed line is left out of the explosion", async () => {
    const t = await tree();
    const so = await mkConfirmedSo([
      { itemId: t.mc.id, qty: 1000 },
      { itemId: t.rc.id, qty: 400 },
    ]);
    const spare = so.lines.find(
      (l: { itemId: number }) => l.itemId === t.rc.id,
    );
    const rm = await patchSo(so.id, { removeLineIds: [spare.id] });
    expect(rm.status).toBe(200);
    const ex = await mustExplode(so.id);
    const rows = await rowsOf(so.id, ex.id);
    expect(rowFor(rows, t.rc.id).grossQty).toBe(1021);
    expect(rowFor(rows, t.rc.id).sources).toHaveLength(1);
  });
});

// ================================================================ BR-SO-30..35
describe("BR-SO-30..35 free stock, supply, reservations", () => {
  test("BR-SO-30 scrap yard stock is not free", async () => {
    const t = await tree();
    await stock(t.bush.id, 100);
    await stock(t.bush.id, 300, scrapLocationId);
    const so = await mkConfirmedSo([{ itemId: t.rc.id, qty: 100 }]);
    const ex = await mustExplode(so.id);
    const b = rowFor(await rowsOf(so.id, ex.id), t.bush.id);
    expect(b.freeQty).toBe(100);
  });

  test("BR-SO-31 a draft PR line counts as open PR supply (shown in its own column)", async () => {
    const t = await tree();
    const pr = await raw("bo", "POST", "/api/pr/createpr", {
      type: "misc",
      notes: "hand PR for alloy",
      items: [{ itemId: t.adc.id, requestedQty: 200 }],
    });
    expect(pr.status).toBe(201);
    prIds.push(pr.json.data.pr.id);
    const so = await mkConfirmedSo([{ itemId: t.mc.id, qty: 1000 }]);
    const ex = await mustExplode(so.id);
    const a = rowFor(await rowsOf(so.id, ex.id), t.adc.id);
    expect(a.openPrQty).toBe(200);
    expect(a.openPoQty).toBe(0);
    expect(a.openScoQty).toBe(0);
    expect(a.netQty).toBeCloseTo(723.8 - 200 - a.freeQty, 3);
  });

  test("BR-SO-31 a cancelled PR is not supply", async () => {
    const t = await tree();
    const pr = await raw("bo", "POST", "/api/pr/createpr", {
      type: "misc",
      notes: "hand PR for alloy",
      items: [{ itemId: t.adc.id, requestedQty: 200 }],
    });
    prIds.push(pr.json.data.pr.id);
    await db
      .update(purchaseRequests)
      .set({ status: "cancelled" })
      .where(eq(purchaseRequests.id, pr.json.data.pr.id));
    const so = await mkConfirmedSo([{ itemId: t.mc.id, qty: 1000 }]);
    const ex = await mustExplode(so.id);
    expect(rowFor(await rowsOf(so.id, ex.id), t.adc.id).openPrQty).toBe(0);
  });

  test("BR-SO-34 the order exploded first keeps the free stock, the next sees only what is left", async () => {
    const t = await tree();
    await stock(t.adc.id, 100);
    const a = await mkConfirmedSo([{ itemId: t.rc.id, qty: 1000 }]);
    const b = await mkConfirmedSo([{ itemId: t.rc.id, qty: 1000 }]);
    const ea = await mustExplode(a.id);
    const ra = rowFor(await rowsOf(a.id, ea.id), t.adc.id);
    expect(ra.freeQty).toBe(100);
    const eb = await mustExplode(b.id);
    const rb = rowFor(await rowsOf(b.id, eb.id), t.adc.id);
    expect(rb.reservedOtherQty).toBe(100);
    expect(rb.freeQty).toBe(0);
    expect(rb.netQty).toBeCloseTo(rb.grossQty, 3);
  });

  test("BR-SO-35 a reservation is not a ledger posting: item stock is unchanged", async () => {
    const t = await tree();
    await stock(t.adc.id, 100);
    const before = await ledgerSum(t.adc.id);
    const so = await mkConfirmedSo([{ itemId: t.rc.id, qty: 1000 }]);
    await mustExplode(so.id);
    await mustExplode(so.id);
    expect(await ledgerSum(t.adc.id)).toBe(before);
  });

  test("BR-SO-35/36 a re-run supersedes the old snapshot and replaces its claims", async () => {
    const t = await tree();
    await stock(t.adc.id, 100);
    const a = await mkConfirmedSo([{ itemId: t.rc.id, qty: 1000 }]);
    const e1 = await mustExplode(a.id);
    const e2 = await mustExplode(a.id);
    const h1 = await call("bo", "GET", `/${a.id}/explosions/${e1.id}`);
    expect(h1.json.data.status).toBe("superseded");
    expect(h1.json.data.supersededAt).not.toBeNull();
    const h2 = await call("bo", "GET", `/${a.id}/explosions/${e2.id}`);
    expect(h2.json.data.status).toBe("current");
    const list = await call(
      "bo",
      "GET",
      `/${a.id}/explosions?status=superseded`,
    );
    expect(list.json.data.map((x: { id: number }) => x.id)).toContain(e1.id);
    // another SO still sees the 100 kg as reserved once (by E2), not twice
    const b = await mkConfirmedSo([{ itemId: t.rc.id, qty: 1000 }]);
    const eb = await mustExplode(b.id);
    expect(rowFor(await rowsOf(b.id, eb.id), t.adc.id).reservedOtherQty).toBe(
      100,
    );
  });

  test("BR-SO-35 closing the SO releases its reservations", async () => {
    const t = await tree();
    await stock(t.adc.id, 100);
    const a = await mkConfirmedSo([{ itemId: t.rc.id, qty: 1000 }]);
    await mustExplode(a.id);
    expect((await act(a.id, "close", { reason: "done by hand" })).status).toBe(
      200,
    );
    const b = await mkConfirmedSo([{ itemId: t.rc.id, qty: 1000 }]);
    const eb = await mustExplode(b.id);
    const rb = rowFor(await rowsOf(b.id, eb.id), t.adc.id);
    expect(rb.reservedOtherQty).toBe(0);
    expect(rb.freeQty).toBe(100);
  });

  test("BR-SO-20/35 cancelling the SO releases its reservations", async () => {
    const t = await tree();
    await stock(t.adc.id, 100);
    const a = await mkConfirmedSo([{ itemId: t.rc.id, qty: 1000 }]);
    await mustExplode(a.id);
    expect((await act(a.id, "cancel", { reason: "withdrawn" })).status).toBe(
      200,
    );
    const b = await mkConfirmedSo([{ itemId: t.rc.id, qty: 1000 }]);
    const eb = await mustExplode(b.id);
    expect(rowFor(await rowsOf(b.id, eb.id), t.adc.id).reservedOtherQty).toBe(
      0,
    );
  });

  test("BR-SO-16 holding the SO keeps its reservations", async () => {
    const t = await tree();
    await stock(t.adc.id, 100);
    const a = await mkConfirmedSo([{ itemId: t.rc.id, qty: 1000 }]);
    await mustExplode(a.id);
    await act(a.id, "hold", { reason: "credit check" });
    const b = await mkConfirmedSo([{ itemId: t.rc.id, qty: 1000 }]);
    const eb = await mustExplode(b.id);
    expect(rowFor(await rowsOf(b.id, eb.id), t.adc.id).reservedOtherQty).toBe(
      100,
    );
  });
});

// ================================================================ BR-SO-37, 38
describe("BR-SO-37 serialised runs", () => {
  test("BR-SO-37 two runs of the same SO at once: only 201 or 409, at least one 201, run numbers differ", async () => {
    const t = await tree();
    const so = await mkConfirmedSo([{ itemId: t.mc.id, qty: 10 }]);
    const [a, b] = await Promise.all([explode(so.id), explode(so.id)]);
    for (const r of [a, b]) expect([201, 409]).toContain(r.status);
    const ok = [a, b].filter((r) => r.status === 201);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    if (ok.length === 2) {
      expect(ok[0]?.json.data.runNo).not.toBe(ok[1]?.json.data.runNo);
    }
    const list = await call("bo", "GET", `/${so.id}/explosions`);
    const current = list.json.data.filter(
      (x: { status: string }) => x.status === "current",
    );
    expect(current).toHaveLength(1);
  });
});

describe("BR-SO-38 out-of-date snapshots", () => {
  async function line1(soId: number) {
    const d = await detail(soId);
    return d.lines[0];
  }

  test("BR-SO-38 qty change after the run -> out of date, drafts refused 409 SNAPSHOT_OUT_OF_DATE", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const l = await line1(so.id);
    const up = await patchSo(so.id, {
      lines: [
        {
          id: l.id,
          qty: 1200,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
    expect(up.status).toBe(200);
    const h = await call("bo", "GET", `/${so.id}/explosions/${ex.id}`);
    expect(h.json.data.outOfDate).toBe(true);
    expect(h.json.data.outOfDateReasons.length).toBeGreaterThan(0);
    const r = await drafts(so.id, ex.id, [
      { rowId: rowFor(rows, t.bush.id).id, qty: 10 },
    ]);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("SNAPSHOT_OUT_OF_DATE");
    expect(await prCountForSo(so.id)).toBe(0);
  });

  test("BR-SO-38 delivery date change -> out of date", async () => {
    const { so, ex } = await exampleSo();
    const l = await line1(so.id);
    await patchSo(so.id, {
      lines: [
        {
          id: l.id,
          qty: l.qty,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: istDay(60),
        },
      ],
    });
    const h = await call("bo", "GET", `/${so.id}/explosions/${ex.id}`);
    expect(h.json.data.outOfDate).toBe(true);
  });

  test("BR-SO-38 a line added -> out of date", async () => {
    const { t, so, ex } = await exampleSo();
    await patchSo(so.id, {
      lines: [soLine({ itemId: t.rc.id, qty: 5 })],
    });
    const h = await call("bo", "GET", `/${so.id}/explosions/${ex.id}`);
    expect(h.json.data.outOfDate).toBe(true);
  });

  test("BR-SO-38 hold and resume -> out of date", async () => {
    const { so, ex } = await exampleSo();
    await act(so.id, "hold", { reason: "credit check" });
    await act(so.id, "resume");
    const h = await call("bo", "GET", `/${so.id}/explosions/${ex.id}`);
    expect(h.json.data.outOfDate).toBe(true);
  });

  test("BR-SO-38 price, GST %, notes and ship-to changes keep the snapshot current", async () => {
    const { so, ex } = await exampleSo();
    const l = await line1(so.id);
    const res = await patchSo(so.id, {
      notes: "just a note",
      shipToAddress: "Plant 2, Hosur",
      shipToStateCode: "33",
      lines: [
        {
          id: l.id,
          qty: l.qty,
          unitPricePaise: 17000,
          gstPercent: 12,
          deliveryDate: l.deliveryDate,
          notes: "n",
        },
      ],
    });
    expect(res.status).toBe(200);
    const h = await call("bo", "GET", `/${so.id}/explosions/${ex.id}`);
    expect(h.json.data.outOfDate).toBe(false);
  });

  test("BR-SO-38 the SO list shows snapshotStatus none / current / out_of_date", async () => {
    const t = await tree();
    const so = await mkConfirmedSo([{ itemId: t.mc.id, qty: 10 }]);
    const status = async () => {
      const r = await call(
        "bo",
        "GET",
        `?q=${encodeURIComponent(so.soNumber)}`,
      );
      return r.json.data.find((x: { id: number }) => x.id === so.id)
        .snapshotStatus;
    };
    expect(await status()).toBe("none");
    await mustExplode(so.id);
    expect(await status()).toBe("current");
    const l = await line1(so.id);
    await patchSo(so.id, {
      lines: [
        {
          id: l.id,
          qty: 11,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
    expect(await status()).toBe("out_of_date");
  });

  test("BR-SO-38 an out-of-date snapshot can still be read", async () => {
    const { so, ex } = await exampleSo();
    await act(so.id, "hold", { reason: "credit check" });
    await act(so.id, "resume");
    expect(
      (await call("bo", "GET", `/${so.id}/explosions/${ex.id}/rows`)).status,
    ).toBe(200);
  });

  test("BR-SO-36 drafts from a superseded snapshot -> 409 SNAPSHOT_SUPERSEDED", async () => {
    const { t, so, ex, rows } = await exampleSo();
    await mustExplode(so.id);
    const r = await drafts(so.id, ex.id, [
      { rowId: rowFor(rows, t.bush.id).id, qty: 10 },
    ]);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("SNAPSHOT_SUPERSEDED");
  });
});

// ================================================================ BR-SO-39..47
describe("BR-SO-39..41 picking and PR creation", () => {
  test("BR-SO-39 pick less than net is allowed and shows how much is still short", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const adc = rowFor(rows, t.adc.id);
    const pick = Math.round((adc.netQty - 10) * 1000) / 1000;
    const r = track(await drafts(so.id, ex.id, [{ rowId: adc.id, qty: pick }]));
    expect(r.status).toBe(201);
    const out = r.json.data.rows.find(
      (x: { rowId: number }) => x.rowId === adc.id,
    );
    expect(out.stillShortBy).toBeCloseTo(10, 3);
    expect(out.prItemId).toBeGreaterThan(0);
  });

  test("BR-SO-39 pick above net -> 400 PICK_OVER_NET and nothing is created", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const adc = rowFor(rows, t.adc.id);
    const r = await drafts(so.id, ex.id, [
      { rowId: adc.id, qty: adc.netQty + 1 },
    ]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("PICK_OVER_NET");
    expect(await prCountForSo(so.id)).toBe(0);
  });

  test("BR-SO-39 pick qty 0, negative, fractional pcs, repeated row, empty list -> 400", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const bush = rowFor(rows, t.bush.id);
    for (const qty of [0, -1, 10.5]) {
      expect(
        (await drafts(so.id, ex.id, [{ rowId: bush.id, qty }])).status,
      ).toBe(400);
    }
    expect(
      (
        await drafts(so.id, ex.id, [
          { rowId: bush.id, qty: 1 },
          { rowId: bush.id, qty: 2 },
        ])
      ).status,
    ).toBe(400);
    expect((await drafts(so.id, ex.id, [])).status).toBe(400);
    expect(await prCountForSo(so.id)).toBe(0);
  });

  test("BR-SO-39 a row with net 0 cannot be picked -> 400", async () => {
    const t = await tree();
    await stock(t.bush.id, 5000);
    const so = await mkConfirmedSo([{ itemId: t.rc.id, qty: 100 }]);
    const ex = await mustExplode(so.id);
    const bush = rowFor(await rowsOf(so.id, ex.id), t.bush.id);
    expect(bush.netQty).toBe(0);
    expect(
      (await drafts(so.id, ex.id, [{ rowId: bush.id, qty: 1 }])).status,
    ).toBe(400);
  });

  test("BR-SO-40 bought rows become one draft PR: type sale_order, this SO, requestedBy me, system note", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const adc = rowFor(rows, t.adc.id);
    const bush = rowFor(rows, t.bush.id);
    const r = track(
      await drafts(so.id, ex.id, [
        { rowId: adc.id, qty: adc.netQty },
        { rowId: bush.id, qty: bush.netQty },
      ]),
    );
    expect(r.status).toBe(201);
    expect(r.json.data.prs).toHaveLength(1);
    expect(r.json.data.prs[0].lineCount).toBe(2);
    expect(r.json.data.scos).toHaveLength(0);
    const [pr] = await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, r.json.data.prs[0].id));
    expect(pr?.type).toBe("sale_order");
    expect(pr?.saleOrderId).toBe(so.id);
    expect(pr?.status).toBe("draft");
    expect(pr?.requestedBy).toBe(actors.bo?.id as number);
    expect(pr?.notes).toContain(ex.number);
    expect(pr?.notes).toContain("Auto-generated from");
    const items = await db
      .select()
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.prId, r.json.data.prs[0].id));
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.status === "pending")).toBe(true);
  });

  test("BR-SO-41 a PR line's required-by date is the delivery date; a past date is left empty", async () => {
    const t = await tree();
    const so = await mkConfirmedSo([
      { itemId: t.rc.id, qty: 100, deliveryDate: istDay(20) },
    ]);
    const ex = await mustExplode(so.id);
    const rows = await rowsOf(so.id, ex.id);
    const bush = rowFor(rows, t.bush.id);
    expect(bush.pastDue).toBe(false);
    const ok = track(await drafts(so.id, ex.id, [{ rowId: bush.id, qty: 10 }]));
    const [it] = await db
      .select()
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.prId, ok.json.data.prs[0].id));
    expect(it?.expectedDate).not.toBeNull();

    const so2 = await mkConfirmedSo([{ itemId: t.rc.id, qty: 100 }]);
    await db
      .update(saleOrderLines)
      .set({ deliveryDate: istDay(-2) })
      .where(eq(saleOrderLines.soId, so2.id));
    const ex2 = await mustExplode(so2.id);
    const rows2 = await rowsOf(so2.id, ex2.id);
    const bush2 = rowFor(rows2, t.bush.id);
    expect(bush2.pastDue).toBe(true);
    const late = track(
      await drafts(so2.id, ex2.id, [{ rowId: bush2.id, qty: 10 }]),
    );
    expect(late.status).toBe(201);
    const [it2] = await db
      .select()
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.prId, late.json.data.prs[0].id));
    expect(it2?.expectedDate).toBeNull();
  });

  test("BR-SO-33 after PRs are raised from this SO, a re-run shows net 0 for them", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const adc = rowFor(rows, t.adc.id);
    const bush = rowFor(rows, t.bush.id);
    track(
      await drafts(so.id, ex.id, [
        { rowId: adc.id, qty: adc.netQty },
        { rowId: bush.id, qty: bush.netQty },
      ]),
    );
    const e2 = await mustExplode(so.id);
    const r2 = await rowsOf(so.id, e2.id);
    expect(rowFor(r2, t.adc.id).netQty).toBe(0);
    expect(rowFor(r2, t.adc.id).openPrQty).toBeCloseTo(adc.netQty, 3);
    expect(rowFor(r2, t.bush.id).netQty).toBe(0);
  });

  test("BR-SO-47 cancelling the raised PR leaves the SO confirmed; a re-run shows the shortage again", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const adc = rowFor(rows, t.adc.id);
    const r = track(
      await drafts(so.id, ex.id, [{ rowId: adc.id, qty: adc.netQty }]),
    );
    await db
      .update(purchaseRequests)
      .set({ status: "cancelled" })
      .where(eq(purchaseRequests.id, r.json.data.prs[0].id));
    expect((await detail(so.id)).status).toBe("confirmed");
    const e2 = await mustExplode(so.id);
    expect(rowFor(await rowsOf(so.id, e2.id), t.adc.id).netQty).toBeCloseTo(
      adc.netQty,
      3,
    );
  });

  test("BR-SO-47 created PRs are ordinary drafts, never auto-submitted", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = track(
      await drafts(so.id, ex.id, [
        { rowId: rowFor(rows, t.bush.id).id, qty: 5 },
      ]),
    );
    const [pr] = await db
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, r.json.data.prs[0].id));
    expect(pr?.status).toBe("draft");
  });
});

describe("BR-SO-42..44 job work rows -> SCO", () => {
  test("BR-SO-42 HSG-MC net 1000 -> one draft SCO to the BOM's job worker: send 1021 HSG-RC, return 1000 HSG-MC", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const mc = rowFor(rows, t.mc.id);
    expect(mc.selectable).toBe(true);
    expect(mc.jobWorker?.defaultVendorId).toBe(vendorId);
    const r = track(await drafts(so.id, ex.id, [{ rowId: mc.id, qty: 1000 }]));
    expect(r.status).toBe(201);
    expect(r.json.data.scos).toHaveLength(1);
    expect(r.json.data.prs).toHaveLength(0);
    const scoId = r.json.data.scos[0].id;
    const [sco] = await db
      .select()
      .from(subcontractingOrders)
      .where(eq(subcontractingOrders.id, scoId));
    expect(sco?.vendorId).toBe(vendorId);
    expect(sco?.status).toBe("draft");
    expect(sco?.projectRef).toBe(so.soNumber);
    const items = await db
      .select()
      .from(subcontractingOrderItems)
      .where(eq(subcontractingOrderItems.scoId, scoId));
    expect(items).toHaveLength(1);
    expect(items[0]?.rawItemId).toBe(t.rc.id);
    expect(items[0]?.finishedItemId).toBe(t.mc.id);
    expect(items[0]?.rawQtyToIssue).toBe(1021);
    expect(items[0]?.expectedReturnQty).toBe(1000);
    expect(items[0]?.serviceId).toBe(serviceId);
    const row = r.json.data.rows.find(
      (x: { rowId: number }) => x.rowId === mc.id,
    );
    expect(row.scoItemId).toBeGreaterThan(0);
  });

  test("BR-SO-42 a smaller picked qty scales the send qty from the BOM's send:return and loss", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const mc = rowFor(rows, t.mc.id);
    const r = track(await drafts(so.id, ex.id, [{ rowId: mc.id, qty: 500 }]));
    expect(r.status).toBe(201);
    const [it] = await db
      .select()
      .from(subcontractingOrderItems)
      .where(eq(subcontractingOrderItems.scoId, r.json.data.scos[0].id));
    expect(it?.expectedReturnQty).toBe(500);
    // 500 x 1 / (1 - 2%) rounded up = 511
    expect(it?.rawQtyToIssue).toBeGreaterThanOrEqual(510);
    expect(it?.rawQtyToIssue).toBeLessThanOrEqual(511);
  });

  test("BR-SO-43 changing to a vendor without the service -> 400, nothing created", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const mc = rowFor(rows, t.mc.id);
    const r = await drafts(so.id, ex.id, [
      { rowId: mc.id, qty: 100, vendorId: otherVendorId },
    ]);
    expect(r.status).toBe(400);
    expect(await prCountForSo(so.id)).toBe(0);
    const again = await rowsOf(so.id, ex.id);
    expect(rowFor(again, t.mc.id).raised).toBeNull();
  });

  test("BR-SO-43 a return date in the past -> 400", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const mc = rowFor(rows, t.mc.id);
    const r = await drafts(so.id, ex.id, [
      { rowId: mc.id, qty: 100, expectedReturnDate: istDay(-1) },
    ]);
    expect(r.status).toBe(400);
  });

  test("BR-SO-43 an explicit valid return date is accepted", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const mc = rowFor(rows, t.mc.id);
    const r = track(
      await drafts(so.id, ex.id, [
        { rowId: mc.id, qty: 100, vendorId, expectedReturnDate: istDay(25) },
      ]),
    );
    expect(r.status).toBe(201);
  });

  test("BR-SO-43 vendorId on a bought row -> 400", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = await drafts(so.id, ex.id, [
      { rowId: rowFor(rows, t.bush.id).id, qty: 5, vendorId },
    ]);
    expect(r.status).toBe(400);
  });

  test("BR-SO-44 picking a cast row -> 400", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = await drafts(so.id, ex.id, [
      { rowId: rowFor(rows, t.rc.id).id, qty: 5 },
    ]);
    expect(r.status).toBe(400);
    expect(await prCountForSo(so.id)).toBe(0);
  });

  test("BR-SO-42 PR and SCO rows in one call: one PR and one SCO", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = track(
      await drafts(so.id, ex.id, [
        { rowId: rowFor(rows, t.mc.id).id, qty: 100 },
        { rowId: rowFor(rows, t.bush.id).id, qty: 10 },
      ]),
    );
    expect(r.status).toBe(201);
    expect(r.json.data.prs).toHaveLength(1);
    expect(r.json.data.scos).toHaveLength(1);
  });
});

describe("BR-SO-45 permissions to raise", () => {
  test("BR-SO-45 so.explode without pr.manage picking a bought row -> 403, nothing created", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = await drafts(
      so.id,
      ex.id,
      [{ rowId: rowFor(rows, t.bush.id).id, qty: 5 }],
      "scoOnly",
    );
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
    expect(await prCountForSo(so.id)).toBe(0);
  });

  test("BR-SO-45 so.explode without sco.manage picking a job-work row -> 403, nothing created", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = await drafts(
      so.id,
      ex.id,
      [{ rowId: rowFor(rows, t.mc.id).id, qty: 5 }],
      "prOnly",
    );
    expect(r.status).toBe(403);
    expect(await prCountForSo(so.id)).toBe(0);
    expect(rowFor(await rowsOf(so.id, ex.id), t.mc.id).raised).toBeNull();
  });

  test("BR-SO-45 a mixed pick with only pr.manage is refused as a whole", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = await drafts(
      so.id,
      ex.id,
      [
        { rowId: rowFor(rows, t.bush.id).id, qty: 5 },
        { rowId: rowFor(rows, t.mc.id).id, qty: 5 },
      ],
      "prOnly",
    );
    expect(r.status).toBe(403);
    expect(await prCountForSo(so.id)).toBe(0);
  });

  test("BR-SO-45 so.explode + pr.manage can raise a bought row", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = track(
      await drafts(
        so.id,
        ex.id,
        [{ rowId: rowFor(rows, t.bush.id).id, qty: 5 }],
        "prOnly",
      ),
    );
    expect(r.status).toBe(201);
  });

  test("BR-SO-45 pr.manage without so.explode -> 403 (route key)", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = await drafts(
      so.id,
      ex.id,
      [{ rowId: rowFor(rows, t.bush.id).id, qty: 5 }],
      "viewer",
    );
    expect(r.status).toBe(403);
  });

  test("BR-SO-45 floor supervisor and no login are refused", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const body = { rows: [{ rowId: rowFor(rows, t.bush.id).id, qty: 5 }] };
    expect(
      (await call("fs", "POST", `/${so.id}/explosions/${ex.id}/drafts`, body))
        .status,
    ).toBe(403);
    expect(
      (await call(null, "POST", `/${so.id}/explosions/${ex.id}/drafts`, body))
        .status,
    ).toBe(401);
  });
});

describe("BR-SO-46 one transaction, no double raise", () => {
  test("BR-SO-46 raising the same row again -> 409 ROW_ALREADY_RAISED, still one PR", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const bush = rowFor(rows, t.bush.id);
    track(await drafts(so.id, ex.id, [{ rowId: bush.id, qty: 5 }]));
    const again = await drafts(so.id, ex.id, [{ rowId: bush.id, qty: 5 }]);
    expect(again.status).toBe(409);
    expect(again.json.code).toBe("ROW_ALREADY_RAISED");
    expect(await prCountForSo(so.id)).toBe(1);
  });

  test("BR-SO-46 a double click (two calls at once) makes one PR, one call gets 409", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const bush = rowFor(rows, t.bush.id);
    const [a, b] = await Promise.all([
      drafts(so.id, ex.id, [{ rowId: bush.id, qty: 5 }]),
      drafts(so.id, ex.id, [{ rowId: bush.id, qty: 5 }]),
    ]);
    track(a);
    track(b);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prCountForSo(so.id)).toBe(1);
  });

  test("BR-SO-46 one bad row stops the whole create: no PR, no SCO, rows stay un-raised", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = await drafts(so.id, ex.id, [
      { rowId: rowFor(rows, t.bush.id).id, qty: 5 },
      { rowId: rowFor(rows, t.mc.id).id, qty: 5, vendorId: otherVendorId },
    ]);
    expect(r.status).toBe(400);
    expect(await prCountForSo(so.id)).toBe(0);
    const after = await rowsOf(so.id, ex.id);
    expect(rowFor(after, t.bush.id).raised).toBeNull();
    expect(rowFor(after, t.mc.id).raised).toBeNull();
  });

  test("BR-SO-46 each raised row records the document it became", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = track(
      await drafts(so.id, ex.id, [
        { rowId: rowFor(rows, t.bush.id).id, qty: 5 },
        { rowId: rowFor(rows, t.mc.id).id, qty: 5 },
      ]),
    );
    const after = await rowsOf(so.id, ex.id);
    expect(rowFor(after, t.bush.id).raised?.type).toBe("pr");
    expect(rowFor(after, t.bush.id).raised?.docId).toBe(r.json.data.prs[0].id);
    expect(rowFor(after, t.mc.id).raised?.type).toBe("sco");
    expect(rowFor(after, t.mc.id).raised?.docId).toBe(r.json.data.scos[0].id);
    const h = await call("bo", "GET", `/${so.id}/explosions/${ex.id}`);
    expect(h.json.data.totals.raisedCount).toBe(2);
  });

  test("BR-SO-46 the SO detail lists the raised PR and SCO", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = track(
      await drafts(so.id, ex.id, [
        { rowId: rowFor(rows, t.bush.id).id, qty: 5 },
        { rowId: rowFor(rows, t.mc.id).id, qty: 5 },
      ]),
    );
    const d = await detail(so.id);
    const types = d.raisedDocuments.map((x: { type: string }) => x.type).sort();
    expect(types).toEqual(["pr", "sco"]);
    const ids = d.raisedDocuments.map((x: { id: number }) => x.id);
    expect(ids).toContain(r.json.data.prs[0].id);
    expect(ids).toContain(r.json.data.scos[0].id);
  });
});

describe("BR-SO-62 snapshot and rows belong to the SO in the path", () => {
  test("BR-SO-62 a row of another SO's snapshot -> 404, nothing created", async () => {
    const a = await exampleSo();
    const b = await exampleSo();
    const foreignRow = rowFor(b.rows, b.t.bush.id);
    const r = await drafts(a.so.id, a.ex.id, [
      { rowId: foreignRow.id, qty: 5 },
    ]);
    expect(r.status).toBe(404);
    expect(await prCountForSo(a.so.id)).toBe(0);
    expect(await prCountForSo(b.so.id)).toBe(0);
  });

  test("BR-SO-62 a snapshot of another SO in the path -> 404", async () => {
    const a = await exampleSo();
    const b = await exampleSo();
    const r = await drafts(a.so.id, b.ex.id, [
      { rowId: rowFor(b.rows, b.t.bush.id).id, qty: 5 },
    ]);
    expect(r.status).toBe(404);
    expect(await prCountForSo(b.so.id)).toBe(0);
  });

  test("BR-SO-62 an unknown row id -> 404", async () => {
    const { so, ex } = await exampleSo();
    const r = await drafts(so.id, ex.id, [{ rowId: 999999999, qty: 5 }]);
    expect(r.status).toBe(404);
  });
});

describe("BR-SO-14 / 17 / 19 live documents raised from the SO", () => {
  async function raised() {
    const ctx = await exampleSo();
    const r = track(
      await drafts(ctx.so.id, ctx.ex.id, [
        { rowId: rowFor(ctx.rows, ctx.t.bush.id).id, qty: 5 },
      ]),
    );
    const prNumber = r.json.data.prs[0].prNumber as string;
    return { ...ctx, prId: r.json.data.prs[0].id as number, prNumber };
  }

  test("BR-SO-14 cutting a qty while a live PR from this SO exists -> 409 naming the PR", async () => {
    const ctx = await raised();
    const l = ctx.so.lines[0];
    const res = await patchSo(ctx.so.id, {
      lines: [
        {
          id: l.id,
          qty: 500,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("LIVE_DOCUMENTS_LINKED");
    expect(JSON.stringify(res.json)).toContain(ctx.prNumber);
  });

  test("BR-SO-14 the block is SO-wide: cutting a different line is refused too", async () => {
    const ctx = await raised();
    const spare = await mkConfirmedSo([{ itemId: ctx.t.rc.id, qty: 50 }]);
    // second line on the same SO as the PR
    const add = await patchSo(ctx.so.id, {
      lines: [
        soLine({ itemId: ctx.t.rc.id, qty: 50, deliveryDate: istDay(40) }),
      ],
    });
    expect(add.status).toBe(200);
    expect(spare.id).toBeGreaterThan(0);
    const d = await detail(ctx.so.id);
    const l2 = d.lines.find(
      (x: { itemId: number }) => x.itemId === ctx.t.rc.id,
    );
    const cut = await patchSo(ctx.so.id, {
      lines: [
        {
          id: l2.id,
          qty: 10,
          unitPricePaise: l2.unitPricePaise,
          gstPercent: l2.gstPercent,
          deliveryDate: l2.deliveryDate,
        },
      ],
    });
    expect(cut.status).toBe(409);
    expect(cut.json.code).toBe("LIVE_DOCUMENTS_LINKED");
    const del = await patchSo(ctx.so.id, { removeLineIds: [l2.id] });
    expect(del.status).toBe(409);
    expect(del.json.code).toBe("LIVE_DOCUMENTS_LINKED");
  });

  test("BR-SO-14 raising a qty is allowed while drafts are live", async () => {
    const ctx = await raised();
    const l = ctx.so.lines[0];
    const res = await patchSo(ctx.so.id, {
      lines: [
        {
          id: l.id,
          qty: 1200,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
    expect(res.status).toBe(200);
  });

  test("BR-SO-14 once the PR is cancelled the cut is allowed", async () => {
    const ctx = await raised();
    await db
      .update(purchaseRequests)
      .set({ status: "cancelled" })
      .where(eq(purchaseRequests.id, ctx.prId));
    const l = ctx.so.lines[0];
    const res = await patchSo(ctx.so.id, {
      lines: [
        {
          id: l.id,
          qty: 500,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
    expect(res.status).toBe(200);
  });

  test("BR-SO-15 a PR line that is already ordered is not live", async () => {
    const ctx = await raised();
    await db
      .update(purchaseRequestItems)
      .set({ status: "ordered" })
      .where(eq(purchaseRequestItems.prId, ctx.prId));
    const l = ctx.so.lines[0];
    const res = await patchSo(ctx.so.id, {
      lines: [
        {
          id: l.id,
          qty: 500,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
    expect(res.status).toBe(200);
  });

  test("BR-SO-19 cancelling the SO while a live PR exists -> 409 naming the PR, nothing cancelled", async () => {
    const ctx = await raised();
    const res = await act(ctx.so.id, "cancel", { reason: "withdrawn" });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("LIVE_DOCUMENTS_LINKED");
    expect(JSON.stringify(res.json)).toContain(ctx.prNumber);
    expect((await detail(ctx.so.id)).status).toBe("confirmed");
    const [pr] = await db
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, ctx.prId));
    expect(pr?.status).toBe("draft");
  });

  test("BR-SO-19 a live draft SCO also blocks the cancel", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const r = track(
      await drafts(so.id, ex.id, [
        { rowId: rowFor(rows, t.mc.id).id, qty: 100 },
      ]),
    );
    const res = await act(so.id, "cancel", { reason: "withdrawn" });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("LIVE_DOCUMENTS_LINKED");
    expect(JSON.stringify(res.json)).toContain(r.json.data.scos[0].scoNumber);
  });

  test("BR-SO-19 after the PR is cancelled the SO can be cancelled", async () => {
    const ctx = await raised();
    await db
      .update(purchaseRequests)
      .set({ status: "cancelled" })
      .where(eq(purchaseRequests.id, ctx.prId));
    expect(
      (await act(ctx.so.id, "cancel", { reason: "withdrawn" })).status,
    ).toBe(200);
  });

  test("BR-SO-17 closing by hand leaves the linked PR untouched", async () => {
    const ctx = await raised();
    const res = await act(ctx.so.id, "close", { reason: "done by hand" });
    expect(res.status).toBe(200);
    expect(res.json.data.status).toBe("closed");
    const [pr] = await db
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, ctx.prId));
    expect(pr?.status).toBe("draft");
  });

  test("BR-SO-36 documents raised from a superseded snapshot stay and still count as raised", async () => {
    const ctx = await raised();
    await mustExplode(ctx.so.id);
    const [pr] = await db
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, ctx.prId));
    expect(pr?.status).toBe("draft");
    const res = await act(ctx.so.id, "cancel", { reason: "withdrawn" });
    expect(res.status).toBe(409);
  });
});

// ================================================================ BR-SO-50, 51, 52
describe("BR-SO-50 / 51 explosion rows and prices", () => {
  test("BR-SO-50 every row has the columns the screen shows", async () => {
    const { rows } = await exampleSo();
    const row = rows[0];
    for (const k of [
      "itemId",
      "sku",
      "level",
      "type",
      "bomRevision",
      "uom",
      "grossQty",
      "freeQty",
      "reservedOtherQty",
      "openPrQty",
      "openPoQty",
      "openScoQty",
      "netQty",
      "raised",
    ]) {
      expect(row).toHaveProperty(k);
    }
  });

  test("BR-SO-50 units: alloy in kg, parts in pcs; BOM revision shown", async () => {
    const { t, rows } = await exampleSo();
    // biome-ignore lint/suspicious/noExplicitAny: row shape from contract
    expect((rowFor(rows, t.adc.id) as any).uom).toBe("kg");
    // biome-ignore lint/suspicious/noExplicitAny: row shape from contract
    expect((rowFor(rows, t.bush.id) as any).uom).toBe("pcs");
    // biome-ignore lint/suspicious/noExplicitAny: row shape from contract
    expect((rowFor(rows, t.rc.id) as any).bomRevision).toBe("A");
  });

  test("BR-SO-50 rows list filters: type, net=short, and sort by sku", async () => {
    const { t, so, ex } = await exampleSo();
    const buy = await call(
      "bo",
      "GET",
      `/${so.id}/explosions/${ex.id}/rows?type=buy&pageSize=100`,
    );
    expect(buy.status).toBe(200);
    expect(buy.json.data.every((r: Row) => r.type === "buy")).toBe(true);
    const short = await call(
      "bo",
      "GET",
      `/${so.id}/explosions/${ex.id}/rows?net=short&pageSize=100`,
    );
    expect(short.json.data.every((r: Row) => r.netQty > 0)).toBe(true);
    const bySku = await call(
      "bo",
      "GET",
      `/${so.id}/explosions/${ex.id}/rows?sortBy=sku&sortDir=asc&pageSize=100`,
    );
    const skus = bySku.json.data.map((r: { sku: string }) => r.sku);
    expect(skus).toEqual([...skus].sort());
    expect(t.mc.id).toBeGreaterThan(0);
  });

  test("BR-SO-50 job-worker candidates show only to so.explode holders", async () => {
    const { t, so, ex } = await exampleSo();
    const withKey = rowFor(await rowsOf(so.id, ex.id, "bo"), t.mc.id);
    expect(withKey.jobWorker?.candidates.map((c) => c.vendorId)).toContain(
      vendorId,
    );
    const viewer = rowFor(await rowsOf(so.id, ex.id, "viewer"), t.mc.id);
    expect(viewer.jobWorker?.candidates).toEqual([]);
  });

  test("BR-SO-51 no price field in any explosion response", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const header = await call("bo", "GET", `/${so.id}/explosions/${ex.id}`);
    const list = await call("bo", "GET", `/${so.id}/explosions`);
    const run = await explode(so.id);
    const made = track(
      await drafts(so.id, run.json.data.id, [
        {
          rowId: rowFor(await rowsOf(so.id, run.json.data.id), t.bush.id).id,
          qty: 1,
        },
      ]),
    );
    const all = [
      ...keysDeep(rows),
      ...keysDeep(header.json),
      ...keysDeep(list.json),
      ...keysDeep(run.json),
      ...keysDeep(made.json),
    ];
    for (const k of all) expect(k).not.toMatch(/price|paise|amount|cost/i);
  });
});

describe("BR-SO-52 audit of explosion and draft creation", () => {
  test("BR-SO-52 an explosion run and a draft creation each write an audit row", async () => {
    const t = await tree();
    const so = await mkConfirmedSo([{ itemId: t.rc.id, qty: 100 }]);
    const count = async () => {
      const r = await call("bo", "GET", `/${so.id}/audit?pageSize=100`);
      return r.json.data.length as number;
    };
    const c0 = await count();
    const ex = await mustExplode(so.id);
    const c1 = await count();
    expect(c1).toBeGreaterThan(c0);
    const bush = rowFor(await rowsOf(so.id, ex.id), t.bush.id);
    track(await drafts(so.id, ex.id, [{ rowId: bush.id, qty: 1 }]));
    const c2 = await count();
    expect(c2).toBeGreaterThan(c1);
    const rows = await call("bo", "GET", `/${so.id}/audit?pageSize=100`);
    for (const r of rows.json.data)
      expect(r.actorName).toBe(actors.bo?.name as string);
  });

  test("BR-SO-52 a refused draft creation writes no document and leaves the explosion unchanged", async () => {
    const { t, so, ex, rows } = await exampleSo();
    const adc = rowFor(rows, t.adc.id);
    await drafts(so.id, ex.id, [{ rowId: adc.id, qty: adc.netQty + 5 }]);
    const h = await call("bo", "GET", `/${so.id}/explosions/${ex.id}`);
    expect(h.json.data.totals.raisedCount).toBe(0);
  });
});
