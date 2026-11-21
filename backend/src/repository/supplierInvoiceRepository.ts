import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../db/client";
import { itemMaster } from "../db/schemas/02_procurement-catalog";
import {
  grnItems,
  grns,
  prPoItemLinks,
  purchaseDebitNotes,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  purchaseReturnItems,
  purchaseReturns,
  supplierInvoiceHistory,
  supplierInvoiceLines,
  supplierInvoiceMismatches,
  supplierInvoices,
} from "../db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { companySettings } from "../db/schemas/04_company";
import { safeSearch } from "../lib/safe-search";
import type { SupplierInvoiceListQuery } from "../types/supplierInvoice.types";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

export type SupplierInvoiceInsert = typeof supplierInvoices.$inferInsert;
export type SupplierInvoiceRow = typeof supplierInvoices.$inferSelect;
export type SupplierInvoiceLineInsert =
  typeof supplierInvoiceLines.$inferInsert;
export type SupplierInvoiceLineRow = typeof supplierInvoiceLines.$inferSelect;
export type SupplierInvoiceMismatchInsert =
  typeof supplierInvoiceMismatches.$inferInsert;
export type SupplierInvoiceHistoryInsert =
  typeof supplierInvoiceHistory.$inferInsert;

// numeric(14,3) sums come back as text; keep them as exact thousandths.
const sumMilli = (value: string | number | null | undefined) =>
  Math.round(Number(value ?? 0) * 1000);

export const LIVE_STATUSES = ["draft", "blocked", "approved"] as const;

const sortColumns = {
  ourNumber: supplierInvoices.ourNumber,
  invoiceNumber: supplierInvoices.invoiceNumber,
  invoiceDate: supplierInvoices.invoiceDate,
  dueDate: supplierInvoices.dueDate,
  totalPaise: supplierInvoices.totalPaise,
  createdAt: supplierInvoices.createdAt,
} as const;

