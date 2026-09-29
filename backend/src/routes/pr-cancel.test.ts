/**
 * docs/specs/purchase-requisition.md (v1) and docs/specs/known-defects.md (v1)
 * BR-PR-39 whole-PR cancel (statuses, live-PO refusal, one transaction)
 * BR-PR-41 reason always required, trimmed 3-500
 * BR-PR-42 cancelling a pending_approval PR closes its approval request + one trail row
 * BR-PR-43 soft cancel, one path DELETE /api/pr/deletepr/:id, id errors, read-only afterwards
 * BR-PR-46 who / when / why readable after cancel
 * BR-PR-47 row lock: race loser gets 409, nothing half-written
 * BR-PR-15 (via BR-KD-01) PATCH cannot set status
 * BR-PR-17 / BR-PR-45 (via BR-KD-07) requester-or-super-admin, pr.manage key
 * BR-KD-01..04, 06..10, 13 map onto the rules above (see known-defects.md). BR-KD-16 is a screen
 * rule: not covered here (no frontend test tooling in scope), see report.
 *
 * HTTP-level through createApp(), real DB, real logins. Written by test-writer from the spec only.
 * Known gap: the "trail insert fails -> PR stays pending_approval" sub-case of BR-PR-42 needs a
 * production failure hook; not tested.
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
import { itemMaster } from "../db/schemas/02_procurement-catalog";
import {
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
} from "../db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { authService } from "../service/authService";

const app = createApp();
const PREFIX = "test_prcancel_";
const PASSWORD = "prcancel-password-123";
const POLICY_PRIORITY = -90210;

const emp = {} as Record<string, number>;
const token = {} as Record<string, string>;
const itemIds: number[] = [];
let policyId: number;
let supplierId: number;
let poSeq = 0;

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
      name: `TEST_prcancel_${tag}`,
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
function prOf(body: Json): Record<string, unknown> {
  return (body.data as { pr: Record<string, unknown> }).pr;
}
async function json(res: Response): Promise<Json> {
  return (await res.json()) as Json;
}

async function createPr(tag: string, lines = 1): Promise<number> {
  const res = await call(tag, "POST", "/api/pr/createpr", {
    type: "misc",
    notes: "TEST_prcancel note",
    items: itemIds
      .slice(0, lines)
      .map((itemId) => ({ itemId, requestedQty: 5 })),
  });
  if (res.status !== 201) {
    throw new Error(`Fixture setup: createpr -> ${res.status}`);
  }
  const body = await json(res);
  return prOf(body).id as number;
}

async function setStatus(
  prId: number,
  status: "approved" | "rejected" | "cancelled",
) {
  await db
    .update(purchaseRequests)
    .set({ status })
    .where(eq(purchaseRequests.id, prId));
}

async function prRow(prId: number) {
  const [r] = await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, prId));
  return r;
}

async function lineRows(prId: number) {
  return db
    .select()
    .from(purchaseRequestItems)
    .where(eq(purchaseRequestItems.prId, prId))
    .orderBy(purchaseRequestItems.id);
}

async function submit(tag: string, prId: number) {
  const res = await call(tag, "POST", "/api/approval/submitRequest", {
    docType: "pr",
    docId: prId,
  });
  return res;
}

async function openSubmitted(
  tag: string,
): Promise<{ prId: number; requestId: number }> {
  const prId = await createPr(tag);
  const res = await submit(tag, prId);
  if (res.status !== 201)
    throw new Error(`Fixture setup: submit -> ${res.status}`);
  const body = await json(res);
  return { prId, requestId: (body.data as { id: number }).id };
}

/** Puts line 1 of the PR on a live (non-cancelled) draft PO by direct DB writes. */
async function putFirstLineOnPo(prId: number): Promise<string> {
  poSeq += 1;
  const poNumber = `TEST_PRCAN_PO${poSeq}_${Date.now()}`;
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber,
      supplierId,
      status: "draft",
      createdBy: emp.a as number,
    })
    .returning({ id: purchaseOrders.id });
  const lines = await lineRows(prId);
  const first = lines[0];
  if (!po || !first) throw new Error("Fixture setup: PO link failed");
  const [poi] = await db
    .insert(purchaseOrderItems)
    .values({
      poId: po.id,
      itemId: first.itemId,
      qty: first.requestedQty,
      unitPricePaise: 1000,
      uom: first.uom,
    })
    .returning({ id: purchaseOrderItems.id });
  if (!poi) throw new Error("Fixture setup: PO item failed");
  await db.insert(prPoItemLinks).values({
    prItemId: first.id,
    poItemId: poi.id,
    linkedQty: first.requestedQty,
  });
  await db
    .update(purchaseRequestItems)
    .set({ status: "po_draft", issuedQty: first.requestedQty })
    .where(eq(purchaseRequestItems.id, first.id));
  return poNumber;
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
      const lineIds = (
        await db
          .select({ id: purchaseRequestItems.id })
          .from(purchaseRequestItems)
          .where(inArray(purchaseRequestItems.prId, prIds))
      ).map((l) => l.id);
      if (lineIds.length > 0) {
        await db
          .delete(prPoItemLinks)
          .where(inArray(prPoItemLinks.prItemId, lineIds));
      }
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

    const poIds = (
      await db
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(inArray(purchaseOrders.createdBy, ids))
    ).map((p) => p.id);
    if (poIds.length > 0) {
      await db
        .delete(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.poId, poIds));
      await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
    }
    await db
      .delete(documentNumberCounters)
      .where(inArray(documentNumberCounters.createdBy, ids));
  }
  await db
    .delete(approvalPolicies)
    .where(eq(approvalPolicies.priority, POLICY_PRIORITY));
  await db
    .delete(supplierMaster)
    .where(like(supplierMaster.name, "TEST_prcancel_%"));
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
  await db.delete(itemMaster).where(like(itemMaster.sku, "TEST_PRCANCEL_%"));
}

