/**
 * Stock transfer: draft create / edit / cancel, locations, lists, permissions
 * (docs/specs/stock-transfer/spec.md v1: BR-STR-01..10, 16 (on save), 27, 30, 32, 34).
 * Real DB, full HTTP stack via createApp(). Fixtures are TEST_str_ prefixed, removed in afterAll.
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
  serviceMaster,
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
const RUN = `TEST_str_${Date.now()}`;
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
) =>
  raw(
    method,
    `/api/stock-transfer${path === "/" ? "" : path.startsWith("/?") ? path.slice(1) : path}`,
    role,
    body,
  );
const asset = (method: string, path: string, role: Role, body?: unknown) =>
  raw(method, `/api/asset${path}`, role, body);

const itemIds: number[] = [];
const supplierIds: number[] = [];
const transferIds: number[] = [];
const serviceIds: number[] = [];

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
  if (serviceIds.length) {
    await db.delete(serviceMaster).where(inArray(serviceMaster.id, serviceIds));
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

describe("create: locations (BR-STR-01, 02, 03)", () => {
  test("BR-STR-01 same source and destination is 400 STR_SAME_LOCATION and saves nothing", async () => {
    const a = await mkLoc();
    const item = await mkItem();
    await stockAt(item, a, 100);
    const r = await mkDraft({
      sourceLocationId: a,
      destinationLocationId: a,
      lines: [{ itemId: item, qty: 1 }],
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("STR_SAME_LOCATION");
  });

  test("BR-STR-01 destination is required", async () => {
    const a = await mkLoc();
    const item = await mkItem();
    const r = await mkDraft({
      sourceLocationId: a,
      lines: [{ itemId: item, qty: 1 }],
    });
    expect(r.status).toBe(400);
  });

  test("BR-STR-02 inactive source or destination is 400 STR_LOCATION_INACTIVE", async () => {
    const a = await mkLoc();
    const b = await mkLoc();
    const item = await mkItem();
    await stockAt(item, a, 100);
    await asset("PATCH", `/locations/${b}`, "back_office", { isActive: false });
    const toInactive = await mkDraft({
      sourceLocationId: a,
      destinationLocationId: b,
      lines: [{ itemId: item, qty: 1 }],
    });
    expect(toInactive.status).toBe(400);
    expect(toInactive.json.code).toBe("STR_LOCATION_INACTIVE");
    const fromInactive = await mkDraft({
      sourceLocationId: b,
      destinationLocationId: a,
      lines: [{ itemId: item, qty: 1 }],
    });
    expect(fromInactive.status).toBe(400);
    expect(fromInactive.json.code).toBe("STR_LOCATION_INACTIVE");
  });

  test("BR-STR-02 a location that does not exist is 404", async () => {
    const a = await mkLoc();
    const item = await mkItem();
    const r = await mkDraft({
      sourceLocationId: a,
      destinationLocationId: 2147483000,
      lines: [{ itemId: item, qty: 1 }],
    });
    expect(r.status).toBe(404);
  });

  test("BR-STR-03 a vendor_premise destination or source is 400 'Use a job work challan'", async () => {
    const a = await mkLoc();
    const v = await mkVendorLoc();
    const item = await mkItem();
    await stockAt(item, a, 100);
    for (const [s, d] of [
      [a, v],
      [v, a],
    ] as const) {
      const r = await mkDraft({
        sourceLocationId: s,
        destinationLocationId: d,
        lines: [{ itemId: item, qty: 1 }],
      });
      expect(r.status).toBe(400);
      expect(r.json.code).toBe("STR_VENDOR_LOCATION");
      expect(String(r.json.message)).toContain("job work challan");
    }
  });

  test("BR-STR-03 editing a draft to a vendor_premise location is refused", async () => {
    const a = await mkLoc();
    const b = await mkLoc();
    const v = await mkVendorLoc();
    const item = await mkItem();
    await stockAt(item, a, 100);
    const d = await mustDraft({
      sourceLocationId: a,
      destinationLocationId: b,
      lines: [{ itemId: item, qty: 1 }],
    });
    const r = await call("PATCH", `/${d.id}`, "back_office", {
      destinationLocationId: v,
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("STR_VENDOR_LOCATION");
    expect((await detail(d.id)).destination.id).toBe(b);
  });
});

describe("create: lines (BR-STR-04, 05, 06, 07, 16)", () => {
  async function pair() {
    const a = await mkLoc();
    const b = await mkLoc();
    return { sourceLocationId: a, destinationLocationId: b };
  }

  test("BR-STR-04 zero lines is 400", async () => {
    const r = await mkDraft({ ...(await pair()), lines: [] });
    expect(r.status).toBe(400);
  });

  test("BR-STR-04 51 lines is 400", async () => {
    const p = await pair();
    const items: number[] = [];
    for (let i = 0; i < 51; i++) items.push(await mkItem());
    const tooMany = await mkDraft({
      ...p,
      lines: items.map((itemId) => ({ itemId, qty: 1 })),
    });
    expect(tooMany.status).toBe(400);
  });

  test("BR-STR-04 the same item twice is 400 STR_DUPLICATE_ITEM", async () => {
    const p = await pair();
    const item = await mkItem();
    await stockAt(item, p.sourceLocationId, 100);
    const r = await mkDraft({
      ...p,
      lines: [
        { itemId: item, qty: 1 },
        { itemId: item, qty: 2 },
      ],
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("STR_DUPLICATE_ITEM");
  });

  test("BR-STR-04 qty 0 and negative qty are 400", async () => {
    const p = await pair();
    const item = await mkItem();
    await stockAt(item, p.sourceLocationId, 100);
    for (const qty of [0, -5]) {
      const r = await mkDraft({ ...p, lines: [{ itemId: item, qty }] });
      expect(r.status).toBe(400);
    }
  });

  test("BR-STR-05 a pcs item refuses 2.5, a kg item takes 200.125 and refuses 200.1255", async () => {
    const p = await pair();
    const pcs = await mkItem({ uom: "pcs" });
    const kg = await mkItem({ uom: "kg" });
    await stockAt(pcs, p.sourceLocationId, 100);
    await stockAt(kg, p.sourceLocationId, 1000);
    const half = await mkDraft({ ...p, lines: [{ itemId: pcs, qty: 2.5 }] });
    expect(half.status).toBe(400);
    const ok = await mkDraft({ ...p, lines: [{ itemId: kg, qty: 200.125 }] });
    expect(ok.status).toBe(201);
    const fine = await mkDraft({
      ...p,
      lines: [{ itemId: kg, qty: 200.1255 }],
    });
    expect(fine.status).toBe(400);
  });

  test("BR-STR-05 a set item is whole numbers only", async () => {
    const p = await pair();
    const set = await mkItem({ uom: "set" });
    await stockAt(set, p.sourceLocationId, 10);
    const r = await mkDraft({ ...p, lines: [{ itemId: set, qty: 1.5 }] });
    expect(r.status).toBe(400);
  });

  test("BR-STR-05 qty above 1,000,000,000 is 400", async () => {
    const p = await pair();
    const item = await mkItem();
    await stockAt(item, p.sourceLocationId, 100);
    const r = await mkDraft({
      ...p,
      lines: [{ itemId: item, qty: 1_000_000_001 }],
    });
    expect(r.status).toBe(400);
  });

  test("BR-STR-06 an inactive item on a line is 400", async () => {
    const p = await pair();
    const item = await mkItem();
    await stockAt(item, p.sourceLocationId, 100);
    await db
      .update(itemMaster)
      .set({ isActive: false })
      .where(eq(itemMaster.id, item));
    const r = await mkDraft({ ...p, lines: [{ itemId: item, qty: 1 }] });
    expect(r.status).toBe(400);
  });

  test("BR-STR-06 an item that does not exist is 404", async () => {
    const p = await pair();
    const r = await mkDraft({ ...p, lines: [{ itemId: 2147483000, qty: 1 }] });
    expect(r.status).toBe(404);
  });

  test("BR-STR-06 a line whose id is a service, not a stock item, is 404 naming the line", async () => {
    const p = await pair();
    const item = await mkItem({ averageCostPaise: 100 });
    const svcId = 2_000_000_000 + Math.floor(Math.random() * 100_000);
    await db.insert(serviceMaster).values({
      id: svcId,
      code: uid(),
      name: `${RUN} service`,
      defaultUom: "job",
    });
    serviceIds.push(svcId);
    const r = await mkDraft({
      ...p,
      lines: [
        { itemId: item, qty: 1 },
        { itemId: svcId, qty: 1 },
      ],
    });
    expect(r.status).toBe(404);
    expect(String(r.json.message)).toContain("Line 2");
  });

  test("BR-STR-06 an unknown large item id is 404 naming the line", async () => {
    const p = await pair();
    const r = await mkDraft({ ...p, lines: [{ itemId: 2147483000, qty: 1 }] });
    expect(r.status).toBe(404);
    expect(String(r.json.message)).toContain("Line 1");
  });

  test("BR-STR-06 an inactive item is 400 STR_ITEM_INACTIVE naming the line", async () => {
    const p = await pair();
    const item = await mkItem({ isActive: false });
    const r = await mkDraft({ ...p, lines: [{ itemId: item, qty: 1 }] });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("STR_ITEM_INACTIVE");
    expect(String(r.json.message)).toContain("Line 1");
  });

  test("BR-STR-06 a decimal qty on a pcs item is 400 STR_QTY_WHOLE naming the line", async () => {
    const p = await pair();
    const item = await mkItem({ uom: "pcs" });
    const r = await mkDraft({ ...p, lines: [{ itemId: item, qty: 2.5 }] });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("STR_QTY_WHOLE");
    expect(String(r.json.message)).toContain("Line 1");
  });

  test("BR-STR-07 a cost field on a line is 400", async () => {
    const p = await pair();
    const item = await mkItem();
    await stockAt(item, p.sourceLocationId, 100);
    const r = await mkDraft({
      ...p,
      lines: [{ itemId: item, qty: 1, unitCostPaise: 1 }],
    });
    expect(r.status).toBe(400);
  });

  test("BR-STR-07 a cost or value field on the body is 400", async () => {
    const p = await pair();
    const item = await mkItem();
    await stockAt(item, p.sourceLocationId, 100);
    for (const extra of [{ totalValuePaise: 1 }, { unitCostPaise: 1 }]) {
      const r = await mkDraft({
        ...p,
        ...extra,
        lines: [{ itemId: item, qty: 1 }],
      });
      expect(r.status).toBe(400);
    }
  });

  test("BR-STR-16 an item whose average cost is 0 can't be saved on a transfer", async () => {
    const p = await pair();
    const item = await mkItem(); // average cost defaults to 0
    const r = await mkDraft({ ...p, lines: [{ itemId: item, qty: 1 }] });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("STR_ZERO_COST");
    expect(String(r.json.message)).toMatch(/item has no cost/i);
  });
});

describe("create: number, status, audit (BR-STR-08)", () => {
  test("BR-STR-08 a new transfer is a draft numbered ST-<IST year>-NNNN with creator and time saved", async () => {
    const a = await mkLoc();
    const b = await mkLoc();
    const item = await mkItem();
    await stockAt(item, a, 1500);
    const r = await mkDraft({
      sourceLocationId: a,
      destinationLocationId: b,
      notes: "  move to shop floor  ",
      lines: [{ itemId: item, qty: 200 }],
    });
    expect(r.status).toBe(201);
    expect(r.json.data.status).toBe("draft");
    expect(r.json.data.transferNumber).toMatch(
      new RegExp(`^ST-${istYear()}-\\d{4}$`),
    );
    const d = await detail(r.json.data.id);
    expect(d.status).toBe("draft");
    expect(d.createdBy.id).toBe(await userFor("back_office"));
    expect(d.createdAt).toBeTruthy();
    expect(d.notes).toBe("move to shop floor");
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].qty).toBe(200);
    expect(d.postedAt).toBeNull();
  });

  test("BR-STR-08 numbers grow with each transfer", async () => {
    const a = await mkLoc();
    const b = await mkLoc();
    const item = await mkItem();
    await stockAt(item, a, 1500);
    const body = {
      sourceLocationId: a,
      destinationLocationId: b,
      lines: [{ itemId: item, qty: 1 }],
    };
    const first = await mustDraft(body);
    const second = await mustDraft(body);
    const n = (s: string) => Number(s.slice(-4));
    expect(n(second.transferNumber)).toBeGreaterThan(n(first.transferNumber));
  });

  test("BR-STR-08 a draft has no stock effect", async () => {
    const a = await mkLoc();
    const b = await mkLoc();
    const item = await mkItem();
    await stockAt(item, a, 1500);
    const before = (await ledgerFor([item])).length;
    const d = await mustDraft({
      sourceLocationId: a,
      destinationLocationId: b,
      lines: [{ itemId: item, qty: 200 }],
    });
    expect((await ledgerFor([item])).length).toBe(before);
    expect(await transferLedger(d.id)).toHaveLength(0);
    const [row] = await db
      .select()
      .from(itemMaster)
      .where(eq(itemMaster.id, item));
    expect(row!.currentStock).toBe(1500);
  });
});

describe("edit a draft (BR-STR-09)", () => {
  async function draft() {
    const a = await mkLoc();
    const b = await mkLoc();
    const c = await mkLoc();
    const i1 = await mkItem();
    const i2 = await mkItem();
    await stockAt(i1, a, 1000);
    await stockAt(i2, a, 1000);
    const d = await mustDraft({
      sourceLocationId: a,
      destinationLocationId: b,
      lines: [{ itemId: i1, qty: 10 }],
    });
    return { a, b, c, i1, i2, d };
  }

  test("BR-STR-09 a draft's locations, lines and note can be edited, saving who and when", async () => {
    const { a, c, i2, d } = await draft();
    const r = await call("PATCH", `/${d.id}`, "owner", {
      destinationLocationId: c,
      notes: "changed",
      lines: [{ itemId: i2, qty: 5 }],
    });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("draft");
    const got = await detail(d.id);
    expect(got.source.id).toBe(a);
    expect(got.destination.id).toBe(c);
    expect(got.notes).toBe("changed");
    expect(got.lines).toHaveLength(1);
    expect(got.lines[0].itemId).toBe(i2);
    expect(got.lastUpdatedBy.id).toBe(await userFor("owner"));
    expect(got.transferNumber).toBe(d.transferNumber);
  });

  test("BR-STR-09 a notes-only edit succeeds after the source was deactivated; post is still refused", async () => {
    const { a, d } = await draft();
    await db
      .update(locations)
      .set({ isActive: false })
      .where(eq(locations.id, a));
    const r = await call("PATCH", `/${d.id}`, "back_office", {
      notes: "still editable",
    });
    expect(r.status).toBe(200);
    expect((await detail(d.id)).notes).toBe("still editable");
    const p = await call("POST", `/${d.id}/post`, "back_office", {});
    expect(p.status).toBe(400);
    expect(p.json.code).toBe("STR_LOCATION_INACTIVE");
    expect((await detail(d.id)).status).toBe("draft");
  });

  test("BR-STR-09 an edit with no field is 400", async () => {
    const { d } = await draft();
    const r = await call("PATCH", `/${d.id}`, "back_office", {});
    expect(r.status).toBe(400);
  });

  test("BR-STR-09 an edit that makes both locations the same is 400", async () => {
    const { a, d } = await draft();
    const r = await call("PATCH", `/${d.id}`, "back_office", {
      destinationLocationId: a,
    });
    expect(r.status).toBe(400);
  });

  test("BR-STR-09 editing a cancelled transfer is 409 STR_NOT_DRAFT and changes nothing", async () => {
    const { d } = await draft();
    expect(
      (await call("POST", `/${d.id}/cancel`, "back_office", {})).status,
    ).toBe(200);
    const r = await call("PATCH", `/${d.id}`, "back_office", { notes: "late" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("STR_NOT_DRAFT");
    expect((await detail(d.id)).notes).toBeNull();
  });

  test("BR-STR-09 editing a transfer that does not exist is 404", async () => {
    const r = await call("PATCH", "/2147483000", "back_office", { notes: "x" });
    expect(r.status).toBe(404);
  });
});

describe("cancel a draft (BR-STR-10)", () => {
  async function draft() {
    const a = await mkLoc();
    const b = await mkLoc();
    const item = await mkItem();
    await stockAt(item, a, 100);
    return mustDraft({
      sourceLocationId: a,
      destinationLocationId: b,
      lines: [{ itemId: item, qty: 5 }],
    });
  }

  test("BR-STR-10 cancelling a draft needs no reason, keeps the number, saves who and when, posts nothing", async () => {
    const d = await draft();
    const r = await call("POST", `/${d.id}/cancel`, "back_office", {});
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("cancelled");
    const got = await detail(d.id);
    expect(got.status).toBe("cancelled");
    expect(got.transferNumber).toBe(d.transferNumber);
    expect(got.cancelledBy.id).toBe(await userFor("back_office"));
    expect(got.cancelledAt).toBeTruthy();
    expect(await transferLedger(d.id)).toHaveLength(0);
  });

  test("BR-STR-10 a cancelled transfer can't be posted (409)", async () => {
    const d = await draft();
    await call("POST", `/${d.id}/cancel`, "back_office", {});
    const r = await call("POST", `/${d.id}/post`, "back_office", {});
    expect(r.status).toBe(409);
    expect(await transferLedger(d.id)).toHaveLength(0);
  });

  test("BR-STR-10 cancelling a cancelled transfer is 409", async () => {
    const d = await draft();
    await call("POST", `/${d.id}/cancel`, "back_office", {});
    const r = await call("POST", `/${d.id}/cancel`, "back_office", {});
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("STR_NOT_DRAFT");
  });

  test("BR-STR-10 cancelling a posted transfer is 409 and it stays posted", async () => {
    const d = await draft();
    expect(
      (await call("POST", `/${d.id}/post`, "back_office", {})).status,
    ).toBe(200);
    const r = await call("POST", `/${d.id}/cancel`, "back_office", {});
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("STR_NOT_DRAFT");
    expect((await detail(d.id)).status).toBe("posted");
  });
});

describe("detail (BR-STR-30)", () => {
  test("BR-STR-30 a draft line shows the current source balance; unknown id is 404", async () => {
    const a = await mkLoc();
    const b = await mkLoc();
    const item = await mkItem();
    await stockAt(item, a, 1500);
    const d = await mustDraft({
      sourceLocationId: a,
      destinationLocationId: b,
      lines: [{ itemId: item, qty: 200 }],
    });
    const got = await detail(d.id);
    expect(got.lines[0].sourceBalanceQty).toBe(1500);
    expect(got.lines[0].sku).toBeTruthy();
    expect(got.lines[0].unit).toBe("kg");
    expect((await call("GET", "/2147483000", "owner")).status).toBe(404);
  });

  test("BR-STR-30 a draft qty above the hint is still saved (warning only)", async () => {
    const a = await mkLoc();
    const b = await mkLoc();
    const item = await mkItem();
    await stockAt(item, a, 10);
    const r = await mkDraft({
      sourceLocationId: a,
      destinationLocationId: b,
      lines: [{ itemId: item, qty: 500 }],
    });
    expect(r.status).toBe(201);
  });
});

describe("list (BR-STR-27)", () => {
  const fx: {
    a: number;
    b: number;
    c: number;
    i1: number;
    i2: number;
    drafts: number[];
    cancelled: number;
  } = { a: 0, b: 0, c: 0, i1: 0, i2: 0, drafts: [], cancelled: 0 };

  async function setup() {
    if (fx.a) return;
    fx.a = await mkLoc();
    fx.b = await mkLoc();
    fx.c = await mkLoc();
    fx.i1 = await mkItem();
    fx.i2 = await mkItem();
    await stockAt(fx.i1, fx.a, 1000);
    await stockAt(fx.i2, fx.a, 1000);
    const d1 = await mustDraft({
      sourceLocationId: fx.a,
      destinationLocationId: fx.b,
      lines: [{ itemId: fx.i1, qty: 1 }],
    });
    const d2 = await mustDraft({
      sourceLocationId: fx.a,
      destinationLocationId: fx.c,
      lines: [
        { itemId: fx.i1, qty: 1 },
        { itemId: fx.i2, qty: 1 },
      ],
    });
    const d3 = await mustDraft({
      sourceLocationId: fx.a,
      destinationLocationId: fx.b,
      lines: [{ itemId: fx.i2, qty: 1 }],
    });
    await call("POST", `/${d3.id}/cancel`, "back_office", {});
    fx.drafts = [d1.id, d2.id];
    fx.cancelled = d3.id;
  }
  const ids = (r: { json: any }) => (r.json.data as any[]).map((x) => x.id);

  test("BR-STR-27 filter by status returns only that status", async () => {
    await setup();
    const r = await call(
      "GET",
      `/?status=draft&sourceLocationId=${fx.a}&pageSize=100`,
      "owner",
    );
    expect(r.status).toBe(200);
    expect(ids(r).sort()).toEqual([...fx.drafts].sort());
    for (const row of r.json.data) expect(row.status).toBe("draft");
    const c = await call(
      "GET",
      `/?status=cancelled&sourceLocationId=${fx.a}`,
      "owner",
    );
    expect(ids(c)).toEqual([fx.cancelled]);
  });

  test("BR-STR-27 filter by destination and by item", async () => {
    await setup();
    const byDest = await call(
      "GET",
      `/?destinationLocationId=${fx.c}`,
      "owner",
    );
    expect(ids(byDest)).toEqual([fx.drafts[1]!]);
    const byItem = await call(
      "GET",
      `/?itemId=${fx.i2}&sourceLocationId=${fx.a}&pageSize=100`,
      "owner",
    );
    expect(ids(byItem).sort()).toEqual([fx.drafts[1]!, fx.cancelled].sort());
  });

  test("BR-STR-27 rows carry number, names, line count and are newest first", async () => {
    await setup();
    const r = await call(
      "GET",
      `/?sourceLocationId=${fx.a}&pageSize=100`,
      "owner",
    );
    expect(r.status).toBe(200);
    const rows = r.json.data as any[];
    const second = rows.find((x) => x.id === fx.drafts[1]);
    expect(second.lineCount).toBe(2);
    expect(second.transferNumber).toMatch(/^ST-\d{4}-\d{4}$/);
    expect(second.sourceName).toBeTruthy();
    expect(second.destinationName).toBeTruthy();
    expect(second.postedAt).toBeNull();
    const times = rows.map((x) => new Date(x.createdAt).getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x));
    expect(r.json.meta.total).toBe(3);
  });

  test("BR-STR-27 the list is paged", async () => {
    await setup();
    const r = await call(
      "GET",
      `/?sourceLocationId=${fx.a}&page=1&pageSize=2`,
      "owner",
    );
    expect(r.json.data).toHaveLength(2);
    expect(r.json.meta).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    const p2 = await call(
      "GET",
      `/?sourceLocationId=${fx.a}&page=2&pageSize=2`,
      "owner",
    );
    expect(p2.json.data).toHaveLength(1);
  });

  test("BR-STR-27 filter by created date (IST day)", async () => {
    await setup();
    const today = istDay();
    const hit = await call(
      "GET",
      `/?sourceLocationId=${fx.a}&fromDate=${today}&toDate=${today}&pageSize=100`,
      "owner",
    );
    expect(hit.json.meta.total).toBe(3);
    const future = istDay(5);
    const miss = await call(
      "GET",
      `/?sourceLocationId=${fx.a}&fromDate=${future}`,
      "owner",
    );
    expect(miss.json.meta.total).toBe(0);
  });

  test("BR-STR-27 an impossible date (2026-13-45) is 400", async () => {
    const r = await call("GET", "/?fromDate=2026-13-45", "owner");
    expect(r.status).toBe(400);
  });

  test("BR-STR-27 from-date after to-date is 400", async () => {
    const r = await call(
      "GET",
      "/?fromDate=2026-11-20&toDate=2026-11-18",
      "owner",
    );
    expect(r.status).toBe(400);
  });
});

describe("locations: the store type (BR-STR-32)", () => {
  test("BR-STR-32 a store location is saved and is not virtual", async () => {
    const r = await asset("POST", "/locations", "back_office", {
      name: uid(),
      type: "store",
    });
    expect(r.status).toBe(201);
    expect(r.json.data.type).toBe("store");
    expect(r.json.data.isVirtual).toBe(false);
  });

  test("BR-STR-32 any number of store locations is allowed", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await asset("POST", "/locations", "back_office", {
        name: uid(),
        type: "store",
      });
      expect(r.status).toBe(201);
    }
  });

  test("BR-STR-32 a store name is unique ignoring case (409)", async () => {
    const name = uid();
    expect(
      (
        await asset("POST", "/locations", "back_office", {
          name,
          type: "store",
        })
      ).status,
    ).toBe(201);
    const dup = await asset("POST", "/locations", "back_office", {
      name: name.toLowerCase(),
      type: "store",
    });
    expect(dup.status).toBe(409);
  });

  test("BR-STR-33 any pair of active non-vendor locations may be used (finished goods to scrap yard)", async () => {
    const fg = await mkLoc("finished_goods");
    const sy = await mkLoc("scrap_yard");
    const st = await mkLoc("store");
    const item = await mkItem({ uom: "pcs" });
    await stockAt(item, fg, 100);
    for (const [s, d] of [
      [fg, sy],
      [fg, st],
      [st, sy],
    ] as const) {
      const r = await mkDraft({
        sourceLocationId: s,
        destinationLocationId: d,
        lines: [{ itemId: item, qty: 5 }],
      });
      expect(r.status).toBe(201);
    }
  });
});

describe("permissions (BR-STR-34)", () => {
  async function fxDraft() {
    const a = await mkLoc();
    const b = await mkLoc();
    const item = await mkItem();
    await stockAt(item, a, 100);
    const body = {
      sourceLocationId: a,
      destinationLocationId: b,
      lines: [{ itemId: item, qty: 5 }],
    };
    return { body, d: await mustDraft(body) };
  }

  test("BR-STR-34 every route is 401 without a token", async () => {
    const routes: [string, string, unknown][] = [
      ["GET", "", undefined],
      ["GET", "/1", undefined],
      ["POST", "", {}],
      ["PATCH", "/1", { notes: "x" }],
      ["POST", "/1/cancel", {}],
      ["POST", "/1/post", {}],
      ["POST", "/1/reverse", { reason: "x" }],
    ];
    for (const [m, p, b] of routes) {
      const r = await call(m, p, null, b);
      expect(r.status).toBe(401);
    }
  });

  test("BR-STR-34 floor supervisor can list and open transfers (inventory.view)", async () => {
    const { d } = await fxDraft();
    expect((await call("GET", "", "floor_supervisor")).status).toBe(200);
    expect((await call("GET", `/${d.id}`, "floor_supervisor")).status).toBe(
      200,
    );
  });

  test("BR-STR-34 a role without inventory.view can't list or open (403)", async () => {
    const { d } = await fxDraft();
    expect((await call("GET", "", "operator")).status).toBe(403);
    expect((await call("GET", `/${d.id}`, "operator")).status).toBe(403);
  });

  test("BR-STR-34 floor supervisor can't create, edit, cancel or post (403) and nothing changes", async () => {
    const { body, d } = await fxDraft();
    const create = await call("POST", "", "floor_supervisor", body);
    expect(create.status).toBe(403);
    expect(create.json.code).toBe("PERMISSION_DENIED");
    expect(
      (await call("PATCH", `/${d.id}`, "floor_supervisor", { notes: "x" }))
        .status,
    ).toBe(403);
    expect(
      (await call("POST", `/${d.id}/cancel`, "floor_supervisor", {})).status,
    ).toBe(403);
    expect(
      (await call("POST", `/${d.id}/post`, "floor_supervisor", {})).status,
    ).toBe(403);
    const got = await detail(d.id);
    expect(got.status).toBe("draft");
    expect(got.notes).toBeNull();
    expect(await transferLedger(d.id)).toHaveLength(0);
  });

  test("BR-STR-34 floor supervisor and qa inspector can't reverse (403)", async () => {
    const { d } = await fxDraft();
    for (const role of ["floor_supervisor", "qa_inspector"] as const) {
      const r = await call("POST", `/${d.id}/reverse`, role, { reason: "no" });
      expect(r.status).toBe(403);
    }
  });

  test("BR-STR-34 owner and back office can create; super-admin too", async () => {
    const { body } = await fxDraft();
    for (const role of ["owner", "back_office", "super-admin"] as const) {
      const r = await mkDraft(body, role);
      expect(r.status).toBe(201);
    }
  });
});
