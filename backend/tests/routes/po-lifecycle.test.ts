/**
 * docs/specs/purchase-order.md (v1) and docs/specs/purchase-requisition.md (v1)
 * BR-PO-01..09, 11..23  (BR-PO-10 receipt status: src/service/poReceiptStatus.test.ts)
 * BR-PR-25, 28, 30, 31, 33, 36 (PR line / header effects of PO actions)
 *
 * HTTP-level through createApp(), real DB, real logins. Written by test-writer from the spec only.
 *
 * Fixture shortcuts (not production paths):
 *  - Receipt statuses (partial_received / fully_received) and received qty are set straight on the
 *    PO rows, because GRN posting belongs to the GRN branch (BR-PO-10 / BR-GRN-27, 34).
 *  - A "GRN exists" case is a raw `grns` draft row.
 *  - Expected / revised dates in the past are written straight to the row (the API refuses a date
 *    before the PO date, BR-PO-18).
 * Known gaps (not tested here):
 *  - BR-PO-10 (receipt status from GRN postings): src/service/poReceiptStatus.test.ts.
 *  - BR-PO-12 / 13 "new GRN after cancel/short-close -> 400": GRN module, needs the GRN branch.
 *  - BR-PO-22 "cancel and GRN create at once": needs the GRN branch; cancel/cancel, send/send and
 *    submit/submit races are covered.
 *  - BR-PR-33 "cancel an ordered line -> 409 PR_LINE_ON_LIVE_PO": no line-cancel endpoint in the contract.
 *  - BR-PR-32 (line closed by full receipt): GRN branch. Short-close path is covered.
 *  - BR-PO-03 last-PO-rate / average-cost / standard-rate fall-backs: owned by suppliers BR-SUP-16;
 *    only the price-list step is asserted here.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, asc, eq, inArray, like, or } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  documentNumberCounters,
  rolePermissions,
  roles,
} from "../../src/db/schemas/01_auth";
import {
  approvalPolicies,
  approvalRequests,
  approvalTrails,
} from "../../src/db/schemas/02_procurement-approval";
import { itemMaster } from "../../src/db/schemas/02_procurement-catalog";
import {
  grns,
  poCommunications,
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  supplierInvoices,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  supplierItems,
  supplierMaster,
} from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { authService } from "../../src/service/authService";

const app = createApp();
const PREFIX = "test_po_";
const PASSWORD = "po-lifecycle-password-123";
const PR_TOOLING_AUTO = -94101;
const PR_MISC_AUTO = -94102;
const PR_STOCK_TWO_LEVEL = -94103;
const PR_SUBCON_AUTO = -94105;
const PO_MISC_TWO_LEVEL = -94111;
const PO_TOOLING_AUTO = -94112; // total 110000..130000 incl. GST
const PO_TOOLING_TWO_LEVEL = -94113; // total 1..109999 incl. GST
const ALL_PRIORITIES = [
  PR_TOOLING_AUTO,
  PR_MISC_AUTO,
  PR_STOCK_TWO_LEVEL,
  PR_SUBCON_AUTO,
  PO_MISC_TWO_LEVEL,
  PO_TOOLING_AUTO,
  PO_TOOLING_TWO_LEVEL,
];

type Rec = Record<string, unknown>;
const emp = {} as Record<string, number>;
const token = {} as Record<string, string>;
const item = {} as Record<string, number>;
const sup = {} as Record<string, number>;

const need = <T>(v: T | undefined | null, what = "value"): T => {
  if (v === undefined || v === null)
    throw new Error(`Fixture: missing ${what}`);
  return v;
};

async function makeRole(name: string, keys: string[]) {
  const [r] = await db
    .insert(roles)
    .values({ name: `${PREFIX}${name}`, isSystem: false })
    .returning({ id: roles.id });
  const id = need(r, "role").id;
  if (keys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(keys.map((permissionKey) => ({ roleId: id, permissionKey })));
  }
  return id;
}

async function makeUser(tag: string, roleId: number) {
  const email = `${PREFIX}${tag}@diecast.test`;
  const [e] = await db
    .insert(employees)
    .values({
      name: `TEST_po_${tag}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId,
      isActive: true,
    })
    .returning({ id: employees.id });
  emp[tag] = need(e, "employee").id;
  token[tag] = (await authService.login(email, PASSWORD)).accessToken;
}

function call(
  tag: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (tag) headers.Authorization = `Bearer ${token[tag]}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  return app.request(path, init);
}

const json = async (res: Response) => (await res.json()) as Rec;
const dataOf = (b: Rec) => b.data as Rec;
const poOf = (b: Rec) => (b.data as { po: Rec }).po;
const itemsOf = (b: Rec) => (b.data as { items: Rec[] }).items;
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const dayStr = (v: unknown) => new Date(v as string).toISOString().slice(0, 10);

// ---------- domain helpers ----------
const createPoRaw = (tag: string, body: Rec) =>
  call(tag, "POST", "/api/po/createpo", body);
const detail = (poId: number, tag = "buyer") =>
  call(tag, "GET", `/api/po/getpodetails/${poId}`);
// The four header fields are always sent (harmless values) so the request is valid whether the
// header fields are optional (contract) or still required (current schema); tests then exercise
// the rule under test, not request validation.
const edit = (poId: number, body: Rec, tag = "buyer") =>
  call(tag, "PATCH", "/api/po/updatepo", {
    poId,
    paymentTermsDays: 30,
    deliveryTerms: "TEST terms",
    notes: "TEST notes",
    expectedDeliveryDate: days(10).toISOString(),
    inserts: [],
    updates: [],
    deletes: [],
    ...body,
  });
const cancelPo = (
  poId: number,
  reason: unknown = "wrong supplier",
  tag = "buyer",
) => call(tag, "DELETE", `/api/po/deletepo/${poId}`, { reason });
const send = (
  poId: number,
  body: Rec = { channel: "whatsapp" },
  tag = "buyer",
) => call(tag, "POST", `/api/po/${poId}/send`, body);
const submitPo = (poId: number, tag = "buyer") =>
  call(tag, "POST", "/api/approval/submitRequest", {
    docType: "po",
    docId: poId,
  });
const act = (tag: string, requestId: number, action: string) =>
  call(tag, "POST", `/api/approval/actOnRequest/${requestId}`, {
    action,
    notes: "TEST_po note",
  });
const comms = async (poId: number) =>
  ((await json(await call("buyer", "GET", `/api/po/${poId}/communications`)))
    .data as Rec[]) ?? [];

async function poRow(poId: number) {
  const [r] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, poId));
  return need(r, "po row");
}
const setPo = (
  poId: number,
  patch: Partial<typeof purchaseOrders.$inferInsert>,
) => db.update(purchaseOrders).set(patch).where(eq(purchaseOrders.id, poId));
const setReceived = (poId: number, qty: (ordered: number) => number) =>
  db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.poId, poId))
    .then((rows) =>
      Promise.all(
        rows.map((r) =>
          db
            .update(purchaseOrderItems)
            .set({ receivedQty: qty(r.qty) })
            .where(eq(purchaseOrderItems.id, r.id)),
        ),
      ),
    );
async function prRow(prId: number) {
  const [r] = await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, prId));
  return need(r, "pr row");
}
async function prLine(id: number) {
  const [r] = await db
    .select()
    .from(purchaseRequestItems)
    .where(eq(purchaseRequestItems.id, id));
  return need(r, "pr line");
}
async function poItemIdOf(prItemId: number) {
  const rows = await db
    .select()
    .from(prPoItemLinks)
    .where(eq(prPoItemLinks.prItemId, prItemId));
  return rows.map((r) => r.poItemId as number);
}

type PrFix = { prId: number; line: Record<string, number> };
async function mkPr(
  o: { type?: string; lines?: [string, number][]; submit?: boolean } = {},
): Promise<PrFix> {
  const type = o.type ?? "tooling";
  const lines = o.lines ?? [["a", 10]];
  const res = await call("buyer", "POST", "/api/pr/createpr", {
    type,
    notes: "TEST_po note",
    items: lines.map(([k, q]) => ({ itemId: item[k], requestedQty: q })),
  });
  if (res.status !== 201) throw new Error(`Fixture: createpr -> ${res.status}`);
  const prId = ((await json(res)).data as { pr: { id: number } }).pr.id;
  if (o.submit !== false) {
    const s = await call("buyer", "POST", "/api/approval/submitRequest", {
      docType: "pr",
      docId: prId,
    });
    if (s.status !== 201) throw new Error(`Fixture: PR submit -> ${s.status}`);
  }
  const rows = await db
    .select()
    .from(purchaseRequestItems)
    .where(eq(purchaseRequestItems.prId, prId));
  const line: Record<string, number> = {};
  for (const r of rows) {
    const key = Object.keys(item).find((k) => item[k] === r.itemId);
    if (key) line[key] = r.id;
  }
  return { prId, line };
}

type PoOpts = {
  type?: string;
  lines?: [string, number][];
  rate?: number;
  gst?: number;
  supplier?: string;
  expected?: string | null;
  over?: Rec;
  pr?: PrFix;
};
type PoFix = { poId: number; prId: number; line: Record<string, number> };

async function mkDraftPo(o: PoOpts = {}): Promise<PoFix> {
  const lines = o.lines ?? [["a", 10]];
  const pr = o.pr ?? (await mkPr({ type: o.type ?? "tooling", lines }));
  const body: Rec = {
    supplierId: sup[o.supplier ?? "s1"],
    lines: Object.values(pr.line).map((prItemId) => ({
      prItemId,
      unitPricePaise: o.rate ?? 11000,
      gstPercent: o.gst ?? 0,
    })),
    ...o.over,
  };
  if (o.expected !== null) {
    body.expectedDeliveryDate = o.expected ?? days(10).toISOString();
  }
  const res = await createPoRaw("buyer", body);
  if (res.status !== 201) {
    throw new Error(
      `Fixture: createpo -> ${res.status} ${JSON.stringify(await json(res))}`,
    );
  }
  return {
    poId: poOf(await json(res)).id as number,
    prId: pr.prId,
    line: pr.line,
  };
}

/** Submit a draft PO and drive it to approved. Default tooling total 110000 (11000 x 10, GST 0) is in the auto-approve band; misc goes ap1 -> ap2. */
async function approve(po: PoFix, type = "tooling"): Promise<number> {
  const res = await submitPo(po.poId);
  if (res.status !== 201)
    throw new Error(`Fixture: PO submit -> ${res.status}`);
  const requestId = dataOf(await json(res)).id as number;
  if (type === "misc") {
    await act("ap1", requestId, "approve");
    await act("ap2", requestId, "approve");
  }
  if ((await poRow(po.poId)).status !== "approved") {
    throw new Error("Fixture: PO not approved");
  }
  return requestId;
}
async function mkApprovedPo(o: PoOpts = {}) {
  const po = await mkDraftPo(o);
  const requestId = await approve(po, o.type ?? "tooling");
  return { ...po, requestId };
}
async function mkDispatchedPo(o: PoOpts = {}) {
  const po = await mkApprovedPo(o);
  const res = await send(po.poId);
  if (res.status !== 200) throw new Error(`Fixture: send -> ${res.status}`);
  return po;
}

