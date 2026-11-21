/**
 * docs/specs/factory-flows (v1, frozen): BR-FF-06, 08, 31, 70, 72, 115
 * BR-FF-06 no prices for non-holders      BR-FF-08 IST calendar day for today / late
 * BR-FF-31 owner Home shows every tile    BR-FF-70 empty picker (data side of the message)
 * BR-FF-72 PO no longer receivable        BR-FF-115 GRN QA status from its lines
 *
 * Routes: GET /api/grn/getreceivablepos, GET /api/home/getcounts, GET /api/grn/getgrns,
 * POST /api/grn/creategrn (contract: .pipeline/epic-factory-flows/contract.md).
 * The UI texts and the "Orders to send" link of BR-FF-70 / BR-FF-72 are frontend; only the data side is here.
 * Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { rolePermissions, roles } from "../../src/db/schemas/01_auth";
import { itemMaster } from "../../src/db/schemas/02_procurement-catalog";
import {
  grnItems,
  grns,
  purchaseOrderItems,
  purchaseOrders,
} from "../../src/db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { istDayKey } from "../../src/lib/ist-day";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const P = "test_ffr1_";
const RUN = `TEST_ffr1_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

const emp: Record<string, number> = {};
const tokens: Record<string, string> = {};
const roleIds: Record<string, number> = {};
let supplierId = 0;
const created = {
  po: [] as number[],
  grn: [] as number[],
  item: [] as number[],
};

const todayKey = istDayKey();
/** The instant of IST wall-clock hh:mm on calendar day `offset` from today (IST). */
function istAt(offset: number, hh: number, mm: number): Date {
  const [y, m, d] = todayKey.split("-").map(Number) as [number, number, number];
  return new Date(
    Date.UTC(y, m - 1, d + offset, hh, mm) - (5 * 60 + 30) * 60 * 1000,
  );
}

async function makeRole(name: string, keys: string[]) {
  const [r] = await db
    .insert(roles)
    .values({ name: `${P}${name}`, isSystem: false })
    .returning({ id: roles.id });
  roleIds[name] = r!.id;
  await db
    .insert(rolePermissions)
    .values(keys.map((permissionKey) => ({ roleId: r!.id, permissionKey })));
}
async function makeUser(tag: string, roleId: number, roleName: string) {
  const [e] = await db
    .insert(employees)
    .values({
      name: `${RUN}_${tag}`,
      email: `${P}${tag}@diecast.test`,
      roleId,
      isActive: true,
    })
    .returning({ id: employees.id });
  emp[tag] = e!.id;
  tokens[tag] = await signAccessToken({
    userId: e!.id,
    userName: `${RUN}_${tag}`,
    role: roleName,
    allowedPages: [],
  });
}

