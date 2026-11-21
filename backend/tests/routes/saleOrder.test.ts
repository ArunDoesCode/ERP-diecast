/**
 * HTTP-level tests for the sale order header, lines and lifecycle:
 * BR-SO-02, 04..20, 48, 52 (audit), 53 (hand-set PR link), 56, 57, 59..61.
 * Spec: docs/specs/sale-order/spec.md v1. Fixtures are TEST_so_ prefixed and
 * removed in afterAll. Dispatch hooks (BR-SO-54, 55, 58) are not routes and are
 * not covered here (see report).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  documentNumberCounters,
  rolePermissions,
  roles,
} from "../../src/db/schemas/01_auth";
import { itemMaster } from "../../src/db/schemas/02_procurement-catalog";
import {
  purchaseRequestItems,
  purchaseRequests,
} from "../../src/db/schemas/02_procurement-purchasing";
import { employees } from "../../src/db/schemas/03_hcm";
import {
  customers,
  saleOrderLines,
  saleOrders,
  salesAuditLog,
} from "../../src/db/schemas/05_sales";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const RUN = `TEST_so_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;
const EMAIL_PREFIX = "test_so_";

type Actor = { id: number; token: string; name: string };
const actors: Record<string, Actor> = {};
const customerIds: number[] = [];
const itemIds: number[] = [];
const soIds: number[] = [];
const prIds: number[] = [];
const roleIds: number[] = [];

function must<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`Fixture setup: ${what} returned no row`);
  return row;
}

/** Plant calendar day (IST), shifted by n days. */
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

async function mkCustomer(over: Record<string, unknown> = {}) {
  const res = await raw("bo", "POST", "/api/customers", {
    name: uid(),
    stateCode: "33",
    address: "Plot 4, Hosur",
    ...over,
  });
  expect(res.status).toBe(201);
  customerIds.push(res.json.data.id);
  return res.json.data.id as number;
}

async function mkItem(
  opts: { uom?: string; isActive?: boolean; category?: string } = {},
) {
  const sku = uid();
  const [row] = await db
    .insert(itemMaster)
    .values({
      sku,
      name: sku,
      category: opts.category ?? "Finished Good",
      uom: opts.uom ?? "pcs",
      isActive: opts.isActive ?? true,
    })
    .returning({ id: itemMaster.id, sku: itemMaster.sku });
  const r = must(row, "item");
  itemIds.push(r.id);
  return r;
}

const line = (itemId: number, over: Record<string, unknown> = {}) => ({
  itemId,
  qty: 10,
  unitPricePaise: 1000,
  gstPercent: 18,
  deliveryDate: istDay(30),
  ...over,
});

let customerId: number;
let itemA: { id: number; sku: string };
let itemB: { id: number; sku: string };

const payload = (over: Record<string, unknown> = {}) => ({
  customerId,
  orderDate: istDay(0),
  lines: [line(itemA.id)],
  ...over,
});

async function createSo(over: Record<string, unknown> = {}, actor = "bo") {
  const res = await call(actor, "POST", "", payload(over));
  if (res.status === 201) soIds.push(res.json.data.id);
  return res;
}

async function mkDraft(over: Record<string, unknown> = {}) {
  const res = await createSo(over);
  expect(res.status).toBe(201);
  return res.json.data;
}

async function detail(id: number) {
  const r = await call("owner", "GET", `/${id}`);
  return r.json.data;
}

async function confirm(id: number) {
  const d = await detail(id);
  return call("bo", "POST", `/${id}/confirm`, { editVersion: d.editVersion });
}

async function mkConfirmed(over: Record<string, unknown> = {}) {
  const d = await mkDraft(over);
  const r = await confirm(d.id);
  expect(r.status).toBe(200);
  return detail(d.id);
}

/** POST an action that needs the current editVersion. */
async function act(
  id: number,
  action: "hold" | "resume" | "close" | "cancel" | "confirm",
  extra: Record<string, unknown> = {},
  actor = "bo",
) {
  const d = await detail(id);
  return call(actor, "POST", `/${id}/${action}`, {
    editVersion: d.editVersion,
    ...extra,
  });
}

async function patch(id: number, body: Record<string, unknown>, actor = "bo") {
  const d = await detail(id);
  return call(actor, "PATCH", `/${id}`, {
    editVersion: d.editVersion,
    ...body,
  });
}

// biome-ignore lint/suspicious/noExplicitAny: reading JSON
const lineOf = (d: any, lineNo: number) =>
  // biome-ignore lint/suspicious/noExplicitAny: reading JSON
  d.lines.find((l: any) => l.lineNo === lineNo);

beforeAll(async () => {
  await makeActor("owner", "owner");
  await makeActor("bo", "back_office");
  await makeActor("fs", "floor_supervisor");
  await makeActor("qa", "qa_inspector");
  await makeCustomRole("viewer", ["so.view"]);
  customerId = await mkCustomer();
  itemA = await mkItem();
  itemB = await mkItem();
});

