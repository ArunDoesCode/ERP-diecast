/**
 * docs/specs/factory-flows (v1, frozen) - scenario: the spec's worked example, end to end through HTTP.
 *   S (floor_supervisor) raises a requisition -> B (back_office) approves it -> B makes one draft PO per supplier
 *   -> O (owner) approves, B sends -> S receives goods -> Q (qa_inspector) decides -> open quantity, Home counts,
 *   lists, side panel and access rules follow every step.
 * BR ids: BR-FF-02, 04, 07, 09, 18, 20..23, 24, 27, 28, 42, 43, 44, 46, 48, 50, 51, 53, 55, 61..63, 67, 69,
 * 77, 80, 82, 107, 108, 115.
 * Real seed roles (owner, back_office, floor_supervisor, qa_inspector); counts that cover everybody's documents
 * are asserted as a DELTA because the test DB is shared. Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import {
  approvalPolicies,
  approvalRequests,
  approvalTrails,
} from "../../src/db/schemas/02_procurement-approval";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  grnCorrections,
  grnItems,
  grns,
  poCommunications,
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  qaTests,
} from "../../src/db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const P = "test_ffchain_";
const RUN = `TEST_ffchain_${Date.now()}`;
const PRIO_PR = -97201;
const PRIO_PO = -97202;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;
const DAY = 86_400_000;

// biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
type Json = any;
type Tag = "S" | "B" | "O" | "Q";
const SEED_ROLE: Record<Tag, string> = {
  S: "floor_supervisor",
  B: "back_office",
  O: "owner",
  Q: "qa_inspector",
};
const emp = {} as Record<Tag, number>;
const token = {} as Record<Tag, string>;
const nameOf = (t: Tag) => `${RUN}_${t}`;

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
/** Call and expect `status`; returns `data`. */
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

type Tile = {
  key: string;
  count?: number;
  late?: number;
  today?: number;
  later?: number;
  hint?: { kind: string };
};
async function tile(tag: Tag, key: string): Promise<Tile> {
  const r = await call(tag, "GET", `/api/home/getcounts?tiles=${key}`);
  expect(r.status).toBe(200);
  const t = (r.json.data.tiles as Tile[]).find((x) => x.key === key);
  if (!t) throw new Error(`tile ${key} absent for ${tag}`);
  return t;
}
const cnt = async (tag: Tag, key: string) => (await tile(tag, key)).count ?? 0;

const created = {
  pr: [] as number[],
  po: [] as number[],
  item: [] as number[],
  supplier: [] as number[],
};
let createdLocationId: number | undefined;

