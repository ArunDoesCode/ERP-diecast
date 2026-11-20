/**
 * docs/specs/factory-flows (v1, frozen): spec.md BR-FF-02, 09, 26; spec-documents.md BR-FF-43;
 * spec-home.md BR-FF-29; spec-layout.md BR-FF-105..109, 115
 *
 * Routes (contract step 2): GET /api/pr/getprs, /api/po/getpos, /api/po/getpodetails/:id,
 * /api/grn/getgrns, /api/sco/challans/open, with GET /api/home/getcounts for the "number = rows" rule.
 * Every list call narrows with q = this file's RUN prefix (challans: vendorId) so other files' rows never count.
 * Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { rolePermissions, roles } from "../../src/db/schemas/01_auth";
import {
  approvalPolicies,
  approvalRequests,
} from "../../src/db/schemas/02_procurement-approval";
import {
  itemMaster,
  serviceMaster,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  grnItems,
  grns,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  scoChallanLines,
  scoChallans,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../../src/db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { istDayKey } from "../../src/lib/ist-day";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const P = "test_fflist_";
const RUN = `TEST_fflist_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;
const PRIO = -96181;

const emp: Record<string, number> = {};
const roleIds: Record<string, number> = {};
const tokens: Record<string, string> = {};
let supplierId = 0;
let policyId = 0;
let rawItemId = 0;
let scoId = 0;
let scoItemId = 0;
const created = {
  pr: [] as number[],
  po: [] as number[],
  grn: [] as number[],
  req: [] as number[],
  item: [] as number[],
  challan: [] as number[],
};

const todayKey = istDayKey();
/** Timestamp on calendar day `offset` from today in both UTC and IST (06:30Z = 12:00 IST). */
function dayAt(offset: number): Date {
  const [y, m, d] = todayKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + offset, 6, 30));
}
const dayKey = (offset: number) => dayAt(offset).toISOString().slice(0, 10);

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

