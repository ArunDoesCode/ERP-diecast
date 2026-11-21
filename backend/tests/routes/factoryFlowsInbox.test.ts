/**
 * docs/specs/factory-flows/spec-approvals.md (v1, frozen) + approval.md BR-APR-52 (CR v3)
 * BR-FF-77 amount only on the caller's own list   BR-FF-79 type counts add up to All
 * BR-FF-80 inbox columns, oldest first            BR-FF-89 other employee's list keeps working
 *
 * Route: GET /api/approval/getMyPendingApprovals. Every request is routed to a specific fixture
 * approver, so that approver's inbox is asserted absolutely. Written by test-writer from the spec only.
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
const P = "test_ffinbox_";
const RUN = `TEST_ffinbox_${Date.now()}`;
const PRIO = -96103;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

const emp: Record<string, number> = {};
const tokens: Record<string, string> = {};
const roleIds: Record<string, number> = {};
let supplierId = 0;
let policyId = 0;
let itemId = 0;
let serviceId = 0;
const created = {
  pr: [] as number[],
  po: [] as number[],
  sco: [] as number[],
  req: [] as number[],
};

// biome-ignore lint/suspicious/noExplicitAny: row shape asserted field by field
type Row = any;

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
async function makeUser(tag: string, role: string, name = `${RUN}_${tag}`) {
  const [e] = await db
    .insert(employees)
    .values({
      name,
      email: `${P}${tag}@diecast.test`,
      roleId: roleIds[role]!,
      isActive: true,
    })
    .returning({ id: employees.id });
  emp[tag] = e!.id;
  tokens[tag] = await signAccessToken({
    userId: e!.id,
    userName: name,
    role: `${P}${role}`,
    allowedPages: [],
  });
}

async function inbox(tag: string, query = "") {
  const res = await app.request(
    `/api/approval/getMyPendingApprovals?page=1&pageSize=100&sortDir=asc${query ? `&${query}` : ""}`,
    { headers: { Authorization: `Bearer ${tokens[tag]}` } },
  );
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

async function addRequest(
  docType: "pr" | "po" | "sco",
  docId: number,
  approver: string,
  requestedAt: Date,
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
      chainSnapshot: [
        {
          level: 1,
          approverType: "specific",
          employeeId: emp[approver]!,
        },
      ],
      currentApproverEmployeeId: emp[approver]!,
      requestedBy: emp.requester!,
      requestedAt,
    })
    .returning({ id: approvalRequests.id });
  created.req.push(r!.id);
}

async function addPr(approver: string, requestedAt: Date) {
  const [pr] = await db
    .insert(purchaseRequests)
    .values({
      prNumber: uid(),
      type: "misc",
      requestedBy: emp.requester!,
      status: "pending_approval",
      estimatedAmountPaise: 25_100_000,
    })
    .returning({ id: purchaseRequests.id, n: purchaseRequests.prNumber });
  created.pr.push(pr!.id);
  await db
    .insert(purchaseRequestItems)
    .values({ prId: pr!.id, itemId, requestedQty: 1, uom: "kg" });
  await addRequest("pr", pr!.id, approver, requestedAt);
  return { id: pr!.id, number: pr!.n };
}

async function addPo(approver: string, requestedAt: Date) {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: uid(),
      supplierId,
      status: "pending_approval",
      createdBy: emp.requester!,
      subtotalPaise: 24_500_000,
      taxAmountPaise: 4_410_000,
      totalAmountPaise: 28_910_000,
    })
    .returning({ id: purchaseOrders.id, n: purchaseOrders.poNumber });
  created.po.push(po!.id);
  await db.insert(purchaseOrderItems).values({
    poId: po!.id,
    itemId,
    qty: 1,
    unitPricePaise: 100,
    uom: "kg",
  });
  await addRequest("po", po!.id, approver, requestedAt);
  return { id: po!.id, number: po!.n };
}

async function addSco(approver: string, requestedAt: Date) {
  const [s] = await db
    .insert(subcontractingOrders)
    .values({
      scoNumber: uid(),
      vendorId: supplierId,
      status: "pending_approval",
      expectedReturnDate: new Date(Date.now() + 30 * 86400000),
      createdBy: emp.requester!,
      totalAmountPaise: 295_000,
    })
    .returning({
      id: subcontractingOrders.id,
      n: subcontractingOrders.scoNumber,
    });
  created.sco.push(s!.id);
  await db.insert(subcontractingOrderItems).values({
    scoId: s!.id,
    rawItemId: itemId,
    rawQtyToIssue: 1,
    serviceId,
    serviceDescription: "svc",
    serviceUnitPricePaise: 100,
    finishedItemId: itemId,
    expectedReturnQty: 1,
  });
  await addRequest("sco", s!.id, approver, requestedAt);
  return { id: s!.id, number: s!.n };
}

async function cleanup() {
  if (created.req.length) {
    await db
      .delete(approvalRequests)
      .where(inArray(approvalRequests.id, created.req));
  }
  if (created.po.length) {
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

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const REQUESTER_NAME = `${RUN}_Store Keeper S`;

let prNew: { id: number; number: string };
let prOld: { id: number; number: string };
let po1: { id: number; number: string };
let sco1: { id: number; number: string };

beforeAll(async () => {
  await makeRole("plain", []);
  await makeRole("others", ["approval.view_others_pending"]);
  await makeUser("requester", "plain", REQUESTER_NAME);
  await makeUser("appr", "plain");
  await makeUser("other", "plain");
  await makeUser("viewer", "others");

  const [s] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_sup` })
    .returning({ id: supplierMaster.id });
  supplierId = s!.id;
  const [it] = await db
    .insert(itemMaster)
    .values({
      sku: uid(),
      name: `${RUN} item`,
      category: "Raw Material",
      uom: "kg",
    })
    .returning({ id: itemMaster.id });
  itemId = it!.id;
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

  // appr's inbox: 2 requisitions, 1 order, 1 job-work order; the PR "old" is the oldest request.
  prNew = await addPr("appr", hoursAgo(5));
  prOld = await addPr("appr", hoursAgo(50));
  po1 = await addPo("appr", hoursAgo(20));
  sco1 = await addSco("appr", hoursAgo(10));
  await addPr("other", hoursAgo(1)); // someone else's
});

afterAll(cleanup);

describe("BR-FF-80 inbox columns and order", () => {
  test("BR-FF-80 each row has document number, type, requester name, level x of N; rows are oldest first", async () => {
    const r = await inbox("appr");
    expect(r.status).toBe(200);
    const rows = r.json.data as Row[];
    expect(rows.length).toBe(4);
    expect(rows.map((x) => x.docId)).toEqual([
      prOld.id,
      po1.id,
      sco1.id,
      prNew.id,
    ]);
    const old = rows[0];
    expect(old.docType).toBe("pr");
    expect(old.docNumber).toBe(prOld.number);
    expect(old.requesterName).toBe(REQUESTER_NAME);
    expect(old.currentLevel).toBe(1);
    expect(old.totalLevels).toBe(1);
    expect(rows[1].docNumber).toBe(po1.number);
    expect(rows[2].docNumber).toBe(sco1.number);
  });

  test("BR-FF-80 pageSize 100 is accepted and a request on someone else's step is not listed", async () => {
    const r = await inbox("appr");
    expect(r.json.meta.total).toBe(4);
  });
});

describe("BR-FF-77 amounts only on the caller's own list", () => {
  test("BR-FF-77 on my own list the amount shows for requisition, order and job-work order", async () => {
    const rows = (await inbox("appr")).json.data as Row[];
    const by = (id: number, type: string) =>
      rows.find((x) => x.docId === id && x.docType === type);
    expect(by(prOld.id, "pr").amountPaise).toBe(25_100_000);
    expect(by(po1.id, "po").amountPaise).toBe(28_910_000);
    expect(by(sco1.id, "sco").amountPaise).toBe(295_000);
  });

  test("BR-FF-77 an explicit employeeId equal to the caller still shows amounts", async () => {
    const rows = (await inbox("appr", `employeeId=${emp.appr}`)).json
      .data as Row[];
    expect(rows[0].amountPaise).toBeGreaterThan(0);
  });

  test("BR-FF-77 / BR-FF-89 viewing another employee's list: rows come back but no amount is sent", async () => {
    const r = await inbox("viewer", `employeeId=${emp.appr}`);
    expect(r.status).toBe(200);
    const rows = r.json.data as Row[];
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.amountPaise ?? null).toBeNull();
      expect("amountPaise" in row && row.amountPaise !== undefined).toBe(false);
    }
    expect(rows[0].docNumber).toBe(prOld.number);
    expect(JSON.stringify(r.json)).not.toMatch(/25100000|28910000|295000/);
  });

  test("BR-FF-89 without approval.view_others_pending another employee's list stays 403", async () => {
    const r = await inbox("other", `employeeId=${emp.appr}`);
    expect(r.status).toBe(403);
  });
});

describe("BR-FF-79 quick-filter counts", () => {
  test("BR-FF-79 meta.typeCounts counts requisitions, orders and job-work orders; All is their sum", async () => {
    const r = await inbox("appr");
    expect(r.json.meta.typeCounts).toEqual({ pr: 2, po: 1, sco: 1 });
    const c = r.json.meta.typeCounts;
    expect(c.pr + c.po + c.sco).toBe(r.json.meta.total);
  });

  test("BR-FF-79 filtering by docType returns exactly the counted rows, and the counts do not shrink", async () => {
    for (const [type, n] of [
      ["pr", 2],
      ["po", 1],
      ["sco", 1],
    ] as const) {
      const r = await inbox("appr", `docType=${type}`);
      expect(r.json.data.length).toBe(n);
      expect(r.json.meta.total).toBe(n);
      expect((r.json.data as Row[]).every((x) => x.docType === type)).toBe(
        true,
      );
      expect(r.json.meta.typeCounts).toEqual({ pr: 2, po: 1, sco: 1 });
    }
  });

  test("BR-FF-79 an empty inbox has zero counts", async () => {
    const r = await inbox("viewer");
    expect(r.json.data).toEqual([]);
    expect(r.json.meta.typeCounts).toEqual({ pr: 0, po: 0, sco: 0 });
  });
});
