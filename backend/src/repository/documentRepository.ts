import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  approvalRequests,
  approvalTrails,
} from "../db/schemas/02_procurement-approval";
import {
  grnCorrections,
  grnItems,
  grns,
  poCommunications,
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  qaTests,
} from "../db/schemas/02_procurement-purchasing";
import { employees } from "../db/schemas/03_hcm";

/** BR-FF-54: every history source is cut at this many rows, newest first. */
export const HISTORY_SOURCE_LIMIT = 200;

export type DocumentType = "pr" | "po" | "grn";

/** One raw history row; the service turns `kind` into the event name. */
export type RawHistoryRow = {
  at: Date;
  byName: string | null;
  kind: string;
  note: string | null;
};

export type LinkedRow = {
  docType: "pr" | "po" | "grn";
  id: number;
  number: string;
  status: string;
};

export type GrnLinkedRow = LinkedRow & {
  qaStatuses: (string | null)[];
};

function nonNullAt<T extends { at: Date | null }>(
  rows: T[],
): (T & { at: Date })[] {
  return rows.filter((row): row is T & { at: Date } => row.at !== null);
}

export const documentRepository = {
  async findPrHeader(id: number) {
    const [row] = await db
      .select({
        id: purchaseRequests.id,
        number: purchaseRequests.prNumber,
        status: purchaseRequests.status,
        estimatedAmountPaise: purchaseRequests.estimatedAmountPaise,
        requestedBy: purchaseRequests.requestedBy,
        createdAt: purchaseRequests.createdAt,
        cancelledAt: purchaseRequests.cancelledAt,
        cancelReason: purchaseRequests.cancelReason,
        cancelledByName: employees.name,
      })
      .from(purchaseRequests)
      .leftJoin(employees, eq(employees.id, purchaseRequests.cancelledBy))
      .where(eq(purchaseRequests.id, id))
      .limit(1);
    return row;
  },

  async countPrLines(prId: number) {
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.prId, prId));
    return row?.value ?? 0;
  },

  async findPoHeader(id: number) {
    const [row] = await db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.poNumber,
        status: purchaseOrders.status,
        subtotalPaise: purchaseOrders.subtotalPaise,
        taxAmountPaise: purchaseOrders.taxAmountPaise,
        totalAmountPaise: purchaseOrders.totalAmountPaise,
        createdBy: purchaseOrders.createdBy,
        createdAt: purchaseOrders.createdAt,
        cancelledAt: purchaseOrders.cancelledAt,
        cancelReason: purchaseOrders.cancelReason,
        invoicedAt: purchaseOrders.invoicedAt,
        closedAt: purchaseOrders.closedAt,
        closeNote: purchaseOrders.closeNote,
        shortClosed: purchaseOrders.shortClosed,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1);
    return row;
  },

  /** Ordered and received quantity of a PO (received % by qty, BR-FF-51). */
  async sumPoQty(poId: number) {
    const [row] = await db
      .select({
        ordered: sql<number>`coalesce(sum(${purchaseOrderItems.qty}), 0)::float8`,
        received: sql<number>`coalesce(sum(${purchaseOrderItems.receivedQty}), 0)::float8`,
      })
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.poId, poId));
    return { ordered: row?.ordered ?? 0, received: row?.received ?? 0 };
  },

  async findGrnHeader(id: number) {
    const [row] = await db
      .select({
        id: grns.id,
        number: grns.grnNumber,
        status: grns.status,
        poId: grns.poId,
        createdBy: grns.createdBy,
        createdAt: grns.receivedDate,
      })
      .from(grns)
      .where(eq(grns.id, id))
      .limit(1);
    return row;
  },

  /** GRN lines with the PO line's unit (BR-FF-51: per unit, never money). */
  async listGrnLineQuantities(grnId: number) {
    return db
      .select({
        receivedQty: grnItems.receivedQty,
        acceptedQty: grnItems.acceptedQty,
        rejectedQty: grnItems.rejectedQty,
        qaStatus: grnItems.qaStatus,
        uom: purchaseOrderItems.uom,
      })
      .from(grnItems)
      .leftJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, grnItems.poItemId),
      )
      .where(eq(grnItems.grnId, grnId))
      .orderBy(grnItems.id);
  },

  // --- Linked documents (BR-FF-42), numbers and statuses only ---

  /** PR → its POs; the PO's PRs go the other way. */
  async listPosOfPr(prId: number): Promise<LinkedRow[]> {
    const rows = await db
      .selectDistinct({
        id: purchaseOrders.id,
        number: purchaseOrders.poNumber,
        status: purchaseOrders.status,
      })
      .from(purchaseRequestItems)
      .innerJoin(
        prPoItemLinks,
        eq(prPoItemLinks.prItemId, purchaseRequestItems.id),
      )
      .innerJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, prPoItemLinks.poItemId),
      )
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.poId))
      .where(eq(purchaseRequestItems.prId, prId))
      .orderBy(purchaseOrders.id);
    return rows.map((row) => ({ docType: "po" as const, ...row }));
  },

  async listPrsOfPo(poId: number): Promise<LinkedRow[]> {
    const rows = await db
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
      .orderBy(purchaseRequests.id);
    return rows.map((row) => ({ docType: "pr" as const, ...row }));
  },

  async findPoLink(poId: number): Promise<LinkedRow | undefined> {
    const [row] = await db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.poNumber,
        status: purchaseOrders.status,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))
      .limit(1);
    return row ? { docType: "po", ...row } : undefined;
  },

  /** A PO's GRNs with their line QA statuses (two queries, never per GRN). */
  async listGrnsOfPo(poId: number): Promise<GrnLinkedRow[]> {
    const grnRows = await db
      .select({
        id: grns.id,
        number: grns.grnNumber,
        status: grns.status,
      })
      .from(grns)
      .where(eq(grns.poId, poId))
      .orderBy(grns.id);
    if (grnRows.length === 0) {
      return [];
    }
    const lineRows = await db
      .select({ grnId: grnItems.grnId, qaStatus: grnItems.qaStatus })
      .from(grnItems)
      .where(
        inArray(
          grnItems.grnId,
          grnRows.map((row) => row.id),
        ),
      );
    return grnRows.map((row) => ({
      docType: "grn" as const,
      ...row,
      qaStatuses: lineRows
        .filter((line) => line.grnId === row.id)
        .map((line) => line.qaStatus),
    }));
  },

  // --- History sources (BR-FF-54): each newest first, limit 200 ---

  /** `requestId` narrows to one request (via-approval readers see the latest only). */
  async listTrailEvents(
    docType: "pr" | "po",
    docId: number,
    requestId?: number,
  ): Promise<RawHistoryRow[]> {
    const rows = await db
      .select({
        at: approvalTrails.actionAt,
        byName: employees.name,
        kind: approvalTrails.action,
        note: approvalTrails.notes,
      })
      .from(approvalTrails)
      .leftJoin(employees, eq(employees.id, approvalTrails.actionBy))
      .where(
        and(
          inArray(
            approvalTrails.requestId,
            db
              .select({ id: approvalRequests.id })
              .from(approvalRequests)
              .where(
                and(
                  eq(approvalRequests.docType, docType),
                  eq(approvalRequests.docId, docId),
                ),
              ),
          ),
          requestId !== undefined
            ? eq(approvalTrails.requestId, requestId)
            : undefined,
        ),
      )
      .orderBy(desc(approvalTrails.actionAt), desc(approvalTrails.id))
      .limit(HISTORY_SOURCE_LIMIT);
    return nonNullAt(rows);
  },

  async findEmployeeName(employeeId: number | null) {
    if (employeeId === null) {
      return null;
    }
    const [row] = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    return row?.name ?? null;
  },

  async listPrLineCancelEvents(prId: number): Promise<RawHistoryRow[]> {
    const rows = await db
      .select({
        at: purchaseRequestItems.cancelledAt,
        byName: employees.name,
        kind: sql<string>`'line_cancelled'`,
        note: purchaseRequestItems.cancelReason,
      })
      .from(purchaseRequestItems)
      .leftJoin(employees, eq(employees.id, purchaseRequestItems.cancelledBy))
      .where(
        and(
          eq(purchaseRequestItems.prId, prId),
          isNotNull(purchaseRequestItems.cancelledAt),
        ),
      )
      .orderBy(desc(purchaseRequestItems.cancelledAt))
      .limit(HISTORY_SOURCE_LIMIT);
    return nonNullAt(rows);
  },

  async listPoCommunicationEvents(poId: number): Promise<RawHistoryRow[]> {
    return db
      .select({
        at: poCommunications.sentAt,
        byName: employees.name,
        kind: sql<string>`'comm_' || ${poCommunications.type}`,
        note: poCommunications.note,
      })
      .from(poCommunications)
      .leftJoin(employees, eq(employees.id, poCommunications.sentBy))
      .where(eq(poCommunications.poId, poId))
      .orderBy(desc(poCommunications.sentAt), desc(poCommunications.id))
      .limit(HISTORY_SOURCE_LIMIT);
  },

  /** PO invoiced / closed / cancelled stamps carry their own who columns. */
  async findPoStampNames(poId: number) {
    const [row] = await db
      .select({
        createdByName: sql<
          string | null
        >`(select name from employees e where e.id = ${purchaseOrders.createdBy})`,
        invoicedByName: sql<
          string | null
        >`(select name from employees e where e.id = ${purchaseOrders.invoicedBy})`,
        closedByName: sql<
          string | null
        >`(select name from employees e where e.id = ${purchaseOrders.closedBy})`,
        cancelledByName: sql<
          string | null
        >`(select name from employees e where e.id = ${purchaseOrders.cancelledBy})`,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))
      .limit(1);
    return row;
  },

  async listQaEvents(grnId: number): Promise<RawHistoryRow[]> {
    const rows = await db
      .select({
        at: qaTests.testedAt,
        byName: employees.name,
        kind: sql<string>`'qa_' || ${qaTests.status}`,
        note: qaTests.notes,
      })
      .from(qaTests)
      .innerJoin(grnItems, eq(grnItems.id, qaTests.grnItemId))
      .leftJoin(employees, eq(employees.id, qaTests.testedBy))
      .where(and(eq(grnItems.grnId, grnId), isNotNull(qaTests.testedAt)))
      .orderBy(desc(qaTests.testedAt))
      .limit(HISTORY_SOURCE_LIMIT);
    return nonNullAt(rows);
  },

  async listBypassEvents(grnId: number): Promise<RawHistoryRow[]> {
    const rows = await db
      .select({
        at: grnItems.qaBypassedAt,
        byName: employees.name,
        kind: sql<string>`'qa_bypass'`,
        note: grnItems.qaBypassReason,
      })
      .from(grnItems)
      .leftJoin(employees, eq(employees.id, grnItems.qaBypassedBy))
      .where(and(eq(grnItems.grnId, grnId), isNotNull(grnItems.qaBypassedAt)))
      .orderBy(desc(grnItems.qaBypassedAt))
      .limit(HISTORY_SOURCE_LIMIT);
    return nonNullAt(rows);
  },

  async listCorrectionEvents(grnId: number): Promise<RawHistoryRow[]> {
    return db
      .select({
        at: grnCorrections.createdAt,
        byName: employees.name,
        kind: sql<string>`'correction'`,
        note: grnCorrections.reason,
      })
      .from(grnCorrections)
      .innerJoin(grnItems, eq(grnItems.id, grnCorrections.grnItemId))
      .leftJoin(employees, eq(employees.id, grnCorrections.createdBy))
      .where(eq(grnItems.grnId, grnId))
      .orderBy(desc(grnCorrections.createdAt))
      .limit(HISTORY_SOURCE_LIMIT);
  },
};