async function cleanup() {
  const ids = (
    await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.email, `${PREFIX}%`))
  ).map((e) => e.id);
  const supIds = (
    await db
      .select({ id: supplierMaster.id })
      .from(supplierMaster)
      .where(like(supplierMaster.name, "TEST_po_%"))
  ).map((s) => s.id);
  const poIds = ids.length
    ? (
        await db
          .select({ id: purchaseOrders.id })
          .from(purchaseOrders)
          .where(inArray(purchaseOrders.createdBy, ids))
      ).map((p) => p.id)
    : [];
  const prIds = ids.length
    ? (
        await db
          .select({ id: purchaseRequests.id })
          .from(purchaseRequests)
          .where(inArray(purchaseRequests.requestedBy, ids))
      ).map((p) => p.id)
    : [];
  await db.delete(grns).where(like(grns.grnNumber, "TEST_PO_%"));
  if (poIds.length) {
    const poItemIds = (
      await db
        .select({ id: purchaseOrderItems.id })
        .from(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.poId, poIds))
    ).map((i) => i.id);
    if (poItemIds.length) {
      await db
        .delete(prPoItemLinks)
        .where(inArray(prPoItemLinks.poItemId, poItemIds));
    }
    await db
      .delete(supplierInvoices)
      .where(inArray(supplierInvoices.poId, poIds));
    await db
      .delete(poCommunications)
      .where(inArray(poCommunications.poId, poIds));
  }
  const reqIds = [
    ...(poIds.length
      ? await db
          .select({ id: approvalRequests.id })
          .from(approvalRequests)
          .where(
            and(
              eq(approvalRequests.docType, "po"),
              inArray(approvalRequests.docId, poIds),
            ),
          )
      : []),
    ...(prIds.length
      ? await db
          .select({ id: approvalRequests.id })
          .from(approvalRequests)
          .where(
            and(
              eq(approvalRequests.docType, "pr"),
              inArray(approvalRequests.docId, prIds),
            ),
          )
      : []),
  ].map((r) => r.id);
  if (reqIds.length) {
    await db
      .delete(approvalTrails)
      .where(inArray(approvalTrails.requestId, reqIds));
    await db
      .delete(approvalRequests)
      .where(inArray(approvalRequests.id, reqIds));
  }
  if (poIds.length) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, poIds));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
  }
  if (prIds.length) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, prIds));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, prIds));
  }
  if (supIds.length) {
    await db
      .delete(supplierItems)
      .where(inArray(supplierItems.supplierId, supIds));
    await db.delete(supplierMaster).where(inArray(supplierMaster.id, supIds));
  }
  if (ids.length) {
    await db
      .update(documentNumberCounters)
      .set({ lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.lastUpdatedBy, ids));
    await db
      .delete(documentNumberCounters)
      .where(inArray(documentNumberCounters.createdBy, ids));
  }
  // also removes any fallback policy the approval service auto-created for one of our users
  await db
    .delete(approvalPolicies)
    .where(
      ids.length
        ? or(
            inArray(approvalPolicies.priority, ALL_PRIORITIES),
            inArray(approvalPolicies.createdBy, ids),
          )
        : inArray(approvalPolicies.priority, ALL_PRIORITIES),
    );
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
  await db.delete(itemMaster).where(like(itemMaster.sku, "TEST_PO_%"));
}

beforeAll(async () => {
  await cleanup();
  const mkItem = async (key: string, uom: string, cost: number) => {
    const [it] = await db
      .insert(itemMaster)
      .values({
        sku: `TEST_PO_${key.toUpperCase()}`,
        name: `TEST_po item ${key}`,
        category: "Consumable",
        uom,
        averageCostPaise: cost,
      })
      .returning({ id: itemMaster.id });
    item[key] = need(it, "item").id;
  };
  await mkItem("a", "kg", 25000);
  await mkItem("b", "pcs", 1050);
  await mkItem("c", "kg", 1000);
  await mkItem("d", "kg", 1000);
  await mkItem("pl", "kg", 0);

  const mkSupplier = async (key: string, active = true, terms = 30) => {
    const [s] = await db
      .insert(supplierMaster)
      .values({
        name: `TEST_po_${key}`,
        type: "raw_material",
        defaultPaymentTermsDays: terms,
        isActive: active,
      })
      .returning({ id: supplierMaster.id });
    sup[key] = need(s, "supplier").id;
  };
  await mkSupplier("s1");
  await mkSupplier("s2");
  await mkSupplier("inactive", false);
  await mkSupplier("s3", true, 45);
  await mkSupplier("overdue");
  // price list: item a at S1 = 24500 paise, 18% GST; item pl at S3 = 24500, 18%
  await db.insert(supplierItems).values([
    {
      supplierId: sup.s1 as number,
      itemId: item.a as number,
      supplierUnitPricePaise: 24500,
      taxPercentage: 18,
      uom: "kg",
    },
    {
      supplierId: sup.s3 as number,
      itemId: item.pl as number,
      supplierUnitPricePaise: 24500,
      taxPercentage: 18,
      uom: "kg",
    },
  ]);

  const buyerRole = await makeRole("buyer", ["pr.manage", "po.manage"]);
  await makeUser("buyer", buyerRole);
  await makeUser("buyer2", buyerRole);
  await makeUser("nokeys", await makeRole("nokeys", []));
  await makeUser("prOnly", await makeRole("pronly", ["pr.manage"]));
  await makeUser("ap1", await makeRole("ap1", []));
  await makeUser("ap2", await makeRole("ap2", []));
  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"))
    .limit(1);
  await makeUser("super", need(sa, "super-admin role").id);

  const chain2 = [
    {
      level: 1,
      approverType: "specific" as const,
      employeeId: emp.ap1 as number,
    },
    {
      level: 2,
      approverType: "specific" as const,
      employeeId: emp.ap2 as number,
    },
  ];
  const by = {
    createdBy: emp.buyer as number,
    lastUpdatedBy: emp.buyer as number,
  };
  await db.insert(approvalPolicies).values([
    {
      name: "TEST_po_pr_tooling_auto",
      priority: PR_TOOLING_AUTO,
      docType: "pr",
      subDocType: "tooling",
      autoApprove: true,
      approvalLevels: 1,
      approvalChain: chain2.slice(0, 1),
      ...by,
    },
    {
      name: "TEST_po_pr_misc_auto",
      priority: PR_MISC_AUTO,
      docType: "pr",
      subDocType: "misc",
      autoApprove: true,
      approvalLevels: 1,
      approvalChain: chain2.slice(0, 1),
      ...by,
    },
    {
      name: "TEST_po_pr_stock_two",
      priority: PR_STOCK_TWO_LEVEL,
      docType: "pr",
      subDocType: "stock_reorder",
      autoApprove: false,
      approvalLevels: 2,
      approvalChain: chain2,
      ...by,
    },
    {
      name: "TEST_po_pr_subcon_auto",
      priority: PR_SUBCON_AUTO,
      docType: "pr",
      subDocType: "subcontracting",
      autoApprove: true,
      approvalLevels: 1,
      approvalChain: chain2.slice(0, 1),
      ...by,
    },
    {
      name: "TEST_po_po_misc_two",
      priority: PO_MISC_TWO_LEVEL,
      docType: "po",
      subDocType: "misc",
      autoApprove: false,
      approvalLevels: 2,
      approvalChain: chain2,
      ...by,
    },
    {
      name: "TEST_po_po_tooling_auto",
      priority: PO_TOOLING_AUTO,
      docType: "po",
      subDocType: "tooling",
      autoApprove: true,
      approvalLevels: 1,
      approvalChain: chain2.slice(0, 1),
      minAmountPaise: 110000,
      maxAmountPaise: 130000,
      ...by,
    },
    {
      name: "TEST_po_po_tooling_two",
      priority: PO_TOOLING_TWO_LEVEL,
      docType: "po",
      subDocType: "tooling",
      autoApprove: false,
      approvalLevels: 2,
      approvalChain: chain2,
      minAmountPaise: 1,
      maxAmountPaise: 109999,
      ...by,
    },
  ]);
});

afterAll(cleanup);

// =====================================================================================
describe("BR-PO-01 a PO is made only from PR lines", () => {
  test("BR-PO-01 create from an approved PR line -> draft, createdBy, PO- number", async () => {
    const pr = await mkPr();
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      expectedDeliveryDate: days(10).toISOString(),
      lines: [{ prItemId: pr.line.a, unitPricePaise: 10000, gstPercent: 18 }],
    });
    expect(res.status).toBe(201);
    const po = poOf(await json(res));
    expect(po.status).toBe("draft");
    expect(po.createdBy).toBe(emp.buyer as number);
    expect(String(po.poNumber)).toMatch(/^PO-.+-\d+$/);
    expect(po.supplierId).toBe(sup.s1 as number);
  });

  test("BR-PO-01 two creates at once get different numbers", async () => {
    const [p1, p2] = await Promise.all([mkDraftPo(), mkDraftPo()]);
    expect((await poRow(p1.poId)).poNumber).not.toBe(
      (await poRow(p2.poId)).poNumber,
    );
  });

  test("BR-PO-01 inactive supplier -> 400, PR line stays pending", async () => {
    const pr = await mkPr();
    const res = await createPoRaw("buyer", {
      supplierId: sup.inactive,
      lines: [{ prItemId: pr.line.a, unitPricePaise: 10000 }],
    });
    expect(res.status).toBe(400);
    expect((await prLine(pr.line.a as number)).status).toBe("pending");
  });

  test("BR-PO-01 no lines -> 400", async () => {
    expect(
      (await createPoRaw("buyer", { supplierId: sup.s1, lines: [] })).status,
    ).toBe(400);
  });

  test("BR-PO-01 unknown PR line -> 400", async () => {
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: 999999999, unitPricePaise: 10000 }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-PO-01 same PR line twice in one PO -> 400, nothing saved", async () => {
    const pr = await mkPr();
    const l = { prItemId: pr.line.a, unitPricePaise: 10000 };
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [l, l],
    });
    expect(res.status).toBe(400);
    expect((await prLine(pr.line.a as number)).status).toBe("pending");
  });

  test("BR-PO-01 a PR line already on another PO -> 400", async () => {
    const po = await mkDraftPo();
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: po.line.a, unitPricePaise: 10000 }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-PO-01 / BR-PR-25 two POs for one line at once -> one 201, one 409 PO_LINE_ALREADY_DRAFTED", async () => {
    const pr = await mkPr();
    const body = {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.a, unitPricePaise: 10000 }],
    };
    const rs = await Promise.all([
      createPoRaw("buyer", body),
      createPoRaw("buyer2", body),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const loser = rs.find((r) => r.status === 409) as Response;
    expect((await json(loser)).code).toBe("PO_LINE_ALREADY_DRAFTED");
    expect((await poItemIdOf(pr.line.a as number)).length).toBe(1);
    expect((await prLine(pr.line.a as number)).issuedQty).toBe(10);
  });

  test("BR-PO-01 second line invalid -> 400 and the first PR line is not taken", async () => {
    const pr = await mkPr();
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [
        { prItemId: pr.line.a, unitPricePaise: 10000 },
        { prItemId: 999999999, unitPricePaise: 10000 },
      ],
    });
    expect(res.status).toBe(400);
    expect((await prLine(pr.line.a as number)).status).toBe("pending");
    expect((await prLine(pr.line.a as number)).issuedQty).toBe(0);
  });

  test("BR-PO-01 a supplier deactivated later does not stop its open dispatched PO", async () => {
    const po = await mkDispatchedPo({ supplier: "s2" });
    await db
      .update(supplierMaster)
      .set({ isActive: false })
      .where(eq(supplierMaster.id, sup.s2 as number));
    try {
      const res = await call("buyer", "POST", `/api/po/${po.poId}/reminder`, {
        channel: "phone",
      });
      expect(res.status).toBe(201);
      expect((await poRow(po.poId)).status).toBe("dispatched");
    } finally {
      await db
        .update(supplierMaster)
        .set({ isActive: true })
        .where(eq(supplierMaster.id, sup.s2 as number));
    }
  });
});

