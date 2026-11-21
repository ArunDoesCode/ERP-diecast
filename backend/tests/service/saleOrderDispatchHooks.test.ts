/**
 * Service-level tests for the delivery-note hooks of the sale order:
 * BR-SO-54 (fully delivered closes), BR-SO-55 (note cancel reopens),
 * BR-SO-58 (posting lowers this SO's stock claims).
 * Spec: docs/specs/sale-order/spec.md v1. Hooks are called the way the dispatch
 * module does: inside one transaction, applyDelivery first, then the close
 * hook. Fixtures are TEST_sodh_ prefixed and removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import { itemMaster } from "../../src/db/schemas/02_procurement-catalog";
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
import { saleOrderService } from "../../src/service/saleOrderService";

const app = createApp();
const RUN = `TEST_sodh_${Date.now()}`;
const EMAIL_PREFIX = "test_sodh_";
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

let token = "";
let actorId = 0;
let customerId = 0;
const soIds: number[] = [];
const itemIds: number[] = [];

function must<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`Fixture setup: ${what} returned no row`);
  return row;
}

function istDay(offsetDays = 0): string {
  const ms = Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function api(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

async function mkItem() {
  const sku = uid();
  const [row] = await db
    .insert(itemMaster)
    .values({
      sku,
      name: sku,
      category: "Finished Good",
      uom: "pcs",
      isActive: true,
    })
    .returning({ id: itemMaster.id });
  const id = must(row, "item").id;
  itemIds.push(id);
  return id;
}

/** Confirmed SO with the given line qtys (one item per line). Returns ids. */
async function mkConfirmedSo(qtys: number[]) {
  const items: number[] = [];
  for (let i = 0; i < qtys.length; i++) items.push(await mkItem());
  const created = await api("POST", "/api/sale-orders", {
    customerId,
    orderDate: istDay(0),
    lines: qtys.map((qty, i) => ({
      itemId: items[i],
      qty,
      unitPricePaise: 1000,
      gstPercent: 18,
      deliveryDate: istDay(30),
    })),
  });
  expect(created.status).toBe(201);
  const soId = created.json.data.id as number;
  soIds.push(soId);
  const conf = await api("POST", `/api/sale-orders/${soId}/confirm`, {
    editVersion: created.json.data.editVersion,
  });
  expect(conf.status).toBe(200);
  const d = await detail(soId);
  // biome-ignore lint/suspicious/noExplicitAny: reading JSON
  const lineIds = d.lines.map((l: any) => l.id as number);
  return { soId, lineIds, items };
}

async function detail(soId: number) {
  const r = await api("GET", `/api/sale-orders/${soId}`);
  return r.json.data;
}

/** One delivery-note posting: signed qty on one line, then the close check. */
async function post(soId: number, lineId: number, qty: number, ref: string) {
  return db.transaction(async (tx) => {
    await saleOrderService.applyDelivery(tx, {
      lineId,
      qty,
      actorId,
      noteRef: ref,
    });
    return saleOrderService.closeFullyDelivered(tx, {
      soId,
      actorId,
      noteRef: ref,
    });
  });
}

/** One delivery-note cancel: negative qty, then the reopen check. */
async function cancelNote(
  soId: number,
  lineId: number,
  qty: number,
  ref: string,
) {
  return db.transaction(async (tx) => {
    await saleOrderService.applyDelivery(tx, {
      lineId,
      qty: -qty,
      actorId,
      noteRef: ref,
    });
    return saleOrderService.reopenAfterDeliveryCancel(tx, {
      soId,
      actorId,
      noteRef: ref,
    });
  });
}

/** Seed a current snapshot with a stock claim of `qty` on `itemId` for the SO. */
async function seedStockClaim(
  soId: number,
  lineId: number,
  itemId: number,
  qty: number,
) {
  const so = must(
    (await db.select().from(saleOrders).where(eq(saleOrders.id, soId)))[0],
    "so",
  );
  const [ex] = await db
    .insert(saleExplosions)
    .values({
      soId,
      runNo: 1,
      status: "current",
      soNeedVersion: so.needVersion,
      soDeliveryVersion: so.deliveryVersion,
      createdBy: actorId,
    })
    .returning({ id: saleExplosions.id });
  const [row] = await db
    .insert(saleExplosionRows)
    .values({
      explosionId: must(ex, "explosion").id,
      itemId,
      level: 1,
      rowType: "buy",
      uom: "pcs",
      grossQty: String(qty),
      onHandQty: String(qty),
      reservedOtherQty: "0",
      openPrQty: "0",
      openPoQty: "0",
      openScoQty: "0",
      lateSupplyQty: "0",
      netQty: "0",
      requiredBy: istDay(30),
    })
    .returning({ id: saleExplosionRows.id });
  const rowId = must(row, "row").id;
  await db
    .insert(saleExplosionSources)
    .values({ rowId, soLineId: lineId, qty: String(qty) });
  await db
    .insert(saleReservations)
    .values({ rowId, soId, itemId, kind: "stock", qty: String(qty) });
}

