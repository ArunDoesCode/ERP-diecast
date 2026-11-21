/**
 * Purchase returns: cancel draft and cancel posted (BR-PRT-10, 11, 25..28, 41).
 * Real DB, full HTTP stack via createApp(). Fixtures are TEST_prtcancel_ prefixed and removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  grnCorrections,
  grnItems,
  grns,
  purchaseDebitNotes,
  purchaseOrderItems,
  purchaseOrders,
  purchaseReturnEvents,
  purchaseReturnItems,
  purchaseReturns,
  qaTests,
} from "../../src/db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { companySettings } from "../../src/db/schemas/04_company";
import { signAccessToken } from "../../src/lib/token";

type Role =
  | "owner"
  | "back_office"
  | "floor_supervisor"
  | "qa_inspector"
  | "die_designer"
  | "operator"
  | "super-admin";

const app = createApp();
const RUN = `TEST_prtcancel_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

// The caller's role is read from the employee row, so each role gets a real employee.
const roleUsers = new Map<string, number>();
async function userFor(role: string): Promise<number> {
  let id = roleUsers.get(role);
  if (!id) {
    const [r] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, role))
      .limit(1);
    if (!r) throw new Error(`seed role ${role} missing`);
    const [e] = await db
      .insert(employees)
      .values({ name: `${RUN}_u_${role}`, roleId: r.id, isActive: true })
      .returning({ id: employees.id });
    id = e!.id;
    roleUsers.set(role, id);
  }
  return id;
}
const tokens = new Map<Role, string>();
async function tokenFor(role: Role) {
  let t = tokens.get(role);
  if (!t) {
    t = await signAccessToken({
      userId: await userFor(role),
      userName: `${RUN}_${role}`,
      role,
      allowedPages: [],
    });
    tokens.set(role, t);
  }
  return t;
}
async function raw(
  method: string,
  url: string,
  role: Role | null,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (role) headers.Authorization = `Bearer ${await tokenFor(role)}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const call = (
  method: string,
  path: string,
  role: Role | null,
  body?: unknown,
) => raw(method, `/api/purchase-return${path}`, role, body);
const grnCall = (method: string, path: string, role: Role, body?: unknown) =>
  raw(method, `/api/grn${path}`, role, body);

const supplierIds: number[] = [];
const poIds: number[] = [];
const itemIds: number[] = [];
const extraGrnIds: number[] = [];
const locIds: number[] = [];
let supplierId = 0;
let mainStoreId = 0;
let createdMainStore = false;
let savedCompany: typeof companySettings.$inferSelect | undefined;

async function newSupplier(gst: string | null = `27${uid().slice(-12)}`) {
  const [s] = await db
    .insert(supplierMaster)
    .values({ name: uid(), gstNumber: gst, address: "Supplier Road, Pune" })
    .returning({ id: supplierMaster.id });
  supplierIds.push(s!.id);
  return s!.id;
}

type L = {
  qty: number;
  accepted?: number;
  rejected?: number;
  uom?: string;
  price?: number;
  hsn?: string | null;
  gst?: number;
  batch?: string;
  pending?: boolean;
  poIdx?: number;
};
type G = {
  poId: number;
  poItemIds: number[];
  itemIds: number[];
  grnId: number;
  lineIds: number[];
  grnNumber: string;
  challanNo: string;
  supplierId: number;
};

/** PO (dispatched) + GRN via the API + QA decision per line (accepted posts to the ledger). */
async function mkGrn(
  lines: L[],
  opts: {
    supplier?: number;
    po?: Pick<G, "poId" | "poItemIds" | "itemIds">;
    poStatus?: string;
  } = {},
): Promise<G> {
  const sup = opts.supplier ?? supplierId;
  let po = opts.po;
  if (!po) {
    const [p] = await db
      .insert(purchaseOrders)
      .values({
        poNumber: uid(),
        supplierId: sup,
        status: (opts.poStatus ?? "dispatched") as any,
        createdBy: await userFor("owner"),
      })
      .returning({ id: purchaseOrders.id });
    poIds.push(p!.id);
    const poItemIds: number[] = [];
    const lineItemIds: number[] = [];
    for (const l of lines) {
      const [item] = await db
        .insert(itemMaster)
        .values({
          sku: uid(),
          name: `${RUN} item`,
          category: "Raw Material",
          uom: l.uom ?? "kg",
          hsnCode: l.hsn === null ? null : (l.hsn ?? "7601"),
        })
        .returning({ id: itemMaster.id });
      itemIds.push(item!.id);
      lineItemIds.push(item!.id);
      const [pi] = await db
        .insert(purchaseOrderItems)
        .values({
          poId: p!.id,
          itemId: item!.id,
          qty: l.qty,
          receivedQty: 0,
          unitPricePaise: l.price ?? 21000,
          gstPercent: l.gst ?? 18,
          uom: l.uom ?? "kg",
        })
        .returning({ id: purchaseOrderItems.id });
      poItemIds.push(pi!.id);
    }
    po = { poId: p!.id, poItemIds, itemIds: lineItemIds };
  }
  const challanNo = uid();
  const r = await grnCall("POST", "/creategrn", "back_office", {
    poId: po.poId,
    challanNo,
    lines: lines.map((l, i) => ({
      poItemId: po!.poItemIds[l.poIdx ?? i],
      arrivedQty: l.qty,
    })),
  });
  if (r.status !== 201) {
    throw new Error(
      `fixture GRN failed: ${r.status} ${JSON.stringify(r.json)}`,
    );
  }
  const grnId = r.json.data.grn.id as number;
  const lineIds = (r.json.data.items as { id: number }[]).map((i) => i.id);
  for (const [i, l] of lines.entries()) {
    if (l.pending) continue;
    const q = await grnCall(
      "POST",
      `/${grnId}/lines/${lineIds[i]}/qa`,
      "back_office",
      {
        acceptedQty: l.accepted ?? l.qty - (l.rejected ?? 0),
        rejectedQty: l.rejected ?? 0,
        batchNumber: l.batch ?? "H-881",
      },
    );
    if (q.status !== 200) {
      throw new Error(
        `fixture QA failed: ${q.status} ${JSON.stringify(q.json)}`,
      );
    }
  }
  return {
    ...po,
    grnId,
    lineIds,
    grnNumber: r.json.data.grn.grnNumber,
    challanNo,
    supplierId: sup,
  };
}