describe("BR-PO-02 qty is the PR line's whole remaining qty, uom from item", () => {
  test("BR-PO-02 PO line qty = PR line qty and uom = item uom", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 12.5],
        ["b", 3],
      ],
    });
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [
        { prItemId: pr.line.a, unitPricePaise: 10000 },
        { prItemId: pr.line.b, unitPricePaise: 1000 },
      ],
    });
    expect(res.status).toBe(201);
    const items = itemsOf(await json(res));
    const byItem = (id: number) => items.find((i) => i.itemId === id) as Rec;
    expect(byItem(item.a as number).qty).toBe(12.5);
    expect(byItem(item.a as number).uom).toBe("kg");
    expect(byItem(item.b as number).qty).toBe(3);
    expect(byItem(item.b as number).uom).toBe("pcs");
  });

  test("BR-PO-02 a qty sent on create is ignored or refused, never used", async () => {
    const pr = await mkPr();
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.a, unitPricePaise: 10000, qty: 4 }],
    });
    if (res.status === 201) {
      expect(itemsOf(await json(res))[0]?.qty).toBe(10);
    } else {
      expect(res.status).toBe(400);
      expect((await prLine(pr.line.a as number)).status).toBe("pending");
    }
  });

  test("BR-PO-02 PATCH with qty 900 on a line is ignored or 400, qty stays", async () => {
    const po = await mkDraftPo();
    const [poItemId] = await poItemIdOf(po.line.a as number);
    const res = await edit(po.poId, {
      updates: [{ id: poItemId, unitPricePaise: 10000, qty: 900 }],
    });
    expect([200, 400]).toContain(res.status);
    const items = itemsOf(await json(await detail(po.poId)));
    expect(items[0]?.qty).toBe(10);
  });

  test("BR-PO-02 PR line issuedQty = requested qty after drafting (BR-PR-25)", async () => {
    const po = await mkDraftPo();
    const l = await prLine(po.line.a as number);
    expect(l.status).toBe("po_draft");
    expect(l.issuedQty).toBe(10);
    const links = await db
      .select()
      .from(prPoItemLinks)
      .where(eq(prPoItemLinks.prItemId, po.line.a as number));
    expect(links.length).toBe(1);
    expect(links[0]?.linkedQty).toBe(10);
  });
});

describe("BR-PO-03 rate in paise, at least 1, defaulted from the price list", () => {
  test.each([
    ["zero", 0],
    ["negative", -5],
    ["fractional", 12.5],
  ])("BR-PO-03 rate %s -> 400", async (_n, rate) => {
    const pr = await mkPr();
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.a, unitPricePaise: rate }],
    });
    expect(res.status).toBe(400);
    expect((await prLine(pr.line.a as number)).status).toBe("pending");
  });

  test("BR-PO-03 rate 1 paise is accepted", async () => {
    const pr = await mkPr();
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.a, unitPricePaise: 1, gstPercent: 0 }],
    });
    expect(res.status).toBe(201);
  });

  test("BR-PO-03 rate left out -> price-list price (24500) and GST 18, then editable to 24000", async () => {
    const pr = await mkPr({ lines: [["pl", 10]] });
    const res = await createPoRaw("buyer", {
      supplierId: sup.s3,
      lines: [{ prItemId: pr.line.pl }],
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const created = itemsOf(body)[0] as Rec;
    expect(created.unitPricePaise).toBe(24500);
    expect(created.gstPercent).toBe(18);
    const poId = poOf(body).id as number;
    const [poItemId] = await poItemIdOf(pr.line.pl as number);
    const upd = await edit(poId, {
      updates: [{ id: poItemId, unitPricePaise: 24000 }],
    });
    expect(upd.status).toBe(200);
    expect(itemsOf(await json(await detail(poId)))[0]?.unitPricePaise).toBe(
      24000,
    );
  });

  test("BR-PO-03 editing to rate 0 in draft -> 400, rate unchanged", async () => {
    const po = await mkDraftPo();
    const [poItemId] = await poItemIdOf(po.line.a as number);
    const res = await edit(po.poId, {
      updates: [{ id: poItemId, unitPricePaise: 0 }],
    });
    expect(res.status).toBe(400);
    expect(itemsOf(await json(await detail(po.poId)))[0]?.unitPricePaise).toBe(
      11000,
    );
  });
});

describe("BR-PO-04 GST per line and money maths", () => {
  test("BR-PO-04 12.5 kg x 21001 at 18% -> value 262513, tax 47252, total 309765", async () => {
    const pr = await mkPr({ lines: [["a", 12.5]] });
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.a, unitPricePaise: 21001, gstPercent: 18 }],
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const line = itemsOf(body)[0] as Rec;
    expect(line.lineValuePaise).toBe(262513);
    expect(line.lineTaxPaise).toBe(47252);
    const po = poOf(body);
    expect(po.subtotalPaise).toBe(262513);
    expect(po.taxAmountPaise).toBe(47252);
    expect(po.totalAmountPaise).toBe(309765);
  });

  test("BR-PO-04 subtotal 100000 at 18% -> total 118000", async () => {
    const po = await mkDraftPo({ rate: 10000, gst: 18 });
    const p = poOf(await json(await detail(po.poId)));
    expect([p.subtotalPaise, p.taxAmountPaise, p.totalAmountPaise]).toEqual([
      100000, 18000, 118000,
    ]);
  });

  test("BR-PO-04 two lines: tax is the sum of line taxes, total = subtotal + tax", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 12.5],
        ["b", 3],
      ],
    });
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [
        { prItemId: pr.line.a, unitPricePaise: 21001, gstPercent: 18 },
        { prItemId: pr.line.b, unitPricePaise: 3333, gstPercent: 5 },
      ],
    });
    const po = poOf(await json(res));
    expect([po.subtotalPaise, po.taxAmountPaise, po.totalAmountPaise]).toEqual([
      272512, 47752, 320264,
    ]);
  });

  test("BR-PO-04 GST 17 is not an allowed value -> 400", async () => {
    const pr = await mkPr();
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.a, unitPricePaise: 10000, gstPercent: 17 }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-PO-04 GST left out -> supplier price-list % (18); item with no price row -> 0", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 10],
        ["b", 3],
      ],
    });
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [
        { prItemId: pr.line.a, unitPricePaise: 10000 },
        { prItemId: pr.line.b, unitPricePaise: 1000 },
      ],
    });
    expect(res.status).toBe(201);
    const items = itemsOf(await json(res));
    expect(items.find((i) => i.itemId === item.a)?.gstPercent).toBe(18);
    expect(items.find((i) => i.itemId === item.b)?.gstPercent).toBe(0);
  });

  test("BR-PO-04 an explicit GST % (5) overrides the price-list default", async () => {
    const po = await mkDraftPo({ rate: 10000, gst: 5 });
    const p = poOf(await json(await detail(po.poId)));
    expect(p.taxAmountPaise).toBe(5000);
  });

  test("BR-PO-04 totals recomputed on a rate change (20000 x 10 at 18% -> 236000)", async () => {
    const po = await mkDraftPo({ rate: 10000, gst: 18 });
    const [poItemId] = await poItemIdOf(po.line.a as number);
    const res = await edit(po.poId, {
      updates: [{ id: poItemId, unitPricePaise: 20000 }],
    });
    expect(res.status).toBe(200);
    const p = poOf(await json(await detail(po.poId)));
    expect([p.subtotalPaise, p.taxAmountPaise, p.totalAmountPaise]).toEqual([
      200000, 36000, 236000,
    ]);
    const row = await poRow(po.poId);
    expect(row.totalAmountPaise).toBe(236000);
  });

  test("BR-PO-04 GST 17 on an edit -> 400", async () => {
    const po = await mkDraftPo();
    const [poItemId] = await poItemIdOf(po.line.a as number);
    const res = await edit(po.poId, {
      updates: [{ id: poItemId, unitPricePaise: 10000, gstPercent: 17 }],
    });
    expect(res.status).toBe(400);
  });
});

describe("BR-PO-05 edit only in draft", () => {
  test("BR-PO-05 draft: terms, date, notes are saved", async () => {
    const po = await mkDraftPo();
    const d = days(20).toISOString();
    const res = await edit(po.poId, {
      paymentTermsDays: 60,
      deliveryTerms: "ex-works",
      notes: "new notes",
      expectedDeliveryDate: d,
    });
    expect(res.status).toBe(200);
    const row = await poRow(po.poId);
    expect(row.paymentTermsDays).toBe(60);
    expect(row.deliveryTerms).toBe("ex-works");
    expect(row.notes).toBe("new notes");
    expect(dayStr(row.expectedDeliveryDate)).toBe(dayStr(d));
  });

  test("BR-PO-05 pending_approval PO, change rate -> 409, nothing changed", async () => {
    const po = await mkDraftPo({ type: "misc" });
    expect((await submitPo(po.poId)).status).toBe(201);
    const [poItemId] = await poItemIdOf(po.line.a as number);
    const res = await edit(po.poId, {
      updates: [{ id: poItemId, unitPricePaise: 9999 }],
    });
    expect(res.status).toBe(409);
    expect((await poRow(po.poId)).totalAmountPaise).toBe(110000);
  });

  test("BR-PO-05 approved PO, change notes -> 409 PO_NOT_EDITABLE", async () => {
    const po = await mkApprovedPo();
    const res = await edit(po.poId, { notes: "late change" });
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("PO_NOT_EDITABLE");
  });

  test("BR-PO-05 cancelled PO, edit -> 409", async () => {
    const po = await mkDraftPo();
    expect((await cancelPo(po.poId)).status).toBe(200);
    expect((await edit(po.poId, { notes: "x" })).status).toBe(409);
  });

  test("BR-PO-05 the supplier cannot be changed", async () => {
    const po = await mkDraftPo();
    const res = await edit(po.poId, { supplierId: sup.s2 });
    expect([200, 400]).toContain(res.status);
    expect((await poRow(po.poId)).supplierId).toBe(sup.s1 as number);
  });

  test("BR-PO-05 remove the only line -> 400, line stays", async () => {
    const po = await mkDraftPo();
    const [poItemId] = await poItemIdOf(po.line.a as number);
    const res = await edit(po.poId, { deletes: [{ id: poItemId }] });
    expect(res.status).toBe(400);
    expect((await prLine(po.line.a as number)).status).toBe("po_draft");
    expect(itemsOf(await json(await detail(po.poId))).length).toBe(1);
  });

  test("BR-PO-05 / BR-PR-31 remove 1 of 2 lines -> that PR line back to pending, issuedQty 0, can go on a new PO", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 10],
        ["b", 3],
      ],
    });
    const po = await mkDraftPo({ pr });
    const [bItem] = await poItemIdOf(pr.line.b as number);
    const res = await edit(po.poId, { deletes: [{ id: bItem }] });
    expect(res.status).toBe(200);
    const b = await prLine(pr.line.b as number);
    expect(b.status).toBe("pending");
    expect(b.issuedQty).toBe(0);
    expect((await prLine(pr.line.a as number)).status).toBe("po_draft");
    expect(itemsOf(await json(await detail(po.poId))).length).toBe(1);
    // BR-PR-36: one line on a PO, one pending -> partial_ordered
    expect((await prRow(pr.prId)).status).toBe("partial_ordered");
    // the freed line can go on another PO
    const po2 = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.b, unitPricePaise: 1000 }],
    });
    expect(po2.status).toBe(201);
  });

  test("BR-PO-05 add a pending PR line in draft", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 10],
        ["b", 3],
      ],
    });
    const po = await mkDraftPo({
      pr: { prId: pr.prId, line: { a: pr.line.a as number } },
    });
    const res = await edit(po.poId, {
      inserts: [{ prItemId: pr.line.b, unitPricePaise: 1000, gstPercent: 0 }],
    });
    expect(res.status).toBe(200);
    expect(itemsOf(await json(await detail(po.poId))).length).toBe(2);
    expect((await prLine(pr.line.b as number)).status).toBe("po_draft");
  });

  test("BR-PO-05 adding a PR line that is already on a PO -> 400", async () => {
    const other = await mkDraftPo();
    const po = await mkDraftPo();
    const res = await edit(po.poId, {
      inserts: [{ prItemId: other.line.a, unitPricePaise: 1000 }],
    });
    expect(res.status).toBe(400);
    expect(itemsOf(await json(await detail(po.poId))).length).toBe(1);
  });
});