/** Sum of the SO's live (unreleased) stock claims on an item. */
async function liveClaim(soId: number, itemId: number) {
  const rows = await db
    .select({
      qty: saleReservations.qty,
      releasedAt: saleReservations.releasedAt,
    })
    .from(saleReservations)
    .where(
      and(
        eq(saleReservations.soId, soId),
        eq(saleReservations.itemId, itemId),
        eq(saleReservations.kind, "stock"),
      ),
    );
  return rows
    .filter((r) => r.releasedAt === null)
    .reduce((s, r) => s + Number(r.qty), 0);
}

async function liveClaimsOfSo(soId: number) {
  const rows = await db
    .select({ id: saleReservations.id })
    .from(saleReservations)
    .where(eq(saleReservations.soId, soId));
  const live = await db
    .select({
      id: saleReservations.id,
      releasedAt: saleReservations.releasedAt,
    })
    .from(saleReservations)
    .where(eq(saleReservations.soId, soId));
  return {
    total: rows.length,
    live: live.filter((r) => r.releasedAt === null).length,
  };
}

async function auditCount(soId: number) {
  const r = await api("GET", `/api/sale-orders/${soId}/audit?pageSize=100`);
  return r.json.meta.total as number;
}

beforeAll(async () => {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "back_office"))
    .limit(1);
  const name = `${RUN}_bo`;
  const [emp] = await db
    .insert(employees)
    .values({
      name,
      email: `${EMAIL_PREFIX}${Date.now()}@diecast.test`,
      roleId: must(role, "role").id,
      isActive: true,
    })
    .returning({ id: employees.id });
  actorId = must(emp, "employee").id;
  token = await signAccessToken({
    userId: actorId,
    userName: name,
    role: "back_office",
    allowedPages: [],
  });
  const c = await api("POST", "/api/customers", {
    name: uid(),
    stateCode: "33",
    address: "Plot 4, Hosur",
  });
  expect(c.status).toBe(201);
  customerId = c.json.data.id;
});

afterAll(async () => {
  if (soIds.length > 0) {
    const exps = await db
      .select({ id: saleExplosions.id })
      .from(saleExplosions)
      .where(inArray(saleExplosions.soId, soIds));
    const expIds = exps.map((e) => e.id);
    await db
      .delete(saleReservations)
      .where(inArray(saleReservations.soId, soIds));
    if (expIds.length > 0) {
      const rows = await db
        .select({ id: saleExplosionRows.id })
        .from(saleExplosionRows)
        .where(inArray(saleExplosionRows.explosionId, expIds));
      const rowIds = rows.map((r) => r.id);
      if (rowIds.length > 0)
        await db
          .delete(saleExplosionSources)
          .where(inArray(saleExplosionSources.rowId, rowIds));
      await db
        .delete(saleExplosionRows)
        .where(inArray(saleExplosionRows.explosionId, expIds));
      await db.delete(saleExplosions).where(inArray(saleExplosions.id, expIds));
    }
    await db.delete(salesAuditLog).where(inArray(salesAuditLog.soId, soIds));
    await db.delete(saleOrderLines).where(inArray(saleOrderLines.soId, soIds));
    await db.delete(saleOrders).where(inArray(saleOrders.id, soIds));
  }
  await db
    .delete(salesAuditLog)
    .where(
      and(
        eq(salesAuditLog.targetType, "customer"),
        eq(salesAuditLog.targetId, customerId),
      ),
    );
  await db.delete(customers).where(eq(customers.id, customerId));
  if (itemIds.length > 0)
    await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
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
});