afterAll(async () => {
  if (soIds.length > 0) {
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
  if (roleIds.length > 0)
    await db.delete(roles).where(inArray(roles.id, roleIds));
});

describe("BR-SO-04 login and keys", () => {
  test("BR-SO-04 floor supervisor opening the SO list -> 403 PERMISSION_DENIED", async () => {
    const r = await call("fs", "GET", "");
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
  });

  test("BR-SO-04 qa inspector (no SO keys) is refused on read and write", async () => {
    expect((await call("qa", "GET", "")).status).toBe(403);
    expect((await call("qa", "POST", "", payload())).status).toBe(403);
  });

  test("BR-SO-04 no login -> 401 on read, write and action routes", async () => {
    expect((await call(null, "GET", "")).status).toBe(401);
    expect((await call(null, "GET", "/1")).status).toBe(401);
    expect((await call(null, "POST", "", payload())).status).toBe(401);
    expect((await call(null, "PATCH", "/1", { editVersion: 0 })).status).toBe(
      401,
    );
    expect(
      (await call(null, "POST", "/1/confirm", { editVersion: 0 })).status,
    ).toBe(401);
    expect((await call(null, "GET", "/1/audit")).status).toBe(401);
  });

  test("BR-SO-04 holder of only so.view reads but cannot write or run actions", async () => {
    const so = await mkConfirmed();
    expect((await call("viewer", "GET", "")).status).toBe(200);
    expect((await call("viewer", "GET", `/${so.id}`)).status).toBe(200);
    const body = { editVersion: so.editVersion, reason: "just because" };
    expect((await call("viewer", "POST", "", payload())).status).toBe(403);
    expect(
      (
        await call("viewer", "PATCH", `/${so.id}`, {
          editVersion: so.editVersion,
          notes: "x",
        })
      ).status,
    ).toBe(403);
    for (const a of ["confirm", "hold", "resume", "close", "cancel"]) {
      const r = await call("viewer", "POST", `/${so.id}/${a}`, body);
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("PERMISSION_DENIED");
    }
  });
});

describe("BR-SO-05 create", () => {
  test("BR-SO-05 saves header and lines as a draft, createdBy me, SO-<period>-<seq> number", async () => {
    const res = await createSo({
      lines: [line(itemA.id), line(itemB.id, { qty: 3 })],
    });
    expect(res.status).toBe(201);
    const d = res.json.data;
    expect(d.status).toBe("draft");
    expect(d.soNumber).toMatch(/^SO-\d{4}-\d{4,}$/);
    expect(d.createdByName).toBe(actors.bo?.name as string);
    expect(d.lines).toHaveLength(2);
    expect(d.lines.map((l: { lineNo: number }) => l.lineNo).sort()).toEqual([
      1, 2,
    ]);
    const [row] = await db
      .select({ createdBy: saleOrders.createdBy })
      .from(saleOrders)
      .where(eq(saleOrders.id, d.id));
    expect(row?.createdBy).toBe(actors.bo?.id as number);
  });

  test("BR-SO-05 two creates at once get different numbers", async () => {
    const [a, b] = await Promise.all([createSo(), createSo()]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.json.data.soNumber).not.toBe(b.json.data.soNumber);
  });

  test("BR-SO-05 a bad line item rejects the whole SO and saves nothing", async () => {
    const cust = await mkCustomer();
    const res = await call("bo", "POST", "", {
      customerId: cust,
      orderDate: istDay(0),
      lines: [line(itemA.id), line(999999999)],
    });
    expect(res.status).toBe(400);
    const rows = await db
      .select({ id: saleOrders.id })
      .from(saleOrders)
      .where(eq(saleOrders.customerId, cust));
    expect(rows).toHaveLength(0);
  });

  test("BR-SO-05 a number is never reused after cancel", async () => {
    const a = await mkDraft();
    expect((await act(a.id, "cancel", { reason: "wrong order" })).status).toBe(
      200,
    );
    const b = await mkDraft();
    expect(b.soNumber).not.toBe(a.soNumber);
  });
});

describe("BR-SO-06 header", () => {
  test("BR-SO-06 inactive customer -> 400 (also BR-SO-02)", async () => {
    const cust = await mkCustomer();
    await raw("bo", "PATCH", `/api/customers/${cust}`, { isActive: false });
    const res = await createSo({ customerId: cust });
    expect(res.status).toBe(400);
  });

  test("BR-SO-02 a draft cannot be re-pointed to an inactive customer", async () => {
    const cust = await mkCustomer();
    await raw("bo", "PATCH", `/api/customers/${cust}`, { isActive: false });
    const d = await mkDraft();
    const res = await patch(d.id, { customerId: cust });
    expect(res.status).toBe(400);
  });

  test("BR-SO-02 a customer deactivated after confirm leaves its open SO working", async () => {
    const cust = await mkCustomer();
    const so = await mkConfirmed({ customerId: cust });
    await raw("bo", "PATCH", `/api/customers/${cust}`, { isActive: false });
    expect(
      (await act(so.id, "hold", { reason: "customer asked" })).status,
    ).toBe(200);
    expect((await act(so.id, "resume")).status).toBe(200);
  });

  test("BR-SO-06 future order date -> 400", async () => {
    expect((await createSo({ orderDate: istDay(2) })).status).toBe(400);
  });

  test("BR-SO-06 no lines -> 400", async () => {
    expect((await createSo({ lines: [] })).status).toBe(400);
  });

  test("BR-SO-06 unknown customer -> 400 or 404", async () => {
    const res = await createSo({ customerId: 999999999 });
    expect([400, 404]).toContain(res.status);
  });

  test("BR-SO-06 same customer PO number twice for one customer -> 409 naming the other SO", async () => {
    const cust = await mkCustomer();
    const po = uid();
    const first = await mkDraft({ customerId: cust, customerPoNumber: po });
    const res = await createSo({ customerId: cust, customerPoNumber: po });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("CUSTOMER_PO_EXISTS");
    const named =
      res.json.details?.soNumber === first.soNumber ||
      String(res.json.message).includes(first.soNumber);
    expect(named).toBe(true);
  });

  test("BR-SO-06 the PO check ignores outer spaces", async () => {
    const cust = await mkCustomer();
    const po = uid();
    await mkDraft({ customerId: cust, customerPoNumber: po });
    const res = await createSo({
      customerId: cust,
      customerPoNumber: `  ${po} `,
    });
    expect(res.status).toBe(409);
  });

  test("BR-SO-06 the same PO number for another customer is fine", async () => {
    const po = uid();
    const c1 = await mkCustomer();
    const c2 = await mkCustomer();
    await mkDraft({ customerId: c1, customerPoNumber: po });
    expect(
      (await createSo({ customerId: c2, customerPoNumber: po })).status,
    ).toBe(201);
  });

  test("BR-SO-06 a cancelled SO frees its customer PO number", async () => {
    const cust = await mkCustomer();
    const po = uid();
    const first = await mkDraft({ customerId: cust, customerPoNumber: po });
    expect(
      (await act(first.id, "cancel", { reason: "customer withdrew" })).status,
    ).toBe(200);
    expect(
      (await createSo({ customerId: cust, customerPoNumber: po })).status,
    ).toBe(201);
  });

  test("BR-SO-06 customer PO number longer than 50 chars -> 400", async () => {
    expect((await createSo({ customerPoNumber: "P".repeat(51) })).status).toBe(
      400,
    );
  });

  test("BR-SO-06 editing a draft onto a taken customer PO number -> 409", async () => {
    const cust = await mkCustomer();
    const po = uid();
    await mkDraft({ customerId: cust, customerPoNumber: po });
    const other = await mkDraft({ customerId: cust });
    const res = await patch(other.id, { customerPoNumber: po });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("CUSTOMER_PO_EXISTS");
  });
});

describe("BR-SO-07 lines", () => {
  test("BR-SO-07 fractional qty on a pcs item -> 400", async () => {
    expect(
      (await createSo({ lines: [line(itemA.id, { qty: 10.5 })] })).status,
    ).toBe(400);
  });

  test("BR-SO-07 fractional qty on a set item -> 400, whole ok", async () => {
    const set = await mkItem({ uom: "set" });
    expect(
      (await createSo({ lines: [line(set.id, { qty: 1.5 })] })).status,
    ).toBe(400);
    expect((await createSo({ lines: [line(set.id, { qty: 2 })] })).status).toBe(
      201,
    );
  });

  test("BR-SO-07 kg item takes up to 3 decimals, not 4", async () => {
    const kg = await mkItem({ uom: "kg" });
    expect(
      (await createSo({ lines: [line(kg.id, { qty: 10.123 })] })).status,
    ).toBe(201);
    expect(
      (await createSo({ lines: [line(kg.id, { qty: 10.1234 })] })).status,
    ).toBe(400);
  });

  test("BR-SO-07 qty zero, negative or above 1,000,000 -> 400", async () => {
    for (const qty of [0, -1, 1_000_001]) {
      expect(
        (await createSo({ lines: [line(itemA.id, { qty })] })).status,
      ).toBe(400);
    }
  });

  test("BR-SO-07 price must be an integer in paise, not negative", async () => {
    expect(
      (await createSo({ lines: [line(itemA.id, { unitPricePaise: 185.5 })] }))
        .status,
    ).toBe(400);
    expect(
      (await createSo({ lines: [line(itemA.id, { unitPricePaise: -1 })] }))
        .status,
    ).toBe(400);
  });

  test("BR-SO-07 price 0 (sample) is allowed", async () => {
    expect(
      (await createSo({ lines: [line(itemA.id, { unitPricePaise: 0 })] }))
        .status,
    ).toBe(201);
  });

  test("BR-SO-07 delivery date in the past -> 400", async () => {
    expect(
      (
        await createSo({
          lines: [line(itemA.id, { deliveryDate: istDay(-1) })],
        })
      ).status,
    ).toBe(400);
  });

  test("BR-SO-07 inactive item -> 400", async () => {
    const off = await mkItem({ isActive: false });
    expect((await createSo({ lines: [line(off.id)] })).status).toBe(400);
  });

  test("BR-SO-07 the unit is copied from the item master", async () => {
    const kg = await mkItem({ uom: "kg" });
    const d = await mkDraft({ lines: [line(kg.id, { qty: 2 })] });
    expect(lineOf(d, 1).uom).toBe("kg");
  });

  test("BR-SO-07 delivery date moved to yesterday on a draft line -> 400", async () => {
    const d = await mkDraft();
    const res = await patch(d.id, {
      lines: [
        {
          id: d.lines[0].id,
          qty: 10,
          unitPricePaise: 1000,
          gstPercent: 18,
          deliveryDate: istDay(-1),
        },
      ],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SO-07 an overdue line whose date is untouched can still change price", async () => {
    const so = await mkConfirmed();
    await db
      .update(saleOrderLines)
      .set({ deliveryDate: istDay(-3) })
      .where(eq(saleOrderLines.id, so.lines[0].id));
    const l = so.lines[0];
    const res = await patch(so.id, {
      lines: [
        {
          id: l.id,
          qty: l.qty,
          unitPricePaise: 2000,
          gstPercent: l.gstPercent,
          deliveryDate: istDay(-3),
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(lineOf(res.json.data, 1).unitPricePaise).toBe(2000);
  });
});

describe("BR-SO-08 same item several dates", () => {
  test("BR-SO-08 same item on different dates is ok", async () => {
    const res = await createSo({
      lines: [
        line(itemA.id, { deliveryDate: istDay(20) }),
        line(itemA.id, { deliveryDate: istDay(50) }),
      ],
    });
    expect(res.status).toBe(201);
  });

  test("BR-SO-08 same item and same date twice -> 400", async () => {
    const res = await createSo({
      lines: [
        line(itemA.id, { deliveryDate: istDay(20) }),
        line(itemA.id, { deliveryDate: istDay(20) }),
      ],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SO-08 adding a line that repeats item and date on a draft -> 400", async () => {
    const d = await mkDraft({
      lines: [line(itemA.id, { deliveryDate: istDay(20) })],
    });
    const res = await patch(d.id, {
      lines: [line(itemA.id, { deliveryDate: istDay(20) })],
    });
    expect(res.status).toBe(400);
  });
});

describe("BR-SO-09 delivered qty", () => {
  test("BR-SO-09 a new line starts at delivered 0 and open = qty", async () => {
    const d = await mkDraft({ lines: [line(itemA.id, { qty: 1000 })] });
    expect(lineOf(d, 1).deliveredQty).toBe(0);
    expect(lineOf(d, 1).openQty).toBe(1000);
  });

  test("BR-SO-09 open qty = qty - delivered qty", async () => {
    const so = await mkConfirmed({ lines: [line(itemA.id, { qty: 1000 })] });
    await db
      .update(saleOrderLines)
      .set({ deliveredQty: "600" })
      .where(eq(saleOrderLines.id, so.lines[0].id));
    const d = await detail(so.id);
    expect(lineOf(d, 1).deliveredQty).toBe(600);
    expect(lineOf(d, 1).openQty).toBe(400);
  });

  test("BR-SO-09 an edit sending deliveredQty -> 400", async () => {
    const so = await mkConfirmed();
    const l = so.lines[0];
    const res = await patch(so.id, {
      lines: [
        {
          id: l.id,
          qty: l.qty,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
          deliveredQty: 5,
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(lineOf(await detail(so.id), 1).deliveredQty).toBe(0);
  });

  test("BR-SO-09 create sending deliveredQty -> 400", async () => {
    const res = await createSo({
      lines: [{ ...line(itemA.id), deliveredQty: 3 }],
    });
    expect(res.status).toBe(400);
  });
});

describe("BR-SO-10 draft edit", () => {
  test("BR-SO-10 edit that sets status -> 400", async () => {
    const d = await mkDraft();
    expect((await patch(d.id, { status: "confirmed" })).status).toBe(400);
    expect((await detail(d.id)).status).toBe("draft");
  });

  test("BR-SO-10 deleting the only line -> 400", async () => {
    const d = await mkDraft();
    const res = await patch(d.id, { removeLineIds: [d.lines[0].id] });
    expect(res.status).toBe(400);
    expect((await detail(d.id)).lines).toHaveLength(1);
  });

  test("BR-SO-10 a draft can change item, add lines and delete lines", async () => {
    const d = await mkDraft({
      lines: [line(itemA.id), line(itemB.id, { qty: 2 })],
    });
    const l1 = lineOf(d, 1);
    const l2 = lineOf(d, 2);
    const res = await patch(d.id, {
      lines: [
        {
          id: l1.id,
          itemId: itemB.id,
          qty: 5,
          unitPricePaise: 1000,
          gstPercent: 18,
          deliveryDate: istDay(60),
        },
      ],
      removeLineIds: [l2.id],
    });
    expect(res.status).toBe(200);
    expect(res.json.data.lines).toHaveLength(1);
    expect(res.json.data.lines[0].itemId).toBe(itemB.id);
  });

  test("BR-SO-10 an unknown body key is refused", async () => {
    const d = await mkDraft();
    expect((await patch(d.id, { somethingElse: 1 })).status).toBe(400);
  });

  test("BR-SO-10 untouched lines stay when other lines are sent", async () => {
    const d = await mkDraft({ lines: [line(itemA.id), line(itemB.id)] });
    const l1 = lineOf(d, 1);
    const res = await patch(d.id, {
      lines: [
        {
          id: l1.id,
          qty: 11,
          unitPricePaise: 1000,
          gstPercent: 18,
          deliveryDate: l1.deliveryDate,
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.json.data.lines).toHaveLength(2);
  });
});

describe("BR-SO-11 value", () => {
  test("BR-SO-11 value = sum of qty x price in paise, recomputed on change, no tax total", async () => {
    const kg = await mkItem({ uom: "kg" });
    const d = await mkDraft({
      customerId,
      lines: [
        line(itemA.id, { qty: 1000, unitPricePaise: 18500 }),
        line(kg.id, { qty: 0.125, unitPricePaise: 16000 }),
      ],
    });
    expect(d.totalAmountPaise).toBe(18_500_000 + 2000);
    expect(lineOf(d, 1).lineAmountPaise).toBe(18_500_000);
    const keys = Object.keys(d).join(",");
    expect(keys).not.toMatch(/tax|gstAmount/i);
    const res = await patch(d.id, {
      lines: [
        {
          id: lineOf(d, 1).id,
          qty: 500,
          unitPricePaise: 18500,
          gstPercent: 18,
          deliveryDate: lineOf(d, 1).deliveryDate,
        },
      ],
    });
    expect(res.json.data.totalAmountPaise).toBe(9_250_000 + 2000);
  });

  test("BR-SO-11 a removed line leaves the value (BR-SO-60)", async () => {
    const so = await mkConfirmed({
      lines: [
        line(itemA.id, { qty: 10, unitPricePaise: 1000 }),
        line(itemB.id, { qty: 5, unitPricePaise: 400 }),
      ],
    });
    expect(so.totalAmountPaise).toBe(12_000);
    const res = await patch(so.id, { removeLineIds: [lineOf(so, 2).id] });
    expect(res.status).toBe(200);
    expect(res.json.data.totalAmountPaise).toBe(10_000);
  });
});

describe("BR-SO-12 confirm", () => {
  test("BR-SO-12 draft -> confirmed, records who and when", async () => {
    const d = await mkDraft();
    const res = await act(d.id, "confirm");
    expect(res.status).toBe(200);
    expect(res.json.data.status).toBe("confirmed");
    expect(res.json.data.confirmedAt).not.toBeNull();
    const [row] = await db
      .select({ by: saleOrders.confirmedBy })
      .from(saleOrders)
      .where(eq(saleOrders.id, d.id));
    expect(row?.by).toBe(actors.bo?.id as number);
  });

  test("BR-SO-12 an item deactivated after the draft was saved -> 400 naming the item", async () => {
    const it = await mkItem();
    const d = await mkDraft({ lines: [line(it.id)] });
    await db
      .update(itemMaster)
      .set({ isActive: false })
      .where(eq(itemMaster.id, it.id));
    const res = await act(d.id, "confirm");
    expect(res.status).toBe(400);
    expect(String(res.json.message)).toContain(it.sku);
    expect((await detail(d.id)).status).toBe("draft");
  });

  test("BR-SO-12 a customer deactivated after the draft was saved -> 400", async () => {
    const cust = await mkCustomer();
    const d = await mkDraft({ customerId: cust });
    await raw("bo", "PATCH", `/api/customers/${cust}`, { isActive: false });
    expect((await act(d.id, "confirm")).status).toBe(400);
  });

  test("BR-SO-12 a delivery date that has passed -> 400", async () => {
    const d = await mkDraft();
    await db
      .update(saleOrderLines)
      .set({ deliveryDate: istDay(-1) })
      .where(eq(saleOrderLines.soId, d.id));
    expect((await act(d.id, "confirm")).status).toBe(400);
  });

  test("BR-SO-12 confirming a confirmed SO -> 409", async () => {
    const so = await mkConfirmed();
    expect((await act(so.id, "confirm")).status).toBe(409);
  });

  test("BR-SO-52 confirm with a stale editVersion -> 409 STALE_VERSION", async () => {
    const d = await mkDraft();
    const res = await call("bo", "POST", `/${d.id}/confirm`, {
      editVersion: d.editVersion + 5,
    });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("STALE_VERSION");
  });

  test("BR-SO-52 edit and confirm race: one wins, the other gets 409", async () => {
    const d = await mkDraft();
    const [a, b] = await Promise.all([
      call("bo", "PATCH", `/${d.id}`, {
        editVersion: d.editVersion,
        notes: "race",
      }),
      call("bo", "POST", `/${d.id}/confirm`, { editVersion: d.editVersion }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  test("BR-SO-52 two confirms with the same version: one 200, one 409", async () => {
    const d = await mkDraft();
    const [a, b] = await Promise.all([
      call("bo", "POST", `/${d.id}/confirm`, { editVersion: d.editVersion }),
      call("owner", "POST", `/${d.id}/confirm`, { editVersion: d.editVersion }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});

describe("BR-SO-13 confirmed edit", () => {
  test("BR-SO-13 changing an existing line's item -> 409 SO_FIELD_LOCKED", async () => {
    const so = await mkConfirmed();
    const l = so.lines[0];
    const res = await patch(so.id, {
      lines: [
        {
          id: l.id,
          itemId: itemB.id,
          qty: l.qty,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("SO_FIELD_LOCKED");
  });

  test("BR-SO-13 changing the customer -> 409 SO_FIELD_LOCKED", async () => {
    const so = await mkConfirmed();
    const other = await mkCustomer();
    const res = await patch(so.id, { customerId: other });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("SO_FIELD_LOCKED");
  });

  test("BR-SO-13 price, qty, GST %, date, notes and ship-to can change", async () => {
    const so = await mkConfirmed();
    const l = so.lines[0];
    const res = await patch(so.id, {
      notes: "revised",
      shipToAddress: "Plant 2, Hosur",
      shipToStateCode: "33",
      lines: [
        {
          id: l.id,
          qty: 12,
          unitPricePaise: 900,
          gstPercent: 12,
          deliveryDate: istDay(45),
          notes: "n",
        },
      ],
    });
    expect(res.status).toBe(200);
    const nl = lineOf(res.json.data, 1);
    expect(nl.qty).toBe(12);
    expect(nl.unitPricePaise).toBe(900);
    expect(nl.gstPercent).toBe(12);
    expect(nl.deliveryDate).toBe(istDay(45));
  });

  test("BR-SO-13 a price change is logged before -> after", async () => {
    const so = await mkConfirmed();
    const l = so.lines[0];
    await patch(so.id, {
      lines: [
        {
          id: l.id,
          qty: l.qty,
          unitPricePaise: 777,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
    const rows = await db
      .select()
      .from(salesAuditLog)
      .where(eq(salesAuditLog.soId, so.id));
    const withPrice = rows.filter((r) =>
      JSON.stringify(r.after ?? "").includes("777"),
    );
    expect(withPrice.length).toBeGreaterThan(0);
    expect(withPrice.every((r) => r.before !== null)).toBe(true);
  });

  test("BR-SO-13 a new line can be added to a confirmed SO", async () => {
    const so = await mkConfirmed();
    const res = await patch(so.id, { lines: [line(itemB.id, { qty: 4 })] });
    expect(res.status).toBe(200);
    expect(res.json.data.lines).toHaveLength(2);
  });
});

describe("BR-SO-14 qty and delete guards", () => {
  async function withDelivered(delivered: string) {
    const so = await mkConfirmed({
      lines: [line(itemA.id, { qty: 1000 }), line(itemB.id, { qty: 50 })],
    });
    await db
      .update(saleOrderLines)
      .set({ deliveredQty: delivered })
      .where(eq(saleOrderLines.id, lineOf(so, 1).id));
    return so;
  }

  test("BR-SO-14 qty below delivered -> 409 QTY_BELOW_DELIVERED", async () => {
    const so = await withDelivered("100");
    const l = lineOf(so, 1);
    const res = await patch(so.id, {
      lines: [
        {
          id: l.id,
          qty: 99,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("QTY_BELOW_DELIVERED");
  });

  test("BR-SO-14 qty exactly the delivered qty is allowed", async () => {
    const so = await withDelivered("100");
    const l = lineOf(so, 1);
    const res = await patch(so.id, {
      lines: [
        {
          id: l.id,
          qty: 100,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
    expect(res.status).toBe(200);
  });

  test("BR-SO-14 deleting a line with delivered qty -> 409 SO_LINE_DELIVERED", async () => {
    const so = await withDelivered("100");
    const res = await patch(so.id, { removeLineIds: [lineOf(so, 1).id] });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("SO_LINE_DELIVERED");
  });

  test("BR-SO-14 qty up is allowed", async () => {
    const so = await withDelivered("100");
    const l = lineOf(so, 1);
    const res = await patch(so.id, {
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
    expect(lineOf(res.json.data, 1).qty).toBe(1200);
  });
});

describe("BR-SO-53 hand-typed PR link locks nothing", () => {
  test("BR-SO-53 a PR typed with saleOrderId does not block a qty cut or a cancel", async () => {
    const so = await mkConfirmed({ lines: [line(itemA.id, { qty: 100 })] });
    const pr = await raw("bo", "POST", "/api/pr/createpr", {
      type: "misc",
      saleOrderId: so.id,
      notes: "typed by hand",
      items: [{ itemId: itemA.id, requestedQty: 5 }],
    });
    expect(pr.status).toBe(201);
    prIds.push(pr.json.data.pr.id);
    const l = so.lines[0];
    const cut = await patch(so.id, {
      lines: [
        {
          id: l.id,
          qty: 50,
          unitPricePaise: l.unitPricePaise,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
    expect(cut.status).toBe(200);
    expect(
      (await act(so.id, "cancel", { reason: "no longer needed" })).status,
    ).toBe(200);
  });
});

describe("BR-SO-15..19 hold, resume, close, cancel", () => {
  test("BR-SO-16 hold needs a reason of 3 to 500 chars (trimmed first, BR-SO-61)", async () => {
    const so = await mkConfirmed();
    expect((await act(so.id, "hold", { reason: "ab" })).status).toBe(400);
    expect((await act(so.id, "hold", { reason: "   ab  " })).status).toBe(400);
    expect((await act(so.id, "hold", { reason: "x".repeat(501) })).status).toBe(
      400,
    );
    expect((await act(so.id, "hold", {})).status).toBe(400);
    expect((await detail(so.id)).status).toBe("confirmed");
  });

  test("BR-SO-16 hold then resume returns it to confirmed", async () => {
    const so = await mkConfirmed();
    const h = await act(so.id, "hold", { reason: "credit check" });
    expect(h.status).toBe(200);
    expect(h.json.data.status).toBe("on_hold");
    expect(h.json.data.holdReason).toBe("credit check");
    const r = await act(so.id, "resume");
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("confirmed");
  });

  test("BR-SO-16 hold on a draft or resume on a confirmed SO -> 409", async () => {
    const d = await mkDraft();
    expect((await act(d.id, "hold", { reason: "nope" })).status).toBe(409);
    const so = await mkConfirmed();
    expect((await act(so.id, "resume")).status).toBe(409);
  });

  test("BR-SO-16 an on-hold SO cannot be edited -> 409 SO_NOT_EDITABLE", async () => {
    const so = await mkConfirmed();
    await act(so.id, "hold", { reason: "credit check" });
    const res = await patch(so.id, { notes: "x" });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("SO_NOT_EDITABLE");
  });

  test("BR-SO-17 close by hand from confirmed, recorded as manual and final", async () => {
    const so = await mkConfirmed();
    const res = await act(so.id, "close", { reason: "customer short-closed" });
    expect(res.status).toBe(200);
    expect(res.json.data.status).toBe("closed");
    expect(res.json.data.closeKind).toBe("manual");
    expect(res.json.data.closeReason).toBe("customer short-closed");
    expect((await act(so.id, "resume")).status).toBe(409);
    expect((await act(so.id, "hold", { reason: "again" })).status).toBe(409);
    expect((await act(so.id, "cancel", { reason: "again" })).status).toBe(409);
    expect((await act(so.id, "confirm")).status).toBe(409);
  });

  test("BR-SO-17 close by hand from on_hold, reason 3..500 chars", async () => {
    const so = await mkConfirmed();
    await act(so.id, "hold", { reason: "waiting" });
    expect((await act(so.id, "close", { reason: "ab" })).status).toBe(400);
    expect((await act(so.id, "close", { reason: "done by hand" })).status).toBe(
      200,
    );
  });

  test("BR-SO-17 a draft cannot be closed -> 409", async () => {
    const d = await mkDraft();
    expect((await act(d.id, "close", { reason: "not yet" })).status).toBe(409);
  });

  test("BR-SO-18 a draft can always be cancelled, reason needed", async () => {
    const d = await mkDraft();
    expect((await act(d.id, "cancel", { reason: "no" })).status).toBe(400);
    const res = await act(d.id, "cancel", { reason: "entered twice" });
    expect(res.status).toBe(200);
    expect(res.json.data.status).toBe("cancelled");
    expect(res.json.data.cancelReason).toBe("entered twice");
  });

  test("BR-SO-18 confirmed and on-hold SOs with nothing delivered can be cancelled", async () => {
    const a = await mkConfirmed();
    expect(
      (await act(a.id, "cancel", { reason: "order withdrawn" })).status,
    ).toBe(200);
    const b = await mkConfirmed();
    await act(b.id, "hold", { reason: "waiting" });
    expect(
      (await act(b.id, "cancel", { reason: "order withdrawn" })).status,
    ).toBe(200);
  });

  test("BR-SO-18 cancel with delivered qty > 0 -> 409 HAS_DELIVERIES (close instead)", async () => {
    const so = await mkConfirmed({ lines: [line(itemA.id, { qty: 1000 })] });
    await db
      .update(saleOrderLines)
      .set({ deliveredQty: "100" })
      .where(eq(saleOrderLines.id, so.lines[0].id));
    const res = await act(so.id, "cancel", { reason: "customer changed mind" });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("HAS_DELIVERIES");
    expect((await detail(so.id)).status).toBe("confirmed");
  });

  test("BR-SO-20 a cancelled SO stays, shows cancelled, and cannot be edited", async () => {
    const d = await mkDraft();
    await act(d.id, "cancel", { reason: "entered twice" });
    const read = await call("bo", "GET", `/${d.id}`);
    expect(read.status).toBe(200);
    expect(read.json.data.status).toBe("cancelled");
    expect(read.json.data.soNumber).toBe(d.soNumber);
    const res = await patch(d.id, { notes: "x" });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("SO_NOT_EDITABLE");
  });

  test("BR-SO-20 a closed SO cannot be edited -> 409 SO_NOT_EDITABLE", async () => {
    const so = await mkConfirmed();
    await act(so.id, "close", { reason: "done by hand" });
    const res = await patch(so.id, { notes: "x" });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("SO_NOT_EDITABLE");
  });

  test("BR-SO-20 there is no delete route for sale orders", async () => {
    const d = await mkDraft();
    const res = await call("owner", "DELETE", `/${d.id}`);
    expect([404, 405]).toContain(res.status);
    expect((await call("bo", "GET", `/${d.id}`)).status).toBe(200);
  });
});

describe("BR-SO-56 ship-to", () => {
  test("BR-SO-56 address without a state -> 400", async () => {
    expect((await createSo({ shipToAddress: "Plant 2, Hosur" })).status).toBe(
      400,
    );
  });

  test("BR-SO-56 address with state is stored; both empty is fine", async () => {
    const a = await createSo({
      shipToAddress: "Plant 2, Hosur",
      shipToStateCode: "33",
    });
    expect(a.status).toBe(201);
    expect(a.json.data.shipToAddress).toBe("Plant 2, Hosur");
    expect(a.json.data.shipToStateCode).toBe("33");
    const b = await createSo({});
    expect(b.json.data.shipToAddress).toBeNull();
  });

  test("BR-SO-56 address longer than 300 chars -> 400", async () => {
    const res = await createSo({
      shipToAddress: "A".repeat(301),
      shipToStateCode: "33",
    });
    expect(res.status).toBe(400);
  });

  test("BR-SO-56 edit that sets an address without a state -> 400", async () => {
    const d = await mkDraft();
    expect((await patch(d.id, { shipToAddress: "Plant 2" })).status).toBe(400);
  });
});

describe("BR-SO-57 GST percent", () => {
  test("BR-SO-57 values from the allowed list are accepted", async () => {
    for (const gstPercent of [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40]) {
      const res = await createSo({ lines: [line(itemA.id, { gstPercent })] });
      expect(res.status).toBe(201);
      expect(lineOf(res.json.data, 1).gstPercent).toBe(gstPercent);
    }
  });

  test("BR-SO-57 17 -> 400, missing -> 400", async () => {
    expect(
      (await createSo({ lines: [line(itemA.id, { gstPercent: 17 })] })).status,
    ).toBe(400);
    const l: Record<string, unknown> = line(itemA.id);
    delete l.gstPercent;
    expect((await createSo({ lines: [l] })).status).toBe(400);
  });
});

describe("BR-SO-59 line ownership", () => {
  test("BR-SO-59 a line id of another SO -> 404, nothing saved", async () => {
    const a = await mkDraft({ lines: [line(itemA.id), line(itemB.id)] });
    const b = await mkDraft();
    const foreign = b.lines[0];
    const res = await patch(a.id, {
      notes: "should not be saved",
      lines: [
        {
          id: foreign.id,
          qty: 77,
          unitPricePaise: 1000,
          gstPercent: 18,
          deliveryDate: istDay(30),
        },
      ],
    });
    expect(res.status).toBe(404);
    expect((await detail(b.id)).lines[0].qty).toBe(foreign.qty);
    expect((await detail(a.id)).notes).toBeNull();
  });

  test("BR-SO-59 a removeLineIds entry of another SO -> 404, nothing removed", async () => {
    const a = await mkDraft({ lines: [line(itemA.id), line(itemB.id)] });
    const b = await mkDraft();
    const res = await patch(a.id, {
      removeLineIds: [lineOf(a, 2).id, b.lines[0].id],
    });
    expect(res.status).toBe(404);
    expect((await detail(a.id)).lines).toHaveLength(2);
    expect((await detail(b.id)).lines).toHaveLength(1);
  });

  test("BR-SO-59 the same holds on a confirmed SO", async () => {
    const a = await mkConfirmed();
    const b = await mkConfirmed();
    const res = await patch(a.id, { removeLineIds: [b.lines[0].id] });
    expect(res.status).toBe(404);
  });
});

describe("BR-SO-60 soft removal", () => {
  test("BR-SO-60 removed line is hidden and its number is never reused", async () => {
    const so = await mkConfirmed({ lines: [line(itemA.id), line(itemB.id)] });
    const rm = await patch(so.id, { removeLineIds: [lineOf(so, 2).id] });
    expect(rm.status).toBe(200);
    expect(rm.json.data.lines.map((l: { lineNo: number }) => l.lineNo)).toEqual(
      [1],
    );
    const it = await mkItem();
    const add = await patch(so.id, { lines: [line(it.id)] });
    expect(add.status).toBe(200);
    expect(
      add.json.data.lines.map((l: { lineNo: number }) => l.lineNo).sort(),
    ).toEqual([1, 3]);
  });

  test("BR-SO-60 the removed row is kept in the database", async () => {
    const so = await mkConfirmed({ lines: [line(itemA.id), line(itemB.id)] });
    await patch(so.id, { removeLineIds: [lineOf(so, 2).id] });
    const rows = await db
      .select({ id: saleOrderLines.id })
      .from(saleOrderLines)
      .where(eq(saleOrderLines.soId, so.id));
    expect(rows).toHaveLength(2);
  });

  test("BR-SO-60 a line with delivered qty cannot be removed -> 409 SO_LINE_DELIVERED", async () => {
    const so = await mkConfirmed({ lines: [line(itemA.id), line(itemB.id)] });
    await db
      .update(saleOrderLines)
      .set({ deliveredQty: "1" })
      .where(eq(saleOrderLines.id, lineOf(so, 1).id));
    const res = await patch(so.id, { removeLineIds: [lineOf(so, 1).id] });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("SO_LINE_DELIVERED");
  });

  test("BR-SO-60 removing a line twice -> 404 (already removed)", async () => {
    const so = await mkConfirmed({ lines: [line(itemA.id), line(itemB.id)] });
    const id = lineOf(so, 2).id;
    await patch(so.id, { removeLineIds: [id] });
    expect((await patch(so.id, { removeLineIds: [id] })).status).toBe(404);
  });
});

describe("BR-SO-61 trims and date range", () => {
  test("BR-SO-61 notes and customer PO number are trimmed before storing and length check", async () => {
    const po = uid();
    const res = await createSo({
      customerPoNumber: `  ${po}  `,
      notes: "  hello  ",
    });
    expect(res.status).toBe(201);
    expect(res.json.data.customerPoNumber).toBe(po);
    expect(res.json.data.notes).toBe("hello");
  });

  test("BR-SO-61 a 50-char PO number with outer spaces passes the length check", async () => {
    const po = "P".repeat(40) + String(Date.now()).slice(-10);
    expect(po).toHaveLength(50);
    const res = await createSo({ customerPoNumber: `  ${po}  ` });
    expect(res.status).toBe(201);
  });

  test("BR-SO-61 delivery date 15 Jan 2099 -> 400", async () => {
    expect(
      (
        await createSo({
          lines: [line(itemA.id, { deliveryDate: "2099-01-15" })],
        })
      ).status,
    ).toBe(400);
  });

  test("BR-SO-61 order date before 2000-01-01 -> 400", async () => {
    expect((await createSo({ orderDate: "1999-12-31" })).status).toBe(400);
  });

  test("BR-SO-61 customer PO date outside the range -> 400", async () => {
    expect((await createSo({ customerPoDate: "1999-01-01" })).status).toBe(400);
    expect((await createSo({ customerPoDate: "2099-01-01" })).status).toBe(400);
  });

  test("BR-SO-61 notes of only spaces count as empty -> 400 or absent", async () => {
    const res = await createSo({ notes: "     " });
    if (res.status === 201) expect(res.json.data.notes).toBeNull();
    else expect(res.status).toBe(400);
  });
});

describe("BR-SO-48 PR saleOrderId must name a confirmed SO", () => {
  const mkPr = (saleOrderId: number | undefined) =>
    raw("bo", "POST", "/api/pr/createpr", {
      type: "misc",
      ...(saleOrderId === undefined ? {} : { saleOrderId }),
      notes: "so link check",
      items: [{ itemId: itemA.id, requestedQty: 1 }],
    });

  test("BR-SO-48 an SO id that does not exist -> 400", async () => {
    const res = await mkPr(999999);
    expect(res.status).toBe(400);
  });

  test("BR-SO-48 a draft SO -> 400", async () => {
    const d = await mkDraft();
    expect((await mkPr(d.id)).status).toBe(400);
  });

  test("BR-SO-48 a cancelled SO -> 400", async () => {
    const d = await mkDraft();
    await act(d.id, "cancel", { reason: "entered twice" });
    expect((await mkPr(d.id)).status).toBe(400);
  });

  test("BR-SO-48 a confirmed SO is accepted and the PR keeps its own type", async () => {
    const so = await mkConfirmed();
    const res = await mkPr(so.id);
    expect(res.status).toBe(201);
    prIds.push(res.json.data.pr.id);
    expect(res.json.data.pr.saleOrderId).toBe(so.id);
    expect(res.json.data.pr.type).toBe("misc");
  });

  test("BR-SO-48 a PR without saleOrderId is unaffected", async () => {
    const res = await mkPr(undefined);
    expect(res.status).toBe(201);
    prIds.push(res.json.data.pr.id);
  });
});

describe("BR-SO-52 audit trail", () => {
  test("BR-SO-52 create, edit, confirm, hold, resume, close write who and when", async () => {
    const d = await mkDraft();
    await patch(d.id, { notes: "audit me" });
    await act(d.id, "confirm");
    await act(d.id, "hold", { reason: "waiting" });
    await act(d.id, "resume");
    await act(d.id, "close", { reason: "done by hand" });
    const res = await call("bo", "GET", `/${d.id}/audit?pageSize=100`);
    expect(res.status).toBe(200);
    expect(res.json.data.length).toBeGreaterThanOrEqual(6);
    for (const r of res.json.data) {
      expect(r.actorId).toBe(actors.bo?.id as number);
      expect(r.actorName).toBe(actors.bo?.name as string);
      expect(r.at).toBeTruthy();
    }
    const actions = new Set(
      res.json.data.map((r: { action: string }) => r.action),
    );
    expect(actions.size).toBeGreaterThanOrEqual(5);
  });

  test("BR-SO-52 cancel is audited with before -> after", async () => {
    const d = await mkDraft();
    await act(d.id, "cancel", { reason: "entered twice" });
    const rows = await db
      .select()
      .from(salesAuditLog)
      .where(eq(salesAuditLog.soId, d.id));
    const withStatus = rows.filter((r) =>
      JSON.stringify(r.after ?? "").includes("cancelled"),
    );
    expect(withStatus.length).toBeGreaterThan(0);
    expect(withStatus[0]?.before).not.toBeNull();
  });

  test("BR-SO-52 audit of an unknown SO -> 404; floor supervisor -> 403", async () => {
    expect((await call("bo", "GET", "/999999999/audit")).status).toBe(404);
    const d = await mkDraft();
    expect((await call("fs", "GET", `/${d.id}/audit`)).status).toBe(403);
  });

  test("BR-SO-52 a rejected edit writes no audit row", async () => {
    const d = await mkDraft();
    const before = await db
      .select({ id: salesAuditLog.id })
      .from(salesAuditLog)
      .where(eq(salesAuditLog.soId, d.id));
    await patch(d.id, { status: "confirmed" });
    const after = await db
      .select({ id: salesAuditLog.id })
      .from(salesAuditLog)
      .where(eq(salesAuditLog.soId, d.id));
    expect(after).toHaveLength(before.length);
  });
});

describe("SO list and detail", () => {
  test("BR-SO-05 list filters by status CSV and returns statusCounts", async () => {
    const cust = await mkCustomer();
    await mkDraft({ customerId: cust });
    await mkConfirmed({ customerId: cust });
    const res = await call(
      "bo",
      "GET",
      `?customerId=${cust}&status=draft,confirmed&pageSize=100`,
    );
    expect(res.status).toBe(200);
    expect(res.json.data).toHaveLength(2);
    const counts = res.json.meta.statusCounts;
    expect(Object.keys(counts).sort()).toEqual([
      "cancelled",
      "closed",
      "confirmed",
      "draft",
      "on_hold",
    ]);
    const only = await call(
      "bo",
      "GET",
      `?customerId=${cust}&status=confirmed`,
    );
    expect(only.json.data).toHaveLength(1);
    expect(only.json.meta.statusCounts.draft).toBe(1);
  });

  test("BR-SO-05 unknown status value -> 400", async () => {
    expect((await call("bo", "GET", "?status=nonsense")).status).toBe(400);
  });

  test("BR-SO-05 search by customer PO number finds the SO", async () => {
    const po = `${uid()}_PO`;
    const d = await mkDraft({ customerPoNumber: po });
    const res = await call("bo", "GET", `?q=${encodeURIComponent(po)}`);
    expect(res.status).toBe(200);
    expect(res.json.data.some((r: { id: number }) => r.id === d.id)).toBe(true);
  });

  test("BR-SO-05 detail of an unknown SO -> 404", async () => {
    expect((await call("bo", "GET", "/999999999")).status).toBe(404);
  });

  test("BR-SO-05 list rejects a sortBy outside the whitelist", async () => {
    expect((await call("bo", "GET", "?sortBy=notes")).status).toBe(400);
  });
});