beforeAll(async () => {
  await cleanup();
  for (const n of [1, 2, 3]) {
    const [it] = await db
      .insert(itemMaster)
      .values({
        sku: `TEST_PRCANCEL_${n}`,
        name: `TEST_prcancel item ${n}`,
        category: "Consumable",
        uom: "pcs",
      })
      .returning({ id: itemMaster.id });
    if (!it) throw new Error("Fixture setup: item failed");
    itemIds.push(it.id);
  }
  const [sup] = await db
    .insert(supplierMaster)
    .values({ name: "TEST_prcancel_supplier" })
    .returning({ id: supplierMaster.id });
  if (!sup) throw new Error("Fixture setup: supplier failed");
  supplierId = sup.id;

  const managerRole = await makeRole("manager", ["pr.manage"]);
  await makeUser("a", managerRole);
  await makeUser("b", managerRole);
  await makeUser("nokeys", await makeRole("nokeys", []));
  await makeUser("approver", await makeRole("approver", []));
  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"))
    .limit(1);
  if (!sa) throw new Error("Fixture setup: super-admin role missing");
  await makeUser("super", sa.id);

  // Wins over any seeded policy (priority 1 = checked first); 1 level, approver = a specific employee.
  const [pol] = await db
    .insert(approvalPolicies)
    .values({
      name: "TEST_prcancel_policy",
      isActive: true,
      priority: POLICY_PRIORITY,
      docType: "pr",
      subDocType: "misc",
      autoApprove: false,
      approvalLevels: 1,
      approvalChain: [
        {
          level: 1,
          approverType: "specific",
          employeeId: emp.approver as number,
        },
      ],
      createdBy: emp.a as number,
      lastUpdatedBy: emp.a as number,
    })
    .returning({ id: approvalPolicies.id });
  if (!pol) throw new Error("Fixture setup: policy failed");
  policyId = pol.id;
});

afterAll(cleanup);

const cancel = (
  tag: string | null,
  id: number | string,
  ...rest: [reason?: unknown]
) => {
  // no third argument -> a valid default reason; explicit undefined -> no reason sent at all
  const reason = rest.length === 0 ? "duplicate request" : rest[0];
  return call(
    tag,
    "DELETE",
    `/api/pr/deletepr/${id}`,
    reason === undefined ? undefined : { reason },
  );
};