async function call(
  tag: string | null,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const res = await app.request(path, {
    method,
    headers: {
      ...(tag ? { Authorization: `Bearer ${tokens[tag]}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}
const picker = (tag: string, query = "") =>
  call(
    tag,
    `/api/grn/getreceivablepos?q=${encodeURIComponent(RUN)}&pageSize=100${query ? `&${query}` : ""}`,
  );

// biome-ignore lint/suspicious/noExplicitAny: row shape asserted field by field
type Row = any;

type Line = { qty: number; received?: number };
async function mkPo(
  status: (typeof purchaseOrders.$inferInsert)["status"],
  lines: Line[] = [{ qty: 1000 }],
  expected: Date | null = null,
) {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: uid(),
      supplierId,
      status,
      createdBy: emp.fs!,
      expectedDeliveryDate: expected,
      subtotalPaise: 24_500_000,
      taxAmountPaise: 4_410_000,
      totalAmountPaise: 28_910_000,
    })
    .returning({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber });
  created.po.push(po!.id);
  const poItemIds: number[] = [];
  for (const l of lines) {
    const [it] = await db
      .insert(itemMaster)
      .values({
        sku: uid(),
        name: `${RUN} item`,
        category: "Raw Material",
        uom: "kg",
      })
      .returning({ id: itemMaster.id });
    created.item.push(it!.id);
    const [pi] = await db
      .insert(purchaseOrderItems)
      .values({
        poId: po!.id,
        itemId: it!.id,
        qty: l.qty,
        receivedQty: l.received ?? 0,
        unitPricePaise: 24_500,
        gstPercent: 18,
        lineValuePaise: 24_500_000,
        lineTaxPaise: 4_410_000,
        uom: "kg",
      })
      .returning({ id: purchaseOrderItems.id });
    poItemIds.push(pi!.id);
  }
  return { id: po!.id, number: po!.poNumber, poItemIds };
}

async function mkGrn(poId: number, lines: { poItemId: number; qa: string }[]) {
  const [g] = await db
    .insert(grns)
    .values({
      grnNumber: uid(),
      poId,
      supplierId,
      status: "pending_qa",
      createdBy: emp.fs!,
      challanNo: uid(),
    })
    .returning({ id: grns.id, grnNumber: grns.grnNumber });
  created.grn.push(g!.id);
  for (const l of lines) {
    await db.insert(grnItems).values({
      grnId: g!.id,
      poItemId: l.poItemId,
      receivedQty: 10,
      acceptedQty: 0,
      qaStatus: l.qa,
    });
  }
  return g!;
}

async function cleanup() {
  if (created.grn.length) {
    await db.delete(grnItems).where(inArray(grnItems.grnId, created.grn));
    await db.delete(grns).where(inArray(grns.id, created.grn));
  }
  if (created.po.length) {
    const extra = await db
      .select({ id: grns.id })
      .from(grns)
      .where(inArray(grns.poId, created.po));
    if (extra.length) {
      const ids = extra.map((x) => x.id);
      await db.delete(grnItems).where(inArray(grnItems.grnId, ids));
      await db.delete(grns).where(inArray(grns.id, ids));
    }
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, created.po));
    await db
      .delete(purchaseOrders)
      .where(inArray(purchaseOrders.id, created.po));
  }
  if (created.item.length) {
    await db.delete(itemMaster).where(inArray(itemMaster.id, created.item));
  }
  await db.delete(supplierMaster).where(like(supplierMaster.name, `${RUN}%`));
  await db.delete(employees).where(like(employees.email, `${P}%`));
  await db.delete(roles).where(like(roles.name, `${P}%`));
}

beforeAll(async () => {
  await makeRole("fs", ["grn.edit_draft", "grn.view"]);
  await makeRole("viewer", ["grn.view"]);
  await makeUser("fs", roleIds.fs!, `${P}fs`);
  await makeUser("viewer", roleIds.viewer!, `${P}viewer`);
  const [owner] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "owner"));
  if (!owner) throw new Error("seed role owner missing");
  await makeUser("owner", owner.id, "owner");
  const [s] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_Sri Balaji Metals` })
    .returning({ id: supplierMaster.id });
  supplierId = s!.id;
});

afterAll(cleanup);

function moneyKeys(v: unknown): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      for (const [k, val] of Object.entries(x)) {
        if (/paise|price|gst|tax|amount|rate|value|total/i.test(k)) out.push(k);
        walk(val);
      }
    }
  };
  walk(v);
  return out;
}

describe("BR-FF-06 no prices for non-holders", () => {
  test("BR-FF-06 the receive picker (grn.edit_draft only) carries no price, GST, value or total anywhere in the body", async () => {
    const po = await mkPo("dispatched", [{ qty: 500 }, { qty: 200 }]);
    const r = await picker("fs");
    expect(r.status).toBe(200);
    expect(r.json.data.map((x: Row) => x.poId)).toContain(po.id);
    // money keys only, in data (meta.total / totalPages are pagination, not money)
    expect(moneyKeys(r.json.data)).toEqual([]);
    expect(JSON.stringify(r.json.data)).not.toContain("24500");
  });

  test("BR-FF-06 the same caller gets no PO amounts from the PO endpoints (403)", async () => {
    const po = await mkPo("dispatched");
    expect((await call("fs", "/api/po/getpos")).status).toBe(403);
    expect((await call("fs", `/api/po/getpodetails/${po.id}`)).status).toBe(
      403,
    );
  });

  test("BR-FF-06 a grn.view-only caller's GRN list has no money field", async () => {
    const po = await mkPo("dispatched");
    const g = await mkGrn(po.id, [
      { poItemId: po.poItemIds[0]!, qa: "pending" },
    ]);
    const r = await call(
      "viewer",
      `/api/grn/getgrns?q=${encodeURIComponent(g.grnNumber)}`,
    );
    expect(r.status).toBe(200);
    expect(moneyKeys(r.json.data)).toEqual([]);
  });
});

