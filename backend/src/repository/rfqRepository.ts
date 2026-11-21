import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../db/client";
import { itemMaster } from "../db/schemas/02_procurement-catalog";
import {
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
} from "../db/schemas/02_procurement-purchasing";
import {
  rateContractItems,
  rateContracts,
  rfqItems,
  rfqQuoteItems,
  rfqQuotes,
  rfqSuppliers,
  rfqs,
} from "../db/schemas/02_procurement-rfq";
import {
  supplierItems,
  supplierMaster,
} from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { istDayStartInstant, istNextDayStartInstant } from "../lib/ist-day";
import { safeSearch } from "../lib/safe-search";
import type { PrLinesQuery, RfqListQuery } from "../types/rfq.types";
import type { DbExecutor, DbTransaction } from "./executor";
import {
  APPROVED_OR_LATER_PO_STATUSES,
  contractUsableOn,
} from "./rateChainRepository";

type RfqUpdate = Partial<typeof rfqs.$inferInsert>;
type QuoteUpdate = Partial<typeof rfqQuotes.$inferInsert>;
type QuoteItemInsert = typeof rfqQuoteItems.$inferInsert;

const createdByEmp = alias(employees, "rfq_created_by");
const sentByEmp = alias(employees, "rfq_sent_by");
const closedByEmp = alias(employees, "rfq_closed_by");
const cancelledByEmp = alias(employees, "rfq_cancelled_by");
const quoteCancelledByEmp = alias(employees, "rfq_quote_cancelled_by");

const prLineSort = {
  prNumber: purchaseRequests.prNumber,
  itemId: purchaseRequestItems.itemId,
  expectedDate: purchaseRequestItems.expectedDate,
  id: purchaseRequestItems.id,
} as const;

const rfqSort = {
  id: rfqs.id,
  rfqNumber: rfqs.rfqNumber,
  dueDate: rfqs.dueDate,
  createdAt: rfqs.createdAt,
  status: rfqs.status,
} as const;

// "awarded" is derived: a quote line is awarded when an RFQ line points at it.
const quoteIsAwarded = sql<boolean>`exists (
  select 1 from ${rfqQuoteItems}
  inner join ${rfqItems} on ${rfqItems.awardedQuoteItemId} = ${rfqQuoteItems.id}
  where ${rfqQuoteItems.quoteId} = ${rfqQuotes.id}
)`;

const quoteHeaderColumns = {
  id: rfqQuotes.id,
  quoteNumber: rfqQuotes.quoteNumber,
  rfqId: rfqQuotes.rfqId,
  supplierId: rfqQuotes.supplierId,
  supplierName: supplierMaster.name,
  status: rfqQuotes.status,
  isAwarded: quoteIsAwarded,
  supplierQuoteRef: rfqQuotes.supplierQuoteRef,
  quoteDate: rfqQuotes.quoteDate,
  validTill: rfqQuotes.validTill,
  paymentTermsDays: rfqQuotes.paymentTermsDays,
  isLate: rfqQuotes.isLate,
  submittedAt: rfqQuotes.submittedAt,
  cancelledBy: rfqQuotes.cancelledBy,
  cancelledByName: quoteCancelledByEmp.name,
  cancelledAt: rfqQuotes.cancelledAt,
  cancelReason: rfqQuotes.cancelReason,
};