describe("BR-PO-06 submit through the approval module", () => {
  test("BR-PO-06 creator submits a misc PO -> pending_approval, level 1 of 2", async () => {
    const po = await mkDraftPo({ type: "misc" });
    const res = await submitPo(po.poId);
    expect(res.status).toBe(201);
    const row = await poRow(po.poId);
    expect(row.status).toBe("pending_approval");
    expect(row.currentApprovalLevel).toBe(1);
    expect(row.totalApprovalLevels).toBe(2);
  });

  test("BR-PO-06 someone other than the creator submits -> 403, PO stays draft", async () => {
    const po = await mkDraftPo({ type: "misc" });
    const res = await submitPo(po.poId, "buyer2");
    expect(res.status).toBe(403);
    expect((await poRow(po.poId)).status).toBe("draft");
  });

  test("BR-PO-06 submit from a non-draft PO -> 409", async () => {
    const po = await mkApprovedPo();
    expect((await submitPo(po.poId)).status).toBe(409);
    expect((await poRow(po.poId)).status).toBe("approved");
  });

  test("BR-PO-06 second submit while a request is open -> 409", async () => {
    const po = await mkDraftPo({ type: "misc" });
    expect((await submitPo(po.poId)).status).toBe(201);
    expect((await submitPo(po.poId)).status).toBe(409);
  });

  test("BR-PO-06 policy is matched on the total incl. GST (118000 -> auto-approve band)", async () => {
    // subtotal 100000 would fall in the two-level band; total incl. 18% GST is 118000 (auto band)
    const po = await mkDraftPo({ rate: 10000, gst: 18 });
    expect((await submitPo(po.poId)).status).toBe(201);
    expect((await poRow(po.poId)).status).toBe("approved");
  });

  test("BR-PO-06 same PO with GST 0 (total 100000) falls in the two-level band -> pending_approval", async () => {
    const po = await mkDraftPo({ rate: 10000, gst: 0 });
    expect((await submitPo(po.poId)).status).toBe(201);
    const row = await poRow(po.poId);
    expect(row.status).toBe("pending_approval");
    expect(row.totalApprovalLevels).toBe(2);
  });
});

describe("BR-PO-07 approval outcomes on the PO and its PR lines", () => {
  test("BR-PO-07 middle level approves -> still pending_approval, PR line still po_draft", async () => {
    const po = await mkDraftPo({ type: "misc" });
    const reqId = dataOf(await json(await submitPo(po.poId))).id as number;
    expect((await act("ap1", reqId, "approve")).status).toBe(200);
    const row = await poRow(po.poId);
    expect(row.status).toBe("pending_approval");
    expect(row.currentApprovalLevel).toBe(2);
    expect((await prLine(po.line.a as number)).status).toBe("po_draft");
  });

  test("BR-PO-07 last level approves -> approved, approvedBy set, PR line ordered", async () => {
    const po = await mkDraftPo({ type: "misc" });
    const reqId = dataOf(await json(await submitPo(po.poId))).id as number;
    await act("ap1", reqId, "approve");
    expect((await act("ap2", reqId, "approve")).status).toBe(200);
    const row = await poRow(po.poId);
    expect(row.status).toBe("approved");
    expect(row.approvedBy).toBe(emp.ap2 as number);
    expect((await prLine(po.line.a as number)).status).toBe("ordered");
  });

  test("BR-PO-07 auto-approved PO -> approved and its PR line ordered", async () => {
    const po = await mkApprovedPo();
    expect((await prLine(po.line.a as number)).status).toBe("ordered");
  });

  test("BR-PO-07 reject -> PO cancelled, PR line cancelled, single-line PR cancelled", async () => {
    const po = await mkDraftPo({ type: "misc" });
    const reqId = dataOf(await json(await submitPo(po.poId))).id as number;
    expect((await act("ap1", reqId, "reject")).status).toBe(200);
    expect((await poRow(po.poId)).status).toBe("cancelled");
    const l = await prLine(po.line.a as number);
    expect(l.status).toBe("cancelled");
    expect(l.issuedQty).toBe(0);
    expect((await prRow(po.prId)).status).toBe("cancelled");
    // BR-PR-31: a cancelled line can not go on any PO
    const again = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: po.line.a, unitPricePaise: 10000 }],
    });
    expect(again.status).toBe(400);
  });

  test("BR-PO-07 send back -> draft, PR line stays po_draft", async () => {
    const po = await mkDraftPo({ type: "misc" });
    const reqId = dataOf(await json(await submitPo(po.poId))).id as number;
    expect((await act("ap1", reqId, "sent_back")).status).toBe(200);
    expect((await poRow(po.poId)).status).toBe("draft");
    expect((await prLine(po.line.a as number)).status).toBe("po_draft");
  });

  test("BR-PO-07 creator withdraws -> draft, PR line stays po_draft (BR-PR-30)", async () => {
    const po = await mkDraftPo({ type: "misc" });
    const reqId = dataOf(await json(await submitPo(po.poId))).id as number;
    expect((await act("buyer", reqId, "withdraw")).status).toBe(200);
    expect((await poRow(po.poId)).status).toBe("draft");
    expect((await prLine(po.line.a as number)).status).toBe("po_draft");
    expect((await edit(po.poId, { notes: "editable again" })).status).toBe(200);
  });

  test("BR-PO-07 sending the approved PO does not change the ordered PR line (BR-PR-30)", async () => {
    const po = await mkDispatchedPo();
    expect((await prLine(po.line.a as number)).status).toBe("ordered");
  });
});

describe("BR-PO-08 send", () => {
  test("BR-PO-08 send a draft PO -> 400", async () => {
    const po = await mkDraftPo();
    expect((await send(po.poId)).status).toBe(400);
    expect((await poRow(po.poId)).status).toBe("draft");
  });

  test("BR-PO-08 email channel without an address -> 400, still approved", async () => {
    const po = await mkApprovedPo();
    const res = await send(po.poId, { channel: "email" });
    expect(res.status).toBe(400);
    expect((await poRow(po.poId)).status).toBe("approved");
  });

  test("BR-PO-08 unknown channel -> 400", async () => {
    const po = await mkApprovedPo();
    expect((await send(po.poId, { channel: "pigeon" })).status).toBe(400);
  });

  test("BR-PO-08 approved + email with address -> dispatched", async () => {
    const po = await mkApprovedPo();
    const res = await send(po.poId, {
      channel: "email",
      toEmail: "sales@supplier.test",
    });
    expect(res.status).toBe(200);
    expect((await poRow(po.poId)).status).toBe("dispatched");
  });

  test("BR-PO-08 approved + whatsapp -> dispatched, exactly one 'PO sent' row with who and when", async () => {
    const po = await mkApprovedPo();
    const res = await send(po.poId, {
      channel: "whatsapp",
      note: "sent via wa",
    });
    expect(res.status).toBe(200);
    expect((await poRow(po.poId)).status).toBe("dispatched");
    const rows = await comms(po.poId);
    expect(rows.length).toBe(1);
    expect(rows[0]?.type).toBe("po_sent");
    expect(rows[0]?.channel).toBe("whatsapp");
    expect(rows[0]?.note).toBe("sent via wa");
    expect(rows[0]?.sentBy).toBe(emp.buyer as number);
    expect(rows[0]?.sentAt).toBeTruthy();
  });

  test("BR-PO-08 pending_approval PO, send -> 400", async () => {
    const po = await mkDraftPo({ type: "misc" });
    await submitPo(po.poId);
    expect((await send(po.poId)).status).toBe(400);
  });
});

describe("BR-PO-09 no changes after send", () => {
  test("BR-PO-09 dispatched PO: edit -> 409, totals unchanged", async () => {
    const po = await mkDispatchedPo();
    const [poItemId] = await poItemIdOf(po.line.a as number);
    const res = await edit(po.poId, {
      updates: [{ id: poItemId, unitPricePaise: 12000 }],
    });
    expect(res.status).toBe(409);
    expect((await poRow(po.poId)).totalAmountPaise).toBe(110000);
  });

  test("BR-PO-09 rate change means cancel + new PR + new PO: cancel works and the old line can't be reused", async () => {
    const po = await mkDispatchedPo();
    expect((await cancelPo(po.poId, "supplier raised rate")).status).toBe(200);
    const again = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: po.line.a, unitPricePaise: 12000 }],
    });
    expect(again.status).toBe(400);
  });
});

