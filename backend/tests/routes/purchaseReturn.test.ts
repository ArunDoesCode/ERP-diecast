/**
 * Purchase returns: create, caps, edit, list, prefill, details (docs/specs/purchase-returns/spec.md v1, BR-PRT-01..11, 23, 36, 39..41).
 * Real DB, full HTTP stack via createApp(). Fixtures are TEST_prt_ prefixed and removed in afterAll.
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
const RUN = `TEST_prt_${Date.now()}`;
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

describe("who can do what (spec table)", () => {
  test("BR-PRT-37 no login is 401 on every route", async () => {
    for (const [m, p] of [
      ["GET", "/getreturns"],
      ["GET", "/awaiting"],
      ["GET", "/getreturndetails/1"],
      ["GET", "/prefill/1"],
      ["POST", "/createreturn"],
      ["PATCH", "/updatereturn"],
      ["POST", "/1/cancel-draft"],
      ["POST", "/1/post"],
      ["POST", "/1/cancel"],
    ] as const) {
      expect(
        (await call(m, p, null, m === "GET" ? undefined : {})).status,
      ).toBe(401);
    }
  });

  test("BR-PRT-37 operator holds no purchase_return key: every route is 403 PERMISSION_DENIED", async () => {
    for (const [m, p] of [
      ["GET", "/getreturns"],
      ["GET", "/awaiting"],
      ["GET", "/getreturndetails/1"],
      ["GET", "/prefill/1"],
      ["POST", "/createreturn"],
      ["PATCH", "/updatereturn"],
      ["POST", "/1/cancel-draft"],
      ["POST", "/1/post"],
      ["POST", "/1/cancel"],
    ] as const) {
      const r = await call(m, p, "operator", m === "GET" ? undefined : {});
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("PERMISSION_DENIED");
    }
  });

  test("BR-PRT-37 qa_inspector can view but not create, post or cancel", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    expect((await call("GET", "/getreturns", "qa_inspector")).status).toBe(200);
    expect((await call("GET", "/awaiting", "qa_inspector")).status).toBe(200);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    expect(
      (await call("GET", `/getreturndetails/${id}`, "qa_inspector")).status,
    ).toBe(200);
    expect(
      (await createRet(g, [ln(g, 0, "rejected", 5)], {}, "qa_inspector"))
        .status,
    ).toBe(403);
    expect((await postRet(id, "qa_inspector")).status).toBe(403);
    expect(
      (await cancelPosted(id, { reason: "no way" }, "qa_inspector")).status,
    ).toBe(403);
  });

  test("BR-PRT-37 floor_supervisor can create and cancel a draft but cannot post", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const c = await createRet(
      g,
      [ln(g, 0, "rejected", 5)],
      {},
      "floor_supervisor",
    );
    expect(c.status).toBe(201);
    expect((await postRet(c.json.data.id, "floor_supervisor")).status).toBe(
      403,
    );
    expect((await retRow(c.json.data.id)).status).toBe("draft");
    expect(
      (
        await call(
          "POST",
          `/${c.json.data.id}/cancel-draft`,
          "floor_supervisor",
        )
      ).status,
    ).toBe(200);
  });

  test("BR-PRT-37 die_designer has no purchase_return.view", async () => {
    expect((await call("GET", "/getreturns", "die_designer")).status).toBe(403);
  });
});

describe("create from a GRN (BR-PRT-01..04, 08, 09, 23)", () => {
  test("BR-PRT-01 supplier and PO are copied from the GRN", async () => {
    const sup = await newSupplier();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }], {
      supplier: sup,
    });
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    const d = await details(id);
    expect(d.grnId).toBe(g.grnId);
    expect(d.poId).toBe(g.poId);
    expect(d.supplierId).toBe(sup);
    expect(d.status).toBe("draft");
  });

  test("BR-PRT-01 a line of another GRN is 400 PRT_GRN_MISMATCH", async () => {
    const g1 = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const g2 = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const r = await createRet(g1, [ln(g2, 0, "rejected", 5)]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("PRT_GRN_MISMATCH");
    expect((await returnsOfGrn(g1.grnId)).length).toBe(0);
  });

  async function poLessGrn() {
    const [item] = await db
      .insert(itemMaster)
      .values({
        sku: uid(),
        name: `${RUN} item`,
        category: "Raw Material",
        uom: "kg",
        hsnCode: "7601",
      })
      .returning({ id: itemMaster.id });
    itemIds.push(item!.id);
    const [h] = await db
      .insert(grns)
      .values({
        grnNumber: uid(),
        poId: null,
        supplierId,
        status: "accepted",
        challanNo: uid(),
        createdBy: await userFor("owner"),
      })
      .returning({ id: grns.id });
    extraGrnIds.push(h!.id);
    const [l] = await db
      .insert(grnItems)
      .values({
        grnId: h!.id,
        itemId: item!.id,
        receivedQty: 100,
        acceptedQty: 90,
        rejectedQty: 10,
        qaStatus: "passed",
      } as any)
      .returning({ id: grnItems.id });
    return { grnId: h!.id, lineIds: [l!.id] };
  }

  test("BR-PRT-01 a GRN without a PO (subcontract receipt) is 400 PRT_GRN_MISMATCH on create", async () => {
    const g = await poLessGrn();
    const r = await createRet(g, [ln(g, 0, "rejected", 5)]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("PRT_GRN_MISMATCH");
  });

  test("BR-PRT-01 a GRN without a PO is 400 PRT_GRN_MISMATCH at prefill", async () => {
    const g = await poLessGrn();
    const r = await call("GET", `/prefill/${g.grnId}`, "back_office");
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("PRT_GRN_MISMATCH");
  });

  test("BR-PRT-01 unknown GRN is 404 on create and prefill", async () => {
    expect(
      (
        await call("POST", "/createreturn", "back_office", {
          grnId: 999999999,
          reason: REASON,
          lines: [{ grnItemId: 1, source: "rejected", qty: 1 }],
        })
      ).status,
    ).toBe(404);
    expect(
      (await call("GET", "/prefill/999999999", "back_office")).status,
    ).toBe(404);
  });

  test("BR-PRT-02 a line with QA pending cannot be returned (400 PRT_QA_PENDING)", async () => {
    const g = await mkGrn([{ qty: 1000, pending: true }]);
    const r = await createRet(g, [ln(g, 0, "accepted", 5)]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("PRT_QA_PENDING");
  });

  test("BR-PRT-02 waived (QA bypass) line can be returned", async () => {
    const g = await mkGrn([{ qty: 100, pending: true }]);
    const b = await grnCall(
      "POST",
      `/${g.grnId}/lines/${g.lineIds[0]}/bypass`,
      "back_office",
      { bypassReason: "furnace waiting" },
    );
    expect(b.status).toBe(200);
    expect((await createRet(g, [ln(g, 0, "accepted", 5)])).status).toBe(201);
  });

  test("BR-PRT-03 rejected and accepted of the same line on one return is allowed", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const r = await createRet(g, [
      ln(g, 0, "rejected", 20),
      ln(g, 0, "accepted", 30),
    ]);
    expect(r.status).toBe(201);
    expect(await retLines(r.json.data.id)).toHaveLength(2);
  });

  test("BR-PRT-03 the same line and source twice is 400 PRT_DUPLICATE_LINE", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const r = await createRet(g, [
      ln(g, 0, "rejected", 5),
      ln(g, 0, "rejected", 5),
    ]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("PRT_DUPLICATE_LINE");
  });

  test("BR-PRT-03 qty 0, negative, missing source or no lines is 400", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    expect((await createRet(g, [ln(g, 0, "rejected", 0)])).status).toBe(400);
    expect((await createRet(g, [ln(g, 0, "rejected", -1)])).status).toBe(400);
    expect(
      (await createRet(g, [{ grnItemId: g.lineIds[0], qty: 1 }])).status,
    ).toBe(400);
    expect((await createRet(g, [])).status).toBe(400);
    expect((await returnsOfGrn(g.grnId)).length).toBe(0);
  });

  test("BR-PRT-04 whole-number unit: 2.5 pcs is 400, 2 pcs is 201", async () => {
    const g = await mkGrn([
      { qty: 100, uom: "pcs", accepted: 90, rejected: 10 },
    ]);
    expect((await createRet(g, [ln(g, 0, "rejected", 2.5)])).status).toBe(400);
    expect((await createRet(g, [ln(g, 0, "rejected", 2)])).status).toBe(201);
  });

  test("BR-PRT-04 kg: 12.345 is 201, 12.3456 is 400, above 1,000,000,000 is 400", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    expect((await createRet(g, [ln(g, 0, "accepted", 12.345)])).status).toBe(
      201,
    );
    expect((await createRet(g, [ln(g, 0, "accepted", 12.3456)])).status).toBe(
      400,
    );
    expect(
      (await createRet(g, [ln(g, 0, "accepted", 1_000_000_001)])).status,
    ).toBe(400);
  });

  test("BR-PRT-08 reason shorter than 3, longer than 500 or missing is 400", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const lines = [ln(g, 0, "rejected", 5)];
    expect((await createRet(g, lines, { reason: "" })).status).toBe(400);
    expect((await createRet(g, lines, { reason: "ab" })).status).toBe(400);
    expect(
      (await createRet(g, lines, { reason: "x".repeat(501) })).status,
    ).toBe(400);
    expect(
      (
        await call("POST", "/createreturn", "back_office", {
          grnId: g.grnId,
          lines,
        })
      ).status,
    ).toBe(400);
    expect((await returnsOfGrn(g.grnId)).length).toBe(0);
  });

  test("BR-PRT-08 reason and the optional texts are saved", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)], {
      vendorReturnRef: "RMA-77",
      transporter: "Fast Cargo",
      vehicleNo: "MH12AB1234",
      remarks: "handle with care",
    });
    const d = await details(id);
    expect(d.reason).toBe(REASON);
    expect(d.vendorReturnRef).toBe("RMA-77");
    expect(d.transporter).toBe("Fast Cargo");
    expect(d.vehicleNo).toBe("MH12AB1234");
    expect(d.remarks).toBe("handle with care");
    expect(d.replacementExpected).toBe(false);
  });

  test("BR-PRT-09 a body that sends rate, GST %, item, unit or heat no. is 400 and nothing is saved", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    for (const extra of [
      { ratePaise: 1 },
      { unitPricePaise: 1 },
      { gstPercent: 0 },
      { itemId: 1 },
      { uom: "pcs" },
      { batchNumber: "X" },
    ]) {
      const r = await createRet(g, [{ ...ln(g, 0, "rejected", 5), ...extra }]);
      expect(r.status).toBe(400);
    }
    expect(
      (await createRet(g, [ln(g, 0, "rejected", 5)], { ratePaise: 1 })).status,
    ).toBe(400);
    expect((await returnsOfGrn(g.grnId)).length).toBe(0);
  });

  test("BR-PRT-09 line rate, GST % and heat no. come from the PO line and the GRN line", async () => {
    const g = await mkGrn([
      {
        qty: 1000,
        accepted: 980,
        rejected: 20,
        price: 21000,
        gst: 18,
        batch: "H-881",
      },
    ]);
    const d = await details(await mkDraft(g, [ln(g, 0, "rejected", 5)]));
    expect(d.lines[0].ratePaise).toBe(21000);
    expect(d.lines[0].gstPercent).toBe(18);
    expect(d.lines[0].batchNumber).toBe("H-881");
    expect(d.lines[0].uom).toBe("kg");
    expect(d.lines[0].itemId).toBe(g.itemIds[0]);
    expect(d.lines[0].poItemId).toBe(g.poItemIds[0]);
  });

  test("BR-PRT-23 number is PRT-<YYYY-MM>-<seq> in the IST month and never reused", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const a = await createRet(g, [ln(g, 0, "rejected", 1)]);
    const b = await createRet(g, [ln(g, 0, "rejected", 1)]);
    const month = ISTNOW().toISOString().slice(0, 7);
    expect(a.json.data.proNumber).toMatch(new RegExp(`^PRT-${month}-\\d{4}$`));
    expect(b.json.data.proNumber).toMatch(new RegExp(`^PRT-${month}-\\d{4}$`));
    expect(a.json.data.proNumber).not.toBe(b.json.data.proNumber);
    // cancelling a draft keeps the number; the next one is a new number
    await call("POST", `/${b.json.data.id}/cancel-draft`, "back_office");
    const c = await createRet(g, [ln(g, 0, "rejected", 1)]);
    expect([a, b].map((x) => x.json.data.proNumber)).not.toContain(
      c.json.data.proNumber,
    );
  });
});

describe("caps (BR-PRT-05..07)", () => {
  test("BR-PRT-05 rejected cap counts earlier non-cancelled returns: 15 then 10 on 20 is 400", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    expect((await createRet(g, [ln(g, 0, "rejected", 15)])).status).toBe(201);
    const r = await createRet(g, [ln(g, 0, "rejected", 10)]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("PRT_CAP_EXCEEDED");
    expect(r.json.details.grnItemId).toBe(g.lineIds[0]);
    expect(r.json.details.source).toBe("rejected");
    expect(r.json.details.cap).toBe(20);
    expect(r.json.details.reserved).toBe(15);
    expect((await createRet(g, [ln(g, 0, "rejected", 5)])).status).toBe(201);
  });

  test("BR-PRT-05 a cancelled draft frees its qty", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 15)]);
    expect((await createRet(g, [ln(g, 0, "rejected", 10)])).status).toBe(400);
    expect(
      (await call("POST", `/${id}/cancel-draft`, "back_office")).status,
    ).toBe(200);
    expect((await createRet(g, [ln(g, 0, "rejected", 20)])).status).toBe(201);
  });

  test("BR-PRT-05 one return over the rejected qty is 400", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    expect((await createRet(g, [ln(g, 0, "rejected", 20.001)])).status).toBe(
      400,
    );
  });

  test("BR-PRT-06 accepted cap is accepted minus corrections: 980 - 30 = 950", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const c = await grnCall(
      "POST",
      `/${g.grnId}/lines/${g.lineIds[0]}/correction`,
      "back_office",
      { qty: 30, reason: "short weight" },
    );
    expect(c.status).toBe(201);
    const over = await createRet(g, [ln(g, 0, "accepted", 951)]);
    expect(over.status).toBe(400);
    expect(over.json.code).toBe("PRT_CAP_EXCEEDED");
    expect(over.json.details.cap).toBe(950);
    expect((await createRet(g, [ln(g, 0, "accepted", 950)])).status).toBe(201);
    expect((await createRet(g, [ln(g, 0, "accepted", 1)])).status).toBe(400);
  });

  test("BR-PRT-07 two creates of 15 at the same moment on rejected 20: one 201, one 400", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const rs = await Promise.all([
      createRet(g, [ln(g, 0, "rejected", 15)]),
      createRet(g, [ln(g, 0, "rejected", 15)]),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await returnsOfGrn(g.grnId)).length).toBe(1);
  });

  test("BR-PRT-07 the cap is checked again on every draft edit", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    await mkDraft(g, [ln(g, 0, "rejected", 15)]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    const r = await call("PATCH", "/updatereturn", "back_office", {
      id,
      lines: [ln(g, 0, "rejected", 6)],
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("PRT_CAP_EXCEEDED");
    expect((await retLines(id))[0]!.returnQty).toBe(5);
  });

  test("BR-PRT-07 editing a draft does not count its own old qty against the cap", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 20)]);
    const r = await call("PATCH", "/updatereturn", "back_office", {
      id,
      lines: [ln(g, 0, "rejected", 18)],
    });
    expect(r.status).toBe(200);
  });
});

describe("edit a draft (BR-PRT-10, 41)", () => {
  test("BR-PRT-10 draft lines, qty and reason can be edited", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    const r = await call("PATCH", "/updatereturn", "back_office", {
      id,
      reason: "new reason text",
      transporter: "Other Cargo",
      lines: [ln(g, 0, "rejected", 7), ln(g, 0, "accepted", 3)],
    });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("draft");
    const d = await details(id);
    expect(d.reason).toBe("new reason text");
    expect(d.transporter).toBe("Other Cargo");
    expect(d.lines).toHaveLength(2);
    expect(d.events.map((e: any) => e.action)).toEqual(["create", "edit"]);
  });

  test("BR-PRT-10 a draft must keep at least one line (empty lines is 400)", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    expect(
      (await call("PATCH", "/updatereturn", "back_office", { id, lines: [] }))
        .status,
    ).toBe(400);
    expect(await retLines(id)).toHaveLength(1);
  });

  test("BR-PRT-10 editing with a rate or other client-owned field is 400 (strict body)", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    expect(
      (
        await call("PATCH", "/updatereturn", "back_office", {
          id,
          ratePaise: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("PATCH", "/updatereturn", "back_office", {
          id,
          lines: [{ ...ln(g, 0, "rejected", 5), ratePaise: 1 }],
        })
      ).status,
    ).toBe(400);
  });

  test("BR-PRT-10 editing an unknown return is 404", async () => {
    expect(
      (
        await call("PATCH", "/updatereturn", "back_office", {
          id: 999999999,
          reason: "some reason",
        })
      ).status,
    ).toBe(404);
  });
});

describe("prefill, awaiting, list, details (BR-PRT-36, 39, 40, 41)", () => {
  test("BR-PRT-36 prefill suggests the returnable rejected qty and writes nothing", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const r = await call("GET", `/prefill/${g.grnId}`, "floor_supervisor");
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d.grnId).toBe(g.grnId);
    expect(d.poId).toBe(g.poId);
    expect(d.mainAction).toBe("prefilled");
    expect(d.replacementExpected).toBe(false);
    const l = d.lines.find((x: any) => x.grnItemId === g.lineIds[0]);
    expect(l.rejectedQty).toBe(20);
    expect(l.rejectedReturnable).toBe(20);
    expect(l.acceptedNet).toBe(980);
    expect(l.acceptedReturnable).toBe(980);
    expect(l.ratePaise).toBe(21000);
    expect(l.gstPercent).toBe(18);
    expect(l.suggested).toEqual([{ source: "rejected", qty: 20 }]);
    expect((await returnsOfGrn(g.grnId)).length).toBe(0);
  });

  test("BR-PRT-36 when all rejected qty is on returns only the secondary action stays", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    await mkDraft(g, [ln(g, 0, "rejected", 20)]);
    const d = (await call("GET", `/prefill/${g.grnId}`, "back_office")).json
      .data;
    expect(d.mainAction).toBe("secondary");
    const l = d.lines.find((x: any) => x.grnItemId === g.lineIds[0]);
    expect(l.rejectedReserved).toBe(20);
    expect(l.rejectedReturnable).toBe(0);
    expect(l.suggested).toEqual([]);
  });

  test("BR-PRT-36 only QA-decided lines are prefilled", async () => {
    const g = await mkGrn([
      { qty: 100, accepted: 90, rejected: 10 },
      { qty: 100, pending: true },
    ]);
    const d = (await call("GET", `/prefill/${g.grnId}`, "back_office")).json
      .data;
    expect(d.lines.map((x: any) => x.grnItemId)).toEqual([g.lineIds[0]]);
  });

  test("BR-PRT-39 awaiting shows rejected qty not on a non-cancelled return", async () => {
    const sup = await newSupplier();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }], {
      supplier: sup,
    });
    const find = async () =>
      (
        await call("GET", `/awaiting?supplierId=${sup}`, "back_office")
      ).json.data.find((x: any) => x.grnItemId === g.lineIds[0]);
    expect((await find()).awaitingQty).toBe(20);
    expect((await find()).grnNumber).toBe(g.grnNumber);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 15)]);
    const row = await find();
    expect(row.awaitingQty).toBe(5);
    expect(row.rejectedQty).toBe(20);
    expect(row.rejectedReserved).toBe(15);
    await call("POST", `/${id}/cancel-draft`, "back_office");
    expect((await find()).awaitingQty).toBe(20);
  });

  test("BR-PRT-39 a line with all rejected qty on returns drops out of awaiting", async () => {
    const sup = await newSupplier();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }], {
      supplier: sup,
    });
    await mkDraft(g, [ln(g, 0, "rejected", 20)]);
    const rows = (
      await call("GET", `/awaiting?supplierId=${sup}`, "back_office")
    ).json.data;
    expect(rows.find((x: any) => x.grnItemId === g.lineIds[0])).toBeUndefined();
  });

  test("BR-PRT-39 list filters by status, supplier and GRN; meta carries status counts and awaiting count", async () => {
    const sup = await newSupplier();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }], {
      supplier: sup,
    });
    const a = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    const b = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    await call("POST", `/${b}/cancel-draft`, "back_office");
    const all = await call(
      "GET",
      `/getreturns?supplierId=${sup}&pageSize=100`,
      "back_office",
    );
    expect(all.status).toBe(200);
    expect(all.json.data.map((x: any) => x.id).sort()).toEqual([a, b].sort());
    expect(all.json.meta.page).toBe(1);
    expect(all.json.meta.total).toBe(2);
    expect(all.json.meta.statusCounts).toEqual(
      expect.objectContaining({
        draft: expect.any(Number),
        posted: expect.any(Number),
        cancelled: expect.any(Number),
      }),
    );
    expect(typeof all.json.meta.awaitingCount).toBe("number");
    const drafts = await call(
      "GET",
      `/getreturns?supplierId=${sup}&status=draft`,
      "back_office",
    );
    expect(drafts.json.data.map((x: any) => x.id)).toEqual([a]);
    const row = drafts.json.data[0];
    expect(row.grnNumber).toBe(g.grnNumber);
    expect(row.linesCount).toBe(1);
    expect(row.totalPaise).toBeNull();
    const byGrn = await call(
      "GET",
      `/getreturns?grnId=${g.grnId}`,
      "back_office",
    );
    expect(byGrn.json.meta.total).toBe(2);
  });

  test("BR-PRT-39 list date filter: dateFrom after dateTo is 400; today's IST day finds the return", async () => {
    const sup = await newSupplier();
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }], {
      supplier: sup,
    });
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    expect(
      (
        await call(
          "GET",
          "/getreturns?dateFrom=2026-12-31&dateTo=2026-01-01",
          "back_office",
        )
      ).status,
    ).toBe(400);
    const today = ISTNOW().toISOString().slice(0, 10);
    const r = await call(
      "GET",
      `/getreturns?supplierId=${sup}&dateFrom=${today}&dateTo=${today}`,
      "back_office",
    );
    expect(r.json.data.map((x: any) => x.id)).toEqual([id]);
    const old = await call(
      "GET",
      `/getreturns?supplierId=${sup}&dateTo=2000-01-01`,
      "back_office",
    );
    expect(old.json.data).toEqual([]);
  });

  test("BR-PRT-39 list rejects an unknown query key or page size above 100 with 400", async () => {
    expect(
      (await call("GET", "/getreturns?bogus=1", "back_office")).status,
    ).toBe(400);
    expect(
      (await call("GET", "/getreturns?pageSize=101", "back_office")).status,
    ).toBe(400);
  });

  test("BR-PRT-41 draft details: who created it, the create event, no debit note", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 5)]);
    const d = await details(id);
    expect(d.createdBy).toBe(await userFor("back_office"));
    expect(d.createdAt).toBeTruthy();
    expect(d.debitNote).toBeNull();
    expect(d.challanNumber).toBeNull();
    expect(d.events).toHaveLength(1);
    expect(d.events[0].action).toBe("create");
    expect(d.events[0].toStatus).toBe("draft");
    expect(d.events[0].actorId).toBe(await userFor("back_office"));
    expect(d.documentFlow.map((s: any) => s.step)).toEqual(
      expect.arrayContaining(["po", "grn", "return"]),
    );
  });

  test("BR-PRT-40 draft preview: stock out per accepted line, debit note total, PO effect", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "accepted", 30)]);
    const p = (await details(id)).preview;
    expect(p.stockOut).toEqual([{ itemId: g.itemIds[0], qty: 30, uom: "kg" }]);
    // 30 kg x 21,000 = 630,000 + 18% GST 113,400
    expect(p.debitNoteTotalPaise).toBe(743400);
    expect(p.poEffect).toBe("credit_only");
  });

  test("BR-PRT-40 a rejected line is not in stock out; PO effect stays credit_only even with replacementExpected", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "rejected", 20)], {
      replacementExpected: true,
    });
    const p = (await details(id)).preview;
    expect(p.stockOut).toEqual([]);
    expect(p.debitNoteTotalPaise).toBe(495600);
    expect(p.poEffect).toBe("credit_only");
  });

  test("BR-PRT-40 an accepted line with replacementExpected shows replacement as PO effect", async () => {
    const g = await mkGrn([{ qty: 1000, accepted: 980, rejected: 20 }]);
    const id = await mkDraft(g, [ln(g, 0, "accepted", 30)], {
      replacementExpected: true,
    });
    const p = (await details(id)).preview;
    expect(p.poEffect).toBe("replacement");
  });

  test("BR-PRT-40 details of an unknown return is 404", async () => {
    expect(
      (await call("GET", "/getreturndetails/999999999", "owner")).status,
    ).toBe(404);
  });
});
