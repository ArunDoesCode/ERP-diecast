/**
 * Shared fixtures for the supplier-rating HTTP tests (docs/specs/supplier-rating/spec.md).
 * Test code only. Each file calls makeRatingFx("<tag>") and gets its own TEST_<tag>_ prefix, rows and cleanup().
 * Fixture shortcut (not a production path): suppliers, items, POs, GRNs and their lines are inserted straight
 * into the tables so every date and quantity is exact. All dates are IST calendar days as "YYYY-MM-DD".
 */
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { rolePermissions, roles } from "../../src/db/schemas/01_auth";
import { itemMaster } from "../../src/db/schemas/02_procurement-catalog";
import {
  grnCorrections,
  grnItems,
  grns,
  poCommunications,
  purchaseOrderItems,
  purchaseOrders,
} from "../../src/db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

// biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
export type Json = any;
export type Actor = {
  id: number;
  userName: string;
  role: string;
};
export type Res = { status: number; json: Json };

const IST_MS = 5.5 * 3600 * 1000;
/** IST calendar day, `offsetDays` from now. */
export const istDay = (offsetDays = 0) =>
  new Date(Date.now() + IST_MS + offsetDays * 86400000)
    .toISOString()
    .slice(0, 10);

/** `YYYY-MM-DD` of `dd` in the IST month that is `monthsAgo` months before the current IST month. */
export function monthDay(monthsAgo: number, dd = 15): string {
  const [y, m] = istDay(0).split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) - monthsAgo;
  const yy = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
export const monthKey = (monthsAgo: number) => monthDay(monthsAgo).slice(0, 7);

/** A midday-IST timestamp (06:30 UTC) on IST day `day`. */
export const noonIst = (day: string) => new Date(`${day}T06:30:00.000Z`);
/** A bare date, stored the way the app stores expected delivery dates (midnight UTC). */
const bare = (day: string) => new Date(`${day}T00:00:00.000Z`);

export type QaStatus = "pending" | "passed" | "failed" | "waived";
export type LineSpec = {
  item?: number;
  qty?: number;
  rate?: number;
  uom?: string;
};
export type GrnLineSpec = {
  /** index into PoSpec.lines; omit with noPo */
  line?: number;
  recv: number;
  rej?: number;
  qa?: QaStatus;
  bypass?: boolean;
};
export type GrnSpec = {
  /** IST day received; ignored when `at` is given */
  day?: string;
  at?: Date;
  /** store received_date as NULL (arrival then comes from the GRN line created_at) */
  noReceivedDate?: boolean;
  /** created_at of this GRN's lines (default now) */
  lineCreatedAt?: Date;
  status?:
    | "draft"
    | "pending_qa"
    | "accepted"
    | "rejected"
    | "partial_accepted";
  noPo?: boolean;
  lines: GrnLineSpec[];
};
export type PoSpec = {
  status?:
    | "draft"
    | "pending_approval"
    | "approved"
    | "dispatched"
    | "partial_received"
    | "fully_received"
    | "invoiced"
    | "closed"
    | "cancelled";
  /** original expected delivery IST day; null = none; undefined = 30 days ago */
  due?: string | null;
  revised?: string;
  /** IST day the PO was created (the "PO date") */
  created?: string;
  shortClosed?: boolean;
  closedDay?: string;
  cancelledDay?: string;
  /** write a po_sent communication row (default true) */
  sentRecord?: boolean;
  /** status of the po_sent communication row (default "logged") */
  sentStatus?: "logged" | "success" | "failed";
  lines?: LineSpec[];
  grns?: GrnSpec[];
};