async function get(tag: string, path: string) {
  const res = await app.request(path, {
    headers: { Authorization: `Bearer ${tokens[tag]}` },
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}
const q = encodeURIComponent(RUN);
const prs = (tag: string, extra = "") =>
  get(tag, `/api/pr/getprs?q=${q}&pageSize=100${extra ? `&${extra}` : ""}`);
const pos = (tag: string, extra = "") =>
  get(tag, `/api/po/getpos?q=${q}&pageSize=100${extra ? `&${extra}` : ""}`);
const grnList = (tag: string, extra = "") =>
  get(tag, `/api/grn/getgrns?q=${q}&pageSize=100${extra ? `&${extra}` : ""}`);
const challans = (tag: string, extra = "") =>
  get(
    tag,
    `/api/sco/challans/open?vendorId=${supplierId}&pageSize=100${extra ? `&${extra}` : ""}`,
  );

// biome-ignore lint/suspicious/noExplicitAny: row shape asserted field by field
type Row = any;
const byNumber = (rows: Row[], num: string) =>
  rows.find(
    (r) => r.prNumber === num || r.poNumber === num || r.grnNumber === num,
  );

type Tile = {
  key: string;
  count?: number;
  late?: number;
  today?: number;
  later?: number;
};
async function tile(tag: string, key: string): Promise<Tile> {
  const r = await get(tag, `/api/home/getcounts?tiles=${key}`);
  expect(r.status).toBe(200);
  const t = (r.json.data.tiles as Tile[]).find((x) => x.key === key);
  if (!t) throw new Error(`tile ${key} absent for ${tag}`);
  return t;
}
const n = (v: number | undefined) => v ?? 0;
function delta(a: Tile, b: Tile) {
  return {
    count: n(b.count) - n(a.count),
    late: n(b.late) - n(a.late),
    today: n(b.today) - n(a.today),
    later: n(b.later) - n(a.later),
  };
}

async function mkItem(uom = "kg") {
  const [i] = await db
    .insert(itemMaster)
    .values({ sku: uid(), name: `${RUN} item`, category: "Raw Material", uom })
    .returning({ id: itemMaster.id });
  created.item.push(i!.id);
  return i!.id;
}

async function mkPr(
  owner: string,
  status: (typeof purchaseRequests.$inferInsert)["status"],
  lines: { expected?: Date | null; status?: "pending" | "po_draft" }[] = [{}],
  estimatedAmountPaise = 0,
) {
  const [pr] = await db
    .insert(purchaseRequests)
    .values({
      prNumber: uid(),
      type: "misc",
      requestedBy: emp[owner]!,
      status,
      notes: RUN,
      estimatedAmountPaise,
    })
    .returning({
      id: purchaseRequests.id,
      prNumber: purchaseRequests.prNumber,
    });
  created.pr.push(pr!.id);
  for (const l of lines) {
    await db.insert(purchaseRequestItems).values({
      prId: pr!.id,
      itemId: await mkItem(),
      requestedQty: 10,
      uom: "kg",
      expectedDate: l.expected === undefined ? null : l.expected,
      status: l.status ?? "pending",
    });
  }
  return { id: pr!.id, number: pr!.prNumber };
}

async function mkPo(
  status: (typeof purchaseOrders.$inferInsert)["status"],
  opts: {
    expected?: Date | null;
    revised?: Date | null;
    lines?: { qty: number; received?: number }[];
    total?: number;
  } = {},
) {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: uid(),
      supplierId,
      status,
      createdBy: emp.a!,
      expectedDeliveryDate: opts.expected === undefined ? null : opts.expected,
      revisedDeliveryDate: opts.revised ?? null,
      totalAmountPaise: opts.total ?? 0,
    })
    .returning({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber });
  created.po.push(po!.id);
  const poItemIds: number[] = [];
  for (const l of opts.lines ?? [{ qty: 1000 }]) {
    const [pi] = await db
      .insert(purchaseOrderItems)
      .values({
        poId: po!.id,
        itemId: await mkItem(),
        qty: l.qty,
        receivedQty: l.received ?? 0,
        unitPricePaise: 24500,
        uom: "kg",
      })
      .returning({ id: purchaseOrderItems.id });
    poItemIds.push(pi!.id);
  }
  return { id: po!.id, number: po!.poNumber, poItemIds };
}

type GrnLine = { poItemId: number; qty: number; qa: string; rejected?: number };
async function mkGrn(
  poId: number,
  lines: GrnLine[],
  opts: { status?: (typeof grns.$inferInsert)["status"]; received?: Date } = {},
) {
  const [g] = await db
    .insert(grns)
    .values({
      grnNumber: uid(),
      poId,
      supplierId,
      status: opts.status ?? "pending_qa",
      receivedDate: opts.received ?? dayAt(0),
      createdBy: emp.a!,
      challanNo: uid(),
    })
    .returning({ id: grns.id, grnNumber: grns.grnNumber });
  created.grn.push(g!.id);
  for (const l of lines) {
    await db.insert(grnItems).values({
      grnId: g!.id,
      poItemId: l.poItemId,
      receivedQty: l.qty,
      acceptedQty: 0,
      rejectedQty: l.rejected ?? 0,
      qaStatus: l.qa,
    });
  }
  return { id: g!.id, number: g!.grnNumber };
}

async function mkChallan(due: Date, qty: number, settled: number) {
  const [c] = await db
    .insert(scoChallans)
    .values({
      challanNumber: `T${Date.now().toString().slice(-9)}${++seq}`.slice(0, 16),
      scoId,
      vendorId: supplierId,
      challanDate: dayAt(-20),
      valuePaise: 1000,
      returnDueDate: due,
      createdBy: emp.a!,
    })
    .returning({
      id: scoChallans.id,
      challanNumber: scoChallans.challanNumber,
    });
  created.challan.push(c!.id);
  await db.insert(scoChallanLines).values({
    challanId: c!.id,
    scoItemId,
    itemId: rawItemId,
    qty,
    unitIssueCostPaise: 10,
    hsnCode: "7601",
    settledQty: settled,
  });
  return c!;
}