describe("BR-PO-11 cancel", () => {
  test("BR-PO-11 reason too short (ab) -> 400, PO still draft", async () => {
    const po = await mkDraftPo();
    expect((await cancelPo(po.poId, "ab")).status).toBe(400);
    expect((await poRow(po.poId)).status).toBe("draft");
  });

  test("BR-PO-11 reason missing -> 400", async () => {
    const po = await mkDraftPo();
    const res = await call("buyer", "DELETE", `/api/po/deletepo/${po.poId}`);
    expect(res.status).toBe(400);
    expect((await poRow(po.poId)).status).toBe("draft");
  });

  test("BR-PO-11 spaces only / ' ab ' (trimmed length 2) -> 400", async () => {
    const po = await mkDraftPo();
    expect((await cancelPo(po.poId, "     ")).status).toBe(400);
    expect((await cancelPo(po.poId, " ab ")).status).toBe(400);
  });

  test("BR-PO-11 501 chars -> 400, 500 chars -> 200", async () => {
    const po = await mkDraftPo();
    expect((await cancelPo(po.poId, "x".repeat(501))).status).toBe(400);
    expect((await cancelPo(po.poId, "x".repeat(500))).status).toBe(200);
  });

  test("BR-PO-11 draft cancel: cancelled, who/when/reason stored, PR line cancelled, issuedQty 0, PR cancelled", async () => {
    const po = await mkDraftPo();
    const res = await cancelPo(po.poId, "duplicate");
    expect(res.status).toBe(200);
    const d = poOf(await json(await detail(po.poId)));
    expect(d.status).toBe("cancelled");
    expect(d.cancelReason).toBe("duplicate");
    expect(d.cancelledBy).toBe(emp.buyer as number);
    expect(d.cancelledAt).toBeTruthy();
    const l = await prLine(po.line.a as number);
    expect(l.status).toBe("cancelled");
    expect(l.issuedQty).toBe(0);
    expect((await prRow(po.prId)).status).toBe("cancelled");
  });

  test("BR-PO-11 approved PO cancel 'wrong supplier' -> cancelled, PR line cancelled", async () => {
    const po = await mkApprovedPo();
    expect((await cancelPo(po.poId, "wrong supplier")).status).toBe(200);
    expect((await poRow(po.poId)).status).toBe("cancelled");
    expect((await prLine(po.line.a as number)).status).toBe("cancelled");
  });

  test("BR-PO-11 dispatched PO with no GRN can be cancelled", async () => {
    const po = await mkDispatchedPo();
    expect((await cancelPo(po.poId, "supplier closed down")).status).toBe(200);
    expect((await poRow(po.poId)).status).toBe("cancelled");
  });

  test("BR-PO-11 dispatched PO with a draft GRN -> 409, nothing changed", async () => {
    const po = await mkDispatchedPo();
    await db.insert(grns).values({
      grnNumber: `TEST_PO_GRN_${po.poId}`,
      poId: po.poId,
      supplierId: sup.s1 as number,
      status: "draft",
      createdBy: emp.buyer as number,
    });
    const res = await cancelPo(po.poId, "changed my mind");
    expect(res.status).toBe(409);
    expect((await poRow(po.poId)).status).toBe("dispatched");
    expect((await prLine(po.line.a as number)).status).toBe("ordered");
  });

  test.each([
    "partial_received",
    "fully_received",
    "invoiced",
    "closed",
  ] as const)("BR-PO-11 %s PO cannot be cancelled -> 409", async (status) => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status });
    expect((await cancelPo(po.poId, "too late")).status).toBe(409);
    expect((await poRow(po.poId)).status).toBe(status);
  });

  test("BR-PO-11 pending_approval cancel also cancels the open approval request with a trail row", async () => {
    const po = await mkDraftPo({ type: "misc" });
    const reqId = dataOf(await json(await submitPo(po.poId))).id as number;
    expect((await cancelPo(po.poId, "no longer needed")).status).toBe(200);
    const [req] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, reqId));
    expect(req?.status).toBe("cancelled");
    const trail = await db
      .select()
      .from(approvalTrails)
      .where(eq(approvalTrails.requestId, reqId))
      .orderBy(asc(approvalTrails.id));
    const c = trail.filter((t) => t.action === "cancelled");
    expect(c.length).toBe(1);
    expect(c[0]?.actionBy).toBe(emp.buyer as number);
    const later = await act("ap1", reqId, "approve");
    expect(later.status).toBe(409);
    expect((await json(later)).code).toBe("APPROVAL_NOT_PENDING");
  });

  test("BR-PO-11 / BR-PR-36 one PO of a 3-line PR cancelled -> its line cancelled, header from the other 2 -> fully_ordered", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 10],
        ["b", 3],
        ["c", 4],
      ],
    });
    const po1 = await mkDraftPo({
      pr: { prId: pr.prId, line: { a: pr.line.a as number } },
    });
    await mkDraftPo({
      pr: {
        prId: pr.prId,
        line: { b: pr.line.b as number, c: pr.line.c as number },
      },
    });
    expect((await prRow(pr.prId)).status).toBe("fully_ordered");
    expect((await cancelPo(po1.poId, "not needed now")).status).toBe(200);
    expect((await prLine(pr.line.a as number)).status).toBe("cancelled");
    expect((await prLine(pr.line.b as number)).status).toBe("po_draft");
    expect((await prRow(pr.prId)).status).toBe("fully_ordered");
  });

  test("BR-PO-11 cancelled twice -> second is 409", async () => {
    const po = await mkDraftPo();
    expect((await cancelPo(po.poId)).status).toBe(200);
    expect((await cancelPo(po.poId)).status).toBe(409);
  });
});

describe("BR-PO-12 cancelled and closed are final", () => {
  test("BR-PO-12 delete = cancel: row and number remain", async () => {
    const po = await mkDraftPo();
    const number = (await poRow(po.poId)).poNumber;
    expect((await cancelPo(po.poId)).status).toBe(200);
    const row = await poRow(po.poId);
    expect(row.status).toBe("cancelled");
    expect(row.poNumber).toBe(number);
  });

  test("BR-PO-12 cancelled PO: send 400; every other action refused", async () => {
    const po = await mkApprovedPo();
    expect((await cancelPo(po.poId)).status).toBe(200);
    expect((await send(po.poId)).status).toBe(400);
    expect((await edit(po.poId, { notes: "x" })).status).toBe(409);
    const p = (path: string, body: Rec, method = "POST") =>
      call("buyer", method, `/api/po/${po.poId}/${path}`, body);
    expect((await p("close", {})).status).toBe(400);
    expect(
      (await p("short-close", { reason: "supplier stopped" })).status,
    ).toBe(400);
    expect(
      (
        await p("invoice", {
          invoiceNumber: "X",
          invoiceDate: days(0).toISOString(),
          billedAmountPaise: 1,
        })
      ).status,
    ).toBe(400);
    expect((await p("reminder", { channel: "phone" })).status).toBe(400);
    expect(
      (
        await p(
          "delay",
          { revisedDeliveryDate: days(5).toISOString(), delayReason: "late" },
          "PATCH",
        )
      ).status,
    ).toBe(400);
    expect((await poRow(po.poId)).status).toBe("cancelled");
  });

  test("BR-PO-12 closed PO: nothing moves it", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "closed" });
    expect((await send(po.poId)).status).toBe(400);
    expect((await edit(po.poId, { notes: "x" })).status).toBe(409);
    expect(
      (await call("buyer", "POST", `/api/po/${po.poId}/close`, {})).status,
    ).toBe(400);
    expect((await poRow(po.poId)).status).toBe("closed");
  });
});

describe("BR-PO-13 short-close", () => {
  test("BR-PO-13 partial_received, reason 'supplier stopped' -> closed, shortClosed, PR line closed, issuedQty kept", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "partial_received" });
    await setReceived(po.poId, (q) => q * 0.6);
    const res = await call("buyer", "POST", `/api/po/${po.poId}/short-close`, {
      reason: "supplier stopped",
    });
    expect(res.status).toBe(200);
    const d = poOf(await json(await detail(po.poId)));
    expect(d.status).toBe("closed");
    expect(d.shortClosed).toBe(true);
    expect(d.closedBy).toBe(emp.buyer as number);
    expect(d.closedAt).toBeTruthy();
    const l = await prLine(po.line.a as number);
    expect(l.status).toBe("closed");
    expect(l.issuedQty).toBe(10);
  });

  test("BR-PO-13 reason too short / missing -> 400, PO stays partial_received", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "partial_received" });
    expect(
      (
        await call("buyer", "POST", `/api/po/${po.poId}/short-close`, {
          reason: "ab",
        })
      ).status,
    ).toBe(400);
    expect(
      (await call("buyer", "POST", `/api/po/${po.poId}/short-close`, {}))
        .status,
    ).toBe(400);
    expect((await poRow(po.poId)).status).toBe("partial_received");
  });

  test.each([
    "draft",
    "approved",
    "dispatched",
    "fully_received",
    "invoiced",
    "closed",
  ] as const)("BR-PO-13 short-close on %s -> 400", async (status) => {
    const po = await mkApprovedPo();
    await setPo(po.poId, { status });
    const res = await call("buyer", "POST", `/api/po/${po.poId}/short-close`, {
      reason: "supplier stopped",
    });
    expect(res.status).toBe(400);
    expect((await poRow(po.poId)).status).toBe(status);
  });
});

describe("BR-PO-14 close", () => {
  test("BR-PO-14 fully_received, close with a note -> closed, who/when/note", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "fully_received" });
    const res = await call("buyer", "POST", `/api/po/${po.poId}/close`, {
      note: "all good",
    });
    expect(res.status).toBe(200);
    const d = poOf(await json(await detail(po.poId)));
    expect(d.status).toBe("closed");
    expect(d.closedBy).toBe(emp.buyer as number);
    expect(d.closedAt).toBeTruthy();
    expect(d.closeNote).toBe("all good");
  });

  test("BR-PO-14 invoiced -> closed without a note", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "invoiced" });
    expect(
      (await call("buyer", "POST", `/api/po/${po.poId}/close`, {})).status,
    ).toBe(200);
    expect((await poRow(po.poId)).status).toBe("closed");
  });

  test.each([
    "draft",
    "approved",
    "dispatched",
    "partial_received",
    "closed",
  ] as const)("BR-PO-14 close from %s -> 400", async (status) => {
    const po = await mkApprovedPo();
    await setPo(po.poId, { status });
    expect(
      (await call("buyer", "POST", `/api/po/${po.poId}/close`, {})).status,
    ).toBe(400);
    expect((await poRow(po.poId)).status).toBe(status);
  });
});

describe("BR-PO-15 record supplier invoice", () => {
  const inv = (poId: number, over: Rec = {}) =>
    call("buyer", "POST", `/api/po/${poId}/invoice`, {
      invoiceNumber: "TESTPO-INV-44",
      invoiceDate: days(0).toISOString(),
      billedAmountPaise: 110000,
      ...over,
    });

  test("BR-PO-15 fully_received -> invoiced, who/when stored", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "fully_received" });
    const res = await inv(po.poId, { invoiceNumber: "TESTPO-INV-1" });
    expect(res.status).toBe(200);
    const d = poOf(await json(await detail(po.poId)));
    expect(d.status).toBe("invoiced");
    expect(d.invoicedBy).toBe(emp.buyer as number);
    expect(d.invoicedAt).toBeTruthy();
    const rows = await db
      .select()
      .from(supplierInvoices)
      .where(eq(supplierInvoices.poId, po.poId));
    expect(rows.length).toBe(1);
    expect(rows[0]?.billedAmountPaise).toBe(110000);
  });

  test.each([
    "approved",
    "dispatched",
    "partial_received",
    "invoiced",
    "closed",
  ] as const)("BR-PO-15 invoice on %s -> 400", async (status) => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status });
    expect(
      (await inv(po.poId, { invoiceNumber: `TESTPO-INV-${status}` })).status,
    ).toBe(400);
    expect((await poRow(po.poId)).status).toBe(status);
  });

  test("BR-PO-15 missing invoice number / date / amount -> 400", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "fully_received" });
    const base = {
      invoiceNumber: "TESTPO-INV-2",
      invoiceDate: days(0).toISOString(),
      billedAmountPaise: 1000,
    };
    for (const k of Object.keys(base)) {
      const body: Rec = { ...base };
      delete body[k];
      expect(
        (await call("buyer", "POST", `/api/po/${po.poId}/invoice`, body))
          .status,
      ).toBe(400);
    }
    expect((await poRow(po.poId)).status).toBe("fully_received");
  });

  test("BR-PO-15 same invoice number, same supplier, twice -> 409; other supplier is fine", async () => {
    const a = await mkDispatchedPo({ supplier: "s1" });
    const b = await mkDispatchedPo({ supplier: "s1" });
    const c = await mkDispatchedPo({ supplier: "s3" });
    for (const p of [a, b, c])
      await setPo(p.poId, { status: "fully_received" });
    expect(
      (await inv(a.poId, { invoiceNumber: "TESTPO-INV-DUP" })).status,
    ).toBe(200);
    expect(
      (await inv(b.poId, { invoiceNumber: "TESTPO-INV-DUP" })).status,
    ).toBe(409);
    expect((await poRow(b.poId)).status).toBe("fully_received");
    expect(
      (await inv(c.poId, { invoiceNumber: "TESTPO-INV-DUP" })).status,
    ).toBe(200);
  });
});

