/**
 * docs/specs/purchase-requisition.md (v1)
 * BR-PR-01 create (draft, requester, number, one transaction)   BR-PR-02 header checks
 * BR-PR-06 item master lines (uom copied, one line per item)      BR-PR-08 qty and required-by date
 * BR-PR-11 estimate (paise, recomputed, frozen after submit)      BR-PR-14 standard rate (see gap below)
 * BR-PR-15 edit only in draft                                     BR-PR-17 requester or super-admin
 * BR-PR-19 submit                                                 BR-PR-21 approval outcomes
 * BR-PR-45 login + pr.manage                                      BR-PR-46 who/when readable
 * BR-PR-47 row lock on edit / submit
 *
 * HTTP-level through createApp(), real DB, real logins. Written by test-writer from the spec only.
 * Known gaps (not tested):
 *  - BR-PR-14: item master has no standard-rate column yet, so the fixture cannot be built; report.
 *  - BR-PR-46 "PO-driven change": PO module owns it, not in this slice.
 *  - BR-PR-17 "cancel one line": no line-cancel endpoint in the contract.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import {
  documentNumberCounters,
  rolePermissions,
  roles,
} from "../db/schemas/01_auth";
import {
  approvalPolicies,
  approvalRequests,
  approvalTrails,
} from "../db/schemas/02_procurement-approval";
import { itemMaster, machines } from "../db/schemas/02_procurement-catalog";
import {
  purchaseRequestItems,
  purchaseRequests,
} from "../db/schemas/02_procurement-purchasing";
import { employees } from "../db/schemas/03_hcm";
import { authService } from "../service/authService";

const app = createApp();
const PREFIX = "test_prlife_";
const PASSWORD = "prlife-password-123";
const PRIORITY_TWO_LEVEL = -90301;
const PRIORITY_AUTO = -90302;

const emp = {} as Record<string, number>;
const token = {} as Record<string, string>;
const item = {} as Record<string, number>;
let machineId: number;

async function makeRole(name: string, keys: string[]) {
  const [r] = await db
    .insert(roles)
    .values({ name: `${PREFIX}${name}`, isSystem: false })
    .returning({ id: roles.id });
  if (!r) throw new Error("Fixture setup: role insert failed");
  if (keys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(keys.map((permissionKey) => ({ roleId: r.id, permissionKey })));
  }
  return r.id;
}

async function makeUser(tag: string, roleId: number) {
  const email = `${PREFIX}${tag}@diecast.test`;
  const [e] = await db
    .insert(employees)
    .values({
      name: `TEST_prlife_${tag}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId,
      isActive: true,
    })
    .returning({ id: employees.id });
  if (!e) throw new Error("Fixture setup: employee insert failed");
  emp[tag] = e.id;
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

type Json = Record<string, unknown> & { data?: Record<string, unknown> };
const json = async (res: Response): Promise<Json> => (await res.json()) as Json;
const prOf = (body: Json) =>
  (body.data as { pr: Record<string, unknown> }).pr as Record<string, unknown>;

type Line = { itemId: number; requestedQty: number; [k: string]: unknown };
const line = (key: string, qty: number, extra: object = {}): Line => ({
  itemId: item[key] as number,
  requestedQty: qty,
  ...extra,
});

function create(tag: string, over: Record<string, unknown> = {}) {
  return call(tag, "POST", "/api/pr/createpr", {
    type: "misc",
    notes: "TEST_prlife note",
    items: [line("a", 1)],
    ...over,
  });
}

async function createOk(
  tag: string,
  over: Record<string, unknown> = {},
): Promise<number> {
  const res = await create(tag, over);
  if (res.status !== 201)
    throw new Error(`Fixture setup: create -> ${res.status}`);
  return prOf(await json(res)).id as number;
}

const edit = (tag: string, prId: number, body: Record<string, unknown>) =>
  call(tag, "PATCH", "/api/pr/updatepr", {
    prId,
    inserts: [],
    updates: [],
    deletes: [],
    ...body,
  });

const submit = (tag: string, prId: number) =>
  call(tag, "POST", "/api/approval/submitRequest", {
    docType: "pr",
    docId: prId,
  });

const act = (
  tag: string,
  requestId: number,
  action: "approve" | "reject" | "sent_back" | "cancel",
) =>
  call(tag, "POST", `/api/approval/actOnRequest/${requestId}`, {
    action,
    notes: "TEST_prlife note",
  });

async function prRow(prId: number) {
  const [r] = await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, prId));
  return r;
}
const lineRows = (prId: number) =>
  db
    .select()
    .from(purchaseRequestItems)
    .where(eq(purchaseRequestItems.prId, prId))
    .orderBy(purchaseRequestItems.id);

async function submitOk(tag: string, prId: number): Promise<number> {
  const res = await submit(tag, prId);
  if (res.status !== 201)
    throw new Error(`Fixture setup: submit -> ${res.status}`);
  return (await json(res)).data?.id as number;
}

async function setAvgCost(key: string, paise: number) {
  await db
    .update(itemMaster)
    .set({ averageCostPaise: paise })
    .where(eq(itemMaster.id, item[key] as number));
}

async function cleanup() {
  const ids = (
    await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.email, `${PREFIX}%`))
  ).map((e) => e.id);
  if (ids.length > 0) {
    const prIds = (
      await db
        .select({ id: purchaseRequests.id })
        .from(purchaseRequests)
        .where(inArray(purchaseRequests.requestedBy, ids))
    ).map((p) => p.id);
    if (prIds.length > 0) {
      const reqIds = (
        await db
          .select({ id: approvalRequests.id })
          .from(approvalRequests)
          .where(inArray(approvalRequests.docId, prIds))
      ).map((r) => r.id);
      if (reqIds.length > 0) {
        await db
          .delete(approvalTrails)
          .where(inArray(approvalTrails.requestId, reqIds));
        await db
          .delete(approvalRequests)
          .where(inArray(approvalRequests.id, reqIds));
      }
      await db
        .delete(purchaseRequestItems)
        .where(inArray(purchaseRequestItems.prId, prIds));
      await db
        .delete(purchaseRequests)
        .where(inArray(purchaseRequests.id, prIds));
    }
    await db
      .delete(documentNumberCounters)
      .where(inArray(documentNumberCounters.createdBy, ids));
  }
  await db
    .delete(approvalPolicies)
    .where(
      inArray(approvalPolicies.priority, [PRIORITY_TWO_LEVEL, PRIORITY_AUTO]),
    );
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
  await db.delete(machines).where(like(machines.name, "TEST_prlife_%"));
  await db.delete(itemMaster).where(like(itemMaster.sku, "TEST_PRLIFE_%"));
}

beforeAll(async () => {
  await cleanup();
  const mk = async (
    key: string,
    uom: string,
    cost: number,
    isActive = true,
  ) => {
    const [it] = await db
      .insert(itemMaster)
      .values({
        sku: `TEST_PRLIFE_${key.toUpperCase()}`,
        name: `TEST_prlife item ${key}`,
        category: "Consumable",
        uom,
        averageCostPaise: cost,
        isActive,
      })
      .returning({ id: itemMaster.id });
    if (!it) throw new Error("Fixture setup: item failed");
    item[key] = it.id;
  };
  await mk("a", "kg", 25000);
  await mk("b", "pcs", 1050);
  await mk("c", "kg", 1000);
  await mk("inactive", "pcs", 100, false);

  const [m] = await db
    .insert(machines)
    .values({ name: "TEST_prlife_machine" })
    .returning({ id: machines.id });
  if (!m) throw new Error("Fixture setup: machine failed");
  machineId = m.id;

  const managerRole = await makeRole("manager", ["pr.manage"]);
  await makeUser("a", managerRole);
  await makeUser("b", managerRole);
  await makeUser("nokeys", await makeRole("nokeys", []));
  await makeUser("ap1", await makeRole("ap1", []));
  await makeUser("ap2", await makeRole("ap2", []));
  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"))
    .limit(1);
  if (!sa) throw new Error("Fixture setup: super-admin role missing");
  await makeUser("super", sa.id);

  // misc PRs: two levels (ap1 then ap2). tooling PRs: auto-approve.
  await db.insert(approvalPolicies).values([
    {
      name: "TEST_prlife_two_level",
      isActive: true,
      priority: PRIORITY_TWO_LEVEL,
      docType: "pr",
      subDocType: "misc",
      autoApprove: false,
      approvalLevels: 2,
      approvalChain: [
        { level: 1, approverType: "specific", employeeId: emp.ap1 as number },
        { level: 2, approverType: "specific", employeeId: emp.ap2 as number },
      ],
      createdBy: emp.a as number,
      lastUpdatedBy: emp.a as number,
    },
    {
      name: "TEST_prlife_auto",
      isActive: true,
      priority: PRIORITY_AUTO,
      docType: "pr",
      subDocType: "tooling",
      autoApprove: true,
      approvalLevels: 1,
      approvalChain: [
        { level: 1, approverType: "specific", employeeId: emp.ap1 as number },
      ],
      createdBy: emp.a as number,
      lastUpdatedBy: emp.a as number,
    },
  ]);
});

afterAll(cleanup);

describe("BR-PR-01 create", () => {
  test("BR-PR-01 saves draft with requester, PR- number, all lines", async () => {
    const res = await create("a", { items: [line("a", 2), line("b", 3)] });
    expect(res.status).toBe(201);
    const pr = prOf(await json(res));
    expect(pr.status).toBe("draft");
    expect(pr.requestedBy).toBe(emp.a as number);
    expect(String(pr.prNumber)).toMatch(/^PR-.+-\d+$/);
    expect((await lineRows(pr.id as number)).length).toBe(2);
  });

  test("BR-PR-01 two creates at once get different numbers", async () => {
    const [r1, r2] = await Promise.all([create("a"), create("b")]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect(prOf(await json(r1)).prNumber).not.toBe(
      prOf(await json(r2)).prNumber,
    );
  });

  test("BR-PR-01 line 2 has a bad item -> 400, no PR row saved", async () => {
    const before = await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.requestedBy, emp.a as number));
    const res = await create("a", {
      items: [line("a", 1), { itemId: 999999999, requestedQty: 1 }],
    });
    expect(res.status).toBe(400);
    const after = await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.requestedBy, emp.a as number));
    expect(after.length).toBe(before.length);
  });
});

describe("BR-PR-02 header checks", () => {
  test("BR-PR-02 type is required", async () => {
    const res = await call("a", "POST", "/api/pr/createpr", {
      notes: "x note",
      items: [line("a", 1)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-PR-02 maintenance without assetId -> 400", async () => {
    expect((await create("a", { type: "maintenance" })).status).toBe(400);
  });

  test("BR-PR-02 unknown assetId -> 400 Invalid assetId", async () => {
    const res = await create("super", { type: "tooling", assetId: 999999 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await json(res))).toContain("Invalid assetId");
  });

  test("BR-PR-02 maintenance with a real asset is accepted", async () => {
    const res = await create("super", {
      type: "maintenance",
      assetId: machineId,
    });
    expect(res.status).toBe(201);
    expect(prOf(await json(res)).assetId).toBe(machineId);
  });

  test("BR-PR-02 empty notes -> 400", async () => {
    expect((await create("a", { notes: "" })).status).toBe(400);
  });

  test("BR-PR-02 saleOrderId is stored as sent, unchecked", async () => {
    const res = await create("a", { type: "sale_order", saleOrderId: 42 });
    expect(res.status).toBe(201);
    expect(prOf(await json(res)).saleOrderId).toBe(42);
  });

  test("BR-PR-02 editing a draft to maintenance without an asset -> 400", async () => {
    const prId = await createOk("a");
    const res = await edit("a", prId, { type: "maintenance" });
    expect(res.status).toBe(400);
    expect((await prRow(prId))?.type).toBe("misc");
  });
});

describe("BR-PR-06 lines use active item-master items", () => {
  test("BR-PR-06 item not in master -> 400 PR_INVALID_ITEM", async () => {
    const res = await create("a", {
      items: [{ itemId: 999999999, requestedQty: 1 }],
    });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("PR_INVALID_ITEM");
  });

  test("BR-PR-06 inactive item -> 400 PR_INVALID_ITEM", async () => {
    const res = await create("a", { items: [line("inactive", 1)] });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("PR_INVALID_ITEM");
  });

  test("BR-PR-06 client uom is ignored, item master uom is saved", async () => {
    const res = await create("a", { items: [line("a", 1, { uom: "pcs" })] });
    expect(res.status).toBe(201);
    const prId = prOf(await json(res)).id as number;
    expect((await lineRows(prId))[0]?.uom).toBe("kg");
  });

  test("BR-PR-06 same item twice on create -> 400 PR_DUPLICATE_ITEM", async () => {
    const res = await create("a", { items: [line("a", 1), line("a", 2)] });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("PR_DUPLICATE_ITEM");
  });

  test("BR-PR-06 inserting an item already on the PR -> 400 PR_DUPLICATE_ITEM", async () => {
    const prId = await createOk("a");
    const res = await edit("a", prId, { inserts: [line("a", 4)] });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("PR_DUPLICATE_ITEM");
    expect((await lineRows(prId)).length).toBe(1);
  });

  test("BR-PR-06 changing a line to an item already on the PR -> 400 PR_DUPLICATE_ITEM", async () => {
    const prId = await createOk("a", { items: [line("a", 1), line("b", 1)] });
    const second = (await lineRows(prId))[1];
    const res = await edit("a", prId, {
      updates: [{ id: second?.id, itemId: item.a, requestedQty: 1 }],
    });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("PR_DUPLICATE_ITEM");
  });
});

describe("BR-PR-08 quantity and required-by date", () => {
  test.each([
    ["zero", 0],
    ["negative", -5],
    ["4 decimals", 1.2345],
  ])("BR-PR-08 qty %s -> 400", async (_n, qty) => {
    expect((await create("a", { items: [line("a", qty)] })).status).toBe(400);
  });

  test("BR-PR-08 decimal qty 12.5 and 2.5 are accepted and stored as sent", async () => {
    const res = await create("a", { items: [line("a", 12.5), line("c", 2.5)] });
    expect(res.status).toBe(201);
    const rows = await lineRows(prOf(await json(res)).id as number);
    expect(rows.map((r) => r.requestedQty)).toEqual([12.5, 2.5]);
  });

  test("BR-PR-08 3-decimal qty 0.125 is accepted", async () => {
    expect((await create("a", { items: [line("a", 0.125)] })).status).toBe(201);
  });

  test("BR-PR-08 decimal qty on edit: 4 decimals -> 400", async () => {
    const prId = await createOk("a");
    const l = (await lineRows(prId))[0];
    const res = await edit("a", prId, {
      updates: [{ id: l?.id, itemId: item.a, requestedQty: 1.2345 }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-PR-08 required-by date yesterday -> 400", async () => {
    const y = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const res = await create("a", {
      items: [line("a", 1, { expectedDate: y })],
    });
    expect(res.status).toBe(400);
  });

  test("BR-PR-08 required-by date in the future is accepted", async () => {
    const f = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const res = await create("a", {
      items: [line("a", 1, { expectedDate: f })],
    });
    expect(res.status).toBe(201);
  });
});

describe("BR-PR-11 estimate", () => {
  test("BR-PR-11 sum of qty x average cost, integer paise (25000x10 + 1050x3 = 253150)", async () => {
    const res = await create("a", { items: [line("a", 10), line("b", 3)] });
    expect(prOf(await json(res)).estimatedAmountPaise).toBe(253150);
  });

  test("BR-PR-11 rounds the total to integer paise (0.333 x 1050 -> 350)", async () => {
    const res = await create("a", { items: [line("b", 0.333)] });
    expect(prOf(await json(res)).estimatedAmountPaise).toBe(350);
  });

  test("BR-PR-11 recomputed on line change (qty 3 -> 4 gives 254200)", async () => {
    const prId = await createOk("a", { items: [line("a", 10), line("b", 3)] });
    const bLine = (await lineRows(prId))[1];
    const res = await edit("a", prId, {
      updates: [{ id: bLine?.id, itemId: item.b, requestedQty: 4 }],
    });
    expect(res.status).toBe(200);
    expect((await prRow(prId))?.estimatedAmountPaise).toBe(254200);
  });

  test("BR-PR-11 recomputed again at submit, using the cost at that moment", async () => {
    await setAvgCost("c", 1000);
    const prId = await createOk("a", { items: [line("c", 10)] });
    expect((await prRow(prId))?.estimatedAmountPaise).toBe(10000);
    await setAvgCost("c", 2000);
    try {
      await submitOk("a", prId);
      expect((await prRow(prId))?.estimatedAmountPaise).toBe(20000);
    } finally {
      await setAvgCost("c", 1000);
    }
  });

  test("BR-PR-11 after submit the estimate never changes when cost rises", async () => {
    await setAvgCost("c", 1000);
    const prId = await createOk("a", { items: [line("c", 10)] });
    await submitOk("a", prId);
    await setAvgCost("c", 5000);
    try {
      const res = await call("b", "GET", `/api/pr/getprdetails/${prId}`);
      expect(prOf(await json(res)).estimatedAmountPaise).toBe(10000);
      expect((await prRow(prId))?.estimatedAmountPaise).toBe(10000);
    } finally {
      await setAvgCost("c", 1000);
    }
  });
});

describe("BR-PR-15 edit only in draft", () => {
  test("BR-PR-15 edit on a pending_approval PR -> 409 PR_NOT_EDITABLE", async () => {
    const prId = await createOk("a");
    await submitOk("a", prId);
    const res = await edit("a", prId, { notes: "changed" });
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("PR_NOT_EDITABLE");
    expect((await prRow(prId))?.notes).toBe("TEST_prlife note");
  });

  test("BR-PR-15 header edit on a draft works", async () => {
    const prId = await createOk("a");
    const res = await edit("a", prId, { notes: "new purpose" });
    expect(res.status).toBe(200);
    expect((await prRow(prId))?.notes).toBe("new purpose");
  });

  test("BR-PR-15 PATCH with status -> 400 PR_STATUS_VIA_ACTION", async () => {
    const prId = await createOk("a");
    const res = await edit("a", prId, { status: "approved" });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("PR_STATUS_VIA_ACTION");
    expect((await prRow(prId))?.status).toBe("draft");
  });

  test("BR-PR-15 deleting the only line -> 400 PR_MIN_ONE_LINE", async () => {
    const prId = await createOk("a");
    const l = (await lineRows(prId))[0];
    const res = await edit("a", prId, { deletes: [{ id: l?.id }] });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("PR_MIN_ONE_LINE");
    expect((await lineRows(prId)).length).toBe(1);
  });

  test("BR-PR-15 deleting one of two lines works", async () => {
    const prId = await createOk("a", { items: [line("a", 1), line("b", 1)] });
    const l = (await lineRows(prId))[0];
    const res = await edit("a", prId, { deletes: [{ id: l?.id }] });
    expect(res.status).toBe(200);
    expect((await lineRows(prId)).length).toBe(1);
  });
});

describe("BR-PR-17 view is open, edit is requester or super-admin", () => {
  test("BR-PR-17 another pr.manage holder can view", async () => {
    const prId = await createOk("a");
    const res = await call("b", "GET", `/api/pr/getprdetails/${prId}`);
    expect(res.status).toBe(200);
  });

  test("BR-PR-17 another pr.manage holder cannot edit -> 403 PR_NOT_REQUESTER", async () => {
    const prId = await createOk("a");
    const res = await edit("b", prId, { notes: "hijack" });
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe("PR_NOT_REQUESTER");
    expect((await prRow(prId))?.notes).toBe("TEST_prlife note");
  });

  test("BR-PR-17 super-admin can edit someone else's draft", async () => {
    const prId = await createOk("a");
    const res = await edit("super", prId, { notes: "admin fix" });
    expect(res.status).toBe(200);
    expect((await prRow(prId))?.notes).toBe("admin fix");
  });

  test("BR-PR-17 another pr.manage holder cannot submit -> 403, PR stays draft", async () => {
    const prId = await createOk("a");
    const res = await submit("b", prId);
    expect(res.status).toBe(403);
    expect((await prRow(prId))?.status).toBe("draft");
  });
});

describe("BR-PR-19 submit", () => {
  test("BR-PR-19 two-level policy -> pending_approval, level 1 of 2", async () => {
    const prId = await createOk("a");
    const res = await submit("a", prId);
    expect(res.status).toBe(201);
    const row = await prRow(prId);
    expect(row?.status).toBe("pending_approval");
    expect(row?.currentApprovalLevel).toBe(1);
    expect(row?.totalApprovalLevels).toBe(2);
  });

  test("BR-PR-19 auto-approve policy -> approved, approvedBy stays empty", async () => {
    const prId = await createOk("a", { type: "tooling" });
    const res = await submit("a", prId);
    expect(res.status).toBe(201);
    const row = await prRow(prId);
    expect(row?.status).toBe("approved");
    expect(row?.approvedBy ?? null).toBeNull();
  });

  test("BR-PR-19 second submit while a request is open -> 409 APPROVAL_ALREADY_OPEN", async () => {
    const prId = await createOk("a");
    await submitOk("a", prId);
    const res = await submit("a", prId);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("APPROVAL_ALREADY_OPEN");
  });

  test("BR-PR-19 submitting an approved PR -> 409", async () => {
    const prId = await createOk("a", { type: "tooling" });
    await submitOk("a", prId);
    expect((await submit("a", prId)).status).toBe(409);
    expect((await prRow(prId))?.status).toBe("approved");
  });
});

describe("BR-PR-21 approval outcomes", () => {
  test("BR-PR-21 middle level approves -> still pending, level copied to PR", async () => {
    const prId = await createOk("a");
    const reqId = await submitOk("a", prId);
    expect((await act("ap1", reqId, "approve")).status).toBe(200);
    const row = await prRow(prId);
    expect(row?.status).toBe("pending_approval");
    expect(row?.currentApprovalLevel).toBe(2);
  });

  test("BR-PR-21 last level approves -> approved, approvedBy = that approver", async () => {
    const prId = await createOk("a");
    const reqId = await submitOk("a", prId);
    await act("ap1", reqId, "approve");
    expect((await act("ap2", reqId, "approve")).status).toBe(200);
    const row = await prRow(prId);
    expect(row?.status).toBe("approved");
    expect(row?.approvedBy).toBe(emp.ap2 as number);
  });

  test("BR-PR-21 reject -> rejected (final): edit and submit both 409", async () => {
    const prId = await createOk("a");
    const reqId = await submitOk("a", prId);
    expect((await act("ap1", reqId, "reject")).status).toBe(200);
    expect((await prRow(prId))?.status).toBe("rejected");
    expect((await edit("a", prId, { notes: "retry" })).status).toBe(409);
    expect((await submit("a", prId)).status).toBe(409);
    expect((await prRow(prId))?.status).toBe("rejected");
  });

  test("BR-PR-21 send back -> draft, resubmit starts at level 1", async () => {
    const prId = await createOk("a");
    const reqId = await submitOk("a", prId);
    await act("ap1", reqId, "approve"); // now at level 2
    expect((await act("ap2", reqId, "sent_back")).status).toBe(200);
    expect((await prRow(prId))?.status).toBe("draft");
    await submitOk("a", prId);
    const row = await prRow(prId);
    expect(row?.status).toBe("pending_approval");
    expect(row?.currentApprovalLevel).toBe(1);
  });

  test("BR-PR-21 requester withdraws -> draft, request cancelled", async () => {
    const prId = await createOk("a");
    const reqId = await submitOk("a", prId);
    expect((await act("a", reqId, "cancel")).status).toBe(200);
    expect((await prRow(prId))?.status).toBe("draft");
    const [req] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, reqId));
    expect(req?.status).toBe("cancelled");
  });
});

describe("BR-PR-45 login and pr.manage on every endpoint", () => {
  const prId = { v: 0 };
  beforeAll(async () => {
    prId.v = await createOk("a");
  });

  const endpoints: [string, string, (id: number) => string, unknown][] = [
    ["GET", "getprs", () => "/api/pr/getprs", undefined],
    ["GET", "getprdetails", (id) => `/api/pr/getprdetails/${id}`, undefined],
    [
      "POST",
      "createpr",
      () => "/api/pr/createpr",
      { type: "misc", notes: "n", items: [{ itemId: 1, requestedQty: 1 }] },
    ],
    [
      "PATCH",
      "updatepr",
      () => "/api/pr/updatepr",
      { prId: 1, notes: "n", inserts: [], updates: [], deletes: [] },
    ],
    [
      "DELETE",
      "deletepr",
      (id) => `/api/pr/deletepr/${id}`,
      { reason: "not needed" },
    ],
  ];

  for (const [method, name, path, body] of endpoints) {
    test(`BR-PR-45 ${name} without a token -> 401`, async () => {
      const res = await call(null, method, path(prId.v), body);
      expect(res.status).toBe(401);
    });
    test(`BR-PR-45 ${name} without pr.manage -> 403 PERMISSION_DENIED`, async () => {
      const res = await call("nokeys", method, path(prId.v), body);
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe("PERMISSION_DENIED");
    });
  }

  test("BR-PR-45 super-admin passes without holding the key", async () => {
    expect((await call("super", "GET", "/api/pr/getprs")).status).toBe(200);
    expect((await create("super")).status).toBe(201);
  });
});

describe("BR-PR-46 who and when is readable", () => {
  test("BR-PR-46 submit is in the approval trail with actor and time", async () => {
    const prId = await createOk("a");
    const reqId = await submitOk("a", prId);
    const trail = await db
      .select()
      .from(approvalTrails)
      .where(eq(approvalTrails.requestId, reqId));
    const submitted = trail.find((t) => t.action === "submitted");
    expect(submitted?.actionBy).toBe(emp.a as number);
    expect(submitted?.actionAt).toBeInstanceOf(Date);
  });

  test("BR-PR-46 each approval move is in the trail with its approver", async () => {
    const prId = await createOk("a");
    const reqId = await submitOk("a", prId);
    await act("ap1", reqId, "approve");
    await act("ap2", reqId, "approve");
    const trail = await db
      .select()
      .from(approvalTrails)
      .where(eq(approvalTrails.requestId, reqId));
    expect(
      trail.filter((t) => t.action === "approved").map((t) => t.actionBy),
    ).toEqual([emp.ap1 as number, emp.ap2 as number]);
  });
});

describe("BR-PR-47 row lock on edit and submit", () => {
  test("BR-PR-47 two submits at once -> one 201, one 409, one open request", async () => {
    const prId = await createOk("a");
    const rs = await Promise.all([submit("a", prId), submit("a", prId)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const open = (
      await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.docId, prId))
    ).filter((r) => r.status === "pending_approval");
    expect(open.length).toBe(1);
  });

  test("BR-PR-47 edit racing submit: approval never uses a stale estimate, loser writes nothing", async () => {
    await setAvgCost("c", 1000);
    const prId = await createOk("a", { items: [line("c", 10)] });
    const l = (await lineRows(prId))[0];
    const [e, s] = await Promise.all([
      edit("a", prId, {
        updates: [{ id: l?.id, itemId: item.c, requestedQty: 20 }],
      }),
      submit("a", prId),
    ]);
    expect([200, 409]).toContain(e.status);
    expect([201, 409]).toContain(s.status);
    // an edit can lose to a submit (409), but a submit after an edit must still see it
    expect([e.status, s.status]).not.toEqual([409, 409]);
    const row = await prRow(prId);
    const lines = await lineRows(prId);
    const expected = Math.round((lines[0]?.requestedQty as number) * 1000);
    expect(row?.estimatedAmountPaise).toBe(expected);
    if (e.status === 409) expect(lines[0]?.requestedQty).toBe(10);
    if (e.status === 200) expect(lines[0]?.requestedQty).toBe(20);
    if (s.status === 201) expect(row?.status).toBe("pending_approval");
  });
});
