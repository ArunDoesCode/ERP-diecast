import {
  type AnyColumn,
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  sql,
} from "drizzle-orm";

import { alias } from "drizzle-orm/pg-core";

import { db } from "../db/client";
import { itemMaster } from "../db/schemas/02_procurement-catalog";
import {
  grns,
  poCommunications,
  poStatusEnum,
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  purchaseReturns,
} from "../db/schemas/02_procurement-purchasing";
import {
  rateContractItems,
  rateContracts,
  rfqItems,
  rfqQuoteItems,
  rfqQuotes,
  rfqs,
} from "../db/schemas/02_procurement-rfq";
import {
  supplierItems,
  supplierMaster,
} from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { istDayKey } from "../lib/ist-day";
import { safeSearch } from "../lib/safe-search";
import type {
  poListQuerySchemaType,
  poStatusSchemaType,
} from "../types/po.types";
import { openQtySql, pendingQaQtySql, round3 } from "./openQty";
import { poBucketSql, poDueSql, poLateSql } from "./poPredicates";
import { prRepository } from "./prRepository";
import { findRateChoices } from "./rateChainRepository";

// All stored PO columns plus the canceller's name and the due date
// (BR-PO-19: revised date if set, else expected date).
const purchaseOrderColumns = {
  ...getTableColumns(purchaseOrders),
  cancelledByName: sql<
    string | null
  >`(select ${employees.name} from ${employees} where ${employees.id} = ${purchaseOrders.cancelledBy})`.as(
    "cancelled_by_name",
  ),
  // BR-PO-24: supplier name next to supplierId.
  supplierName:
    sql<string>`(select ${supplierMaster.name} from ${supplierMaster} where ${supplierMaster.id} = ${purchaseOrders.supplierId})`.as(
      "supplier_name",
    ),
  dueDate:
    sql<Date | null>`coalesce(${purchaseOrders.revisedDeliveryDate}, ${purchaseOrders.expectedDeliveryDate})`
      .mapWith(purchaseOrders.expectedDeliveryDate)
      .as("due_date"),
};

const purchaseOrderItemWriteColumns = getTableColumns(purchaseOrderItems);

const overrideEmployee = alias(employees, "po_rate_override_by");

const purchaseOrderItemDetailColumns = {
  ...purchaseOrderItemWriteColumns,
  itemSku: itemMaster.sku,
  itemName: itemMaster.name,
  itemCategory: itemMaster.category,
  prItemId: prPoItemLinks.prItemId,
  prNumber: purchaseRequests.prNumber,
  // BR-RFQ-31, 50, 51: where the rate came from, who overrode it
  contractNumber: rateContracts.contractNumber,
  quoteNumber: rfqQuotes.quoteNumber,
  rateOverrideByName: overrideEmployee.name,
};

type PurchaseOrderInsert = typeof purchaseOrders.$inferInsert;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// BR-RFQ-31, 50, 51: where a line's rate came from (all null for a typed or suggested rate).
export type PoLineRateLinks = {
  quoteItemId: number | null;
  contractItemId: number | null;
  contractRatePaise: number | null;
  rateOverrideReason: string | null;
  rateOverrideBy: number | null;
  rateOverrideAt: Date | null;
};

export const NO_RATE_LINKS: PoLineRateLinks = {
  quoteItemId: null,
  contractItemId: null,
  contractRatePaise: null,
  rateOverrideReason: null,
  rateOverrideBy: null,
  rateOverrideAt: null,
};

export type CreatePoLineData = {
  prItemId: number;
  unitPricePaise: number;
  gstPercent: number;
} & PoLineRateLinks;

export type UpdatePoData = Partial<
  Pick<
    PurchaseOrderInsert,
    | "paymentTermsDays"
    | "deliveryTerms"
    | "notes"
    | "expectedDeliveryDate"
    | "revisedDeliveryDate"
    | "delayReason"
    | "supplierConfirmed"
    | "confirmationMethod"
    | "confirmedAt"
    | "confirmedBy"
    | "confirmationNote"
    | "closedAt"
    | "closedBy"
    | "closeNote"
    | "cancelledBy"
    | "cancelledAt"
    | "cancelReason"
    | "shortClosed"
    | "invoicedBy"
    | "invoicedAt"
    | "status"
    | "subtotalPaise"
    | "taxAmountPaise"
    | "totalAmountPaise"
  >