describe("BR-PR-43 / BR-KD-01 / BR-KD-02 one cancel path, soft cancel", () => {
  test("BR-PR-43 bad id -> 400 INVALID_PR_ID", async () => {
    const res = await cancel("a", "abc");
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("INVALID_PR_ID");
  });

  test("BR-PR-43 unknown id -> 404 PR_NOT_FOUND", async () => {
    const res = await cancel("a", 999999999);
    expect(res.status).toBe(404);
    expect((await json(res)).code).toBe("PR_NOT_FOUND");
  });

  test("BR-PR-43 cancelling a draft returns 200 with the PR, row kept, status cancelled, number kept, lines kept", async () => {
    const prId = await createPr("a", 2);
    const before = await prRow(prId);
    const res = await cancel("a", prId);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(prOf(body).id).toBe(prId);
    expect(prOf(body).status).toBe("cancelled");
    const after = await prRow(prId);
    expect(after?.status).toBe("cancelled");
    expect(after?.prNumber).toBe(before?.prNumber as string);
    expect((await lineRows(prId)).length).toBe(2);
  });

  test("BR-PR-43 cancelled PR is still readable and shows under the cancelled filter", async () => {
    const prId = await createPr("a");
    await cancel("a", prId);
    const detail = await call("a", "GET", `/api/pr/getprdetails/${prId}`);
    expect(detail.status).toBe(200);
    const list = await call(
      "a",
      "GET",
      "/api/pr/getprs?status=cancelled&pageSize=100",
    );
    expect(list.status).toBe(200);
    const rows = (await json(list)).data as unknown as { id: number }[];
    expect(rows.some((r) => r.id === prId)).toBe(true);
  });

  test("BR-PR-43 cancelled PR is read-only: edit -> 409 PR_NOT_EDITABLE", async () => {
    const prId = await createPr("a");
    await cancel("a", prId);
    const res = await call("a", "PATCH", "/api/pr/updatepr", {
      prId,
      notes: "changed after cancel",
      inserts: [],
      updates: [],
      deletes: [],
    });
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("PR_NOT_EDITABLE");
  });

  test("BR-KD-01 PATCH with status cancelled -> 400 PR_STATUS_VIA_ACTION, PR unchanged", async () => {
    const prId = await createPr("a");
    const res = await call("a", "PATCH", "/api/pr/updatepr", {
      prId,
      status: "cancelled",
      inserts: [],
      updates: [],
      deletes: [],
    });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("PR_STATUS_VIA_ACTION");
    expect((await prRow(prId))?.status).toBe("draft");
  });
});

describe("BR-PR-41 / BR-KD-06 reason always required", () => {
  test.each([
    ["empty", ""],
    ["spaces only", "   "],
    ["too short after trim", " ab "],
    ["501 characters", "x".repeat(501)],
  ])(
    "BR-PR-41 draft with reason %s -> 400 PR_CANCEL_REASON_REQUIRED, PR untouched",
    async (_n, reason) => {
      const prId = await createPr("a");
      const res = await cancel("a", prId, reason);
      expect(res.status).toBe(400);
      expect((await json(res)).code).toBe("PR_CANCEL_REASON_REQUIRED");
      expect((await prRow(prId))?.status).toBe("draft");
    },
  );

  test("BR-PR-41 missing reason on an approved PR -> 400", async () => {
    const prId = await createPr("a");
    await setStatus(prId, "approved");
    const res = await cancel("a", prId, undefined);
    expect(res.status).toBe(400);
    expect((await prRow(prId))?.status).toBe("approved");
  });

  test("BR-PR-41 boundary reasons of 3 and 500 characters are accepted", async () => {
    const a = await createPr("a");
    expect((await cancel("a", a, "abc")).status).toBe(200);
    const b = await createPr("a");
    expect((await cancel("a", b, "y".repeat(500))).status).toBe(200);
  });
});

describe("BR-PR-39 / BR-KD-03 which statuses can be cancelled", () => {
  test("BR-PR-39 approved PR with all lines pending -> header and all lines cancelled", async () => {
    const prId = await createPr("a", 3);
    await setStatus(prId, "approved");
    const res = await cancel("a", prId);
    expect(res.status).toBe(200);
    expect((await prRow(prId))?.status).toBe("cancelled");
    const lines = await lineRows(prId);
    expect(lines.length).toBe(3);
    expect(lines.every((l) => l.status === "cancelled")).toBe(true);
  });

  test("BR-PR-39 draft PR: pending lines become cancelled too", async () => {
    const prId = await createPr("a", 2);
    await cancel("a", prId);
    expect((await lineRows(prId)).every((l) => l.status === "cancelled")).toBe(
      true,
    );
  });

  test("BR-PR-39 rejected PR -> 409 PR_INVALID_TRANSITION, unchanged", async () => {
    const prId = await createPr("a");
    await setStatus(prId, "rejected");
    const res = await cancel("a", prId);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("PR_INVALID_TRANSITION");
    expect((await prRow(prId))?.status).toBe("rejected");
  });

  test("BR-PR-39 already cancelled PR -> 409 PR_INVALID_TRANSITION, never a silent 200", async () => {
    const prId = await createPr("a");
    expect((await cancel("a", prId)).status).toBe(200);
    const again = await cancel("a", prId);
    expect(again.status).toBe(409);
    expect((await json(again)).code).toBe("PR_INVALID_TRANSITION");
  });
});

