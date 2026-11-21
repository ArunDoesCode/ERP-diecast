/**
 * docs/specs/factory-flows (v1, frozen) - scenario: a two-level approval chain and who may read the document
 * while it moves (read-via-approval rule), plus sent back / withdrawn / deactivated cases.
 * BR ids: BR-FF-02, 04, 20, 53, 78, 79, 82, 84, 90, 93, 94.
 * Chain: level 1 = role apr1, level 2 = role apr2. Neither role holds pr.manage. Requester R holds pr.manage;
 * requester R2 holds no key. Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
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
  purchaseRequestItems,
  purchaseRequests,
} from "../../src/db/schemas/02_procurement-purchasing";
import { employees } from "../../src/db/schemas/03_hcm";
import { invalidateActor } from "../../src/lib/auth-middleware";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const P = "test_ffread_";
const RUN = `TEST_ffread_${Date.now()}`;
const PRIO = -97203;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

// biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
type Json = any;
type Tag = "R" | "R2" | "A1" | "A1b" | "A2" | "Z";
const ROLE_OF: Record<Tag, string> = {
  R: "req",
  R2: "reqnokey",
  A1: "apr1",
  A1b: "apr1",
  A2: "apr2",
  Z: "plain",
};
const emp = {} as Record<Tag, number>;
const token = {} as Record<Tag, string>;
const roleId: Record<string, number> = {};
let itemId = 0;
const prIds: number[] = [];

async function call(tag: Tag, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${token[tag]}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as Json;
  return { status: res.status, json };
}
async function ok(
  tag: Tag,
  method: string,
  path: string,
  body?: unknown,
  status = 200,
): Promise<Json> {
  const r = await call(tag, method, path, body);
  if (r.status !== status) {
    throw new Error(
      `${method} ${path} as ${tag} -> ${r.status} ${JSON.stringify(r.json)}`,
    );
  }
  return r.json.data;
}
const view = (tag: Tag, prId: number) =>
  call(tag, "GET", `/api/approval/getDocumentView/pr/${prId}`);
const act = (tag: Tag, requestId: number, action: string, notes?: string) =>
  call(tag, "POST", `/api/approval/actOnRequest/${requestId}`, {
    action,
    ...(notes === undefined ? {} : { notes }),
  });
async function tileCount(tag: Tag, key: string) {
  const r = await call(tag, "GET", `/api/home/getcounts?tiles=${key}`);
  expect(r.status).toBe(200);
  const t = (r.json.data.tiles as Json[]).find((x) => x.key === key);
  return (t?.count ?? 0) as number;
}
async function inbox(tag: Tag, query = "") {
  const r = await call(
    tag,
    "GET",
    `/api/approval/getMyPendingApprovals?pageSize=100${query}`,
  );
  expect(r.status).toBe(200);
  return r.json as Json;
}
const prStatus = async (id: number) =>
  (
    await db
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
  )[0]?.status;

/** Raise a PR as `by` (R holds pr.manage) and submit it. */
async function raiseAndSubmit(by: Tag = "R") {
  const d = await ok(
    by,
    "POST",
    "/api/pr/createpr",
    {
      type: "misc",
      notes: `${RUN} note`,
      items: [{ itemId, requestedQty: 10 }],
    },
    201,
  );
  prIds.push(d.pr.id);
  const s = await ok(
    by,
    "POST",
    "/api/approval/submitRequest",
    { docType: "pr", docId: d.pr.id },
    201,
  );
  return {
    id: d.pr.id as number,
    number: d.pr.prNumber as string,
    requestId: s.id as number,
  };
}

