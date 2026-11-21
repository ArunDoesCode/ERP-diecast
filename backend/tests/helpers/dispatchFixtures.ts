/**
 * Shared fixtures for the dispatch (delivery note) HTTP tests.
 * Spec: docs/specs/dispatch/spec.md v1. Real DB, full app via createApp().
 * One `makeDispatchFx("<tag>")` per test file: its own TEST_<tag>_ prefix,
 * its own rows, its own cleanup(). Files never share data.
 * The company_settings row is saved on first setupCompany() and restored in cleanup().
 */
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  authAuditLog,
  documentNumberCounters,
  roles,
} from "../../src/db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../../src/db/schemas/02_procurement-catalog";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import {
  companySettings,
  companySettingsHistory,
} from "../../src/db/schemas/04_company";
import {
  customers,
  saleExplosionRows,
  saleExplosionSources,
  saleExplosions,
  saleOrderLines,
  saleOrders,
  saleReservations,
  salesAuditLog,
} from "../../src/db/schemas/05_sales";
import {
  deliveryNoteLines,
  deliveryNotePackages,
  deliveryNotes,
  deliveryNoteTransportHistory,
} from "../../src/db/schemas/06_dispatch";
import { signAccessToken } from "../../src/lib/token";

export type Role =
  | "owner"
  | "back_office"
  | "floor_supervisor"
  | "qa_inspector"
  | "operator"
  | "super-admin";

// biome-ignore lint/suspicious/noExplicitAny: tests read arbitrary JSON
export type Json = any;

export const PLANT = {
  name: "Plant Works",
  address: "1 Plant Road, Pune",
  gstin: "27AAACD1234E1Z5",
  stateCode: "27",
};