describe("BR-PO-16 delay", () => {
  test("BR-PO-16 dispatched: revised date + reason saved, expected date unchanged", async () => {
    const expected = days(10).toISOString();
    const po = await mkDispatchedPo({ expected });
    const revised = days(20).toISOString();
    const res = await call("buyer", "PATCH", `/api/po/${po.poId}/delay`, {
      revisedDeliveryDate: revised,
      delayReason: "furnace breakdown",
    });
    expect(res.status).toBe(200);
    const d = poOf(await json(await detail(po.poId)));
    expect(dayStr(d.revisedDeliveryDate)).toBe(dayStr(revised));
    expect(d.delayReason).toBe("furnace breakdown");
    expect(dayStr(d.expectedDeliveryDate)).toBe(dayStr(expected));
    expect(dayStr(d.dueDate)).toBe(dayStr(revised));
  });

  test("BR-PO-16 partial_received is allowed too", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "partial_received" });
    const res = await call("buyer", "PATCH", `/api/po/${po.poId}/delay`, {
      revisedDeliveryDate: days(15).toISOString(),
      delayReason: "transport strike",
    });
    expect(res.status).toBe(200);
  });

  test.each([
    "draft",
    "approved",
    "fully_received",
    "closed",
    "cancelled",
  ] as const)("BR-PO-16 delay on %s -> 400", async (status) => {
    const po = await mkApprovedPo();
    await setPo(po.poId, { status });
    const res = await call("buyer", "PATCH", `/api/po/${po.poId}/delay`, {
      revisedDeliveryDate: days(15).toISOString(),
      delayReason: "late",
    });
    expect(res.status).toBe(400);
  });

  test("BR-PO-16 revised date or reason missing -> 400, nothing saved", async () => {
    const po = await mkDispatchedPo();
    const p = `/api/po/${po.poId}/delay`;
    expect(
      (
        await call("buyer", "PATCH", p, {
          revisedDeliveryDate: days(15).toISOString(),
        })
      ).status,
    ).toBe(400);
    expect(
      (await call("buyer", "PATCH", p, { delayReason: "late" })).status,
    ).toBe(400);
    expect((await poRow(po.poId)).revisedDeliveryDate).toBeNull();
  });
});

describe("BR-PO-17 supplier confirmation, reminders, escalations are log rows", () => {
  test("BR-PO-17 reminder + escalation on dispatched -> logged, status unchanged, newest first", async () => {
    const po = await mkDispatchedPo();
    const r = await call("buyer", "POST", `/api/po/${po.poId}/reminder`, {
      channel: "phone",
      note: "call 1",
    });
    expect(r.status).toBe(201);
    const e = await call("buyer", "POST", `/api/po/${po.poId}/escalate`, {
      channel: "whatsapp",
      note: "esc 1",
    });
    expect(e.status).toBe(201);
    expect((await poRow(po.poId)).status).toBe("dispatched");
    const rows = await comms(po.poId);
    expect(rows.map((x) => x.type)).toEqual([
      "escalation",
      "reminder",
      "po_sent",
    ]);
    expect(rows[0]?.sentBy).toBe(emp.buyer as number);
    expect(rows[0]?.sentAt).toBeTruthy();
  });

  test("BR-PO-17 confirm on dispatched -> 200, status unchanged", async () => {
    const po = await mkDispatchedPo();
    const res = await call("buyer", "POST", `/api/po/${po.poId}/confirm`, {
      confirmationMethod: "phone",
      note: "spoke to Ravi",
    });
    expect(res.status).toBe(200);
    expect((await poRow(po.poId)).status).toBe("dispatched");
  });

  test("BR-PO-17 confirm is a log row with who, when, channel and note", async () => {
    const po = await mkDispatchedPo();
    const res = await call("buyer2", "POST", `/api/po/${po.poId}/confirm`, {
      confirmationMethod: "phone",
      note: "spoke to Ravi",
    });
    expect(res.status).toBe(200);
    const rows = await comms(po.poId);
    const c = rows.filter((r) => r.type === "confirmation");
    expect(c.length).toBe(1);
    expect(c[0]?.sentBy).toBe(emp.buyer2 as number);
    expect(c[0]?.sentAt).toBeTruthy();
    expect(c[0]?.channel).toBe("phone");
    expect(c[0]?.note).toBe("spoke to Ravi");
    expect((await poRow(po.poId)).status).toBe("dispatched");
  });

  test.each(["phone", "email", "whatsapp", "in_person"] as const)(
    "BR-PO-17 (v2) confirmation method %s is accepted and becomes the log row's channel",
    async (method) => {
      const po = await mkDispatchedPo();
      const res = await call("buyer", "POST", `/api/po/${po.poId}/confirm`, {
        confirmationMethod: method,
      });
      expect(res.status).toBe(200);
      const c = (await comms(po.poId)).filter((r) => r.type === "confirmation");
      expect(c.length).toBe(1);
      expect(c[0]?.channel).toBe(method);
    },
  );

  test("BR-PO-17 (v2) a confirmation method outside phone/email/whatsapp/in_person -> 400, nothing logged", async () => {
    const po = await mkDispatchedPo();
    const before = (await comms(po.poId)).length;
    for (const bad of ["carrier_pigeon", "", "PHONE"]) {
      const res = await call("buyer", "POST", `/api/po/${po.poId}/confirm`, {
        confirmationMethod: bad,
      });
      expect(res.status).toBe(400);
    }
    expect((await comms(po.poId)).length).toBe(before);
    expect((await poRow(po.poId)).status).toBe("dispatched");
  });

  test("BR-PO-17 reminder on partial_received is allowed", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "partial_received" });
    expect(
      (
        await call("buyer", "POST", `/api/po/${po.poId}/reminder`, {
          channel: "email",
          toEmail: "a@b.test",
        })
      ).status,
    ).toBe(201);
    expect((await poRow(po.poId)).status).toBe("partial_received");
  });

  test.each([
    "draft",
    "approved",
    "fully_received",
    "closed",
    "cancelled",
  ] as const)(
    "BR-PO-17 reminder / escalation / confirm on %s -> 400, nothing logged",
    async (status) => {
      const po = await mkApprovedPo();
      await setPo(po.poId, { status });
      expect(
        (
          await call("buyer", "POST", `/api/po/${po.poId}/reminder`, {
            channel: "phone",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await call("buyer", "POST", `/api/po/${po.poId}/escalate`, {
            channel: "phone",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await call("buyer", "POST", `/api/po/${po.poId}/confirm`, {
            confirmationMethod: "phone",
          })
        ).status,
      ).toBe(400);
      expect((await comms(po.poId)).length).toBe(0);
    },
  );
});

describe("BR-PO-18 expected delivery date", () => {
  test("BR-PO-18 approved PO with no date, send -> 400, still approved", async () => {
    const po = await mkApprovedPo({ expected: null });
    const res = await send(po.poId);
    expect(res.status).toBe(400);
    expect((await poRow(po.poId)).status).toBe("approved");
    expect((await comms(po.poId)).length).toBe(0);
  });

  test("BR-PO-18 create with an expected date before the PO date -> 400", async () => {
    const pr = await mkPr();
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      expectedDeliveryDate: days(-3).toISOString(),
      lines: [{ prItemId: pr.line.a, unitPricePaise: 10000 }],
    });
    expect(res.status).toBe(400);
    expect((await prLine(pr.line.a as number)).status).toBe("pending");
  });

  test("BR-PO-18 edit to a date before the PO date -> 400, a later date -> 200", async () => {
    const po = await mkDraftPo();
    expect(
      (await edit(po.poId, { expectedDeliveryDate: days(-3).toISOString() }))
        .status,
    ).toBe(400);
    expect(
      (await edit(po.poId, { expectedDeliveryDate: days(30).toISOString() }))
        .status,
    ).toBe(200);
  });

  test("BR-PO-18 date checked again on send: expected date now before the PO date -> 400", async () => {
    const po = await mkApprovedPo();
    await setPo(po.poId, { expectedDeliveryDate: days(-3) });
    expect((await send(po.poId)).status).toBe(400);
    expect((await poRow(po.poId)).status).toBe("approved");
  });
});

describe("BR-PO-19 overdue list", () => {
  const ids = {} as Record<string, number>;
  beforeAll(async () => {
    const mk = async (
      key: string,
      status: "dispatched" | "partial_received" | "approved",
      expected: Date,
      revised: Date | null,
      fullyReceived = false,
    ) => {
      const po = await mkDispatchedPo({ supplier: "overdue" });
      ids[key] = po.poId;
      await setPo(po.poId, {
        status,
        expectedDeliveryDate: expected,
        revisedDeliveryDate: revised,
      });
      if (fullyReceived) await setReceived(po.poId, (q) => q);
    };
    await mk("pastNoRevised", "dispatched", days(-5), null);
    await mk("pastFutureRevised", "dispatched", days(-5), days(5));
    await mk("future", "dispatched", days(5), null);
    await mk("partialPast", "partial_received", days(-5), null);
    await mk("partialNoOpenQty", "partial_received", days(-5), null, true);
    await mk("approvedPast", "approved", days(-5), null);
    await mk("pastPastRevised", "dispatched", days(-30), days(-2));
  });
  const overdueIds = async () => {
    const res = await call(
      "buyer",
      "GET",
      `/api/po/getpos?overdue=true&supplierId=${sup.overdue}&page=1&pageSize=100&sortDir=asc`,
    );
    expect(res.status).toBe(200);
    return ((await json(res)).data as Rec[]).map((p) => p.id as number);
  };

  test("BR-PO-19 dispatched, expected date passed, no revised date -> overdue", async () => {
    expect(await overdueIds()).toContain(ids.pastNoRevised as number);
  });
  test("BR-PO-19 revised date in the future beats a past expected date -> not overdue", async () => {
    expect(await overdueIds()).not.toContain(ids.pastFutureRevised as number);
  });
  test("BR-PO-19 expected date in the future -> not overdue", async () => {
    expect(await overdueIds()).not.toContain(ids.future as number);
  });
  test("BR-PO-19 partial_received with open qty and a past date -> overdue", async () => {
    expect(await overdueIds()).toContain(ids.partialPast as number);
  });
  test("BR-PO-19 no open qty on any line -> not overdue", async () => {
    expect(await overdueIds()).not.toContain(ids.partialNoOpenQty as number);
  });
  test("BR-PO-19 approved (not yet sent) with a past date -> not overdue", async () => {
    expect(await overdueIds()).not.toContain(ids.approvedPast as number);
  });
  test("BR-PO-19 revised date also passed -> overdue", async () => {
    expect(await overdueIds()).toContain(ids.pastPastRevised as number);
  });
});

