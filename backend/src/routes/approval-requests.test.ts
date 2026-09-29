/**
 * docs/specs/approval.md (v1)
 * BR-APR-23 no eligible approver      BR-APR-24 creator only, draft only   BR-APR-26 one open request
 * BR-APR-27 submit in one txn         BR-APR-28 auto-approve                BR-APR-29 resubmit = new request
 * BR-APR-30 pending only, row lock    BR-APR-31 step match                  BR-APR-33 no self block, one level each
 * BR-APR-35 approve levels            BR-APR-37 comment required            BR-APR-39 withdraw
 * BR-APR-40 one trail row per action  BR-APR-42 PR status table             BR-APR-43 rejected PO cancels PR lines
 * BR-APR-45 approvedBy                BR-APR-46 status written only here    BR-APR-47 locked while pending
 * BR-APR-48 doc cancel cancels request BR-APR-50 unused statuses            BR-APR-51 read rule
 * BR-APR-52 my pending                BR-APR-54 history                     BR-APR-61 auto_approve_own
 *
 * HTTP-level through createApp(), real DB, real logins. Written by test-writer from the spec only.
 * Known gaps (not tested):
 *  - SCO rows of BR-APR-42/47/48: subcontracting is M2, no SCO table/endpoint yet.
 *  - BR-APR-27 "mirror fails -> nothing saved" and BR-APR-40 "doc update fails -> nothing saved",
 *    BR-APR-48 "doc cancel fails -> request stays pending": no production hook to force a failure.
 *  - BR-APR-29 "re-match on current values": needs a PR amount change plus two amount policies; not built here.
 *  - BR-APR-45 "approved, later sent back on a new request": an approved doc cannot be resubmitted without
 *    an owning-module return-to-draft path; tested as "any non-final-approve outcome leaves approvedBy empty".
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, like } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import { rolePermissions, roles } from "../db/schemas/01_auth";
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
import { invalidateActor } from "../lib/auth-middleware";
import { authService } from "../service/authService";

const app = createApp();
const P = "test_aprreq_";
const PASSWORD = "aprreq-password-123";
const PRIO_MISC = -90411;
const PRIO_MAINT = -90412;
const PRIO_AUTO = -90413;
const PRIO_PO = -90414;
const PRIORITIES = [PRIO_MISC, PRIO_MAINT, PRIO_AUTO, PRIO_PO];

const emp = {} as Record<string, number>;
const token = {} as Record<string, string>;
const roleId = {} as Record<string, number>;
let itemId: number;
let supplierId: number;
let docSeq = 0;

type Step =
  | { level: number; approverType: "role"; role: string }
  | { level: number; approverType: "specific"; employeeId: number };
const roleStep = (level: number, role: string): Step => ({
  level,
  approverType: "role",
  role: `${P}${role}`,
});
const empStep = (level: number, tag: string): Step => ({
  level,
  approverType: "specific",
  employeeId: emp[tag] as number,
});

async function makeRole(name: string, keys: string[]) {
  const [r] = await db
    .insert(roles)
    .values({ name: `${P}${name}`, isSystem: false })
    .returning({ id: roles.id });
  if (!r) throw new Error("Fixture setup: role insert failed");
  if (keys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(keys.map((permissionKey) => ({ roleId: r.id, permissionKey })));
  }
  roleId[name] = r.id;
}

async function makeUser(tag: string, role: string, isActive = true) {
  const email = `${P}${tag}@diecast.test`;
  const [e] = await db
    .insert(employees)
    .values({
      name: `TEST_aprreq_${tag}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId: roleId[role] as number,
      isActive,
    })
    .returning({ id: employees.id });
  if (!e) throw new Error("Fixture setup: employee insert failed");
  emp[tag] = e.id;
  if (isActive) {
    token[tag] = (await authService.login(email, PASSWORD)).accessToken;
  }
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

type Json = Record<string, unknown> & {
  data?: Record<string, unknown> & unknown[];
};
const json = async (res: Response): Promise<Json> => (await res.json()) as Json;

/** Set the chain of one of the three mutable fixture policies. */
async function setPolicy(
  prio: number,
  chain: Step[],
  autoApprove = false,
  name?: string,
) {
  await db
    .update(approvalPolicies)
    .set({
      approvalChain: chain,
      approvalLevels: Math.max(chain.length, 1),
      autoApprove,
      ...(name ? { name } : {}),
    })
    .where(eq(approvalPolicies.priority, prio));
}

async function mkPr(
  tag: string,
  type: "misc" | "maintenance" | "tooling" = "misc",
  amount = 100000,
) {
  docSeq += 1;
  const [pr] = await db
    .insert(purchaseRequests)
    .values({
      prNumber: `TEST_APRREQ_PR-${Date.now()}-${docSeq}`,
      type,
      requestedBy: emp[tag] as number,
      estimatedAmountPaise: amount,
      notes: "TEST_aprreq",
    })
    .returning({ id: purchaseRequests.id });
  if (!pr) throw new Error("Fixture setup: PR insert failed");
  const [line] = await db
    .insert(purchaseRequestItems)
    .values({ prId: pr.id, itemId, requestedQty: 2, uom: "pcs" })
    .returning({ id: purchaseRequestItems.id });
  if (!line) throw new Error("Fixture setup: PR line failed");
  return { id: pr.id, lineId: line.id };
}

