import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db } from "../db/client";
import {
  bomHistory,
  bomLines,
  bomPartSeq,
  boms,
} from "../db/schemas/02_procurement-bom";
import {
  itemMaster,
  serviceMaster,
} from "../db/schemas/02_procurement-catalog";
import {
  supplierMaster,
  supplierServices,
} from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { InternalServerError } from "../lib/errors";
import { safeSearch } from "../lib/safe-search";
import type {
  BomListQuery,
  BomStatus,
  bomHistoryQuerySchema,
} from "../types/bom.types";
import { findActiveVendorServiceRows } from "./vendorServiceRepository";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;
export type BomRow = typeof boms.$inferSelect;
export type BomInsert = typeof boms.$inferInsert;
export type BomLineRow = typeof bomLines.$inferSelect;
export type BomLineInsert = typeof bomLines.$inferInsert;
export type BomHistoryInsert = typeof bomHistory.$inferInsert;

export type ItemRef = {
  id: number;
  sku: string;
  name: string;
  uom: string;
  category: string;
  isActive: boolean;
};

const itemRefColumns = {
  id: itemMaster.id,
  sku: itemMaster.sku,
  name: itemMaster.name,
  uom: itemMaster.uom,
  category: itemMaster.category,
  isActive: itemMaster.isActive,
};

const alloyItem = alias(itemMaster, "alloy_item");
const sentItem = alias(itemMaster, "sent_item");
const createdEmp = alias(employees, "created_emp");
const updatedEmp = alias(employees, "updated_emp");
const releasedEmp = alias(employees, "released_emp");
const retiredEmp = alias(employees, "retired_emp");

const listSortColumns = {
  partSku: itemMaster.sku,
  partName: itemMaster.name,
  revisionNo: boms.revisionNo,
  kind: boms.kind,
  status: boms.status,
  releasedAt: boms.releasedAt,
  createdAt: boms.createdAt,
} as const;