export const rfqRepository = {
  // ---- RFQ header, suppliers, lines ----

  async lockRfq(id: number, tx: DbTransaction) {
    const [row] = await tx
      .select(getTableColumns(rfqs))
      .from(rfqs)
      .where(eq(rfqs.id, id))
      .for("update");
    return row;
  },

  async header(id: number, executor: DbExecutor = db) {
    const [row] = await executor
      .select({
        ...getTableColumns(rfqs),
        createdByName: createdByEmp.name,
        sentByName: sentByEmp.name,
        closedByName: closedByEmp.name,
        cancelledByName: cancelledByEmp.name,
      })
      .from(rfqs)
      .leftJoin(createdByEmp, eq(createdByEmp.id, rfqs.createdBy))
      .leftJoin(sentByEmp, eq(sentByEmp.id, rfqs.sentBy))
      .leftJoin(closedByEmp, eq(closedByEmp.id, rfqs.closedBy))
      .leftJoin(cancelledByEmp, eq(cancelledByEmp.id, rfqs.cancelledBy))
      .where(eq(rfqs.id, id))
      .limit(1);
    return row;
  },

  async insertRfq(data: typeof rfqs.$inferInsert, tx: DbTransaction) {
    const [row] = await tx.insert(rfqs).values(data).returning();
    return row;
  },

  async updateRfq(id: number, data: RfqUpdate, tx: DbTransaction) {
    await tx.update(rfqs).set(data).where(eq(rfqs.id, id));
  },

  async suppliersOfRfq(rfqId: number, executor: DbExecutor = db) {
    return executor
      .select({
        supplierId: rfqSuppliers.supplierId,
        name: supplierMaster.name,
        isActive: supplierMaster.isActive,
        address: supplierMaster.address,
        gstin: supplierMaster.gstNumber,
        defaultPaymentTermsDays: supplierMaster.defaultPaymentTermsDays,
      })
      .from(rfqSuppliers)
      .innerJoin(supplierMaster, eq(supplierMaster.id, rfqSuppliers.supplierId))
      .where(eq(rfqSuppliers.rfqId, rfqId))
      .orderBy(asc(rfqSuppliers.id));
  },

  async findSuppliers(ids: number[], executor: DbExecutor = db) {
    if (ids.length === 0) return [];
    return executor
      .select({
        id: supplierMaster.id,
        name: supplierMaster.name,
        isActive: supplierMaster.isActive,
        defaultPaymentTermsDays: supplierMaster.defaultPaymentTermsDays,
      })
      .from(supplierMaster)
      .where(inArray(supplierMaster.id, ids));
  },

  async insertSuppliers(
    rfqId: number,
    supplierIds: number[],
    tx: DbTransaction,
  ) {
    if (supplierIds.length === 0) return;
    await tx
      .insert(rfqSuppliers)
      .values(supplierIds.map((supplierId) => ({ rfqId, supplierId })));
  },

  async deleteSuppliers(
    rfqId: number,
    supplierIds: number[],
    tx: DbTransaction,
  ) {
    if (supplierIds.length === 0) return;
    await tx
      .delete(rfqSuppliers)
      .where(
        and(
          eq(rfqSuppliers.rfqId, rfqId),
          inArray(rfqSuppliers.supplierId, supplierIds),
        ),
      );
  },

  /** Plain lines of an RFQ (no joins): id, pr line, qty, status. */
  async plainLines(rfqId: number, executor: DbExecutor = db) {
    return executor
      .select({
        id: rfqItems.id,
        prItemId: rfqItems.prItemId,
        itemId: rfqItems.itemId,
        qty: rfqItems.qty,
        uom: rfqItems.uom,
        lineStatus: rfqItems.lineStatus,
        awardedQuoteItemId: rfqItems.awardedQuoteItemId,
      })
      .from(rfqItems)
      .where(eq(rfqItems.rfqId, rfqId))
      .orderBy(asc(rfqItems.id));
  },

  async insertLines(rows: (typeof rfqItems.$inferInsert)[], tx: DbTransaction) {
    if (rows.length === 0) return [];
    return tx.insert(rfqItems).values(rows).returning({
      id: rfqItems.id,
      prItemId: rfqItems.prItemId,
      itemId: rfqItems.itemId,
      qty: rfqItems.qty,
      uom: rfqItems.uom,
      lineStatus: rfqItems.lineStatus,
    });
  },

  async deleteLinesByPrItem(
    rfqId: number,
    prItemIds: number[],
    tx: DbTransaction,
  ) {
    if (prItemIds.length === 0) return;
    await tx
      .delete(rfqItems)
      .where(
        and(eq(rfqItems.rfqId, rfqId), inArray(rfqItems.prItemId, prItemIds)),
      );
  },

  /** The full line view for details: item, PR line, award, PO. */
  async detailedLines(rfqId: number, executor: DbExecutor = db) {
    return executor
      .select({
        id: rfqItems.id,
        prItemId: rfqItems.prItemId,
        prId: purchaseRequestItems.prId,
        prNumber: purchaseRequests.prNumber,
        itemId: rfqItems.itemId,
        itemCode: itemMaster.sku,
        itemName: itemMaster.name,
        qty: rfqItems.qty,
        uom: rfqItems.uom,
        lineStatus: rfqItems.lineStatus,
        prItemStatus: purchaseRequestItems.status,
        awardedQuoteItemId: rfqItems.awardedQuoteItemId,
        awardedQuoteId: rfqQuoteItems.quoteId,
        awardedSupplierId: rfqQuotes.supplierId,
        awardedSupplierName: supplierMaster.name,
        awardedAt: rfqItems.awardedAt,
        awardReason: rfqItems.awardReason,
        awardLowestLandedPaise: rfqItems.awardLowestLandedPaise,
        awardChosenLandedPaise: rfqItems.awardChosenLandedPaise,
        poItemId: rfqItems.poItemId,
        poId: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        poStatus: purchaseOrders.status,
      })
      .from(rfqItems)
      .innerJoin(
        purchaseRequestItems,
        eq(purchaseRequestItems.id, rfqItems.prItemId),
      )
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.prId),
      )
      .innerJoin(itemMaster, eq(itemMaster.id, rfqItems.itemId))
      .leftJoin(
        rfqQuoteItems,
        eq(rfqQuoteItems.id, rfqItems.awardedQuoteItemId),
      )
      .leftJoin(rfqQuotes, eq(rfqQuotes.id, rfqQuoteItems.quoteId))
      .leftJoin(supplierMaster, eq(supplierMaster.id, rfqQuotes.supplierId))
      .leftJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, rfqItems.poItemId),
      )
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.poId))
      .where(eq(rfqItems.rfqId, rfqId))
      .orderBy(asc(rfqItems.id));
  },

  /** Lines of the PR items, joined for a quick "is this PR line still pending" read. */
  async openLinePrStatus(rfqId: number, executor: DbExecutor) {
    return executor
      .select({
        id: rfqItems.id,
        prItemId: rfqItems.prItemId,
        prItemStatus: purchaseRequestItems.status,
        prStatus: purchaseRequests.status,
      })
      .from(rfqItems)
      .innerJoin(
        purchaseRequestItems,
        eq(purchaseRequestItems.id, rfqItems.prItemId),
      )
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.prId),
      )
      .where(and(eq(rfqItems.rfqId, rfqId), eq(rfqItems.lineStatus, "open")))
      .orderBy(asc(rfqItems.id));
  },

  async markLinesDropped(ids: number[], tx: DbTransaction) {
    if (ids.length === 0) return;
    await tx
      .update(rfqItems)
      .set({ lineStatus: "dropped", droppedAt: new Date() })
      .where(inArray(rfqItems.id, ids));
  },

  // PERF-03: one UPDATE ... FROM (VALUES ...) for all awarded lines.
  async markLinesAwarded(
    rows: {
      id: number;
      quoteItemId: number;
      actorId: number;
      reason: string | null;
      lowestLandedPaise: number;
      chosenLandedPaise: number;
      at: Date;
    }[],
    tx: DbTransaction,
  ) {
    if (rows.length === 0) return;
    const values = sql.join(
      rows.map(
        (r) =>
          sql`(${r.id}::int, ${r.quoteItemId}::int, ${r.actorId}::int, ${r.reason}::text, ${r.lowestLandedPaise}::bigint, ${r.chosenLandedPaise}::bigint, ${r.at.toISOString()}::timestamp)`,
      ),
      sql`, `,
    );
    await tx.execute(sql`
      update ${rfqItems} as ri set
        line_status = 'awarded',
        awarded_quote_item_id = v.quote_item_id,
        awarded_by = v.actor_id,
        awarded_at = v.at,
        award_reason = v.reason,
        award_lowest_landed_paise = v.lowest,
        award_chosen_landed_paise = v.chosen
      from (values ${values}) as v(id, quote_item_id, actor_id, reason, lowest, chosen, at)
      where ri.id = v.id`);
  },

  // PERF-03: one UPDATE ... FROM (VALUES ...) for all PO line links.
  async setPoItems(
    rows: { id: number; poItemId: number }[],
    tx: DbTransaction,
  ) {
    if (rows.length === 0) return;
    const values = sql.join(
      rows.map((r) => sql`(${r.id}::int, ${r.poItemId}::int)`),
      sql`, `,
    );
    await tx.execute(sql`
      update ${rfqItems} as ri set po_item_id = v.po_item_id
      from (values ${values}) as v(id, po_item_id)
      where ri.id = v.id`);
  },

  async countOpenLines(rfqId: number, tx: DbTransaction) {
    const [row] = await tx
      .select({ value: count() })
      .from(rfqItems)
      .where(and(eq(rfqItems.rfqId, rfqId), eq(rfqItems.lineStatus, "open")));
    return row?.value ?? 0;
  },

  /** Open-RFQ lines for these PR lines, other than on `exceptRfqId` (BR-RFQ-02). */
  async openRfqForPrItems(
    prItemIds: number[],
    exceptRfqId: number | null,
    executor: DbExecutor,
  ) {
    if (prItemIds.length === 0) return [];
    return executor
      .select({
        prItemId: rfqItems.prItemId,
        rfqId: rfqs.id,
        rfqNumber: rfqs.rfqNumber,
      })
      .from(rfqItems)
      .innerJoin(rfqs, eq(rfqs.id, rfqItems.rfqId))
      .where(
        and(
          inArray(rfqItems.prItemId, prItemIds),
          eq(rfqItems.lineStatus, "open"),
          exceptRfqId !== null ? ne(rfqItems.rfqId, exceptRfqId) : undefined,
        ),
      );
  },

  // ---- lists ----

  async listPrLines(params: PrLinesQuery) {
    const remaining = sql`(${purchaseRequestItems.requestedQty} - coalesce(${purchaseRequestItems.issuedQty}, 0))`;
    const where = and(
      eq(purchaseRequestItems.status, "pending"),
      inArray(purchaseRequests.status, ["approved", "partial_ordered"]),
      sql`${remaining} > 0`,
      safeSearch(params.q, purchaseRequests.prNumber),
      params.prId ? eq(purchaseRequestItems.prId, params.prId) : undefined,
      params.itemId
        ? eq(purchaseRequestItems.itemId, params.itemId)
        : undefined,
      params.onOpenRfq === true ? isNotNull(rfqItems.id) : undefined,
      params.onOpenRfq === false ? isNull(rfqItems.id) : undefined,
    );
    const sortColumn = prLineSort[params.sortBy ?? "id"];
    const orderFn = params.sortDir === "desc" ? desc : asc;
    const base = () =>
      db
        .select({
          id: purchaseRequestItems.id,
          prId: purchaseRequests.id,
          prNumber: purchaseRequests.prNumber,
          itemId: purchaseRequestItems.itemId,
          itemCode: itemMaster.sku,
          itemName: itemMaster.name,
          qty: sql<number>`round((${remaining})::numeric, 3)`.mapWith(Number),
          uom: purchaseRequestItems.uom,
          expectedDate: purchaseRequestItems.expectedDate,
          openRfqId: rfqs.id,
          openRfqNumber: rfqs.rfqNumber,
        })
        .from(purchaseRequestItems)
        .innerJoin(
          purchaseRequests,
          eq(purchaseRequests.id, purchaseRequestItems.prId),
        )
        .innerJoin(itemMaster, eq(itemMaster.id, purchaseRequestItems.itemId))
        .leftJoin(
          rfqItems,
          and(
            eq(rfqItems.prItemId, purchaseRequestItems.id),
            eq(rfqItems.lineStatus, "open"),
          ),
        )
        .leftJoin(rfqs, eq(rfqs.id, rfqItems.rfqId))
        .where(where);
    const [rows, [totalRow]] = await Promise.all([
      base()
        .orderBy(orderFn(sortColumn), asc(purchaseRequestItems.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db
        .select({ value: count() })
        .from(purchaseRequestItems)
        .innerJoin(
          purchaseRequests,
          eq(purchaseRequests.id, purchaseRequestItems.prId),
        )
        .leftJoin(
          rfqItems,
          and(
            eq(rfqItems.prItemId, purchaseRequestItems.id),
            eq(rfqItems.lineStatus, "open"),
          ),
        )
        .where(where),
    ]);
    return { rows, total: totalRow?.value ?? 0 };
  },

  async listRfqs(params: RfqListQuery) {
    const where = and(
      safeSearch(params.q, rfqs.rfqNumber, rfqs.notes),
      params.status ? eq(rfqs.status, params.status) : undefined,
      params.supplierId
        ? sql`exists (select 1 from ${rfqSuppliers} where ${rfqSuppliers.rfqId} = ${rfqs.id} and ${rfqSuppliers.supplierId} = ${params.supplierId})`
        : undefined,
      params.prId
        ? sql`exists (select 1 from ${rfqItems} inner join ${purchaseRequestItems} on ${purchaseRequestItems.id} = ${rfqItems}.pr_item_id where ${rfqItems.rfqId} = ${rfqs.id} and ${purchaseRequestItems.prId} = ${params.prId})`
        : undefined,
      params.from
        ? gte(
            rfqs.createdAt,
            istDayStartInstant(new Date(`${params.from}T00:00:00.000Z`)),
          )
        : undefined,
      params.to
        ? lt(
            rfqs.createdAt,
            istNextDayStartInstant(new Date(`${params.to}T00:00:00.000Z`)),
          )
        : undefined,
    );
    const sortColumn = rfqSort[params.sortBy ?? "createdAt"];
    const orderFn = params.sortDir === "asc" ? asc : desc;
    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: rfqs.id,
          rfqNumber: rfqs.rfqNumber,
          status: rfqs.status,
          dueDate: rfqs.dueDate,
          notes: rfqs.notes,
          createdAt: rfqs.createdAt,
          createdByName: createdByEmp.name,
        })
        .from(rfqs)
        .leftJoin(createdByEmp, eq(createdByEmp.id, rfqs.createdBy))
        .where(where)
        .orderBy(orderFn(sortColumn), desc(rfqs.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(rfqs).where(where),
    ]);
    return { rows, total: totalRow?.value ?? 0 };
  },

  /** supplierCount, quotedCount, lineCount for the listed RFQs: one group by each. */
  async listCounts(rfqIds: number[]) {
    const supplierCount = new Map<number, number>();
    const quotedCount = new Map<number, number>();
    const lineCount = new Map<number, number>();
    if (rfqIds.length === 0) return { supplierCount, quotedCount, lineCount };
    const [s, q, l] = await Promise.all([
      db
        .select({ rfqId: rfqSuppliers.rfqId, value: count() })
        .from(rfqSuppliers)
        .where(inArray(rfqSuppliers.rfqId, rfqIds))
        .groupBy(rfqSuppliers.rfqId),
      db
        .select({
          rfqId: rfqQuotes.rfqId,
          value: sql<number>`count(distinct ${rfqQuotes.supplierId})`.mapWith(
            Number,
          ),
        })
        .from(rfqQuotes)
        .where(
          and(
            inArray(rfqQuotes.rfqId, rfqIds),
            eq(rfqQuotes.status, "submitted"),
          ),
        )
        .groupBy(rfqQuotes.rfqId),
      db
        .select({ rfqId: rfqItems.rfqId, value: count() })
        .from(rfqItems)
        .where(inArray(rfqItems.rfqId, rfqIds))
        .groupBy(rfqItems.rfqId),
    ]);
    for (const r of s) supplierCount.set(r.rfqId, r.value);
    for (const r of q) quotedCount.set(r.rfqId, r.value);
    for (const r of l) lineCount.set(r.rfqId, r.value);
    return { supplierCount, quotedCount, lineCount };
  },

  // ---- quotes ----

  async quoteHeaders(rfqId: number, executor: DbExecutor = db) {
    return executor
      .select(quoteHeaderColumns)
      .from(rfqQuotes)
      .innerJoin(supplierMaster, eq(supplierMaster.id, rfqQuotes.supplierId))
      .leftJoin(
        quoteCancelledByEmp,
        eq(quoteCancelledByEmp.id, rfqQuotes.cancelledBy),
      )
      .where(eq(rfqQuotes.rfqId, rfqId))
      .orderBy(asc(rfqQuotes.id));
  },

  async quoteHeader(quoteId: number, executor: DbExecutor = db) {
    const [row] = await executor
      .select({
        ...quoteHeaderColumns,
        rfqNumber: rfqs.rfqNumber,
        rfqStatus: rfqs.status,
      })
      .from(rfqQuotes)
      .innerJoin(rfqs, eq(rfqs.id, rfqQuotes.rfqId))
      .innerJoin(supplierMaster, eq(supplierMaster.id, rfqQuotes.supplierId))
      .leftJoin(
        quoteCancelledByEmp,
        eq(quoteCancelledByEmp.id, rfqQuotes.cancelledBy),
      )
      .where(eq(rfqQuotes.id, quoteId))
      .limit(1);
    return row;
  },

  /** Bare quote row for locking and status checks. */
  async quoteRow(quoteId: number, executor: DbExecutor = db) {
    const [row] = await executor
      .select(getTableColumns(rfqQuotes))
      .from(rfqQuotes)
      .where(eq(rfqQuotes.id, quoteId))
      .limit(1);
    return row;
  },

  async lockQuotes(quoteIds: number[], tx: DbTransaction) {
    const ids = [...new Set(quoteIds)].sort((a, b) => a - b);
    if (ids.length === 0) return [];
    return tx
      .select(getTableColumns(rfqQuotes))
      .from(rfqQuotes)
      .where(inArray(rfqQuotes.id, ids))
      .orderBy(asc(rfqQuotes.id))
      .for("update");
  },

  async liveQuoteOfSupplier(
    rfqId: number,
    supplierId: number,
    executor: DbExecutor,
  ) {
    const [row] = await executor
      .select({ id: rfqQuotes.id })
      .from(rfqQuotes)
      .where(
        and(
          eq(rfqQuotes.rfqId, rfqId),
          eq(rfqQuotes.supplierId, supplierId),
          inArray(rfqQuotes.status, ["draft", "submitted"]),
        ),
      )
      .limit(1);
    return row;
  },

  async insertQuote(data: typeof rfqQuotes.$inferInsert, tx: DbTransaction) {
    const [row] = await tx
      .insert(rfqQuotes)
      .values(data)
      .returning({ id: rfqQuotes.id });
    return row;
  },

  async updateQuote(id: number, data: QuoteUpdate, tx: DbTransaction) {
    await tx.update(rfqQuotes).set(data).where(eq(rfqQuotes.id, id));
  },

  async replaceQuoteItems(
    quoteId: number,
    rows: QuoteItemInsert[],
    tx: DbTransaction,
  ) {
    await tx.delete(rfqQuoteItems).where(eq(rfqQuoteItems.quoteId, quoteId));
    if (rows.length > 0) await tx.insert(rfqQuoteItems).values(rows);
  },

  async quoteLines(quoteId: number, executor: DbExecutor = db) {
    return executor
      .select({
        id: rfqQuoteItems.id,
        rfqItemId: rfqQuoteItems.rfqItemId,
        itemId: rfqItems.itemId,
        itemCode: itemMaster.sku,
        itemName: itemMaster.name,
        qty: rfqItems.qty,
        uom: rfqItems.uom,
        lineStatus: rfqItems.lineStatus,
        isQuoted: rfqQuoteItems.isQuoted,
        ratePaise: rfqQuoteItems.ratePaise,
        gstPercent: rfqQuoteItems.gstPercent,
        leadDays: rfqQuoteItems.leadDays,
        freightPaise: rfqQuoteItems.freightPaise,
        lineValuePaise: rfqQuoteItems.lineValuePaise,
        lineTaxPaise: rfqQuoteItems.lineTaxPaise,
        landedRatePaise: rfqQuoteItems.landedRatePaise,
        isAwarded: sql<boolean>`${rfqItems.awardedQuoteItemId} = ${rfqQuoteItems.id}`,
      })
      .from(rfqQuoteItems)
      .innerJoin(rfqItems, eq(rfqItems.id, rfqQuoteItems.rfqItemId))
      .innerJoin(itemMaster, eq(itemMaster.id, rfqItems.itemId))
      .where(eq(rfqQuoteItems.quoteId, quoteId))
      .orderBy(asc(rfqItems.id));
  },

  /** Quote lines (with their quote) by id, for award validation. */
  async quoteItemsByIds(ids: number[], executor: DbExecutor) {
    if (ids.length === 0) return [];
    return executor
      .select({
        id: rfqQuoteItems.id,
        quoteId: rfqQuoteItems.quoteId,
        rfqItemId: rfqQuoteItems.rfqItemId,
        isQuoted: rfqQuoteItems.isQuoted,
        ratePaise: rfqQuoteItems.ratePaise,
        gstPercent: rfqQuoteItems.gstPercent,
        freightPaise: rfqQuoteItems.freightPaise,
        landedRatePaise: rfqQuoteItems.landedRatePaise,
        leadDays: rfqQuoteItems.leadDays,
      })
      .from(rfqQuoteItems)
      .where(inArray(rfqQuoteItems.id, ids));
  },

  /**
   * Every quote line of the RFQ's quotes that can show in the comparison (status
   * submitted or not_awarded; draft and cancelled quotes never compete, BR-RFQ-24)
   * with the quote and supplier facts the grid and the award need.
   */
  async comparisonQuoteItems(
    rfqId: number,
    executor: DbExecutor,
    statuses: ("submitted" | "not_awarded")[] = ["submitted", "not_awarded"],
  ) {
    return executor
      .select({
        quoteItemId: rfqQuoteItems.id,
        rfqItemId: rfqQuoteItems.rfqItemId,
        quoteId: rfqQuotes.id,
        quoteStatus: rfqQuotes.status,
        supplierId: rfqQuotes.supplierId,
        supplierActive: supplierMaster.isActive,
        validTill: rfqQuotes.validTill,
        paymentTermsDays: rfqQuotes.paymentTermsDays,
        isLate: rfqQuotes.isLate,
        submittedAt: rfqQuotes.submittedAt,
        isQuoted: rfqQuoteItems.isQuoted,
        ratePaise: rfqQuoteItems.ratePaise,
        gstPercent: rfqQuoteItems.gstPercent,
        freightPaise: rfqQuoteItems.freightPaise,
        landedRatePaise: rfqQuoteItems.landedRatePaise,
        leadDays: rfqQuoteItems.leadDays,
        quoteNumber: rfqQuotes.quoteNumber,
        supplierQuoteRef: rfqQuotes.supplierQuoteRef,
      })
      .from(rfqQuoteItems)
      .innerJoin(rfqQuotes, eq(rfqQuotes.id, rfqQuoteItems.quoteId))
      .innerJoin(supplierMaster, eq(supplierMaster.id, rfqQuotes.supplierId))
      .where(
        and(eq(rfqQuotes.rfqId, rfqId), inArray(rfqQuotes.status, statuses)),
      );
  },

  async cancelledQuotes(rfqId: number, executor: DbExecutor) {
    return executor
      .select({
        quoteId: rfqQuotes.id,
        quoteNumber: rfqQuotes.quoteNumber,
        supplierId: rfqQuotes.supplierId,
        cancelledBy: rfqQuotes.cancelledBy,
        cancelledByName: quoteCancelledByEmp.name,
        cancelledAt: rfqQuotes.cancelledAt,
        cancelReason: rfqQuotes.cancelReason,
      })
      .from(rfqQuotes)
      .leftJoin(
        quoteCancelledByEmp,
        eq(quoteCancelledByEmp.id, rfqQuotes.cancelledBy),
      )
      .where(and(eq(rfqQuotes.rfqId, rfqId), eq(rfqQuotes.status, "cancelled")))
      .orderBy(asc(rfqQuotes.id));
  },

  /** Does any line of this quote have an award (BR-RFQ-19)? */
  async quoteHasAward(quoteId: number, executor: DbExecutor) {
    const [row] = await executor
      .select({ id: rfqItems.id })
      .from(rfqItems)
      .innerJoin(
        rfqQuoteItems,
        eq(rfqQuoteItems.id, rfqItems.awardedQuoteItemId),
      )
      .where(eq(rfqQuoteItems.quoteId, quoteId))
      .limit(1);
    return row !== undefined;
  },

  // ---- RFQ end sweeps (BR-RFQ-34, 36, 38) ----

  /** Draft quotes -> cancelled with the system reason "RFQ ended". */
  async cancelDraftQuotes(
    rfqId: number,
    actorId: number,
    tx: DbTransaction,
    statuses: ("draft" | "submitted")[] = ["draft"],
  ) {
    await tx
      .update(rfqQuotes)
      .set({
        status: "cancelled",
        cancelledBy: actorId,
        cancelledAt: new Date(),
        cancelReason: "RFQ ended",
      })
      .where(
        and(eq(rfqQuotes.rfqId, rfqId), inArray(rfqQuotes.status, statuses)),
      );
  },

  /** Submitted quotes with no awarded line -> not_awarded (BR-RFQ-34). */
  async markNotAwarded(rfqId: number, tx: DbTransaction) {
    const winners = tx
      .select({ id: rfqQuoteItems.quoteId })
      .from(rfqQuoteItems)
      .innerJoin(rfqItems, eq(rfqItems.awardedQuoteItemId, rfqQuoteItems.id))
      .where(eq(rfqItems.rfqId, rfqId));
    await tx
      .update(rfqQuotes)
      .set({ status: "not_awarded" })
      .where(
        and(
          eq(rfqQuotes.rfqId, rfqId),
          eq(rfqQuotes.status, "submitted"),
          notInArray(rfqQuotes.id, winners),
        ),
      );
  },

  /** Open lines of the RFQ -> dropped (close, cancel). */
  async dropOpenLines(rfqId: number, tx: DbTransaction) {
    await tx
      .update(rfqItems)
      .set({ lineStatus: "dropped", droppedAt: new Date() })
      .where(and(eq(rfqItems.rfqId, rfqId), eq(rfqItems.lineStatus, "open")));
  },

  // ---- rates beside the lines (BR-RFQ-10, 20) ----

  /** Contract rates usable today for these suppliers and items. */
  async contractRates(
    supplierIds: number[],
    itemIds: number[],
    onDate: string,
    executor: DbExecutor,
  ) {
    if (supplierIds.length === 0 || itemIds.length === 0) return [];
    return executor
      .select({
        supplierId: rateContracts.supplierId,
        itemId: rateContractItems.itemId,
        contractNumber: rateContracts.contractNumber,
        ratePaise: rateContractItems.ratePaise,
      })
      .from(rateContractItems)
      .innerJoin(
        rateContracts,
        eq(rateContracts.id, rateContractItems.contractId),
      )
      .where(
        and(
          inArray(rateContracts.supplierId, supplierIds),
          inArray(rateContractItems.itemId, itemIds),
          contractUsableOn(onDate),
        ),
      )
      .orderBy(desc(rateContractItems.id));
  },

  /** The newest approved-or-later PO line rate per item, across suppliers. */
  async lastPoRates(itemIds: number[], executor: DbExecutor) {
    if (itemIds.length === 0) return [];
    return executor
      .selectDistinctOn([purchaseOrderItems.itemId], {
        itemId: purchaseOrderItems.itemId,
        ratePaise: purchaseOrderItems.unitPricePaise,
      })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.poId))
      .where(
        and(
          inArray(purchaseOrderItems.itemId, itemIds),
          sql`${purchaseOrderItems.unitPricePaise} > 0`,
          inArray(purchaseOrders.status, [...APPROVED_OR_LATER_PO_STATUSES]),
        ),
      )
      .orderBy(
        purchaseOrderItems.itemId,
        desc(purchaseOrders.createdAt),
        desc(purchaseOrderItems.id),
      );
  },

  /** The supplier's active price-list GST % per item (quote line default, BR-RFQ-15). */
  async priceListGst(
    supplierId: number,
    itemIds: number[],
    executor: DbExecutor,
  ) {
    if (itemIds.length === 0) return [];
    return executor
      .select({
        itemId: supplierItems.itemId,
        taxPercentage: supplierItems.taxPercentage,
      })
      .from(supplierItems)
      .where(
        and(
          eq(supplierItems.supplierId, supplierId),
          inArray(supplierItems.itemId, itemIds),
          eq(supplierItems.isActive, true),
        ),
      );
  },

  /** Item facts for print / notes (code, name). */
  async itemsByIds(ids: number[], executor: DbExecutor) {
    if (ids.length === 0) return [];
    return executor
      .select({
        id: itemMaster.id,
        sku: itemMaster.sku,
        name: itemMaster.name,
        uom: itemMaster.uom,
      })
      .from(itemMaster)
      .where(inArray(itemMaster.id, ids));
  },
};