>;

export type PoLineUpdateData = {
  id: number;
  unitPricePaise?: number | undefined;
  gstPercent?: number | undefined;
};

export type InsertPoData = Pick<
  PurchaseOrderInsert,
  | "poNumber"
  | "supplierId"
  | "subtotalPaise"
  | "taxAmountPaise"
  | "totalAmountPaise"
  | "paymentTermsDays"
  | "deliveryTerms"
  | "notes"
  | "expectedDeliveryDate"
  | "createdBy"
>;

// A PO line ready to save: qty from the PR line, amounts worked out (BR-PO-04).
export type PreparedPoLine = {
  prItemId: number;
  itemId: number;
  qty: number;
  uom: string;
  unitPricePaise: number;
  gstPercent: number;
  lineValuePaise: number;
  lineTaxPaise: number;
} & PoLineRateLinks;

export type PoLinePriceData = {
  id: number;
  unitPricePaise: number;
  gstPercent: number;
  lineValuePaise: number;
  lineTaxPaise: number;
  links: PoLineRateLinks;
};

type PrItemForUpdateRow = {
  id: number;
  prId: number;
  itemId: number;
  requestedQty: number;
  issuedQty: number | null;
  uom: string;
  status: (typeof purchaseRequestItems.$inferSelect)["status"];
  prStatus: (typeof purchaseRequests.$inferSelect)["status"];
  prNumber: string;
  itemIsActive: boolean;
};

const poSortColumns = {
  id: purchaseOrders.id,
  poNumber: purchaseOrders.poNumber,
  status: purchaseOrders.status,
  createdAt: purchaseOrders.createdAt,
  totalAmountPaise: purchaseOrders.totalAmountPaise,
} as const;