async function mkItem(uom: string, name: string) {
  const [i] = await db
    .insert(itemMaster)
    .values({
      sku: uid(),
      name: `${RUN} ${name}`,
      category: "Raw Material",
      uom,
    })
    .returning({ id: itemMaster.id });
  created.item.push(i!.id);
  return i!.id;
}
async function mkSupplier(name: string) {
  const [s] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_${name}` })
    .returning({ id: supplierMaster.id });
  created.supplier.push(s!.id);
  return s!.id;
}

async function cleanup() {
  const mine = (
    await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.email, `${P}%`))
  ).map((e) => e.id);
  const poIds = created.supplier.length
    ? (
        await db
          .select({ id: purchaseOrders.id })
          .from(purchaseOrders)
          .where(inArray(purchaseOrders.supplierId, created.supplier))
      ).map((r) => r.id)
    : [];
  const grnIds = poIds.length
    ? (
        await db
          .select({ id: grns.id })
          .from(grns)
          .where(inArray(grns.poId, poIds))
      ).map((g) => g.id)
    : [];
  const lineIds = grnIds.length
    ? (
        await db
          .select({ id: grnItems.id })
          .from(grnItems)
          .where(inArray(grnItems.grnId, grnIds))
      ).map((l) => l.id)
    : [];
  if (lineIds.length) {
    await db.delete(qaTests).where(inArray(qaTests.grnItemId, lineIds));
    await db
      .delete(grnCorrections)
      .where(inArray(grnCorrections.grnItemId, lineIds));
  }
  if (created.item.length) {
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, created.item));
  }
  if (lineIds.length)
    await db.delete(grnItems).where(inArray(grnItems.id, lineIds));
  if (grnIds.length) await db.delete(grns).where(inArray(grns.id, grnIds));
  const prLineIds = created.pr.length
    ? (
        await db
          .select({ id: purchaseRequestItems.id })
          .from(purchaseRequestItems)
          .where(inArray(purchaseRequestItems.prId, created.pr))
      ).map((l) => l.id)
    : [];
  if (prLineIds.length)
    await db
      .delete(prPoItemLinks)
      .where(inArray(prPoItemLinks.prItemId, prLineIds));
  if (poIds.length) {
    await db
      .delete(poCommunications)
      .where(inArray(poCommunications.poId, poIds));
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, poIds));
  }
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
  if (poIds.length)
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
  if (created.pr.length) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, created.pr));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, created.pr));
  }
  await db
    .delete(approvalPolicies)
    .where(inArray(approvalPolicies.priority, [PRIO_PR, PRIO_PO]));
  if (created.item.length)
    await db.delete(itemMaster).where(inArray(itemMaster.id, created.item));
  await db.delete(supplierMaster).where(like(supplierMaster.name, `${RUN}%`));
  if (createdLocationId)
    await db.delete(locations).where(eq(locations.id, createdLocationId));
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
}

let adc12 = 0;
let lube = 0;
let balaji = 0;
let lubeCo = 0;

beforeAll(async () => {
  for (const tag of ["S", "B", "O", "Q"] as Tag[]) {
    const [r] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, SEED_ROLE[tag]))
      .limit(1);
    if (!r) throw new Error(`seed role ${SEED_ROLE[tag]} missing`);
    const [e] = await db
      .insert(employees)
      .values({
        name: nameOf(tag),
        email: `${P}${tag.toLowerCase()}@diecast.test`,
        roleId: r.id,
        isActive: true,
      })
      .returning({ id: employees.id });
    emp[tag] = e!.id;
    token[tag] = await signAccessToken({
      userId: e!.id,
      userName: nameOf(tag),
      role: SEED_ROLE[tag],
      allowedPages: [],
    });
  }
  const base = {
    isActive: true,
    autoApprove: false,
    approvalLevels: 1,
    createdBy: emp.B,
    lastUpdatedBy: emp.B,
  };
  await db.insert(approvalPolicies).values([
    {
      ...base,
      name: `${RUN}_pr`,
      priority: PRIO_PR,
      docType: "pr",
      subDocType: "misc",
      approvalChain: [{ level: 1, approverType: "role", role: "back_office" }],
    },
    {
      ...base,
      name: `${RUN}_po`,
      priority: PRIO_PO,
      docType: "po",
      subDocType: "any",
      minAmountPaise: 1,
      maxAmountPaise: 100_000_000_000,
      approvalChain: [{ level: 1, approverType: "role", role: "owner" }],
    },
  ]);
  adc12 = await mkItem("kg", "ADC12 ingot");
  lube = await mkItem("L", "die lube");
  balaji = await mkSupplier("Sri Balaji Metals");
  lubeCo = await mkSupplier("Lube Co");
  const [main] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "main_store"))
    .limit(1);
  if (!main) {
    const [loc] = await db
      .insert(locations)
      .values({ name: `${RUN}_main_store`, type: "main_store" })
      .returning({ id: locations.id });
    createdLocationId = loc!.id;
  }
});

afterAll(cleanup);

// State carried from step to step: this file is one story.
let prId = 0;
let prNumber = "";
let prLines: number[] = [];
let prRequestId = 0;
let po1 = { id: 0, number: "", itemId: 0 };
let po2 = { id: 0, number: "" };
let grnA = { id: 0, number: "", lineId: 0 };

const poStatus = async (id: number) =>
  (
    await db
      .select({ status: purchaseOrders.status })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
  )[0]?.status;
const prStatus = async (id: number) =>
  (
    await db
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
  )[0]?.status;
async function pickerRow(poId: number): Promise<Json | undefined> {
  const r = await call(
    "S",
    "GET",
    `/api/grn/getreceivablepos?poId=${poId}&pageSize=100`,
  );
  expect(r.status).toBe(200);
  return (r.json.data as Json[])[0];
}
const moneyKey = /price|paise|gst|rate|amount|value|total|cost/i;
function keysDeep(v: Json, out: string[] = []): string[] {
  if (Array.isArray(v)) {
    for (const x of v) keysDeep(x, out);
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keysDeep(x, out);
    }
  }
  return out;
}
const moneyKeysIn = (v: Json) => keysDeep(v).filter((k) => moneyKey.test(k));

describe("requisition: raise, submit, approve", () => {
  test("BR-FF-18 BR-FF-21 S raises a two-line PR: a draft, counted on S's own tile only", async () => {
    const before = await cnt("S", "my_prs_draft");
    const d = await ok(
      "S",
      "POST",
      "/api/pr/createpr",
      {
        type: "misc",
        notes: `${RUN} split die lube to next month`,
        items: [
          { itemId: adc12, requestedQty: 1000 },
          { itemId: lube, requestedQty: 20 },
        ],
      },
      201,
    );
    prId = d.pr.id;
    prNumber = d.pr.prNumber;
    prLines = d.items.map((i: Json) => i.id);
    created.pr.push(prId);
    expect(d.pr.status).toBe("draft");
    expect(prLines.length).toBe(2);
    expect(await cnt("S", "my_prs_draft")).toBe(before + 1);
    expect(await cnt("B", "my_prs_draft")).toBe(0);
  });

  test("BR-FF-22 BR-FF-20 BR-FF-46 submit moves S's tile draft -> pending and puts the request on B's approvals tile", async () => {
    const draft = await cnt("S", "my_prs_draft");
    const pending = await cnt("S", "my_prs_pending");
    const bApprovals = await cnt("B", "approvals");
    const oApprovals = await cnt("O", "approvals");
    const d = await ok(
      "S",
      "POST",
      "/api/approval/submitRequest",
      { docType: "pr", docId: prId },
      201,
    );
    prRequestId = d.id;
    expect(await cnt("S", "my_prs_draft")).toBe(draft - 1);
    expect(await cnt("S", "my_prs_pending")).toBe(pending + 1);
    expect(await cnt("B", "approvals")).toBe(bApprovals + 1);
    expect(await cnt("O", "approvals")).toBe(oApprovals); // O is not on the step
    expect((await tile("B", "approvals")).hint?.kind).toBe("oldest_since");
  });

  test("BR-FF-80 BR-FF-77 BR-FF-02 B's inbox row: number, requester, own amount; the tile equals the row count", async () => {
    const r = await call(
      "B",
      "GET",
      "/api/approval/getMyPendingApprovals?pageSize=100",
    );
    expect(r.status).toBe(200);
    const row = (r.json.data as Json[]).find((x) => x.docNumber === prNumber);
    expect(row).toBeDefined();
    expect(row.requesterName).toBe(nameOf("S"));
    expect(typeof row.amountPaise).toBe("number");
    expect(row.currentLevel).toBe(1);
    expect(row.totalLevels).toBe(1);
    expect(await cnt("B", "approvals")).toBe(r.json.meta.total);
    const tc = r.json.meta.typeCounts;
    expect(tc.pr + tc.po + tc.sco).toBe(r.json.meta.total);
  });

  test("BR-FF-77 the amount is not sent on another employee's list (view_others_pending holder)", async () => {
    const [sa] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "super-admin"))
      .limit(1);
    const [e] = await db
      .insert(employees)
      .values({
        name: `${RUN}_X`,
        email: `${P}x@diecast.test`,
        roleId: sa!.id,
        isActive: true,
      })
      .returning({ id: employees.id });
    const t = await signAccessToken({
      userId: e!.id,
      userName: `${RUN}_X`,
      role: "super-admin",
      allowedPages: [],
    });
    const res = await app.request(
      `/api/approval/getMyPendingApprovals?employeeId=${emp.B}&pageSize=100`,
      { headers: { Authorization: `Bearer ${t}` } },
    );
    expect(res.status).toBe(200);
    const rows = ((await res.json()) as Json).data as Json[];
    const row = rows.find((x) => x.docNumber === prNumber);
    expect(row).toBeDefined();
    expect("amountPaise" in row).toBe(false);
  });

  test("BR-FF-53 BR-FF-04 B previews lines and note; Q (no key, not in the chain) gets one identical refusal for a real and a missing id", async () => {
    const d = await ok("B", "GET", `/api/approval/getDocumentView/pr/${prId}`);
    expect(d.items.length).toBe(2);
    expect(d.requesterNote).toContain("split die lube");
    expect(d.canAct).toBe(true);
    expect(Array.isArray(d.trail)).toBe(true);

    const real = await call(
      "Q",
      "GET",
      `/api/approval/getDocumentView/pr/${prId}`,
    );
    const missing = await call(
      "Q",
      "GET",
      "/api/approval/getDocumentView/pr/2147483000",
    );
    expect(real.status).toBe(403);
    expect(real.json.code).toBe("FORBIDDEN");
    expect(missing.status).toBe(403);
    expect(missing.json).toEqual(real.json);
    expect(JSON.stringify(real.json)).not.toContain(prNumber);

    expect(
      (await call("Q", "GET", `/api/pr/getprdetails/${prId}`)).status,
    ).toBe(403);
    // B holds pr.manage, so access passes and a missing id is "not found"
    const nf = await call("B", "GET", "/api/document/getpanel/pr/2147483000");
    expect(nf.status).toBe(404);
  });

  test("BR-FF-82 approve without a note is refused and the request stays pending", async () => {
    const r = await call(
      "B",
      "POST",
      `/api/approval/actOnRequest/${prRequestId}`,
      { action: "approve" },
    );
    expect(r.status).toBe(400);
    expect(await prStatus(prId)).toBe("pending_approval");
  });

  test("BR-FF-82 BR-FF-07 BR-FF-23 B approves with a note: PR approved, inbox and tile drop, 'to order' gains it", async () => {
    const approvals = await cnt("B", "approvals");
    const toOrder = await tile("B", "prs_to_order");
    await ok("B", "POST", `/api/approval/actOnRequest/${prRequestId}`, {
      action: "approve",
      notes: "ok",
    });
    expect(await prStatus(prId)).toBe("approved");
    expect(await cnt("B", "approvals")).toBe(approvals - 1);
    const inbox = await call(
      "B",
      "GET",
      "/api/approval/getMyPendingApprovals?pageSize=100",
    );
    expect(
      (inbox.json.data as Json[]).some((x) => x.docNumber === prNumber),
    ).toBe(false);
    const after = await tile("B", "prs_to_order");
    expect((after.count ?? 0) - (toOrder.count ?? 0)).toBe(1);
    // lines carry no required-by date -> counted under "later"
    expect((after.later ?? 0) - (toOrder.later ?? 0)).toBe(1);
    // BR-FF-02: the number equals what the filtered list returns
    const list = await call(
      "B",
      "GET",
      "/api/pr/getprs?toOrder=true&pageSize=100",
    );
    expect(list.status).toBe(200);
    expect(list.json.meta.total).toBe(after.count ?? 0);
    expect(list.json.meta.toOrderCount).toBe(after.count ?? 0);
    expect(
      (list.json.data as Json[]).some((r) => r.prNumber === prNumber),
    ).toBe(true);
  });

  test("BR-FF-53 once decided, a reader without the document key gets the access message", async () => {
    const r = await call(
      "Q",
      "GET",
      `/api/approval/getDocumentView/pr/${prId}`,
    );
    expect(r.status).toBe(403);
  });
});

describe("Create PO: one draft per supplier, then approve and send", () => {
  test("BR-FF-48 BR-FF-91 BR-FF-92 BR-FF-43 two suppliers -> two draft POs; lines show the PO they are on; PR leaves 'to order'", async () => {
    const toOrder = await cnt("B", "prs_to_order");
    const details = await ok("B", "GET", `/api/pr/getprdetails/${prId}`);
    for (const l of details.items as Json[]) {
      expect(l.defaultSupplierId).toBeNull();
      expect(l.suggestedRatePaise ?? 0).toBe(0);
      expect(l.onPoId).toBeNull();
    }
    const exp = new Date(Date.now() + 5 * DAY).toISOString();
    const a = await ok(
      "B",
      "POST",
      "/api/po/createpo",
      {
        supplierId: balaji,
        expectedDeliveryDate: exp,
        lines: [
          { prItemId: prLines[0], unitPricePaise: 24_500, gstPercent: 18 },
        ],
      },
      201,
    );
    const b = await ok(
      "B",
      "POST",
      "/api/po/createpo",
      {
        supplierId: lubeCo,
        expectedDeliveryDate: exp,
        lines: [
          { prItemId: prLines[1], unitPricePaise: 30_000, gstPercent: 18 },
        ],
      },
      201,
    );
    po1 = { id: a.po.id, number: a.po.poNumber, itemId: a.items[0].id };
    po2 = { id: b.po.id, number: b.po.poNumber };
    created.po.push(po1.id, po2.id);
    expect(a.po.status).toBe("draft");
    expect(b.po.status).toBe("draft");
    // 1000 kg x Rs 245 = 24,500,000 paise; GST 18 % = 4,410,000; total 28,910,000
    expect(a.po.subtotalPaise).toBe(24_500_000);
    expect(a.po.taxAmountPaise).toBe(4_410_000);
    expect(a.po.totalAmountPaise).toBe(28_910_000);
    expect(b.po.subtotalPaise).toBe(600_000);

    const after = await ok("B", "GET", `/api/pr/getprdetails/${prId}`);
    const byItem = (id: number) =>
      (after.items as Json[]).find((i) => i.itemId === id);
    expect(byItem(adc12).onPoNumber).toBe(po1.number);
    expect(byItem(lube).onPoNumber).toBe(po2.number);
    expect(await cnt("B", "prs_to_order")).toBe(toOrder - 1);
  });

  test("BR-FF-42 BR-FF-50 BR-FF-51 the PR and PO side panels list each other and the PO totals", async () => {
    const prPanel = await ok("B", "GET", `/api/document/getpanel/pr/${prId}`);
    const linkedPos = (prPanel.linked as Json[]).filter(
      (l) => l.docType === "po",
    );
    expect(linkedPos.map((l) => l.number).sort()).toEqual(
      [po1.number, po2.number].sort(),
    );
    expect(linkedPos.every((l) => l.canOpen === true)).toBe(true);
    expect(prPanel.totals.lineCount).toBe(2);
    expect(typeof prPanel.totals.estimatedAmountPaise).toBe("number");
    expect(prPanel.approvals.totalLevels).toBe(1);
    expect(
      (prPanel.approvals.trail as Json[]).some(
        (t) => t.notes === "ok" || t.note === "ok",
      ),
    ).toBe(true);

    const poPanel = await ok("B", "GET", `/api/document/getpanel/po/${po1.id}`);
    expect(poPanel.totals.subtotalPaise).toBe(24_500_000);
    expect(poPanel.totals.taxAmountPaise).toBe(4_410_000);
    expect(poPanel.totals.totalAmountPaise).toBe(28_910_000);
    expect(poPanel.totals.receivedPct).toBe(0);
    expect(
      (poPanel.linked as Json[]).some(
        (l) => l.docType === "pr" && l.number === prNumber,
      ),
    ).toBe(true);
  });

  test("BR-FF-44 BR-FF-24 PO draft -> submit -> owner approves -> 'to send' -> B sends -> dispatched; the other draft stays untouched", async () => {
    const toSend = await cnt("B", "pos_to_send");
    const sub = await ok(
      "B",
      "POST",
      "/api/approval/submitRequest",
      { docType: "po", docId: po1.id },
      201,
    );
    await ok("O", "POST", `/api/approval/actOnRequest/${sub.id}`, {
      action: "approve",
      notes: "ok",
    });
    expect(await poStatus(po1.id)).toBe("approved");
    expect(await cnt("B", "pos_to_send")).toBe(toSend + 1);

    await ok("B", "POST", `/api/po/${po1.id}/send`, { channel: "phone" });
    expect(await poStatus(po1.id)).toBe("dispatched");
    expect(await cnt("B", "pos_to_send")).toBe(toSend);
    expect(await poStatus(po2.id)).toBe("draft");
  });
});

describe("receiving: picker, GRN, QA, open quantity", () => {
  test("BR-FF-61 BR-FF-62 BR-FF-27 S sees the PO in the picker without any price; PO endpoints stay closed to S", async () => {
    const row = await pickerRow(po1.id);
    expect(row).toBeDefined();
    expect(row.poNumber).toBe(po1.number);
    expect(row.lines.length).toBe(1);
    expect(Number(row.lines[0].openQty)).toBe(1000);
    expect(Number(row.lines[0].pendingQaQty)).toBe(0);
    expect(moneyKeysIn(row)).toEqual([]);
    expect(await cnt("S", "goods_expected")).toBeGreaterThanOrEqual(1);
    expect((await call("S", "GET", "/api/po/getpos")).status).toBe(403);
  });

  test("BR-FF-63 typing part of the supplier name narrows the picker to that order", async () => {
    const r = await call(
      "S",
      "GET",
      `/api/grn/getreceivablepos?q=${encodeURIComponent(`${RUN}_Sri Balaji`)}&pageSize=100`,
    );
    expect(r.status).toBe(200);
    expect((r.json.data as Json[]).map((x) => x.poNumber)).toEqual([
      po1.number,
    ]);
  });

  test("BR-FF-67 BR-FF-09 BR-FF-28 600 kg arrive: GRN is a draft with a pending line; open falls to 400; Q's tile gains one", async () => {
    const toInspect = await cnt("Q", "grns_to_inspect");
    const goodsBefore = await cnt("S", "goods_expected");
    const d = await ok(
      "S",
      "POST",
      "/api/grn/creategrn",
      {
        poId: po1.id,
        challanNo: "CH-11",
        lines: [{ poItemId: po1.itemId, arrivedQty: 600 }],
      },
      201,
    );
    grnA = { id: d.grn.id, number: d.grn.grnNumber, lineId: d.items[0].id };
    expect(d.grn.status).toBe("draft");
    expect(d.items[0].qaStatus).toBe("pending");

    const row = await pickerRow(po1.id);
    expect(Number(row.lines[0].openQty)).toBe(400);
    expect(Number(row.lines[0].pendingQaQty)).toBe(600);
    const det = await ok("B", "GET", `/api/po/getpodetails/${po1.id}`);
    const line = (det.items as Json[])[0];
    expect(Number(line.pendingQaQty)).toBe(600);
    expect(Number(line.openQty)).toBe(400);
    expect(await cnt("Q", "grns_to_inspect")).toBe(toInspect + 1);
    expect(await cnt("S", "goods_expected")).toBe(goodsBefore);
  });

  test("BR-FF-69 a challan used before for this supplier is refused with its number named", async () => {
    const r = await call("S", "POST", "/api/grn/creategrn", {
      poId: po1.id,
      challanNo: "CH-11",
      lines: [{ poItemId: po1.itemId, arrivedQty: 10 }],
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(JSON.stringify(r.json)).toContain("CH-11");
  });

  test("BR-FF-108 BR-FF-115 BR-FF-55 BR-FF-51 Q's GRN list and panel: QA pending, supplier, no money, PO shown as text", async () => {
    const list = await call("Q", "GET", `/api/grn/getgrns?poId=${po1.id}`);
    expect(list.status).toBe(200);
    const row = (list.json.data as Json[]).find((g) => g.id === grnA.id);
    expect(row.supplierName).toBe(`${RUN}_Sri Balaji Metals`);
    expect(row.lineCount).toBe(1);
    expect(row.qaSummary).toBe("pending");
    expect(row.poCanOpen).toBe(false);
    expect(moneyKeysIn(row).filter((k) => !/rate/i.test(k))).toEqual([]);

    const panel = await ok("Q", "GET", `/api/document/getpanel/grn/${grnA.id}`);
    expect(Number(panel.totals.arrivedQty)).toBe(600);
    expect(panel.totals.acceptedQty).toBeNull();
    expect(panel.totals.rejectedQty).toBeNull();
    expect(panel.totals.uom).toBe("kg");
    expect(panel.approvals).toBeNull();
    expect(moneyKeysIn(panel.totals)).toEqual([]);
    const linkedPo = (panel.linked as Json[]).find((l) => l.docType === "po");
    expect(linkedPo.number).toBe(po1.number);
    expect(linkedPo.canOpen).toBe(false);
    expect(moneyKeysIn(linkedPo)).toEqual([]);

    // BR-FF-04: Q typing the PO URL gets nothing
    expect(
      (await call("Q", "GET", `/api/po/getpodetails/${po1.id}`)).status,
    ).toBe(403);
    const pp = await call("Q", "GET", `/api/document/getpanel/po/${po1.id}`);
    expect(pp.status).toBe(403);
    expect(JSON.stringify(pp.json)).not.toContain(po1.number);
  });

  test("BR-FF-09 BR-FF-107 Q accepts 600: stock posted, open stays 400, PO partly received 60 %, Q's tile drops", async () => {
    const toInspect = await cnt("Q", "grns_to_inspect");
    await ok("Q", "POST", `/api/grn/${grnA.id}/lines/${grnA.lineId}/qa`, {
      acceptedQty: 600,
      rejectedQty: 0,
    });
    const ledger = await db
      .select({ qty: inventoryLedger.quantityChange })
      .from(inventoryLedger)
      .where(eq(inventoryLedger.itemId, adc12));
    expect(ledger.reduce((s, r) => s + Number(r.qty), 0)).toBe(600);

    const [line] = await db
      .select({ received: purchaseOrderItems.receivedQty })
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.id, po1.itemId));
    expect(Number(line!.received)).toBe(600);
    const row = await pickerRow(po1.id);
    expect(Number(row.lines[0].openQty)).toBe(400);
    expect(Number(row.lines[0].pendingQaQty)).toBe(0);
    expect(Number(row.lines[0].receivedQty)).toBe(600);
    expect(await cnt("Q", "grns_to_inspect")).toBe(toInspect - 1);

    const list = await call(
      "B",
      "GET",
      `/api/po/getpos?q=${encodeURIComponent(po1.number)}`,
    );
    const po = (list.json.data as Json[]).find(
      (p) => p.poNumber === po1.number,
    );
    expect(po.status).toBe("partial_received");
    expect(po.receivedPct).toBe(60);
    expect(po.lineCount).toBe(1);

    const panel = await ok("B", "GET", `/api/document/getpanel/po/${po1.id}`);
    expect(panel.totals.receivedPct).toBe(60);
    const g = (panel.linked as Json[]).find((l) => l.docType === "grn");
    expect(g.number).toBe(grnA.number);
    expect(g.qaStatus).toBe("passed");
  });

  test("BR-FF-09 arrived goods pending QA count against open qty; deleting that draft GRN gives them back", async () => {
    const d = await ok(
      "S",
      "POST",
      "/api/grn/creategrn",
      {
        poId: po1.id,
        challanNo: uid(),
        lines: [{ poItemId: po1.itemId, arrivedQty: 300 }],
      },
      201,
    );
    expect(Number((await pickerRow(po1.id))?.lines[0].openQty)).toBe(100);
    const del = await call("S", "DELETE", `/api/grn/deletegrn/${d.grn.id}`);
    expect(del.status).toBe(200);
    expect(Number((await pickerRow(po1.id))?.lines[0].openQty)).toBe(400);
  });

  test("BR-FF-09 rejected goods count as open again", async () => {
    const d = await ok(
      "S",
      "POST",
      "/api/grn/creategrn",
      {
        poId: po1.id,
        challanNo: uid(),
        lines: [{ poItemId: po1.itemId, arrivedQty: 400 }],
      },
      201,
    );
    expect(await pickerRow(po1.id)).toBeUndefined();
    await ok("Q", "POST", `/api/grn/${d.grn.id}/lines/${d.items[0].id}/qa`, {
      acceptedQty: 0,
      rejectedQty: 400,
    });
    const row = await pickerRow(po1.id);
    expect(Number(row?.lines[0].openQty)).toBe(400);
    const list = await call("Q", "GET", `/api/grn/getgrns?poId=${po1.id}`);
    const g = (list.json.data as Json[]).find((x) => x.id === d.grn.id);
    expect(g.qaSummary).toBe("failed");
  });

  test("BR-FF-27 the last 400 kg arrive and are accepted: PO fully received, it leaves the picker and the Goods expected tile", async () => {
    const goods = await cnt("S", "goods_expected");
    const d = await ok(
      "S",
      "POST",
      "/api/grn/creategrn",
      {
        poId: po1.id,
        challanNo: uid(),
        lines: [{ poItemId: po1.itemId, arrivedQty: 400 }],
      },
      201,
    );
    await ok("Q", "POST", `/api/grn/${d.grn.id}/lines/${d.items[0].id}/qa`, {
      acceptedQty: 400,
      rejectedQty: 0,
    });
    expect(await poStatus(po1.id)).toBe("fully_received");
    expect(await pickerRow(po1.id)).toBeUndefined();
    expect(await cnt("S", "goods_expected")).toBe(goods - 1);
    const panel = await ok("B", "GET", `/api/document/getpanel/po/${po1.id}`);
    expect(panel.totals.receivedPct).toBe(100);
  });

  test("BR-FF-42 BR-FF-54 the GRN panel links back to its PO and the PO's PR; history is newest first", async () => {
    const panel = await ok("B", "GET", `/api/document/getpanel/grn/${grnA.id}`);
    const linked = panel.linked as Json[];
    const po = linked.find((l) => l.docType === "po");
    expect(po.number).toBe(po1.number);
    expect(po.canOpen).toBe(true);
    expect(
      linked.some((l) => l.docType === "pr" && l.number === prNumber),
    ).toBe(true);

    const hist = (await ok("B", "GET", `/api/document/getpanel/po/${po1.id}`))
      .history as Json[];
    expect(hist.length).toBeGreaterThanOrEqual(3);
    const times = hist.map((h) => new Date(h.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});
