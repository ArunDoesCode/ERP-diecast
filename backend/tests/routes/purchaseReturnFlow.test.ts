/**
 * Purchase returns: counters and returns list on GRN and PO details (BR-PRT-19, 20, 38).
 * Real DB, full HTTP stack via createApp(). Fixtures are TEST_prtflow_ prefixed and removed in afterAll.
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
const RUN = `TEST_prtflow_${Date.now()}`;
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

const grnDetails = async (id: number) =>
  (await grnCall("GET", `/getgrndetails/${id}`, "super-admin")).json.data;
const poDetails = async (id: number) =>
  (await raw("GET", `/api/po/getpodetails/${id}`, "super-admin")).json.data;
const byId = (rows: any[], id: number, itemId: number) =>
  rows.find((r) => r.id === id) ?? rows.find((r) => r.itemId === itemId);
const num = (v: unknown) => Number(v);

describe("returned qty and returns list on GRN and PO details (BR-PRT-19, 20, 38)", () => {
  beforeAll(async () => {
    await ensureCompany();
  });

  test("BR-PRT-38 GRN details show rejected and accepted returned qty per line after posting", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    await mkPosted(g, [ln(g, 0, "rejected", 20), ln(g, 0, "accepted", 30)]);
    const d = await grnDetails(g.grnId);
    const line = byId(d.items, g.lineIds[0]!, g.itemIds[0]!);
    expect(num(line.rejectedReturnedQty)).toBe(20);
    expect(num(line.acceptedReturnedQty)).toBe(30);
  });

  test("BR-PRT-38 GRN details list the return as {id, proNumber, status} once posted", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "rejected", 20)]);
    const d = await grnDetails(g.grnId);
    expect(d.returns).toHaveLength(1);
    expect(d.returns[0].id).toBe(p.id);
    expect(d.returns[0].proNumber).toBe((await retRow(p.id)).proNumber);
    expect(d.returns[0].status).toBe("posted");
  });

  test("BR-PRT-38 GRN details start with zero counters and no returns", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const d = await grnDetails(g.grnId);
    const line = byId(d.items, g.lineIds[0]!, g.itemIds[0]!);
    expect(num(line.rejectedReturnedQty)).toBe(0);
    expect(num(line.acceptedReturnedQty)).toBe(0);
    expect(d.returns).toEqual([]);
  });

  test("BR-PRT-38 a draft return does not move the returned counters", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    await mkDraft(g, [ln(g, 0, "rejected", 20)]);
    const d = await grnDetails(g.grnId);
    const line = byId(d.items, g.lineIds[0]!, g.itemIds[0]!);
    expect(num(line.rejectedReturnedQty)).toBe(0);
    expect(num(line.acceptedReturnedQty)).toBe(0);
  });

  test("BR-PRT-38 PO details show returned qty per line and the return in returns[]", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [ln(g, 0, "accepted", 30)]);
    const d = await poDetails(g.poId);
    const line = byId(d.items, g.poItemIds[0]!, g.itemIds[0]!);
    expect(num(line.returnedQty)).toBe(30);
    expect(d.returns).toHaveLength(1);
    expect(d.returns[0].id).toBe(p.id);
    expect(d.returns[0].status).toBe("posted");
    expect(d.returns[0].proNumber).toBe((await retRow(p.id)).proNumber);
  });

  test("BR-PRT-20 PO details: a rejected-only return shows returnedQty 20 and received qty stays 980", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    await mkPosted(g, [ln(g, 0, "rejected", 20)]);
    const d = await poDetails(g.poId);
    const line = byId(d.items, g.poItemIds[0]!, g.itemIds[0]!);
    expect(num(line.returnedQty)).toBe(20);
    expect(num(line.receivedQty)).toBe(980);
  });

  test("BR-PRT-38 after cancelling a posted return the counters go back and the return shows cancelled", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const p = await mkPosted(g, [
      ln(g, 0, "rejected", 20),
      ln(g, 0, "accepted", 30),
    ]);
    const c = await cancelPosted(p.id, { reason: "truck turned back at gate" });
    expect(c.status).toBe(200);

    const gd = await grnDetails(g.grnId);
    const gl = byId(gd.items, g.lineIds[0]!, g.itemIds[0]!);
    expect(num(gl.rejectedReturnedQty)).toBe(0);
    expect(num(gl.acceptedReturnedQty)).toBe(0);
    expect(gd.returns).toHaveLength(1);
    expect(gd.returns[0].id).toBe(p.id);
    expect(gd.returns[0].status).toBe("cancelled");

    const pd = await poDetails(g.poId);
    const pl = byId(pd.items, g.poItemIds[0]!, g.itemIds[0]!);
    expect(num(pl.returnedQty)).toBe(0);
    expect(pd.returns).toHaveLength(1);
    expect(pd.returns[0].id).toBe(p.id);
    expect(pd.returns[0].status).toBe("cancelled");
  });
});