async function mkPo(tag: string, opts: { withPr?: boolean } = {}) {
  docSeq += 1;
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: `TEST_APRREQ_PO-${Date.now()}-${docSeq}`,
      supplierId,
      createdBy: emp[tag] as number,
      subtotalPaise: 500000,
      totalAmountPaise: 500000,
    })
    .returning({ id: purchaseOrders.id });
  if (!po) throw new Error("Fixture setup: PO insert failed");
  const [poItem] = await db
    .insert(purchaseOrderItems)
    .values({
      poId: po.id,
      itemId,
      qty: 2,
      unitPricePaise: 250000,
      uom: "pcs",
    })
    .returning({ id: purchaseOrderItems.id });
  if (!poItem) throw new Error("Fixture setup: PO line failed");
  let pr: { id: number; lineId: number } | undefined;
  if (opts.withPr) {
    pr = await mkPr(tag);
    await db
      .update(purchaseRequests)
      .set({ status: "approved" })
      .where(eq(purchaseRequests.id, pr.id));
    await db
      .update(purchaseRequestItems)
      .set({ status: "po_draft" })
      .where(eq(purchaseRequestItems.id, pr.lineId));
    await db
      .insert(prPoItemLinks)
      .values({ prItemId: pr.lineId, poItemId: poItem.id, linkedQty: 2 });
  }
  return { id: po.id, pr };
}

const submit = (tag: string, docType: "pr" | "po", docId: number) =>
  call(tag, "POST", "/api/approval/submitRequest", { docType, docId });

async function submitOk(tag: string, docType: "pr" | "po", docId: number) {
  const res = await submit(tag, docType, docId);
  if (res.status !== 201)
    throw new Error(`Fixture setup: submit -> ${res.status}`);
  return (await json(res)).data?.id as number;
}

const act = (
  tag: string,
  requestId: number,
  action: "approve" | "reject" | "sent_back" | "withdraw",
  ...rest: [notes?: string]
) => {
  // Argument omitted -> default note; explicit undefined -> no notes field sent.
  const notes = rest.length === 0 ? "TEST_aprreq note" : rest[0];
  return call(tag, "POST", `/api/approval/actOnRequest/${requestId}`, {
    action,
    ...(notes === undefined ? {} : { notes }),
  });
};

const prRow = async (id: number) =>
  (
    await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, id))
  )[0];
const poRow = async (id: number) =>
  (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)))[0];
const reqRow = async (id: number) =>
  (
    await db.select().from(approvalRequests).where(eq(approvalRequests.id, id))
  )[0];
const trails = (requestId: number) =>
  db
    .select()
    .from(approvalTrails)
    .where(eq(approvalTrails.requestId, requestId))
    .orderBy(approvalTrails.id);
const requestsOf = (docType: "pr" | "po", docId: number) =>
  db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.docType, docType),
        eq(approvalRequests.docId, docId),
      ),
    )
    .orderBy(approvalRequests.id);

async function inboxDocIds(tag: string, employeeId?: number) {
  const q = new URLSearchParams({
    page: "1",
    pageSize: "100",
    sortDir: "desc",
  });
  if (employeeId) q.set("employeeId", String(employeeId));
  const res = await call(
    tag,
    "GET",
    `/api/approval/getMyPendingApprovals?${q.toString()}`,
  );
  return { res, body: await json(res) };
}

async function moveRole(tag: string, role: string) {
  await db
    .update(employees)
    .set({ roleId: roleId[role] as number })
    .where(eq(employees.id, emp[tag] as number));
  invalidateActor(emp[tag] as number);
}

async function cleanup() {
  const ids = (
    await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.email, `${P}%`))
  ).map((e) => e.id);
  if (ids.length > 0) {
    const reqIds = (
      await db
        .select({ id: approvalRequests.id })
        .from(approvalRequests)
        .where(inArray(approvalRequests.requestedBy, ids))
    ).map((r) => r.id);
    if (reqIds.length > 0) {
      await db
        .delete(approvalTrails)
        .where(inArray(approvalTrails.requestId, reqIds));
      await db
        .delete(approvalRequests)
        .where(inArray(approvalRequests.id, reqIds));
    }
    const poIds = (
      await db
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(inArray(purchaseOrders.createdBy, ids))
    ).map((p) => p.id);
    if (poIds.length > 0) {
      const poItemIds = (
        await db
          .select({ id: purchaseOrderItems.id })
          .from(purchaseOrderItems)
          .where(inArray(purchaseOrderItems.poId, poIds))
      ).map((i) => i.id);
      if (poItemIds.length > 0) {
        await db
          .delete(prPoItemLinks)
          .where(inArray(prPoItemLinks.poItemId, poItemIds));
      }
      await db
        .delete(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.poId, poIds));
      await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
    }
    const prIds = (
      await db
        .select({ id: purchaseRequests.id })
        .from(purchaseRequests)
        .where(inArray(purchaseRequests.requestedBy, ids))
    ).map((p) => p.id);
    if (prIds.length > 0) {
      await db
        .delete(purchaseRequestItems)
        .where(inArray(purchaseRequestItems.prId, prIds));
      await db
        .delete(purchaseRequests)
        .where(inArray(purchaseRequests.id, prIds));
    }
  }
  await db
    .delete(approvalPolicies)
    .where(inArray(approvalPolicies.priority, PRIORITIES));
  await db.delete(employees).where(like(employees.email, `${P}%`));
  await db.delete(roles).where(like(roles.name, `${P}%`));
  await db
    .delete(supplierMaster)
    .where(like(supplierMaster.name, "TEST_aprreq_%"));
  await db.delete(itemMaster).where(like(itemMaster.sku, "TEST_APRREQ_%"));
}