async function cleanup() {
  const mine = (
    await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.email, `${P}%`))
  ).map((e) => e.id);
  if (mine.length) {
    const reqIds = (
      await db
        .select({ id: approvalRequests.id })
        .from(approvalRequests)
        .where(inArray(approvalRequests.requestedBy, mine))
    ).map((r) => r.id);
    if (reqIds.length)
      await db
        .delete(approvalTrails)
        .where(inArray(approvalTrails.requestId, reqIds));
    await db
      .delete(approvalRequests)
      .where(inArray(approvalRequests.requestedBy, mine));
  }
  if (prIds.length) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, prIds));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, prIds));
  }
  await db.delete(approvalPolicies).where(eq(approvalPolicies.priority, PRIO));
  if (itemId) await db.delete(itemMaster).where(eq(itemMaster.id, itemId));
  if (mine.length) {
    await db
      .update(documentNumberCounters)
      .set({ createdBy: null })
      .where(inArray(documentNumberCounters.createdBy, mine));
    await db
      .update(documentNumberCounters)
      .set({ lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.lastUpdatedBy, mine));
  }
  await db.delete(employees).where(like(employees.email, `${P}%`));
  await db.delete(roles).where(like(roles.name, `${P}%`));
}

beforeAll(async () => {
  await cleanup();
  const keys: Record<string, string[]> = {
    req: ["pr.manage"],
    reqnokey: [],
    apr1: [],
    apr2: [],
    plain: [],
  };
  for (const [name, perms] of Object.entries(keys)) {
    const [r] = await db
      .insert(roles)
      .values({ name: `${P}${name}`, isSystem: false })
      .returning({ id: roles.id });
    roleId[name] = r!.id;
    if (perms.length)
      await db
        .insert(rolePermissions)
        .values(
          perms.map((permissionKey) => ({ roleId: r!.id, permissionKey })),
        );
  }
  for (const tag of Object.keys(ROLE_OF) as Tag[]) {
    const [e] = await db
      .insert(employees)
      .values({
        name: `${RUN}_${tag}`,
        email: `${P}${tag.toLowerCase()}@diecast.test`,
        roleId: roleId[ROLE_OF[tag]]!,
        isActive: true,
      })
      .returning({ id: employees.id });
    emp[tag] = e!.id;
    token[tag] = await signAccessToken({
      userId: e!.id,
      userName: `${RUN}_${tag}`,
      role: `${P}${ROLE_OF[tag]}`,
      allowedPages: [],
    });
  }
  await db.insert(approvalPolicies).values({
    name: `${RUN}_pr2`,
    priority: PRIO,
    docType: "pr",
    subDocType: "misc",
    isActive: true,
    autoApprove: false,
    approvalLevels: 2,
    approvalChain: [
      { level: 1, approverType: "role", role: `${P}apr1` },
      { level: 2, approverType: "role", role: `${P}apr2` },
    ],
    createdBy: emp.R,
    lastUpdatedBy: emp.R,
  });
  const [i] = await db
    .insert(itemMaster)
    .values({
      sku: uid(),
      name: `${RUN} item`,
      category: "Raw Material",
      uom: "kg",
    })
    .returning({ id: itemMaster.id });
  itemId = i!.id;
});

afterAll(cleanup);