describe("BR-PO-20 login and po.manage on every PO endpoint", () => {
  const ref = { id: 0 };
  beforeAll(async () => {
    ref.id = (await mkDraftPo()).poId;
  });
  const endpoints: [string, string, (id: number) => string, Rec | undefined][] =
    [
      [
        "GET",
        "getpos",
        () => "/api/po/getpos?page=1&pageSize=10&sortDir=asc",
        undefined,
      ],
      ["GET", "getpodetails", (id) => `/api/po/getpodetails/${id}`, undefined],
      [
        "POST",
        "createpo",
        () => "/api/po/createpo",
        { supplierId: 1, lines: [{ prItemId: 1, unitPricePaise: 1 }] },
      ],
      [
        "PATCH",
        "updatepo",
        () => "/api/po/updatepo",
        { poId: 1, notes: "n", inserts: [], updates: [], deletes: [] },
      ],
      [
        "DELETE",
        "deletepo",
        (id) => `/api/po/deletepo/${id}`,
        { reason: "not needed" },
      ],
      ["POST", "send", (id) => `/api/po/${id}/send`, { channel: "phone" }],
      [
        "POST",
        "reminder",
        (id) => `/api/po/${id}/reminder`,
        { channel: "phone" },
      ],
      [
        "POST",
        "escalate",
        (id) => `/api/po/${id}/escalate`,
        { channel: "phone" },
      ],
      [
        "POST",
        "confirm",
        (id) => `/api/po/${id}/confirm`,
        { confirmationMethod: "phone" },
      ],
      [
        "POST",
        "invoice",
        (id) => `/api/po/${id}/invoice`,
        { invoiceNumber: "X", invoiceDate: "2026-01-01", billedAmountPaise: 1 },
      ],
      ["POST", "close", (id) => `/api/po/${id}/close`, {}],
      [
        "POST",
        "short-close",
        (id) => `/api/po/${id}/short-close`,
        { reason: "supplier stopped" },
      ],
      [
        "PATCH",
        "delay",
        (id) => `/api/po/${id}/delay`,
        { revisedDeliveryDate: "2026-12-01", delayReason: "late" },
      ],
      [
        "GET",
        "communications",
        (id) => `/api/po/${id}/communications`,
        undefined,
      ],
    ];
  for (const [method, name, path, body] of endpoints) {
    test(`BR-PO-20 ${name} without a token -> 401`, async () => {
      expect((await call(null, method, path(ref.id), body)).status).toBe(401);
    });
    test(`BR-PO-20 ${name} without po.manage -> 403 PERMISSION_DENIED`, async () => {
      const res = await call("nokeys", method, path(ref.id), body);
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe("PERMISSION_DENIED");
    });
  }
  test("BR-PO-20 a role with only pr.manage is refused", async () => {
    expect(
      (
        await call(
          "prOnly",
          "GET",
          "/api/po/getpos?page=1&pageSize=10&sortDir=asc",
        )
      ).status,
    ).toBe(403);
  });
  test("BR-PO-20 super-admin passes without holding the key", async () => {
    expect(
      (
        await call(
          "super",
          "GET",
          "/api/po/getpos?page=1&pageSize=10&sortDir=asc",
        )
      ).status,
    ).toBe(200);
    expect(
      (await call("super", "GET", `/api/po/getpodetails/${ref.id}`)).status,
    ).toBe(200);
  });
});

describe("BR-PO-21 who and when on every change", () => {
  test("BR-PO-21 approval moves are in the approval trail with actor and time", async () => {
    const po = await mkDraftPo({ type: "misc" });
    const reqId = dataOf(await json(await submitPo(po.poId))).id as number;
    await act("ap1", reqId, "approve");
    await act("ap2", reqId, "approve");
    const trail = await db
      .select()
      .from(approvalTrails)
      .where(eq(approvalTrails.requestId, reqId))
      .orderBy(asc(approvalTrails.id));
    expect(trail.find((t) => t.action === "submitted")?.actionBy).toBe(
      emp.buyer as number,
    );
    expect(
      trail.filter((t) => t.action === "approved").map((t) => t.actionBy),
    ).toEqual([emp.ap1 as number, emp.ap2 as number]);
    expect(trail.every((t) => t.actionAt instanceof Date)).toBe(true);
  });

  test("BR-PO-21 send / reminder / escalate rows carry who and when", async () => {
    const po = await mkDispatchedPo();
    await call("buyer2", "POST", `/api/po/${po.poId}/reminder`, {
      channel: "phone",
    });
    const rows = await comms(po.poId);
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.type === "reminder")?.sentBy).toBe(
      emp.buyer2 as number,
    );
    expect(rows.find((r) => r.type === "po_sent")?.sentBy).toBe(
      emp.buyer as number,
    );
    expect(rows.every((r) => Boolean(r.sentAt))).toBe(true);
  });

  test("BR-PO-21 cancel by someone else: cancelledBy is that person", async () => {
    const po = await mkDraftPo();
    expect((await cancelPo(po.poId, "wrong supplier", "buyer2")).status).toBe(
      200,
    );
    expect(poOf(await json(await detail(po.poId))).cancelledBy).toBe(
      emp.buyer2 as number,
    );
  });
});

describe("BR-PO-22 row lock, race loser gets 409", () => {
  test("BR-PO-22 send twice at once -> one 200, one 409, one sent row", async () => {
    const po = await mkApprovedPo();
    const rs = await Promise.all([
      send(po.poId),
      send(po.poId, { channel: "phone" }, "buyer2"),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    const sent = (await comms(po.poId)).filter((r) => r.type === "po_sent");
    expect(sent.length).toBe(1);
    expect((await poRow(po.poId)).status).toBe("dispatched");
  });

  test("BR-PO-22 cancel twice at once -> one 200, one 409, PO cancelled once", async () => {
    const po = await mkDraftPo();
    const rs = await Promise.all([
      cancelPo(po.poId, "first reason"),
      cancelPo(po.poId, "second reason", "buyer2"),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await poRow(po.poId)).status).toBe("cancelled");
    expect((await prLine(po.line.a as number)).status).toBe("cancelled");
  });

  test("BR-PO-22 submit twice at once -> one 201, one 409, one open request", async () => {
    const po = await mkDraftPo({ type: "misc" });
    const rs = await Promise.all([submitPo(po.poId), submitPo(po.poId)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const open = (
      await db
        .select()
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.docType, "po"),
            eq(approvalRequests.docId, po.poId),
          ),
        )
    ).filter((r) => r.status === "pending_approval");
    expect(open.length).toBe(1);
  });

  test("BR-PO-22 edit racing send-for-approval: no half-saved state (totals match the lines)", async () => {
    const po = await mkDraftPo({ type: "misc" });
    const [poItemId] = await poItemIdOf(po.line.a as number);
    const rs = await Promise.all([
      edit(po.poId, { updates: [{ id: poItemId, unitPricePaise: 20000 }] }),
      submitPo(po.poId),
    ]);
    expect([rs[0]?.status, rs[1]?.status]).not.toEqual([409, 409]);
    const d = await json(await detail(po.poId));
    const header = poOf(d);
    const subtotal = (itemsOf(d) as Rec[]).reduce(
      (s, i) =>
        s + Math.round((i.qty as number) * (i.unitPricePaise as number)),
      0,
    );
    expect(header.subtotalPaise).toBe(subtotal);
    expect(header.totalAmountPaise).toBe(
      (header.subtotalPaise as number) + (header.taxAmountPaise as number),
    );
  });
});

describe("BR-PO-23 payment terms", () => {
  test("BR-PO-23 no terms typed -> supplier default (S1 = 30 days)", async () => {
    const po = await mkDraftPo();
    expect((await poRow(po.poId)).paymentTermsDays).toBe(30);
  });

  test("BR-PO-23 a different supplier default is copied (S3 = 45)", async () => {
    const po = await mkDraftPo({ supplier: "s3" });
    expect((await poRow(po.poId)).paymentTermsDays).toBe(45);
  });

  test("BR-PO-23 terms typed are used (60) and 0 and 365 are valid", async () => {
    for (const d of [60, 0, 365]) {
      const po = await mkDraftPo({ over: { paymentTermsDays: d } });
      expect((await poRow(po.poId)).paymentTermsDays).toBe(d);
    }
  });

  test.each([400, 366, -1, 30.5])(
    "BR-PO-23 terms %s on create -> 400",
    async (d) => {
      const pr = await mkPr();
      const res = await createPoRaw("buyer", {
        supplierId: sup.s1,
        paymentTermsDays: d,
        lines: [{ prItemId: pr.line.a, unitPricePaise: 10000 }],
      });
      expect(res.status).toBe(400);
      expect((await prLine(pr.line.a as number)).status).toBe("pending");
    },
  );

  test("BR-PO-23 terms 400 on edit -> 400, unchanged; 90 -> saved", async () => {
    const po = await mkDraftPo();
    expect((await edit(po.poId, { paymentTermsDays: 400 })).status).toBe(400);
    expect((await poRow(po.poId)).paymentTermsDays).toBe(30);
    expect((await edit(po.poId, { paymentTermsDays: 90 })).status).toBe(200);
    expect((await poRow(po.poId)).paymentTermsDays).toBe(90);
  });

  test("BR-PO-23 supplier terms changed later do not touch existing POs", async () => {
    const po = await mkDraftPo({ supplier: "s2" });
    const before = (await poRow(po.poId)).paymentTermsDays;
    await db
      .update(supplierMaster)
      .set({ defaultPaymentTermsDays: 45 })
      .where(eq(supplierMaster.id, sup.s2 as number));
    try {
      expect((await poRow(po.poId)).paymentTermsDays).toBe(before);
      expect(before).toBe(30);
    } finally {
      await db
        .update(supplierMaster)
        .set({ defaultPaymentTermsDays: 30 })
        .where(eq(supplierMaster.id, sup.s2 as number));
    }
  });
});

// =====================================================================================
describe("BR-PR-25 a line goes on a PO only if pending on an approved / partial_ordered PR", () => {
  test("BR-PR-25 PR pending_approval -> 400, line stays pending", async () => {
    const pr = await mkPr({ type: "stock_reorder" });
    expect((await prRow(pr.prId)).status).toBe("pending_approval");
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.a, unitPricePaise: 10000 }],
    });
    expect(res.status).toBe(400);
    expect((await prLine(pr.line.a as number)).status).toBe("pending");
  });

  test("BR-PR-25 PR draft -> 400", async () => {
    const pr = await mkPr({ submit: false });
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.a, unitPricePaise: 10000 }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-PR-25 cancelled PR -> 400", async () => {
    const pr = await mkPr();
    const c = await call("buyer", "DELETE", `/api/pr/deletepr/${pr.prId}`, {
      reason: "not needed",
    });
    expect(c.status).toBe(200);
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.a, unitPricePaise: 10000 }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-PR-25 a subcontracting-type PR also goes to a PO", async () => {
    const pr = await mkPr({ type: "subcontracting" });
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.a, unitPricePaise: 10000 }],
    });
    expect(res.status).toBe(201);
  });

  test("BR-PR-25 partial_ordered PR: its remaining pending line can go on a PO", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 10],
        ["b", 3],
      ],
    });
    await mkDraftPo({
      pr: { prId: pr.prId, line: { a: pr.line.a as number } },
    });
    expect((await prRow(pr.prId)).status).toBe("partial_ordered");
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: pr.line.b, unitPricePaise: 1000 }],
    });
    expect(res.status).toBe(201);
    expect((await prRow(pr.prId)).status).toBe("fully_ordered");
  });

  test("BR-PR-25 link row saved with the whole qty, line issuedQty += qty", async () => {
    const pr = await mkPr({ lines: [["a", 12.5]] });
    await mkDraftPo({ pr });
    const l = await prLine(pr.line.a as number);
    expect(l.issuedQty).toBe(12.5);
    const [link] = await db
      .select()
      .from(prPoItemLinks)
      .where(eq(prPoItemLinks.prItemId, pr.line.a as number));
    expect(link?.linkedQty).toBe(12.5);
  });
});