beforeAll(async () => {
  await cleanup();
  const [it] = await db
    .insert(itemMaster)
    .values({
      sku: "TEST_APRREQ_A",
      name: "TEST_aprreq item",
      category: "Consumable",
      uom: "pcs",
      averageCostPaise: 1000,
    })
    .returning({ id: itemMaster.id });
  if (!it) throw new Error("Fixture setup: item failed");
  itemId = it.id;
  const [sup] = await db
    .insert(supplierMaster)
    .values({ name: "TEST_aprreq_supplier" })
    .returning({ id: supplierMaster.id });
  if (!sup) throw new Error("Fixture setup: supplier failed");
  supplierId = sup.id;

  await makeRole("req", ["pr.manage", "po.manage"]);
  await makeRole("sup", ["pr.manage", "po.manage"]);
  await makeRole("other", []);
  await makeRole("plain", []);
  await makeRole("auto", [
    "pr.manage",
    "po.manage",
    "approval.auto_approve_own",
  ]);
  await makeRole("viewall", ["approval.view_all"]);
  await makeRole("vothers", ["approval.view_others_pending"]);
  await makeRole("ghost", []); // nobody active holds this role
  await makeRole("pronly", ["pr.manage"]);
  await makeRole("poonly", ["po.manage"]);

  await makeUser("req", "req");
  await makeUser("req2", "req");
  await makeUser("supA", "sup");
  await makeUser("supB", "sup");
  await makeUser("ap1", "other");
  await makeUser("ap2", "other");
  await makeUser("plain", "plain");
  await makeUser("autoU", "auto");
  await makeUser("viewer", "viewall");
  await makeUser("vothers", "vothers");
  await makeUser("inactive", "other", false);
  await makeUser("pronly", "pronly");
  await makeUser("poonly", "poonly");

  const base = { isActive: true, createdBy: emp.req, lastUpdatedBy: emp.req };
  await db.insert(approvalPolicies).values([
    {
      ...base,
      name: "TEST_aprreq_misc",
      priority: PRIO_MISC,
      docType: "pr",
      subDocType: "misc",
      autoApprove: false,
      approvalLevels: 1,
      approvalChain: [roleStep(1, "sup")],
    },
    {
      ...base,
      name: "TEST_aprreq_maint",
      priority: PRIO_MAINT,
      docType: "pr",
      subDocType: "maintenance",
      autoApprove: false,
      approvalLevels: 1,
      approvalChain: [roleStep(1, "sup")],
    },
    {
      ...base,
      name: "TEST_aprreq_auto",
      priority: PRIO_AUTO,
      docType: "pr",
      subDocType: "tooling",
      autoApprove: true,
      approvalLevels: 1,
      approvalChain: [roleStep(1, "sup")],
    },
    {
      ...base,
      name: "TEST_aprreq_po",
      priority: PRIO_PO,
      docType: "po",
      subDocType: "any",
      autoApprove: false,
      approvalLevels: 1,
      approvalChain: [roleStep(1, "sup")],
    },
  ]);
});

afterAll(cleanup);

// ─── Submit ──────────────────────────────────────────────────────────────────

describe("BR-APR-23 eligible approver needed at submit", () => {
  test("BR-APR-23 role step with no active holder -> 400, no request, PR stays draft", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup"), roleStep(2, "ghost")]);
    const pr = await mkPr("req");
    const res = await submit("req", "pr", pr.id);
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe("APPROVAL_NO_ELIGIBLE_APPROVER");
    expect(String(body.message)).toContain(`${P}ghost`);
    expect((await requestsOf("pr", pr.id)).length).toBe(0);
    expect((await prRow(pr.id))?.status).toBe("draft");
  });

  test("BR-APR-23 specific step with an inactive employee -> 400", async () => {
    await setPolicy(PRIO_MISC, [empStep(1, "inactive")]);
    const pr = await mkPr("req");
    const res = await submit("req", "pr", pr.id);
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("APPROVAL_NO_ELIGIBLE_APPROVER");
    expect((await requestsOf("pr", pr.id)).length).toBe(0);
    expect((await prRow(pr.id))?.status).toBe("draft");
  });

  test("BR-APR-23 not checked when the request is auto-approved", async () => {
    await setPolicy(PRIO_AUTO, [roleStep(1, "ghost")], true);
    const pr = await mkPr("req", "tooling");
    const res = await submit("req", "pr", pr.id);
    expect(res.status).toBe(201);
    expect((await json(res)).data?.status).toBe("approved");
  });
});

describe("BR-APR-24 creator only, draft only", () => {
  test("BR-APR-24 someone other than the creator submits -> 403", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const res = await submit("req2", "pr", pr.id);
    expect(res.status).toBe(403);
    expect((await requestsOf("pr", pr.id)).length).toBe(0);
    expect((await prRow(pr.id))?.status).toBe("draft");
  });

  test("BR-APR-24 PO: someone other than createdBy submits -> 403", async () => {
    const po = await mkPo("req");
    expect((await submit("req2", "po", po.id)).status).toBe(403);
    expect((await poRow(po.id))?.status).toBe("draft");
  });

  test("BR-APR-24 an approved PR submitted again -> 409 APPROVAL_INVALID_SOURCE_STATUS", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await act("supA", reqId, "approve")).status).toBe(200);
    const res = await submit("req", "pr", pr.id);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("APPROVAL_INVALID_SOURCE_STATUS");
    expect((await requestsOf("pr", pr.id)).length).toBe(1);
  });

  test("BR-APR-24 (v2) PR creator without pr.manage submits -> 403, nothing created", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("poonly");
    const res = await submit("poonly", "pr", pr.id);
    expect(res.status).toBe(403);
    expect((await requestsOf("pr", pr.id)).length).toBe(0);
    expect((await prRow(pr.id))?.status).toBe("draft");
  });

  test("BR-APR-24 (v2) PO creator without po.manage submits -> 403, nothing created", async () => {
    const po = await mkPo("pronly");
    const res = await submit("pronly", "po", po.id);
    expect(res.status).toBe(403);
    expect((await requestsOf("po", po.id)).length).toBe(0);
    expect((await poRow(po.id))?.status).toBe("draft");
  });

  test("BR-APR-24 (v2) creator holding the matching key (pr.manage only) can submit a PR", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("pronly");
    expect((await submit("pronly", "pr", pr.id)).status).toBe(201);
  });
});

describe("BR-APR (v2) there is no approval cancel action", () => {
  test("actOnRequest action 'cancel' -> 400, request stays pending, PR untouched", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    for (const who of ["req", "supA"]) {
      const res = await call(
        who,
        "POST",
        `/api/approval/actOnRequest/${reqId}`,
        {
          action: "cancel",
          notes: "TEST_aprreq no cancel action",
        },
      );
      expect(res.status).toBe(400);
    }
    expect((await reqRow(reqId))?.status).toBe("pending_approval");
    const row = await prRow(pr.id);
    expect(row?.status).toBe("pending_approval");
    expect(row?.cancelledAt).toBeNull();
    expect((await trails(reqId)).map((t) => t.action)).toEqual(["submitted"]);
  });
});