const ln = (
  g: Pick<G, "lineIds">,
  idx: number,
  source: "rejected" | "accepted",
  qty: number,
) => ({ grnItemId: g.lineIds[idx]!, source, qty });
const REASON = "porosity in heat H-881";
const createRet = (
  g: Pick<G, "grnId" | "lineIds">,
  lines: unknown[],
  extra: Record<string, unknown> = {},
  role: Role = "back_office",
) =>
  call("POST", "/createreturn", role, {
    grnId: g.grnId,
    reason: REASON,
    lines,
    ...extra,
  });
async function mkDraft(
  g: Pick<G, "grnId" | "lineIds">,
  lines: unknown[],
  extra: Record<string, unknown> = {},
) {
  const r = await createRet(g, lines, extra);
  if (r.status !== 201) {
    throw new Error(
      `fixture return failed: ${r.status} ${JSON.stringify(r.json)}`,
    );
  }
  return r.json.data.id as number;
}
const postRet = (id: number, role: Role = "back_office") =>
  call("POST", `/${id}/post`, role);
async function mkPosted(
  g: Pick<G, "grnId" | "lineIds">,
  lines: unknown[],
  extra: Record<string, unknown> = {},
): Promise<Record<string, any>> {
  const id = await mkDraft(g, lines, extra);
  const r = await postRet(id);
  if (r.status !== 200) {
    throw new Error(
      `fixture post failed: ${r.status} ${JSON.stringify(r.json)}`,
    );
  }
  return { ...(r.json.data as Record<string, any>), id };
}
const cancelPosted = (id: number, body: unknown, role: Role = "back_office") =>
  call("POST", `/${id}/cancel`, role, body);
const details = async (id: number) =>
  (await call("GET", `/getreturndetails/${id}`, "owner")).json.data;

const retRow = async (id: number) =>
  (
    await db.select().from(purchaseReturns).where(eq(purchaseReturns.id, id))
  )[0]!;
const retLines = (id: number) =>
  db
    .select()
    .from(purchaseReturnItems)
    .where(eq(purchaseReturnItems.proId, id))
    .orderBy(purchaseReturnItems.id);
const dnRow = async (proId: number) =>
  (
    await db
      .select()
      .from(purchaseDebitNotes)
      .where(eq(purchaseDebitNotes.proId, proId))
  )[0];
