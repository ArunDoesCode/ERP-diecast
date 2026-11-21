/**
 * Stock transfer: post, reverse, ledger, movements (docs/specs/stock-transfer/spec.md v1:
 * BR-STR-02, 03, 06, 09, 11..26, 33, 34, 35).
 * Real DB, full HTTP stack via createApp(). Fixtures are TEST_strpost_ prefixed, removed in afterAll.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
  stockTransferItems,
  stockTransfers,
} from "../../src/db/schemas/02_procurement-catalog";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

type Role =
  | "owner"
  | "back_office"
  | "floor_supervisor"
  | "qa_inspector"
  | "operator"
  | "super-admin";

const app = createApp();
const RUN = `TEST_strpost_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

// The caller's role is read from the employee row, so each role gets a real employee.
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
const tokens = new Map<Role, string>();
async function tokenFor(role: Role) {
  let t = tokens.get(role);
  if (!t) {
    t = await signAccessToken({
      userId: await userFor(role),
      userName: `${RUN}_${role}`,
      role,
      allowedPages: [],
    });
    tokens.set(role, t);
  }
  return t;
}
async function raw(
  method: string,
  url: string,
  role: Role | null,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (role) headers.Authorization = `Bearer ${await tokenFor(role)}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const call = (
  method: string,
  path: string,
  role: Role | null,
  body?: unknown,
) => raw(method, `/api/stock-transfer${path}`, role, body);
const asset = (method: string, path: string, role: Role, body?: unknown) =>
  raw(method, `/api/asset${path}`, role, body);

const itemIds: number[] = [];
const supplierIds: number[] = [];
const transferIds: number[] = [];

async function mkItem(over: Partial<typeof itemMaster.$inferInsert> = {}) {
  const [i] = await db
    .insert(itemMaster)
    .values({
      sku: uid(),
      name: `${RUN} item`,
      category: "Raw Material",
      uom: "kg",
      ...over,
    })
    .returning({ id: itemMaster.id });
  itemIds.push(i!.id);
  return i!.id;
}
async function mkLoc(
  type: "store" | "finished_goods" | "scrap_yard" = "store",
  over: Record<string, unknown> = {},
) {
  const r = await asset("POST", "/locations", "back_office", {
    name: uid(),
    type,
    ...over,
  });
  if (r.status !== 201)
    throw new Error(`fixture location failed: ${JSON.stringify(r.json)}`);
  return r.json.data.id as number;
}
async function mkVendorLoc() {
  const [s] = await db
    .insert(supplierMaster)
    .values({ name: uid(), gstNumber: `27${uid().slice(-12)}` })
    .returning({ id: supplierMaster.id });
  supplierIds.push(s!.id);
  const r = await asset("POST", "/locations", "back_office", {
    name: uid(),
    type: "vendor_premise",
    linkedVendorId: s!.id,
  });
  if (r.status !== 201)
    throw new Error(
      `fixture vendor location failed: ${JSON.stringify(r.json)}`,
    );
  return r.json.data.id as number;
}
/** Opening stock through the real movement route (stock only moves through the ledger). */
async function stockAt(
  itemId: number,
  locationId: number,
  qty: number,
  cost = 21333,
) {
  const r = await asset("POST", "/inventory/movements", "owner", {
    itemId,
    locationId,
    referenceType: "opening_stock",
    qty,
    unitCostPaise: cost,
    reason: "test opening",
  });
  if (r.status !== 201)
    throw new Error(`fixture opening stock failed: ${JSON.stringify(r.json)}`);
}
async function mkDraft(
  over: Record<string, unknown> = {},
  role: Role = "back_office",
) {
  const r = await call("POST", "", role, over);
  if (r.status === 201) transferIds.push(r.json.data.id);
  return r;
}
async function mustDraft(over: Record<string, unknown>) {
  const r = await mkDraft(over);
  if (r.status !== 201)
    throw new Error(`fixture draft failed: ${JSON.stringify(r.json)}`);
  return r.json.data as { id: number; transferNumber: string; status: string };
}
const detail = async (id: number) => {
  const r = await call("GET", `/${id}`, "owner");
  expect(r.status).toBe(200);
  return r.json.data;
};
const ledgerFor = (ids: number[]) =>
  db.select().from(inventoryLedger).where(inArray(inventoryLedger.itemId, ids));
