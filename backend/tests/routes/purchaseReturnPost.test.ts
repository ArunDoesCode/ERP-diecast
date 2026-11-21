/**
 * Purchase returns: post, stock, debit note, challan, PO/GRN effects (BR-PRT-12..24, 29..35, 42, 46, 47).
 * Real DB, full HTTP stack via createApp(). Fixtures are TEST_prtpost_ prefixed and removed in afterAll.
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
const RUN = `TEST_prtpost_${Date.now()}`;
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

const FY = () => {
  const d = ISTNOW();
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
};
const seqOf = (n: string) => Number(n.split("/").pop());

async function setStock(itemId: number, counted: number) {
  const r = await raw("POST", "/api/asset/inventory/movements", "owner", {
    itemId,
    locationId: mainStoreId,
    referenceType: "stock_adjustment",
    countedQty: counted,
    reason: "test count",
  });
  expect(r.status).toBe(201);
}

describe("post: permission and atomicity (BR-PRT-12, 13, 34, 47)", () => {
  test("BR-PRT-12 floor supervisor posts: 403, return stays draft, no ledger row", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    await ensureCompany();
    const id = await mkDraft(g, [ln(g, 0, "accepted", 30)]);
    expect((await postRet(id, "floor_supervisor")).status).toBe(403);
    expect((await retRow(id)).status).toBe("draft");
    expect(await proLedger(g.itemIds[0]!)).toHaveLength(0);
    expect(await dnRow(id)).toBeUndefined();
  });

  test("BR-PRT-12 post saves ledger, stock, status, debit note, GRN and PO returned qty together", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [
      ln(g, 0, "accepted", 30),
      ln(g, 0, "rejected", 20),
    ]);
    expect(p.status).toBe("posted");
    expect(p.ledgerRowIds).toHaveLength(1);
    expect((await retRow(p.id)).status).toBe("posted");
    expect(await dnRow(p.id)).toBeDefined();
    expect((await itemRow(g.itemIds[0]!)).currentStock).toBe(950);
    expect((await grnLine(g.lineIds[0]!)).acceptedReturnedQty).toBe(30);
    expect((await grnLine(g.lineIds[0]!)).rejectedReturnedQty).toBe(20);
    expect((await poItemRow(g.poItemIds[0]!)).returnedQty).toBe(50);
  });

  test("BR-PRT-34 an item without HSN is 400 PRT_HSN_MISSING, nothing posted", async () => {
    await ensureCompany();
    const g = await mkGrn([
      { qty: 1000, accepted: 980, rejected: 20, hsn: null },
    ]);
    const id = await mkDraft(g, [ln(g, 0, "accepted", 30)]);
    const r = await postRet(id);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("PRT_HSN_MISSING");
    expect((await retRow(id)).status).toBe("draft");
    expect(await proLedger(g.itemIds[0]!)).toHaveLength(0);
    expect(await dnRow(id)).toBeUndefined();
    expect((await itemRow(g.itemIds[0]!)).currentStock).toBe(980);
  });

  test("BR-PRT-34 missing plant GSTIN or state is 400 PRT_COMPANY_SETTINGS_MISSING, nothing posted", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "accepted", 30)]);
    await db.delete(companySettings);
    const r = await postRet(id);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("PRT_COMPANY_SETTINGS_MISSING");
    expect((await retRow(id)).status).toBe("draft");
    expect(await proLedger(g.itemIds[0]!)).toHaveLength(0);
    await ensureCompany();
  });

  test("BR-PRT-13 two posts of the same return at once: one 200, one 409, one set of ledger rows", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "accepted", 30)]);
    const rs = await Promise.all([postRet(id), postRet(id)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await proLedger(g.itemIds[0]!)).toHaveLength(1);
    expect((await grnLine(g.lineIds[0]!)).acceptedReturnedQty).toBe(30);
    expect((await poItemRow(g.poItemIds[0]!)).returnedQty).toBe(30);
  });

  test("BR-PRT-13 a second post after the first is 409 PRT_NOT_EDITABLE", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)]);
    const r = await postRet(p.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("PRT_NOT_EDITABLE");
  });

  test("BR-PRT-07 a draft over the cap at post (rejected qty lowered meanwhile) is 409 PRT_CAP_EXCEEDED, nothing posted", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [
      ln(g, 0, "rejected", 15),
      ln(g, 0, "accepted", 30),
    ]);
    await db
      .update(grnItems)
      .set({ rejectedQty: 10 })
      .where(eq(grnItems.id, g.lineIds[0]!));
    const r = await postRet(id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("PRT_CAP_EXCEEDED");
    expect((await retRow(id)).status).toBe("draft");
    expect(await proLedger(g.itemIds[0]!)).toHaveLength(0);
    expect(await dnRow(id)).toBeUndefined();
  });

  test("BR-PRT-46 edit and post at the same moment: post wins 200, an edit that lost gets 409 PRT_NOT_EDITABLE", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "accepted", 30)]);
    const [po, ed] = await Promise.all([
      postRet(id),
      call("PATCH", "/updatereturn", "back_office", {
        id,
        lines: [ln(g, 0, "accepted", 10)],
      }),
    ]);
    expect(po.status).toBe(200);
    expect([200, 409]).toContain(ed.status);
    if (ed.status === 409) {
      expect(ed.json.code).toBe("PRT_NOT_EDITABLE");
      expect((await retLines(id))[0]!.returnQty).toBe(30);
    } else {
      // the edit took the lock first: the posted qty is the edited qty
      expect((await retLines(id))[0]!.returnQty).toBe(10);
    }
  });

  test("BR-PRT-46 cancel-draft and post at the same moment: exactly one wins, the other is 409", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "accepted", 30)]);
    const [po, cd] = await Promise.all([
      postRet(id),
      call("POST", `/${id}/cancel-draft`, "back_office"),
    ]);
    expect([po.status, cd.status].sort()).toEqual([200, 409]);
    const st = (await retRow(id)).status;
    expect(st).toBe(po.status === 200 ? "posted" : "cancelled");
    expect(await proLedger(g.itemIds[0]!)).toHaveLength(
      po.status === 200 ? 1 : 0,
    );
  });

  test("BR-PRT-47 the user who created the draft may post it; both names are kept", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "accepted", 30)]);
    expect((await postRet(id, "back_office")).status).toBe(200);
    const d = await details(id);
    const bo = await userFor("back_office");
    expect(d.createdBy).toBe(bo);
    expect(d.postedBy).toBe(bo);
  });

  test("BR-PRT-41 post stores posted by, posted at (server time) and a draft to posted event", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "accepted", 30)]);
    const before = Date.now();
    await postRet(id, "owner");
    const after = Date.now();
    const row = await retRow(id);
    expect(row.postedBy).toBe(await userFor("owner"));
    expect(row.postedAt!.getTime()).toBeGreaterThanOrEqual(before - 5000);
    expect(row.postedAt!.getTime()).toBeLessThanOrEqual(after + 5000);
    const ev = await eventsOf(id);
    expect(ev.map((e) => e.action)).toEqual(["create", "post"]);
    expect(ev[1]!.fromStatus).toBe("draft");
    expect(ev[1]!.toStatus).toBe("posted");
    expect(ev[1]!.actorId).toBe(await userFor("owner"));
    expect((await details(id)).preview).toBeNull();
  });
});

describe("post: stock (BR-PRT-14..18)", () => {
  test("BR-PRT-14 accepted line posts one out row at the GRN posting's location and cost, ref pro", async () => {
    await ensureCompany();
    const g = await mkGrn([
      { qty: 1000, accepted: 980, rejected: 20, batch: "H-881" },
    ]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)]);
    const rows = await proLedger(g.itemIds[0]!);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.transactionType).toBe("out");
    expect(row.quantityChange).toBe(-30);
    expect(row.unitCostPaise).toBe(21000);
    expect(row.locationId).toBe(mainStoreId);
    expect(row.referenceId).toBe(p.id);
    expect(row.referenceLineId).toBe((await retLines(p.id))[0]!.id);
    expect(row.batchNumber).toBe("H-881");
    expect(p.ledgerRowIds).toEqual([row.id]);
    const grnRow = (await allLedger(g.itemIds[0]!)).find(
      (r) => r.referenceType === "grn",
    )!;
    expect(row.locationId).toBe(grnRow.locationId);
    expect(row.unitCostPaise).toBe(grnRow.unitCostPaise);
  });

  test("BR-PRT-15 a rejected line posts no ledger row and leaves stock unchanged", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const before = await itemRow(g.itemIds[0]!);
    const p = await mkPosted(g, [ln(g, 0, "rejected", 20)]);
    expect(p.ledgerRowIds).toEqual([]);
    expect(await proLedger(g.itemIds[0]!)).toHaveLength(0);
    const after = await itemRow(g.itemIds[0]!);
    expect(after.currentStock).toBe(before.currentStock);
    expect(after.averageCostPaise).toBe(before.averageCostPaise);
  });

  test("BR-PRT-16 accepted return below zero balance is 409 INSUFFICIENT_STOCK, nothing posted", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    await setStock(g.itemIds[0]!, 20);
    const id = await mkDraft(g, [ln(g, 0, "accepted", 30)]);
    const r = await postRet(id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("INSUFFICIENT_STOCK");
    expect((await retRow(id)).status).toBe("draft");
    expect(await proLedger(g.itemIds[0]!)).toHaveLength(0);
    expect((await itemRow(g.itemIds[0]!)).currentStock).toBe(20);
    expect((await grnLine(g.lineIds[0]!)).acceptedReturnedQty).toBe(0);
  });

  test("BR-PRT-17 average after an accepted return follows (stock x avg - qty x cost) / (stock - qty), half up", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    // a second location with another cost moves the average away from the GRN cost
    const [loc2] = await db
      .insert(locations)
      .values({ name: uid(), type: "finished_goods" })
      .returning({ id: locations.id });
    locIds.push(loc2!.id);
    const o = await raw("POST", "/api/asset/inventory/movements", "owner", {
      itemId: g.itemIds[0],
      locationId: loc2!.id,
      referenceType: "opening_stock",
      qty: 500,
      unitCostPaise: 22333,
      reason: "test opening",
    });
    expect(o.status).toBe(201);
    const pre = await itemRow(g.itemIds[0]!);
    const stock = pre.currentStock;
    const avg = pre.averageCostPaise as number;
    const qty = 30;
    const expected = Math.round((stock * avg - qty * 21000) / (stock - qty));
    await mkPosted(g, [ln(g, 0, "accepted", qty)]);
    const post = await itemRow(g.itemIds[0]!);
    expect(post.currentStock).toBe(stock - qty);
    expect(post.averageCostPaise).toBe(expected);
  });

  test("BR-PRT-17 when stock goes to exactly zero the average stays", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const pre = await itemRow(g.itemIds[0]!);
    await mkPosted(g, [ln(g, 0, "accepted", 980)]);
    const post = await itemRow(g.itemIds[0]!);
    expect(post.currentStock).toBe(0);
    expect(post.averageCostPaise).toBe(pre.averageCostPaise);
  });

  test("BR-PRT-18 row value is qty x cost: -30 x 21,000 = -630,000", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    await mkPosted(g, [ln(g, 0, "accepted", 30)]);
    expect((await proLedger(g.itemIds[0]!))[0]!.totalValueChangePaise).toBe(
      -630000,
    );
  });

  test("BR-PRT-18 rounding is half away from zero: -0.5 x 10,003 = -5,002", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 10, price: 10003 }]);
    await mkPosted(g, [ln(g, 0, "accepted", 0.5)]);
    expect((await proLedger(g.itemIds[0]!))[0]!.totalValueChangePaise).toBe(
      -5002,
    );
  });
});

describe("post: GRN and PO effects (BR-PRT-19..22, 24)", () => {
  test("BR-PRT-19 returned qty goes on the GRN line; QA result, accepted qty and header status do not change", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const lineBefore = await grnLine(g.lineIds[0]!);
    const headBefore = await grnHeader(g.grnId);
    await mkPosted(g, [ln(g, 0, "rejected", 20)]);
    const line = await grnLine(g.lineIds[0]!);
    expect(line.rejectedReturnedQty).toBe(20);
    expect(line.acceptedReturnedQty).toBe(0);
    expect(line.qaStatus).toBe(lineBefore.qaStatus);
    expect(line.acceptedQty).toBe(lineBefore.acceptedQty);
    expect((await grnHeader(g.grnId)).status).toBe(headBefore.status);
  });

  test("BR-PRT-20 a rejected return changes PO returned qty only, never received qty or PO status", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const poBefore = await poRow(g.poId);
    await mkPosted(g, [ln(g, 0, "rejected", 20)]);
    const pi = await poItemRow(g.poItemIds[0]!);
    expect(pi.receivedQty).toBe(980);
    expect(pi.returnedQty).toBe(20);
    expect((await poRow(g.poId)).status).toBe(poBefore.status);
    expect((await poRow(g.poId)).status).toBe("partial_received");
  });

  test("BR-PRT-21 accepted return is credit only by default: PO received qty and status stay", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    await mkPosted(g, [ln(g, 0, "accepted", 30)]);
    const pi = await poItemRow(g.poItemIds[0]!);
    expect(pi.receivedQty).toBe(980);
    expect(pi.returnedQty).toBe(30);
    expect((await poRow(g.poId)).status).toBe("partial_received");
  });

  test("BR-PRT-22 replacement expected lowers PO received qty and recomputes status", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000 }]);
    expect((await poRow(g.poId)).status).toBe("fully_received");
    await mkPosted(g, [ln(g, 0, "accepted", 30)], {
      replacementExpected: true,
    });
    expect((await poItemRow(g.poItemIds[0]!)).receivedQty).toBe(970);
    expect((await poItemRow(g.poItemIds[0]!)).returnedQty).toBe(30);
    expect((await poRow(g.poId)).status).toBe("partial_received");
  });

  test("BR-PRT-22 replacement on an invoiced or closed PO is 409 PRT_REPLACEMENT_PO_CLOSED, nothing posted", async () => {
    await ensureCompany();
    for (const st of ["invoiced", "closed"] as const) {
      const g = await mkGrn([{ qty: 1000 }]);
      const id = await mkDraft(g, [ln(g, 0, "accepted", 30)], {
        replacementExpected: true,
      });
      await db
        .update(purchaseOrders)
        .set({ status: st })
        .where(eq(purchaseOrders.id, g.poId));
      const r = await postRet(id);
      expect(r.status).toBe(409);
      expect(r.json.code).toBe("PRT_REPLACEMENT_PO_CLOSED");
      expect((await retRow(id)).status).toBe("draft");
      expect(await proLedger(g.itemIds[0]!)).toHaveLength(0);
      expect((await poItemRow(g.poItemIds[0]!)).receivedQty).toBe(1000);
    }
  });

  test("BR-PRT-24 credit-only return posts on an invoiced or closed PO and makes the debit note", async () => {
    await ensureCompany();
    for (const st of ["invoiced", "closed"] as const) {
      const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
      const id = await mkDraft(g, [ln(g, 0, "rejected", 20)]);
      await db
        .update(purchaseOrders)
        .set({ status: st })
        .where(eq(purchaseOrders.id, g.poId));
      expect((await postRet(id)).status).toBe(200);
      expect(await dnRow(id)).toBeDefined();
      expect((await poItemRow(g.poItemIds[0]!)).returnedQty).toBe(20);
    }
  });
});

describe("debit note and challan (BR-PRT-29..35)", () => {
  test("BR-PRT-29 one post makes exactly one debit note for the whole return; it moves no stock", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [
      ln(g, 0, "accepted", 30),
      ln(g, 0, "rejected", 20),
    ]);
    const dns = await db
      .select()
      .from(purchaseDebitNotes)
      .where(eq(purchaseDebitNotes.proId, p.id));
    expect(dns).toHaveLength(1);
    expect(p.debitNoteId).toBe(dns[0]!.id);
    expect(p.dnNumber).toBe(dns[0]!.dnNumber);
    // only the accepted line moved stock
    expect(await proLedger(g.itemIds[0]!)).toHaveLength(1);
    expect(dns[0]!.status).toBe("issued");
  });

  test("BR-PRT-31 line taxable = qty x rate, GST per line; totals are the sums (20 kg: 420,000 + 75,600 = 495,600)", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "rejected", 20)]);
    expect(p.totalPaise).toBe(495600);
    const d = await details(p.id);
    expect(d.debitNote.taxablePaise).toBe(420000);
    expect(d.debitNote.totalPaise).toBe(495600);
    expect(
      d.debitNote.cgstPaise + d.debitNote.sgstPaise + d.debitNote.igstPaise,
    ).toBe(75600);
    expect(d.lines[0].taxablePaise).toBe(420000);
    expect(d.lines[0].gstPaise).toBe(75600);
  });

  test("BR-PRT-31 a two-line return sums taxable, GST and total", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [
      ln(g, 0, "accepted", 30),
      ln(g, 0, "rejected", 20),
    ]);
    const dn = (await details(p.id)).debitNote;
    expect(dn.taxablePaise).toBe(630000 + 420000);
    expect(dn.totalPaise).toBe(743400 + 495600);
    expect(dn.cgstPaise).toBe(56700 + 37800);
    expect(dn.sgstPaise).toBe(56700 + 37800);
    expect(dn.igstPaise).toBe(0);
  });

  test("BR-PRT-32 same state: odd line GST 1,801 splits CGST 901 + SGST 900", async () => {
    await ensureCompany({ stateCode: "27", gstin: "27AAACD1234F1Z5" });
    const sup = await newSupplier("27AAACS1111A1Z5");
    const g = await mkGrn(
      [{ qty: 10, accepted: 9, rejected: 1, price: 10003 }],
      { supplier: sup },
    );
    const p = await mkPosted(g, [ln(g, 0, "rejected", 1)]);
    const d = await details(p.id);
    expect(d.debitNote.isInterstate).toBe(false);
    expect(d.lines[0].gstPaise).toBe(1801);
    expect(d.lines[0].cgstPaise).toBe(901);
    expect(d.lines[0].sgstPaise).toBe(900);
    expect(d.debitNote.cgstPaise).toBe(901);
    expect(d.debitNote.sgstPaise).toBe(900);
    expect(d.debitNote.igstPaise).toBe(0);
  });

  test("BR-PRT-32 different state: all GST is IGST", async () => {
    await ensureCompany({ stateCode: "27", gstin: "27AAACD1234F1Z5" });
    const sup = await newSupplier("29AAACS2222A1Z5");
    const g = await mkGrn(
      [{ qty: 10, accepted: 9, rejected: 1, price: 10003 }],
      { supplier: sup },
    );
    const p = await mkPosted(g, [ln(g, 0, "rejected", 1)]);
    const d = await details(p.id);
    expect(d.debitNote.isInterstate).toBe(true);
    expect(d.lines[0].igstPaise).toBe(1801);
    expect(d.debitNote.igstPaise).toBe(1801);
    expect(d.debitNote.cgstPaise).toBe(0);
    expect(d.debitNote.sgstPaise).toBe(0);
  });

  test("BR-PRT-32 a supplier without GSTIN is treated as same state", async () => {
    await ensureCompany();
    const sup = await newSupplier(null);
    const g = await mkGrn(
      [{ qty: 10, accepted: 9, rejected: 1, price: 10003 }],
      { supplier: sup },
    );
    const p = await mkPosted(g, [ln(g, 0, "rejected", 1)]);
    const d = await details(p.id);
    expect(d.debitNote.isInterstate).toBe(false);
    expect(d.debitNote.igstPaise).toBe(0);
    expect(d.debitNote.cgstPaise + d.debitNote.sgstPaise).toBe(1801);
  });

  test("BR-PRT-33 debit note snapshot: plant, supplier, line HSN, heat no., no linked bill yet", async () => {
    await ensureCompany();
    const sup = await newSupplier("27AAACS3333A1Z5");
    const g = await mkGrn(
      [{ qty: 1000, accepted: 980, rejected: 20, hsn: "7601", batch: "H-881" }],
      { supplier: sup },
    );
    const p = await mkPosted(g, [ln(g, 0, "rejected", 20)]);
    const d = await details(p.id);
    const dn = d.debitNote;
    expect(dn.plantGstin).toBe("27AAACD1234F1Z5");
    expect(dn.plantStateCode).toBe("27");
    expect(dn.plantName).toContain(RUN);
    expect(dn.plantAddress).toBe("Plot 1, MIDC, Pune");
    expect(dn.supplierGstin).toBe("27AAACS3333A1Z5");
    expect(dn.supplierAddress).toBe("Supplier Road, Pune");
    expect(dn.supplierBill).toBeNull();
    expect(dn.status).toBe("issued");
    expect(d.grnNumber).toBe(g.grnNumber);
    expect(d.grnChallanNo).toBe(g.challanNo);
    expect(d.lines[0].hsnCode).toBe("7601");
    expect(d.lines[0].batchNumber).toBe("H-881");
    expect(d.lines[0].itemName).toContain(RUN);
  });

  test("BR-PRT-30 debit note number is DN/<yy>-<yy+1>/<seq> in the FY of the post day; next one is +1", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const a = await mkPosted(g, [ln(g, 0, "rejected", 5)]);
    const b = await mkPosted(g, [ln(g, 0, "rejected", 5)]);
    expect(a.dnNumber).toMatch(new RegExp(`^DN/${FY()}/\\d+$`));
    expect(b.dnNumber).toMatch(new RegExp(`^DN/${FY()}/\\d+$`));
    expect(seqOf(b.dnNumber)).toBe(seqOf(a.dnNumber) + 1);
  });

  test("BR-PRT-35 challan number is PRC/<yy>-<yy+1>/<seq 4> in its own series; kept after cancel", async () => {
    await ensureCompany();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const a = await mkPosted(g, [ln(g, 0, "rejected", 5)]);
    const b = await mkPosted(g, [ln(g, 0, "rejected", 5)]);
    expect(a.challanNumber).toMatch(new RegExp(`^PRC/${FY()}/\\d{4}$`));
    expect(seqOf(b.challanNumber)).toBe(seqOf(a.challanNumber) + 1);
    expect((await retRow(a.id)).challanNumber).toBe(a.challanNumber);
    expect((await details(a.id)).challanNumber).toBe(a.challanNumber);
    await cancelPosted(a.id, { reason: "truck turned back at gate" });
    expect((await retRow(a.id)).challanNumber).toBe(a.challanNumber);
  });

  test("BR-PRT-35 a draft has no challan number", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    expect((await retRow(id)).challanNumber).toBeNull();
    expect((await details(id)).challanNumber).toBeNull();
  });
});

describe("GRN correction floor (BR-PRT-42)", () => {
  test("BR-PRT-42 a correction below the accepted qty on non-cancelled returns is 400 GRN_CORRECTION_BELOW_RETURNED", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    await mkDraft(g, [ln(g, 0, "accepted", 950)]);
    const url = `/${g.grnId}/lines/${g.lineIds[0]}/correction`;
    const r = await grnCall("POST", url, "back_office", {
      qty: 40,
      reason: "short weight",
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("GRN_CORRECTION_BELOW_RETURNED");
    expect(
      (
        await grnCall("POST", url, "back_office", {
          qty: 30,
          reason: "short weight",
        })
      ).status,
    ).toBe(201);
  });
});