const eventsOf = (proId: number) =>
  db
    .select()
    .from(purchaseReturnEvents)
    .where(eq(purchaseReturnEvents.proId, proId))
    .orderBy(purchaseReturnEvents.id);
const proLedger = (itemId: number, type: "pro" | "pro_cancel" = "pro") =>
  db
    .select()
    .from(inventoryLedger)
    .where(eq(inventoryLedger.itemId, itemId))
    .orderBy(inventoryLedger.id)
    .then((rows) => rows.filter((r) => r.referenceType === type));
const allLedger = (itemId: number) =>
  db
    .select()
    .from(inventoryLedger)
    .where(eq(inventoryLedger.itemId, itemId))
    .orderBy(inventoryLedger.id);
const itemRow = async (id: number) =>
  (await db.select().from(itemMaster).where(eq(itemMaster.id, id)))[0]!;
const poItemRow = async (id: number) =>
  (
    await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.id, id))
  )[0]!;
const poRow = async (id: number) =>
  (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)))[0]!;
const grnLine = async (id: number) =>
  (await db.select().from(grnItems).where(eq(grnItems.id, id)))[0]!;
const grnHeader = async (id: number) =>
  (await db.select().from(grns).where(eq(grns.id, id)))[0]!;
const returnsOfGrn = (grnId: number) =>
  db.select().from(purchaseReturns).where(eq(purchaseReturns.grnId, grnId));

const ISTNOW = () => new Date(Date.now() + 5.5 * 3600 * 1000);

async function ensureCompany(
  over: Partial<typeof companySettings.$inferInsert> = {},
) {
  await db.delete(companySettings);
  await db.insert(companySettings).values({
    name: `${RUN} Works`,
    address: "Plot 1, MIDC, Pune",
    gstin: "27AAACD1234F1Z5",
    stateCode: "27",
    ...over,
  });
}

beforeAll(async () => {
  await userFor("owner");
  supplierId = await newSupplier();
  const [main] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "main_store"))
    .limit(1);
  if (main) mainStoreId = main.id;
  else {
    const [loc] = await db
      .insert(locations)
      .values({ name: `${RUN}_main_store`, type: "main_store" })
      .returning({ id: locations.id });
    mainStoreId = loc!.id;
    createdMainStore = true;
  }
  [savedCompany] = await db.select().from(companySettings).limit(1);
});

afterAll(async () => {
  const proRows = poIds.length
    ? await db
        .select({ id: purchaseReturns.id })
        .from(purchaseReturns)
        .where(inArray(purchaseReturns.poId, poIds))
    : [];
  const proIds = proRows.map((p) => p.id);
  if (proIds.length) {
    await db
      .delete(purchaseDebitNotes)
      .where(inArray(purchaseDebitNotes.proId, proIds));
    await db
      .delete(purchaseReturnEvents)
      .where(inArray(purchaseReturnEvents.proId, proIds));
    await db
      .delete(purchaseReturnItems)
      .where(inArray(purchaseReturnItems.proId, proIds));
    await db.delete(purchaseReturns).where(inArray(purchaseReturns.id, proIds));
  }
  const grnRows = poIds.length
    ? await db
        .select({ id: grns.id })
        .from(grns)
        .where(inArray(grns.poId, poIds))
    : [];
  const grnIds = [...grnRows.map((g) => g.id), ...extraGrnIds];
  const lineRows = grnIds.length
    ? await db
        .select({ id: grnItems.id })
        .from(grnItems)
        .where(inArray(grnItems.grnId, grnIds))
    : [];
  const lineIds = lineRows.map((l) => l.id);
  if (lineIds.length) {
    await db.delete(qaTests).where(inArray(qaTests.grnItemId, lineIds));
    await db
      .delete(grnCorrections)
      .where(inArray(grnCorrections.grnItemId, lineIds));
  }
  if (itemIds.length) {
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, itemIds));
  }
  if (lineIds.length)
    await db.delete(grnItems).where(inArray(grnItems.id, lineIds));
  if (grnIds.length) await db.delete(grns).where(inArray(grns.id, grnIds));
  if (poIds.length) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, poIds));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
  }
  if (itemIds.length)
    await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
  if (supplierIds.length)
    await db
      .delete(supplierMaster)
      .where(inArray(supplierMaster.id, supplierIds));
  if (locIds.length)
    await db.delete(locations).where(inArray(locations.id, locIds));
  if (createdMainStore)
    await db.delete(locations).where(eq(locations.id, mainStoreId));
  // Company row is a shared singleton: put back what was there.
  await db.delete(companySettings);
  if (savedCompany) await db.insert(companySettings).values(savedCompany);
  // Number counters are shared and never rolled back: detach, don't delete.
  const ids = [...roleUsers.values()];
  await db
    .update(documentNumberCounters)
    .set({ createdBy: null })
    .where(inArray(documentNumberCounters.createdBy, ids));
  await db
    .update(documentNumberCounters)
    .set({ lastUpdatedBy: null })
    .where(inArray(documentNumberCounters.lastUpdatedBy, ids));
  await db.delete(employees).where(inArray(employees.id, ids));
});

