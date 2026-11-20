/**
 * docs/specs/factory-flows/spec-home.md (v1, frozen)
 * BR-FF-11 tiles only for keys held      BR-FF-14 Late / Today / Later split   BR-FF-18 "my" tiles
 * BR-FF-20..30 one test group per tile   BR-FF-34 tile needs its own key AND its target list's key
 *
 * Route: GET /api/home/getcounts (contract: .pipeline/epic-factory-flows/contract.md #1).
 * The test DB is shared, so counts that cover everybody's documents are asserted as a DELTA
 * (read before, add fixtures, read after). "My" tiles use fresh employees and are asserted absolutely.
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
  approvalTrails,
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
const P = "test_ffhome_";
const RUN = `TEST_ffhome_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;
const PRIO = -96101;

type Tile = {
  key: string;
  count?: number;
  late?: number;
  today?: number;
  later?: number;
  hint?: { kind: string; date?: string; n?: number };
  error?: true;
};

const emp: Record<string, number> = {};
const roleIds: Record<string, number> = {};
const tokens: Record<string, string> = {};
let supplierId = 0;
let policyId = 0;
let rawItemId = 0;
let finItemId = 0;
let serviceId = 0;
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
/** A timestamp that is calendar day `offset` from today in UTC and in IST (06:30Z = 12:00 IST). */
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

async function counts(tag: string | null, query = "") {
  const res = await app.request(`/api/home/getcounts${query}`, {
    headers: tag ? { Authorization: `Bearer ${tokens[tag]}` } : {},
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

async function tile(tag: string, key: string): Promise<Tile> {
  const r = await counts(tag, `?tiles=${key}`);
  expect(r.status).toBe(200);
  const t = (r.json.data.tiles as Tile[]).find((x) => x.key === key);
  if (!t) throw new Error(`tile ${key} absent for ${tag}`);
  return t;
}

const n = (v: number | undefined) => v ?? 0;
/** Change of every count field between two reads of the same tile. */
function delta(a: Tile, b: Tile) {
  return {
    count: n(b.count) - n(a.count),
    late: n(b.late) - n(a.late),
    today: n(b.today) - n(a.today),
    later: n(b.later) - n(a.later),
  };
}

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
  created.item.push(i!.id);
  return i!.id;
}

async function mkPr(
  owner: string,
  status: "draft" | "pending_approval" | "approved" | "partial_ordered",
  lines: { expected?: Date | null; status?: "pending" | "po_draft" }[] = [{}],
) {
  const [pr] = await db
    .insert(purchaseRequests)
    .values({
      prNumber: uid(),
      type: "misc",
      requestedBy: emp[owner]!,
      status,
      notes: RUN,
    })
    .returning({ id: purchaseRequests.id });
  created.pr.push(pr!.id);
  const itemId = await mkItem();
  for (const l of lines) {
    await db.insert(purchaseRequestItems).values({
      prId: pr!.id,
      itemId,
      requestedQty: 10,
      uom: "kg",
      expectedDate: l.expected === undefined ? null : l.expected,
      status: l.status ?? "pending",
    });
  }
  return pr!.id;
}

async function mkPo(
  owner: string,
  status: (typeof purchaseOrders.$inferInsert)["status"],
  opts: {
    expected?: Date | null;
    revised?: Date | null;
    qty?: number;
    received?: number;
  } = {},
) {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: uid(),
      supplierId,
      status,
      createdBy: emp[owner]!,
      expectedDeliveryDate: opts.expected === undefined ? null : opts.expected,
      revisedDeliveryDate: opts.revised ?? null,
    })
    .returning({ id: purchaseOrders.id });
  created.po.push(po!.id);
  const itemId = await mkItem();
  const [pi] = await db
    .insert(purchaseOrderItems)
    .values({
      poId: po!.id,
      itemId,
      qty: opts.qty ?? 1000,
      receivedQty: opts.received ?? 0,
      unitPricePaise: 24500,
      uom: "kg",
    })
    .returning({ id: purchaseOrderItems.id });
  return { poId: po!.id, poItemId: pi!.id };
}