async function cleanup() {
  if (created.req.length) {
    await db
      .delete(approvalRequests)
      .where(inArray(approvalRequests.id, created.req));
  }
  if (created.grn.length) {
    await db.delete(grnItems).where(inArray(grnItems.grnId, created.grn));
    await db.delete(grns).where(inArray(grns.id, created.grn));
  }
  if (created.challan.length) {
    await db
      .delete(scoChallanLines)
      .where(inArray(scoChallanLines.challanId, created.challan));
    await db
      .delete(scoChallans)
      .where(inArray(scoChallans.id, created.challan));
  }
  if (scoId) {
    await db
      .delete(subcontractingOrderItems)
      .where(eq(subcontractingOrderItems.scoId, scoId));
    await db
      .delete(subcontractingOrders)
      .where(eq(subcontractingOrders.id, scoId));
  }
  if (created.po.length) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, created.po));
    await db
      .delete(purchaseOrders)
      .where(inArray(purchaseOrders.id, created.po));
  }
  if (created.pr.length) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, created.pr));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, created.pr));
  }
  await db.delete(approvalPolicies).where(eq(approvalPolicies.priority, PRIO));
  await db.delete(serviceMaster).where(like(serviceMaster.code, `${RUN}%`));
  if (created.item.length) {
    await db.delete(itemMaster).where(inArray(itemMaster.id, created.item));
  }
  await db.delete(supplierMaster).where(like(supplierMaster.name, `${RUN}%`));
  await db.delete(employees).where(like(employees.email, `${P}%`));
  await db.delete(roles).where(like(roles.name, `${P}%`));
}

