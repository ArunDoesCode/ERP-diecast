/**
 * docs/specs/factory-flows (v1, frozen): spec-receiving.md, spec.md BR-FF-06, BR-FF-09
 * BR-FF-06 no prices for non-holders   BR-FF-09 open quantity   BR-FF-61 receivable POs, oldest due first
 * BR-FF-62 key grn.edit_draft only, no prices   BR-FF-63 narrow by PO number / supplier name
 *
 * Route: GET /api/grn/getreceivablepos (contract: .pipeline/epic-factory-flows/contract.md #2).
 * Every list call narrows with q = this file's RUN prefix so other files' POs never appear.
 * Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray, like } from "drizzle-orm";
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
const P = "test_ffrecv_";
const RUN = `TEST_ffrecv_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

const emp: Record<string, number> = {};
const tokens: Record<string, string> = {};
const roleIds: Record<string, number> = {};
let supplierA = 0;
let supplierB = 0;
const created = {
  po: [] as number[],
  grn: [] as number[],
  item: [] as number[],
};

const todayKey = istDayKey();
function dayAt(offset: number): Date {
  const [y, m, d] = todayKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + offset, 6, 30));
}

async function makeRole(name: string, keys: string[]) {
  const [r] = await db
    .insert(roles)
    .values({ name: `${P}${name}`, isSystem: false })
    .returning({ id: roles.id });
  roleIds[name] = r!.id;
  if (keys.length) {
    await db
      .insert(rolePermissions)
      .values(keys.map((permissionKey) => ({ roleId: r!.id, permissionKey })));
  }
}
async function makeUser(tag: string, role: string) {
  const [e] = await db
    .insert(employees)
    .values({
      name: `${RUN}_${tag}`,
      email: `${P}${tag}@diecast.test`,
      roleId: roleIds[role]!,
      isActive: true,
    })
    .returning({ id: employees.id });
  emp[tag] = e!.id;
  tokens[tag] = await signAccessToken({
    userId: e!.id,
    userName: `${RUN}_${tag}`,
    role: `${P}${role}`,
    allowedPages: [],
  });
}

async function get(tag: string | null, path: string) {
  const res = await app.request(path, {
    headers: tag ? { Authorization: `Bearer ${tokens[tag]}` } : {},
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}
const list = (tag: string | null, query = "") =>
  get(
    tag,
    `/api/grn/getreceivablepos?q=${encodeURIComponent(RUN)}${query ? `&${query}` : ""}`,
  );

type Line = { qty: number; received?: number; uom?: string };
async function mkPo(
  status: (typeof purchaseOrders.$inferInsert)["status"],
  lines: Line[] = [{ qty: 1000 }],
  opts: {
    expected?: Date | null;
    revised?: Date | null;
    supplier?: number;
  } = {},
) {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: uid(),
      supplierId: opts.supplier ?? supplierA,
      status,
      createdBy: emp.fs!,
      expectedDeliveryDate: opts.expected === undefined ? null : opts.expected,
      revisedDeliveryDate: opts.revised ?? null,
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
        uom: l.uom ?? "kg",
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
        uom: l.uom ?? "kg",
      })
      .returning({ id: purchaseOrderItems.id });
    poItemIds.push(pi!.id);
  }
  return { id: po!.id, number: po!.poNumber, poItemIds };
}

async function mkGrnLine(
  poId: number,
  poItemId: number,
  qty: number,
  qaStatus: string,
) {
  const [g] = await db
    .insert(grns)
    .values({
      grnNumber: uid(),
      poId,
      supplierId: supplierA,
      status: "pending_qa",
      createdBy: emp.fs!,
      challanNo: uid(),
    })
    .returning({ id: grns.id });
  created.grn.push(g!.id);
  const [gi] = await db
    .insert(grnItems)
    .values({
      grnId: g!.id,
      poItemId,
      receivedQty: qty,
      acceptedQty: 0,
      qaStatus,
    })
    .returning({ id: grnItems.id });
  return gi!.id;
}

// biome-ignore lint/suspicious/noExplicitAny: row shape asserted field by field
type Row = any;
const rowFor = (rows: Row[], poId: number) => rows.find((r) => r.poId === poId);

async function cleanup() {
  if (created.grn.length) {
    await db.delete(grnItems).where(inArray(grnItems.grnId, created.grn));
    await db.delete(grns).where(inArray(grns.id, created.grn));
  }
  if (created.po.length) {
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
  await makeRole("viewonly", ["grn.view"]);
  await makeUser("fs", "fs");
  await makeUser("viewonly", "viewonly");
  const [a] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_Sri Balaji Metals` })
    .returning({ id: supplierMaster.id });
  supplierA = a!.id;
  const [b] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_Lube Co` })
    .returning({ id: supplierMaster.id });
  supplierB = b!.id;
});

afterAll(cleanup);

describe("BR-FF-62 permission and validation", () => {
  test("BR-FF-62 no session -> 401", async () => {
    expect((await list(null)).status).toBe(401);
  });

  test("BR-FF-62 a caller without grn.edit_draft -> 403 PERMISSION_DENIED naming the key", async () => {
    const r = await list("viewonly");
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
    expect(r.json.key).toBe("grn.edit_draft");
  });

  test("BR-FF-62 the PO endpoints keep needing po.manage: a store keeper calling getpos -> 403", async () => {
    const r = await get("fs", "/api/po/getpos");
    expect(r.status).toBe(403);
  });

  test("BR-FF-62 bad query -> 400 (unknown key, pageSize above 100, bad sortBy, bad bucket, bad poId)", async () => {
    for (const q of [
      "foo=1",
      "pageSize=101",
      "sortBy=price",
      "bucket=never",
      "poId=0",
    ]) {
      expect((await list("fs", q)).status).toBe(400);
    }
  });
});

describe("BR-FF-61 / BR-FF-09 which POs and lines are listed", () => {
  test("BR-FF-61 dispatched and partial_received POs with open qty are listed; other statuses are not", async () => {
    const d = await mkPo("dispatched");
    const p = await mkPo("partial_received", [{ qty: 1000, received: 300 }]);
    const others = [
      await mkPo("draft"),
      await mkPo("approved"),
      await mkPo("fully_received", [{ qty: 1000, received: 1000 }]),
      await mkPo("cancelled"),
      await mkPo("closed"),
    ];
    const r = await list("fs", "pageSize=100");
    expect(r.status).toBe(200);
    const ids = (r.json.data as Row[]).map((x) => x.poId);
    expect(ids).toContain(d.id);
    expect(ids).toContain(p.id);
    for (const o of others) expect(ids).not.toContain(o.id);
    expect(rowFor(r.json.data, d.id).status).toBe("dispatched");
    expect(rowFor(r.json.data, p.id).status).toBe("partial_received");
  });

  test("BR-FF-09 open = ordered - accepted - arrived and pending QA; the row shows ordered, received, pending QA and open", async () => {
    const po = await mkPo("dispatched", [{ qty: 1000 }], {
      expected: dayAt(5),
    });
    await mkGrnLine(po.id, po.poItemIds[0]!, 600, "pending");
    const r = await list("fs");
    const row = rowFor(r.json.data, po.id);
    expect(row.poNumber).toBe(po.number);
    expect(row.supplierName).toBe(`${RUN}_Sri Balaji Metals`);
    const line = row.lines[0];
    expect(line.poItemId).toBe(po.poItemIds[0]!);
    expect(line.orderedQty).toBe(1000);
    expect(line.receivedQty).toBe(0);
    expect(line.pendingQaQty).toBe(600);
    expect(line.openQty).toBe(400);
    expect(line.uom).toBe("kg");
  });

  test("BR-FF-09 accepted quantity (the line's received qty) is subtracted", async () => {
    const po = await mkPo("partial_received", [{ qty: 1000, received: 250 }]);
    const row = rowFor((await list("fs")).json.data, po.id);
    expect(row.lines[0].receivedQty).toBe(250);
    expect(row.lines[0].openQty).toBe(750);
  });

  test("BR-FF-09 rejected goods count as open again", async () => {
    const po = await mkPo("dispatched", [{ qty: 1000 }]);
    const gi = await mkGrnLine(po.id, po.poItemIds[0]!, 600, "pending");
    expect(rowFor((await list("fs")).json.data, po.id).lines[0].openQty).toBe(
      400,
    );
    await db
      .update(grnItems)
      .set({ qaStatus: "failed", rejectedQty: 600 })
      .where(inArray(grnItems.id, [gi]));
    expect(rowFor((await list("fs")).json.data, po.id).lines[0].openQty).toBe(
      1000,
    );
  });

  test("BR-FF-61 a PO whose every line has fully arrived (pending QA) has no open qty and is not listed", async () => {
    const po = await mkPo("dispatched", [{ qty: 500 }]);
    await mkGrnLine(po.id, po.poItemIds[0]!, 500, "pending");
    const r = await list("fs", "pageSize=100");
    expect(rowFor(r.json.data, po.id)).toBeUndefined();
  });

  test("BR-FF-61 only lines with open qty above 0 are listed", async () => {
    const po = await mkPo("partial_received", [
      { qty: 100, received: 100 },
      { qty: 40 },
    ]);
    const row = rowFor((await list("fs")).json.data, po.id);
    expect(row.lines.length).toBe(1);
    expect(row.lines[0].poItemId).toBe(po.poItemIds[1]!);
    expect(row.lines[0].openQty).toBe(40);
  });
});

describe("BR-FF-61 order, lateness, paging", () => {
  test("BR-FF-61 oldest due date first (revised date wins over expected); late marked, meta.today is the IST day", async () => {
    const later = await mkPo("dispatched", [{ qty: 10 }], {
      expected: dayAt(9),
    });
    const late = await mkPo("dispatched", [{ qty: 10 }], {
      expected: dayAt(-3),
    });
    const revised = await mkPo("dispatched", [{ qty: 10 }], {
      expected: dayAt(-20),
      revised: dayAt(4),
    });
    const r = await list("fs", "pageSize=100");
    expect(r.json.meta.today).toBe(todayKey);
    const ids = (r.json.data as Row[]).map((x) => x.poId);
    expect(ids.indexOf(late.id)).toBeLessThan(ids.indexOf(revised.id));
    expect(ids.indexOf(revised.id)).toBeLessThan(ids.indexOf(later.id));
    expect(rowFor(r.json.data, late.id).isLate).toBe(true);
    expect(rowFor(r.json.data, revised.id).isLate).toBe(false);
    expect(rowFor(r.json.data, revised.id).dueDate).toBeTruthy();
  });

  test("BR-FF-14 bucket filter: late / today / later", async () => {
    const late = await mkPo("dispatched", [{ qty: 10 }], {
      expected: dayAt(-1),
    });
    const today = await mkPo("dispatched", [{ qty: 10 }], {
      expected: dayAt(0),
    });
    const later = await mkPo("dispatched", [{ qty: 10 }], {
      expected: dayAt(6),
    });
    const idsOf = async (bucket: string) =>
      (
        (await list("fs", `bucket=${bucket}&pageSize=100`)).json.data as Row[]
      ).map((x) => x.poId);
    const l = await idsOf("late");
    expect(l).toContain(late.id);
    expect(l).not.toContain(today.id);
    expect(l).not.toContain(later.id);
    const t = await idsOf("today");
    expect(t).toContain(today.id);
    expect(t).not.toContain(late.id);
    const w = await idsOf("later");
    expect(w).toContain(later.id);
    expect(w).not.toContain(today.id);
  });

  test("BR-FF-61 paging: pageSize 2 returns 2 rows and meta total covers all matches", async () => {
    for (let i = 0; i < 3; i++) await mkPo("dispatched");
    const r = await list("fs", "pageSize=2&page=1");
    expect(r.json.data.length).toBe(2);
    expect(r.json.meta.pageSize).toBe(2);
    expect(r.json.meta.total).toBeGreaterThanOrEqual(3);
    expect(r.json.meta.totalPages).toBe(Math.ceil(r.json.meta.total / 2));
  });
});

describe("BR-FF-63 narrowing and poId", () => {
  test("BR-FF-63 typing part of a supplier name keeps only that supplier's orders", async () => {
    const a = await mkPo("dispatched", [{ qty: 10 }], { supplier: supplierA });
    const b = await mkPo("dispatched", [{ qty: 10 }], { supplier: supplierB });
    const r = await get(
      "fs",
      `/api/grn/getreceivablepos?q=${encodeURIComponent(`${RUN}_Sri Balaji`)}&pageSize=100`,
    );
    const ids = (r.json.data as Row[]).map((x) => x.poId);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
  });

  test("BR-FF-63 typing a PO number finds that order", async () => {
    const a = await mkPo("dispatched", [{ qty: 10 }]);
    const r = await get(
      "fs",
      `/api/grn/getreceivablepos?q=${encodeURIComponent(a.number)}`,
    );
    expect((r.json.data as Row[]).map((x) => x.poId)).toEqual([a.id]);
  });

  test("BR-FF-68 poId returns just that PO; an unknown or not-receivable poId -> 200 with empty data", async () => {
    const ok = await mkPo("dispatched", [{ qty: 10 }]);
    const done = await mkPo("fully_received", [{ qty: 10, received: 10 }]);
    const one = await get("fs", `/api/grn/getreceivablepos?poId=${ok.id}`);
    expect((one.json.data as Row[]).map((x) => x.poId)).toEqual([ok.id]);
    const closed = await get("fs", `/api/grn/getreceivablepos?poId=${done.id}`);
    expect(closed.status).toBe(200);
    expect(closed.json.data).toEqual([]);
    const missing = await get(
      "fs",
      "/api/grn/getreceivablepos?poId=2147483000",
    );
    expect(missing.status).toBe(200);
    expect(missing.json.data).toEqual([]);
  });
});

describe("BR-FF-06 / BR-FF-62 no prices", () => {
  test("BR-FF-06 rows and lines carry no rate, GST, line value or total", async () => {
    const po = await mkPo("dispatched", [{ qty: 1000 }]);
    const r = await list("fs");
    const row = rowFor(r.json.data, po.id);
    const keys: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          keys.push(k);
          walk(x);
        }
      }
    };
    walk(row);
    for (const k of keys) {
      expect(k.toLowerCase()).not.toMatch(
        /price|rate|gst|tax|paise|amount|total|subtotal|linevalue/,
      );
    }
    const text = JSON.stringify(row);
    expect(text).not.toContain("24500");
    expect(text).not.toContain("28910000");
  });
});
