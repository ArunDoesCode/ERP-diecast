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
import { safeSearch } from "../lib/safe-search";
import type {
  BomListQuery,
  BomStatus,
  bomHistoryQuerySchema,
} from "../types/bom.types";

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
    const [row] = await executor
      .select({ id: supplierServices.id })
      .from(supplierServices)
      .where(
        and(
          eq(supplierServices.supplierId, workerId),
          eq(supplierServices.serviceId, serviceId),
          eq(supplierServices.isActive, true),
        ),
      )
      .limit(1);
    return row !== undefined;
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
    if (!row) throw new Error("bom_part_seq row missing after lock");
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
    if (!row) throw new Error("bom insert returned no row");
    return row;
  },

  async updateBom(tx: Tx, id: number, values: Partial<BomInsert>) {
    const [row] = await tx
      .update(boms)
      .set(values)
      .where(eq(boms.id, id))
      .returning();
    if (!row) throw new Error("bom update returned no row");
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
    // Newest first unless the caller names the sort (the schema default of sortDir is asc).
    const dir = query.sortBy && query.sortDir === "asc" ? asc : desc;
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