export const supplierInvoiceRepository = {
  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(fn);
  },

  // ---------- locks (invoice -> GRN headers asc -> PO -> GRN lines asc -> debit notes -> counter) ----------

  async lockInvoice(id: number, tx: Tx) {
    const [row] = await tx
      .select()
      .from(supplierInvoices)
      .where(eq(supplierInvoices.id, id))
      .limit(1)
      .for("update");
    return row;
  },

  async findInvoice(id: number, executor: Executor = db) {
    const [row] = await executor
      .select()
      .from(supplierInvoices)
      .where(eq(supplierInvoices.id, id))
      .limit(1);
    return row;
  },

  // The GRN header of each GRN line (unlocked read, to know which headers to lock).
  async findGrnLineHeaders(grnItemIds: number[], executor: Executor) {
    if (grnItemIds.length === 0) {
      return [];
    }
    return executor
      .select({
        id: grnItems.id,
        grnId: grnItems.grnId,
        grnPoId: grns.poId,
      })
      .from(grnItems)
      .innerJoin(grns, eq(grns.id, grnItems.grnId))
      .where(inArray(grnItems.id, grnItemIds));
  },

  async lockGrnHeaders(grnIds: number[], tx: Tx) {
    if (grnIds.length === 0) {
      return;
    }
    await tx
      .select({ id: grns.id })
      .from(grns)
      .where(inArray(grns.id, grnIds))
      .orderBy(asc(grns.id))
      .for("update");
  },

  // ---------- reads for the bill ----------

  async findPo(poId: number, executor: Executor = db) {
    const [row] = await executor
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        status: purchaseOrders.status,
        supplierId: purchaseOrders.supplierId,
        paymentTermsDays: purchaseOrders.paymentTermsDays,
        createdAt: purchaseOrders.createdAt,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))
      .limit(1);
    return row;
  },

  async findSupplier(id: number, executor: Executor = db) {
    const [row] = await executor
      .select({
        id: supplierMaster.id,
        name: supplierMaster.name,
        gstNumber: supplierMaster.gstNumber,
      })
      .from(supplierMaster)
      .where(eq(supplierMaster.id, id))
      .limit(1);
    return row;
  },

  async findCompany(executor: Executor) {
    const [row] = await executor.select().from(companySettings).limit(1);
    return row;
  },

  // PO line facts of GRN lines: unit, PO rate and GST % (snapshots for the match).
  async findPoLineFactsByGrnItem(grnItemIds: number[], executor: Executor) {
    if (grnItemIds.length === 0) {
      return [];
    }
    return executor
      .select({
        id: grnItems.id,
        uom: purchaseOrderItems.uom,
        poRatePaise: purchaseOrderItems.unitPricePaise,
        poGstPercent: purchaseOrderItems.gstPercent,
      })
      .from(grnItems)
      .innerJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, grnItems.poItemId),
      )
      .where(inArray(grnItems.id, grnItemIds));
  },

  // BR-SINV-04: a PO that already has an old-style (legacy) bill is never billed again.
  async hasLegacyInvoice(poId: number, executor: Executor = db) {
    const [row] = await executor
      .select({ id: supplierInvoices.id })
      .from(supplierInvoices)
      .where(
        and(
          eq(supplierInvoices.poId, poId),
          eq(supplierInvoices.status, "legacy"),
        ),
      )
      .limit(1);
    return Boolean(row);
  },

  // BR-SINV-06: same supplier, same number, same financial year, on a live or legacy bill.
  async findNumberClash(
    supplierId: number,
    invoiceNumber: string,
    fy: string,
    excludeId: number | undefined,
    executor: Executor,
  ) {
    const [row] = await executor
      .select({ id: supplierInvoices.id })
      .from(supplierInvoices)
      .where(
        and(
          eq(supplierInvoices.supplierId, supplierId),
          or(
            eq(supplierInvoices.invoiceNumber, invoiceNumber),
            sql`upper(trim(${supplierInvoices.invoiceNumber})) = ${invoiceNumber}`,
          ),
          eq(supplierInvoices.fy, fy),
          inArray(supplierInvoices.status, [...LIVE_STATUSES, "legacy"]),
          excludeId !== undefined
            ? ne(supplierInvoices.id, excludeId)
            : undefined,
        ),
      )
      .limit(1);
    return Boolean(row);
  },

  // Qty on bills per GRN line, in thousandths. `statuses` picks which bills count
  // (live = draft, blocked, approved; coverage = approved).
  async billedMilliByGrnItem(
    grnItemIds: number[],
    statuses: readonly ("draft" | "blocked" | "approved")[],
    executor: Executor = db,
    excludeInvoiceId?: number,
  ) {
    const result = new Map<number, number>();
    if (grnItemIds.length === 0) {
      return result;
    }
    const rows = await executor
      .select({
        grnItemId: supplierInvoiceLines.grnItemId,
        total: sql<string>`coalesce(sum(${supplierInvoiceLines.qty}), 0)`,
      })
      .from(supplierInvoiceLines)
      .innerJoin(
        supplierInvoices,
        eq(supplierInvoices.id, supplierInvoiceLines.invoiceId),
      )
      .where(
        and(
          inArray(supplierInvoiceLines.grnItemId, grnItemIds),
          inArray(supplierInvoices.status, [...statuses]),
          excludeInvoiceId !== undefined
            ? ne(supplierInvoices.id, excludeInvoiceId)
            : undefined,
        ),
      )
      .groupBy(supplierInvoiceLines.grnItemId);
    for (const row of rows) {
      if (row.grnItemId !== null) {
        result.set(row.grnItemId, sumMilli(row.total));
      }
    }
    return result;
  },

  // Every GRN line of a PO (PO coverage test, BR-SINV-29).
  async listPoGrnLines(poId: number, executor: Executor) {
    return executor
      .select({ id: grnItems.id, acceptedQty: grnItems.acceptedQty })
      .from(grnItems)
      .innerJoin(grns, eq(grns.id, grnItems.grnId))
      .where(eq(grns.poId, poId))
      .orderBy(asc(grnItems.id));
  },

  async listGrnLineAccepted(grnItemIds: number[], executor: Executor = db) {
    if (grnItemIds.length === 0) {
      return [];
    }
    return executor
      .select({ id: grnItems.id, acceptedQty: grnItems.acceptedQty })
      .from(grnItems)
      .where(inArray(grnItems.id, grnItemIds));
  },

  // GRN lines of a PO that can be billed: QA passed or waived (BR-SINV-02, 38).
  async listBillableCandidates(
    poId: number,
    grnId: number | undefined,
    executor: Executor = db,
  ) {
    return executor
      .select({
        grnItemId: grnItems.id,
        grnId: grns.id,
        grnNumber: grns.grnNumber,
        itemName: itemMaster.name,
        uom: purchaseOrderItems.uom,
        acceptedQty: grnItems.acceptedQty,
        poRatePaise: purchaseOrderItems.unitPricePaise,
        poGstPercent: purchaseOrderItems.gstPercent,
      })
      .from(grnItems)
      .innerJoin(grns, eq(grns.id, grnItems.grnId))
      .innerJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, grnItems.poItemId),
      )
      .innerJoin(itemMaster, eq(itemMaster.id, purchaseOrderItems.itemId))
      .where(
        and(
          eq(grns.poId, poId),
          inArray(grnItems.qaStatus, ["passed", "waived"]),
          grnId !== undefined ? eq(grns.id, grnId) : undefined,
        ),
      )
      .orderBy(asc(grns.id), asc(grnItems.id));
  },

  // ---------- writes ----------

  async insertInvoice(values: SupplierInvoiceInsert, tx: Tx) {
    const [row] = await tx.insert(supplierInvoices).values(values).returning();
    return row;
  },

  async updateInvoice(
    id: number,
    values: Partial<SupplierInvoiceInsert>,
    tx: Tx,
  ) {
    const [row] = await tx
      .update(supplierInvoices)
      .set(values)
      .where(eq(supplierInvoices.id, id))
      .returning();
    return row;
  },

  async deleteInvoice(id: number, tx: Tx) {
    await tx.delete(supplierInvoices).where(eq(supplierInvoices.id, id));
  },

  async insertLines(values: SupplierInvoiceLineInsert[], tx: Tx) {
    if (values.length === 0) {
      return [];
    }
    return tx.insert(supplierInvoiceLines).values(values).returning();
  },

  async deleteLines(invoiceId: number, tx: Tx) {
    await tx
      .delete(supplierInvoiceLines)
      .where(eq(supplierInvoiceLines.invoiceId, invoiceId));
  },

  async updateLine(
    id: number,
    values: Partial<SupplierInvoiceLineInsert>,
    tx: Tx,
  ) {
    await tx
      .update(supplierInvoiceLines)
      .set(values)
      .where(eq(supplierInvoiceLines.id, id));
  },

  async listLines(invoiceId: number, executor: Executor) {
    return executor
      .select()
      .from(supplierInvoiceLines)
      .where(eq(supplierInvoiceLines.invoiceId, invoiceId))
      .orderBy(asc(supplierInvoiceLines.lineNo), asc(supplierInvoiceLines.id));
  },

  async insertMismatches(values: SupplierInvoiceMismatchInsert[], tx: Tx) {
    if (values.length === 0) {
      return;
    }
    await tx.insert(supplierInvoiceMismatches).values(values);
  },

  async deleteMismatches(invoiceId: number, tx: Tx) {
    await tx
      .delete(supplierInvoiceMismatches)
      .where(eq(supplierInvoiceMismatches.invoiceId, invoiceId));
  },

  async listMismatches(invoiceId: number, executor: Executor = db) {
    return executor
      .select()
      .from(supplierInvoiceMismatches)
      .where(eq(supplierInvoiceMismatches.invoiceId, invoiceId))
      .orderBy(asc(supplierInvoiceMismatches.id));
  },

  async insertHistory(values: SupplierInvoiceHistoryInsert, tx: Tx) {
    await tx.insert(supplierInvoiceHistory).values(values);
  },

  // BR-SINV-25: has this user created, edited, submitted or sent the bill back to draft?
  async hasHistoryBy(invoiceId: number, actorId: number, tx: Tx) {
    const [row] = await tx
      .select({ id: supplierInvoiceHistory.id })
      .from(supplierInvoiceHistory)
      .where(
        and(
          eq(supplierInvoiceHistory.invoiceId, invoiceId),
          eq(supplierInvoiceHistory.createdBy, actorId),
          inArray(supplierInvoiceHistory.action, [
            "create",
            "edit",
            "back_to_draft",
            "submit",
          ]),
        ),
      )
      .limit(1);
    return Boolean(row);
  },

  // ---------- details ----------

  async getDetailsHeader(id: number) {
    const [row] = await db
      .select({
        ...getTableColumns(supplierInvoices),
        poNumber: purchaseOrders.poNumber,
        poStatus: purchaseOrders.status,
        supplierName: supplierMaster.name,
        supplierMasterGstin: supplierMaster.gstNumber,
      })
      .from(supplierInvoices)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, supplierInvoices.poId))
      .innerJoin(
        supplierMaster,
        eq(supplierMaster.id, supplierInvoices.supplierId),
      )
      .where(eq(supplierInvoices.id, id))
      .limit(1);
    return row;
  },

  async getDetailsLines(invoiceId: number) {
    return db
      .select({
        ...getTableColumns(supplierInvoiceLines),
        grnId: grns.id,
        grnNumber: grns.grnNumber,
        itemName: itemMaster.name,
      })
      .from(supplierInvoiceLines)
      .leftJoin(grnItems, eq(grnItems.id, supplierInvoiceLines.grnItemId))
      .leftJoin(grns, eq(grns.id, grnItems.grnId))
      .leftJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, grnItems.poItemId),
      )
      .leftJoin(itemMaster, eq(itemMaster.id, purchaseOrderItems.itemId))
      .where(eq(supplierInvoiceLines.invoiceId, invoiceId))
      .orderBy(asc(supplierInvoiceLines.lineNo), asc(supplierInvoiceLines.id));
  },

  async listHistory(invoiceId: number) {
    return db
      .select({
        id: supplierInvoiceHistory.id,
        action: supplierInvoiceHistory.action,
        fromStatus: supplierInvoiceHistory.fromStatus,
        toStatus: supplierInvoiceHistory.toStatus,
        reason: supplierInvoiceHistory.reason,
        detail: supplierInvoiceHistory.detail,
        createdBy: supplierInvoiceHistory.createdBy,
        createdByName: employees.name,
        createdAt: supplierInvoiceHistory.createdAt,
      })
      .from(supplierInvoiceHistory)
      .leftJoin(employees, eq(employees.id, supplierInvoiceHistory.createdBy))
      .where(eq(supplierInvoiceHistory.invoiceId, invoiceId))
      .orderBy(asc(supplierInvoiceHistory.id));
  },

  async listDebitNotesOfInvoice(invoiceId: number) {
    return db
      .select({
        id: purchaseDebitNotes.id,
        number: purchaseDebitNotes.dnNumber,
        totalPaise: purchaseDebitNotes.totalPaise,
        billOffsetPaise: purchaseDebitNotes.billOffsetPaise,
        status: purchaseDebitNotes.status,
      })
      .from(purchaseDebitNotes)
      .where(eq(purchaseDebitNotes.supplierInvoiceId, invoiceId))
      .orderBy(asc(purchaseDebitNotes.id));
  },

  async listPrsOfPo(poId: number) {
    return db
      .selectDistinct({
        id: purchaseRequests.id,
        number: purchaseRequests.prNumber,
        status: purchaseRequests.status,
      })
      .from(purchaseOrderItems)
      .innerJoin(
        prPoItemLinks,
        eq(prPoItemLinks.poItemId, purchaseOrderItems.id),
      )
      .innerJoin(
        purchaseRequestItems,
        eq(purchaseRequestItems.id, prPoItemLinks.prItemId),
      )
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.prId),
      )
      .where(eq(purchaseOrderItems.poId, poId))
      .orderBy(asc(purchaseRequests.id));
  },

  async listGrnsByIds(ids: number[]) {
    if (ids.length === 0) {
      return [];
    }
    return db
      .select({ id: grns.id, number: grns.grnNumber, status: grns.status })
      .from(grns)
      .where(inArray(grns.id, ids))
      .orderBy(asc(grns.id));
  },

  // ---------- list (BR-SINV-37) ----------

  async list(params: SupplierInvoiceListQuery, today: string) {
    const searchFilters = [
      safeSearch(
        params.q,
        supplierInvoices.ourNumber,
        supplierInvoices.invoiceNumber,
        supplierMaster.name,
        purchaseOrders.poNumber,
      ),
      params.supplierId !== undefined
        ? eq(supplierInvoices.supplierId, params.supplierId)
        : undefined,
      params.poId !== undefined
        ? eq(supplierInvoices.poId, params.poId)
        : undefined,
      params.grnId !== undefined
        ? sql`exists (
            select 1 from ${supplierInvoiceLines}
            inner join ${grnItems} on ${grnItems.id} = ${supplierInvoiceLines.grnItemId}
            where ${supplierInvoiceLines.invoiceId} = ${supplierInvoices.id}
              and ${grnItems.grnId} = ${params.grnId}
          )`
        : undefined,
    ].filter((f) => f !== undefined);

    const overdueSql = sql`${supplierInvoices.status} = 'approved' and ${supplierInvoices.dueDate} < ${today}::date`;
    const statusFilter =
      params.status === "draft" ||
      params.status === "blocked" ||
      params.status === "cancelled"
        ? eq(supplierInvoices.status, params.status)
        : params.status === "payable"
          ? eq(supplierInvoices.status, "approved")
          : params.status === "overdue"
            ? overdueSql
            : undefined;

    const where = and(...searchFilters, statusFilter);
    const sortColumn = sortColumns[params.sortBy];
    const orderFn = params.sortDir === "asc" ? asc : desc;

    const base = (executor: Executor) =>
      executor
        .select({
          id: supplierInvoices.id,
          ourNumber: supplierInvoices.ourNumber,
          invoiceNumber: supplierInvoices.invoiceNumber,
          invoiceDate: supplierInvoices.invoiceDate,
          supplierId: supplierInvoices.supplierId,
          supplierName: supplierMaster.name,
          poNumber: purchaseOrders.poNumber,
          status: supplierInvoices.status,
          totalPaise: supplierInvoices.totalPaise,
          billedAmountPaise: supplierInvoices.billedAmountPaise,
          dueDate: supplierInvoices.dueDate,
        })
        .from(supplierInvoices)
        .innerJoin(
          supplierMaster,
          eq(supplierMaster.id, supplierInvoices.supplierId),
        )
        .innerJoin(
          purchaseOrders,
          eq(purchaseOrders.id, supplierInvoices.poId),
        );

    const [rows, [totalRow], countRows] = await Promise.all([
      base(db)
        .where(where)
        .orderBy(orderFn(sortColumn), orderFn(supplierInvoices.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db
        .select({ value: count() })
        .from(supplierInvoices)
        .innerJoin(
          supplierMaster,
          eq(supplierMaster.id, supplierInvoices.supplierId),
        )
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, supplierInvoices.poId))
        .where(where),
      // one grouped query: rows per status for the same search, whatever chip is chosen
      db
        .select({
          status: supplierInvoices.status,
          value: count(),
          overdue: sql<number>`count(*) filter (where ${overdueSql})`.mapWith(
            Number,
          ),
        })
        .from(supplierInvoices)
        .innerJoin(
          supplierMaster,
          eq(supplierMaster.id, supplierInvoices.supplierId),
        )
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, supplierInvoices.poId))
        .where(and(...searchFilters))
        .groupBy(supplierInvoices.status),
    ]);

    const statusCounts = {
      draft: 0,
      blocked: 0,
      payable: 0,
      overdue: 0,
      cancelled: 0,
    };
    for (const row of countRows) {
      if (row.status === "draft") {
        statusCounts.draft = row.value;
      } else if (row.status === "blocked") {
        statusCounts.blocked = row.value;
      } else if (row.status === "approved") {
        statusCounts.payable = row.value;
        statusCounts.overdue = row.overdue;
      } else if (row.status === "cancelled") {
        statusCounts.cancelled = row.value;
      }
    }
    return { rows, total: totalRow?.value ?? 0, statusCounts };
  },

  // ---------- debit-note link (BR-SINV-31, BR-PRT-44, 45) ----------

  // Oldest approved bill with a line on any of these GRN lines (link at return post).
  async findOldestApprovedBillCovering(
    grnItemIds: number[],
    executor: Executor,
  ) {
    if (grnItemIds.length === 0) {
      return undefined;
    }
    const [row] = await executor
      .select({ id: supplierInvoices.id })
      .from(supplierInvoices)
      .innerJoin(
        supplierInvoiceLines,
        eq(supplierInvoiceLines.invoiceId, supplierInvoices.id),
      )
      .where(
        and(
          eq(supplierInvoices.status, "approved"),
          inArray(supplierInvoiceLines.grnItemId, grnItemIds),
        ),
      )
      .orderBy(asc(supplierInvoices.createdAt), asc(supplierInvoices.id))
      .limit(1);
    return row;
  },

  // Unlinked, issued debit notes of posted returns that touch these GRN lines; rows
  // locked FOR UPDATE in ascending id (lock order: after the GRN lines).
  async lockUnlinkedNotesForGrnLines(grnItemIds: number[], tx: Tx) {
    if (grnItemIds.length === 0) {
      return [];
    }
    return tx
      .select({
        id: purchaseDebitNotes.id,
        proId: purchaseDebitNotes.proId,
      })
      .from(purchaseDebitNotes)
      .where(
        and(
          eq(purchaseDebitNotes.status, "issued"),
          isNull(purchaseDebitNotes.supplierInvoiceId),
          sql`exists (
            select 1 from ${purchaseReturns}
            inner join ${purchaseReturnItems} on ${purchaseReturnItems.proId} = ${purchaseReturns.id}
            where ${purchaseReturns.id} = ${purchaseDebitNotes.proId}
              and ${purchaseReturns.status} = 'posted'
              and ${inArray(purchaseReturnItems.grnItemId, grnItemIds)}
          )`,
        ),
      )
      .orderBy(asc(purchaseDebitNotes.id))
      .for("update");
  },

  async lockNotesOfInvoice(invoiceId: number, tx: Tx) {
    return tx
      .select({ id: purchaseDebitNotes.id })
      .from(purchaseDebitNotes)
      .where(eq(purchaseDebitNotes.supplierInvoiceId, invoiceId))
      .orderBy(asc(purchaseDebitNotes.id))
      .for("update");
  },

  // Lines of posted returns (by return id) for offset and the "bill includes the qty" test.
  async listReturnLinesByPro(proIds: number[], executor: Executor) {
    if (proIds.length === 0) {
      return [];
    }
    return executor
      .select({
        proId: purchaseReturnItems.proId,
        grnItemId: purchaseReturnItems.grnItemId,
        source: purchaseReturnItems.source,
        taxablePaise: purchaseReturnItems.taxablePaise,
        gstPaise: purchaseReturnItems.gstPaise,
      })
      .from(purchaseReturnItems)
      .where(inArray(purchaseReturnItems.proId, proIds));
  },

  async setNoteLink(
    noteId: number,
    supplierInvoiceId: number | null,
    billOffsetPaise: number,
    tx: Tx,
  ) {
    await tx
      .update(purchaseDebitNotes)
      .set({ supplierInvoiceId, billOffsetPaise })
      .where(eq(purchaseDebitNotes.id, noteId));
  },
};