const transferLedger = (id: number) =>
  db
    .select()
    .from(inventoryLedger)
    .where(eq(inventoryLedger.referenceId, id))
    .then((rows) =>
      rows.filter(
        (r) =>
          r.referenceType === "stock_transfer" ||
          r.referenceType === "stock_transfer_reversal",
      ),
    );
const istYear = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(new Date());
const istDay = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

afterAll(async () => {
  const empIds = [...roleUsers.values()];
  const all = [
    ...transferIds,
    ...(empIds.length
      ? (
          await db
            .select({ id: stockTransfers.id })
            .from(stockTransfers)
            .where(inArray(stockTransfers.createdBy, empIds))
        ).map((t) => t.id)
      : []),
  ];
  if (itemIds.length) {
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, itemIds));
  }
  if (all.length) {
    await db
      .delete(stockTransferItems)
      .where(inArray(stockTransferItems.transferId, all));
    await db.delete(stockTransfers).where(inArray(stockTransfers.id, all));
  }
  if (itemIds.length) {
    await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
  }
  if (empIds.length) {
    await db.delete(locations).where(inArray(locations.createdBy, empIds));
  }
  if (supplierIds.length) {
    await db
      .delete(supplierMaster)
      .where(inArray(supplierMaster.id, supplierIds));
  }
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
});

type Fx = {
  a: number;
  b: number;
  item: number;
  d: { id: number; transferNumber: string };
};
/** Item with stock at source `a`, a draft moving `qty` of it to `b`. */
async function mkTransfer(
  o: { qty?: number; stock?: number; cost?: number; uom?: string } = {},
): Promise<Fx> {
  const a = await mkLoc();
  const b = await mkLoc();
  const item = await mkItem({ uom: o.uom ?? "kg" });
  await stockAt(item, a, o.stock ?? 1500, o.cost ?? 21333);
  const d = await mustDraft({
    sourceLocationId: a,
    destinationLocationId: b,
    lines: [{ itemId: item, qty: o.qty ?? 200 }],
  });
  return { a, b, item, d };
}
const post = (id: number, role: Role = "back_office") =>
  call("POST", `/${id}/post`, role, {});
const reverse = (
  id: number,
  reason: string | null = "wrong store",
  role: Role = "back_office",
) => call("POST", `/${id}/reverse`, role, reason === null ? {} : { reason });
async function mustPost(fx: Fx) {
  const r = await post(fx.d.id);
  if (r.status !== 200)
    throw new Error(`fixture post failed: ${JSON.stringify(r.json)}`);
  return r.json.data;
}
async function balance(itemId: number, locationId: number) {
  const rows = await db
    .select()
    .from(inventoryLedger)
    .where(eq(inventoryLedger.itemId, itemId));
  return rows
    .filter((r) => r.locationId === locationId)
    .reduce((n, r) => n + r.quantityChange, 0);
}
const itemRow = async (id: number) =>
  (await db.select().from(itemMaster).where(eq(itemMaster.id, id)))[0]!;
const setLocActive = (id: number, isActive: boolean) =>
  db.update(locations).set({ isActive }).where(eq(locations.id, id));