describe("BR-APR-26 at most one open request", () => {
  test("BR-APR-26 two submits at once -> one 201, one 409 APPROVAL_ALREADY_OPEN, one request", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const [a, b] = await Promise.all([
      submit("req", "pr", pr.id),
      submit("req", "pr", pr.id),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect((await json(loser)).code).toBe("APPROVAL_ALREADY_OPEN");
    expect((await requestsOf("pr", pr.id)).length).toBe(1);
    expect(
      (await trails((await requestsOf("pr", pr.id))[0]?.id as number)).length,
    ).toBe(1);
  });

  test("BR-APR-26 a submit while a request is pending creates nothing", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    await submitOk("req", "pr", pr.id);
    const res = await submit("req", "pr", pr.id);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("APPROVAL_ALREADY_OPEN");
    expect((await requestsOf("pr", pr.id)).length).toBe(1);
  });
});

describe("BR-APR-27 submit result", () => {
  test("BR-APR-27 2-step policy -> request 1 of 2, chain copied, one submitted trail at level 0, PR 1/2", async () => {
    const chain = [roleStep(1, "sup"), empStep(2, "ap1")];
    await setPolicy(PRIO_MISC, chain);
    const pr = await mkPr("req");
    const res = await submit("req", "pr", pr.id);
    expect(res.status).toBe(201);
    const data = (await json(res)).data as Record<string, unknown>;
    expect(data.status).toBe("pending_approval");
    expect(data.currentLevel).toBe(1);
    expect(data.totalLevels).toBe(2);
    expect(data.chainSnapshot).toEqual(chain);
    expect(data.currentApproverRole).toBe(`${P}sup`);
    const t = await trails(data.id as number);
    expect(t.length).toBe(1);
    expect(t[0]?.action).toBe("submitted");
    expect(t[0]?.level).toBe(0);
    expect(t[0]?.actionBy).toBe(emp.req as number);
    const row = await prRow(pr.id);
    expect(row?.status).toBe("pending_approval");
    expect(row?.currentApprovalLevel).toBe(1);
    expect(row?.totalApprovalLevels).toBe(2);
  });

  test("BR-APR-27 a later policy edit does not change an open request's chain", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    await setPolicy(PRIO_MISC, [roleStep(1, "ghost"), roleStep(2, "ghost")]);
    const row = await reqRow(reqId);
    expect(row?.totalLevels).toBe(1);
    expect(row?.chainSnapshot).toEqual([roleStep(1, "sup")]);
  });
});

describe("BR-APR-28 and BR-APR-61 auto-approve", () => {
  test("BR-APR-28 auto-approve policy -> approved, completedAt, trails submitted + auto_approved, approvedBy empty", async () => {
    await setPolicy(PRIO_AUTO, [roleStep(1, "sup")], true, "TEST_aprreq_auto");
    const pr = await mkPr("req", "tooling");
    const res = await submit("req", "pr", pr.id);
    expect(res.status).toBe(201);
    const data = (await json(res)).data as Record<string, unknown>;
    expect(data.status).toBe("approved");
    expect(data.completedAt).toBeTruthy();
    const t = await trails(data.id as number);
    expect(t.map((x) => x.action)).toEqual(["submitted", "auto_approved"]);
    expect(t[1]?.actionBy).toBe(emp.req as number);
    expect(t[1]?.notes).toBe("Auto-approved by policy TEST_aprreq_auto");
    const row = await prRow(pr.id);
    expect(row?.status).toBe("approved");
    expect(row?.approvedBy).toBeNull();
  });

  test("BR-APR-61 holder of approval.auto_approve_own: own PR auto-approved despite a chain", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("autoU");
    const res = await submit("autoU", "pr", pr.id);
    expect(res.status).toBe(201);
    const data = (await json(res)).data as Record<string, unknown>;
    expect(data.status).toBe("approved");
    const t = await trails(data.id as number);
    expect(t.map((x) => x.action)).toEqual(["submitted", "auto_approved"]);
    expect(t[1]?.notes).toBe("Auto-approved: own request");
    const row = await prRow(pr.id);
    expect(row?.status).toBe("approved");
    expect(row?.approvedBy).toBeNull();
  });

  test("BR-APR-61 holder of the key: own PO auto-approved", async () => {
    const po = await mkPo("autoU");
    const res = await submit("autoU", "po", po.id);
    expect(res.status).toBe(201);
    expect((await json(res)).data?.status).toBe("approved");
    expect((await poRow(po.id))?.status).toBe("approved");
  });

  test("BR-APR-61 without the key the same PO waits for the chain", async () => {
    await setPolicy(PRIO_PO, [roleStep(1, "sup")]);
    const po = await mkPo("req");
    const res = await submit("req", "po", po.id);
    expect(res.status).toBe(201);
    expect((await json(res)).data?.status).toBe("pending_approval");
    expect((await poRow(po.id))?.status).toBe("pending_approval");
  });

  test("BR-APR-61 without the key a non-auto policy is not skipped", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req2");
    expect((await json(await submit("req2", "pr", pr.id))).data?.status).toBe(
      "pending_approval",
    );
  });
});

// ─── Acting ──────────────────────────────────────────────────────────────────

