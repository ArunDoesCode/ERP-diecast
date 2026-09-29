/**
 * GRN business-rule tests (docs/specs/grn.md v1). Real DB, full HTTP stack via
 * createApp() so role checks, validation and status codes are exercised.
 * Fixtures are TEST_grn_ prefixed and removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import { documentNumberCounters, roles } from "../db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../db/schemas/02_procurement-catalog";
import {
  grnCorrections,
  grnItems,
  grns,
  purchaseOrderItems,
  purchaseOrders,
  qaTests,
} from "../db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
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
const RUN = `TEST_grn_${Date.now()}`;
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

let supplierId = 0;
let supplier2Id = 0;
let createdLocationId: number | undefined;
const poIds: number[] = [];
const itemIds: number[] = [];

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
  const res = await app.request(`/api/grn${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await tokenFor(role)}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

type PoLine = { qty: number; price?: number; uom?: string; received?: number };

async function newPo(
  lines: PoLine[] = [{ qty: 1000 }],
  opts: { status?: string; supplier?: number } = {},
) {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: uid(),
      supplierId: opts.supplier ?? supplierId,
      status: (opts.status ?? "dispatched") as any,
      createdBy: actorId,
    })
    .returning({ id: purchaseOrders.id });
  const poId = po!.id;
  poIds.push(poId);
  const poItemIds: number[] = [];
  const lineItemIds: number[] = [];
  for (const l of lines) {
    const [item] = await db
      .insert(itemMaster)
      .values({
        sku: uid(),
        name: `${RUN} item`,
        category: "Raw Material",
        uom: l.uom ?? "kg",
      })
      .returning({ id: itemMaster.id });
    itemIds.push(item!.id);
    lineItemIds.push(item!.id);
    const [pi] = await db
      .insert(purchaseOrderItems)
      .values({
        poId,
        itemId: item!.id,
        qty: l.qty,
        receivedQty: l.received ?? 0,
        unitPricePaise: l.price ?? 21000,
        uom: l.uom ?? "kg",
      })
      .returning({ id: purchaseOrderItems.id });
    poItemIds.push(pi!.id);
  }
  return { poId, poItemIds, itemIds: lineItemIds };
}

async function newGrn(
  po: { poId: number; poItemIds: number[] },
  qtys: number[],
  extra: Record<string, unknown> = {},
) {
  const r = await call("POST", "/creategrn", "back_office", {
    poId: po.poId,
    challanNo: uid(),
    lines: qtys.map((q, i) => ({ poItemId: po.poItemIds[i], arrivedQty: q })),
    ...extra,
  });
  if (r.status !== 201) {
    throw new Error(
      `fixture create GRN failed: ${r.status} ${JSON.stringify(r.json)}`,
    );
  }
  return {
    grnId: r.json.data.grn.id as number,
    lineIds: (r.json.data.items as { id: number }[]).map((i) => i.id),
    grn: r.json.data.grn,
  };
}

const qa = (
  g: { grnId: number; lineIds: number[] },
  idx: number,
  body: Record<string, unknown>,
  role: Role = "qa_inspector",
) => call("POST", `/${g.grnId}/lines/${g.lineIds[idx]}/qa`, role, body);
const bypass = (
  g: { grnId: number; lineIds: number[] },
  idx: number,
  body: Record<string, unknown>,
  role: Role = "back_office",
) => call("POST", `/${g.grnId}/lines/${g.lineIds[idx]}/bypass`, role, body);
const correct = (
  g: { grnId: number; lineIds: number[] },
  idx: number,
  body: Record<string, unknown>,
  role: Role = "back_office",
) => call("POST", `/${g.grnId}/lines/${g.lineIds[idx]}/correction`, role, body);

const ledgerFor = (itemId: number) =>
  db.select().from(inventoryLedger).where(eq(inventoryLedger.itemId, itemId));
const poItemRow = async (id: number) =>
  (
    await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.id, id))
  )[0]!;
const poRow = async (id: number) =>
  (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)))[0]!;
const lineRow = async (id: number) =>
  (await db.select().from(grnItems).where(eq(grnItems.id, id)))[0]!;
const grnRow = async (id: number) =>
  (await db.select().from(grns).where(eq(grns.id, id)))[0];
const details = async (grnId: number) =>
  (await call("GET", `/getgrndetails/${grnId}`, "owner")).json.data;

beforeAll(async () => {
  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "owner"))
    .limit(1);
  const [emp] = await db
    .insert(employees)
    .values({ name: `${RUN}_actor`, roleId: ownerRole!.id, isActive: true })
    .returning({ id: employees.id });
  actorId = emp!.id;
  const [s1] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_s1` })
    .returning({ id: supplierMaster.id });
  supplierId = s1!.id;
  const [s2] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_s2` })
    .returning({ id: supplierMaster.id });
  supplier2Id = s2!.id;
  const [main] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "main_store"))
    .limit(1);
  if (!main) {
    const [loc] = await db
      .insert(locations)
      .values({ name: `${RUN}_main_store`, type: "main_store" })
      .returning({ id: locations.id });
    createdLocationId = loc!.id;
  }
});

afterAll(async () => {
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
    await db
      .delete(grnCorrections)
      .where(inArray(grnCorrections.grnItemId, lineIds));
  }
  if (itemIds.length) {
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, itemIds));
  }
  if (lineIds.length)
    await db.delete(grnItems).where(inArray(grnItems.id, lineIds));
  if (grnIds.length) await db.delete(grns).where(inArray(grns.id, grnIds));
  if (poIds.length) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, poIds));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
  }
  if (itemIds.length)
    await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
  await db
    .delete(supplierMaster)
    .where(inArray(supplierMaster.id, [supplierId, supplier2Id]));
  if (createdLocationId)
    await db.delete(locations).where(eq(locations.id, createdLocationId));
  // Number counters are shared and must never roll back (BR-GRN-04): detach, don't delete.
  await db
    .update(documentNumberCounters)
    .set({ createdBy: null })
    .where(
      inArray(documentNumberCounters.createdBy, [
        actorId,
        ...roleUsers.values(),
      ]),
    );
  await db
    .update(documentNumberCounters)
    .set({ lastUpdatedBy: null })
    .where(
      inArray(documentNumberCounters.lastUpdatedBy, [
        actorId,
        ...roleUsers.values(),
      ]),
    );
  await db
    .delete(employees)
    .where(inArray(employees.id, [actorId, ...roleUsers.values()]));
});

describe("BR-GRN-01 PO status gate", () => {
  test("BR-GRN-01 create on a draft PO is 400", async () => {
    const po = await newPo([{ qty: 100 }], { status: "draft" });
    const r = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      challanNo: uid(),
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 10 }],
    });
    expect(r.status).toBe(400);
  });

  test("BR-GRN-01 create on a partial_received PO is allowed", async () => {
    const po = await newPo([{ qty: 100, received: 40 }], {
      status: "partial_received",
    });
    const r = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      challanNo: uid(),
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 10 }],
    });
    expect(r.status).toBe(201);
  });

  test("BR-GRN-01 accept after PO cancelled is 409, nothing posted, line stays pending", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await db
      .update(purchaseOrders)
      .set({ status: "cancelled" })
      .where(eq(purchaseOrders.id, po.poId));
    const r = await qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 });
    expect(r.status).toBe(409);
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(0);
    expect((await lineRow(g.lineIds[0]!)).qaStatus).toBe("pending");
  });

  test("BR-GRN-01 bypass after PO cancelled is 409, nothing posted", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await db
      .update(purchaseOrders)
      .set({ status: "cancelled" })
      .where(eq(purchaseOrders.id, po.poId));
    const r = await bypass(g, 0, { bypassReason: "urgent" });
    expect(r.status).toBe(409);
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(0);
    expect((await lineRow(g.lineIds[0]!)).qaStatus).toBe("pending");
  });
});

describe("BR-GRN-02 line validity", () => {
  test("BR-GRN-02 line from another PO is 400", async () => {
    const po1 = await newPo();
    const po2 = await newPo();
    const r = await call("POST", "/creategrn", "back_office", {
      poId: po1.poId,
      challanNo: uid(),
      lines: [{ poItemId: po2.poItemIds[0], arrivedQty: 10 }],
    });
    expect(r.status).toBe(400);
  });

  test("BR-GRN-02 same PO line twice is 400", async () => {
    const po = await newPo();
    const r = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      challanNo: uid(),
      lines: [
        { poItemId: po.poItemIds[0], arrivedQty: 10 },
        { poItemId: po.poItemIds[0], arrivedQty: 5 },
      ],
    });
    expect(r.status).toBe(400);
  });

  test("BR-GRN-02 arrived qty 0 or negative is 400", async () => {
    const po = await newPo();
    for (const q of [0, -5]) {
      const r = await call("POST", "/creategrn", "back_office", {
        poId: po.poId,
        challanNo: uid(),
        lines: [{ poItemId: po.poItemIds[0], arrivedQty: q }],
      });
      expect(r.status).toBe(400);
    }
  });

  test("BR-GRN-02 more than 3 decimals is 400, 3 decimals is accepted", async () => {
    const po = await newPo();
    const bad = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      challanNo: uid(),
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 1.2345 }],
    });
    expect(bad.status).toBe(400);
    const ok = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      challanNo: uid(),
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 1.234 }],
    });
    expect(ok.status).toBe(201);
    expect(ok.json.data.items[0].receivedQty).toBeCloseTo(1.234, 3);
  });

  test("BR-GRN-02 fractional qty for an item in pieces is 400, whole is accepted", async () => {
    const po = await newPo([{ qty: 50, uom: "pcs" }]);
    const bad = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      challanNo: uid(),
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 2.5 }],
    });
    expect(bad.status).toBe(400);
    const ok = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      challanNo: uid(),
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 3 }],
    });
    expect(ok.status).toBe(201);
  });

  test("BR-GRN-02 supplier is copied from the PO", async () => {
    const po = await newPo([{ qty: 10 }], { supplier: supplier2Id });
    const g = await newGrn(po, [5]);
    expect(g.grn.supplierId).toBe(supplier2Id);
    expect(g.grn.status).toBe("draft");
  });
});

describe("BR-GRN-04 numbering", () => {
  test("BR-GRN-04 number has GRN-<period>-<seq> form and is unique", async () => {
    const po = await newPo();
    const a = await newGrn(po, [1]);
    const b = await newGrn(po, [1]);
    expect(a.grn.grnNumber).toMatch(/^GRN-.+-\d+$/);
    expect(b.grn.grnNumber).not.toBe(a.grn.grnNumber);
  });

  test("BR-GRN-04 number of a deleted draft is never reused", async () => {
    const po = await newPo();
    const a = await newGrn(po, [1]);
    const del = await call("DELETE", `/deletegrn/${a.grnId}`, "back_office");
    expect(del.status).toBe(200);
    const b = await newGrn(po, [1]);
    expect(b.grn.grnNumber).not.toBe(a.grn.grnNumber);
    const seqOf = (n: string) => Number(n.split("-").pop());
    expect(seqOf(b.grn.grnNumber)).toBeGreaterThan(seqOf(a.grn.grnNumber));
  });
});

describe("BR-GRN-05 challan", () => {
  test("BR-GRN-05 missing challan is 400", async () => {
    const po = await newPo();
    const r = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 1 }],
    });
    expect(r.status).toBe(400);
  });

  test("BR-GRN-05 blank challan is 400", async () => {
    const po = await newPo();
    const r = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      challanNo: "",
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 1 }],
    });
    expect(r.status).toBe(400);
  });

  test("BR-GRN-05 same supplier + same challan is 409; other supplier is fine", async () => {
    const po = await newPo();
    const po2 = await newPo([{ qty: 10 }], { supplier: supplier2Id });
    const ch = uid();
    await newGrn(po, [1], { challanNo: ch });
    const dup = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      challanNo: ch,
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 1 }],
    });
    expect(dup.status).toBe(409);
    const other = await call("POST", "/creategrn", "back_office", {
      poId: po2.poId,
      challanNo: ch,
      lines: [{ poItemId: po2.poItemIds[0], arrivedQty: 1 }],
    });
    expect(other.status).toBe(201);
  });

  test("BR-GRN-05 challan can be reused after the earlier GRN was deleted", async () => {
    const po = await newPo();
    const ch = uid();
    const a = await newGrn(po, [1], { challanNo: ch });
    expect(
      (await call("DELETE", `/deletegrn/${a.grnId}`, "back_office")).status,
    ).toBe(200);
    const r = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      challanNo: ch,
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 1 }],
    });
    expect(r.status).toBe(201);
  });
});

describe("BR-GRN-05 challan on draft edit", () => {
  test("BR-GRN-05 editing a draft to another GRN's challan (same supplier) is 409, challan unchanged", async () => {
    const po = await newPo();
    const ch = uid();
    await newGrn(po, [1], { challanNo: ch });
    const own = uid();
    const g = await newGrn(po, [1], { challanNo: own });
    const r = await call("PATCH", "/updategrn", "back_office", {
      grnId: g.grnId,
      challanNo: ch,
    });
    expect(r.status).toBe(409);
    expect((await grnRow(g.grnId))!.challanNo).toBe(own);
  });

  test("BR-GRN-05 challan cannot be cleared on edit", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1]);
    const r = await call("PATCH", "/updategrn", "back_office", {
      grnId: g.grnId,
      challanNo: "",
    });
    expect(r.status).toBe(400);
  });
});

describe("BR-GRN-06 draft edit of batch number", () => {
  test("BR-GRN-06 batchNumber edited on a draft line is saved", async () => {
    const po = await newPo();
    const g = await newGrn(po, [10]);
    const r = await call("PATCH", "/updategrn", "back_office", {
      grnId: g.grnId,
      lines: [{ id: g.lineIds[0], arrivedQty: 10, batchNumber: "HEAT-77" }],
    });
    expect(r.status).toBe(200);
    expect((await lineRow(g.lineIds[0]!)).batchNumber).toBe("HEAT-77");
  });
});

describe("BR-GRN-06 draft-only edit/delete", () => {
  test("BR-GRN-06 draft can be edited", async () => {
    const po = await newPo();
    const g = await newGrn(po, [100]);
    const r = await call("PATCH", "/updategrn", "back_office", {
      grnId: g.grnId,
      lines: [{ id: g.lineIds[0], arrivedQty: 120 }],
    });
    expect(r.status).toBe(200);
    expect((await lineRow(g.lineIds[0]!)).receivedQty).toBe(120);
  });

  test("BR-GRN-06 non-draft edit is 400 and qty unchanged", async () => {
    const po = await newPo([{ qty: 1000 }, { qty: 1000 }]);
    const g = await newGrn(po, [500, 500]);
    expect((await qa(g, 0, { acceptedQty: 500, rejectedQty: 0 })).status).toBe(
      200,
    );
    expect((await grnRow(g.grnId))!.status).toBe("pending_qa");
    const r = await call("PATCH", "/updategrn", "back_office", {
      grnId: g.grnId,
      lines: [{ id: g.lineIds[1], arrivedQty: 400 }],
    });
    expect(r.status).toBe(400);
    expect((await lineRow(g.lineIds[1]!)).receivedQty).toBe(500);
  });

  test("BR-GRN-06 non-draft delete is 400 and GRN remains", async () => {
    const po = await newPo([{ qty: 1000 }, { qty: 1000 }]);
    const g = await newGrn(po, [500, 500]);
    await qa(g, 0, { acceptedQty: 500, rejectedQty: 0 });
    const r = await call("DELETE", `/deletegrn/${g.grnId}`, "back_office");
    expect(r.status).toBe(400);
    expect(await grnRow(g.grnId)).toBeDefined();
  });

  test("BR-GRN-06 deleting a draft removes lines and posts nothing", async () => {
    const po = await newPo();
    const g = await newGrn(po, [100]);
    const r = await call("DELETE", `/deletegrn/${g.grnId}`, "back_office");
    expect(r.status).toBe(200);
    expect(await grnRow(g.grnId)).toBeUndefined();
    expect(
      await db.select().from(grnItems).where(eq(grnItems.grnId, g.grnId)),
    ).toHaveLength(0);
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(0);
  });
});

describe("BR-GRN-08 received date", () => {
  test("BR-GRN-08 sent receivedDate is ignored, server time is stored", async () => {
    const po = await newPo();
    const before = Date.now();
    const r = await call("POST", "/creategrn", "back_office", {
      poId: po.poId,
      challanNo: uid(),
      receivedDate: "2026-01-01",
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 1 }],
    });
    expect(r.status).toBe(201);
    const stored = new Date(r.json.data.grn.receivedDate).getTime();
    expect(Math.abs(stored - before)).toBeLessThan(60_000);
  });

  test("BR-GRN-08 update cannot change received date", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1]);
    const orig = (await grnRow(g.grnId))!.receivedDate!.getTime();
    await call("PATCH", "/updategrn", "back_office", {
      grnId: g.grnId,
      receivedDate: "2026-01-01",
      remarks: "x",
    });
    expect((await grnRow(g.grnId))!.receivedDate!.getTime()).toBe(orig);
  });
});

describe("BR-GRN-09 one decision per line", () => {
  test("BR-GRN-09 second decision is 409", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    expect((await qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 })).status).toBe(
      200,
    );
    expect((await qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 })).status).toBe(
      409,
    );
    expect((await bypass(g, 0, { bypassReason: "again" })).status).toBe(409);
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(1);
  });

  test("BR-GRN-09 two simultaneous accepts: one 200, one 409, one ledger row", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    const [a, b] = await Promise.all([
      qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 }),
      qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(1);
    expect((await poItemRow(po.poItemIds[0]!)).receivedQty).toBe(1000);
  });

  test("BR-GRN-09 simultaneous accept and bypass post at most once", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    const [a, b] = await Promise.all([
      qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 }),
      bypass(g, 0, { bypassReason: "race" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(1);
  });
});

describe("BR-GRN-10 accepted + rejected = arrived", () => {
  test("BR-GRN-10 980 + 20 is passed with both qty on the line", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    const r = await qa(g, 0, { acceptedQty: 980, rejectedQty: 20 });
    expect(r.status).toBe(200);
    const l = await lineRow(g.lineIds[0]!);
    expect(l.qaStatus).toBe("passed");
    expect(l.acceptedQty).toBe(980);
    expect(l.rejectedQty).toBe(20);
  });

  test("BR-GRN-10 980 + 10 (sum != arrived) is 400 and nothing changes", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    const r = await qa(g, 0, { acceptedQty: 980, rejectedQty: 10 });
    expect(r.status).toBe(400);
    expect((await lineRow(g.lineIds[0]!)).qaStatus).toBe("pending");
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(0);
  });

  test("BR-GRN-10 sum above arrived is 400", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    expect((await qa(g, 0, { acceptedQty: 1000, rejectedQty: 5 })).status).toBe(
      400,
    );
  });

  test("BR-GRN-10 0 + 1000 is failed with no ledger row", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    const r = await qa(g, 0, { acceptedQty: 0, rejectedQty: 1000 });
    expect(r.status).toBe(200);
    const l = await lineRow(g.lineIds[0]!);
    expect(l.qaStatus).toBe("failed");
    expect(l.rejectedQty).toBe(1000);
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(0);
  });

  test("BR-GRN-10 negative qty is 400", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    expect(
      (await qa(g, 0, { acceptedQty: 1100, rejectedQty: -100 })).status,
    ).toBe(400);
  });

  test("BR-GRN-10 bypass defaults accepted = arrived", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    expect(
      (await bypass(g, 0, { bypassReason: "furnace waiting" })).status,
    ).toBe(200);
    const l = await lineRow(g.lineIds[0]!);
    expect(l.acceptedQty).toBe(1000);
    expect(l.rejectedQty ?? 0).toBe(0);
  });

  test("BR-GRN-10 bypass with accepted 990 records rejected 10", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    expect(
      (await bypass(g, 0, { bypassReason: "urgent", acceptedQty: 990 })).status,
    ).toBe(200);
    const l = await lineRow(g.lineIds[0]!);
    expect(l.acceptedQty).toBe(990);
    expect(l.rejectedQty).toBe(10);
    const ledger = await ledgerFor(po.itemIds[0]!);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.quantityChange).toBe(990);
  });

  test("BR-GRN-10 bypass accepted above arrived is 400", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    expect(
      (await bypass(g, 0, { bypassReason: "x", acceptedQty: 1001 })).status,
    ).toBe(400);
  });
});

describe("BR-GRN-12 traceability", () => {
  test("BR-GRN-12 QA accept writes one QA row with result, tester, time, remarks, certificate", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    const r = await qa(g, 0, {
      acceptedQty: 1000,
      rejectedQty: 0,
      remarks: "spectro OK",
      certificateUrl: "https://example.com/cert.pdf",
    });
    expect(r.status).toBe(200);
    const rows = await db
      .select()
      .from(qaTests)
      .where(eq(qaTests.grnItemId, g.lineIds[0]!));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("passed");
    expect(rows[0]!.testedBy).toBe(await userFor("qa_inspector"));
    expect(rows[0]!.testedAt).toBeTruthy();
    expect(rows[0]!.notes).toBe("spectro OK");
    expect(rows[0]!.testReportUrl).toBe("https://example.com/cert.pdf");
  });

  test("BR-GRN-12 QA reject writes one QA row with result failed", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 0, rejectedQty: 1000, remarks: "off spec" });
    const rows = await db
      .select()
      .from(qaTests)
      .where(eq(qaTests.grnItemId, g.lineIds[0]!));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("failed");
    expect(rows[0]!.testedBy).toBe(await userFor("qa_inspector"));
  });

  test("BR-GRN-12 bypass stores who, when and why; posting stores who", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    expect(
      (await bypass(g, 0, { bypassReason: "furnace waiting" })).status,
    ).toBe(200);
    const l = await lineRow(g.lineIds[0]!);
    expect(l.isQaBypassed).toBe(true);
    expect(l.qaBypassReason).toBe("furnace waiting");
    expect(l.qaBypassedBy).toBe(await userFor("back_office"));
    expect(l.qaBypassedAt).toBeTruthy();
    const ledger = await ledgerFor(po.itemIds[0]!);
    expect(ledger[0]!.createdBy).toBe(await userFor("back_office"));
    expect(ledger[0]!.createdAt).toBeTruthy();
  });

  test("BR-GRN-12 correction stores who, when and why", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 980, rejectedQty: 20 });
    const r = await correct(g, 0, { qty: 30, reason: "short weight found" });
    expect(r.status).toBe(201);
    const rows = await db
      .select()
      .from(grnCorrections)
      .where(eq(grnCorrections.grnItemId, g.lineIds[0]!));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBe("short weight found");
    expect(rows[0]!.createdBy).toBe(await userFor("back_office"));
    expect(rows[0]!.createdAt).toBeTruthy();
    expect(rows[0]!.qty).toBe(30);
  });
});

describe("BR-GRN-13 rejected qty stays out of stock", () => {
  test("BR-GRN-13 accepted 980 rejected 20 moves stock by +980 only", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 980, rejectedQty: 20 });
    const ledger = await ledgerFor(po.itemIds[0]!);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.transactionType).toBe("in");
    expect(ledger[0]!.referenceType).toBe("grn");
    expect(ledger[0]!.quantityChange).toBe(980);
    expect(ledger[0]!.unitCostPaise).toBe(21000);
    expect(ledger[0]!.referenceLineId).toBe(g.lineIds[0]!);
    const [item] = await db
      .select()
      .from(itemMaster)
      .where(eq(itemMaster.id, po.itemIds[0]!));
    expect(item!.currentStock).toBe(980);
    expect((await lineRow(g.lineIds[0]!)).rejectedQty).toBe(20);
  });
});

describe("BR-GRN-15 over-receipt", () => {
  test("BR-GRN-15 exactly 105% is allowed without override", async () => {
    const po = await newPo([{ qty: 1000, received: 1000 }]);
    const g = await newGrn(po, [50]);
    expect((await qa(g, 0, { acceptedQty: 50, rejectedQty: 0 })).status).toBe(
      200,
    );
  });

  test("BR-GRN-15 past 105% without override right is 400 and nothing posted", async () => {
    const po = await newPo([{ qty: 1000, received: 1000 }]);
    const g = await newGrn(po, [60]);
    const r = await qa(g, 0, { acceptedQty: 60, rejectedQty: 0 });
    expect(r.status).toBe(400);
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(0);
    expect((await poItemRow(po.poItemIds[0]!)).receivedQty).toBe(1000);
    expect((await lineRow(g.lineIds[0]!)).qaStatus).toBe("pending");
  });

  test("BR-GRN-15 qa_inspector cannot override even with a reason", async () => {
    const po = await newPo([{ qty: 1000, received: 1000 }]);
    const g = await newGrn(po, [60]);
    const r = await qa(g, 0, {
      acceptedQty: 60,
      rejectedQty: 0,
      overrideReason: "please",
    });
    expect(r.status).toBe(400);
  });

  test("BR-GRN-15 back_office without a reason is 400", async () => {
    const po = await newPo([{ qty: 1000, received: 1000 }]);
    const g = await newGrn(po, [60]);
    const r = await qa(
      g,
      0,
      { acceptedQty: 60, rejectedQty: 0 },
      "back_office",
    );
    expect(r.status).toBe(400);
  });

  test("BR-GRN-15 back_office with a reason is 200, excess, reason and actor stored", async () => {
    const po = await newPo([{ qty: 1000, received: 1000 }]);
    const g = await newGrn(po, [60]);
    const r = await qa(
      g,
      0,
      {
        acceptedQty: 60,
        rejectedQty: 0,
        overrideReason: "supplier sent extra, needed",
      },
      "back_office",
    );
    expect(r.status).toBe(200);
    const l = await lineRow(g.lineIds[0]!);
    expect(l.overReceiptExcessQty).toBeCloseTo(10, 3);
    expect(l.overReceiptReason).toBe("supplier sent extra, needed");
    expect(l.overReceiptBy).toBe(await userFor("back_office"));
  });

  test("BR-GRN-15 bypass over tolerance follows the same rule", async () => {
    const po = await newPo([{ qty: 1000, received: 1000 }]);
    const g = await newGrn(po, [60]);
    expect((await bypass(g, 0, { bypassReason: "urgent" })).status).toBe(400);
    const ok = await bypass(g, 0, {
      bypassReason: "urgent",
      overrideReason: "approved by owner",
    });
    expect(ok.status).toBe(200);
    expect((await lineRow(g.lineIds[0]!)).overReceiptExcessQty).toBeCloseTo(
      10,
      3,
    );
  });

  test("BR-GRN-15 two GRNs of 600 decided at once on 1000: one is refused", async () => {
    const po = await newPo([{ qty: 1000 }]);
    const g1 = await newGrn(po, [600]);
    const g2 = await newGrn(po, [600]);
    const [a, b] = await Promise.all([
      qa(g1, 0, { acceptedQty: 600, rejectedQty: 0 }, "back_office"),
      qa(g2, 0, { acceptedQty: 600, rejectedQty: 0 }, "back_office"),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect((await poItemRow(po.poItemIds[0]!)).receivedQty).toBe(600);
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(1);
  });
});

describe("BR-GRN-18 bypass", () => {
  test("BR-GRN-18 empty reason is 400", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    expect((await bypass(g, 0, { bypassReason: "" })).status).toBe(400);
    expect((await bypass(g, 0, {})).status).toBe(400);
    expect((await lineRow(g.lineIds[0]!)).qaStatus).toBe("pending");
  });

  test("BR-GRN-18 bypass makes the line waived, marked, posted as grn_bypass", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    const r = await bypass(g, 0, { bypassReason: "furnace waiting" });
    expect(r.status).toBe(200);
    const l = await lineRow(g.lineIds[0]!);
    expect(l.qaStatus).toBe("waived");
    expect(l.isQaBypassed).toBe(true);
    const ledger = await ledgerFor(po.itemIds[0]!);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.referenceType).toBe("grn_bypass");
    expect(ledger[0]!.quantityChange).toBe(1000);
  });

  test("BR-GRN-18 owner and back_office may bypass, qa_inspector and floor_supervisor may not", async () => {
    const po = await newPo([
      { qty: 100 },
      { qty: 100 },
      { qty: 100 },
      { qty: 100 },
    ]);
    const g = await newGrn(po, [10, 10, 10, 10]);
    expect(
      (await bypass(g, 0, { bypassReason: "r" }, "floor_supervisor")).status,
    ).toBe(403);
    expect(
      (await bypass(g, 1, { bypassReason: "r" }, "qa_inspector")).status,
    ).toBe(403);
    expect((await bypass(g, 2, { bypassReason: "r" }, "owner")).status).toBe(
      200,
    );
    expect(
      (await bypass(g, 3, { bypassReason: "r" }, "back_office")).status,
    ).toBe(200);
    expect((await lineRow(g.lineIds[0]!)).qaStatus).toBe("pending");
    expect((await lineRow(g.lineIds[1]!)).qaStatus).toBe("pending");
  });
});

describe("BR-GRN-19 permissions", () => {
  test("BR-GRN-19 die_designer can view but not create", async () => {
    const po = await newPo();
    const g = await newGrn(po, [10]);
    expect(
      (await call("GET", `/getgrndetails/${g.grnId}`, "die_designer")).status,
    ).toBe(200);
    expect((await call("GET", "/getgrns", "die_designer")).status).toBe(200);
    const r = await call("POST", "/creategrn", "die_designer", {
      poId: po.poId,
      challanNo: uid(),
      lines: [{ poItemId: po.poItemIds[0], arrivedQty: 1 }],
    });
    expect(r.status).toBe(403);
  });

  test("BR-GRN-19 qa_inspector cannot create/edit/delete a draft", async () => {
    const po = await newPo();
    const g = await newGrn(po, [10]);
    expect(
      (
        await call("POST", "/creategrn", "qa_inspector", {
          poId: po.poId,
          challanNo: uid(),
          lines: [{ poItemId: po.poItemIds[0], arrivedQty: 1 }],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("PATCH", "/updategrn", "qa_inspector", {
          grnId: g.grnId,
          remarks: "x",
        })
      ).status,
    ).toBe(403);
    expect(
      (await call("DELETE", `/deletegrn/${g.grnId}`, "qa_inspector")).status,
    ).toBe(403);
    expect(await grnRow(g.grnId)).toBeDefined();
  });

  test("BR-GRN-19 floor_supervisor can create but cannot QA-decide", async () => {
    const po = await newPo();
    const g = await newGrn(po, [10]);
    const r = await qa(
      g,
      0,
      { acceptedQty: 10, rejectedQty: 0 },
      "floor_supervisor",
    );
    expect(r.status).toBe(403);
    expect((await lineRow(g.lineIds[0]!)).qaStatus).toBe("pending");
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(0);
  });

  test("BR-GRN-19 die_designer cannot QA-decide", async () => {
    const po = await newPo();
    const g = await newGrn(po, [10]);
    expect(
      (await qa(g, 0, { acceptedQty: 10, rejectedQty: 0 }, "die_designer"))
        .status,
    ).toBe(403);
  });

  test("BR-GRN-19 only owner/back_office/super-admin may correct", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 });
    for (const role of [
      "qa_inspector",
      "floor_supervisor",
      "die_designer",
    ] as Role[]) {
      expect((await correct(g, 0, { qty: 1, reason: "r" }, role)).status).toBe(
        403,
      );
    }
    expect(
      await db
        .select()
        .from(grnCorrections)
        .where(eq(grnCorrections.grnItemId, g.lineIds[0]!)),
    ).toHaveLength(0);
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(1);
  });

  test("BR-GRN-19 unauthenticated request is 401", async () => {
    const res = await app.request("/api/grn/getgrns");
    expect(res.status).toBe(401);
  });
});

describe("BR-GRN-25 header status", () => {
  test("BR-GRN-25 line 1 accepted -> pending_qa; line 2 rejected -> partial_accepted", async () => {
    const po = await newPo([{ qty: 100 }, { qty: 100 }]);
    const g = await newGrn(po, [50, 50]);
    expect((await grnRow(g.grnId))!.status).toBe("draft");
    await qa(g, 0, { acceptedQty: 50, rejectedQty: 0 });
    expect((await grnRow(g.grnId))!.status).toBe("pending_qa");
    await qa(g, 1, { acceptedQty: 0, rejectedQty: 50 });
    expect((await grnRow(g.grnId))!.status).toBe("partial_accepted");
  });

  test("BR-GRN-25 all passed/waived -> accepted", async () => {
    const po = await newPo([{ qty: 100 }, { qty: 100 }]);
    const g = await newGrn(po, [50, 50]);
    await qa(g, 0, { acceptedQty: 50, rejectedQty: 0 });
    await bypass(g, 1, { bypassReason: "urgent" });
    expect((await grnRow(g.grnId))!.status).toBe("accepted");
  });

  test("BR-GRN-25 all failed -> rejected", async () => {
    const po = await newPo([{ qty: 100 }, { qty: 100 }]);
    const g = await newGrn(po, [50, 50]);
    await qa(g, 0, { acceptedQty: 0, rejectedQty: 50 });
    await qa(g, 1, { acceptedQty: 0, rejectedQty: 50 });
    expect((await grnRow(g.grnId))!.status).toBe("rejected");
  });

  test("BR-GRN-25 single line accepted -> accepted; header stays after a correction", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 });
    expect((await grnRow(g.grnId))!.status).toBe("accepted");
    await correct(g, 0, { qty: 10, reason: "r" });
    expect((await grnRow(g.grnId))!.status).toBe("accepted");
  });
});

describe("BR-GRN-27 PO roll-up", () => {
  test("BR-GRN-27 accept adds accepted qty; PO partial then fully_received", async () => {
    const po = await newPo([{ qty: 1000 }]);
    const g1 = await newGrn(po, [1000]);
    await qa(g1, 0, { acceptedQty: 980, rejectedQty: 20 });
    expect((await poItemRow(po.poItemIds[0]!)).receivedQty).toBe(980);
    expect((await poRow(po.poId)).status).toBe("partial_received");
    const g2 = await newGrn(po, [20]);
    await qa(g2, 0, { acceptedQty: 20, rejectedQty: 0 });
    expect((await poItemRow(po.poItemIds[0]!)).receivedQty).toBe(1000);
    expect((await poRow(po.poId)).status).toBe("fully_received");
  });

  test("BR-GRN-27 reject does not add to received qty or change PO status", async () => {
    const po = await newPo([{ qty: 1000 }]);
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 0, rejectedQty: 1000 });
    expect((await poItemRow(po.poItemIds[0]!)).receivedQty).toBe(0);
    expect((await poRow(po.poId)).status).toBe("dispatched");
  });

  test("BR-GRN-27 bypass adds accepted qty", async () => {
    const po = await newPo([{ qty: 1000 }]);
    const g = await newGrn(po, [1000]);
    await bypass(g, 0, { bypassReason: "urgent" });
    expect((await poItemRow(po.poItemIds[0]!)).receivedQty).toBe(1000);
    expect((await poRow(po.poId)).status).toBe("fully_received");
  });

  test("BR-GRN-27 fully_received only when every PO line is met", async () => {
    const po = await newPo([{ qty: 100 }, { qty: 100 }]);
    const g = await newGrn(po, [100, 100]);
    await qa(g, 0, { acceptedQty: 100, rejectedQty: 0 });
    expect((await poRow(po.poId)).status).toBe("partial_received");
    await qa(g, 1, { acceptedQty: 100, rejectedQty: 0 });
    expect((await poRow(po.poId)).status).toBe("fully_received");
  });
});

describe("BR-GRN-29 correction rules", () => {
  test("BR-GRN-29 corrections may not together exceed accepted qty", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 980, rejectedQty: 20 });
    expect((await correct(g, 0, { qty: 500, reason: "r1" })).status).toBe(201);
    expect((await correct(g, 0, { qty: 500, reason: "r2" })).status).toBe(400);
    const d = await details(g.grnId);
    expect(d.items[0].correctedQty).toBe(500);
    expect(d.items[0].netAcceptedQty).toBe(480);
  });

  test("BR-GRN-29 correction of exactly the remaining accepted qty is allowed", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 980, rejectedQty: 20 });
    expect(
      (await correct(g, 0, { qty: 980, reason: "all wrong" })).status,
    ).toBe(201);
  });

  test("BR-GRN-29 failed line is 400", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 0, rejectedQty: 1000 });
    expect((await correct(g, 0, { qty: 1, reason: "r" })).status).toBe(400);
  });

  test("BR-GRN-29 pending line is 400", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    expect((await correct(g, 0, { qty: 1, reason: "r" })).status).toBe(400);
  });

  test("BR-GRN-29 waived (bypassed) line can be corrected", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await bypass(g, 0, { bypassReason: "urgent" });
    expect((await correct(g, 0, { qty: 10, reason: "r" })).status).toBe(201);
  });

  test("BR-GRN-29 qty 0 or empty reason is 400", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 });
    expect((await correct(g, 0, { qty: 0, reason: "r" })).status).toBe(400);
    expect((await correct(g, 0, { qty: 5, reason: "" })).status).toBe(400);
    expect((await correct(g, 0, { qty: 5 })).status).toBe(400);
  });

  test("BR-GRN-29 correction posts a negative adjustment tied to the line", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 });
    const r = await correct(g, 0, { qty: 30, reason: "r" });
    expect(r.status).toBe(201);
    const ledger = await ledgerFor(po.itemIds[0]!);
    const row = ledger.find((l) => l.referenceType === "grn_correction");
    expect(row).toBeDefined();
    expect(row!.transactionType).toBe("adjustment");
    expect(row!.quantityChange).toBe(-30);
    expect(row!.referenceLineId).toBe(g.lineIds[0]!);
  });
});

describe("BR-GRN-34 correction and PO", () => {
  test("BR-GRN-34 correction lowers PO received qty and reopens fully_received", async () => {
    const po = await newPo([{ qty: 1000 }]);
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 });
    expect((await poRow(po.poId)).status).toBe("fully_received");
    expect((await correct(g, 0, { qty: 30, reason: "r" })).status).toBe(201);
    expect((await poItemRow(po.poItemIds[0]!)).receivedQty).toBe(970);
    expect((await poRow(po.poId)).status).toBe("partial_received");
  });

  test("BR-GRN-34 correction on a closed PO is 409, nothing changes", async () => {
    const po = await newPo([{ qty: 1000 }]);
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 });
    await db
      .update(purchaseOrders)
      .set({ status: "closed" })
      .where(eq(purchaseOrders.id, po.poId));
    expect((await correct(g, 0, { qty: 30, reason: "r" })).status).toBe(409);
    expect((await poItemRow(po.poItemIds[0]!)).receivedQty).toBe(1000);
    expect(
      await db
        .select()
        .from(grnCorrections)
        .where(eq(grnCorrections.grnItemId, g.lineIds[0]!)),
    ).toHaveLength(0);
    expect(await ledgerFor(po.itemIds[0]!)).toHaveLength(1);
  });

  test("BR-GRN-34 correction on an invoiced PO is 409", async () => {
    const po = await newPo([{ qty: 1000 }]);
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 1000, rejectedQty: 0 });
    await db
      .update(purchaseOrders)
      .set({ status: "invoiced" })
      .where(eq(purchaseOrders.id, po.poId));
    expect((await correct(g, 0, { qty: 30, reason: "r" })).status).toBe(409);
  });
});

describe("BR-GRN-35 accepted qty is never changed by a correction", () => {
  test("BR-GRN-35 accepted 980, correction 30 shows 980 and net 950", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 980, rejectedQty: 20 });
    await correct(g, 0, { qty: 30, reason: "r" });
    expect((await lineRow(g.lineIds[0]!)).acceptedQty).toBe(980);
    const d = await details(g.grnId);
    expect(d.items[0].acceptedQty).toBe(980);
    expect(d.items[0].correctedQty).toBe(30);
    expect(d.items[0].netAcceptedQty).toBe(950);
  });

  test("BR-GRN-35 without corrections net equals accepted", async () => {
    const po = await newPo();
    const g = await newGrn(po, [1000]);
    await qa(g, 0, { acceptedQty: 980, rejectedQty: 20 });
    const d = await details(g.grnId);
    expect(d.items[0].correctedQty).toBe(0);
    expect(d.items[0].netAcceptedQty).toBe(980);
  });
});