describe("post: two ledger rows per line (BR-STR-11, 14, 15, 18, 35)", () => {
  test("BR-STR-11 posting writes an out row at the source and an in row at the destination, per line, and sets status posted", async () => {
    const fx = await mkTransfer();
    const r = await post(fx.d.id);
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("posted");
    expect(await balance(fx.item, fx.a)).toBe(1300);
    expect(await balance(fx.item, fx.b)).toBe(200);
    const rows = await transferLedger(fx.d.id);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.referenceType).toBe("stock_transfer");
    const out = rows.find((x) => x.transactionType === "out")!;
    const inn = rows.find((x) => x.transactionType === "in")!;
    expect(out.locationId).toBe(fx.a);
    expect(out.quantityChange).toBe(-200);
    expect(inn.locationId).toBe(fx.b);
    expect(inn.quantityChange).toBe(200);
    const got = await detail(fx.d.id);
    expect(got.status).toBe("posted");
    const lineId = got.lines[0].lineId;
    expect(out.referenceLineId).toBe(lineId);
    expect(inn.referenceLineId).toBe(lineId);
  });

  test("BR-STR-11 a transfer with two lines writes four rows", async () => {
    const fx = await mkTransfer();
    const item2 = await mkItem();
    await stockAt(item2, fx.a, 100, 5000);
    const d = await mustDraft({
      sourceLocationId: fx.a,
      destinationLocationId: fx.b,
      lines: [
        { itemId: fx.item, qty: 10 },
        { itemId: item2, qty: 20 },
      ],
    });
    expect((await post(d.id)).status).toBe(200);
    expect(await transferLedger(d.id)).toHaveLength(4);
    expect(await balance(item2, fx.b)).toBe(20);
  });

  test("BR-STR-14 both rows carry the plant average cost, equal and opposite, netting to 0", async () => {
    const fx = await mkTransfer();
    const r = await post(fx.d.id);
    expect(r.json.data.lines[0].unitCostPaise).toBe(21333);
    expect(r.json.data.lines[0].valuePaise).toBe(4_266_600);
    const rows = await transferLedger(fx.d.id);
    const out = rows.find((x) => x.transactionType === "out")!;
    const inn = rows.find((x) => x.transactionType === "in")!;
    expect(out.unitCostPaise).toBe(21333);
    expect(inn.unitCostPaise).toBe(21333);
    expect(out.totalValueChangePaise).toBe(-4_266_600);
    expect(inn.totalValueChangePaise).toBe(4_266_600);
    expect(out.totalValueChangePaise + inn.totalValueChangePaise).toBe(0);
    const got = await detail(fx.d.id);
    expect(got.lines[0].postedUnitCostPaise).toBe(21333);
    expect(got.lines[0].postedValuePaise).toBe(4_266_600);
    expect(got.lines[0].sourceBalanceQty).toBeNull();
    expect(got.ledgerRows).toHaveLength(2);
  });

  test("BR-STR-15 posting never changes the item's current stock or average cost", async () => {
    const fx = await mkTransfer();
    const before = await itemRow(fx.item);
    await mustPost(fx);
    const after = await itemRow(fx.item);
    expect(after.currentStock).toBe(before.currentStock);
    expect(after.currentStock).toBe(1500);
    expect(after.averageCostPaise).toBe(before.averageCostPaise);
    expect(after.averageCostPaise).toBe(21333);
  });

  test("BR-STR-18 posting saves who and the server time", async () => {
    const fx = await mkTransfer();
    const t0 = Date.now() - 2000;
    await mustPost(fx);
    const got = await detail(fx.d.id);
    expect(got.postedBy.id).toBe(await userFor("back_office"));
    const at = new Date(got.postedAt).getTime();
    expect(at).toBeGreaterThanOrEqual(t0);
    expect(at).toBeLessThanOrEqual(Date.now() + 2000);
  });

  test("BR-STR-35 posting writes only the ledger rows: no extra rows for the item", async () => {
    const fx = await mkTransfer();
    const before = (
      await db
        .select()
        .from(inventoryLedger)
        .where(eq(inventoryLedger.itemId, fx.item))
    ).length;
    await mustPost(fx);
    const after = (
      await db
        .select()
        .from(inventoryLedger)
        .where(eq(inventoryLedger.itemId, fx.item))
    ).length;
    expect(after - before).toBe(2);
  });

  test("BR-STR-33 finished goods to scrap yard moves the balance but not plant stock or value", async () => {
    const fg = await mkLoc("finished_goods");
    const sy = await mkLoc("scrap_yard");
    const item = await mkItem({ uom: "pcs" });
    await stockAt(item, fg, 200, 8000);
    const d = await mustDraft({
      sourceLocationId: fg,
      destinationLocationId: sy,
      lines: [{ itemId: item, qty: 50 }],
    });
    expect((await post(d.id)).status).toBe(200);
    expect(await balance(item, fg)).toBe(150);
    expect(await balance(item, sy)).toBe(50);
    const row = await itemRow(item);
    expect(row.currentStock).toBe(200);
    expect(row.averageCostPaise).toBe(8000);
  });
});

