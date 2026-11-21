/**
 * Reorder run tests (docs/specs/reorder/spec.md v1): BR-RO-01, 02, 11..14,
 * 16..19, 22, 25, 27, 29, 30. Real DB, full HTTP stack via createApp().
 * Fixtures are TEST_ro_r_ prefixed and removed in afterAll.
 * Not covered here: the daily timer (BR-RO-10, no exported interface to call).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, or, sql } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import {
  approvalRequests,
  approvalTrails,
} from "../../src/db/schemas/02_procurement-approval";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  reorderRunItems,
  reorderRuns,
  reorderSettings,
  reorderSettingsHistory,
} from "../../src/db/schemas/02_procurement-reorder";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

type Role = "owner" | "back_office" | "floor_supervisor" | "qa_inspector";

const app = createApp();
const RUN = `TEST_ro_r_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

type Actor = { id: number; token: string };
const actors = new Map<string, Actor>();
const ROLE_OF: Record<string, Role> = {
  owner: "owner",
  bo: "back_office",
  ravi: "back_office",
  fs: "floor_supervisor",
};

async function mkEmployee(
  tag: string,
  roleName: string,
  isActive = true,
): Promise<number> {
  const [r] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  if (!r) throw new Error(`seed role ${roleName} missing`);
  const [e] = await db
    .insert(employees)
    .values({ name: `${RUN}_${tag}`, roleId: r.id, isActive })
    .returning({ id: employees.id });
  return e!.id;
}

async function actor(key: string): Promise<Actor> {
  let a = actors.get(key);
  if (!a) {
    const role = ROLE_OF[key]!;
    const id = await mkEmployee(key, role);
    a = {
      id,
      token: await signAccessToken({
        userId: id,
        userName: `${RUN}_${key}`,
        role,
        allowedPages: [],
      }),
    };
    actors.set(key, a);
  }
  return a;
}

async function call(
  method: string,
  path: string,
  who: string | null,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (who) headers.Authorization = `Bearer ${(await actor(who)).token}`;
  const res = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const extraEmployeeIds: number[] = [];
const itemIds: number[] = [];
const locationIds: number[] = [];
const poIds: number[] = [];
const seededRunIds: number[] = [];
let supplierId = 0;
let mainStoreId = 0;

async function setOwner(who: string) {
  const r = await call("PATCH", "/api/reorder/settings", "bo", {
    draftOwnerId: (await actor(who)).id,
  });
  if (r.status !== 200) throw new Error(`fixture owner: ${r.status}`);
}

async function resetSettings() {
  await db
    .update(reorderSettings)
    .set({ enabled: false, runHour: 7, draftOwnerId: null, updatedBy: null })
    .where(eq(reorderSettings.id, 1));
}

type ItemInsert = typeof itemMaster.$inferInsert;
async function mkItem(over: Partial<ItemInsert> = {}) {
  const [it] = await db
    .insert(itemMaster)
    .values({
      sku: uid(),
      name: `${RUN} item`,
      category: "Raw Material",
      uom: "kg",
      reorderLevel: 0,
      standardRatePaise: 24000,
      ...over,
    })
    .returning();
  itemIds.push(it!.id);
  return it!;
}

async function stock(itemId: number, locationId: number, qty: number) {
  await db.insert(inventoryLedger).values({
    itemId,
    locationId,
    transactionType: "in",
    referenceType: "opening_stock",
    referenceId: 0,
    quantityChange: qty,
    balanceAfter: qty,
    unitCostPaise: 0,
    totalValueChangePaise: 0,
    createdBy: (await actor("owner")).id,
  });
}

// level 500, reorder qty 1000, stock 480 (the ADC12 example)
async function mkLow(over: Partial<ItemInsert> = {}, stockQty = 480) {
  const it = await mkItem({ reorderLevel: 500, reorderQty: 1000, ...over });
  if (stockQty !== 0) await stock(it.id, mainStoreId, stockQty);
  return it;
}

type Run = Record<string, any>;
async function checkNow(who = "bo"): Promise<Run> {
  const r = await call("POST", "/api/reorder/check-now", who, {});
  if (r.status !== 201) {
    throw new Error(`check-now -> ${r.status} ${JSON.stringify(r.json)}`);
  }
  return r.json.data;
}
async function detail(runId: number): Promise<Run> {
  const r = await call("GET", `/api/reorder/runs/${runId}`, "bo");
  expect(r.status).toBe(200);
  return r.json.data;
}
const itemRow = (d: Run, id: number) =>
  (d.items as any[]).find((x) => x.itemId === id);
async function linesOf(itemId: number) {
  return db
    .select()
    .from(purchaseRequestItems)
    .where(eq(purchaseRequestItems.itemId, itemId));
}

beforeAll(async () => {
  await actor("owner");
  await actor("bo");
  await actor("fs");
  const [s] = await db
    .insert(supplierMaster)
    .values({ name: `${RUN}_s` })
    .returning({ id: supplierMaster.id });
  supplierId = s!.id;
  const [main] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "main_store"))
    .limit(1);
  if (main) mainStoreId = main.id;
  else {
    const [loc] = await db
      .insert(locations)
      .values({ name: uid(), type: "main_store" })
      .returning({ id: locations.id });
    mainStoreId = loc!.id;
    locationIds.push(mainStoreId);
  }
  await resetSettings();
  await setOwner("ravi");
});

afterAll(async () => {
  const empIds = [
    ...[...actors.values()].map((a) => a.id),
    ...extraEmployeeIds,
  ];
  const runRows = await db
    .select({ id: reorderRuns.id })
    .from(reorderRuns)
    .where(
      or(
        inArray(reorderRuns.startedBy, empIds),
        inArray(reorderRuns.draftOwnerId, empIds),
        seededRunIds.length ? inArray(reorderRuns.id, seededRunIds) : undefined,
      ),
    );
  const runIds = runRows.map((r) => r.id);
  const prs = await db
    .select({ id: purchaseRequests.id })
    .from(purchaseRequests)
    .where(
      or(
        inArray(purchaseRequests.requestedBy, empIds),
        runIds.length
          ? inArray(purchaseRequests.reorderRunId, runIds)
          : undefined,
      ),
    );
  const prIds = prs.map((p) => p.id);
  if (runIds.length) {
    await db
      .delete(reorderRunItems)
      .where(inArray(reorderRunItems.runId, runIds));
  }
  if (prIds.length) {
    const lines = (
      await db
        .select({ id: purchaseRequestItems.id })
        .from(purchaseRequestItems)
        .where(inArray(purchaseRequestItems.prId, prIds))
    ).map((l) => l.id);
    if (lines.length) {
      await db
        .delete(reorderRunItems)
        .where(inArray(reorderRunItems.prItemId, lines));
      await db
        .delete(prPoItemLinks)
        .where(inArray(prPoItemLinks.prItemId, lines));
    }
    const reqs = (
      await db
        .select({ id: approvalRequests.id })
        .from(approvalRequests)
        .where(inArray(approvalRequests.docId, prIds))
    ).map((r) => r.id);
    if (reqs.length) {
      await db
        .delete(approvalTrails)
        .where(inArray(approvalTrails.requestId, reqs));
      await db
        .delete(approvalRequests)
        .where(inArray(approvalRequests.id, reqs));
    }
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, prIds));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, prIds));
  }
  if (runIds.length) {
    await db.delete(reorderRuns).where(inArray(reorderRuns.id, runIds));
  }
  await db
    .delete(reorderSettingsHistory)
    .where(inArray(reorderSettingsHistory.createdBy, empIds));
  await resetSettings();
  if (poIds.length) {
    const poItems = (
      await db
        .select({ id: purchaseOrderItems.id })
        .from(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.poId, poIds))
    ).map((x) => x.id);
    if (poItems.length) {
      await db
        .delete(prPoItemLinks)
        .where(inArray(prPoItemLinks.poItemId, poItems));
    }
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, poIds));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
  }
  if (itemIds.length) {
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, itemIds));
    await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
  }
  if (locationIds.length) {
    await db.delete(locations).where(inArray(locations.id, locationIds));
  }
  await db.delete(supplierMaster).where(eq(supplierMaster.id, supplierId));
  await db
    .update(documentNumberCounters)
    .set({ createdBy: null })
    .where(inArray(documentNumberCounters.createdBy, empIds));
  await db
    .update(documentNumberCounters)
    .set({ lastUpdatedBy: null })
    .where(inArray(documentNumberCounters.lastUpdatedBy, empIds));
  await db.delete(employees).where(inArray(employees.id, empIds));
});

// ---------------------------------------------------------------- main run
describe("first run: ADC12 example, skips, invalid line (BR-RO-01, 02, 11, 13, 14, 22, 25, 29)", () => {
  let adc: typeof itemMaster.$inferSelect;
  let flux: typeof itemMaster.$inferSelect;
  let okItem: typeof itemMaster.$inferSelect;
  let level0: typeof itemMaster.$inferSelect;
  let inactive: typeof itemMaster.$inferSelect;
  let invalid: typeof itemMaster.$inferSelect;
  let run: Run;
  let d: Run;
  let ledgerBefore = 0;
  let poLinesBefore = 0;

  beforeAll(async () => {
    adc = await mkLow({ orderMultiple: 250 });
    flux = await mkLow({ reorderLevel: 20, reorderQty: 0 }, 5);
    okItem = await mkLow({ reorderLevel: 20, reorderQty: 0 }, 50);
    level0 = await mkItem({ reorderLevel: 0, reorderQty: 1000 });
    inactive = await mkLow({ isActive: false });
    invalid = await mkLow({ standardRatePaise: 10_000_000_000_000 });
    const all = [adc, flux, okItem, level0, inactive, invalid].map((i) => i.id);
    ledgerBefore = (
      await db
        .select({ id: inventoryLedger.id })
        .from(inventoryLedger)
        .where(inArray(inventoryLedger.itemId, all))
    ).length;
    poLinesBefore = (
      await db
        .select({ id: purchaseOrderItems.id })
        .from(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.itemId, all))
    ).length;
    run = await checkNow("bo");
    d = await detail(run.id);
  });

  test("BR-RO-11 returns the finished run: manual, started by the caller, done, finished", () => {
    expect(run.trigger).toBe("manual");
    expect(run.state).toBe("done");
    expect(run.finishedAt).not.toBeNull();
    expect(run.failureReason).toBeNull();
  });

  test("BR-RO-11 run records who started it", async () => {
    expect(run.startedBy.id).toBe((await actor("bo")).id);
  });

  test("BR-RO-13 exactly one draft PR of type stock_reorder, linked to the run", async () => {
    expect(run.pr).not.toBeNull();
    expect(run.pr.status).toBe("draft");
    const prs = await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.reorderRunId, run.id));
    expect(prs.length).toBe(1);
    expect(prs[0]?.type).toBe("stock_reorder");
    expect(prs[0]?.status).toBe("draft");
    expect(prs[0]?.id).toBe(run.pr.id);
  });

  test("BR-RO-14 PR is made as the draft owner, with number, notes and estimate", async () => {
    const ravi = await actor("ravi");
    const [pr] = await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, run.pr.id));
    expect(pr?.requestedBy).toBe(ravi.id);
    expect(run.draftOwner.id).toBe(ravi.id);
    expect(pr?.prNumber).toMatch(/^PR-/);
    expect(pr?.notes).toMatch(
      new RegExp(
        `^Raised by reorder check \\d{2}-\\d{2}-\\d{4} \\(run ${run.id}\\)`,
      ),
    );
    expect(pr?.estimatedAmountPaise).toBeGreaterThanOrEqual(24_000_000);
  });

  test("BR-RO-13 one line for ADC12: 1000 kg", async () => {
    const lines = await linesOf(adc.id);
    expect(lines.length).toBe(1);
    expect(lines[0]?.prId).toBe(run.pr.id);
    expect(lines[0]?.requestedQty).toBe(1000);
    expect(lines[0]?.uom).toBe("kg");
    expect(lines[0]?.status).toBe("pending");
  });

  test("BR-RO-22 run detail for ADC12 keeps the numbers the run saw", async () => {
    const x = itemRow(d, adc.id);
    const [line] = await linesOf(adc.id);
    expect(x.outcome).toBe("raised");
    expect(x.uom).toBe("kg");
    expect(x.usableQty).toBe(480);
    expect(x.onTheWayQty).toBe(0);
    expect(x.projectedQty).toBe(480);
    expect(x.reorderLevel).toBe(500);
    expect(x.reorderQty).toBe(1000);
    expect(x.orderQty).toBe(1000);
    expect(x.prItemId).toBe(line?.id);
    expect(x.sku).toBe(adc.sku);
  });

  test("BR-RO-02 needs-a-reorder-qty item: listed in the run, no PR line", async () => {
    const x = itemRow(d, flux.id);
    expect(x.outcome).toBe("needs_reorder_qty");
    expect(x.orderQty).toBeNull();
    expect(x.prItemId).toBeNull();
    expect((await linesOf(flux.id)).length).toBe(0);
  });

  test("BR-RO-22 OK items are not stored per item", async () => {
    expect(itemRow(d, okItem.id)).toBeUndefined();
  });

  test("BR-RO-01 level 0 and inactive items are ignored", async () => {
    expect(itemRow(d, level0.id)).toBeUndefined();
    expect(itemRow(d, inactive.id)).toBeUndefined();
    expect((await linesOf(level0.id)).length).toBe(0);
    expect((await linesOf(inactive.id)).length).toBe(0);
  });

  test("BR-RO-29 an over-range line is listed invalid_line, not raised, run goes on", async () => {
    const x = itemRow(d, invalid.id);
    expect(x.outcome).toBe("invalid_line");
    expect(x.prItemId).toBeNull();
    expect((await linesOf(invalid.id)).length).toBe(0);
    expect(run.state).toBe("done");
    expect(itemRow(d, adc.id).outcome).toBe("raised");
  });

  test("BR-RO-22 counters match the stored item rows", () => {
    const items = d.items as any[];
    const n = (o: string) => items.filter((x) => x.outcome === o).length;
    expect(d.itemsRaised).toBe(n("raised"));
    expect(d.itemsSkipped).toBe(n("needs_reorder_qty") + n("invalid_line"));
    expect(d.itemsDeferred).toBe(n("deferred"));
    expect(d.itemsChecked).toBeGreaterThanOrEqual(
      d.itemsRaised + d.itemsSkipped + d.itemsDeferred,
    );
  });

  test("BR-RO-25 a run never moves stock, never creates a PO, never submits the PR", async () => {
    const all = [adc, flux, okItem, level0, inactive, invalid].map((i) => i.id);
    const ledger = await db
      .select({ id: inventoryLedger.id })
      .from(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, all));
    expect(ledger.length).toBe(ledgerBefore);
    const poLines = await db
      .select({ id: purchaseOrderItems.id })
      .from(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.itemId, all));
    expect(poLines.length).toBe(poLinesBefore);
    const [pr] = await db
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, run.pr.id));
    expect(pr?.status).toBe("draft");
    const [it] = await db
      .select({ s: itemMaster.currentStock })
      .from(itemMaster)
      .where(eq(itemMaster.id, adc.id));
    expect(it?.s).toBe(0);
  });

  test("BR-RO-22 run list shows the run with its PR and no PO", async () => {
    const r = await call(
      "GET",
      "/api/reorder/runs?trigger=manual&state=done&pageSize=100",
      "fs",
    );
    expect(r.status).toBe(200);
    const found = (r.json.data as Run[]).find((x) => x.id === run.id) as Run;
    expect(found.pr).toEqual({
      id: run.pr.id,
      prNumber: run.pr.prNumber,
      status: "draft",
    });
    expect(found.po).toBeNull();
  });

  test("BR-RO-22 run list: newest first by default, sortable by id, state filter", async () => {
    const def = await call("GET", "/api/reorder/runs?pageSize=100", "bo");
    const times = (def.json.data as Run[]).map((x) => Date.parse(x.startedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    const asc = await call(
      "GET",
      "/api/reorder/runs?sortBy=id&sortDir=asc&pageSize=100",
      "bo",
    );
    const ids = (asc.json.data as Run[]).map((x) => x.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    const failed = await call(
      "GET",
      "/api/reorder/runs?state=failed&pageSize=100",
      "bo",
    );
    expect(
      (failed.json.data as Run[]).find((x) => x.id === run.id),
    ).toBeUndefined();
  });

  test("BR-RO-21 after the run ADC12 is covered by the new PR, on the way 1000", async () => {
    const r = await call(
      "GET",
      `/api/reorder/items?q=${encodeURIComponent(adc.sku)}&pageSize=100`,
      "bo",
    );
    const x = (r.json.data as any[]).find((y) => y.itemId === adc.id);
    expect(x.state).toBe("covered");
    expect(x.onTheWayQty).toBe(1000);
    expect(x.projectedQty).toBe(1480);
    expect(x.coveredBy).toEqual({
      type: "pr",
      id: run.pr.id,
      number: run.pr.prNumber,
    });
  });

  test("BR-RO-18 a second run does not raise ADC12 again", async () => {
    const second = await checkNow("bo");
    const d2 = await detail(second.id);
    expect(itemRow(d2, adc.id)).toBeUndefined();
    expect(
      (await linesOf(adc.id)).filter((l) => l.status === "pending").length,
    ).toBe(1);
    const prs = await db
      .select({ id: purchaseRequests.id })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.reorderRunId, second.id));
    for (const p of prs) {
      const ls = await db
        .select({ itemId: purchaseRequestItems.itemId })
        .from(purchaseRequestItems)
        .where(eq(purchaseRequestItems.prId, p.id));
      expect(ls.map((l) => l.itemId)).not.toContain(adc.id);
    }
  });

  test("BR-RO-18 a still-skipped item is listed again by the next run", async () => {
    const third = await checkNow("bo");
    const d3 = await detail(third.id);
    expect(itemRow(d3, flux.id)?.outcome).toBe("needs_reorder_qty");
  });

  test("BR-RO-11 Check now works while the switch is off", async () => {
    const s = await call("GET", "/api/reorder/settings", "bo");
    expect(s.json.data.enabled).toBe(false);
    expect(run.state).toBe("done");
  });
});

// ---------------------------------------------------------------- BR-RO-19
describe("BR-RO-19 item is raised again once the open PR stops counting", () => {
  test("BR-RO-19 cancelled PR (by its requester) -> next run raises the item again", async () => {
    const it = await mkLow();
    const r1 = await checkNow("bo");
    expect(itemRow(await detail(r1.id), it.id)?.outcome).toBe("raised");
    const cancel = await call(
      "DELETE",
      `/api/pr/deletepr/${r1.pr.id}`,
      "ravi",
      {
        reason: "duplicate request",
      },
    );
    expect(cancel.status).toBe(200);
    const r2 = await checkNow("bo");
    expect(itemRow(await detail(r2.id), it.id)?.outcome).toBe("raised");
    expect(r2.pr.id).not.toBe(r1.pr.id);
  });

  test("BR-RO-19 rejected PR -> next run raises the item again", async () => {
    const it = await mkLow();
    const r1 = await checkNow("bo");
    await db
      .update(purchaseRequests)
      .set({ status: "rejected" })
      .where(eq(purchaseRequests.id, r1.pr.id));
    const r2 = await checkNow("bo");
    expect(itemRow(await detail(r2.id), it.id)?.outcome).toBe("raised");
  });

  test("BR-RO-19 cancelled PR line -> next run raises the item again", async () => {
    const it = await mkLow();
    const r1 = await checkNow("bo");
    await db
      .update(purchaseRequestItems)
      .set({ status: "cancelled" })
      .where(eq(purchaseRequestItems.itemId, it.id));
    expect(r1.pr).not.toBeNull();
    const r2 = await checkNow("bo");
    expect(itemRow(await detail(r2.id), it.id)?.outcome).toBe("raised");
  });
});

// ---------------------------------------------------------------- BR-RO-17, 20, 30
describe("BR-RO-17 raised PR is an ordinary PR; run link is read-only", () => {
  let it: typeof itemMaster.$inferSelect;
  let run: Run;
  let lineId = 0;

  beforeAll(async () => {
    it = await mkLow();
    run = await checkNow("bo");
    lineId = (await linesOf(it.id))[0]!.id;
  });

  test("BR-RO-17 PR detail and list show reorderRunId = run number", async () => {
    const det = await call("GET", `/api/pr/getprdetails/${run.pr.id}`, "ravi");
    expect(det.status).toBe(200);
    const pr = det.json.data.pr ?? det.json.data;
    expect(pr.reorderRunId).toBe(run.id);
    const list = await call(
      "GET",
      `/api/pr/getprs?reorderRunId=${run.id}`,
      "ravi",
    );
    expect(list.status).toBe(200);
    expect((list.json.data as any[]).map((p) => p.id)).toEqual([run.pr.id]);
  });

  test("BR-RO-17 list filter raisedByReorder true / false", async () => {
    const yes = await call(
      "GET",
      `/api/pr/getprs?raisedByReorder=true&pageSize=100&q=${encodeURIComponent(run.pr.prNumber)}`,
      "ravi",
    );
    expect((yes.json.data as any[]).map((p) => p.id)).toContain(run.pr.id);
    const no = await call(
      "GET",
      `/api/pr/getprs?raisedByReorder=false&pageSize=100&q=${encodeURIComponent(run.pr.prNumber)}`,
      "ravi",
    );
    expect((no.json.data as any[]).map((p) => p.id)).not.toContain(run.pr.id);
  });

  test("BR-RO-17 a hand-made PR has reorderRunId null", async () => {
    const res = await call("POST", "/api/pr/createpr", "ravi", {
      type: "misc",
      notes: RUN,
      items: [{ itemId: it.id, requestedQty: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.json.data.pr.reorderRunId).toBeNull();
  });

  test("BR-RO-17 create PR with reorderRunId -> 400 Validation failed", async () => {
    const res = await call("POST", "/api/pr/createpr", "ravi", {
      type: "misc",
      notes: RUN,
      reorderRunId: run.id,
      items: [{ itemId: it.id, requestedQty: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.json.message).toBe("Validation failed");
  });

  test("BR-RO-17 edit PR with reorderRunId -> 400 Validation failed", async () => {
    const res = await call("PATCH", "/api/pr/updatepr", "ravi", {
      prId: run.pr.id,
      reorderRunId: 1,
      inserts: [],
      updates: [],
      deletes: [],
    });
    expect(res.status).toBe(400);
    expect(res.json.message).toBe("Validation failed");
  });

  test("BR-RO-17 the owner may change qty 1000 -> 750", async () => {
    const res = await call("PATCH", "/api/pr/updatepr", "ravi", {
      prId: run.pr.id,
      inserts: [],
      updates: [{ id: lineId, itemId: it.id, requestedQty: 750 }],
      deletes: [],
    });
    expect(res.status).toBe(200);
    const [l] = await linesOf(it.id);
    expect(l?.requestedQty).toBe(750);
  });

  test("BR-RO-17 another pr.manage holder cannot submit the owner's reorder PR -> 403", async () => {
    const res = await call("POST", "/api/approval/submitRequest", "bo", {
      docType: "pr",
      docId: run.pr.id,
    });
    expect(res.status).toBe(403);
    const [pr] = await db
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, run.pr.id));
    expect(pr?.status).toBe("draft");
  });

  test("BR-RO-30 the draft owner submits it through normal approval", async () => {
    const res = await call("POST", "/api/approval/submitRequest", "ravi", {
      docType: "pr",
      docId: run.pr.id,
    });
    expect([200, 201]).toContain(res.status);
    const [pr] = await db
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, run.pr.id));
    expect(pr?.status).not.toBe("draft");
  });

  test("BR-RO-20 a new owner gets only later drafts; the raised PR keeps its requester", async () => {
    const ravi = await actor("ravi");
    const other = await mkEmployee("meena", "back_office");
    extraEmployeeIds.push(other);
    const r = await call("PATCH", "/api/reorder/settings", "bo", {
      draftOwnerId: other,
    });
    expect(r.status).toBe(200);
    try {
      const [pr] = await db
        .select({ by: purchaseRequests.requestedBy })
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, run.pr.id));
      expect(pr?.by).toBe(ravi.id);
      const fresh = await mkLow();
      const next = await checkNow("bo");
      expect(itemRow(await detail(next.id), fresh.id)?.outcome).toBe("raised");
      const [p2] = await db
        .select({ by: purchaseRequests.requestedBy })
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, next.pr.id));
      expect(p2?.by).toBe(other);
    } finally {
      await setOwner("ravi");
    }
  });
});

// ---------------------------------------------------------------- run PO link
describe("BR-RO-22 / BR-RO-04 PR line that went onto a PO", () => {
  test("BR-RO-22 run shows the PO (number + status); the qty counts once, through the PO", async () => {
    const it = await mkLow();
    const run = await checkNow("bo");
    const [line] = await linesOf(it.id);
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        poNumber: uid(),
        supplierId,
        status: "dispatched",
        createdBy: (await actor("owner")).id,
      })
      .returning({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber });
    poIds.push(po!.id);
    const [poi] = await db
      .insert(purchaseOrderItems)
      .values({
        poId: po!.id,
        itemId: it.id,
        qty: 1000,
        receivedQty: 0,
        unitPricePaise: 24000,
        uom: "kg",
      })
      .returning({ id: purchaseOrderItems.id });
    await db
      .insert(prPoItemLinks)
      .values({ prItemId: line!.id, poItemId: poi!.id, linkedQty: 1000 });
    await db
      .update(purchaseRequestItems)
      .set({ status: "ordered", issuedQty: 1000 })
      .where(eq(purchaseRequestItems.id, line!.id));
    const d = await detail(run.id);
    expect(d.po).toEqual({
      id: po!.id,
      poNumber: po!.poNumber,
      status: "dispatched",
    });
    const r = await call(
      "GET",
      `/api/reorder/items?q=${encodeURIComponent(it.sku)}&pageSize=100`,
      "bo",
    );
    const x = (r.json.data as any[]).find((y) => y.itemId === it.id);
    expect(x.onTheWayQty).toBe(1000);
  });
});

// ---------------------------------------------------------------- failures
describe("BR-RO-15 / BR-RO-16 a failed run is a saved run with a fixed reason and no PR", () => {
  async function assertNoPr(run: Run) {
    expect(run.state).toBe("failed");
    expect(run.pr).toBeNull();
    expect(run.finishedAt).not.toBeNull();
    const prs = await db
      .select({ id: purchaseRequests.id })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.reorderRunId, run.id));
    expect(prs.length).toBe(0);
  }

  test("BR-RO-15 no owner set at run time -> 201 failed, reason names the owner", async () => {
    await db
      .update(reorderSettings)
      .set({ draftOwnerId: null })
      .where(eq(reorderSettings.id, 1));
    try {
      const it = await mkLow();
      const run = await checkNow("bo");
      await assertNoPr(run);
      expect(run.failureReason).toMatch(/owner/i);
      expect(run.failureReason).not.toMatch(/inactive/i);
      expect((await linesOf(it.id)).length).toBe(0);
    } finally {
      await setOwner("ravi");
    }
  });

  test("BR-RO-15 owner became inactive -> 201 failed, reason says inactive", async () => {
    const id = await mkEmployee("leaver", "back_office");
    extraEmployeeIds.push(id);
    const set = await call("PATCH", "/api/reorder/settings", "bo", {
      draftOwnerId: id,
    });
    expect(set.status).toBe(200);
    await db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, id));
    try {
      const run = await checkNow("bo");
      await assertNoPr(run);
      expect(run.failureReason).toMatch(/inactive/i);
    } finally {
      await setOwner("ravi");
    }
  });

  test("BR-RO-15 owner lost pr.manage -> 201 failed, reason says requisitions", async () => {
    const id = await mkEmployee("demoted", "back_office");
    extraEmployeeIds.push(id);
    const set = await call("PATCH", "/api/reorder/settings", "bo", {
      draftOwnerId: id,
    });
    expect(set.status).toBe(200);
    const [qa] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "qa_inspector"));
    await db
      .update(employees)
      .set({ roleId: qa!.id })
      .where(eq(employees.id, id));
    try {
      const run = await checkNow("bo");
      await assertNoPr(run);
      expect(run.failureReason).toMatch(/requisition/i);
    } finally {
      await setOwner("ravi");
    }
  });

  test("BR-RO-16 a DB error rolls back the whole PR; reason is fixed text, raw error never shown; next run starts fresh", async () => {
    const it = await mkLow();
    const other = await mkLow();
    await db.execute(
      sql.raw(
        `create or replace function test_ro_fail() returns trigger language plpgsql as $$ begin if new.item_id = ${it.id} then raise exception 'TEST_RO_BOOM secret_sql_text'; end if; return new; end $$`,
      ),
    );
    await db.execute(
      sql.raw(
        "create trigger test_ro_fail_trg before insert on purchase_request_items for each row execute function test_ro_fail()",
      ),
    );
    let run: Run;
    try {
      run = await checkNow("bo");
    } finally {
      await db.execute(
        sql.raw(
          "drop trigger if exists test_ro_fail_trg on purchase_request_items",
        ),
      );
      await db.execute(sql.raw("drop function if exists test_ro_fail()"));
    }
    await assertNoPr(run);
    expect(run.failureReason).toContain(
      "Something went wrong, nothing was saved",
    );
    expect(JSON.stringify(run)).not.toContain("TEST_RO_BOOM");
    expect(JSON.stringify(run)).not.toContain("secret_sql_text");
    expect((await linesOf(it.id)).length).toBe(0);
    expect((await linesOf(other.id)).length).toBe(0);
    const next = await checkNow("bo");
    const dn = await detail(next.id);
    expect(itemRow(dn, it.id)?.outcome).toBe("raised");
    expect(itemRow(dn, other.id)?.outcome).toBe("raised");
  });
});

// ---------------------------------------------------------------- busy / stale
describe("BR-RO-12 one run at a time; BR-RO-27 interrupted runs", () => {
  test("BR-RO-12 a run still running -> 409 REORDER_RUN_BUSY, nothing saved", async () => {
    const bo = await actor("bo");
    const [busy] = await db
      .insert(reorderRuns)
      .values({ trigger: "manual", state: "running", startedBy: bo.id })
      .returning({ id: reorderRuns.id });
    seededRunIds.push(busy!.id);
    try {
      const before = await db
        .select({ id: reorderRuns.id })
        .from(reorderRuns)
        .where(eq(reorderRuns.startedBy, bo.id));
      const r = await call("POST", "/api/reorder/check-now", "bo", {});
      expect(r.status).toBe(409);
      expect(r.json.code).toBe("REORDER_RUN_BUSY");
      const after = await db
        .select({ id: reorderRuns.id })
        .from(reorderRuns)
        .where(eq(reorderRuns.startedBy, bo.id));
      expect(after.length).toBe(before.length);
    } finally {
      await db
        .update(reorderRuns)
        .set({ state: "failed", finishedAt: new Date() })
        .where(eq(reorderRuns.id, busy!.id));
    }
  });

  test("BR-RO-12 parallel starts: every answer is 201 or 409 REORDER_RUN_BUSY, at least one 201, at most one PR per run", async () => {
    const res = await Promise.all(
      Array.from({ length: 5 }, () =>
        call("POST", "/api/reorder/check-now", "bo", {}),
      ),
    );
    for (const r of res) expect([201, 409]).toContain(r.status);
    expect(res.some((r) => r.status === 201)).toBe(true);
    for (const r of res.filter((x) => x.status === 409)) {
      expect(r.json.code).toBe("REORDER_RUN_BUSY");
    }
    const ok = res.filter((r) => r.status === 201);
    expect(new Set(ok.map((r) => r.json.data.id)).size).toBe(ok.length);
  });

  test("BR-RO-27 a run still running after 15 minutes is marked failed Interrupted, then a new run starts", async () => {
    const bo = await actor("bo");
    const [stale] = await db
      .insert(reorderRuns)
      .values({
        trigger: "manual",
        state: "running",
        startedBy: bo.id,
        startedAt: new Date(Date.now() - 20 * 60 * 1000),
      })
      .returning({ id: reorderRuns.id });
    seededRunIds.push(stale!.id);
    const run = await checkNow("bo");
    expect(run.id).toBeGreaterThan(stale!.id);
    expect(run.state).toBe("done");
    const old = await detail(stale!.id);
    expect(old.state).toBe("failed");
    expect(old.failureReason).toMatch(/interrupted/i);
    expect(old.finishedAt).not.toBeNull();
  });

  test("BR-RO-27 a run running for under 15 minutes is not interrupted -> 409", async () => {
    const bo = await actor("bo");
    const [young] = await db
      .insert(reorderRuns)
      .values({
        trigger: "manual",
        state: "running",
        startedBy: bo.id,
        startedAt: new Date(Date.now() - 5 * 60 * 1000),
      })
      .returning({ id: reorderRuns.id });
    seededRunIds.push(young!.id);
    try {
      const r = await call("POST", "/api/reorder/check-now", "bo", {});
      expect(r.status).toBe(409);
      expect(r.json.code).toBe("REORDER_RUN_BUSY");
    } finally {
      await db
        .update(reorderRuns)
        .set({ state: "failed", finishedAt: new Date() })
        .where(eq(reorderRuns.id, young!.id));
    }
  });
});

describe("BR-RO-22 scheduled runs show no starter", () => {
  test("BR-RO-22 a schedule run has startedBy null (Daily schedule) and is filterable by trigger", async () => {
    const day = new Date(
      Date.UTC(1900, 0, 1) + (Math.floor(Date.now() / 1000) % 30000) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    const [s] = await db
      .insert(reorderRuns)
      .values({
        trigger: "schedule",
        state: "done",
        scheduledDay: day,
        finishedAt: new Date(),
        startedAt: new Date(Date.now() - 3600_000),
      })
      .returning({ id: reorderRuns.id });
    seededRunIds.push(s!.id);
    const r = await call(
      "GET",
      "/api/reorder/runs?trigger=schedule&pageSize=100",
      "fs",
    );
    expect(r.status).toBe(200);
    const found = (r.json.data as Run[]).find((x) => x.id === s!.id) as Run;
    expect(found.trigger).toBe("schedule");
    expect(found.startedBy).toBeNull();
    for (const x of r.json.data as Run[]) expect(x.trigger).toBe("schedule");
  });

  test("BR-RO-22 no endpoint edits or deletes a run", async () => {
    for (const m of ["PATCH", "PUT", "DELETE"]) {
      const r = await call(m, "/api/reorder/runs/1", "bo", {});
      expect([404, 405]).toContain(r.status);
    }
  });
});