beforeAll(async () => {
  await makeRole("all", [
    "pr.manage",
    "po.manage",
    "grn.view",
    "grn.edit_draft",
    "grn.qa_decide",
    "sco.view",
  ]);
  await makeRole("grnonly", ["grn.view"]);
  await makeUser("a", "all");
  await makeUser("b", "all");
  await makeUser("g", "grnonly");

  const [s] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_Sri Balaji Metals` })
    .returning({ id: supplierMaster.id });
  supplierId = s!.id;
  const [pol] = await db
    .insert(approvalPolicies)
    .values({
      name: `${RUN}_policy`,
      priority: PRIO,
      docType: "pr",
      subDocType: "misc",
      isActive: false,
      approvalChain: [],
    })
    .returning({ id: approvalPolicies.id });
  policyId = pol!.id;

  rawItemId = await mkItem("pcs");
  const finItemId = await mkItem("pcs");
  const [svc] = await db
    .insert(serviceMaster)
    .values({ code: `${RUN}_svc`, name: `${RUN}_svc`, defaultUom: "pcs" })
    .returning({ id: serviceMaster.id });
  const [sco] = await db
    .insert(subcontractingOrders)
    .values({
      scoNumber: uid(),
      vendorId: supplierId,
      expectedReturnDate: dayAt(30),
      createdBy: emp.a!,
    })
    .returning({ id: subcontractingOrders.id });
  scoId = sco!.id;
  const [si] = await db
    .insert(subcontractingOrderItems)
    .values({
      scoId,
      rawItemId,
      rawQtyToIssue: 100,
      serviceId: svc!.id,
      serviceDescription: "svc",
      serviceUnitPricePaise: 1000,
      finishedItemId: finItemId,
      expectedReturnQty: 100,
    })
    .returning({ id: subcontractingOrderItems.id });
  scoItemId = si!.id;
});

afterAll(cleanup);

// ---------------------------------------------------------------------------------------------
describe("PR list: BR-FF-106 columns, BR-FF-21 sent back", () => {
  test("BR-FF-106 a row has requester name, line count, estimate and the earliest required-by date", async () => {
    const pr = await mkPr(
      "a",
      "pending_approval",
      [{ expected: dayAt(8) }, { expected: dayAt(5) }],
      25_100_000,
    );
    const r = await prs("a");
    expect(r.status).toBe(200);
    const row = byNumber(r.json.data, pr.number);
    expect(row.requestedByName).toBe(`${RUN}_a`);
    expect(row.lineCount).toBe(2);
    expect(row.estimatedAmountPaise).toBe(25_100_000);
    expect(row.earliestRequiredBy).toBe(dayKey(5));
  });

  test("BR-FF-106 no required-by date on any line -> earliestRequiredBy null", async () => {
    const pr = await mkPr("a", "draft", [{ expected: null }]);
    const row = byNumber((await prs("a")).json.data, pr.number);
    expect(row.earliestRequiredBy).toBeNull();
    expect(row.lineCount).toBe(1);
  });

  test("BR-FF-21 a draft whose last approval request was sent back is marked sentBack; a plain draft is not", async () => {
    const sent = await mkPr("a", "draft");
    const [req] = await db
      .insert(approvalRequests)
      .values({
        docType: "pr",
        docId: sent.id,
        policyId,
        status: "require_more_info",
        currentLevel: 1,
        totalLevels: 1,
        chainSnapshot: [],
        requestedBy: emp.a!,
      })
      .returning({ id: approvalRequests.id });
    created.req.push(req!.id);
    const plain = await mkPr("a", "draft");
    const rows = (await prs("a")).json.data;
    expect(byNumber(rows, sent.number).sentBack).toBe(true);
    expect(byNumber(rows, plain.number).sentBack).toBe(false);
  });

  test("BR-FF-106 sort by estimate works both ways", async () => {
    await mkPr("a", "draft", [{}], 100);
    await mkPr("a", "draft", [{}], 900);
    const asc = (await prs("a", "sortBy=estimatedAmountPaise&sortDir=asc")).json
      .data as Row[];
    const desc = (await prs("a", "sortBy=estimatedAmountPaise&sortDir=desc"))
      .json.data as Row[];
    const a = asc.map((r) => r.estimatedAmountPaise);
    expect(a).toEqual([...a].sort((x, y) => x - y));
    const d = desc.map((r) => r.estimatedAmountPaise);
    expect(d).toEqual([...d].sort((x, y) => y - x));
  });

  test("BR-FF-106 mine=true lists only the caller's requisitions", async () => {
    const mine = await mkPr("a", "draft");
    const theirs = await mkPr("b", "draft");
    const rows = (await prs("a", "mine=true")).json.data as Row[];
    expect(byNumber(rows, mine.number)).toBeDefined();
    expect(byNumber(rows, theirs.number)).toBeUndefined();
    expect(rows.every((r) => r.requestedByName === `${RUN}_a`)).toBe(true);
  });
});

describe("PR list: BR-FF-02 / BR-FF-109 'To order' number equals its rows", () => {
  test("BR-FF-109 meta.toOrderCount = rows toOrder=true returns = Home tile 'Requisitions to order'; buckets split it", async () => {
    const before = await tile("a", "prs_to_order");
    const late = await mkPr("a", "approved", [{ expected: dayAt(-2) }]);
    const later = await mkPr("a", "partial_ordered", [
      { expected: dayAt(20) },
      { status: "po_draft" },
    ]);
    await mkPr("a", "approved", [{ status: "po_draft" }]); // every line on a PO: not to order
    await mkPr("a", "pending_approval", [{}]);

    const all = await prs("a");
    const toOrder = await prs("a", "toOrder=true");
    expect(toOrder.status).toBe(200);
    expect(toOrder.json.data.length).toBe(toOrder.json.meta.total);
    expect(byNumber(toOrder.json.data, late.number)).toBeDefined();
    expect(byNumber(toOrder.json.data, later.number)).toBeDefined();
    expect(all.json.meta.toOrderCount).toBe(toOrder.json.meta.total);
    expect(toOrder.json.meta.total).toBe(2);

    const after = await tile("a", "prs_to_order");
    expect(delta(before, after)).toEqual({
      count: 2,
      late: 1,
      today: 0,
      later: 1,
    });

    const l = await prs("a", "toOrder=true&bucket=late");
    expect(l.json.data.map((r: Row) => r.prNumber)).toEqual([late.number]);
    const lt = await prs("a", "toOrder=true&bucket=later");
    expect(lt.json.data.map((r: Row) => r.prNumber)).toEqual([later.number]);
    expect((await prs("a", "toOrder=true&bucket=today")).json.data.length).toBe(
      0,
    );
  });

  test("BR-FF-109 bucket without toOrder=true -> 400 VALIDATION_ERROR", async () => {
    const r = await prs("a", "bucket=late");
    expect(r.status).toBe(400);
  });
});

describe("BR-FF-105 page size", () => {
  test("BR-FF-105 pageSize 25, 50 and 100 are accepted and echoed; 101 -> 400", async () => {
    for (const size of [25, 50, 100]) {
      const r = await get("a", `/api/pr/getprs?q=${q}&pageSize=${size}`);
      expect(r.status).toBe(200);
      expect(r.json.meta.pageSize).toBe(size);
    }
    expect((await get("a", `/api/pr/getprs?q=${q}&pageSize=101`)).status).toBe(
      400,
    );
    expect((await get("a", `/api/po/getpos?q=${q}&pageSize=101`)).status).toBe(
      400,
    );
    expect(
      (await get("a", `/api/grn/getgrns?q=${q}&pageSize=101`)).status,
    ).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
describe("PO list: BR-FF-107 columns", () => {
  test("BR-FF-107 supplier, line count, total, due date and received % by accepted qty", async () => {
    const po = await mkPo("partial_received", {
      expected: dayAt(6),
      lines: [{ qty: 1000, received: 600 }],
      total: 28_910_000,
    });
    const row = byNumber((await pos("a")).json.data, po.number);
    expect(row.supplierName).toBe(`${RUN}_Sri Balaji Metals`);
    expect(row.lineCount).toBe(1);
    expect(row.totalAmountPaise).toBe(28_910_000);
    expect(row.receivedPct).toBe(60);
    expect(String(row.dueDate).slice(0, 10)).toBe(dayKey(6));
  });

  test("BR-FF-107 goods pending QA do not count as received: 600 kg on a GRN waiting for QA -> 0 %", async () => {
    const po = await mkPo("dispatched", { expected: dayAt(6) });
    await mkGrn(po.id, [
      { poItemId: po.poItemIds[0]!, qty: 600, qa: "pending" },
    ]);
    const row = byNumber((await pos("a")).json.data, po.number);
    expect(row.receivedPct).toBe(0);
  });

  test("BR-FF-107 the revised date wins over the expected date for the due date column", async () => {
    const po = await mkPo("dispatched", {
      expected: dayAt(2),
      revised: dayAt(9),
    });
    const row = byNumber((await pos("a")).json.data, po.number);
    expect(String(row.dueDate).slice(0, 10)).toBe(dayKey(9));
  });

  test("BR-FF-107 sort by total amount", async () => {
    await mkPo("draft", { total: 111 });
    await mkPo("draft", { total: 999_999 });
    const rows = (await pos("a", "sortBy=totalAmountPaise&sortDir=desc")).json
      .data as Row[];
    const t = rows.map((r) => r.totalAmountPaise);
    expect(t).toEqual([...t].sort((x, y) => y - x));
  });

  test("BR-FF-107 mine=true lists only POs the caller created", async () => {
    const [other] = await db
      .insert(purchaseOrders)
      .values({
        poNumber: uid(),
        supplierId,
        status: "draft",
        createdBy: emp.b!,
      })
      .returning({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber });
    created.po.push(other!.id);
    const mine = await mkPo("draft");
    const rows = (await pos("a", "mine=true")).json.data as Row[];
    expect(byNumber(rows, mine.number)).toBeDefined();
    expect(byNumber(rows, other!.poNumber)).toBeUndefined();
  });
});

describe("PO list: BR-FF-26 Late is one predicate and BR-FF-02 numbers equal rows", () => {
  test("BR-FF-26 late = dispatched / partly received, due before today, goods pending QA still open; lateCount = bucket=late rows = tile", async () => {
    const before = await tile("a", "pos_late");
    const late = await mkPo("dispatched", {
      expected: dayAt(-3),
      lines: [{ qty: 1000, received: 600 }],
    });
    await mkGrn(late.id, [
      { poItemId: late.poItemIds[0]!, qty: 400, qa: "pending" },
    ]);
    const today = await mkPo("dispatched", { expected: dayAt(0) });
    const draftOld = await mkPo("draft", { expected: dayAt(-3) });

    const all = await pos("a");
    const l = await pos("a", "bucket=late");
    expect(l.status).toBe(200);
    expect(l.json.data.map((r: Row) => r.poNumber)).toEqual([late.number]);
    expect(all.json.meta.lateCount).toBe(1);
    expect(l.json.meta.lateCount).toBe(l.json.meta.total);
    const t = await pos("a", "bucket=today");
    expect(t.json.data.map((r: Row) => r.poNumber)).toEqual([today.number]);
    expect(byNumber(l.json.data, draftOld.number)).toBeUndefined();

    const after = await tile("a", "pos_late");
    expect(delta(before, after).count).toBe(1);
  });

  test("BR-FF-26 overdue=true returns the same rows as bucket=late; overdue with another bucket -> 400", async () => {
    const a = await pos("a", "overdue=true");
    const b = await pos("a", "bucket=late");
    expect(a.json.data.map((r: Row) => r.id).sort()).toEqual(
      b.json.data.map((r: Row) => r.id).sort(),
    );
    const bad = await pos("a", "overdue=true&bucket=today");
    expect(bad.status).toBe(400);
  });

  test("BR-FF-109 meta.statusCounts equals the rows each status filter returns", async () => {
    const statuses = [
      "draft",
      "pending_approval",
      "approved",
      "dispatched",
      "partial_received",
    ] as const;
    for (const s of statuses) await mkPo(s);
    const all = await pos("a");
    const counts = all.json.meta.statusCounts as Record<string, number>;
    for (const s of statuses) {
      const rows = await pos("a", `status=${s}`);
      expect(counts[s] ?? 0).toBe(rows.json.meta.total);
      expect(counts[s]).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("PO details: BR-FF-43 / BR-FF-09 line progress", () => {
  test("BR-FF-43 a line shows accepted, awaiting QA and open qty: ordered 1000, accepted 0, 600 awaiting QA -> open 400", async () => {
    const po = await mkPo("dispatched");
    await mkGrn(po.id, [
      { poItemId: po.poItemIds[0]!, qty: 600, qa: "pending" },
    ]);
    const r = await get("a", `/api/po/getpodetails/${po.id}`);
    expect(r.status).toBe(200);
    const line = r.json.data.items[0];
    expect(line.receivedQty).toBe(0);
    expect(line.pendingQaQty).toBe(600);
    expect(line.openQty).toBe(400);
  });

  test("BR-FF-09 accepted qty is subtracted too: 1000 ordered, 300 accepted, 200 awaiting QA -> open 500", async () => {
    const po = await mkPo("partial_received", {
      lines: [{ qty: 1000, received: 300 }],
    });
    await mkGrn(po.id, [
      { poItemId: po.poItemIds[0]!, qty: 200, qa: "pending" },
    ]);
    const line = (await get("a", `/api/po/getpodetails/${po.id}`)).json.data
      .items[0];
    expect(line.pendingQaQty).toBe(200);
    expect(line.openQty).toBe(500);
  });

  test("BR-FF-09 rejected goods count as open again", async () => {
    const po = await mkPo("dispatched");
    await mkGrn(
      po.id,
      [{ poItemId: po.poItemIds[0]!, qty: 600, qa: "failed", rejected: 600 }],
      { status: "rejected" },
    );
    const line = (await get("a", `/api/po/getpodetails/${po.id}`)).json.data
      .items[0];
    expect(line.pendingQaQty).toBe(0);
    expect(line.openQty).toBe(1000);
  });

  test("BR-FF-09 lines of a deleted draft GRN count as open again", async () => {
    const po = await mkPo("dispatched");
    const g = await mkGrn(
      po.id,
      [{ poItemId: po.poItemIds[0]!, qty: 600, qa: "pending" }],
      { status: "draft" },
    );
    await db.delete(grnItems).where(eq(grnItems.grnId, g.id));
    await db.delete(grns).where(eq(grns.id, g.id));
    const line = (await get("a", `/api/po/getpodetails/${po.id}`)).json.data
      .items[0];
    expect(line.pendingQaQty).toBe(0);
    expect(line.openQty).toBe(1000);
  });
});

// ---------------------------------------------------------------------------------------------
describe("GRN list: BR-FF-108 columns and BR-FF-115 QA status", () => {
  async function grnWith(qas: string[]) {
    const po = await mkPo("dispatched", {
      lines: qas.map(() => ({ qty: 100 })),
    });
    return mkGrn(
      po.id,
      qas.map((qa, i) => ({
        poItemId: po.poItemIds[i]!,
        qty: 10,
        qa,
        rejected: qa === "failed" ? 10 : 0,
      })),
    );
  }
  const cases: [string[], string][] = [
    [["pending", "passed"], "pending"],
    [["passed", "waived"], "passed"],
    [["failed", "failed"], "failed"],
    [["failed", "passed"], "mixed"],
    [["failed", "waived"], "mixed"],
    [["pending", "failed"], "pending"],
  ];
  for (const [qas, want] of cases) {
    test(`BR-FF-115 lines ${qas.join(" + ")} -> ${want}`, async () => {
      const g = await grnWith(qas);
      const row = byNumber((await grnList("a")).json.data, g.number);
      expect(row.qaSummary).toBe(want);
      expect(row.lineCount).toBe(qas.length);
    });
  }

  test("BR-FF-108 a row has supplier name, line count and status; no money field of any kind", async () => {
    const po = await mkPo("dispatched");
    const g = await mkGrn(
      po.id,
      [{ poItemId: po.poItemIds[0]!, qty: 600, qa: "pending" }],
      { status: "draft" },
    );
    const row = byNumber((await grnList("a")).json.data, g.number);
    expect(row.supplierName).toBe(`${RUN}_Sri Balaji Metals`);
    expect(row.lineCount).toBe(1);
    expect(row.status).toBe("draft");
    expect(
      Object.keys(row).filter((k) =>
        /paise|price|gst|amount|value|rate$/i.test(k),
      ),
    ).toEqual([]);
  });

  test("BR-FF-108 poCanOpen is true for a po.manage holder and false for a grn.view-only caller", async () => {
    const po = await mkPo("dispatched");
    const g = await mkGrn(po.id, [
      { poItemId: po.poItemIds[0]!, qty: 5, qa: "pending" },
    ]);
    expect(byNumber((await grnList("a")).json.data, g.number).poCanOpen).toBe(
      true,
    );
    expect(byNumber((await grnList("g")).json.data, g.number).poCanOpen).toBe(
      false,
    );
  });
});

describe("GRN list: BR-FF-109 strip counts, BR-FF-02, bucket", () => {
  test("BR-FF-109 meta.statusCounts equals the rows each status filter returns", async () => {
    const po = await mkPo("dispatched", { lines: [{ qty: 1000 }] });
    const line = po.poItemIds[0]!;
    const statuses = ["draft", "pending_qa", "accepted", "rejected"] as const;
    for (const status of statuses) {
      await mkGrn(
        po.id,
        [
          {
            poItemId: line,
            qty: 1,
            qa: status === "accepted" ? "passed" : "pending",
          },
        ],
        { status },
      );
    }
    const all = await grnList("a");
    const counts = all.json.meta.statusCounts as Record<string, number>;
    for (const s of statuses) {
      const rows = await grnList("a", `status=${s}`);
      expect(counts[s] ?? 0).toBe(rows.json.meta.total);
      expect(counts[s]).toBeGreaterThanOrEqual(1);
    }
  });

  test("BR-FF-02 Late receipts-to-inspect: bucket=late rows = Home tile late count; bucket=late implies QA pending", async () => {
    const before = await tile("a", "grns_to_inspect");
    const todayListBefore = (
      await grnList("a", "bucket=today&qaStatus=pending")
    ).json.meta.total;
    const po = await mkPo("dispatched", {
      lines: [{ qty: 100 }, { qty: 100 }],
    });
    const [l1, l2] = po.poItemIds as [number, number];
    const late = await mkGrn(po.id, [{ poItemId: l1, qty: 5, qa: "pending" }], {
      received: dayAt(-3),
    });
    const doneOld = await mkGrn(
      po.id,
      [{ poItemId: l2, qty: 5, qa: "passed" }],
      { status: "accepted", received: dayAt(-3) },
    );
    const todayG = await mkGrn(
      po.id,
      [{ poItemId: l1, qty: 5, qa: "pending" }],
      { received: dayAt(0) },
    );

    const l = await grnList("a", "bucket=late");
    expect(l.status).toBe(200);
    const nums = l.json.data.map((r: Row) => r.grnNumber);
    expect(nums).toContain(late.number);
    expect(nums).not.toContain(doneOld.number);
    expect(nums).not.toContain(todayG.number);

    const after = await tile("a", "grns_to_inspect");
    expect(delta(before, after).late).toBe(l.json.meta.total);
    // like with like: change in the tile equals change in the list total
    const todayListAfter = (await grnList("a", "bucket=today&qaStatus=pending"))
      .json.meta.total;
    expect(delta(before, after).today).toBe(todayListAfter - todayListBefore);
  });

  test("BR-FF-02 bucket=late with a qaStatus other than pending -> 400 VALIDATION_ERROR; with pending -> 200", async () => {
    const bad = await grnList("a", "bucket=late&qaStatus=passed");
    expect(bad.status).toBe(400);
    expect((await grnList("a", "bucket=late&qaStatus=pending")).status).toBe(
      200,
    );
  });
});

// ---------------------------------------------------------------------------------------------
describe("BR-FF-29 job-work due back: list bucket = tile", () => {
  test("BR-FF-29 bucket=late is the same rows as dueStatus=overdue; settled challans are not listed", async () => {
    const overdue = await mkChallan(dayAt(-3), 50, 0);
    const settled = await mkChallan(dayAt(-3), 50, 50);
    const a = await challans("a", "bucket=late");
    const b = await challans("a", "dueStatus=overdue");
    expect(a.status).toBe(200);
    const na = a.json.data.map((r: Row) => r.challanNumber).sort();
    expect(na).toEqual(b.json.data.map((r: Row) => r.challanNumber).sort());
    expect(na).toContain(overdue.challanNumber);
    expect(na).not.toContain(settled.challanNumber);
  });

  test("BR-FF-14 / BR-FF-29 today and later buckets split on return due date; the three buckets add up to the open list and to the tile", async () => {
    const before = await tile("a", "jobwork_due");
    const listBefore = (await challans("a")).json.meta.total;
    const today = await mkChallan(dayAt(0), 10, 0);
    const later = await mkChallan(dayAt(40), 10, 3);
    const t = await challans("a", "bucket=today");
    expect(t.json.data.map((r: Row) => r.challanNumber)).toEqual([
      today.challanNumber,
    ]);
    const l = await challans("a", "bucket=later");
    expect(l.json.data.map((r: Row) => r.challanNumber)).toEqual([
      later.challanNumber,
    ]);

    const late = await challans("a", "bucket=late");
    const all = await challans("a");
    expect(late.json.meta.total + t.json.meta.total + l.json.meta.total).toBe(
      all.json.meta.total,
    );
    const after = await tile("a", "jobwork_due");
    // like with like: change in the tile equals change in the open list total
    expect(delta(before, after).count).toBe(all.json.meta.total - listBefore);
  });

  test("BR-FF-29 bucket=late with dueStatus other than overdue -> 400 VALIDATION_ERROR", async () => {
    const r = await challans("a", "bucket=late&dueStatus=ok");
    expect(r.status).toBe(400);
  });
});