describe("post: atomic and stock checks (BR-STR-12, 13, 17)", () => {
  test("BR-STR-12 if line 2 is short nothing posts, the draft stays a draft and the error names line 2", async () => {
    const fx = await mkTransfer();
    const item2 = await mkItem();
    await stockAt(item2, fx.a, 5, 5000);
    const d = await mustDraft({
      sourceLocationId: fx.a,
      destinationLocationId: fx.b,
      lines: [
        { itemId: fx.item, qty: 10 },
        { itemId: item2, qty: 10 },
      ],
    });
    const r = await post(d.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("STR_INSUFFICIENT_STOCK");
    expect(String(r.json.message)).toContain("Line 2");
    expect(await transferLedger(d.id)).toHaveLength(0);
    expect(await balance(fx.item, fx.a)).toBe(1500);
    expect((await detail(d.id)).status).toBe("draft");
  });

  test("BR-STR-13 the check is per location, not plant total", async () => {
    const a = await mkLoc();
    const b = await mkLoc();
    const other = await mkLoc();
    const item = await mkItem();
    await stockAt(item, a, 150);
    await stockAt(item, other, 750);
    const d = await mustDraft({
      sourceLocationId: a,
      destinationLocationId: b,
      lines: [{ itemId: item, qty: 200 }],
    });
    const r = await post(d.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("STR_INSUFFICIENT_STOCK");
    expect(await transferLedger(d.id)).toHaveLength(0);
  });

  test("BR-STR-13 moving exactly the whole source balance is allowed", async () => {
    const fx = await mkTransfer({ stock: 200, qty: 200 });
    expect((await post(fx.d.id)).status).toBe(200);
    expect(await balance(fx.item, fx.a)).toBe(0);
  });

  test("BR-STR-17 posting a posted transfer is 409 STR_NOT_DRAFT and adds no rows", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    const r = await post(fx.d.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("STR_NOT_DRAFT");
    expect(await transferLedger(fx.d.id)).toHaveLength(2);
  });

  test("BR-STR-17 two posts at once: one 200, one 409, two ledger rows in total", async () => {
    const fx = await mkTransfer();
    const [x, y] = await Promise.all([post(fx.d.id), post(fx.d.id, "owner")]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(await transferLedger(fx.d.id)).toHaveLength(2);
    expect(await balance(fx.item, fx.a)).toBe(1300);
  });

  test("BR-STR-17 posting a transfer that does not exist is 404", async () => {
    expect((await post(2147483000)).status).toBe(404);
  });
});

describe("post: checks repeated at posting (BR-STR-02, 03, 06, 16)", () => {
  test("BR-STR-02 a destination deactivated after the draft was saved: post is 400 and posts nothing", async () => {
    const fx = await mkTransfer();
    await setLocActive(fx.b, false);
    const r = await post(fx.d.id);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("STR_LOCATION_INACTIVE");
    expect(await transferLedger(fx.d.id)).toHaveLength(0);
    expect((await detail(fx.d.id)).status).toBe("draft");
  });

  test("BR-STR-02 a source deactivated after the draft was saved: post is 400", async () => {
    const fx = await mkTransfer();
    await setLocActive(fx.a, false);
    const r = await post(fx.d.id);
    expect(r.status).toBe(400);
    expect(await transferLedger(fx.d.id)).toHaveLength(0);
  });

  test("BR-STR-03 a destination that became a job worker location: post is 400 and posts nothing", async () => {
    const fx = await mkTransfer();
    const [s] = await db
      .insert(supplierMaster)
      .values({ name: uid(), gstNumber: `27${uid().slice(-12)}` })
      .returning({ id: supplierMaster.id });
    supplierIds.push(s!.id);
    await db
      .update(locations)
      .set({ type: "vendor_premise", linkedVendorId: s!.id })
      .where(eq(locations.id, fx.b));
    const r = await post(fx.d.id);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("STR_VENDOR_LOCATION");
    expect(await transferLedger(fx.d.id)).toHaveLength(0);
  });

  test("BR-STR-06 an item deactivated after the draft was saved: post is 400 and posts nothing", async () => {
    const fx = await mkTransfer();
    await db
      .update(itemMaster)
      .set({ isActive: false })
      .where(eq(itemMaster.id, fx.item));
    const r = await post(fx.d.id);
    expect(r.status).toBe(400);
    expect(await transferLedger(fx.d.id)).toHaveLength(0);
    expect((await detail(fx.d.id)).status).toBe("draft");
  });

  test("BR-STR-16 an item whose average cost became 0: post is 400 STR_ZERO_COST and posts nothing", async () => {
    const fx = await mkTransfer();
    await db
      .update(itemMaster)
      .set({ averageCostPaise: 0 })
      .where(eq(itemMaster.id, fx.item));
    const r = await post(fx.d.id);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("STR_ZERO_COST");
    expect(String(r.json.message)).toContain("Item has no cost");
    expect(await transferLedger(fx.d.id)).toHaveLength(0);
  });
});

describe("edit after post (BR-STR-09)", () => {
  test("BR-STR-09 editing a posted transfer is 409 STR_NOT_DRAFT and changes nothing", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    const r = await call("PATCH", `/${fx.d.id}`, "back_office", {
      notes: "late",
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("STR_NOT_DRAFT");
    expect((await detail(fx.d.id)).notes).toBeNull();
    expect(await transferLedger(fx.d.id)).toHaveLength(2);
  });
});

describe("reverse (BR-STR-19..24)", () => {
  test("BR-STR-19 reverse needs a reason: missing, empty and 501 characters are 400", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    expect((await reverse(fx.d.id, null)).status).toBe(400);
    expect((await reverse(fx.d.id, "   ")).status).toBe(400);
    expect((await reverse(fx.d.id, "x".repeat(501))).status).toBe(400);
    expect((await detail(fx.d.id)).status).toBe("posted");
  });

  test("BR-STR-19 a posted transfer is reversed as a whole with its reason, who and when saved", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    const r = await reverse(fx.d.id, "wrong store");
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("reversed");
    expect(r.json.data.reversedAt).toBeTruthy();
    const got = await detail(fx.d.id);
    expect(got.status).toBe("reversed");
    expect(got.reverseReason).toBe("wrong store");
    expect(got.reversedBy.id).toBe(await userFor("back_office"));
    expect(got.reversedAt).toBeTruthy();
  });

  test("BR-STR-19 reversing a draft or a cancelled transfer is 409 STR_NOT_POSTED", async () => {
    const fx = await mkTransfer();
    const draft = await reverse(fx.d.id);
    expect(draft.status).toBe(409);
    expect(draft.json.code).toBe("STR_NOT_POSTED");
    await call("POST", `/${fx.d.id}/cancel`, "back_office", {});
    const cancelled = await reverse(fx.d.id);
    expect(cancelled.status).toBe(409);
    expect(cancelled.json.code).toBe("STR_NOT_POSTED");
  });

  test("BR-STR-19 reversing a transfer that does not exist is 404", async () => {
    expect((await reverse(2147483000)).status).toBe(404);
  });

  test("BR-STR-20 reversing writes an in row at the source and an out row at the destination at the posted cost, and keeps the original rows", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    await reverse(fx.d.id);
    const rows = await transferLedger(fx.d.id);
    expect(rows).toHaveLength(4);
    const orig = rows.filter((x) => x.referenceType === "stock_transfer");
    const rev = rows.filter(
      (x) => x.referenceType === "stock_transfer_reversal",
    );
    expect(orig).toHaveLength(2);
    expect(rev).toHaveLength(2);
    const inn = rev.find((x) => x.transactionType === "in")!;
    const out = rev.find((x) => x.transactionType === "out")!;
    expect(inn.locationId).toBe(fx.a);
    expect(inn.quantityChange).toBe(200);
    expect(inn.unitCostPaise).toBe(21333);
    expect(inn.totalValueChangePaise).toBe(4_266_600);
    expect(out.locationId).toBe(fx.b);
    expect(out.quantityChange).toBe(-200);
    expect(out.unitCostPaise).toBe(21333);
    expect(out.totalValueChangePaise).toBe(-4_266_600);
    const lineId = (await detail(fx.d.id)).lines[0].lineId;
    expect(inn.referenceLineId).toBe(lineId);
    expect(await balance(fx.item, fx.a)).toBe(1500);
    expect(await balance(fx.item, fx.b)).toBe(0);
  });

  test("BR-STR-21 reversal is refused when the destination no longer holds the qty; 409 names the line, nothing reversed", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    const c = await mkLoc();
    const used = await mustDraft({
      sourceLocationId: fx.b,
      destinationLocationId: c,
      lines: [{ itemId: fx.item, qty: 120 }],
    });
    expect((await post(used.id)).status).toBe(200);
    const r = await reverse(fx.d.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("STR_REVERSE_SHORT");
    expect(String(r.json.message)).toContain("Line 1");
    expect(String(r.json.message)).toContain("80");
    expect((await detail(fx.d.id)).status).toBe("posted");
    const rev = (await transferLedger(fx.d.id)).filter(
      (x) => x.referenceType === "stock_transfer_reversal",
    );
    expect(rev).toHaveLength(0);
    expect(await balance(fx.item, fx.b)).toBe(80);
  });

  test("BR-STR-22 reversal is refused (400) when a location is inactive, and works after it is reactivated", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    await setLocActive(fx.b, false);
    const r = await reverse(fx.d.id);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("STR_LOCATION_INACTIVE");
    expect((await detail(fx.d.id)).status).toBe("posted");
    await setLocActive(fx.b, true);
    expect((await reverse(fx.d.id)).status).toBe(200);
  });

  test("BR-STR-22 an inactive source blocks reversal too", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    await setLocActive(fx.a, false);
    const r = await reverse(fx.d.id);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("STR_LOCATION_INACTIVE");
  });

  test("BR-STR-22 an item made inactive after posting does not block reversal", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    await db
      .update(itemMaster)
      .set({ isActive: false })
      .where(eq(itemMaster.id, fx.item));
    const r = await reverse(fx.d.id);
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("reversed");
  });

  test("BR-STR-23 reversal writes rows at the posted cost and leaves stock and the moved average alone", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    await db
      .update(itemMaster)
      .set({ averageCostPaise: 21800 })
      .where(eq(itemMaster.id, fx.item));
    const before = await itemRow(fx.item);
    expect((await reverse(fx.d.id)).status).toBe(200);
    const rev = (await transferLedger(fx.d.id)).filter(
      (x) => x.referenceType === "stock_transfer_reversal",
    );
    for (const row of rev) expect(row.unitCostPaise).toBe(21333);
    const after = await itemRow(fx.item);
    expect(after.averageCostPaise).toBe(21800);
    expect(after.currentStock).toBe(before.currentStock);
  });

  test("BR-STR-24 a reversed transfer can't be reversed, posted, edited or cancelled again (409)", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    expect((await reverse(fx.d.id)).status).toBe(200);
    expect((await reverse(fx.d.id)).status).toBe(409);
    expect((await post(fx.d.id)).status).toBe(409);
    expect(
      (await call("PATCH", `/${fx.d.id}`, "back_office", { notes: "x" }))
        .status,
    ).toBe(409);
    expect(
      (await call("POST", `/${fx.d.id}/cancel`, "back_office", {})).status,
    ).toBe(409);
    expect(await transferLedger(fx.d.id)).toHaveLength(4);
  });

  test("BR-STR-24 two reversals at once: one 200, one 409, two reversal rows", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    const [x, y] = await Promise.all([
      reverse(fx.d.id),
      reverse(fx.d.id, "again", "owner"),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const rev = (await transferLedger(fx.d.id)).filter(
      (r) => r.referenceType === "stock_transfer_reversal",
    );
    expect(rev).toHaveLength(2);
  });
});