describe("BR-APR-30 pending only, one at a time", () => {
  test("BR-APR-30 acting on a finished request -> 409 APPROVAL_NOT_PENDING, no new trail", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await act("supA", reqId, "approve")).status).toBe(200);
    const before = (await trails(reqId)).length;
    const res = await act("supB", reqId, "approve");
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("APPROVAL_NOT_PENDING");
    expect((await trails(reqId)).length).toBe(before);
  });

  test("BR-APR-30 two approvers at once on a 1-level request -> one 200, one 409, one approved trail", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    const [a, b] = await Promise.all([
      act("supA", reqId, "approve"),
      act("supB", reqId, "approve"),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const t = await trails(reqId);
    expect(t.filter((x) => x.action === "approved").length).toBe(1);
    expect(t.length).toBe(2);
  });

  test("BR-APR-30 withdrawn request cannot be approved -> 409", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await act("req", reqId, "withdraw", undefined)).status).toBe(200);
    const res = await act("supA", reqId, "approve");
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("APPROVAL_NOT_PENDING");
  });
});

describe("BR-APR-31 step match", () => {
  test("BR-APR-31 role step: wrong role -> 403, nothing changes", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    const res = await act("ap1", reqId, "approve");
    expect(res.status).toBe(403);
    expect((await reqRow(reqId))?.status).toBe("pending_approval");
    expect((await trails(reqId)).length).toBe(1);
  });

  test("BR-APR-31 specific step: another employee -> 403; the named one -> 200", async () => {
    await setPolicy(PRIO_MISC, [empStep(1, "ap1")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await act("ap2", reqId, "approve")).status).toBe(403);
    expect((await act("ap1", reqId, "approve")).status).toBe(200);
  });

  test("BR-APR-31 reject and send back also need the step match -> 403", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await act("plain", reqId, "reject")).status).toBe(403);
    expect((await act("plain", reqId, "sent_back")).status).toBe(403);
    expect((await reqRow(reqId))?.status).toBe("pending_approval");
  });

  test("BR-APR-31 a role change moves the right to act with it", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    try {
      await moveRole("supB", "other");
      await moveRole("plain", "sup");
      expect((await act("supB", reqId, "approve")).status).toBe(403);
      expect((await act("plain", reqId, "approve")).status).toBe(200);
    } finally {
      await moveRole("supB", "sup");
      await moveRole("plain", "plain");
    }
  });
});

describe("BR-APR-33 no self-approval block, one level each", () => {
  test("BR-APR-33 requester who matches the step approves their own request", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("supA");
    const reqId = await submitOk("supA", "pr", pr.id);
    expect((await act("supA", reqId, "approve")).status).toBe(200);
    expect((await prRow(pr.id))?.status).toBe("approved");
  });

  test("BR-APR-33 same employee cannot approve two levels -> 403 APPROVAL_ALREADY_ACTED; another can", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup"), roleStep(2, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await act("supA", reqId, "approve")).status).toBe(200);
    const res = await act("supA", reqId, "approve");
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe("APPROVAL_ALREADY_ACTED");
    expect((await trails(reqId)).length).toBe(2);
    expect((await act("supB", reqId, "approve")).status).toBe(200);
  });

  test("BR-APR-33 the inbox hides a request the employee already approved a level of", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup"), roleStep(2, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    const seen = async (tag: string) =>
      (
        (await inboxDocIds(tag)).body.data as unknown as {
          docId: number;
          docType: string;
        }[]
      ).some((r) => r.docId === pr.id && r.docType === "pr");
    expect(await seen("supA")).toBe(true);
    await act("supA", reqId, "approve");
    expect(await seen("supA")).toBe(false);
    expect(await seen("supB")).toBe(true);
  });
});

describe("BR-APR-35 approve levels", () => {
  test("BR-APR-35 2-step: L1 keeps PR pending at 2 of 2; L2 approves with approvedBy = L2 approver and completedAt", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup"), empStep(2, "ap1")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    const r1 = await act("supA", reqId, "approve");
    expect(r1.status).toBe(200);
    const d1 = (await json(r1)).data as Record<string, unknown>;
    expect(d1.status).toBe("pending_approval");
    expect(d1.currentLevel).toBe(2);
    expect(d1.currentApproverEmployeeId).toBe(emp.ap1 as number);
    let row = await prRow(pr.id);
    expect(row?.status).toBe("pending_approval");
    expect(row?.currentApprovalLevel).toBe(2);
    expect(row?.approvedBy).toBeNull();

    const r2 = await act("ap1", reqId, "approve");
    expect(r2.status).toBe(200);
    const rr = await reqRow(reqId);
    expect(rr?.status).toBe("approved");
    expect(rr?.completedAt).toBeTruthy();
    row = await prRow(pr.id);
    expect(row?.status).toBe("approved");
    expect(row?.approvedBy).toBe(emp.ap1 as number);
    expect((await trails(reqId)).map((x) => x.action)).toEqual([
      "submitted",
      "approved",
      "approved",
    ]);
  });

  test("BR-APR-35 PO: last-level approve -> PO approved with approvedBy", async () => {
    await setPolicy(PRIO_PO, [roleStep(1, "sup")]);
    const po = await mkPo("req");
    const reqId = await submitOk("req", "po", po.id);
    expect((await act("supA", reqId, "approve")).status).toBe(200);
    const row = await poRow(po.id);
    expect(row?.status).toBe("approved");
    expect(row?.approvedBy).toBe(emp.supA as number);
  });
});

describe("BR-APR-37 comment required, reject, send back", () => {
  for (const action of ["approve", "reject", "sent_back"] as const) {
    test(`BR-APR-37 ${action} without a comment -> 400 APPROVAL_NOTES_REQUIRED, nothing changes`, async () => {
      await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
      const pr = await mkPr("req");
      const reqId = await submitOk("req", "pr", pr.id);
      for (const notes of [undefined, "", "   "]) {
        const res = await act("supA", reqId, action, notes);
        expect(res.status).toBe(400);
        expect((await json(res)).code).toBe("APPROVAL_NOTES_REQUIRED");
      }
      expect((await reqRow(reqId))?.status).toBe("pending_approval");
      expect((await prRow(pr.id))?.status).toBe("pending_approval");
      expect((await trails(reqId)).length).toBe(1);
    });
  }

  test("BR-APR-37 reject with comment -> request rejected, PR rejected, one rejected trail with the note", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await act("supA", reqId, "reject", "rate too high")).status).toBe(
      200,
    );
    expect((await reqRow(reqId))?.status).toBe("rejected");
    expect((await prRow(pr.id))?.status).toBe("rejected");
    const t = await trails(reqId);
    expect(t.length).toBe(2);
    expect(t[1]?.action).toBe("rejected");
    expect(t[1]?.notes).toBe("rate too high");
  });

  test("BR-APR-37 send back -> request require_more_info, PR draft and editable by its creator", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await act("supA", reqId, "sent_back", "add quote")).status).toBe(
      200,
    );
    expect((await reqRow(reqId))?.status).toBe("require_more_info");
    expect((await prRow(pr.id))?.status).toBe("draft");
    const edit = await call("req", "PATCH", "/api/pr/updatepr", {
      prId: pr.id,
      notes: "TEST_aprreq edited after send back",
      inserts: [],
      updates: [],
      deletes: [],
    });
    expect(edit.status).toBe(200);
  });
});