describe("BR-FF-08 today and late use the IST calendar day", () => {
  test("BR-FF-08 due today 23:50 IST is today, not late", async () => {
    const po = await mkPo("dispatched", [{ qty: 100 }], istAt(0, 23, 50));
    const r = await picker("fs");
    const row = (r.json.data as Row[]).find((x) => x.poId === po.id);
    expect(row).toBeDefined();
    expect(row.isLate).toBe(false);
    expect(r.json.meta.today).toBe(todayKey);
    const today = await picker("fs", "bucket=today");
    expect(today.json.data.map((x: Row) => x.poId)).toContain(po.id);
    const late = await picker("fs", "bucket=late");
    expect(late.json.data.map((x: Row) => x.poId)).not.toContain(po.id);
  });

  test("BR-FF-08 due today 00:05 IST (still the previous day in UTC) is today, not late", async () => {
    const po = await mkPo("dispatched", [{ qty: 100 }], istAt(0, 0, 5));
    const r = await picker("fs");
    const row = (r.json.data as Row[]).find((x) => x.poId === po.id);
    expect(row.isLate).toBe(false);
    const today = await picker("fs", "bucket=today");
    expect(today.json.data.map((x: Row) => x.poId)).toContain(po.id);
  });

  test("BR-FF-08 due yesterday 23:50 IST is late; due tomorrow is later", async () => {
    const yest = await mkPo("dispatched", [{ qty: 100 }], istAt(-1, 23, 50));
    const tom = await mkPo("dispatched", [{ qty: 100 }], istAt(1, 0, 5));
    const all = await picker("fs");
    const y = (all.json.data as Row[]).find((x) => x.poId === yest.id);
    const t = (all.json.data as Row[]).find((x) => x.poId === tom.id);
    expect(y.isLate).toBe(true);
    expect(t.isLate).toBe(false);
    const late = (await picker("fs", "bucket=late")).json.data.map(
      (x: Row) => x.poId,
    );
    expect(late).toContain(yest.id);
    expect(late).not.toContain(tom.id);
    const later = (await picker("fs", "bucket=later")).json.data.map(
      (x: Row) => x.poId,
    );
    expect(later).toContain(tom.id);
  });

  test("BR-FF-08 the Home goods-expected tile counts both edge-of-day POs as today", async () => {
    const read = async () => {
      const r = await call("fs", "/api/home/getcounts?tiles=goods_expected");
      expect(r.status).toBe(200);
      expect(r.json.data.today).toBe(todayKey);
      const t = (r.json.data.tiles as Row[]).find(
        (x) => x.key === "goods_expected",
      );
      return {
        count: t?.count ?? 0,
        late: t?.late ?? 0,
        today: t?.today ?? 0,
      };
    };
    const before = await read();
    await mkPo("dispatched", [{ qty: 100 }], istAt(0, 23, 50));
    await mkPo("dispatched", [{ qty: 100 }], istAt(0, 0, 5));
    const after = await read();
    expect(after.count - before.count).toBe(2);
    expect(after.today - before.today).toBe(2);
    expect(after.late - before.late).toBe(0);
  });
});