describe("BR-FF-53 two-level chain", () => {
  let pr: { id: number; number: string; requestId: number };

  test("BR-FF-53 level 1 pending: the level-1 approver reads with amounts and may act; level-2, strangers and key-less direct reads are refused", async () => {
    pr = await raiseAndSubmit();
    const v = await view("A1", pr.id);
    expect(v.status).toBe(200);
    expect(v.json.data.canAct).toBe(true);
    expect(typeof v.json.data.pr.estimatedAmountPaise).toBe("number");
    expect(v.json.data.items.length).toBe(1);

    const a2 = await view("A2", pr.id); // level 2 is not current yet
    expect(a2.status).toBe(403);
    expect(a2.json.code).toBe("FORBIDDEN");
    expect((await view("Z", pr.id)).status).toBe(403);
    // the document endpoints themselves still need the key
    const direct = await call("A1", "GET", `/api/pr/getprdetails/${pr.id}`);
    expect(direct.status).toBe(403);
    expect(direct.json.code).toBe("PERMISSION_DENIED");
    // BR-FF-94: the side panel opens for the approval-path reader
    const panel = await call("A1", "GET", `/api/document/getpanel/pr/${pr.id}`);
    expect(panel.status).toBe(200);
    expect(panel.json.data.approvals.currentLevel).toBe(1);
    expect(panel.json.data.approvals.totalLevels).toBe(2);
    expect(typeof panel.json.data.totals.estimatedAmountPaise).toBe("number");
    // ... but Z gets nothing from the panel either
    expect(
      (await call("Z", "GET", `/api/document/getpanel/pr/${pr.id}`)).status,
    ).toBe(403);
  });

  test("BR-FF-20 BR-FF-02 only the level-1 approver has it on the tile; the tile equals the inbox rows", async () => {
    expect(await tileCount("A1", "approvals")).toBeGreaterThanOrEqual(1);
    expect(await tileCount("A2", "approvals")).toBe(0);
    const b = await inbox("A1");
    expect(await tileCount("A1", "approvals")).toBe(b.meta.total);
    expect((b.data as Json[]).some((r) => r.docNumber === pr.number)).toBe(
      true,
    );
  });

  test("BR-FF-79 the type counts add up to the rows and each type filter returns exactly its count", async () => {
    const all = await inbox("A1");
    const tc = all.meta.typeCounts;
    expect(tc.pr + tc.po + tc.sco).toBe(all.meta.total);
    const prs = await inbox("A1", "&docType=pr");
    expect((prs.data as Json[]).length).toBe(tc.pr);
    const pos = await inbox("A1", "&docType=po");
    expect((pos.data as Json[]).length).toBe(tc.po);
    // typeCounts ignore the docType filter
    expect(prs.meta.typeCounts).toEqual(tc);
  });

  test("BR-FF-82 an empty note is refused at level 1; with a note the request moves to level 2", async () => {
    expect((await act("A1", pr.requestId, "approve")).status).toBe(400);
    expect((await act("A1", pr.requestId, "approve", "")).status).toBe(400);
    expect(await prStatus(pr.id)).toBe("pending_approval");
    const r = await act("A1", pr.requestId, "approve", "level one ok");
    expect(r.status).toBe(200);
    expect(r.json.data.currentLevel).toBe(2);
    expect(await prStatus(pr.id)).toBe("pending_approval");
  });

  test("BR-FF-53 after approving level 1 the approver still reads (own trail row) but cannot act; level 2 now reads and acts", async () => {
    const a1 = await view("A1", pr.id);
    expect(a1.status).toBe(200);
    expect(a1.json.data.canAct).toBe(false);
    const trailNotes = (a1.json.data.trail as Json[]).map(
      (t) => t.notes ?? t.note,
    );
    expect(trailNotes).toContain("level one ok");
    const a2 = await view("A2", pr.id);
    expect(a2.status).toBe(200);
    expect(a2.json.data.canAct).toBe(true);
    expect(await tileCount("A2", "approvals")).toBeGreaterThanOrEqual(1);
    // A1 may not approve a second level (frozen BR-APR-33)
    expect(
      (await act("A1", pr.requestId, "approve", "again")).status,
    ).toBeGreaterThanOrEqual(400);
  });

  test("BR-FF-53 BR-FF-07 final approval: both approvers lose the read, the requester (holds pr.manage) keeps it, counts drop", async () => {
    const before = await tileCount("A2", "approvals");
    expect((await act("A2", pr.requestId, "approve", "final")).status).toBe(
      200,
    );
    expect(await prStatus(pr.id)).toBe("approved");
    expect((await view("A1", pr.id)).status).toBe(403);
    expect((await view("A2", pr.id)).status).toBe(403);
    expect((await view("R", pr.id)).status).toBe(200);
    expect(await tileCount("A2", "approvals")).toBe(before - 1);
  });
});

