/**
 * docs/specs/factory-flows (v1, frozen): spec.md, spec-documents.md, spec-approvals.md
 * BR-FF-04 no access / not found      BR-FF-06 amounts only for key or approval readers
 * BR-FF-50..52 side panel blocks      BR-FF-53 approval read rule       BR-FF-54 history + cap 200
 * BR-FF-55 no PO amounts for GRN      BR-FF-83 / 88 SCO preview         BR-FF-90 sent-back note
 * BR-FF-93 requester read rule        BR-FF-94 approval-path panel limits
 *
 * Routes: GET /api/approval/getDocumentView/:docType/:docId and GET /api/document/getpanel/:docType/:docId
 * (contract: .pipeline/epic-factory-flows/contract.md #3, #4). Fixtures are inserted straight into the DB so the
 * approval state of each document is exact. Written by test-writer from the spec only.
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
  poCommunications,
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../../src/db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const P = "test_ffdoc_";
const RUN = `TEST_ffdoc_${Date.now()}`;
const SUPPLIER_NAME = `${RUN}_Balaji_Metals`;
const SECRET_NOTE = `${RUN} secret supplier message`;
const PRIO = -96102;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

const emp: Record<string, number> = {};
const tokens: Record<string, string> = {};
const roleIds: Record<string, number> = {};
let supplierId = 0;
let policyId = 0;
let itemA = 0;
let itemB = 0;
let serviceId = 0;

const created = {
  pr: [] as number[],
  po: [] as number[],
  grn: [] as number[],
  sco: [] as number[],
  req: [] as number[],
};

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
const view = (tag: string | null, type: string, id: number | string) =>
  get(tag, `/api/approval/getDocumentView/${type}/${id}`);
const panel = (tag: string | null, type: string, id: number | string) =>
  get(tag, `/api/document/getpanel/${type}/${id}`);

type DocType = "pr" | "po" | "sco";
const chain = () => [
  { level: 1, approverType: "specific" as const, employeeId: emp.ap1! },
  { level: 2, approverType: "specific" as const, employeeId: emp.ap2! },
];

async function mkPr(creator: string, status = "pending_approval") {
  const [pr] = await db
    .insert(purchaseRequests)
    .values({
      prNumber: uid(),
      type: "misc",
      requestedBy: emp[creator]!,
      // biome-ignore lint/suspicious/noExplicitAny: enum value from string
      status: status as any,
      notes: `${RUN} requester note`,
      estimatedAmountPaise: 25_100_000,
    })
    .returning({ id: purchaseRequests.id });
  created.pr.push(pr!.id);
  const lines = [] as number[];
  for (const [itemId, qty, uom] of [
    [itemA, 1000, "kg"],
    [itemB, 20, "L"],
  ] as const) {
    const [l] = await db
      .insert(purchaseRequestItems)
      .values({ prId: pr!.id, itemId, requestedQty: qty, uom })
      .returning({ id: purchaseRequestItems.id });
    lines.push(l!.id);
  }
  return { id: pr!.id, lineIds: lines };
}

async function mkPo(creator: string, status = "pending_approval") {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: uid(),
      supplierId,
      // biome-ignore lint/suspicious/noExplicitAny: enum value from string
      status: status as any,
      createdBy: emp[creator]!,
      notes: `${RUN} po note`,
      subtotalPaise: 24_500_000,
      taxAmountPaise: 4_410_000,
      totalAmountPaise: 28_910_000,
    })
    .returning({ id: purchaseOrders.id });
  created.po.push(po!.id);
  const [pi] = await db
    .insert(purchaseOrderItems)
    .values({
      poId: po!.id,
      itemId: itemA,
      qty: 1000,
      receivedQty: 250,
      unitPricePaise: 24_500,
      uom: "kg",
      gstPercent: 18,
      lineValuePaise: 24_500_000,
      lineTaxPaise: 4_410_000,
    })
    .returning({ id: purchaseOrderItems.id });
  return { id: po!.id, itemId: pi!.id };
}

async function mkSco(creator: string, status = "pending_approval") {
  const [s] = await db
    .insert(subcontractingOrders)
    .values({
      scoNumber: uid(),
      vendorId: supplierId,
      // biome-ignore lint/suspicious/noExplicitAny: enum value from string
      status: status as any,
      expectedReturnDate: new Date(Date.now() + 30 * 86400000),
      createdBy: emp[creator]!,
      notes: `${RUN} sco note`,
      subtotalPaise: 250_000,
      taxAmountPaise: 45_000,
      totalAmountPaise: 295_000,
    })
    .returning({ id: subcontractingOrders.id });
  created.sco.push(s!.id);
  await db.insert(subcontractingOrderItems).values({
    scoId: s!.id,
    rawItemId: itemA,
    rawQtyToIssue: 100,
    serviceId,
    serviceDescription: "svc",
    serviceUnitPricePaise: 2500,
    finishedItemId: itemB,
    expectedReturnQty: 100,
  });
  return { id: s!.id };
}

async function mkRequest(
  docType: DocType,
  docId: number,
  requester: string,
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
      totalLevels: 2,
      chainSnapshot: chain(),
      currentApproverEmployeeId: emp.ap1!,
      requestedBy: emp[requester]!,
      ...over,
    })
    .returning({ id: approvalRequests.id });
  created.req.push(r!.id);
  return r!.id;
}

async function mkGrn(creator: string, poId: number, poItemId: number) {
  const [g] = await db
    .insert(grns)
    .values({
      grnNumber: uid(),
      poId,
      supplierId,
      status: "pending_qa",
      createdBy: emp[creator]!,
      challanNo: uid(),
    })
    .returning({ id: grns.id });
  created.grn.push(g!.id);
  await db.insert(grnItems).values({
    grnId: g!.id,
    poItemId,
    receivedQty: 600,
    acceptedQty: 0,
    qaStatus: "pending",
  });
  return g!.id;
}

const moneyKeys = (o: unknown): string[] => {
  const found: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (/paise|price|gst|amount/i.test(k)) found.push(k);
        walk(x);
      }
    }
  };
  walk(o);
  return found;
};

async function cleanup() {
  if (created.req.length) {
    await db
      .delete(approvalTrails)
      .where(inArray(approvalTrails.requestId, created.req));
    await db
      .delete(approvalRequests)
      .where(inArray(approvalRequests.id, created.req));
  }
  if (created.grn.length) {
    await db.delete(grnItems).where(inArray(grnItems.grnId, created.grn));
    await db.delete(grns).where(inArray(grns.id, created.grn));
  }
  if (created.po.length) {
    await db
      .delete(poCommunications)
      .where(inArray(poCommunications.poId, created.po));
    const poItems = await db
      .select({ id: purchaseOrderItems.id })
      .from(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, created.po));
    if (poItems.length) {
      await db.delete(prPoItemLinks).where(
        inArray(
          prPoItemLinks.poItemId,
          poItems.map((i) => i.id),
        ),
      );
    }
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, created.po));
    await db
      .delete(purchaseOrders)
      .where(inArray(purchaseOrders.id, created.po));
  }
  if (created.sco.length) {
    await db
      .delete(subcontractingOrderItems)
      .where(inArray(subcontractingOrderItems.scoId, created.sco));
    await db
      .delete(subcontractingOrders)
      .where(inArray(subcontractingOrders.id, created.sco));
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
  await db.delete(itemMaster).where(like(itemMaster.sku, `${RUN}%`));
  await db.delete(supplierMaster).where(like(supplierMaster.name, `${RUN}%`));
  await db.delete(employees).where(like(employees.email, `${P}%`));
  await db.delete(roles).where(like(roles.name, `${P}%`));
}

beforeAll(async () => {
  await makeRole("holder", ["pr.manage", "po.manage", "grn.view", "sco.view"]);
  await makeRole("none", []);
  await makeRole("grnonly", ["grn.view"]);
  await makeRole("viewall", ["approval.view_all"]);

  await makeUser("holder", "holder");
  for (const t of ["req", "ap1", "ap2", "ap3", "nobody"]) {
    await makeUser(t, "none");
  }
  await makeUser("grnv", "grnonly");
  await makeUser("viewall", "viewall");

  const [s] = await db
    .insert(supplierMaster)
    .values({ name: SUPPLIER_NAME })
    .returning({ id: supplierMaster.id });
  supplierId = s!.id;
  const mkItem = async (uom: string) => {
    const [i] = await db
      .insert(itemMaster)
      .values({
        sku: uid(),
        name: `${RUN} item`,
        category: "Raw Material",
        uom,
      })
      .returning({ id: itemMaster.id });
    return i!.id;
  };
  itemA = await mkItem("kg");
  itemB = await mkItem("L");
  const [svc] = await db
    .insert(serviceMaster)
    .values({ code: `${RUN}_svc`, name: `${RUN}_svc`, defaultUom: "pcs" })
    .returning({ id: serviceMaster.id });
  serviceId = svc!.id;
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
});

afterAll(cleanup);

describe("getDocumentView: validation and key holders", () => {
  test("BR-FF-04 no session -> 401", async () => {
    const pr = await mkPr("holder");
    expect((await view(null, "pr", pr.id)).status).toBe(401);
  });

  test("BR-FF-04 bad docType or docId -> 400", async () => {
    expect((await view("holder", "grn", 1)).status).toBe(400);
    expect((await view("holder", "pr", 0)).status).toBe(400);
    expect((await view("holder", "pr", "abc")).status).toBe(400);
    expect((await view("holder", "pr", 2147483648)).status).toBe(400);
  });

  test("BR-FF-04 a key holder asking for an id that does not exist -> 404 NOT_FOUND", async () => {
    for (const type of ["pr", "po", "sco"]) {
      const r = await view("holder", type, 2147483000);
      expect(r.status).toBe(404);
      expect(r.json.code).toBe("NOT_FOUND");
    }
  });

  test("BR-FF-06 pr.manage holder reads the PR with amounts, requester note, trail and canAct", async () => {
    const pr = await mkPr("req");
    await mkRequest("pr", pr.id, "req");
    const r = await view("holder", "pr", pr.id);
    expect(r.status).toBe(200);
    expect(r.json.data.pr.estimatedAmountPaise).toBe(25_100_000);
    expect(r.json.data.items.length).toBe(2);
    expect(r.json.data.requesterNote).toBe(`${RUN} requester note`);
    expect(Array.isArray(r.json.data.trail)).toBe(true);
    expect(r.json.data.canAct).toBe(false);
  });
});

describe("BR-FF-53 approval read rule (read-via-approval)", () => {
  test("BR-FF-53 approver on the current step reads a PO with rates and totals, and can act", async () => {
    const po = await mkPo("holder");
    await mkRequest("po", po.id, "holder");
    const r = await view("ap1", "po", po.id);
    expect(r.status).toBe(200);
    expect(r.json.data.po.totalAmountPaise).toBe(28_910_000);
    expect(r.json.data.items[0].unitPricePaise).toBe(24_500);
    expect(r.json.data.canAct).toBe(true);
    expect(r.json.data.request).not.toBeNull();
  });

  test("BR-FF-53 a level-2 approver before the request reaches their step -> 403 FORBIDDEN", async () => {
    const po = await mkPo("holder");
    await mkRequest("po", po.id, "holder");
    const r = await view("ap2", "po", po.id);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("FORBIDDEN");
  });

  test("BR-FF-53 a level-1 approver who already approved (own trail row) still reads while level 2 is pending, but cannot act", async () => {
    const po = await mkPo("holder");
    const reqId = await mkRequest("po", po.id, "holder", {
      currentLevel: 2,
      currentApproverEmployeeId: emp.ap2!,
    });
    await db.insert(approvalTrails).values({
      requestId: reqId,
      docType: "po",
      docId: po.id,
      level: 1,
      action: "approved",
      actionBy: emp.ap1!,
      notes: "ok",
    });
    const r = await view("ap1", "po", po.id);
    expect(r.status).toBe(200);
    expect(r.json.data.canAct).toBe(false);
    expect((await view("ap2", "po", po.id)).status).toBe(200);
  });

  test("BR-FF-53 after the final approval the approver gets 403", async () => {
    const po = await mkPo("holder", "approved");
    await mkRequest("po", po.id, "holder", { status: "approved" });
    const r = await view("ap1", "po", po.id);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("FORBIDDEN");
  });

  test("BR-FF-53 an approver of an earlier sent-back request, not on the new request -> 403", async () => {
    const pr = await mkPr("req");
    const oldReq = await mkRequest("pr", pr.id, "req", {
      status: "require_more_info",
      currentApproverEmployeeId: emp.ap3!,
    });
    await db.insert(approvalTrails).values({
      requestId: oldReq,
      docType: "pr",
      docId: pr.id,
      level: 1,
      action: "require_more_info",
      actionBy: emp.ap3!,
      notes: "split it",
    });
    await mkRequest("pr", pr.id, "req"); // new pending request on ap1 / ap2
    expect((await view("ap3", "pr", pr.id)).status).toBe(403);
    expect((await view("ap1", "pr", pr.id)).status).toBe(200);
  });

  test("BR-FF-53 approval.view_all holder is not limited by the pending check", async () => {
    const pr = await mkPr("req", "approved");
    await mkRequest("pr", pr.id, "req", { status: "approved" });
    expect((await view("viewall", "pr", pr.id)).status).toBe(200);
  });

  test("BR-FF-53 a signed-in user with no key and no place in the chain -> 403", async () => {
    const po = await mkPo("holder");
    await mkRequest("po", po.id, "holder");
    expect((await view("nobody", "po", po.id)).status).toBe(403);
  });
});

describe("BR-FF-93 requester without the document key", () => {
  test("BR-FF-93 reads their own PR while its latest request is pending", async () => {
    const pr = await mkPr("req");
    await mkRequest("pr", pr.id, "req");
    expect((await view("req", "pr", pr.id)).status).toBe(200);
  });

  test("BR-FF-93 after the request was sent back, rejected or withdrawn -> 403", async () => {
    for (const status of ["require_more_info", "rejected", "cancelled"]) {
      const pr = await mkPr("req", "draft");
      await mkRequest("pr", pr.id, "req", { status: status as never });
      const r = await view("req", "pr", pr.id);
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("FORBIDDEN");
    }
  });

  test("BR-FF-93 another employee's PR is not readable by a user with no key and no chain place", async () => {
    const pr = await mkPr("req");
    await mkRequest("pr", pr.id, "req");
    expect((await view("nobody", "pr", pr.id)).status).toBe(403);
  });
});

describe("BR-FF-04 access message carries no data and does not reveal existence", () => {
  test("BR-FF-04 403 body is identical for an existing and a non-existing id, and has no document data", async () => {
    const po = await mkPo("holder", "draft");
    const existing = await view("nobody", "po", po.id);
    const missing = await view("nobody", "po", 2147483000);
    expect(existing.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(existing.json).toEqual(missing.json);
    const text = JSON.stringify(existing.json);
    expect(text).not.toContain(SUPPLIER_NAME);
    expect(text).not.toMatch(/24500|28910000|paise/i);
  });

  test("BR-FF-04 panel: 403 body identical for existing and non-existing id", async () => {
    const po = await mkPo("holder", "draft");
    const existing = await panel("nobody", "po", po.id);
    const missing = await panel("nobody", "po", 2147483000);
    expect(existing.status).toBe(403);
    expect(existing.json.code).toBe("FORBIDDEN");
    expect(existing.json).toEqual(missing.json);
  });

  test("BR-FF-04 panel: a key holder asking for an id that does not exist -> 404", async () => {
    const r = await panel("holder", "po", 2147483000);
    expect(r.status).toBe(404);
    expect(r.json.code).toBe("NOT_FOUND");
  });
});

describe("BR-FF-83 / BR-FF-88 job-work order preview", () => {
  test("BR-FF-88 approver without sco.view previews a pending SCO with lines and total incl. GST", async () => {
    const sco = await mkSco("holder");
    await mkRequest("sco", sco.id, "holder");
    const r = await view("ap1", "sco", sco.id);
    expect(r.status).toBe(200);
    expect(r.json.data.sco.totalAmountPaise).toBe(295_000);
    expect(r.json.data.items.length).toBe(1);
    expect(r.json.data.requesterNote).toBe(`${RUN} sco note`);
  });

  test("BR-FF-83 after the SCO is approved the same approver -> 403", async () => {
    const sco = await mkSco("holder", "approved");
    await mkRequest("sco", sco.id, "holder", { status: "approved" });
    expect((await view("ap1", "sco", sco.id)).status).toBe(403);
  });

  test("BR-FF-83 a sco.view holder reads the SCO whatever its approval state", async () => {
    const sco = await mkSco("holder", "approved");
    await mkRequest("sco", sco.id, "holder", { status: "approved" });
    expect((await view("holder", "sco", sco.id)).status).toBe(200);
  });

  test("BR-FF-83 requester without sco.view reads their SCO only while pending", async () => {
    const pending = await mkSco("req");
    await mkRequest("sco", pending.id, "req");
    expect((await view("req", "sco", pending.id)).status).toBe(200);
    const rejected = await mkSco("req", "rejected");
    await mkRequest("sco", rejected.id, "req", { status: "rejected" });
    expect((await view("req", "sco", rejected.id)).status).toBe(403);
  });
});

describe("BR-FF-90 sent-back note", () => {
  test("BR-FF-90 a sent-back draft PR returns the approver's note in its trail, and no open request", async () => {
    const pr = await mkPr("holder", "draft");
    const reqId = await mkRequest("pr", pr.id, "holder", {
      status: "require_more_info",
    });
    await db.insert(approvalTrails).values({
      requestId: reqId,
      docType: "pr",
      docId: pr.id,
      level: 1,
      action: "require_more_info",
      actionBy: emp.ap1!,
      notes: `${RUN} split die lube`,
    });
    const r = await view("holder", "pr", pr.id);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.json.data.trail)).toContain(
      `${RUN} split die lube`,
    );
    expect(r.json.data.request).toBeNull();
  });
});

describe("getpanel: blocks and totals (BR-FF-50, 51, 52)", () => {
  test("BR-FF-50 a PR panel has the four blocks; totals are line count and estimate", async () => {
    const pr = await mkPr("req");
    await mkRequest("pr", pr.id, "req");
    const r = await panel("holder", "pr", pr.id);
    expect(r.status).toBe(200);
    for (const k of ["totals", "approvals", "linked", "history"]) {
      expect(r.json.data).toHaveProperty(k);
    }
    expect(typeof r.json.data.historyTruncated).toBe("boolean");
    expect(r.json.data.totals.lineCount).toBe(2);
    expect(r.json.data.totals.estimatedAmountPaise).toBe(25_100_000);
  });

  test("BR-FF-51 a PO panel has subtotal, GST, total and received % by quantity", async () => {
    const po = await mkPo("holder");
    const r = await panel("holder", "po", po.id);
    expect(r.status).toBe(200);
    expect(r.json.data.totals.subtotalPaise).toBe(24_500_000);
    expect(r.json.data.totals.taxAmountPaise).toBe(4_410_000);
    expect(r.json.data.totals.totalAmountPaise).toBe(28_910_000);
    expect(r.json.data.totals.receivedPct).toBe(25);
  });

  test("BR-FF-51 a GRN panel has arrived / accepted / rejected quantity and unit, never money", async () => {
    const po = await mkPo("holder", "dispatched");
    const grnId = await mkGrn("holder", po.id, po.itemId);
    const r = await panel("grnv", "grn", grnId);
    expect(r.status).toBe(200);
    expect(r.json.data.totals.arrivedQty).toBe(600);
    expect(r.json.data.totals.acceptedQty ?? null).toBeNull();
    expect(r.json.data.totals.rejectedQty ?? null).toBeNull();
    expect(r.json.data.totals.uom).toBe("kg");
    expect(moneyKeys(r.json.data.totals)).toEqual([]);
  });

  test("BR-FF-52 approvals block shows level x of N and the trail; a GRN panel has no approvals block", async () => {
    const pr = await mkPr("req");
    const reqId = await mkRequest("pr", pr.id, "req");
    await db.insert(approvalTrails).values({
      requestId: reqId,
      docType: "pr",
      docId: pr.id,
      level: 1,
      action: "submitted",
      actionBy: emp.req!,
      notes: `${RUN} please approve`,
    });
    const r = await panel("holder", "pr", pr.id);
    expect(r.json.data.approvals.status).toBe("pending_approval");
    expect(r.json.data.approvals.currentLevel).toBe(1);
    expect(r.json.data.approvals.totalLevels).toBe(2);
    expect(JSON.stringify(r.json.data.approvals.trail)).toContain(
      `${RUN} please approve`,
    );
    const po = await mkPo("holder", "dispatched");
    const grnId = await mkGrn("holder", po.id, po.itemId);
    const g = await panel("holder", "grn", grnId);
    expect(g.json.data.approvals).toBeNull();
  });

  test("BR-FF-50 sco is not a panel type -> 400", async () => {
    expect((await panel("holder", "sco", 1)).status).toBe(400);
  });
});

describe("getpanel: linked documents (BR-FF-55, BR-FF-03, BR-FF-06)", () => {
  async function fixture() {
    const pr = await mkPr("holder", "approved");
    const po = await mkPo("holder", "dispatched");
    await db.insert(prPoItemLinks).values({
      prItemId: pr.lineIds[0]!,
      poItemId: po.itemId,
      linkedQty: 1000,
    });
    const grnId = await mkGrn("holder", po.id, po.itemId);
    return { pr, po, grnId };
  }

  test("BR-FF-55 a GRN viewer without po.manage sees the linked PO as text: number and status, canOpen false, no amounts", async () => {
    const { po, grnId } = await fixture();
    const r = await panel("grnv", "grn", grnId);
    expect(r.status).toBe(200);
    const linkedPo = r.json.data.linked.find(
      (l: { docType: string }) => l.docType === "po",
    );
    expect(linkedPo.id).toBe(po.id);
    expect(linkedPo.status).toBe("dispatched");
    expect(linkedPo.canOpen).toBe(false);
    expect(moneyKeys(r.json.data.linked)).toEqual([]);
  });

  test("BR-FF-03 holder of po.manage and pr.manage may open the linked PO and PR", async () => {
    const { pr, po, grnId } = await fixture();
    const r = await panel("holder", "grn", grnId);
    const byType = (t: string) =>
      r.json.data.linked.find((l: { docType: string }) => l.docType === t);
    expect(byType("po").canOpen).toBe(true);
    expect(byType("pr").id).toBe(pr.id);
    expect(po.id).toBe(byType("po").id);
  });

  test("BR-FF-42 a PO panel lists its PR and its GRN with the GRN's QA status", async () => {
    const { pr, po, grnId } = await fixture();
    const r = await panel("holder", "po", po.id);
    const linked = r.json.data.linked as {
      docType: string;
      id: number;
      qaStatus?: string;
    }[];
    expect(linked.some((l) => l.docType === "pr" && l.id === pr.id)).toBe(true);
    const g = linked.find((l) => l.docType === "grn" && l.id === grnId);
    expect(g?.qaStatus).toBe("pending");
  });

  test("BR-FF-06 a GRN viewer without po.manage cannot read the PO panel", async () => {
    const { po } = await fixture();
    expect((await panel("grnv", "po", po.id)).status).toBe(403);
  });

  test("BR-FF-06 a GRN panel needs grn.view even for an approver or approval.view_all holder", async () => {
    const { grnId } = await fixture();
    expect((await panel("ap1", "grn", grnId)).status).toBe(403);
    expect((await panel("viewall", "grn", grnId)).status).toBe(403);
  });
});

describe("getpanel: history (BR-FF-54, BR-FF-94)", () => {
  test("BR-FF-54 history is newest first and contains the created event", async () => {
    const po = await mkPo("holder", "dispatched");
    const now = Date.now();
    await db.insert(poCommunications).values([
      {
        poId: po.id,
        type: "po_sent",
        channel: "email",
        sentBy: emp.holder!,
        sentAt: new Date(now - 3 * 3600_000),
        note: "first",
      },
      {
        poId: po.id,
        type: "reminder",
        channel: "phone",
        sentBy: emp.holder!,
        sentAt: new Date(now - 1 * 3600_000),
        note: "second",
      },
    ]);
    const r = await panel("holder", "po", po.id);
    const hist = r.json.data.history as { at: string }[];
    expect(hist.length).toBeGreaterThanOrEqual(3); // created + sent + reminder
    const times = hist.map((h) => new Date(h.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(r.json.data.historyTruncated).toBe(false);
  });

  test("BR-FF-54 at most the newest 200 events show and historyTruncated is true when older ones exist", async () => {
    const po = await mkPo("holder", "dispatched");
    const base = Date.now() - 400 * 3600_000;
    await db.insert(poCommunications).values(
      Array.from({ length: 230 }, (_, i) => ({
        poId: po.id,
        type: "reminder" as const,
        channel: "phone" as const,
        sentBy: emp.holder!,
        sentAt: new Date(base + i * 60_000),
        note: `n${i}`,
      })),
    );
    const r = await panel("holder", "po", po.id);
    expect(r.json.data.history.length).toBe(200);
    expect(r.json.data.historyTruncated).toBe(true);
  });

  test("BR-FF-94 an approver without po.manage sees supplier-communication events by name but never their note text; a po.manage holder sees the note", async () => {
    const po = await mkPo("holder", "pending_approval");
    await mkRequest("po", po.id, "holder");
    await db.insert(poCommunications).values({
      poId: po.id,
      type: "reminder",
      channel: "email",
      sentBy: emp.holder!,
      note: SECRET_NOTE,
    });
    const viaApproval = await panel("ap1", "po", po.id);
    expect(viaApproval.status).toBe(200);
    const events = viaApproval.json.data.history as { event: string }[];
    expect(events.some((e) => /remind/i.test(e.event))).toBe(true);
    expect(JSON.stringify(viaApproval.json)).not.toContain(SECRET_NOTE);
    const holder = await panel("holder", "po", po.id);
    expect(JSON.stringify(holder.json)).toContain(SECRET_NOTE);
  });

  test("BR-FF-94 an approver reads Totals with amounts, Approvals and Linked documents as text", async () => {
    const po = await mkPo("holder", "pending_approval");
    await mkRequest("po", po.id, "holder");
    const r = await panel("ap1", "po", po.id);
    expect(r.status).toBe(200);
    expect(r.json.data.totals.totalAmountPaise).toBe(28_910_000);
    expect(r.json.data.approvals.status).toBe("pending_approval");
  });

  test("BR-FF-53 panel: the approver loses access once the request is decided", async () => {
    const po = await mkPo("holder", "approved");
    await mkRequest("po", po.id, "holder", { status: "approved" });
    expect((await panel("ap1", "po", po.id)).status).toBe(403);
  });
});