export function istDay(offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

/** Financial year label of an IST day, e.g. 2026-11-21 -> "26-27". */
export function fyOf(day: string): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(start)}-${two(start + 1)}`;
}

export type SoLineSpec = {
  qty: number;
  price?: number | undefined;
  gst?: number | undefined;
  itemId?: number | undefined;
  uom?: string | undefined;
  deliveryDate?: string | undefined;
};

export function makeDispatchFx(tag: string) {
  const app = createApp();
  const RUN = `TEST_${tag}_${Date.now()}`;
  const EMAIL_PREFIX = `test_${tag.toLowerCase()}_`;
  let seq = 0;
  let ewaySeq = 0;
  const uid = () => `${RUN}_${++seq}`;
  /** Unique 12-digit e-way bill number. */
  const ewayNo = () =>
    `${String(Date.now()).slice(-9)}${String(++ewaySeq).padStart(3, "0")}`;

  const itemIds: number[] = [];
  const locIds: number[] = [];
  const supplierIds: number[] = [];
  const customerIds: number[] = [];
  const soIds: number[] = [];
  const empIds = new Map<string, number>();
  const tokens = new Map<string, string>();
  let saved: typeof companySettings.$inferSelect | undefined;
  let savedTaken = false;

  async function userFor(role: Role): Promise<number> {
    let id = empIds.get(role);
    if (!id) {
      const [r] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, role))
        .limit(1);
      if (!r) throw new Error(`seed role ${role} missing`);
      const [e] = await db
        .insert(employees)
        .values({
          name: `${RUN}_${role}`,
          email: `${EMAIL_PREFIX}${role.replace(/[^a-z]/g, "")}_${Date.now()}@diecast.test`,
          roleId: r.id,
          isActive: true,
        })
        .returning({ id: employees.id });
      id = e?.id as number;
      empIds.set(role, id);
    }
    return id;
  }
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

  async function call(
    role: Role | null,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: Json }> {
    const headers: Record<string, string> = {};
    if (role) headers.Authorization = `Bearer ${await tokenFor(role)}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const dsp = (
    role: Role | null,
    method: string,
    path: string,
    body?: unknown,
  ) => call(role, method, `/api/dispatch${path}`, body);

  /** Save the real company row once, then set the plant (state 27, limit Rs 50,000). */
  async function setupCompany(over: Partial<typeof PLANT> = {}) {
    if (!savedTaken) {
      saved = (await db.select().from(companySettings).limit(1))[0];
      savedTaken = true;
    }
    const row = {
      id: 1,
      ...PLANT,
      ...over,
      ewayIntraLimitPaise: 5_000_000,
    };
    await db
      .insert(companySettings)
      .values(row)
      .onConflictDoUpdate({ target: companySettings.id, set: row });
  }
  const setLimit = (paise: number) =>
    db
      .update(companySettings)
      .set({ ewayIntraLimitPaise: paise })
      .where(eq(companySettings.id, 1));
  const setCompany = (over: Partial<typeof PLANT>) =>
    db.update(companySettings).set(over).where(eq(companySettings.id, 1));

  async function mkItem(over: Partial<typeof itemMaster.$inferInsert> = {}) {
    const sku = uid();
    const [row] = await db
      .insert(itemMaster)
      .values({
        sku,
        name: sku,
        category: "Finished Good",
        uom: "pcs",
        hsnCode: "8708",
        isActive: true,
        ...over,
      })
      .returning({ id: itemMaster.id });
    const id = row?.id as number;
    itemIds.push(id);
    return id;
  }
  async function mkLoc(
    type: "store" | "finished_goods" | "scrap_yard" = "store",
    over: Record<string, unknown> = {},
  ) {
    const r = await call("back_office", "POST", "/api/asset/locations", {
      name: uid(),
      type,
      ...over,
    });
    if (r.status !== 201)
      throw new Error(`fixture location failed: ${JSON.stringify(r.json)}`);
    locIds.push(r.json.data.id);
    return r.json.data.id as number;
  }
  async function mkVendorLoc() {
    const [s] = await db
      .insert(supplierMaster)
      .values({ name: uid(), gstNumber: `27${uid().slice(-12)}` })
      .returning({ id: supplierMaster.id });
    supplierIds.push(s?.id as number);
    const r = await call("back_office", "POST", "/api/asset/locations", {
      name: uid(),
      type: "vendor_premise",
      linkedVendorId: s?.id,
    });
    if (r.status !== 201)
      throw new Error(`fixture vendor loc failed: ${JSON.stringify(r.json)}`);
    locIds.push(r.json.data.id);
    return r.json.data.id as number;
  }
  /** A store location flagged virtual directly in the DB (the route derives it from type). */
  async function mkVirtualLoc() {
    const id = await mkLoc("store");
    await db
      .update(locations)
      .set({ isVirtual: true })
      .where(eq(locations.id, id));
    return id;
  }
  const setLocActive = (id: number, isActive: boolean) =>
    db.update(locations).set({ isActive }).where(eq(locations.id, id));

  async function mkCustomer(
    over: { stateCode?: string; gstin?: string; address?: string } = {},
  ) {
    const r = await call("back_office", "POST", "/api/customers", {
      name: uid(),
      stateCode: "27",
      address: "Plot 4, Rane Nagar",
      ...over,
    });
    if (r.status !== 201)
      throw new Error(`fixture customer failed: ${JSON.stringify(r.json)}`);
    customerIds.push(r.json.data.id);
    return r.json.data.id as number;
  }

  /** Opening stock through the real movement route. */
  async function stock(
    itemId: number,
    locationId: number,
    qty: number,
    cost = 9800,
  ) {
    const r = await call("owner", "POST", "/api/asset/inventory/movements", {
      itemId,
      locationId,
      referenceType: "opening_stock",
      qty,
      unitCostPaise: cost,
      reason: "test opening",
    });
    if (r.status !== 201)
      throw new Error(`fixture stock failed: ${JSON.stringify(r.json)}`);
  }

  /** Confirmed SO (by back_office). One item per line unless itemId is given. */
  async function mkSo(o: {
    customerId: number;
    lines: SoLineSpec[];
    orderDate?: string;
    shipTo?: { address: string; stateCode: string } | undefined;
    confirm?: boolean;
  }) {
    const itemsOf: number[] = [];
    for (const l of o.lines)
      itemsOf.push(l.itemId ?? (await mkItem({ uom: l.uom ?? "pcs" })));
    const created = await call("back_office", "POST", "/api/sale-orders", {
      customerId: o.customerId,
      orderDate: o.orderDate ?? istDay(-1),
      customerPoNumber: uid().slice(-40),
      ...(o.shipTo
        ? {
            shipToAddress: o.shipTo.address,
            shipToStateCode: o.shipTo.stateCode,
          }
        : {}),
      lines: o.lines.map((l, i) => ({
        itemId: itemsOf[i],
        qty: l.qty,
        unitPricePaise: l.price ?? 18500,
        gstPercent: l.gst ?? 18,
        deliveryDate: l.deliveryDate ?? istDay(30 + i),
      })),
    });
    if (created.status !== 201)
      throw new Error(`fixture SO failed: ${JSON.stringify(created.json)}`);
    const soId = created.json.data.id as number;
    soIds.push(soId);
    if (o.confirm !== false) {
      const c = await call(
        "back_office",
        "POST",
        `/api/sale-orders/${soId}/confirm`,
        {
          editVersion: created.json.data.editVersion,
        },
      );
      if (c.status !== 200)
        throw new Error(`fixture SO confirm failed: ${JSON.stringify(c.json)}`);
    }
    const d = await soDetail(soId);
    return {
      soId,
      soNumber: d.soNumber as string,
      lineIds: d.lines.map((l: Json) => l.id as number) as number[],
      items: itemsOf,
    };
  }
  async function soDetail(soId: number): Promise<Json> {
    const r = await call("back_office", "GET", `/api/sale-orders/${soId}`);
    return r.json.data;
  }
  /** hold | resume | close | cancel with a reason (editVersion read fresh). */
  async function soOp(
    soId: number,
    op: "hold" | "resume" | "close" | "cancel",
  ) {
    const d = await soDetail(soId);
    const r = await call(
      "back_office",
      "POST",
      `/api/sale-orders/${soId}/${op}`,
      {
        editVersion: d.editVersion,
        reason: "test reason",
      },
    );
    if (r.status !== 200)
      throw new Error(`SO ${op} failed: ${JSON.stringify(r.json)}`);
    return soDetail(soId);
  }
  /** Soft-remove SO lines / change a line's price on a confirmed SO. */
  async function soEdit(soId: number, body: Record<string, unknown>) {
    const d = await soDetail(soId);
    const r = await call("back_office", "PATCH", `/api/sale-orders/${soId}`, {
      editVersion: d.editVersion,
      ...body,
    });
    if (r.status !== 200)
      throw new Error(`SO edit failed: ${JSON.stringify(r.json)}`);
    return soDetail(soId);
  }
  async function soPrice(soId: number, lineId: number, price: number) {
    const d = await soDetail(soId);
    const l = d.lines.find((x: Json) => x.id === lineId);
    return soEdit(soId, {
      lines: [
        {
          id: lineId,
          qty: l.qty,
          unitPricePaise: price,
          gstPercent: l.gstPercent,
          deliveryDate: l.deliveryDate,
        },
      ],
    });
  }

  const noteIds: number[] = [];
  /** Create a draft note, raw response. Default role floor_supervisor (manage, no so.view). */
  async function draft(
    body: Record<string, unknown>,
    role: Role = "floor_supervisor",
  ) {
    const r = await dsp(role, "POST", "/notes", body);
    if (r.status === 201) noteIds.push(r.json.data.id);
    return r;
  }
  async function mustDraft(
    body: Record<string, unknown>,
    role: Role = "floor_supervisor",
  ) {
    const r = await draft(body, role);
    if (r.status !== 201)
      throw new Error(`fixture draft failed: ${JSON.stringify(r.json)}`);
    return r.json.data as Json;
  }
  const post = (id: number, role: Role = "floor_supervisor") =>
    dsp(role, "POST", `/notes/${id}/post`, {});
  async function mustPost(id: number) {
    const r = await post(id);
    if (r.status !== 200)
      throw new Error(`fixture post failed: ${JSON.stringify(r.json)}`);
    return r.json.data as Json;
  }
  const cancelPosted = (
    id: number,
    reason = "wrong part loaded",
    role: Role = "owner",
  ) => dsp(role, "POST", `/notes/${id}/cancel`, { reason });
  const cancelDraft = (
    id: number,
    reason = "truck did not come",
    role: Role = "floor_supervisor",
  ) => dsp(role, "POST", `/notes/${id}/cancel-draft`, { reason });
  const noteDetail = async (id: number, role: Role = "owner") => {
    const r = await dsp(role, "GET", `/notes/${id}`);
    return r.json.data as Json;
  };
  /** Transport body that satisfies BR-DSP-24 for a road note. */
  const roadTransport = (over: Record<string, unknown> = {}) => ({
    mode: "road",
    vehicleNo: "MH12AB1234",
    distanceKm: 350,
    ewayBillNo: ewayNo(),
    ewayBillDate: istDay(0),
    ...over,
  });

  /** Ready-to-post scenario: customer, location with stock, SO, draft. */
  async function scenario(
    o: {
      qty?: number; // note qty
      soQty?: number;
      price?: number;
      gst?: number;
      stockQty?: number;
      cost?: number;
      customerOver?: { stateCode?: string; gstin?: string; address?: string };
      transport?: Record<string, unknown> | undefined;
      lotNo?: string;
      uom?: string;
    } = {},
  ) {
    const customerId = await mkCustomer(o.customerOver);
    const loc = await mkLoc();
    const so = await mkSo({
      customerId,
      lines: [{ qty: o.soQty ?? 1000, price: o.price, gst: o.gst, uom: o.uom }],
    });
    const item = so.items[0] as number;
    await stock(item, loc, o.stockQty ?? 700, o.cost ?? 9800);
    const note = await mustDraft({
      soId: so.soId,
      sourceLocationId: loc,
      lines: [
        {
          soLineId: so.lineIds[0],
          qty: o.qty ?? 600,
          ...(o.lotNo ? { lotNo: o.lotNo } : {}),
        },
      ],
      ...(o.transport ? { transport: o.transport } : {}),
    });
    return { customerId, loc, so, item, note, lineId: so.lineIds[0] as number };
  }

  const ledgerOfNote = async (id: number) =>
    (
      await db
        .select()
        .from(inventoryLedger)
        .where(eq(inventoryLedger.referenceId, id))
    ).filter(
      (r) =>
        r.referenceType === "delivery_note" ||
        r.referenceType === "delivery_note_cancel",
    );
  const ledgerOfItem = (itemId: number) =>
    db.select().from(inventoryLedger).where(eq(inventoryLedger.itemId, itemId));
  async function balance(itemId: number, locationId: number) {
    return (await ledgerOfItem(itemId))
      .filter((r) => r.locationId === locationId)
      .reduce((n, r) => n + r.quantityChange, 0);
  }
  const itemRow = async (id: number) =>
    (await db.select().from(itemMaster).where(eq(itemMaster.id, id)))[0];

  async function cleanup() {
    const myEmps = [...empIds.values()];
    const sos = soIds.length
      ? (
          await db
            .select({ id: deliveryNotes.id })
            .from(deliveryNotes)
            .where(inArray(deliveryNotes.soId, soIds))
        ).map((n) => n.id)
      : [];
    const notes = [...new Set([...noteIds, ...sos])];
    if (notes.length) {
      await db
        .delete(deliveryNoteTransportHistory)
        .where(inArray(deliveryNoteTransportHistory.noteId, notes));
      await db
        .delete(deliveryNotePackages)
        .where(inArray(deliveryNotePackages.noteId, notes));
      await db
        .delete(deliveryNoteLines)
        .where(inArray(deliveryNoteLines.noteId, notes));
      await db.delete(deliveryNotes).where(inArray(deliveryNotes.id, notes));
    }
    if (itemIds.length)
      await db
        .delete(inventoryLedger)
        .where(inArray(inventoryLedger.itemId, itemIds));
    if (soIds.length) {
      const exps = await db
        .select({ id: saleExplosions.id })
        .from(saleExplosions)
        .where(inArray(saleExplosions.soId, soIds));
      const expIds = exps.map((e) => e.id);
      await db
        .delete(saleReservations)
        .where(inArray(saleReservations.soId, soIds));
      if (expIds.length) {
        const rows = await db
          .select({ id: saleExplosionRows.id })
          .from(saleExplosionRows)
          .where(inArray(saleExplosionRows.explosionId, expIds));
        const rowIds = rows.map((r) => r.id);
        if (rowIds.length)
          await db
            .delete(saleExplosionSources)
            .where(inArray(saleExplosionSources.rowId, rowIds));
        await db
          .delete(saleExplosionRows)
          .where(inArray(saleExplosionRows.explosionId, expIds));
        await db
          .delete(saleExplosions)
          .where(inArray(saleExplosions.id, expIds));
      }
      await db.delete(salesAuditLog).where(inArray(salesAuditLog.soId, soIds));
      await db
        .delete(saleOrderLines)
        .where(inArray(saleOrderLines.soId, soIds));
      await db.delete(saleOrders).where(inArray(saleOrders.id, soIds));
    }
    if (customerIds.length) {
      await db
        .delete(salesAuditLog)
        .where(inArray(salesAuditLog.targetId, customerIds));
      await db.delete(customers).where(inArray(customers.id, customerIds));
    }
    if (itemIds.length)
      await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
    if (locIds.length)
      await db.delete(locations).where(inArray(locations.id, locIds));
    if (supplierIds.length)
      await db
        .delete(supplierMaster)
        .where(inArray(supplierMaster.id, supplierIds));
    if (savedTaken) {
      if (saved) {
        await db
          .update(companySettings)
          .set(saved)
          .where(eq(companySettings.id, 1));
      } else {
        await db.delete(companySettings).where(eq(companySettings.id, 1));
      }
    }
    if (myEmps.length) {
      await db
        .delete(companySettingsHistory)
        .where(inArray(companySettingsHistory.createdBy, myEmps));
      await db
        .delete(authAuditLog)
        .where(inArray(authAuditLog.actorId, myEmps));
      await db
        .update(documentNumberCounters)
        .set({ createdBy: null })
        .where(inArray(documentNumberCounters.createdBy, myEmps));
      await db
        .update(documentNumberCounters)
        .set({ lastUpdatedBy: null })
        .where(inArray(documentNumberCounters.lastUpdatedBy, myEmps));
      await db.delete(employees).where(inArray(employees.id, myEmps));
    }
    await db.delete(employees).where(like(employees.email, `${EMAIL_PREFIX}%`));
  }

  return {
    RUN,
    uid,
    ewayNo,
    call,
    dsp,
    userFor,
    setupCompany,
    setLimit,
    setCompany,
    mkItem,
    mkLoc,
    mkVirtualLoc,
    mkVendorLoc,
    setLocActive,
    mkCustomer,
    stock,
    mkSo,
    soDetail,
    soOp,
    soEdit,
    soPrice,
    draft,
    mustDraft,
    post,
    mustPost,
    cancelPosted,
    cancelDraft,
    noteDetail,
    roadTransport,
    scenario,
    ledgerOfNote,
    ledgerOfItem,
    balance,
    itemRow,
    cleanup,
  };
}