describe("BR-SO-54 fully delivered closes the SO", () => {
  test("BR-SO-54 600 then 400 of a 1000 line closes the SO as fully delivered by the posting user", async () => {
    const { soId, lineIds } = await mkConfirmedSo([1000]);
    const first = await post(soId, lineIds[0] as number, 600, uid());
    expect(first.closed).toBe(false);
    expect((await detail(soId)).status).toBe("confirmed");
    const second = await post(soId, lineIds[0] as number, 400, uid());
    expect(second.closed).toBe(true);
    const d = await detail(soId);
    expect(d.status).toBe("closed");
    expect(d.closeKind).toBe("fully_delivered");
    const [row] = await db
      .select({ closedBy: saleOrders.closedBy })
      .from(saleOrders)
      .where(eq(saleOrders.id, soId));
    expect(row?.closedBy).toBe(actorId);
  });

  test("BR-SO-54 a partial delivery never closes the SO", async () => {
    const { soId, lineIds } = await mkConfirmedSo([1000]);
    const r = await post(soId, lineIds[0] as number, 600, uid());
    expect(r.closed).toBe(false);
    const d = await detail(soId);
    expect(d.status).toBe("confirmed");
    expect(d.closeKind).toBeNull();
  });

  test("BR-SO-54 SO with two lines stays confirmed while one line is still open", async () => {
    const { soId, lineIds } = await mkConfirmedSo([100, 50]);
    const r = await post(soId, lineIds[0] as number, 100, uid());
    expect(r.closed).toBe(false);
    expect((await detail(soId)).status).toBe("confirmed");
  });

  test("BR-SO-54 line 1 fully delivered and line 2 removed closes the SO", async () => {
    const { soId, lineIds } = await mkConfirmedSo([1000, 50]);
    const d0 = await detail(soId);
    const rm = await api("PATCH", `/api/sale-orders/${soId}`, {
      editVersion: d0.editVersion,
      removeLineIds: [lineIds[1]],
    });
    expect(rm.status).toBe(200);
    const r = await post(soId, lineIds[0] as number, 1000, uid());
    expect(r.closed).toBe(true);
    const d = await detail(soId);
    expect(d.status).toBe("closed");
    expect(d.closeKind).toBe("fully_delivered");
  });

  test("BR-SO-54 closing releases the SO's reservations in the posting transaction", async () => {
    const { soId, lineIds, items } = await mkConfirmedSo([300]);
    await seedStockClaim(soId, lineIds[0] as number, items[0] as number, 300);
    await post(soId, lineIds[0] as number, 300, uid());
    expect((await detail(soId)).status).toBe("closed");
    const c = await liveClaimsOfSo(soId);
    expect(c.live).toBe(0);
  });

  test("BR-SO-54 the posted qty is stored on the line (delivered and open qty)", async () => {
    const { soId, lineIds } = await mkConfirmedSo([1000]);
    await post(soId, lineIds[0] as number, 600, uid());
    const l = (await detail(soId)).lines[0];
    expect(l.deliveredQty).toBe(600);
    expect(l.openQty).toBe(400);
  });
});