describe("BR-PR-39 / BR-KD-04 line on a live PO", () => {
  test("BR-PR-39 approved PR with 1 of 3 lines on a PO -> 409 PR_HAS_ORDERED_LINES naming the PO; nothing changed", async () => {
    const prId = await createPr("a", 3);
    await setStatus(prId, "approved");
    const poNumber = await putFirstLineOnPo(prId);
    const res = await cancel("a", prId);
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.code).toBe("PR_HAS_ORDERED_LINES");
    expect(JSON.stringify(body)).toContain(poNumber);
    expect((await prRow(prId))?.status).toBe("approved");
    const lines = await lineRows(prId);
    expect(lines.map((l) => l.status)).toEqual([
      "po_draft",
      "pending",
      "pending",
    ]);
  });
});

describe("BR-PR-17 / BR-PR-45 / BR-KD-07 who may cancel", () => {
  test("BR-PR-17 another pr.manage holder cannot cancel -> 403 PR_NOT_REQUESTER, PR unchanged", async () => {
    const prId = await createPr("a");
    const res = await cancel("b", prId);
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe("PR_NOT_REQUESTER");
    expect((await prRow(prId))?.status).toBe("draft");
  });

  test("BR-PR-17 super-admin can cancel someone else's draft", async () => {
    const prId = await createPr("a");
    const res = await cancel("super", prId);
    expect(res.status).toBe(200);
    expect((await prRow(prId))?.status).toBe("cancelled");
  });

  test("BR-PR-45 no token -> 401", async () => {
    const prId = await createPr("a");
    expect((await cancel(null, prId)).status).toBe(401);
  });

  test("BR-PR-45 role without pr.manage -> 403 PERMISSION_DENIED", async () => {
    const prId = await createPr("a");
    const res = await cancel("nokeys", prId);
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe("PERMISSION_DENIED");
  });
});

describe("BR-PR-46 / BR-KD-08 who, when, why saved", () => {
  test("BR-PR-46 details carry cancelledBy, cancelledByName, cancelledAt, cancelReason", async () => {
    const prId = await createPr("a");
    const t0 = Date.now();
    expect((await cancel("a", prId, "duplicate")).status).toBe(200);
    const res = await call("b", "GET", `/api/pr/getprdetails/${prId}`);
    expect(res.status).toBe(200);
    const pr = prOf(await json(res));
    expect(pr.cancelledBy).toBe(emp.a as number);
    expect(pr.cancelledByName).toBe("TEST_prcancel_a");
    expect(pr.cancelReason).toBe("duplicate");
    const at = Date.parse(String(pr.cancelledAt));
    expect(Number.isNaN(at)).toBe(false);
    expect(Math.abs(at - t0)).toBeLessThan(60_000);
  });

  test("BR-PR-46 cancelled by super-admin records the super-admin, not the requester", async () => {
    const prId = await createPr("a");
    await cancel("super", prId, "not needed any more");
    const res = await call("a", "GET", `/api/pr/getprdetails/${prId}`);
    const pr = prOf(await json(res));
    expect(pr.cancelledBy).toBe(emp.super as number);
    expect(pr.cancelReason).toBe("not needed any more");
  });
});