describe("BR-PR-28 the PR module never touches PO rows", () => {
  test("BR-PR-28 cancelling a PR that has a line on a draft PO -> 409 PR_HAS_ORDERED_LINES, PO untouched", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 10],
        ["b", 3],
      ],
    });
    const po = await mkDraftPo({
      pr: { prId: pr.prId, line: { a: pr.line.a as number } },
    });
    const before = await poRow(po.poId);
    const res = await call("buyer", "DELETE", `/api/pr/deletepr/${pr.prId}`, {
      reason: "not needed",
    });
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("PR_HAS_ORDERED_LINES");
    const after = await poRow(po.poId);
    expect(after.status).toBe(before.status);
    expect(after.totalAmountPaise).toBe(before.totalAmountPaise);
    expect((await prLine(pr.line.a as number)).status).toBe("po_draft");
  });
});

describe("BR-PR-30 a line is ordered only when its PO is approved", () => {
  test("BR-PR-30 drafted -> po_draft; approved -> ordered", async () => {
    const po = await mkDraftPo({ type: "misc" });
    expect((await prLine(po.line.a as number)).status).toBe("po_draft");
    const reqId = dataOf(await json(await submitPo(po.poId))).id as number;
    expect((await prLine(po.line.a as number)).status).toBe("po_draft");
    await act("ap1", reqId, "approve");
    await act("ap2", reqId, "approve");
    expect((await prLine(po.line.a as number)).status).toBe("ordered");
  });
});

describe("BR-PR-31 line delete / PO cancel put PR lines back or cancel them", () => {
  test("BR-PR-31 PO cancel drops issuedQty and cancels the PR line for good", async () => {
    const po = await mkApprovedPo();
    expect((await cancelPo(po.poId, "wrong supplier")).status).toBe(200);
    const l = await prLine(po.line.a as number);
    expect(l.status).toBe("cancelled");
    expect(l.issuedQty).toBe(0);
    const again = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: po.line.a, unitPricePaise: 10000 }],
    });
    expect(again.status).toBe(400);
  });
});

describe("BR-PR-33 closed and cancelled lines never change again", () => {
  test("BR-PR-33 a closed line (short-closed PO) can not be put on a PO -> 400", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "partial_received" });
    await setReceived(po.poId, (q) => q * 0.5);
    expect(
      (
        await call("buyer", "POST", `/api/po/${po.poId}/short-close`, {
          reason: "supplier stopped",
        })
      ).status,
    ).toBe(200);
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: po.line.a, unitPricePaise: 10000 }],
    });
    expect(res.status).toBe(400);
    expect((await prLine(po.line.a as number)).status).toBe("closed");
  });

  test("BR-PR-33 an ordered line can not go on a second PO -> 400", async () => {
    const po = await mkApprovedPo();
    const res = await createPoRaw("buyer", {
      supplierId: sup.s1,
      lines: [{ prItemId: po.line.a, unitPricePaise: 10000 }],
    });
    expect(res.status).toBe(400);
    expect((await prLine(po.line.a as number)).status).toBe("ordered");
  });
});

describe("BR-PR-36 PR header follows its lines after PO changes", () => {
  test("BR-PR-36 1 of 3 lines on a PO -> partial_ordered; all 3 -> fully_ordered", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 10],
        ["b", 3],
        ["c", 4],
      ],
    });
    expect((await prRow(pr.prId)).status).toBe("approved");
    await mkDraftPo({
      pr: { prId: pr.prId, line: { a: pr.line.a as number } },
    });
    expect((await prRow(pr.prId)).status).toBe("partial_ordered");
    await mkDraftPo({
      pr: {
        prId: pr.prId,
        line: { b: pr.line.b as number, c: pr.line.c as number },
      },
    });
    expect((await prRow(pr.prId)).status).toBe("fully_ordered");
  });

  test("BR-PR-36 all lines back to pending after the PO line is removed -> approved", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 10],
        ["b", 3],
      ],
    });
    const po = await mkDraftPo({
      pr: {
        prId: pr.prId,
        line: { a: pr.line.a as number, b: pr.line.b as number },
      },
    });
    expect((await prRow(pr.prId)).status).toBe("fully_ordered");
    const [aItem] = await poItemIdOf(pr.line.a as number);
    expect((await edit(po.poId, { deletes: [{ id: aItem }] })).status).toBe(
      200,
    );
    expect((await prRow(pr.prId)).status).toBe("partial_ordered");
  });

  test("BR-PR-36 the only line's PO cancelled -> PR cancelled", async () => {
    const po = await mkDraftPo();
    expect((await cancelPo(po.poId, "not needed")).status).toBe(200);
    expect((await prRow(po.prId)).status).toBe("cancelled");
  });

  test("BR-PR-36 short-closed PO: line closed, header stays fully_ordered", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "partial_received" });
    await setReceived(po.poId, (q) => q * 0.6);
    await call("buyer", "POST", `/api/po/${po.poId}/short-close`, {
      reason: "supplier stopped",
    });
    expect((await prRow(po.prId)).status).toBe("fully_ordered");
  });
});

const cancelLine = (
  prId: number,
  lineId: number,
  reason: unknown = "not needed now",
  tag = "buyer",
) => call(tag, "POST", `/api/pr/${prId}/lines/${lineId}/cancel`, { reason });

describe("BR-PR-33 / BR-PR-46 PR line cancel", () => {
  test("BR-PR-33 a pending line of an approved PR can be cancelled on its own", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 10],
        ["b", 3],
      ],
    });
    const res = await cancelLine(pr.prId, pr.line.a as number);
    expect(res.status).toBe(200);
    expect((await prLine(pr.line.a as number)).status).toBe("cancelled");
    expect((await prLine(pr.line.b as number)).status).toBe("pending");
    expect((await prRow(pr.prId)).status).toBe("approved");
  });

  test("BR-PR-33 an ordered (or po_draft) line -> 409 PR_LINE_ON_LIVE_PO", async () => {
    const draft = await mkDraftPo();
    const r1 = await cancelLine(draft.prId, draft.line.a as number);
    expect(r1.status).toBe(409);
    expect((await json(r1)).code).toBe("PR_LINE_ON_LIVE_PO");
    const ordered = await mkApprovedPo();
    const r2 = await cancelLine(ordered.prId, ordered.line.a as number);
    expect(r2.status).toBe(409);
    expect((await json(r2)).code).toBe("PR_LINE_ON_LIVE_PO");
    expect((await prLine(ordered.line.a as number)).status).toBe("ordered");
  });

  test("BR-PR-33 a cancelled line never changes again -> 409", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 10],
        ["b", 3],
      ],
    });
    expect((await cancelLine(pr.prId, pr.line.a as number)).status).toBe(200);
    expect((await cancelLine(pr.prId, pr.line.a as number)).status).toBe(409);
  });

  test("BR-PR-33 a closed line can not be cancelled -> 409", async () => {
    const po = await mkDispatchedPo();
    await setPo(po.poId, { status: "partial_received" });
    await setReceived(po.poId, (q) => q * 0.5);
    await call("buyer", "POST", `/api/po/${po.poId}/short-close`, {
      reason: "supplier stopped",
    });
    expect((await prLine(po.line.a as number)).status).toBe("closed");
    expect((await cancelLine(po.prId, po.line.a as number)).status).toBe(409);
    expect((await prLine(po.line.a as number)).status).toBe("closed");
  });

  test("BR-PR-33 reason shorter than 3 characters -> 400, line untouched", async () => {
    const pr = await mkPr();
    expect((await cancelLine(pr.prId, pr.line.a as number, "ab")).status).toBe(
      400,
    );
    expect((await prLine(pr.line.a as number)).status).toBe("pending");
  });

  test("BR-PR-46 line cancel stores who, when and the reason", async () => {
    const pr = await mkPr({
      lines: [
        ["a", 10],
        ["b", 3],
      ],
    });
    const before = Date.now() - 5000;
    const res = await cancelLine(pr.prId, pr.line.a as number, "vendor gone");
    expect(res.status).toBe(200);
    const it = (dataOf(await json(res)) as { item: Rec }).item;
    expect(it.cancelledBy).toBe(emp.buyer as number);
    expect(new Date(it.cancelledAt as string).getTime()).toBeGreaterThan(
      before,
    );
    expect(it.cancelReason).toBe("vendor gone");
  });
});

describe("BR-PR-47 PR line cancel and PO cancel at once (no deadlock)", () => {
  for (const mode of ["draft", "approved"] as const) {
    test(`BR-PR-47 cancelling the ${mode} PO while cancelling another line of its PR: both 200, no 500, PR ends cancelled`, async () => {
      for (let round = 0; round < 6; round++) {
        const pr = await mkPr({
          lines: [
            ["a", 10],
            ["b", 3],
          ],
        });
        const onPo = { prId: pr.prId, line: { a: pr.line.a as number } };
        const po =
          mode === "draft"
            ? await mkDraftPo({ pr: onPo })
            : await mkApprovedPo({ pr: onPo });
        const [rPo, rLine] = await Promise.all([
          cancelPo(po.poId, "wrong supplier"),
          cancelLine(pr.prId, pr.line.b as number, "not needed now"),
        ]);
        expect([rPo.status, rLine.status]).toEqual([200, 200]);
        expect((await poRow(po.poId)).status).toBe("cancelled");
        expect((await prLine(pr.line.a as number)).status).toBe("cancelled");
        expect((await prLine(pr.line.b as number)).status).toBe("cancelled");
        expect((await prRow(pr.prId)).status).toBe("cancelled");
      }
    });
  }
});