describe("BR-FF-31 plant head Home is the same page with every tile the keys allow", () => {
  test("BR-FF-31 the owner role gets all eleven tiles in the BR-FF-13 order", async () => {
    const r = await call("owner", "/api/home/getcounts");
    expect(r.status).toBe(200);
    expect((r.json.data.tiles as Row[]).map((t) => t.key)).toEqual([
      "approvals",
      "my_prs_draft",
      "my_prs_pending",
      "prs_to_order",
      "pos_to_send",
      "my_pos_draft",
      "pos_late",
      "goods_expected",
      "grns_to_inspect",
      "jobwork_due",
      "stock_low",
    ]);
  });

  test("BR-FF-31 the owner's tiles carry no tile-level error and no money", async () => {
    const r = await call("owner", "/api/home/getcounts");
    for (const t of r.json.data.tiles as Row[]) {
      expect(t.error).toBeUndefined();
      expect(t.count).toBeGreaterThanOrEqual(0);
    }
    expect(JSON.stringify(r.json)).not.toMatch(/paise|amount|total/i);
  });

  test("BR-FF-31 a store keeper with fewer keys sees fewer tiles than the owner (same endpoint, no separate route)", async () => {
    const o = await call("owner", "/api/home/getcounts");
    const s = await call("fs", "/api/home/getcounts");
    expect(s.status).toBe(200);
    expect(s.json.data.tiles.length).toBeLessThan(o.json.data.tiles.length);
  });
});

describe("BR-FF-70 picker with nothing receivable", () => {
  test("BR-FF-70 when every PO is fully received the picker returns an empty list, not an error", async () => {
    const po = await mkPo("fully_received", [{ qty: 100, received: 100 }]);
    const r = await picker("fs", `poId=${po.id}`);
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual([]);
    expect(r.json.meta.total).toBe(0);
  });

  test("BR-FF-70 a poId that is not receivable gives 200 with empty data", async () => {
    const po = await mkPo("cancelled");
    const r = await picker("fs", `poId=${po.id}`);
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual([]);
  });
});

describe("BR-FF-72 PO no longer receivable when saving", () => {
  for (const status of ["cancelled", "closed", "fully_received"] as const) {
    test(`BR-FF-72 creategrn on a ${status} PO is refused (400) and no GRN is written`, async () => {
      const po = await mkPo(status, [
        { qty: 100, received: status === "fully_received" ? 100 : 0 },
      ]);
      const r = await call("fs", "/api/grn/creategrn", "POST", {
        poId: po.id,
        challanNo: uid(),
        lines: [{ poItemId: po.poItemIds[0], arrivedQty: 10 }],
      });
      expect(r.status).toBe(400);
      const rows = await db
        .select({ id: grns.id })
        .from(grns)
        .where(eq(grns.poId, po.id));
      expect(rows).toEqual([]);
    });
  }

  test("BR-FF-72 a PO short-closed after it was picked drops out of the picker", async () => {
    const po = await mkPo("dispatched");
    expect((await picker("fs")).json.data.map((x: Row) => x.poId)).toContain(
      po.id,
    );
    await db
      .update(purchaseOrders)
      .set({ status: "closed" })
      .where(eq(purchaseOrders.id, po.id));
    expect(
      (await picker("fs")).json.data.map((x: Row) => x.poId),
    ).not.toContain(po.id);
  });
});

describe("BR-FF-115 GRN QA status from its lines", () => {
  const cases: [string[], string][] = [
    [["pending", "passed"], "pending"],
    [["passed", "waived"], "passed"],
    [["failed", "failed"], "failed"],
    [["failed", "passed"], "mixed"],
    [["failed", "waived"], "mixed"],
    [["pending", "failed"], "pending"],
    [["waived"], "passed"],
  ];
  for (const [qas, want] of cases) {
    test(`BR-FF-115 lines ${qas.join(" + ")} -> ${want}`, async () => {
      const po = await mkPo(
        "dispatched",
        qas.map(() => ({ qty: 100 })),
      );
      const g = await mkGrn(
        po.id,
        qas.map((qa, i) => ({ poItemId: po.poItemIds[i]!, qa })),
      );
      const r = await call(
        "viewer",
        `/api/grn/getgrns?q=${encodeURIComponent(g.grnNumber)}`,
      );
      expect(r.status).toBe(200);
      const row = (r.json.data as Row[]).find(
        (x) => x.grnNumber === g.grnNumber,
      );
      expect(row).toBeDefined();
      expect(row.qaSummary).toBe(want);
    });
  }
});
