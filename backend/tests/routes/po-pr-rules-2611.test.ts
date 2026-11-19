/**
 * Rules added or changed 2026-11-19 (see the changelog line of each spec):
 *  BR-INV-05 (PO drafting, #34), BR-PO-26 (list meta counts), BR-PR-48 (PR list q), BR-STD-08 / 12 (PR part).
 * BR-PO-25 is a screen rule (label and no 0 prefill); its backend part is the BR-INV-30 source name,
 * asserted in service/inventoryStock.test.ts.
 * HTTP-level through createApp(), real DB. Written by test-writer from the spec only.
 * Fixture shortcut (not a production path): approved PRs and their lines are inserted straight into
 * the tables so no approval policy is needed.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import { itemMaster } from "../../src/db/schemas/02_procurement-catalog";
import {
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
} from "../../src/db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const RUN = `TEST_pon_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;
let actorId = 0;
let bearer = "";
let supplierId = 0;
let supplierName = "";

type Rec = Record<string, unknown>;
const need = <T>(v: T | undefined | null, what: string): T => {
  if (v === undefined || v === null) throw new Error(`Fixture: ${what}`);
  return v;
};

async function call(method: string, path: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.request(path, init);
  return {
    status: res.status,
    json: (await res.json().catch(() => ({}))) as Rec,
  };
}

async function mkItem(isActive = true) {
  const [it] = await db
    .insert(itemMaster)
    .values({
      sku: uid(),
      name: `${RUN} item`,
      category: "Consumable",
      uom: "kg",
      averageCostPaise: 1000,
      isActive,
    })
    .returning({ id: itemMaster.id });
  return need(it, "item").id;
}

async function mkPr(
  o: {
    itemId?: number;
    status?: "draft" | "approved" | "partial_ordered";
    type?: "tooling" | "misc";
    notes?: string;
  } = {},
) {
  const itemId = o.itemId ?? (await mkItem());
  const [pr] = await db
    .insert(purchaseRequests)
    .values({
      prNumber: uid(),
      type: o.type ?? "misc",
      status: o.status ?? "approved",
      requestedBy: actorId,
      notes: o.notes ?? `${RUN} neutral note`,
    })
    .returning({ id: purchaseRequests.id });
  const prId = need(pr, "pr").id;
  const [line] = await db
    .insert(purchaseRequestItems)
    .values({ prId, itemId, requestedQty: 10, uom: "kg" })
    .returning({ id: purchaseRequestItems.id });
  return { prId, itemId, lineId: need(line, "pr line").id };
}

const createPo = (lineIds: number[], extra: Rec = {}) =>
  call("POST", "/api/po/createpo", {
    supplierId,
    expectedDeliveryDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    lines: lineIds.map((prItemId) => ({
      prItemId,
      unitPricePaise: 11000,
      gstPercent: 0,
    })),
    ...extra,
  });

async function cleanup() {
  const ids = (
    await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.email, "test_pon_%"))
  ).map((e) => e.id);
  if (ids.length) {
    const poIds = (
      await db
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(inArray(purchaseOrders.createdBy, ids))
    ).map((p) => p.id);
    if (poIds.length) {
      const poItemIds = (
        await db
          .select({ id: purchaseOrderItems.id })
          .from(purchaseOrderItems)
          .where(inArray(purchaseOrderItems.poId, poIds))
      ).map((i) => i.id);
      if (poItemIds.length)
        await db
          .delete(prPoItemLinks)
          .where(inArray(prPoItemLinks.poItemId, poItemIds));
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
    if (prIds.length) {
      await db
        .delete(purchaseRequestItems)
        .where(inArray(purchaseRequestItems.prId, prIds));
      await db
        .delete(purchaseRequests)
        .where(inArray(purchaseRequests.id, prIds));
    }
    await db
      .update(documentNumberCounters)
      .set({ createdBy: null, lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.createdBy, ids));
    await db
      .update(documentNumberCounters)
      .set({ lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.lastUpdatedBy, ids));
  }
  await db
    .delete(supplierMaster)
    .where(like(supplierMaster.name, "TEST_pon_%"));
  await db.delete(itemMaster).where(like(itemMaster.sku, "TEST_pon_%"));
  await db.delete(employees).where(like(employees.email, "test_pon_%"));
}

beforeAll(async () => {
  await cleanup();
  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"))
    .limit(1);
  const [e] = await db
    .insert(employees)
    .values({
      name: `${RUN}_actor`,
      email: "test_pon_actor@diecast.test",
      roleId: need(sa, "super-admin role").id,
      isActive: true,
    })
    .returning({ id: employees.id });
  actorId = need(e, "employee").id;
  bearer = await signAccessToken({
    userId: actorId,
    userName: `${RUN}_actor`,
    role: "super-admin",
    allowedPages: [],
  });
  supplierName = `${RUN}_SUPPLIER`;
  const [s] = await db
    .insert(supplierMaster)
    .values({
      name: supplierName,
      type: "raw_material",
      defaultPaymentTermsDays: 30,
    })
    .returning({ id: supplierMaster.id });
  supplierId = need(s, "supplier").id;
});

afterAll(cleanup);

describe("BR-INV-05 an inactive item cannot become a PO line (2026-11-19, #34)", () => {
  test("BR-INV-05 control: an approved PR line of an active item drafts a PO", async () => {
    const pr = await mkPr();
    const r = await createPo([pr.lineId]);
    expect(r.status).toBe(201);
  });

  test("BR-INV-05 PR line approved earlier, item deactivated since -> createpo is 400 and no PO is made", async () => {
    const pr = await mkPr();
    await db
      .update(itemMaster)
      .set({ isActive: false })
      .where(eq(itemMaster.id, pr.itemId));
    const r = await createPo([pr.lineId], { notes: `${RUN} inactive-case` });
    expect(r.status).toBe(400);
    const made = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(like(purchaseOrders.notes, `%${RUN} inactive-case%`));
    expect(made).toHaveLength(0);
    const [line] = await db
      .select({ status: purchaseRequestItems.status })
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.id, pr.lineId));
    expect(line?.status).toBe("pending");
  });

  test("BR-INV-05 one inactive item among active lines stops the whole PO (all or nothing)", async () => {
    const good = await mkPr();
    const bad = await mkPr({ itemId: await mkItem(false) });
    const r = await createPo([good.lineId, bad.lineId], {
      notes: `${RUN} mixed-case`,
    });
    expect(r.status).toBe(400);
    const made = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(like(purchaseOrders.notes, `%${RUN} mixed-case%`));
    expect(made).toHaveLength(0);
    const [line] = await db
      .select({ status: purchaseRequestItems.status })
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.id, good.lineId));
    expect(line?.status).toBe("pending");
  });
});

describe("BR-PO-26 PO list meta carries the count of each quick-filter status group (2026-11-19)", () => {
  test("BR-PO-26 meta holds per-status counts for the same search, matching the rows each filter shows", async () => {
    const a = await createPo([(await mkPr()).lineId]);
    const b = await createPo([(await mkPr()).lineId]);
    const c = await createPo([(await mkPr()).lineId]);
    expect([a.status, b.status, c.status]).toEqual([201, 201, 201]);
    const idOf = (r: { json: Rec }) =>
      (r.json.data as { po: { id: number } }).po.id;
    await db
      .update(purchaseOrders)
      .set({ status: "cancelled" })
      .where(eq(purchaseOrders.id, idOf(c)));
    await db
      .update(purchaseOrders)
      .set({ notes: `${RUN} listmeta` })
      .where(inArray(purchaseOrders.id, [idOf(a), idOf(b), idOf(c)]));

    const q = encodeURIComponent(`${RUN} listmeta`);
    const all = await call("GET", `/api/po/getpos?pageSize=100&q=${q}`);
    expect(all.status).toBe(200);
    const meta = all.json.meta as Rec;
    const counts = meta.statusCounts as Record<string, number> | undefined;
    expect(counts).toBeDefined();
    for (const status of ["draft", "cancelled"]) {
      const rows = await call(
        "GET",
        `/api/po/getpos?pageSize=100&status=${status}&q=${q}`,
      );
      const rowCount = (rows.json.data as unknown[]).length;
      expect(rowCount).toBeGreaterThan(0);
      expect(counts?.[status]).toBe(rowCount);
      // the counts ignore the status filter: same object when a status is chosen
      expect(
        (rows.json.meta as Rec).statusCounts as Record<string, number>,
      ).toEqual(counts as Record<string, number>);
    }
  });

  test("BR-PO-26 PR list meta.statusCounts: row count per status for the same search, ignoring the status filter", async () => {
    const tag = `${RUN} prmeta`;
    const d1 = await mkPr({ status: "draft", notes: tag });
    const d2 = await mkPr({ status: "draft", notes: tag });
    const ap = await mkPr({ status: "approved", notes: tag });
    expect([d1.prId, d2.prId, ap.prId].every(Boolean)).toBe(true);
    const q = encodeURIComponent(tag);
    const all = await call("GET", `/api/pr/getprs?pageSize=100&q=${q}`);
    expect(all.status).toBe(200);
    const counts = (all.json.meta as Rec).statusCounts as Record<
      string,
      number
    >;
    expect(counts).toBeDefined();
    expect(counts.draft).toBe(2);
    expect(counts.approved).toBe(1);
    const filtered = await call(
      "GET",
      `/api/pr/getprs?pageSize=100&status=draft&q=${q}`,
    );
    expect((filtered.json.data as unknown[]).length).toBe(2);
    expect((filtered.json.meta as Rec).statusCounts).toEqual(counts);
  });
});

describe("BR-PR-48 PR list q matches number and notes only (2026-11-19, #23)", () => {
  const listIds = async (query: string) => {
    const ids: number[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await call(
        "GET",
        `/api/pr/getprs?page=${page}&pageSize=100&${query}`,
      );
      expect(r.status).toBe(200);
      for (const row of r.json.data as { id: number }[]) ids.push(row.id);
      if (page >= ((r.json.meta as { totalPages: number }).totalPages ?? 1))
        break;
    }
    return ids;
  };

  test("BR-PR-48 q=approved does not match the status: an approved PR without the word in number or notes is not returned", async () => {
    const byStatusOnly = await mkPr({ status: "approved" });
    const byNotes = await mkPr({
      status: "draft",
      notes: `${RUN} an approved memo`,
    });
    const ids = await listIds("q=approved");
    expect(ids).toContain(byNotes.prId);
    expect(ids).not.toContain(byStatusOnly.prId);
  });

  test("BR-PR-48 q=tooling does not match the type", async () => {
    const byType = await mkPr({ type: "tooling" });
    const byNotes = await mkPr({
      type: "misc",
      notes: `${RUN} tooling follow-up`,
    });
    const ids = await listIds("q=tooling");
    expect(ids).toContain(byNotes.prId);
    expect(ids).not.toContain(byType.prId);
  });

  test("BR-PR-48 q matches the PR number", async () => {
    const pr = await mkPr();
    const [row] = await db
      .select({ n: purchaseRequests.prNumber })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, pr.prId));
    expect(await listIds(`q=${encodeURIComponent(row?.n ?? "")}`)).toEqual([
      pr.prId,
    ]);
  });

  test("BR-PR-48 status comma list filters through its own param", async () => {
    const ap = await mkPr({ status: "approved" });
    const part = await mkPr({ status: "partial_ordered" });
    const dr = await mkPr({ status: "draft" });
    const ids = await listIds(
      `status=approved,partial_ordered&q=${encodeURIComponent(RUN)}`,
    );
    expect(ids).toContain(ap.prId);
    expect(ids).toContain(part.prId);
    expect(ids).not.toContain(dr.prId);
  });

  test("BR-PR-48 type filters through its own param", async () => {
    const tool = await mkPr({ type: "tooling" });
    const misc = await mkPr({ type: "misc" });
    const ids = await listIds(`type=tooling&q=${encodeURIComponent(RUN)}`);
    expect(ids).toContain(tool.prId);
    expect(ids).not.toContain(misc.prId);
  });
});

describe("BR-STD-08 PR list search after the PR change (2026-11-19)", () => {
  test("BR-STD-08 PR list q=dr_ft matches no PR that lacks the literal text (draft status is not matched, _ is not a wildcard)", async () => {
    const draft = await mkPr({ status: "draft" });
    const r = await call("GET", "/api/pr/getprs?page=1&pageSize=100&q=dr_ft");
    expect(r.status).toBe(200);
    const rows = r.json.data as {
      id: number;
      prNumber: string;
      notes: string | null;
    }[];
    expect(rows.map((x) => x.id)).not.toContain(draft.prId);
    for (const row of rows) {
      expect(`${row.prNumber} ${row.notes ?? ""}`.toLowerCase()).toContain(
        "dr_ft",
      );
    }
  });

  test("BR-STD-08 PR list q with % matches the literal percent only", async () => {
    const lit = await mkPr({ notes: `${RUN} 50% flux` });
    const plain = await mkPr({ notes: `${RUN} 500 flux` });
    const r = await call(
      "GET",
      `/api/pr/getprs?page=1&pageSize=100&q=${encodeURIComponent("50%")}`,
    );
    expect(r.status).toBe(200);
    const ids = (r.json.data as { id: number }[]).map((x) => x.id);
    expect(ids).toContain(lit.prId);
    expect(ids).not.toContain(plain.prId);
  });
});