async function mkGrn(
  owner: string,
  poId: number,
  poItemId: number,
  qty: number,
  qaStatus: string,
  receivedDate: Date,
) {
  const [g] = await db
    .insert(grns)
    .values({
      grnNumber: uid(),
      poId,
      supplierId,
      status: "pending_qa",
      receivedDate,
      createdBy: emp[owner]!,
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
  return { grnId: g!.id, grnItemId: gi!.id };
}

async function mkRequest(
  docType: "pr" | "po",
  docId: number,
  requestedBy: string,
  over: Partial<typeof approvalRequests.$inferInsert> = {},
) {
  const [r] = await db
    .insert(approvalRequests)
    .values({
      docType,
      docId,
      policyId,
      status: "pending_approval",
      currentLevel: 1,
      totalLevels: 1,
      chainSnapshot: [],
      requestedBy: emp[requestedBy]!,
      ...over,
    })
    .returning({ id: approvalRequests.id });
  created.req.push(r!.id);
  return r!.id;
}

async function cleanup() {
  const reqIds = created.req.length ? created.req : [];
  if (reqIds.length) {
    await db
      .delete(approvalTrails)
      .where(inArray(approvalTrails.requestId, reqIds));
    await db
      .delete(approvalRequests)
      .where(inArray(approvalRequests.id, reqIds));
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

const ALL_KEYS = [
  "pr.manage",
  "po.manage",
  "grn.view",
  "grn.edit_draft",
  "grn.qa_decide",
  "sco.view",
  "inventory.view",
];

beforeAll(async () => {
  await makeRole("all", ALL_KEYS);
  await makeRole("qa", ["grn.view", "grn.qa_decide", "sco.view"]);
  await makeRole("poonly", ["po.manage"]);
  await makeRole("pronly", ["pr.manage"]);
  await makeRole("qaNoView", ["grn.qa_decide"]);
  await makeRole("plain", []);
  await makeRole("aprole", []);

  for (const tag of ["a", "b", "c", "d"]) await makeUser(tag, "all");
  await makeUser("qa", "qa");
  await makeUser("poonly", "poonly");
  await makeUser("pronly", "pronly");
  await makeUser("qaNoView", "qaNoView");
  await makeUser("plain", "plain");
  await makeUser("appr", "plain");
  await makeUser("appr2", "plain");
  await makeUser("roleAppr", "aprole");

  const [s] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_sup` })
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

  rawItemId = await mkItem({ uom: "pcs" });
  finItemId = await mkItem({ uom: "pcs" });
  const [svc] = await db
    .insert(serviceMaster)
    .values({ code: `${RUN}_svc`, name: `${RUN}_svc`, defaultUom: "pcs" })
    .returning({ id: serviceMaster.id });
  serviceId = svc!.id;
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
      serviceId,
      serviceDescription: "svc",
      serviceUnitPricePaise: 1000,
      finishedItemId: finItemId,
      expectedReturnQty: 100,
    })
    .returning({ id: subcontractingOrderItems.id });
  scoItemId = si!.id;
});

afterAll(cleanup);

describe("auth and query validation", () => {
  test("BR-FF-11 no session -> 401", async () => {
    expect((await counts(null)).status).toBe(401);
  });

  test("BR-FF-11 unknown tile key -> 400 VALIDATION_ERROR", async () => {
    const r = await counts("a", "?tiles=approvals,nonsense");
    expect(r.status).toBe(400);
  });

  test("BR-FF-11 duplicate tile key -> 400", async () => {
    const r = await counts("a", "?tiles=approvals,approvals");
    expect(r.status).toBe(400);
  });
});

describe("BR-FF-11 / BR-FF-34 tiles only for keys held", () => {
  const ALL_TILES = [
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
  ];
  const keysOf = async (tag: string) =>
    ((await counts(tag)).json.data.tiles as Tile[]).map((t) => t.key);

  test("BR-FF-11 holder of every key gets all eleven tiles", async () => {
    expect((await keysOf("a")).sort()).toEqual([...ALL_TILES].sort());
  });

  test("BR-FF-11 QA role (grn.view, grn.qa_decide, sco.view) gets only approvals, receipts to inspect, job-work due", async () => {
    expect((await keysOf("qa")).sort()).toEqual(
      ["approvals", "grns_to_inspect", "jobwork_due"].sort(),
    );
  });

  test("BR-FF-11 a tile asked for without its key is absent, not 403", async () => {
    const r = await counts("qa", "?tiles=pos_late,stock_low");
    expect(r.status).toBe(200);
    expect(r.json.data.tiles).toEqual([]);
  });

  test("BR-FF-11 role with no keys still gets the approvals tile (any signed-in) and nothing else", async () => {
    expect(await keysOf("plain")).toEqual(["approvals"]);
  });

  test("BR-FF-34 po.manage without pr.manage: no requisitions-to-order tile (its list is the PR list)", async () => {
    const keys = await keysOf("poonly");
    expect(keys).not.toContain("prs_to_order");
    expect(keys).not.toContain("my_prs_draft");
    for (const k of ["pos_to_send", "my_pos_draft", "pos_late"]) {
      expect(keys).toContain(k);
    }
  });

  test("BR-FF-34 pr.manage without po.manage: own PR tiles only", async () => {
    expect((await keysOf("pronly")).sort()).toEqual(
      ["approvals", "my_prs_draft", "my_prs_pending"].sort(),
    );
  });

  test("BR-FF-34 grn.qa_decide without grn.view (target GRN list): no receipts-to-inspect tile", async () => {
    expect(await keysOf("qaNoView")).not.toContain("grns_to_inspect");
  });
});

describe("BR-FF-20 Waiting for my approval", () => {
  test("BR-FF-20 counts pending requests whose current step is me; other people's and decided ones are not counted", async () => {
    const before = await tile("appr", "approvals");
    const pr1 = await mkPr("a", "pending_approval");
    const pr2 = await mkPr("a", "pending_approval");
    const pr3 = await mkPr("a", "pending_approval");
    await mkRequest("pr", pr1, "a", {
      currentApproverEmployeeId: emp.appr!,
      requestedAt: dayAt(-3),
    });
    await mkRequest("pr", pr2, "a", {
      currentApproverEmployeeId: emp.appr2!, // someone else's step
    });
    await mkRequest("pr", pr3, "a", {
      currentApproverEmployeeId: emp.appr!,
      status: "approved", // no longer pending
    });
    const after = await tile("appr", "approvals");
    expect(after.count).toBe(n(before.count) + 1);
    expect(after.hint?.kind).toBe("oldest_since");
    expect(after.hint?.date).toBeTruthy();
  });

  test("BR-FF-20 a request on my role's step counts for a holder of that role", async () => {
    const [roleRow] = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, roleIds.aprole!));
    const before = await tile("roleAppr", "approvals");
    const pr = await mkPr("a", "pending_approval");
    await mkRequest("pr", pr, "a", { currentApproverRole: roleRow!.name });
    const after = await tile("roleAppr", "approvals");
    expect(after.count).toBe(n(before.count) + 1);
  });

  test("BR-FF-20 a request where I already approved a level is not counted again", async () => {
    const before = await tile("appr2", "approvals");
    const pr = await mkPr("a", "pending_approval");
    const reqId = await mkRequest("pr", pr, "a", {
      currentLevel: 2,
      totalLevels: 2,
      currentApproverEmployeeId: emp.appr2!,
    });
    await db.insert(approvalTrails).values({
      requestId: reqId,
      docType: "pr",
      docId: pr,
      level: 1,
      action: "approved",
      actionBy: emp.appr2!,
      notes: "ok",
    });
    const after = await tile("appr2", "approvals");
    expect(after.count).toBe(n(before.count));
  });
});

describe("BR-FF-18 / BR-FF-21 / BR-FF-22 my requisition tiles", () => {
  test("BR-FF-18 my tiles count only documents I raised", async () => {
    await mkPr("b", "draft");
    await mkPr("b", "draft");
    await mkPr("c", "draft");
    expect((await tile("b", "my_prs_draft")).count).toBe(2);
    expect((await tile("c", "my_prs_draft")).count).toBe(1);
    expect((await tile("d", "my_prs_draft")).count).toBe(0);
  });

  test("BR-FF-18 my draft orders count only POs I created", async () => {
    await mkPo("b", "draft");
    await mkPo("c", "draft");
    await mkPo("c", "draft");
    expect((await tile("b", "my_pos_draft")).count).toBe(1);
    expect((await tile("c", "my_pos_draft")).count).toBe(2);
    expect((await tile("d", "my_pos_draft")).count).toBe(0);
  });

  test("BR-FF-21 a draft whose last request was sent back is marked sent back", async () => {
    const pr = await mkPr("d", "draft");
    await mkRequest("pr", pr, "d", { status: "require_more_info" });
    await mkPr("d", "draft"); // plain draft, never submitted
    const t = await tile("d", "my_prs_draft");
    expect(t.count).toBe(2);
    expect(t.hint?.kind).toBe("sent_back");
    expect(t.hint?.n).toBe(1);
  });

  test("BR-FF-22 PRs in pending_approval count under 'in approval', not under 'to finish'", async () => {
    const before = await tile("a", "my_prs_pending");
    const beforeDraft = await tile("a", "my_prs_draft");
    await mkPr("a", "pending_approval");
    const after = await tile("a", "my_prs_pending");
    const afterDraft = await tile("a", "my_prs_draft");
    expect(after.count).toBe(n(before.count) + 1);
    expect(afterDraft.count).toBe(n(beforeDraft.count));
  });
});

describe("BR-FF-23 Requisitions to order (+ BR-FF-14 split)", () => {
  test("BR-FF-23 approved PR with a pending line counts; once every line is on a PO it does not", async () => {
    const before = await tile("a", "prs_to_order");
    const pr = await mkPr("b", "approved", [
      { expected: dayAt(5) },
      { expected: dayAt(5), status: "po_draft" },
    ]);
    const mid = await tile("a", "prs_to_order");
    expect(mid.count).toBe(n(before.count) + 1);
    await db
      .update(purchaseRequestItems)
      .set({ status: "po_draft" })
      .where(eq(purchaseRequestItems.prId, pr));
    const after = await tile("a", "prs_to_order");
    expect(after.count).toBe(n(before.count));
  });

  test("BR-FF-23 draft and pending-approval PRs are not counted", async () => {
    const before = await tile("a", "prs_to_order");
    await mkPr("b", "draft");
    await mkPr("b", "pending_approval");
    expect((await tile("a", "prs_to_order")).count).toBe(n(before.count));
  });

  test("BR-FF-14 split by earliest required-by date of pending lines; no date = Later; parts sum to count", async () => {
    const before = await tile("a", "prs_to_order");
    await mkPr("b", "partial_ordered", [{ expected: dayAt(-2) }]);
    await mkPr("b", "approved", [{ expected: dayAt(0) }]);
    await mkPr("b", "approved", [{ expected: null }]);
    await mkPr("b", "approved", [{ expected: dayAt(9) }]);
    const after = await tile("a", "prs_to_order");
    expect(delta(before, after)).toEqual({
      count: 4,
      late: 1,
      today: 1,
      later: 2,
    });
    expect(n(after.late) + n(after.today) + n(after.later)).toBe(
      n(after.count),
    );
  });
});

describe("BR-FF-24 / BR-FF-25 / BR-FF-26 order tiles", () => {
  test("BR-FF-24 approved POs count as orders to send; after dispatch they do not", async () => {
    const before = await tile("a", "pos_to_send");
    const { poId } = await mkPo("b", "approved", { expected: dayAt(3) });
    const mid = await tile("a", "pos_to_send");
    expect(mid.count).toBe(n(before.count) + 1);
    await db
      .update(purchaseOrders)
      .set({ status: "dispatched" })
      .where(eq(purchaseOrders.id, poId));
    expect((await tile("a", "pos_to_send")).count).toBe(n(before.count));
  });

  test("BR-FF-14 orders to send split by expected delivery date", async () => {
    const before = await tile("a", "pos_to_send");
    await mkPo("b", "approved", { expected: dayAt(-1) });
    await mkPo("b", "approved", { expected: dayAt(0) });
    await mkPo("b", "approved", { expected: dayAt(7) });
    expect(delta(before, await tile("a", "pos_to_send"))).toEqual({
      count: 3,
      late: 1,
      today: 1,
      later: 1,
    });
  });

  test("BR-FF-25 draft orders created by me count, other people's do not", async () => {
    // asserted absolutely in the BR-FF-18 test; here: a sent-back draft PO is still a draft
    const before = await tile("poonly", "my_pos_draft");
    expect(before.count).toBe(0);
  });

  test("BR-FF-26 a dispatched PO past its due date counts as late, even while goods wait for QA", async () => {
    const before = await tile("a", "pos_late");
    const { poId, poItemId } = await mkPo("b", "dispatched", {
      expected: dayAt(-2),
      received: 600,
    });
    expect((await tile("a", "pos_late")).count).toBe(n(before.count) + 1);
    // the remaining 400 kg arrive and wait for QA: still late (frozen BR-PO-19 uses ordered - received)
    await mkGrn("b", poId, poItemId, 400, "pending", dayAt(0));
    expect((await tile("a", "pos_late")).count).toBe(n(before.count) + 1);
    // QA accepts, PO fully received -> no longer late
    await db
      .update(purchaseOrderItems)
      .set({ receivedQty: 1000 })
      .where(eq(purchaseOrderItems.id, poItemId));
    await db
      .update(purchaseOrders)
      .set({ status: "fully_received" })
      .where(eq(purchaseOrders.id, poId));
    expect((await tile("a", "pos_late")).count).toBe(n(before.count));
  });

  test("BR-FF-26 revised date wins over expected date; due today is not late", async () => {
    const before = await tile("a", "pos_late");
    await mkPo("b", "dispatched", { expected: dayAt(-10), revised: dayAt(4) });
    await mkPo("b", "dispatched", { expected: dayAt(0) });
    expect((await tile("a", "pos_late")).count).toBe(n(before.count));
  });
});

describe("BR-FF-27 Goods expected (open quantity, BR-FF-09)", () => {
  test("BR-FF-27 PO with open qty counts; open qty is ordered - accepted - pending-QA arrived", async () => {
    const before = await tile("a", "goods_expected");
    const { poId, poItemId } = await mkPo("b", "dispatched", {
      expected: dayAt(5),
    });
    const t1 = await tile("a", "goods_expected");
    expect(delta(before, t1)).toEqual({
      count: 1,
      late: 0,
      today: 0,
      later: 1,
    });
    // 600 kg pending QA: 400 kg still open -> still counted
    await mkGrn("b", poId, poItemId, 600, "pending", dayAt(0));
    expect((await tile("a", "goods_expected")).count).toBe(t1.count!);
    // the rest also arrives (pending QA): open 0 -> no longer expected
    await mkGrn("b", poId, poItemId, 400, "pending", dayAt(0));
    expect((await tile("a", "goods_expected")).count).toBe(n(before.count));
  });

  test("BR-FF-27 rejected goods count as open again", async () => {
    const before = await tile("a", "goods_expected");
    const { poId, poItemId } = await mkPo("b", "partial_received", {
      expected: dayAt(5),
    });
    const g = await mkGrn("b", poId, poItemId, 1000, "pending", dayAt(0));
    expect((await tile("a", "goods_expected")).count).toBe(n(before.count));
    await db
      .update(grnItems)
      .set({ qaStatus: "failed", rejectedQty: 1000 })
      .where(eq(grnItems.id, g.grnItemId));
    expect((await tile("a", "goods_expected")).count).toBe(n(before.count) + 1);
  });

  test("BR-FF-14 goods expected splits by due date (revised, else expected)", async () => {
    const before = await tile("a", "goods_expected");
    await mkPo("b", "dispatched", { expected: dayAt(-2) });
    await mkPo("b", "dispatched", { expected: dayAt(0) });
    await mkPo("b", "dispatched", { expected: dayAt(-9), revised: dayAt(6) });
    const after = await tile("a", "goods_expected");
    expect(delta(before, after)).toEqual({
      count: 3,
      late: 1,
      today: 1,
      later: 1,
    });
  });

  test("BR-FF-27 a PO still in draft or approved is not expected", async () => {
    const before = await tile("a", "goods_expected");
    await mkPo("b", "draft", { expected: dayAt(1) });
    await mkPo("b", "approved", { expected: dayAt(1) });
    expect((await tile("a", "goods_expected")).count).toBe(n(before.count));
  });
});

describe("BR-FF-28 Receipts to inspect", () => {
  test("BR-FF-28 GRN with a pending line counts, received before today = late; accepting it removes it", async () => {
    const before = await tile("qa", "grns_to_inspect");
    const { poId, poItemId } = await mkPo("b", "dispatched", {
      expected: dayAt(5),
    });
    const late = await mkGrn("b", poId, poItemId, 100, "pending", dayAt(-1));
    await mkGrn("b", poId, poItemId, 100, "passed", dayAt(-1)); // decided
    const after = await tile("qa", "grns_to_inspect");
    expect(delta(before, after)).toEqual({
      count: 1,
      late: 1,
      today: 0,
      later: 0,
    });
    await db
      .update(grnItems)
      .set({ qaStatus: "passed" })
      .where(eq(grnItems.id, late.grnItemId));
    expect((await tile("qa", "grns_to_inspect")).count).toBe(n(before.count));
  });

  test("BR-FF-28 a GRN with two pending lines counts once", async () => {
    const before = await tile("qa", "grns_to_inspect");
    const { poId, poItemId } = await mkPo("b", "dispatched", {
      expected: dayAt(5),
    });
    const g = await mkGrn("b", poId, poItemId, 100, "pending", dayAt(0));
    await db.insert(grnItems).values({
      grnId: g.grnId,
      poItemId,
      receivedQty: 50,
      acceptedQty: 0,
      qaStatus: "pending",
    });
    expect((await tile("qa", "grns_to_inspect")).count).toBe(
      n(before.count) + 1,
    );
  });
});

describe("BR-FF-29 Job-work due back", () => {
  async function mkChallan(due: Date, qty: number, settled: number) {
    const [c] = await db
      .insert(scoChallans)
      .values({
        challanNumber: `T${Date.now().toString().slice(-9)}${++seq}`.slice(
          0,
          16,
        ),
        scoId,
        vendorId: supplierId,
        challanDate: dayAt(-20),
        valuePaise: 1000,
        returnDueDate: due,
        createdBy: emp.a!,
      })
      .returning({ id: scoChallans.id });
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
    return c!.id;
  }

  test("BR-FF-29 an overdue challan with unsettled pieces is late; a fully settled one is not counted", async () => {
    const before = await tile("qa", "jobwork_due");
    await mkChallan(dayAt(-3), 50, 0);
    await mkChallan(dayAt(-3), 50, 50);
    const after = await tile("qa", "jobwork_due");
    expect(delta(before, after)).toEqual({
      count: 1,
      late: 1,
      today: 0,
      later: 0,
    });
  });

  test("BR-FF-14 job-work due splits Late / Today / Later by return due date", async () => {
    const before = await tile("qa", "jobwork_due");
    await mkChallan(dayAt(0), 10, 0);
    await mkChallan(dayAt(40), 10, 3);
    const after = await tile("qa", "jobwork_due");
    expect(delta(before, after)).toEqual({
      count: 2,
      late: 0,
      today: 1,
      later: 1,
    });
  });
});

describe("BR-FF-30 Stock below reorder", () => {
  test("BR-FF-30 counts active items with reorder level > 0 and stock at or below it", async () => {
    const before = await tile("a", "stock_low");
    await mkItem({ reorderLevel: 50, currentStock: 20 }); // below
    await mkItem({ reorderLevel: 50, currentStock: 50 }); // exactly at
    await mkItem({ reorderLevel: 50, currentStock: 80 }); // above
    await mkItem({ reorderLevel: 0, currentStock: 0 }); // no reorder level
    await mkItem({ reorderLevel: 50, currentStock: 1, isActive: false }); // inactive
    const after = await tile("a", "stock_low");
    expect(after.count).toBe(n(before.count) + 2);
    expect(after.hint?.kind).toBe("items");
  });

  test("BR-FF-14 a tile without a due date has no Late / Today / Later split", async () => {
    const t = await tile("a", "stock_low");
    expect(t.late).toBeUndefined();
    expect(t.today).toBeUndefined();
    expect(t.later).toBeUndefined();
  });
});

describe("response shape", () => {
  test("BR-FF-11 returns today as the IST day key and tiles carry no money fields", async () => {
    const r = await counts("a");
    expect(r.json.data.today).toBe(istDayKey());
    for (const t of r.json.data.tiles as Record<string, unknown>[]) {
      for (const k of Object.keys(t)) {
        expect(k.toLowerCase()).not.toMatch(/paise|amount|price|value/);
      }
    }
  });

  test("BR-FF-14 a tile with count 0 has no hint", async () => {
    const t = await tile("d", "my_pos_draft");
    expect(t.count).toBe(0);
    expect(t.hint).toBeUndefined();
  });
});