describe("cancel a draft (BR-PRT-10, 11, 28, 46)", () => {
  test("BR-PRT-11 a draft cancels without a reason: no stock moves, the number stays listed", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const c = await createRet(g, [ln(g, 0, "accepted", 30)]);
    const id = c.json.data.id as number;
    const r = await call("POST", `/${id}/cancel-draft`, "back_office");
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ id, status: "cancelled" });
    const d = await details(id);
    expect(d.status).toBe("cancelled");
    expect(d.proNumber).toBe(c.json.data.proNumber);
    expect(await proLedger(g.itemIds[0]!)).toHaveLength(0);
    expect((await itemRow(g.itemIds[0]!)).currentStock).toBe(980);
    expect((await grnLine(g.lineIds[0]!)).acceptedReturnedQty).toBe(0);
    const list = await call(
      "GET",
      `/getreturns?grnId=${g.grnId}&status=cancelled`,
      "back_office",
    );
    expect(list.json.data.map((x: any) => x.id)).toEqual([id]);
    expect((await eventsOf(id)).map((e) => e.action)).toEqual([
      "create",
      "cancel_draft",
    ]);
  });

  test("BR-PRT-11 cancelling an unknown draft is 404", async () => {
    expect(
      (await call("POST", "/999999999/cancel-draft", "back_office")).status,
    ).toBe(404);
  });

  test("BR-PRT-46 cancelling a draft twice: the second is 409 PRT_NOT_EDITABLE", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    expect(
      (await call("POST", `/${id}/cancel-draft`, "back_office")).status,
    ).toBe(200);
    const r = await call("POST", `/${id}/cancel-draft`, "back_office");
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("PRT_NOT_EDITABLE");
  });

  test("BR-PRT-10 editing a cancelled draft is 409 PRT_NOT_EDITABLE", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    await call("POST", `/${id}/cancel-draft`, "back_office");
    const r = await call("PATCH", "/updatereturn", "back_office", {
      id,
      reason: "another reason",
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("PRT_NOT_EDITABLE");
  });

  test("BR-PRT-10 a posted return cannot be edited or draft-cancelled (409 PRT_NOT_EDITABLE), nothing changes", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)]);
    const e = await call("PATCH", "/updatereturn", "back_office", {
      id: p.id,
      lines: [ln(g, 0, "accepted", 10)],
    });
    expect(e.status).toBe(409);
    expect(e.json.code).toBe("PRT_NOT_EDITABLE");
    const c = await call("POST", `/${p.id}/cancel-draft`, "back_office");
    expect(c.status).toBe(409);
    expect(c.json.code).toBe("PRT_NOT_EDITABLE");
    expect((await retLines(p.id))[0]!.returnQty).toBe(30);
    expect((await retRow(p.id)).status).toBe("posted");
  });

  test("BR-PRT-28 a cancelled draft frees its qty under the cap", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 20)]);
    expect((await createRet(g, [ln(g, 0, "rejected", 1)])).status).toBe(400);
    await call("POST", `/${id}/cancel-draft`, "back_office");
    expect((await createRet(g, [ln(g, 0, "rejected", 20)])).status).toBe(201);
  });
});