export function makeRatingFx(tag: string) {
  const RUN = `TEST_${tag}_${Date.now()}`;
  const app = createApp();
  let seq = 0;
  const uid = () => `${RUN}_${++seq}`;
  const created = {
    employees: [] as number[],
    roles: [] as number[],
    suppliers: [] as number[],
    items: [] as number[],
    pos: [] as number[],
    grns: [] as number[],
  };

  // ---- actors: real employees; seed role name, or a custom role holding exactly `keys` ----
  const actorCache = new Map<string, Actor>();
  async function actor(key: string, spec: string | string[]): Promise<Actor> {
    const hit = actorCache.get(key);
    if (hit) return hit;
    let roleId: number;
    let roleName: string;
    if (typeof spec === "string") {
      const [r] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, spec))
        .limit(1);
      if (!r) throw new Error(`seed role ${spec} missing`);
      roleId = r.id;
      roleName = spec;
    } else {
      roleName = `${RUN}_role_${key}`;
      const [r] = await db
        .insert(roles)
        .values({ name: roleName, isSystem: false })
        .returning({ id: roles.id });
      roleId = r!.id;
      created.roles.push(roleId);
      if (spec.length)
        await db
          .insert(rolePermissions)
          .values(spec.map((permissionKey) => ({ roleId, permissionKey })));
    }
    const [e] = await db
      .insert(employees)
      .values({ name: `${RUN}_${key}`, roleId, isActive: true })
      .returning({ id: employees.id });
    created.employees.push(e!.id);
    const a = { id: e!.id, userName: `${RUN}_${key}`, role: roleName };
    actorCache.set(key, a);
    return a;
  }
  const owner = () => actor("owner", "owner");
  const bo = () => actor("bo", "back_office");
  const floor = () => actor("floor", "floor_supervisor");
  const qa = () => actor("qa", "qa_inspector");
  const superAdmin = () => actor("sa", "super-admin");

  async function get(path: string, who: Actor | null): Promise<Res> {
    const headers: Record<string, string> = {};
    if (who) {
      headers.Authorization = `Bearer ${await signAccessToken({
        userId: who.id,
        userName: who.userName,
        role: who.role,
        allowedPages: [],
      })}`;
    }
    const res = await app.request(path, { method: "GET", headers });
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const rating = async (path: string, who?: Actor | null) =>
    get(`/api/supplier-rating${path}`, who === undefined ? await bo() : who);
  /** GET card `data` (throws unless 200). */
  async function card(supplierId: number): Promise<Json> {
    const r = await rating(`/${supplierId}/card`);
    if (r.status !== 200)
      throw new Error(`card ${r.status} ${JSON.stringify(r.json)}`);
    return r.json.data;
  }
  async function lines(
    supplierId: number,
    query: string,
    who?: Actor | null,
  ): Promise<Res> {
    return rating(`/${supplierId}/lines?${query}`, who);
  }
  async function trend(supplierId: number): Promise<Json[]> {
    const r = await rating(`/${supplierId}/trend`);
    if (r.status !== 200)
      throw new Error(`trend ${r.status} ${JSON.stringify(r.json)}`);
    return r.json.data.months;
  }

  // ---- masters ----
  async function newSupplier(
    o: { active?: boolean; name?: string } = {},
  ): Promise<number> {
    const [s] = await db
      .insert(supplierMaster)
      .values({
        name: o.name ?? uid(),
        isActive: o.active ?? true,
        defaultPaymentTermsDays: 0,
        address: "Supplier Road, Mysuru",
      })
      .returning({ id: supplierMaster.id });
    created.suppliers.push(s!.id);
    return s!.id;
  }
  /** `standard` = item standard rate in paise (0 = none). */
  async function newItem(
    o: { uom?: string; standard?: number } = {},
  ): Promise<{ id: number; sku: string }> {
    const sku = uid();
    const [it] = await db
      .insert(itemMaster)
      .values({
        sku,
        name: `${RUN} item`,
        category: "Raw Material",
        uom: o.uom ?? "kg",
        isActive: true,
        hsnCode: "7601",
        standardRatePaise: o.standard ?? 0,
      })
      .returning({ id: itemMaster.id });
    created.items.push(it!.id);
    return { id: it!.id, sku };
  }

  // ---- documents ----
  async function mkPo(supplierId: number, spec: PoSpec = {}) {
    const createdBy = (await owner()).id;
    const status = spec.status ?? "fully_received";
    const due = spec.due === undefined ? istDay(-30) : spec.due;
    const createdDay = spec.created ?? istDay(-60);
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        poNumber: uid(),
        supplierId,
        status,
        expectedDeliveryDate: due === null ? null : bare(due),
        revisedDeliveryDate: spec.revised ? bare(spec.revised) : null,
        createdAt: noonIst(createdDay),
        createdBy,
        shortClosed: spec.shortClosed ?? false,
        closedAt: spec.closedDay ? noonIst(spec.closedDay) : null,
        cancelledAt: spec.cancelledDay ? noonIst(spec.cancelledDay) : null,
        cancelledBy: spec.cancelledDay ? createdBy : null,
        cancelReason: spec.cancelledDay ? `${RUN} cancel` : null,
      })
      .returning({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber });
    created.pos.push(po!.id);
    if (spec.sentRecord ?? true) {
      await db.insert(poCommunications).values({
        poId: po!.id,
        type: "po_sent",
        channel: "email",
        status: spec.sentStatus ?? "logged",
        sentBy: createdBy,
        sentAt: noonIst(createdDay),
      });
    }
    const poItemIds: number[] = [];
    const itemIds: number[] = [];
    const skus: string[] = [];
    for (const l of spec.lines ?? [{}]) {
      let itemId = l.item;
      let sku = "";
      if (itemId === undefined) {
        const it = await newItem(l.uom ? { uom: l.uom } : {});
        itemId = it.id;
        sku = it.sku;
      } else {
        const [r] = await db
          .select({ sku: itemMaster.sku })
          .from(itemMaster)
          .where(eq(itemMaster.id, itemId));
        sku = r!.sku;
      }
      const [pi] = await db
        .insert(purchaseOrderItems)
        .values({
          poId: po!.id,
          itemId,
          qty: l.qty ?? 1000,
          unitPricePaise: l.rate ?? 21000,
          uom: l.uom ?? "kg",
        })
        .returning({ id: purchaseOrderItems.id });
      poItemIds.push(pi!.id);
      itemIds.push(itemId);
      skus.push(sku);
    }
    const grnIds: number[] = [];
    const grnNumbers: string[] = [];
    const grnItemIds: number[][] = [];
    for (const g of spec.grns ?? []) {
      const [gr] = await db
        .insert(grns)
        .values({
          grnNumber: uid(),
          poId: g.noPo ? null : po!.id,
          supplierId,
          status: g.status ?? "accepted",
          receivedDate: g.noReceivedDate
            ? null
            : (g.at ?? noonIst(g.day ?? istDay(-35))),
        })
        .returning({ id: grns.id, grnNumber: grns.grnNumber });
      created.grns.push(gr!.id);
      grnIds.push(gr!.id);
      grnNumbers.push(gr!.grnNumber);
      const ids: number[] = [];
      for (const gl of g.lines) {
        const [gi] = await db
          .insert(grnItems)
          .values({
            grnId: gr!.id,
            poItemId:
              g.noPo || gl.line === undefined ? null : poItemIds[gl.line],
            receivedQty: gl.recv,
            acceptedQty: gl.recv - (gl.rej ?? 0),
            rejectedQty: gl.rej ?? 0,
            qaStatus: gl.qa ?? ((gl.rej ?? 0) > 0 ? "failed" : "passed"),
            isQaBypassed: gl.bypass ?? false,
            ...(g.lineCreatedAt ? { createdAt: g.lineCreatedAt } : {}),
          })
          .returning({ id: grnItems.id });
        ids.push(gi!.id);
      }
      grnItemIds.push(ids);
    }
    return {
      poId: po!.id,
      poNumber: po!.poNumber,
      poItemIds,
      itemIds,
      skus,
      grnIds,
      grnNumbers,
      grnItemIds,
    };
  }

  /**
   * A PO of `n` lines (1000 kg at 21000 paise each), due `dueDay`, each fully received on `recvDay` in one
   * accepted GRN, `rej` kg rejected on every line (qa passed/failed accordingly).
   */
  function delivered(
    supplierId: number,
    n: number,
    o: { due?: string; recv?: string; rej?: number; qty?: number } = {},
  ) {
    const qty = o.qty ?? 1000;
    return mkPo(supplierId, {
      due: o.due ?? istDay(-30),
      lines: Array.from({ length: n }, () => ({ qty })),
      grns: [
        {
          day: o.recv ?? istDay(-35),
          lines: Array.from({ length: n }, (_, i) => ({
            line: i,
            recv: qty,
            rej: o.rej ?? 0,
          })),
        },
      ],
    });
  }

  async function addCorrection(grnItemId: number, qty: number) {
    await db.insert(grnCorrections).values({
      grnItemId,
      qty,
      reason: `${RUN} correction`,
      createdBy: (await owner()).id,
    });
  }

  async function cleanup() {
    const poIds = created.pos;
    const grnRows = poIds.length
      ? await db
          .select({ id: grns.id })
          .from(grns)
          .where(inArray(grns.poId, poIds))
      : [];
    const grnIds = [...new Set([...created.grns, ...grnRows.map((g) => g.id)])];
    if (grnIds.length) {
      const gi = await db
        .select({ id: grnItems.id })
        .from(grnItems)
        .where(inArray(grnItems.grnId, grnIds));
      const giIds = gi.map((x) => x.id);
      if (giIds.length)
        await db
          .delete(grnCorrections)
          .where(inArray(grnCorrections.grnItemId, giIds));
      await db.delete(grnItems).where(inArray(grnItems.grnId, grnIds));
      await db.delete(grns).where(inArray(grns.id, grnIds));
    }
    if (poIds.length) {
      await db
        .delete(poCommunications)
        .where(inArray(poCommunications.poId, poIds));
      await db
        .delete(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.poId, poIds));
      await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
    }
    if (created.items.length)
      await db.delete(itemMaster).where(inArray(itemMaster.id, created.items));
    if (created.suppliers.length)
      await db
        .delete(supplierMaster)
        .where(inArray(supplierMaster.id, created.suppliers));
    if (created.employees.length)
      await db
        .delete(employees)
        .where(inArray(employees.id, created.employees));
    if (created.roles.length) {
      await db
        .delete(rolePermissions)
        .where(inArray(rolePermissions.roleId, created.roles));
      await db.delete(roles).where(inArray(roles.id, created.roles));
    }
  }

  return {
    RUN,
    uid,
    actor,
    owner,
    bo,
    floor,
    qa,
    superAdmin,
    get,
    rating,
    card,
    lines,
    trend,
    newSupplier,
    newItem,
    mkPo,
    delivered,
    addCorrection,
    cleanup,
  };
}