describe("BR-PR-42 / BR-KD-09 / BR-KD-13 cancel closes the open approval", () => {
  test("BR-PR-42 super-admin cancels A's pending PR -> request cancelled, exactly one trail row cancelled by S with the reason", async () => {
    const { prId, requestId } = await openSubmitted("a");
    expect((await prRow(prId))?.status).toBe("pending_approval");
    const before = await db
      .select()
      .from(approvalTrails)
      .where(eq(approvalTrails.requestId, requestId));

    const res = await cancel("super", prId, "raised by mistake");
    expect(res.status).toBe(200);
    expect((await prRow(prId))?.status).toBe("cancelled");

    const [req] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId));
    expect(req?.status).toBe("cancelled");

    const after = await db
      .select()
      .from(approvalTrails)
      .where(eq(approvalTrails.requestId, requestId));
    const added = after.filter((t) => !before.some((b) => b.id === t.id));
    expect(added.length).toBe(1);
    expect(added[0]?.action).toBe("cancelled");
    expect(added[0]?.actionBy).toBe(emp.super as number);
    expect(added[0]?.notes).toBe("raised by mistake");
  });

  test("BR-PR-42 requester cancelling own pending PR also closes the request", async () => {
    const { prId, requestId } = await openSubmitted("a");
    expect((await cancel("a", prId)).status).toBe(200);
    const [req] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId));
    expect(req?.status).toBe("cancelled");
  });

  test("BR-KD-13 approve or reject on the cancelled PR's request -> 409 APPROVAL_NOT_PENDING", async () => {
    const { prId, requestId } = await openSubmitted("a");
    await cancel("a", prId);
    for (const action of ["approve", "reject"]) {
      const res = await call(
        "approver",
        "POST",
        `/api/approval/actOnRequest/${requestId}`,
        {
          action,
          notes: "late decision",
        },
      );
      expect(res.status).toBe(409);
      expect((await json(res)).code).toBe("APPROVAL_NOT_PENDING");
    }
    expect((await prRow(prId))?.status).toBe("cancelled");
  });
});

describe("BR-PR-47 / BR-KD-10 row lock and all-or-nothing", () => {
  test("BR-PR-47 two cancels at once on a draft -> one 200, one 409, one final state", async () => {
    const prId = await createPr("a", 2);
    const [r1, r2] = await Promise.all([
      cancel("a", prId, "first reason"),
      cancel("super", prId, "second reason"),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((await prRow(prId))?.status).toBe("cancelled");
    expect((await lineRows(prId)).every((l) => l.status === "cancelled")).toBe(
      true,
    );
  });

  test("BR-PR-47 two cancels at once on a pending_approval PR -> exactly one 'cancelled' trail row", async () => {
    const { prId, requestId } = await openSubmitted("a");
    const results = await Promise.all([
      cancel("a", prId, "race one"),
      cancel("super", prId, "race two"),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const trail = await db
      .select()
      .from(approvalTrails)
      .where(eq(approvalTrails.requestId, requestId));
    expect(trail.filter((t) => t.action === "cancelled").length).toBe(1);
  });

  test("BR-PR-47 cancel racing submit on a draft leaves a cancelled PR and no open approval request", async () => {
    const prId = await createPr("a");
    const [c, s] = await Promise.all([cancel("a", prId), submit("a", prId)]);
    expect(c.status).toBe(200);
    expect([201, 409]).toContain(s.status);
    expect((await prRow(prId))?.status).toBe("cancelled");
    const open = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.docId, prId));
    expect(open.filter((r) => r.status === "pending_approval").length).toBe(0);
  });

  test("BR-PR-47 cancel racing an edit: edit succeeds only if it landed before the cancel", async () => {
    const prId = await createPr("a");
    const [c, e] = await Promise.all([
      cancel("a", prId),
      call("a", "PATCH", "/api/pr/updatepr", {
        prId,
        notes: "edited during race",
        inserts: [],
        updates: [],
        deletes: [],
      }),
    ]);
    expect(c.status).toBe(200);
    expect([200, 409]).toContain(e.status);
    const row = await prRow(prId);
    expect(row?.status).toBe("cancelled");
    expect(row?.notes === "edited during race").toBe(e.status === 200);
  });

  test("BR-PR-47 a refused cancel writes nothing (line on live PO): no cancel data on the PR", async () => {
    const prId = await createPr("a", 2);
    await setStatus(prId, "approved");
    await putFirstLineOnPo(prId);
    const res = await cancel("a", prId);
    expect(res.status).toBe(409);
    const detail = await call("a", "GET", `/api/pr/getprdetails/${prId}`);
    const pr = prOf(await json(detail));
    expect(pr.status).toBe("approved");
    expect(pr.cancelledBy ?? null).toBeNull();
    expect(pr.cancelReason ?? null).toBeNull();
  });
});

test("fixture sanity: policy inserted", () => {
  expect(policyId).toBeGreaterThan(0);
});