describe("BR-APR-39 withdraw", () => {
  test("BR-APR-39 requester withdraws without a reason -> request cancelled, PR draft (not cancelled)", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await act("req", reqId, "withdraw", undefined)).status).toBe(200);
    expect((await reqRow(reqId))?.status).toBe("cancelled");
    const row = await prRow(pr.id);
    expect(row?.status).toBe("draft");
    expect(row?.cancelledAt).toBeNull();
    expect((await trails(reqId)).length).toBe(2);
  });

  test("BR-APR-39 an approver tries to withdraw -> 403, request still pending", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await act("supA", reqId, "withdraw", undefined)).status).toBe(403);
    expect((await reqRow(reqId))?.status).toBe("pending_approval");
    expect((await trails(reqId)).length).toBe(1);
  });

  test("BR-APR-39 PO withdrawn -> PO draft", async () => {
    await setPolicy(PRIO_PO, [roleStep(1, "sup")]);
    const po = await mkPo("req");
    const reqId = await submitOk("req", "po", po.id);
    expect(
      (await act("req", reqId, "withdraw", "changed my mind")).status,
    ).toBe(200);
    expect((await poRow(po.id))?.status).toBe("draft");
  });
});

describe("BR-APR-40 one trail row per action", () => {
  test("BR-APR-40 each action adds exactly one row with level, actor, note", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup"), empStep(2, "ap1")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await trails(reqId)).length).toBe(1);
    await act("supA", reqId, "approve", "first ok");
    let t = await trails(reqId);
    expect(t.length).toBe(2);
    expect(t[1]?.level).toBe(1);
    expect(t[1]?.actionBy).toBe(emp.supA as number);
    expect(t[1]?.notes).toBe("first ok");
    await act("ap1", reqId, "reject", "no");
    t = await trails(reqId);
    expect(t.length).toBe(3);
    expect(t[2]?.level).toBe(2);
    expect(t[2]?.actionBy).toBe(emp.ap1 as number);
  });

  test("BR-APR-40 a failed action (403) writes no trail row", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    await act("ap1", reqId, "approve");
    expect((await trails(reqId)).length).toBe(1);
  });

  test("BR-APR-40 no API edits or deletes trail rows", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    for (const method of ["DELETE", "PATCH", "PUT"]) {
      const res = await call(
        "supA",
        method,
        `/api/approval/getRequestTrail/${reqId}`,
      );
      expect([404, 405]).toContain(res.status);
    }
    expect((await trails(reqId)).length).toBe(1);
  });
});

// ─── Document status ─────────────────────────────────────────────────────────

describe("BR-APR-42 PR status follows the outcome table", () => {
  test("BR-APR-42 PR: pending -> pending_approval, approved -> approved", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    expect((await prRow(pr.id))?.status).toBe("pending_approval");
    await act("supA", reqId, "approve");
    expect((await prRow(pr.id))?.status).toBe("approved");
  });

  test("BR-APR-42 PR: reject -> rejected; sent back and withdraw -> draft", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const a = await mkPr("req");
    await act("supA", await submitOk("req", "pr", a.id), "reject");
    expect((await prRow(a.id))?.status).toBe("rejected");
    const b = await mkPr("req");
    await act("supA", await submitOk("req", "pr", b.id), "sent_back");
    expect((await prRow(b.id))?.status).toBe("draft");
    const c = await mkPr("req");
    await act("req", await submitOk("req", "pr", c.id), "withdraw", undefined);
    expect((await prRow(c.id))?.status).toBe("draft");
  });
});

describe("BR-APR-43 rejected PO", () => {
  test("BR-APR-43 reject -> PO cancelled, its PR line cancelled, single-line PR cancelled", async () => {
    await setPolicy(PRIO_PO, [roleStep(1, "sup")]);
    const po = await mkPo("req", { withPr: true });
    const reqId = await submitOk("req", "po", po.id);
    expect((await act("supA", reqId, "reject", "not needed")).status).toBe(200);
    expect((await reqRow(reqId))?.status).toBe("rejected");
    expect((await poRow(po.id))?.status).toBe("cancelled");
    const [line] = await db
      .select()
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.id, po.pr?.lineId as number));
    expect(line?.status).toBe("cancelled");
    expect((await prRow(po.pr?.id as number))?.status).toBe("cancelled");
  });

  test("BR-APR-43 cancelling a PO also cancels its PR lines, never back to pending", async () => {
    const po = await mkPo("req", { withPr: true });
    const res = await call("req", "DELETE", `/api/po/deletepo/${po.id}`, {
      reason: "wrong supplier",
    });
    expect(res.status).toBe(200);
    const [line] = await db
      .select()
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.id, po.pr?.lineId as number));
    expect(line?.status).toBe("cancelled");
  });

  test("BR-APR-43 PO sent back is not cancelled: PO draft, PR line untouched", async () => {
    await setPolicy(PRIO_PO, [roleStep(1, "sup")]);
    const po = await mkPo("req", { withPr: true });
    const reqId = await submitOk("req", "po", po.id);
    await act("supA", reqId, "sent_back", "fix price");
    expect((await poRow(po.id))?.status).toBe("draft");
    const [line] = await db
      .select()
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.id, po.pr?.lineId as number));
    expect(line?.status).toBe("po_draft");
  });
});