describe("permissions on post and reverse (BR-STR-34)", () => {
  test("BR-STR-34 floor supervisor posting a draft is 403 and it stays a draft", async () => {
    const fx = await mkTransfer();
    const r = await post(fx.d.id, "floor_supervisor");
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
    expect((await detail(fx.d.id)).status).toBe("draft");
    expect(await transferLedger(fx.d.id)).toHaveLength(0);
  });

  test("BR-STR-34 floor supervisor reversing a posted transfer is 403 and it stays posted", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    const r = await reverse(fx.d.id, "no right", "floor_supervisor");
    expect(r.status).toBe(403);
    expect((await detail(fx.d.id)).status).toBe("posted");
  });

  test("BR-STR-34 owner can post and back office can reverse with a reason", async () => {
    const fx = await mkTransfer();
    expect((await post(fx.d.id, "owner")).status).toBe(200);
    const r = await reverse(fx.d.id, "wrong store", "back_office");
    expect(r.status).toBe(200);
    expect((await detail(fx.d.id)).status).toBe("reversed");
  });

  test("BR-STR-34 owner can reverse too", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    expect((await reverse(fx.d.id, "owner undo", "owner")).status).toBe(200);
  });
});

describe("movement list and manual movements (BR-STR-25, 26)", () => {
  test("BR-STR-25 the movement list shows the two rows linked to the transfer number", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    const r = await asset(
      "GET",
      `/inventory/movements?itemId=${fx.item}&referenceType=stock_transfer&pageSize=100`,
      "owner",
    );
    expect(r.status).toBe(200);
    const rows = r.json.data as {
      locationId: number;
      sourceDocument: { type: string; id: number; number: string };
    }[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.sourceDocument.type).toBe("stock_transfer");
      expect(row.sourceDocument.id).toBe(fx.d.id);
      expect(row.sourceDocument.number).toBe(fx.d.transferNumber);
    }
    expect(rows.map((x) => x.locationId).sort()).toEqual([fx.a, fx.b].sort());
  });

  test("BR-STR-25 reversal rows show in the list as stock_transfer_reversal with the same number", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    await reverse(fx.d.id);
    const r = await asset(
      "GET",
      `/inventory/movements?itemId=${fx.item}&referenceType=stock_transfer_reversal&pageSize=100`,
      "owner",
    );
    expect(r.status).toBe(200);
    expect(r.json.data).toHaveLength(2);
    for (const row of r.json.data) {
      expect(row.sourceDocument.type).toBe("stock_transfer_reversal");
      expect(row.sourceDocument.number).toBe(fx.d.transferNumber);
    }
  });

  test("BR-STR-25 filtering the movement list by a location shows that location's transfer row", async () => {
    const fx = await mkTransfer();
    await mustPost(fx);
    const r = await asset(
      "GET",
      `/inventory/movements?itemId=${fx.item}&locationId=${fx.b}&referenceType=stock_transfer`,
      "owner",
    );
    expect(r.json.data).toHaveLength(1);
    expect(r.json.data[0].quantityChange).toBe(200);
  });

  test("BR-STR-26 the manual movement route refuses stock_transfer and stock_transfer_reversal (400) and posts nothing", async () => {
    const a = await mkLoc();
    const item = await mkItem();
    await stockAt(item, a, 100);
    const before = (await ledgerFor([item])).length;
    for (const referenceType of ["stock_transfer", "stock_transfer_reversal"]) {
      const r = await asset("POST", "/inventory/movements", "owner", {
        itemId: item,
        locationId: a,
        referenceType,
        countedQty: 5,
        reason: "try",
      });
      expect(r.status).toBe(400);
    }
    expect((await ledgerFor([item])).length).toBe(before);
  });
});