describe("BR-SO-55 cancelling a note reopens the SO", () => {
  test("BR-SO-55 cancel of the 400-pc note moves a fully delivered SO back to confirmed", async () => {
    const { soId, lineIds } = await mkConfirmedSo([1000]);
    await post(soId, lineIds[0] as number, 600, uid());
    await post(soId, lineIds[0] as number, 400, uid());
    expect((await detail(soId)).status).toBe("closed");
    const before = await auditCount(soId);
    const r = await cancelNote(soId, lineIds[0] as number, 400, uid());
    expect(r.reopened).toBe(true);
    const d = await detail(soId);
    expect(d.status).toBe("confirmed");
    expect(d.closeKind).toBeNull();
    expect(d.lines[0].openQty).toBe(400);
    expect(await auditCount(soId)).toBeGreaterThan(before);
  });

  test("BR-SO-55 reopening clears the close fields", async () => {
    const { soId, lineIds } = await mkConfirmedSo([100]);
    await post(soId, lineIds[0] as number, 100, uid());
    await cancelNote(soId, lineIds[0] as number, 40, uid());
    const [row] = await db
      .select({
        closeKind: saleOrders.closeKind,
        closedBy: saleOrders.closedBy,
        closedAt: saleOrders.closedAt,
      })
      .from(saleOrders)
      .where(eq(saleOrders.id, soId));
    expect(row?.closeKind).toBeNull();
    expect(row?.closedBy).toBeNull();
    expect(row?.closedAt).toBeNull();
  });

  test("BR-SO-55 released reservations are not restored on reopen", async () => {
    const { soId, lineIds, items } = await mkConfirmedSo([300]);
    await seedStockClaim(soId, lineIds[0] as number, items[0] as number, 300);
    await post(soId, lineIds[0] as number, 300, uid());
    await cancelNote(soId, lineIds[0] as number, 300, uid());
    expect((await detail(soId)).status).toBe("confirmed");
    expect((await liveClaimsOfSo(soId)).live).toBe(0);
  });

  test("BR-SO-55 an SO closed by hand is never reopened (409 SO_CLOSED_BY_HAND)", async () => {
    const { soId, lineIds } = await mkConfirmedSo([1000]);
    await post(soId, lineIds[0] as number, 600, uid());
    const d0 = await detail(soId);
    const close = await api("POST", `/api/sale-orders/${soId}/close`, {
      editVersion: d0.editVersion,
      reason: "customer stopped the order",
    });
    expect(close.status).toBe(200);
    await expect(
      cancelNote(soId, lineIds[0] as number, 600, uid()),
    ).rejects.toMatchObject({ statusCode: 409, code: "SO_CLOSED_BY_HAND" });
    const d = await detail(soId);
    expect(d.status).toBe("closed");
    expect(d.closeKind).toBe("manual");
  });

  test("BR-SO-55 no SO API route reopens a closed SO", async () => {
    const { soId, lineIds } = await mkConfirmedSo([100]);
    await post(soId, lineIds[0] as number, 100, uid());
    const d = await detail(soId);
    for (const action of ["resume", "confirm"]) {
      const r = await api("POST", `/api/sale-orders/${soId}/${action}`, {
        editVersion: d.editVersion,
      });
      expect(r.status).toBe(409);
    }
    expect((await detail(soId)).status).toBe("closed");
  });
});

describe("BR-SO-58 posting lowers this SO's stock claims", () => {
  test("BR-SO-58 a note shipping the full 300 claimed brings the claim to 0", async () => {
    const { soId, lineIds, items } = await mkConfirmedSo([1000]);
    const item = items[0] as number;
    await seedStockClaim(soId, lineIds[0] as number, item, 300);
    expect(await liveClaim(soId, item)).toBe(300);
    await post(soId, lineIds[0] as number, 300, uid());
    expect(await liveClaim(soId, item)).toBe(0);
  });

  test("BR-SO-58 a partial shipment lowers the claim by the shipped qty", async () => {
    const { soId, lineIds, items } = await mkConfirmedSo([1000]);
    const item = items[0] as number;
    await seedStockClaim(soId, lineIds[0] as number, item, 300);
    await post(soId, lineIds[0] as number, 100, uid());
    expect(await liveClaim(soId, item)).toBe(200);
  });

  test("BR-SO-58 shipping more than the claim never takes it below 0", async () => {
    const { soId, lineIds, items } = await mkConfirmedSo([1000]);
    const item = items[0] as number;
    await seedStockClaim(soId, lineIds[0] as number, item, 300);
    await post(soId, lineIds[0] as number, 500, uid());
    expect(await liveClaim(soId, item)).toBe(0);
    const rows = await db
      .select({ qty: saleReservations.qty })
      .from(saleReservations)
      .where(eq(saleReservations.soId, soId));
    for (const r of rows) expect(Number(r.qty)).toBeGreaterThanOrEqual(0);
  });

  test("BR-SO-58 another SO's claim on the same item is untouched", async () => {
    const a = await mkConfirmedSo([1000]);
    const b = await mkConfirmedSo([1000]);
    // same item for both claims: B's claim is seeded on A's item
    await seedStockClaim(
      a.soId,
      a.lineIds[0] as number,
      a.items[0] as number,
      300,
    );
    await seedStockClaim(
      b.soId,
      b.lineIds[0] as number,
      a.items[0] as number,
      200,
    );
    await post(a.soId, a.lineIds[0] as number, 300, uid());
    expect(await liveClaim(a.soId, a.items[0] as number)).toBe(0);
    expect(await liveClaim(b.soId, a.items[0] as number)).toBe(200);
  });

  test("BR-SO-58 cancelling the note does not restore the claim", async () => {
    const { soId, lineIds, items } = await mkConfirmedSo([1000]);
    const item = items[0] as number;
    await seedStockClaim(soId, lineIds[0] as number, item, 300);
    await post(soId, lineIds[0] as number, 300, uid());
    await cancelNote(soId, lineIds[0] as number, 300, uid());
    expect(await liveClaim(soId, item)).toBe(0);
  });
});