describe("BR-APR-45 approvedBy", () => {
  test("BR-APR-45 approvedBy stays empty after reject, send back, withdraw and mid-chain approve", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup"), empStep(2, "ap1")]);
    const mid = await mkPr("req");
    await act("supA", await submitOk("req", "pr", mid.id), "approve");
    expect((await prRow(mid.id))?.approvedBy).toBeNull();

    const rej = await mkPr("req");
    await act("supA", await submitOk("req", "pr", rej.id), "reject");
    expect((await prRow(rej.id))?.approvedBy).toBeNull();

    // L1 approved, then L2 sends back: the earlier approver must not remain as approvedBy
    const sb = await mkPr("req");
    const sbReq = await submitOk("req", "pr", sb.id);
    await act("supA", sbReq, "approve");
    await act("ap1", sbReq, "sent_back");
    expect((await prRow(sb.id))?.approvedBy).toBeNull();

    const wd = await mkPr("req");
    await act("req", await submitOk("req", "pr", wd.id), "withdraw", undefined);
    expect((await prRow(wd.id))?.approvedBy).toBeNull();
  });

  test("BR-APR-45 doc level fields show the latest request after a resubmit", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup"), empStep(2, "ap1")]);
    const pr = await mkPr("req");
    const first = await submitOk("req", "pr", pr.id);
    await act("supA", first, "sent_back");
    await submitOk("req", "pr", pr.id);
    const row = await prRow(pr.id);
    expect(row?.status).toBe("pending_approval");
    expect(row?.currentApprovalLevel).toBe(1);
    expect(row?.totalApprovalLevels).toBe(2);
    expect(row?.approvedBy).toBeNull();
  });
});

describe("BR-APR-29 resubmit", () => {
  test("BR-APR-29 resubmit after send back and after withdraw creates new requests; old ones and trails stay", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const r1 = await submitOk("req", "pr", pr.id);
    await act("supA", r1, "sent_back");
    const r2 = await submitOk("req", "pr", pr.id);
    await act("req", r2, "withdraw", undefined);
    const r3 = await submitOk("req", "pr", pr.id);
    expect(new Set([r1, r2, r3]).size).toBe(3);
    expect((await reqRow(r1))?.status).toBe("require_more_info");
    expect((await reqRow(r2))?.status).toBe("cancelled");
    expect((await reqRow(r3))?.status).toBe("pending_approval");
    expect((await trails(r1)).length).toBe(2);
    expect((await trails(r2)).length).toBe(2);
    expect((await requestsOf("pr", pr.id)).length).toBe(3);
  });
});

describe("BR-APR-46 status written only by approval", () => {
  for (const status of ["approved", "pending_approval", "rejected"]) {
    test(`BR-APR-46 PATCH /pr/updatepr with status ${status} -> 400`, async () => {
      const pr = await mkPr("req");
      const res = await call("req", "PATCH", "/api/pr/updatepr", {
        prId: pr.id,
        status,
        inserts: [],
        updates: [],
        deletes: [],
      });
      expect(res.status).toBe(400);
      expect((await prRow(pr.id))?.status).toBe("draft");
    });
  }
});

describe("BR-APR-47 locked while pending", () => {
  test("BR-APR-47 pending PR edit -> 409 PR_NOT_EDITABLE", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    await submitOk("req", "pr", pr.id);
    const res = await call("req", "PATCH", "/api/pr/updatepr", {
      prId: pr.id,
      notes: "TEST_aprreq sneaky edit",
      inserts: [],
      updates: [],
      deletes: [],
    });
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("PR_NOT_EDITABLE");
  });

  test("BR-APR-47 pending PO edit -> 409 DOC_LOCKED_IN_APPROVAL", async () => {
    await setPolicy(PRIO_PO, [roleStep(1, "sup")]);
    const po = await mkPo("req");
    await submitOk("req", "po", po.id);
    const res = await call("req", "PATCH", "/api/po/updatepo", {
      poId: po.id,
      notes: "TEST_aprreq sneaky edit",
      inserts: [],
      updates: [],
      deletes: [],
    });
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("DOC_LOCKED_IN_APPROVAL");
  });

  test("BR-APR-47 after withdraw the PO can be edited again", async () => {
    await setPolicy(PRIO_PO, [roleStep(1, "sup")]);
    const po = await mkPo("req");
    const reqId = await submitOk("req", "po", po.id);
    await act("req", reqId, "withdraw", undefined);
    const res = await call("req", "PATCH", "/api/po/updatepo", {
      poId: po.id,
      notes: "TEST_aprreq edit after withdraw",
      inserts: [],
      updates: [],
      deletes: [],
    });
    expect(res.status).toBe(200);
  });
});

describe("BR-APR-48 cancelling the doc cancels the request", () => {
  test("BR-APR-48 cancel pending PO with a reason -> request cancelled, trail cancelled by the canceller with the reason", async () => {
    await setPolicy(PRIO_PO, [roleStep(1, "sup")]);
    const po = await mkPo("req");
    const reqId = await submitOk("req", "po", po.id);
    const res = await call("req2", "DELETE", `/api/po/deletepo/${po.id}`, {
      reason: "wrong supplier",
    });
    expect(res.status).toBe(200);
    expect((await poRow(po.id))?.status).toBe("cancelled");
    expect((await reqRow(reqId))?.status).toBe("cancelled");
    const t = await trails(reqId);
    expect(t.length).toBe(2);
    expect(t[1]?.action).toBe("cancelled");
    expect(t[1]?.actionBy).toBe(emp.req2 as number);
    expect(t[1]?.notes).toBe("wrong supplier");
  });

  test("BR-APR-48 cancel pending PR with a reason -> request cancelled, PR cancelled", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    const res = await call("req", "DELETE", `/api/pr/deletepr/${pr.id}`, {
      reason: "not needed any more",
    });
    expect(res.status).toBe(200);
    expect((await prRow(pr.id))?.status).toBe("cancelled");
    expect((await reqRow(reqId))?.status).toBe("cancelled");
    const t = await trails(reqId);
    expect(t[t.length - 1]?.action).toBe("cancelled");
    expect(t[t.length - 1]?.notes).toBe("not needed any more");
  });
});