describe("cancel a posted return (BR-PRT-25..28, 41)", () => {
  test("BR-PRT-25 without a reason, a 2-char or 501-char reason is 400, return stays posted", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)]);
    expect((await cancelPosted(p.id, {})).status).toBe(400);
    expect((await cancelPosted(p.id, { reason: "ab" })).status).toBe(400);
    expect((await cancelPosted(p.id, { reason: "x".repeat(501) })).status).toBe(
      400,
    );
    expect((await retRow(p.id)).status).toBe("posted");
    expect(await proLedger(g.itemIds[0]!, "pro_cancel")).toHaveLength(0);
  });

  test("BR-PRT-25 floor supervisor and qa inspector cannot cancel a posted return: 403, nothing changes", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)]);
    for (const role of ["floor_supervisor", "qa_inspector"] as const) {
      const r = await cancelPosted(
        p.id,
        { reason: "truck turned back at gate" },
        role,
      );
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("PERMISSION_DENIED");
    }
    expect((await retRow(p.id)).status).toBe("posted");
  });

  test("BR-PRT-25 cancelling a draft or an already cancelled return through /cancel is 409 PRT_NOT_POSTED", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const draft = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    const r1 = await cancelPosted(draft, {
      reason: "truck turned back at gate",
    });
    expect(r1.status).toBe(409);
    expect(r1.json.code).toBe("PRT_NOT_POSTED");
    const p = await mkPosted(g, [ln(g, 0, "rejected", 5)]);
    expect(
      (await cancelPosted(p.id, { reason: "truck turned back at gate" }))
        .status,
    ).toBe(200);
    const r2 = await cancelPosted(p.id, {
      reason: "truck turned back at gate",
    });
    expect(r2.status).toBe(409);
    expect(r2.json.code).toBe("PRT_NOT_POSTED");
  });

  test("BR-PRT-25 cancel of an unknown return is 404", async () => {
    expect(
      (await cancelPosted(999999999, { reason: "truck turned back at gate" }))
        .status,
    ).toBe(404);
  });

  test("BR-PRT-26 cancel posts a counter row: in, +30 at the same location and cost, ref pro_cancel; ledger net 0", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)]);
    const r = await cancelPosted(p.id, { reason: "truck turned back at gate" });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({
      id: p.id,
      status: "cancelled",
      debitNoteStatus: "cancelled",
    });
    const out = (await proLedger(g.itemIds[0]!))[0]!;
    const rows = await proLedger(g.itemIds[0]!, "pro_cancel");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.transactionType).toBe("in");
    expect(rows[0]!.quantityChange).toBe(30);
    expect(rows[0]!.unitCostPaise).toBe(21000);
    expect(rows[0]!.locationId).toBe(out.locationId);
    expect(rows[0]!.referenceId).toBe(p.id);
    expect(rows[0]!.totalValueChangePaise! + out.totalValueChangePaise!).toBe(
      0,
    );
    expect((await itemRow(g.itemIds[0]!)).currentStock).toBe(980);
    expect((await retLines(p.id))[0]!.cancelLedgerId).toBe(rows[0]!.id);
  });

  test("BR-PRT-26 a rejected line posts no counter row on cancel", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "rejected", 20)]);
    expect(
      (await cancelPosted(p.id, { reason: "truck turned back at gate" }))
        .status,
    ).toBe(200);
    expect(await proLedger(g.itemIds[0]!, "pro_cancel")).toHaveLength(0);
    expect((await itemRow(g.itemIds[0]!)).currentStock).toBe(980);
  });

  test("BR-PRT-26 cancel is allowed even if the stock was issued since (counter row is a stock-in)", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)]);
    const t = await raw("POST", "/api/asset/inventory/movements", "owner", {
      itemId: g.itemIds[0],
      locationId: mainStoreId,
      referenceType: "stock_adjustment",
      countedQty: 0,
      reason: "test count",
    });
    expect(t.status).toBe(201);
    expect(
      (await cancelPosted(p.id, { reason: "truck turned back at gate" }))
        .status,
    ).toBe(200);
    expect((await itemRow(g.itemIds[0]!)).currentStock).toBe(30);
  });

  test("BR-PRT-27 cancel takes the qty back off the GRN line and PO line returned qty; credit only leaves received qty", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [
      ln(g, 0, "accepted", 30),
      ln(g, 0, "rejected", 20),
    ]);
    await cancelPosted(p.id, { reason: "truck turned back at gate" });
    const l = await grnLine(g.lineIds[0]!);
    expect(l.acceptedReturnedQty).toBe(0);
    expect(l.rejectedReturnedQty).toBe(0);
    const pi = await poItemRow(g.poItemIds[0]!);
    expect(pi.returnedQty).toBe(0);
    expect(pi.receivedQty).toBe(980);
    expect((await poRow(g.poId)).status).toBe("partial_received");
  });

  test("BR-PRT-27 cancelling a replacement return adds the qty back to received and recomputes PO status", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000 }]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)], {
      replacementExpected: true,
    });
    expect((await poRow(g.poId)).status).toBe("partial_received");
    expect(
      (await cancelPosted(p.id, { reason: "truck turned back at gate" }))
        .status,
    ).toBe(200);
    expect((await poItemRow(g.poItemIds[0]!)).receivedQty).toBe(1000);
    expect((await poItemRow(g.poItemIds[0]!)).returnedQty).toBe(0);
    expect((await poRow(g.poId)).status).toBe("fully_received");
  });

  test("BR-PRT-27 cancelling a replacement return on a closed PO is 409 PRT_REPLACEMENT_PO_CLOSED, nothing changes", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000 }]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)], {
      replacementExpected: true,
    });
    await db
      .update(purchaseOrders)
      .set({ status: "closed" })
      .where(eq(purchaseOrders.id, g.poId));
    const r = await cancelPosted(p.id, { reason: "truck turned back at gate" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("PRT_REPLACEMENT_PO_CLOSED");
    expect((await retRow(p.id)).status).toBe("posted");
    expect(await proLedger(g.itemIds[0]!, "pro_cancel")).toHaveLength(0);
    expect((await poItemRow(g.poItemIds[0]!)).receivedQty).toBe(970);
  });

  test("BR-PRT-27 cancel that would push received above ordered x 1.05 is 409 PRT_OVER_RECEIPT, nothing changes", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000 }]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)], {
      replacementExpected: true,
    });
    // replacement GRN of 60 on the reopened PO: received 970 + 60 = 1030 (<= 1050)
    await mkGrn([{ qty: 60, poIdx: 0 }], { po: g });
    expect((await poItemRow(g.poItemIds[0]!)).receivedQty).toBe(1030);
    const r = await cancelPosted(p.id, { reason: "truck turned back at gate" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("PRT_OVER_RECEIPT");
    expect((await retRow(p.id)).status).toBe("posted");
    expect((await poItemRow(g.poItemIds[0]!)).receivedQty).toBe(1030);
    expect((await poItemRow(g.poItemIds[0]!)).returnedQty).toBe(30);
    expect(await proLedger(g.itemIds[0]!, "pro_cancel")).toHaveLength(0);
    expect((await dnRow(p.id))!.status).toBe("issued");
  });

  test("BR-PRT-28 cancel marks the debit note cancelled and keeps its number", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "rejected", 20)]);
    await cancelPosted(p.id, { reason: "truck turned back at gate" });
    const dn = (await details(p.id)).debitNote;
    expect(dn.status).toBe("cancelled");
    expect(dn.dnNumber).toBe(p.dnNumber);
    expect((await dnRow(p.id))!.cancelledAt).not.toBeNull();
  });

  test("BR-PRT-28 a cancelled return frees its qty under the caps (20 rejected returnable again)", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [
      ln(g, 0, "rejected", 20),
      ln(g, 0, "accepted", 980),
    ]);
    expect((await createRet(g, [ln(g, 0, "rejected", 1)])).status).toBe(400);
    await cancelPosted(p.id, { reason: "truck turned back at gate" });
    expect(
      (
        await createRet(g, [
          ln(g, 0, "rejected", 20),
          ln(g, 0, "accepted", 980),
        ])
      ).status,
    ).toBe(201);
  });

  test("BR-PRT-41 cancel stores who, when, reason, and a posted to cancelled event", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)]);
    await cancelPosted(
      p.id,
      { reason: "  truck turned back at gate  " },
      "owner",
    );
    const d = await details(p.id);
    expect(d.status).toBe("cancelled");
    expect(d.cancelledBy).toBe(await userFor("owner"));
    expect(d.cancelledAt).toBeTruthy();
    expect(d.cancelReason).toBe("truck turned back at gate");
    expect(d.events.map((e: any) => e.action)).toEqual([
      "create",
      "post",
      "cancel_posted",
    ]);
    const last = d.events[2];
    expect(last.fromStatus).toBe("posted");
    expect(last.toStatus).toBe("cancelled");
    expect(last.reason).toBe("truck turned back at gate");
  });
});