export const poRepository = {
  async list(params: poListQuerySchemaType, actorId: number, today: string) {
    const orderFn = params.sortDir === "desc" ? desc : asc;
    // dueDate is the BR-PO-19 expression; no due date sorts last.
    const dueOrder =
      params.sortDir === "desc"
        ? sql`${poDueSql} desc nulls last`
        : sql`${poDueSql} asc nulls last`;
    const sortExpr =
      params.sortBy === "dueDate"
        ? dueOrder
        : orderFn(
            params.sortBy && params.sortBy in poSortColumns
              ? poSortColumns[params.sortBy as keyof typeof poSortColumns]
              : purchaseOrders.id,
          );

    const searchFilters = [
      safeSearch(params.q, purchaseOrders.poNumber, purchaseOrders.notes),
      params.supplierId
        ? eq(purchaseOrders.supplierId, params.supplierId)
        : undefined,
      // BR-FF-107: "my POs" = created by the caller; narrows the strip too.
      params.mine === true ? eq(purchaseOrders.createdBy, actorId) : undefined,
    ].filter((filter) => filter !== undefined);
    const filters = [
      ...searchFilters,
      params.status && params.status.length > 0
        ? inArray(purchaseOrders.status, params.status)
        : undefined,
      // BR-FF-26: `overdue` is the same predicate as bucket=late (BR-PO-19).
      params.overdue ? poLateSql(today) : undefined,
      params.bucket ? poBucketSql(params.bucket, today) : undefined,
    ].filter((filter) => filter !== undefined);

    const whereClause = filters.length > 0 ? and(...filters) : undefined;
    const countWhere = and(...searchFilters);
    const [rows, [totalRow], countRows, [lateRow]] = await Promise.all([
      db
        .select(purchaseOrderColumns)
        .from(purchaseOrders)
        .where(whereClause)
        .orderBy(sortExpr, asc(purchaseOrders.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(purchaseOrders).where(whereClause),
      // BR-PO-26: rows per status for the same search, whatever status
      // filter is chosen, so the quick filters need no extra call.
      db
        .select({ status: purchaseOrders.status, value: count() })
        .from(purchaseOrders)
        .where(countWhere)
        .groupBy(purchaseOrders.status),
      // BR-FF-26: rows the Late filter returns under the other filters.
      db
        .select({ value: count() })
        .from(purchaseOrders)
        .where(and(countWhere, poLateSql(today))),
    ]);

    const statusCounts = Object.fromEntries(
      poStatusEnum.enumValues.map((status) => [status, 0]),
    ) as Record<poStatusSchemaType, number>;
    for (const row of countRows) statusCounts[row.status] = row.value;

    // PERF-04: line count and received % of the page's POs, one grouped query.
    const ids = rows.map((r) => r.id);
    const aggRows =
      ids.length === 0
        ? []
        : await db
            .select({
              poId: purchaseOrderItems.poId,
              lineCount: count(),
              qty: sql<number>`coalesce(sum(${purchaseOrderItems.qty}), 0)`,
              received: sql<number>`coalesce(sum(coalesce(${purchaseOrderItems.receivedQty}, 0)), 0)`,
            })
            .from(purchaseOrderItems)
            .where(inArray(purchaseOrderItems.poId, ids))
            .groupBy(purchaseOrderItems.poId);
    const aggByPo = new Map(aggRows.map((a) => [a.poId, a]));

    return {
      rows: rows.map((r) => {
        const agg = aggByPo.get(r.id);
        const qty = Number(agg?.qty ?? 0);
        // BR-FF-107: accepted / ordered by qty, whole percent.
        const pct =
          qty > 0 ? Math.round((Number(agg?.received) / qty) * 100) : 0;
        return {
          ...r,
          lineCount: agg?.lineCount ?? 0,
          receivedPct: Math.min(100, Math.max(0, pct)),
        };
      }),
      total: totalRow?.value ?? 0,
      statusCounts,
      lateCount: lateRow?.value ?? 0,
    };
  },

  async findPoById(poId: number, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .select(purchaseOrderColumns)
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))
      .limit(1);

    return row;
  },

  async findSupplierById(supplierId: number, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .select({
        id: supplierMaster.id,
        isActive: supplierMaster.isActive,
        defaultPaymentTermsDays: supplierMaster.defaultPaymentTermsDays,
      })
      .from(supplierMaster)
      .where(eq(supplierMaster.id, supplierId))
      .limit(1);

    return row;
  },

  // Selects the given PR items FOR UPDATE, joined with parent PR status,
  // inside the caller's transaction — prevents a race where two POs are
  // drafted from the same PR line concurrently.
  async findPurchaseRequestItemsByIdsForUpdate(
    ids: number[],
    tx: Tx,
  ): Promise<PrItemForUpdateRow[]> {
    if (ids.length === 0) {
      return [];
    }

    // CRP-2 lock order: parent PR headers first (ascending), then the lines.
    const sortedIds = [...new Set(ids)].sort((a, b) => a - b);
    const owners = await tx
      .selectDistinct({ prId: purchaseRequestItems.prId })
      .from(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.id, sortedIds));
    await prRepository.lockHeadersInOrder(
      owners.map((o) => o.prId),
      tx,
    );

    return tx
      .select({
        id: purchaseRequestItems.id,
        prId: purchaseRequestItems.prId,
        itemId: purchaseRequestItems.itemId,
        requestedQty: purchaseRequestItems.requestedQty,
        issuedQty: purchaseRequestItems.issuedQty,
        uom: purchaseRequestItems.uom,
        status: purchaseRequestItems.status,
        prStatus: purchaseRequests.status,
        prNumber: purchaseRequests.prNumber,
        // BR-INV-05: an inactive item can't go on a new PO line.
        itemIsActive: itemMaster.isActive,
      })
      .from(purchaseRequestItems)
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.prId),
      )
      .innerJoin(itemMaster, eq(itemMaster.id, purchaseRequestItems.itemId))
      .where(inArray(purchaseRequestItems.id, sortedIds))
      .orderBy(asc(purchaseRequestItems.id))
      .for("update", { of: purchaseRequestItems });
  },

  // Unlocked, best-effort read used only for the service-level "friendly"
  // 400 pre-check before a transaction opens. It is NOT the source of truth
  // for the pending/draftable invariant — findPurchaseRequestItemsByIdsForUpdate
  // re-asserts that under the FOR UPDATE lock inside the transaction, and that
  // check is what actually prevents a double-draft race.
  async findPurchaseRequestItemsByIds(ids: number[], tx?: Tx) {
    if (ids.length === 0) {
      return [];
    }

    return (tx ?? db)
      .select({
        id: purchaseRequestItems.id,
        prId: purchaseRequestItems.prId,
        itemId: purchaseRequestItems.itemId,
        requestedQty: purchaseRequestItems.requestedQty,
        issuedQty: purchaseRequestItems.issuedQty,
        uom: purchaseRequestItems.uom,
        status: purchaseRequestItems.status,
        prStatus: purchaseRequests.status,
        prNumber: purchaseRequests.prNumber,
        // BR-INV-05: an inactive item can't go on a new PO line.
        itemIsActive: itemMaster.isActive,
      })
      .from(purchaseRequestItems)
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.prId),
      )
      .innerJoin(itemMaster, eq(itemMaster.id, purchaseRequestItems.itemId))
      .where(inArray(purchaseRequestItems.id, ids));
  },

  // BR-PO-22: read a PO under its row lock; the caller re-checks status on the result.
  async lockPoById(poId: number, tx: Tx) {
    const [row] = await tx
      .select(getTableColumns(purchaseOrders))
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))
      .for("update");
    return row;
  },

  // BR-PO-04 / BR-SUP-16: the supplier's active price-list rows for these items.
  async findActivePriceRows(supplierId: number, itemIds: number[]) {
    if (itemIds.length === 0) {
      return [];
    }
    return db
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

  // #52, #53: the PO create / edit writes. The service owns the transaction
  // and every check; these only read and write, a whole batch per statement.

  async insertPo(data: InsertPoData, tx: Tx) {
    const [row] = await tx
      .insert(purchaseOrders)
      .values({
        ...data,
        status: "draft",
        currentApprovalLevel: 0,
        totalApprovalLevels: 0,
      })
      .returning({ id: purchaseOrders.id });
    return row;
  },

  /**
   * Adds lines to a PO: the PO lines, their PR links, and the PR lines move to
   * po_draft with issuedQty raised by the line qty. Three statements in all.
   */
  async insertPoLines(poId: number, lines: PreparedPoLine[], tx: Tx) {
    if (lines.length === 0) return [];
    const createdItems = await tx
      .insert(purchaseOrderItems)
      .values(
        lines.map((line) => ({
          poId,
          itemId: line.itemId,
          qty: line.qty,
          unitPricePaise: line.unitPricePaise,
          uom: line.uom,
          gstPercent: line.gstPercent,
          lineValuePaise: line.lineValuePaise,
          lineTaxPaise: line.lineTaxPaise,
          quoteItemId: line.quoteItemId,
          contractItemId: line.contractItemId,
          contractRatePaise: line.contractRatePaise,
          rateOverrideReason: line.rateOverrideReason,
          rateOverrideBy: line.rateOverrideBy,
          rateOverrideAt: line.rateOverrideAt,
        })),
      )
      .returning(purchaseOrderItemWriteColumns);
    if (createdItems.length !== lines.length) return undefined;

    await tx.insert(prPoItemLinks).values(
      createdItems.map((createdItem, index) => ({
        prItemId: (lines[index] as PreparedPoLine).prItemId,
        poItemId: createdItem.id,
        linkedQty: (lines[index] as PreparedPoLine).qty,
      })),
    );

    const addBack = sql.join(
      lines.map(
        (line) => sql`when ${line.prItemId} then ${line.qty}::double precision`,
      ),
      sql` `,
    );
    await tx
      .update(purchaseRequestItems)
      .set({
        issuedQty: sql`coalesce(${purchaseRequestItems.issuedQty}, 0) + (case ${purchaseRequestItems.id} ${addBack} else 0 end)`,
        status: "po_draft",
      })
      .where(
        inArray(
          purchaseRequestItems.id,
          lines.map((line) => line.prItemId),
        ),
      );

    return createdItems;
  },

  // PR links of these lines of one PO, with the PR each PR line belongs to.
  async findLinksByPoItemIds(poId: number, poItemIds: number[], tx: Tx) {
    if (poItemIds.length === 0) return [];
    return tx
      .select({
        poItemId: prPoItemLinks.poItemId,
        prItemId: prPoItemLinks.prItemId,
        linkedQty: prPoItemLinks.linkedQty,
        prId: purchaseRequestItems.prId,
      })
      .from(prPoItemLinks)
      .innerJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, prPoItemLinks.poItemId),
      )
      .innerJoin(
        purchaseRequestItems,
        eq(purchaseRequestItems.id, prPoItemLinks.prItemId),
      )
      .where(
        and(
          inArray(prPoItemLinks.poItemId, poItemIds),
          eq(purchaseOrderItems.poId, poId),
        ),
      );
  },

  /**
   * BR-PR-31: lines removed from a draft PO. Their PR lines go back to pending
   * (issuedQty lowered by the linked qty), the links and the PO lines are
   * deleted. Returns the ids of the PO lines that were deleted.
   */
  async removePoLines(
    poId: number,
    poItemIds: number[],
    links: {
      poItemId: number | null;
      prItemId: number | null;
      linkedQty: number;
    }[],
    tx: Tx,
  ) {
    if (poItemIds.length === 0) return [];
    const prLinks = links.filter(
      (
        link,
      ): link is { poItemId: number; prItemId: number; linkedQty: number } =>
        link.prItemId != null && link.poItemId != null,
    );
    if (prLinks.length > 0) {
      const giveBack = sql.join(
        prLinks.map(
          (link) =>
            sql`when ${link.prItemId} then ${link.linkedQty}::double precision`,
        ),
        sql` `,
      );
      await tx
        .update(purchaseRequestItems)
        .set({
          issuedQty: sql`greatest(${purchaseRequestItems.issuedQty} - (case ${purchaseRequestItems.id} ${giveBack} else 0 end), 0)`,
          status: "pending",
        })
        .where(
          inArray(
            purchaseRequestItems.id,
            prLinks.map((link) => link.prItemId),
          ),
        );
      await tx.delete(prPoItemLinks).where(
        inArray(
          prPoItemLinks.poItemId,
          prLinks.map((link) => link.poItemId),
        ),
      );
    }
    const deleted = await tx
      .delete(purchaseOrderItems)
      .where(
        and(
          eq(purchaseOrderItems.poId, poId),
          inArray(purchaseOrderItems.id, poItemIds),
        ),
      )
      .returning({ id: purchaseOrderItems.id });
    return deleted.map((row) => row.id);
  },

  // New rate, GST % and line amounts for several lines of one PO, one UPDATE.
  async updatePoLinePrices(poId: number, rows: PoLinePriceData[], tx: Tx) {
    if (rows.length === 0) return [];
    const caseOf = (
      pick: (row: PoLinePriceData) => number,
      column: AnyColumn,
      cast: string,
    ) =>
      sql`case ${purchaseOrderItems.id} ${sql.join(
        rows.map(
          (row) => sql`when ${row.id} then ${pick(row)}::${sql.raw(cast)}`,
        ),
        sql` `,
      )} else ${column} end`;
    const updated = await tx
      .update(purchaseOrderItems)
      .set({
        unitPricePaise: caseOf(
          (row) => row.unitPricePaise,
          purchaseOrderItems.unitPricePaise,
          "bigint",
        ),
        gstPercent: caseOf(
          (row) => row.gstPercent,
          purchaseOrderItems.gstPercent,
          "double precision",
        ),
        lineValuePaise: caseOf(
          (row) => row.lineValuePaise,
          purchaseOrderItems.lineValuePaise,
          "bigint",
        ),
        lineTaxPaise: caseOf(
          (row) => row.lineTaxPaise,
          purchaseOrderItems.lineTaxPaise,
          "bigint",
        ),
      })
      .where(
        and(
          eq(purchaseOrderItems.poId, poId),
          inArray(
            purchaseOrderItems.id,
            rows.map((row) => row.id),
          ),
        ),
      )
      .returning(purchaseOrderItemWriteColumns);
    // BR-RFQ-50, 51, 54: contract link / override audit changes line by line
    // (only lines whose links actually changed are written).
    const linkChanged = rows.filter((row) => {
      const before = updated.find((u) => u.id === row.id);
      return (
        before &&
        (before.contractItemId !== row.links.contractItemId ||
          before.contractRatePaise !== row.links.contractRatePaise ||
          before.rateOverrideReason !== row.links.rateOverrideReason ||
          before.rateOverrideBy !== row.links.rateOverrideBy ||
          before.rateOverrideAt?.getTime() !==
            row.links.rateOverrideAt?.getTime())
      );
    });
    for (const row of linkChanged) {
      await tx
        .update(purchaseOrderItems)
        .set({
          contractItemId: row.links.contractItemId,
          contractRatePaise: row.links.contractRatePaise,
          rateOverrideReason: row.links.rateOverrideReason,
          rateOverrideBy: row.links.rateOverrideBy,
          rateOverrideAt: row.links.rateOverrideAt,
        })
        .where(eq(purchaseOrderItems.id, row.id));
    }
    if (linkChanged.length === 0) return updated;
    return this.findPoItemsByIds(
      poId,
      rows.map((row) => row.id),
      tx,
    );
  },

  async findPoItemsByIds(poId: number, ids: number[], tx: Tx) {
    if (ids.length === 0) return [];
    return tx
      .select(purchaseOrderItemWriteColumns)
      .from(purchaseOrderItems)
      .where(
        and(
          eq(purchaseOrderItems.poId, poId),
          inArray(purchaseOrderItems.id, ids),
        ),
      )
      .orderBy(asc(purchaseOrderItems.id));
  },

  // BR-RFQ-02: PR lines that sit on an RFQ that is still open (draft / sent / partially_awarded).
  async findOpenRfqForPrItems(prItemIds: number[], executor: Tx | typeof db) {
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
        ),
      );
  },

  /**
   * #53, BR-INV-24, BR-RFQ-50 for many items at once: the default rate per item
   * for this supplier from the one shared chain (rateChainRepository, also used
   * by assetRepository.getLastRate): usable contract first, then newest
   * approved-or-later PO line, catalog price, average cost, standard rate.
   * Unknown items are left out.
   */
  async findLastRates(
    supplierId: number,
    itemIds: number[],
    opts: {
      onDate?: string;
      includeContract?: boolean;
      includeFallback?: boolean;
    } = {},
    tx?: Tx,
  ) {
    return findRateChoices(tx ?? db, supplierId, itemIds, {
      onDate: opts.onDate ?? istDayKey(),
      includeContract: opts.includeContract ?? true,
      includeFallback: opts.includeFallback ?? true,
    });
  },

  async findPoItemsByPoId(poId: number, tx?: Tx) {
    const executor = tx ?? db;
    return executor
      .select(purchaseOrderItemWriteColumns)
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.poId, poId))
      .orderBy(asc(purchaseOrderItems.id));
  },

  async updatePoById(poId: number, data: UpdatePoData, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .update(purchaseOrders)
      .set(data)
      .where(eq(purchaseOrders.id, poId))
      .returning(purchaseOrderColumns);

    return row;
  },

  async getDetails(poId: number) {
    const [poRows, items] = await Promise.all([
      db
        .select(purchaseOrderColumns)
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId))
        .limit(1),
      db
        .select({
          ...purchaseOrderItemDetailColumns,
          // BR-FF-09: arrived and pending QA / still open.
          pendingQaQty: pendingQaQtySql.mapWith(Number),
          openQty: openQtySql.mapWith(Number),
        })
        .from(purchaseOrderItems)
        .innerJoin(itemMaster, eq(itemMaster.id, purchaseOrderItems.itemId))
        .leftJoin(
          prPoItemLinks,
          eq(prPoItemLinks.poItemId, purchaseOrderItems.id),
        )
        .leftJoin(
          purchaseRequestItems,
          eq(purchaseRequestItems.id, prPoItemLinks.prItemId),
        )
        .leftJoin(
          purchaseRequests,
          eq(purchaseRequests.id, purchaseRequestItems.prId),
        )
        .leftJoin(
          rateContractItems,
          eq(rateContractItems.id, purchaseOrderItems.contractItemId),
        )
        .leftJoin(
          rateContracts,
          eq(rateContracts.id, rateContractItems.contractId),
        )
        .leftJoin(
          rfqQuoteItems,
          eq(rfqQuoteItems.id, purchaseOrderItems.quoteItemId),
        )
        .leftJoin(rfqQuotes, eq(rfqQuotes.id, rfqQuoteItems.quoteId))
        .leftJoin(
          overrideEmployee,
          eq(overrideEmployee.id, purchaseOrderItems.rateOverrideBy),
        )
        .where(eq(purchaseOrderItems.poId, poId))
        .orderBy(asc(purchaseOrderItems.id)),
    ]);

    const po = poRows[0];

    if (!po) {
      return undefined;
    }

    // BR-PRT-38: the PO's returns for its document flow
    const returns = await db
      .select({
        id: purchaseReturns.id,
        proNumber: purchaseReturns.proNumber,
        status: purchaseReturns.status,
      })
      .from(purchaseReturns)
      .where(eq(purchaseReturns.poId, poId))
      .orderBy(desc(purchaseReturns.id));

    return {
      po,
      items: items.map((item) => ({
        ...item,
        pendingQaQty: round3(item.pendingQaQty),
        // Over-receipt never shows a negative open qty.
        openQty: Math.max(0, round3(item.openQty)),
      })),
      returns,
    };
  },

  async hasGrnForPo(poId: number, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .select({ id: grns.id })
      .from(grns)
      .where(eq(grns.poId, poId))
      .limit(1);

    return row !== undefined;
  },

  // PR lines behind a PO, with their parent PR (BR-PR-30..32). Locks the PR
  // headers first, then the lines (CRP-2), so callers that go on to change
  // lines and recompute headers cannot deadlock with a PR-side action.
  async listLinkedPrLines(poId: number, tx: Tx) {
    const linkQuery = () =>
      tx
        .select({
          prItemId: prPoItemLinks.prItemId,
          linkedQty: prPoItemLinks.linkedQty,
          prId: purchaseRequestItems.prId,
          status: purchaseRequestItems.status,
        })
        .from(prPoItemLinks)
        .innerJoin(
          purchaseOrderItems,
          eq(purchaseOrderItems.id, prPoItemLinks.poItemId),
        )
        .innerJoin(
          purchaseRequestItems,
          eq(purchaseRequestItems.id, prPoItemLinks.prItemId),
        )
        .where(eq(purchaseOrderItems.poId, poId));

    const preview = await linkQuery();
    if (preview.length === 0) {
      return preview;
    }
    await prRepository.lockHeadersInOrder(
      preview.map((row) => row.prId),
      tx,
    );
    return linkQuery()
      .orderBy(asc(purchaseRequestItems.id))
      .for("update", { of: purchaseRequestItems });
  },

  // BR-PR-30: the PO is approved -> its po_draft PR lines become ordered.
  async orderPrLinesOfPo(poId: number, tx: Tx) {
    const lines = await this.listLinkedPrLines(poId, tx);
    const ids = lines
      .filter((l) => l.status === "po_draft" && l.prItemId != null)
      .map((l) => l.prItemId as number);
    if (ids.length === 0) {
      return;
    }
    await tx
      .update(purchaseRequestItems)
      .set({ status: "ordered" })
      .where(inArray(purchaseRequestItems.id, ids));
  },

  // BR-PR-31: PO cancelled or rejected -> its live PR lines are cancelled for
  // good, issuedQty drops by the linked qty, PR headers recomputed (BR-PR-36).
  async cancelPrLinesOfPo(poId: number, tx: Tx) {
    const lines = (await this.listLinkedPrLines(poId, tx)).filter(
      (line) =>
        line.prItemId != null &&
        (line.status === "po_draft" || line.status === "ordered"),
    );
    if (lines.length === 0) {
      return;
    }
    // One UPDATE for all lines (PERF-04); each line gives back its own linked qty.
    const giveBack = sql.join(
      lines.map(
        (line) =>
          sql`when ${line.prItemId} then ${line.linkedQty}::double precision`,
      ),
      sql` `,
    );
    await tx
      .update(purchaseRequestItems)
      .set({
        status: "cancelled",
        issuedQty: sql`greatest(${purchaseRequestItems.issuedQty} - (case ${purchaseRequestItems.id} ${giveBack} else 0 end), 0)`,
      })
      .where(
        inArray(
          purchaseRequestItems.id,
          lines.map((line) => line.prItemId as number),
        ),
      );
    for (const prId of [...new Set(lines.map((line) => line.prId))].sort(
      (a, b) => a - b,
    )) {
      await prRepository.recomputeHeaderStatusFromItems(prId, tx);
    }
  },

  // BR-PR-32: PO short-closed -> its ordered PR lines are closed; issuedQty stays.
  async closePrLinesOfPo(poId: number, tx: Tx) {
    const lines = (await this.listLinkedPrLines(poId, tx)).filter(
      (line) =>
        line.prItemId != null &&
        (line.status === "ordered" || line.status === "po_draft"),
    );
    if (lines.length === 0) {
      return;
    }
    await tx
      .update(purchaseRequestItems)
      .set({ status: "closed" })
      .where(
        inArray(
          purchaseRequestItems.id,
          lines.map((line) => line.prItemId as number),
        ),
      );
    for (const prId of [...new Set(lines.map((line) => line.prId))].sort(
      (a, b) => a - b,
    )) {
      await prRepository.recomputeHeaderStatusFromItems(prId, tx);
    }
  },

  // BR-PO-11, 21: the one place a PO becomes cancelled (user cancel, approval
  // reject, approval cancel). The caller holds the PO row lock.
  async cancelLockedPo(
    poId: number,
    input: { actorId: number; reason: string },
    tx: Tx,
  ) {
    const row = await this.updatePoById(
      poId,
      {
        status: "cancelled",
        cancelledBy: input.actorId,
        cancelledAt: new Date(),
        cancelReason: input.reason,
      },
      tx,
    );
    await this.cancelPrLinesOfPo(poId, tx);
    return row;
  },

  async setStatus(
    poId: number,
    status: poStatusSchemaType,
    tx?: Tx,
    extra: UpdatePoData = {},
  ) {
    return this.updatePoById(poId, { ...extra, status }, tx);
  },

  async insertCommunication(
    data: {
      poId: number;
      type: "po_sent" | "reminder" | "escalation" | "confirmation";
      channel: "email" | "whatsapp" | "phone" | "in_person";
      toEmail?: string | null;
      note?: string | null;
      sentBy: number;
    },
    tx?: Tx,
  ) {
    const executor = tx ?? db;
    const [row] = await executor
      .insert(poCommunications)
      .values({
        poId: data.poId,
        type: data.type,
        channel: data.channel,
        toEmail: data.toEmail ?? null,
        note: data.note ?? null,
        sentBy: data.sentBy,
      })
      .returning();

    return row;
  },

  // BR-PO-21: the PO log with who sent it, newest first.
  async listCommunications(poId: number) {
    return db
      .select({
        ...getTableColumns(poCommunications),
        sentByName: employees.name,
      })
      .from(poCommunications)
      .leftJoin(employees, eq(employees.id, poCommunications.sentBy))
      .where(eq(poCommunications.poId, poId))
      .orderBy(desc(poCommunications.sentAt), desc(poCommunications.id));
  },

  // Used by grnService's PO rollup after a GRN line posts. qty/receivedQty
  // per line, unlocked read — the caller (grnService) already holds the
  // relevant GRN-line invariant; this is a plain status recompute, not a
  // race-sensitive allocation like PO create.
  async findPoItemQuantitiesByPoId(poId: number, tx?: Tx) {
    const executor = tx ?? db;
    return executor
      .select({
        id: purchaseOrderItems.id,
        qty: purchaseOrderItems.qty,
        receivedQty: purchaseOrderItems.receivedQty,
      })
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.poId, poId));
  },

  async incrementPoItemReceivedQty(
    poItemId: number,
    deltaQty: number,
    tx?: Tx,
  ) {
    const executor = tx ?? db;
    const [row] = await executor
      .update(purchaseOrderItems)
      .set({
        receivedQty: sql`coalesce(${purchaseOrderItems.receivedQty}, 0) + ${deltaQty}`,
      })
      .where(eq(purchaseOrderItems.id, poItemId))
      .returning(purchaseOrderItemWriteColumns);

    return row;
  },
};