// ─── Reading ─────────────────────────────────────────────────────────────────

describe("BR-APR-51 read rule", () => {
  test("BR-APR-51 view_all, requester and chain approver may read; others 403 (details, trail, current, history)", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup"), empStep(2, "ap1")]);
    const pr = await mkPr("req");
    const reqId = await submitOk("req", "pr", pr.id);
    const urls = [
      `/api/approval/getRequestDetails/${reqId}`,
      `/api/approval/getRequestTrail/${reqId}`,
      `/api/approval/getCurrentApprovalByDoc/pr/${pr.id}`,
      `/api/approval/getApprovalHistory/pr/${pr.id}`,
    ];
    for (const url of urls) {
      for (const who of ["viewer", "req", "supA", "ap1"]) {
        expect([who, url, (await call(who, "GET", url)).status]).toEqual([
          who,
          url,
          200,
        ]);
      }
      for (const who of ["plain", "req2", "ap2"]) {
        expect([who, url, (await call(who, "GET", url)).status]).toEqual([
          who,
          url,
          403,
        ]);
      }
    }
  });

  test("BR-APR-51 not logged in -> 401", async () => {
    expect(
      (await call(null, "GET", "/api/approval/getRequestDetails/1")).status,
    ).toBe(401);
  });
});

describe("BR-APR-52 my pending approvals", () => {
  test("BR-APR-52 lists pending requests for my role and for me by name; not others", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const byRole = await mkPr("req");
    await submitOk("req", "pr", byRole.id);
    await setPolicy(PRIO_MISC, [empStep(1, "ap1")]);
    const byName = await mkPr("req");
    await submitOk("req", "pr", byName.id);
    const has = async (tag: string, docId: number) =>
      (
        (await inboxDocIds(tag)).body.data as unknown as { docId: number }[]
      ).some((r) => r.docId === docId);
    expect(await has("supA", byRole.id)).toBe(true);
    expect(await has("supA", byName.id)).toBe(false);
    expect(await has("ap1", byName.id)).toBe(true);
    expect(await has("ap1", byRole.id)).toBe(false);
    expect(await has("plain", byRole.id)).toBe(false);
  });

  test("BR-APR-52 another employee's list without view_others_pending -> 403", async () => {
    const { res } = await inboxDocIds("supB", emp.supA);
    expect(res.status).toBe(403);
  });

  test("BR-APR-52 with view_others_pending -> 200 showing that employee's list", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup")]);
    const pr = await mkPr("req");
    await submitOk("req", "pr", pr.id);
    const { res, body } = await inboxDocIds("vothers", emp.supA);
    expect(res.status).toBe(200);
    expect(
      (body.data as unknown as { docId: number }[]).some(
        (r) => r.docId === pr.id,
      ),
    ).toBe(true);
  });

  test("BR-APR-52 inactive target -> 404", async () => {
    const { res } = await inboxDocIds("vothers", emp.inactive);
    expect(res.status).toBe(404);
  });

  test("BR-APR-52 own employeeId is allowed without the key", async () => {
    const { res } = await inboxDocIds("supA", emp.supA);
    expect(res.status).toBe(200);
  });
});

describe("BR-APR-54 history", () => {
  test("BR-APR-54 newest request first, each with its trail oldest first; live state on the first", async () => {
    await setPolicy(PRIO_MISC, [roleStep(1, "sup"), empStep(2, "ap1")]);
    const pr = await mkPr("req");
    const r1 = await submitOk("req", "pr", pr.id);
    await act("supA", r1, "sent_back", "redo");
    const r2 = await submitOk("req", "pr", pr.id);
    await act("supA", r2, "approve", "ok");
    const res = await call(
      "req",
      "GET",
      `/api/approval/getApprovalHistory/pr/${pr.id}`,
    );
    expect(res.status).toBe(200);
    const list = (await json(res)).data as unknown as {
      id: number;
      status: string;
      currentLevel: number;
      totalLevels: number;
      trail: { action: string }[];
    }[];
    expect(list.map((r) => r.id)).toEqual([r2, r1]);
    expect(list[0]?.status).toBe("pending_approval");
    expect(list[0]?.currentLevel).toBe(2);
    expect(list[0]?.totalLevels).toBe(2);
    expect(list[0]?.trail.map((t) => t.action)).toEqual([
      "submitted",
      "approved",
    ]);
    expect(list[1]?.status).toBe("require_more_info");
    expect(list[1]?.trail.length).toBe(2);
    expect(list[1]?.trail[0]?.action).toBe("submitted");
  });

  test("BR-APR-54 a document never submitted has an empty history", async () => {
    const pr = await mkPr("req");
    const res = await call(
      "req",
      "GET",
      `/api/approval/getApprovalHistory/pr/${pr.id}`,
    );
    expect(res.status).toBe(200);
    expect((await json(res)).data as unknown).toEqual([]);
  });
});

describe("BR-APR-50 unused statuses", () => {
  test("BR-APR-50 no request or trail written by this file used partial_ordered, fully_ordered or auto_approved status", async () => {
    const ids = Object.values(emp);
    const reqs = await db
      .select({ status: approvalRequests.status })
      .from(approvalRequests)
      .where(inArray(approvalRequests.requestedBy, ids));
    expect(reqs.length).toBeGreaterThan(0);
    for (const r of reqs) {
      expect([
        "pending_approval",
        "approved",
        "rejected",
        "require_more_info",
        "cancelled",
      ]).toContain(r.status);
    }
  });
});