export const bomRepository = {
  // --- Masters (read only) ---

  async findItemsByIds(ids: number[], executor: Executor = db) {
    if (ids.length === 0) return [] as ItemRef[];
    return executor
      .select(itemRefColumns)
      .from(itemMaster)
      .where(inArray(itemMaster.id, ids));
  },

  async findWorker(id: number, executor: Executor = db) {
    const [row] = await executor
      .select({
        id: supplierMaster.id,
        name: supplierMaster.name,
        type: supplierMaster.type,
        isActive: supplierMaster.isActive,
      })
      .from(supplierMaster)
      .where(eq(supplierMaster.id, id))
      .limit(1);
    return row;
  },

  async findService(id: number, executor: Executor = db) {
    const [row] = await executor
      .select({
        id: serviceMaster.id,
        name: serviceMaster.name,
        isActive: serviceMaster.isActive,
      })
      .from(serviceMaster)
      .where(eq(serviceMaster.id, id))
      .limit(1);
    return row;
  },

  // BR-BOM-07 (as BR-SCO-02): the service is on the job worker's active list.
  async workerHasActiveService(
    workerId: number,
    serviceId: number,
    executor: Executor = db,
  ) {
    const rows = await findActiveVendorServiceRows(
      workerId,
      [serviceId],
      executor,
    );
    return rows.length > 0;
  },

  // --- Locks and counters (BR-BOM-02, 17) ---

  /** Inserts the counter row (revision 0) when the part has none yet. */
  async ensurePartSeq(tx: Tx, partId: number) {
    await tx
      .insert(bomPartSeq)
      .values({ partId, lastRevisionNo: 0 })
      .onConflictDoNothing();
  },

  /** `select ... for update` on the part's counter row: serialises one part's changes. */
  async lockPartSeq(tx: Tx, partId: number) {
    const [row] = await tx
      .select()
      .from(bomPartSeq)
      .where(eq(bomPartSeq.partId, partId))
      .for("update");
    return row;
  },

  /** A deleted draft's letter is never reused: the counter only goes up. */
  async nextRevisionNo(tx: Tx, partId: number) {
    const [row] = await tx
      .update(bomPartSeq)
      .set({ lastRevisionNo: sql`${bomPartSeq.lastRevisionNo} + 1` })
      .where(eq(bomPartSeq.partId, partId))
      .returning({ revisionNo: bomPartSeq.lastRevisionNo });
    if (!row)
      throw new InternalServerError("bom_part_seq row missing after lock");
    return row.revisionNo;
  },

  async lastRevisionNo(partId: number, executor: Executor = db) {
    const [row] = await executor
      .select({ last: bomPartSeq.lastRevisionNo })
      .from(bomPartSeq)
      .where(eq(bomPartSeq.partId, partId))
      .limit(1);
    return row?.last ?? 0;
  },

  /** BR-BOM-10: one global lock for the release loop check (design/data.md). */
  async lockBomGraph(tx: Tx) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('bom_graph'))`);
  },

  // --- Revisions ---

  async findBomById(id: number, executor: Executor = db) {
    const [row] = await executor
      .select()
      .from(boms)
      .where(eq(boms.id, id))
      .limit(1);
    return row;
  },

  async findBomForUpdate(tx: Tx, id: number) {
    const [row] = await tx
      .select()
      .from(boms)
      .where(eq(boms.id, id))
      .for("update");
    return row;
  },

  /** Every revision of a part (id, number, status), newest first. */
  async listRevisionsOfPart(partId: number, executor: Executor = db) {
    return executor
      .select({
        id: boms.id,
        revisionNo: boms.revisionNo,
        status: boms.status,
        version: boms.version,
      })
      .from(boms)
      .where(eq(boms.partId, partId))
      .orderBy(desc(boms.revisionNo));
  },

  async insertBom(tx: Tx, values: BomInsert) {
    const [row] = await tx.insert(boms).values(values).returning();
    if (!row) throw new InternalServerError("bom insert returned no row");
    return row;
  },

  async updateBom(tx: Tx, id: number, values: Partial<BomInsert>) {
    const [row] = await tx
      .update(boms)
      .set(values)
      .where(eq(boms.id, id))
      .returning();
    if (!row) throw new InternalServerError("bom update returned no row");
    return row;
  },

  async deleteBom(tx: Tx, id: number) {
    await tx.delete(boms).where(eq(boms.id, id));
  },

  async getLines(bomId: number, executor: Executor = db) {
    return executor
      .select()
      .from(bomLines)
      .where(eq(bomLines.bomId, bomId))
      .orderBy(asc(bomLines.lineNo));
  },

  async replaceLines(tx: Tx, bomId: number, lines: BomLineInsert[]) {
    await tx.delete(bomLines).where(eq(bomLines.bomId, bomId));
    if (lines.length > 0) await tx.insert(bomLines).values(lines);
  },

  async insertHistory(tx: Tx, row: BomHistoryInsert) {
    await tx.insert(bomHistory).values(row);
  },

  // --- Walks (BR-BOM-09, 10): active revisions of a set of parts, one query pair per level ---

  async listActiveByParts(partIds: number[], executor: Executor = db) {
    if (partIds.length === 0) {
      return { boms: [], lines: [] as BomLineRow[] };
    }
    const bomRows = await executor
      .select({
        id: boms.id,
        partId: boms.partId,
        revisionNo: boms.revisionNo,
        kind: boms.kind,
        sentItemId: boms.sentItemId,
        sendQty: boms.sendQty,
        returnQty: boms.returnQty,
      })
      .from(boms)
      .where(and(inArray(boms.partId, partIds), eq(boms.status, "active")));
    const lineRows =
      bomRows.length === 0
        ? []
        : await executor
            .select()
            .from(bomLines)
            .where(
              inArray(
                bomLines.bomId,
                bomRows.map((b) => b.id),
              ),
            )
            .orderBy(asc(bomLines.bomId), asc(bomLines.lineNo));
    return { boms: bomRows, lines: lineRows };
  },

  // --- Needs (BR-BOM-18): one level of the active graph ---

  /** Active revisions (full rows) of these parts, with their lines. */
  async listActiveFullByParts(partIds: number[], executor: Executor = db) {
    if (partIds.length === 0) {
      return { boms: [] as BomRow[], lines: [] as BomLineRow[] };
    }
    const bomRows = await executor
      .select()
      .from(boms)
      .where(and(inArray(boms.partId, partIds), eq(boms.status, "active")));
    const lineRows =
      bomRows.length === 0
        ? []
        : await executor
            .select()
            .from(bomLines)
            .where(
              inArray(
                bomLines.bomId,
                bomRows.map((b) => b.id),
              ),
            )
            .orderBy(asc(bomLines.bomId), asc(bomLines.lineNo));
    return { boms: bomRows, lines: lineRows };
  },

  /** Items with unit, active flag and "has an active BOM" (one statement, EXISTS). */
  async findItemsWithActiveBom(ids: number[], executor: Executor = db) {
    if (ids.length === 0) return [];
    return executor
      .select({
        id: itemMaster.id,
        sku: itemMaster.sku,
        uom: itemMaster.uom,
        isActive: itemMaster.isActive,
        hasActiveBom: sql<boolean>`exists (select 1 from ${boms} where ${boms.partId} = ${itemMaster.id} and ${boms.status} = 'active')`,
      })
      .from(itemMaster)
      .where(inArray(itemMaster.id, ids));
  },

  // --- Where-used (BR-BOM-19): three roles, one UNION ALL plus the count ---

  async whereUsed(
    itemId: number,
    query: {
      page: number;
      pageSize: number;
      sortBy?: string | undefined;
      sortDir: string;
    },
  ) {
    const union = sql`
      select b.id as bom_id, b.part_id, b.revision_no, 'line' as role,
             l.qty_per_piece::float8 as qty_per_piece, l.buy_as_is as buy_as_is,
             null::int as return_qty
        from ${bomLines} l join ${boms} b on b.id = l.bom_id
       where l.component_item_id = ${itemId} and b.status = 'active'
      union all
      select b.id, b.part_id, b.revision_no, 'sent_item',
             b.send_qty::float8, null::boolean, b.return_qty
        from ${boms} b
       where b.sent_item_id = ${itemId} and b.status = 'active'
      union all
      select b.id, b.part_id, b.revision_no, 'alloy',
             null::float8, null::boolean, null::int
        from ${boms} b
       where b.alloy_item_id = ${itemId} and b.status = 'active'`;
    const dir = query.sortDir === "desc" ? sql`desc` : sql`asc`;
    const primary =
      query.sortBy === "revisionNo"
        ? sql`u.revision_no ${dir}, i.sku asc`
        : sql`i.sku ${dir}, u.revision_no desc`;
    const [rows, totals] = await Promise.all([
      db.execute<{
        bom_id: number;
        part_id: number;
        revision_no: number;
        role: "line" | "sent_item" | "alloy";
        qty_per_piece: number | null;
        buy_as_is: boolean | null;
        return_qty: number | null;
        part_sku: string;
        part_name: string;
        net_weight_kg: string | null;
        shot_weight_kg: string | null;
        cavities: number | null;
        melt_loss_pct: string | null;
        casting_reject_pct: string | null;
      }>(sql`
      select u.bom_id, u.part_id, u.revision_no, u.role, u.qty_per_piece,
             u.buy_as_is, u.return_qty, i.sku as part_sku, i.name as part_name,
             bb.net_weight_kg, bb.shot_weight_kg, bb.cavities, bb.melt_loss_pct,
             bb.casting_reject_pct
        from (${union}) u
        join ${itemMaster} i on i.id = u.part_id
        join ${boms} bb on bb.id = u.bom_id
       order by ${primary}, u.bom_id asc, u.role asc
       limit ${query.pageSize} offset ${(query.page - 1) * query.pageSize}`),
      db.execute<{ total: string }>(
        sql`select count(*) as total from (${union}) u`,
      ),
    ]);
    return {
      rows: Array.from(rows),
      total: Number(totals[0]?.total ?? 0),
    };
  },

  async itemExists(id: number, executor: Executor = db) {
    const [row] = await executor
      .select({ id: itemMaster.id })
      .from(itemMaster)
      .where(eq(itemMaster.id, id))
      .limit(1);
    return row !== undefined;
  },

  // --- Reads for the API ---

  async findDetail(id: number) {
    const [row] = await db
      .select({
        bom: getTableColumns(boms),
        part: itemRefColumns,
        alloy: {
          id: alloyItem.id,
          sku: alloyItem.sku,
          name: alloyItem.name,
          uom: alloyItem.uom,
          isActive: alloyItem.isActive,
        },
        sent: {
          id: sentItem.id,
          sku: sentItem.sku,
          name: sentItem.name,
          uom: sentItem.uom,
          isActive: sentItem.isActive,
        },
        workerName: supplierMaster.name,
        workerActive: supplierMaster.isActive,
        serviceName: serviceMaster.name,
        serviceActive: serviceMaster.isActive,
        createdByName: createdEmp.name,
        lastUpdatedByName: updatedEmp.name,
        releasedByName: releasedEmp.name,
        retiredByName: retiredEmp.name,
      })
      .from(boms)
      .innerJoin(itemMaster, eq(itemMaster.id, boms.partId))
      .leftJoin(alloyItem, eq(alloyItem.id, boms.alloyItemId))
      .leftJoin(sentItem, eq(sentItem.id, boms.sentItemId))
      .leftJoin(supplierMaster, eq(supplierMaster.id, boms.jobWorkerId))
      .leftJoin(serviceMaster, eq(serviceMaster.id, boms.serviceId))
      .leftJoin(createdEmp, eq(createdEmp.id, boms.createdBy))
      .leftJoin(updatedEmp, eq(updatedEmp.id, boms.lastUpdatedBy))
      .leftJoin(releasedEmp, eq(releasedEmp.id, boms.releasedBy))
      .leftJoin(retiredEmp, eq(retiredEmp.id, boms.retiredBy))
      .where(eq(boms.id, id))
      .limit(1);
    return row;
  },

  async getLinesWithItems(bomId: number) {
    return db
      .select({
        id: bomLines.id,
        lineNo: bomLines.lineNo,
        componentItemId: bomLines.componentItemId,
        sku: itemMaster.sku,
        name: itemMaster.name,
        unit: itemMaster.uom,
        inactive: sql<boolean>`not ${itemMaster.isActive}`,
        qtyPerPiece: bomLines.qtyPerPiece,
        buyAsIs: bomLines.buyAsIs,
        note: bomLines.note,
      })
      .from(bomLines)
      .innerJoin(itemMaster, eq(itemMaster.id, bomLines.componentItemId))
      .where(eq(bomLines.bomId, bomId))
      .orderBy(asc(bomLines.lineNo));
  },

  async list(
    query: BomListQuery,
    statuses: BomStatus[],
    page: number,
    pageSize: number,
  ) {
    const conditions: SQL[] = [inArray(boms.status, statuses)];
    if (query.kind) conditions.push(eq(boms.kind, query.kind));
    if (query.partId) conditions.push(eq(boms.partId, query.partId));
    const search = safeSearch(query.q, itemMaster.sku, itemMaster.name);
    if (search) conditions.push(search);
    const where = and(...conditions);

    const dir = query.sortDir === "desc" ? desc : asc;
    const order: SQL[] = [];
    if (query.sortBy) {
      order.push(dir(listSortColumns[query.sortBy]));
      if (query.sortBy === "partSku" || query.sortBy === "partName") {
        order.push(desc(boms.revisionNo));
      }
    } else if (query.partId) {
      order.push(desc(boms.revisionNo));
    } else {
      order.push(asc(itemMaster.sku), desc(boms.revisionNo));
    }
    order.push(asc(boms.id));

    const [rows, totals] = await Promise.all([
      db
        .select({
          id: boms.id,
          partId: boms.partId,
          partSku: itemMaster.sku,
          partName: itemMaster.name,
          revisionNo: boms.revisionNo,
          kind: boms.kind,
          status: boms.status,
          releasedAt: boms.releasedAt,
        })
        .from(boms)
        .innerJoin(itemMaster, eq(itemMaster.id, boms.partId))
        .where(where)
        .orderBy(...order)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(boms)
        .innerJoin(itemMaster, eq(itemMaster.id, boms.partId))
        .where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  },

  async listHistory(
    partId: number,
    query: z.infer<typeof bomHistoryQuerySchema>,
  ) {
    // Newest first by default (the history schema defaults sortDir to desc).
    const dir = query.sortDir === "asc" ? asc : desc;
    const where = eq(bomHistory.partId, partId);
    const [rows, totals] = await Promise.all([
      db
        .select({
          id: bomHistory.id,
          action: bomHistory.action,
          revisionNo: bomHistory.revisionNo,
          changes: bomHistory.changes,
          reason: bomHistory.reason,
          changedById: bomHistory.changedBy,
          changedByName: employees.name,
          changedAt: bomHistory.changedAt,
        })
        .from(bomHistory)
        .innerJoin(employees, eq(employees.id, bomHistory.changedBy))
        .where(where)
        .orderBy(dir(bomHistory.changedAt), dir(bomHistory.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(bomHistory).where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  },
};