describe("sent back, withdrawn, deactivated", () => {
  test("BR-FF-90 BR-FF-53 sent back: PR is a draft flagged sent-back with the note in the trail; approver loses the read; resubmit clears the flag and restores it", async () => {
    const pr = await raiseAndSubmit();
    const r = await act("A1", pr.requestId, "sent_back", "split it please");
    expect(r.status).toBe(200);
    expect(await prStatus(pr.id)).toBe("draft");
    expect((await view("A1", pr.id)).status).toBe(403);

    const list = await call(
      "R",
      "GET",
      `/api/pr/getprs?mine=true&q=${encodeURIComponent(pr.number)}`,
    );
    expect(list.status).toBe(200);
    const row = (list.json.data as Json[]).find(
      (x) => x.prNumber === pr.number,
    );
    expect(row.sentBack).toBe(true);
    const tiles = await call(
      "R",
      "GET",
      "/api/home/getcounts?tiles=my_prs_draft",
    );
    expect(tiles.json.data.tiles[0].hint?.kind).toBe("sent_back");
    const panel = await ok("R", "GET", `/api/document/getpanel/pr/${pr.id}`);
    expect(
      (panel.approvals.trail as Json[]).map((t) => t.notes ?? t.note),
    ).toContain("split it please");

    const again = await ok(
      "R",
      "POST",
      "/api/approval/submitRequest",
      { docType: "pr", docId: pr.id },
      201,
    );
    expect(again.id).not.toBe(pr.requestId);
    expect((await view("A1", pr.id)).status).toBe(200); // on the new request's step
    const list2 = await call(
      "R",
      "GET",
      `/api/pr/getprs?mine=true&q=${encodeURIComponent(pr.number)}`,
    );
    expect(
      (list2.json.data as Json[]).find((x) => x.prNumber === pr.number)
        .sentBack,
    ).toBe(false);
  });

  test("BR-FF-84 BR-FF-53 withdrawn while the approver reads: the read is refused, acting is refused, the row leaves the inbox", async () => {
    const pr = await raiseAndSubmit();
    expect((await view("A1", pr.id)).status).toBe(200);
    expect((await act("R", pr.requestId, "withdraw", "mistake")).status).toBe(
      200,
    );
    expect((await view("A1", pr.id)).status).toBe(403);
    const late = await act("A1", pr.requestId, "approve", "too late");
    expect(late.status).toBeGreaterThanOrEqual(400);
    expect(late.status).toBeLessThan(500);
    const rows = (await inbox("A1")).data as Json[];
    expect(rows.some((r) => r.docNumber === pr.number)).toBe(false);
  });

  test("BR-FF-53 a deactivated approver gets no access", async () => {
    const pr = await raiseAndSubmit();
    expect((await view("A1b", pr.id)).status).toBe(200);
    await db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, emp.A1b));
    invalidateActor(emp.A1b);
    const r = await view("A1b", pr.id);
    expect([401, 403]).toContain(r.status);
    expect(JSON.stringify(r.json)).not.toContain(pr.number);
  });

  test("BR-FF-93 a requester without the document key reads their own PR only while it is pending", async () => {
    const [row] = await db
      .insert(purchaseRequests)
      .values({
        prNumber: uid(),
        type: "misc",
        requestedBy: emp.R2,
        status: "draft",
        notes: RUN,
      })
      .returning({
        id: purchaseRequests.id,
        number: purchaseRequests.prNumber,
      });
    prIds.push(row!.id);
    await db.insert(purchaseRequestItems).values({
      prId: row!.id,
      itemId,
      requestedQty: 5,
      uom: "kg",
      status: "pending",
    });
    expect((await view("R2", row!.id)).status).toBe(403); // draft: no request yet
    // R2 holds no pr.manage, so the submit endpoint is closed to them (frozen rule); the request is placed
    // on their behalf (e.g. by a colleague) straight in the DB.
    const [pol] = await db
      .select({ id: approvalPolicies.id })
      .from(approvalPolicies)
      .where(eq(approvalPolicies.priority, PRIO));
    const [s] = await db
      .insert(approvalRequests)
      .values({
        docType: "pr",
        docId: row!.id,
        policyId: pol!.id,
        status: "pending_approval",
        currentLevel: 1,
        totalLevels: 2,
        chainSnapshot: [
          { level: 1, approverType: "role", role: `${P}apr1` },
          { level: 2, approverType: "role", role: `${P}apr2` },
        ],
        currentApproverRole: `${P}apr1`,
        requestedBy: emp.R2,
      })
      .returning({ id: approvalRequests.id });
    await db
      .update(purchaseRequests)
      .set({ status: "pending_approval" })
      .where(eq(purchaseRequests.id, row!.id));
    const v = await view("R2", row!.id);
    expect(v.status).toBe(200);
    expect(v.json.data.canAct).toBe(false);
    expect((await act("A1", s!.id, "reject", "no budget")).status).toBe(200);
    expect(await prStatus(row!.id)).toBe("rejected");
    expect((await view("R2", row!.id)).status).toBe(403);
  });
});
