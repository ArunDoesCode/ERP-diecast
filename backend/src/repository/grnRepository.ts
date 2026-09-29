import { and, asc, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";

import { db } from "../db/client";
import { itemMaster, locations } from "../db/schemas/02_procurement-catalog";
import {
  grnCorrections,
  grnItems,
  grns,
  purchaseOrderItems,
  purchaseOrders,
  qaTests,
} from "../db/schemas/02_procurement-purchasing";
import { allocateDocumentSequence } from "../lib/document-number";
import { NotFoundError } from "../lib/errors";
import type { grnListQuerySchemaType } from "../types/grn.types";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const grnColumns = {
  id: grns.id,
  grnNumber: grns.grnNumber,
  poId: grns.poId,
  supplierId: grns.supplierId,
  status: grns.status,
  receivedDate: grns.receivedDate,
  createdBy: grns.createdBy,
  challanNo: grns.challanNo,
  challanDate: grns.challanDate,
  vehicleNo: grns.vehicleNo,
  driverName: grns.driverName,
  driverPhone: grns.driverPhone,
  remarks: grns.remarks,
};

const grnItemColumns = {
  id: grnItems.id,
  grnId: grnItems.grnId,
  poItemId: grnItems.poItemId,
  receivedQty: grnItems.receivedQty,
  acceptedQty: grnItems.acceptedQty,
  rejectedQty: grnItems.rejectedQty,
  qaStatus: grnItems.qaStatus,
  isQaBypassed: grnItems.isQaBypassed,
  qaBypassReason: grnItems.qaBypassReason,
  qaBypassedBy: grnItems.qaBypassedBy,
  challanPhotoUrl: grnItems.challanPhotoUrl,
  batchNumber: grnItems.batchNumber,
};

const grnItemDetailColumns = {
  ...grnItemColumns,
  itemId: purchaseOrderItems.itemId,
  itemSku: itemMaster.sku,
  itemName: itemMaster.name,
  orderedQty: purchaseOrderItems.qty,
};

const grnSortColumns = {
  id: grns.id,
  grnNumber: grns.grnNumber,
  status: grns.status,
  receivedDate: grns.receivedDate,
} as const;

type GrnHeaderInsert = typeof grns.$inferInsert;
export type CreateGrnData = Pick<
  GrnHeaderInsert,
  | "poId"
  | "supplierId"
  | "createdBy"
  | "challanNo"
  | "challanDate"
  | "vehicleNo"
  | "driverName"
  | "driverPhone"
  | "remarks"
>;

export type CreateGrnLineData = {
  poItemId: number;
  arrivedQty: number;
  batchNumber?: string | null;
};

export type UpdateGrnHeaderData = Partial<
  Pick<
    GrnHeaderInsert,
    | "challanNo"
    | "challanDate"
    | "vehicleNo"
    | "driverName"
    | "driverPhone"
    | "remarks"
  >
>;

export const grnRepository = {
  // Lets grnService compose grnItems/purchaseOrderItems/PO-rollup/GRN-header
  // writes in a single transaction after a QA action or bypass — the
  // transaction itself is opened here (repository-only DB access), the
  // orchestration logic runs in the callback the service passes in.
  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(fn);
  },

  // GRN header has no locationId column (deliberate — see build plan).
  // Every GRN posts to the first `main_store` location; throws if none is
  // configured rather than silently defaulting to null.
  async findDefaultReceivingLocationId(tx?: Tx) {
    const [row] = await (tx ?? db)
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.type, "main_store"))
      .orderBy(asc(locations.id))
      .limit(1);

    if (!row) {
      throw new NotFoundError(
        "No main_store location configured — cannot post GRN receipts to inventory.",
      );
    }

    return row.id;
  },

  async findPoForGrn(poId: number) {
    const [row] = await db
      .select({
        id: purchaseOrders.id,
        supplierId: purchaseOrders.supplierId,
        status: purchaseOrders.status,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))
      .limit(1);

    return row;
  },

  async findPoItemsByIds(poId: number, poItemIds: number[]) {
    if (poItemIds.length === 0) {
      return [];
    }

    return db
      .select({
        id: purchaseOrderItems.id,
        poId: purchaseOrderItems.poId,
        itemId: purchaseOrderItems.itemId,
        qty: purchaseOrderItems.qty,
        receivedQty: purchaseOrderItems.receivedQty,
      })
      .from(purchaseOrderItems)
      .where(
        and(
          eq(purchaseOrderItems.poId, poId),
          inArray(purchaseOrderItems.id, poItemIds),
        ),
      );
  },

  async createWithItems(data: CreateGrnData, lines: CreateGrnLineData[]) {
    return db.transaction(async (tx) => {
      const { periodKey, seq } = await allocateDocumentSequence(
        tx,
        "grn",
        data.createdBy ?? 0,
      );
      const grnNumber = `GRN-${periodKey}-${seq}`;

      const [createdGrn] = await tx
        .insert(grns)
        .values({
          grnNumber,
          poId: data.poId,
          supplierId: data.supplierId,
          status: "draft",
          createdBy: data.createdBy,
          challanNo: data.challanNo ?? null,
          challanDate: data.challanDate ?? null,
          vehicleNo: data.vehicleNo ?? null,
          driverName: data.driverName ?? null,
          driverPhone: data.driverPhone ?? null,
          remarks: data.remarks ?? null,
        })
        .returning(grnColumns);

      if (!createdGrn) {
        throw new NotFoundError("Failed to create GRN");
      }

      const createdItems = await tx
        .insert(grnItems)
        .values(
          lines.map((line) => ({
            grnId: createdGrn.id,
            poItemId: line.poItemId,
            receivedQty: line.arrivedQty,
            batchNumber: line.batchNumber ?? null,
            acceptedQty: 0,
            rejectedQty: 0,
            qaStatus: "pending",
          })),
        )
        .returning(grnItemColumns);

      return { grn: createdGrn, items: createdItems };
    });
  },

  async findGrnById(grnId: number, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .select(grnColumns)
      .from(grns)
      .where(eq(grns.id, grnId))
      .limit(1);

    return row;
  },

  async findGrnItemsByGrnId(grnId: number, tx?: Tx) {
    const executor = tx ?? db;
    return executor
      .select(grnItemColumns)
      .from(grnItems)
      .where(eq(grnItems.grnId, grnId));
  },

  // Scoped by grnId (joined via WHERE) so a line belonging to a different
  // GRN can never be read/mutated by a request targeting this GRN.
  // With `tx`, the line and its PO line are row-locked (FOR UPDATE) so one
  // decision per line and the PO received-qty check are race-free.
  async findGrnItemForUpdate(grnId: number, lineId: number, tx?: Tx) {
    const executor = tx ?? db;
    const query = executor
      .select({
        ...grnItemColumns,
        poId: purchaseOrderItems.poId,
        itemId: purchaseOrderItems.itemId,
        unitPricePaise: purchaseOrderItems.unitPricePaise,
        orderedQty: purchaseOrderItems.qty,
        poItemReceivedQty: purchaseOrderItems.receivedQty,
      })
      .from(grnItems)
      .innerJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, grnItems.poItemId),
      )
      .where(and(eq(grnItems.id, lineId), eq(grnItems.grnId, grnId)))
      .limit(1);

    const [row] = tx ? await query.for("update") : await query;
    return row;
  },

  async insertCorrection(
    data: { grnItemId: number; qty: number; reason: string; createdBy: number },
    tx: Tx,
  ) {
    const [row] = await tx.insert(grnCorrections).values(data).returning();
    return row;
  },

  async updateGrnItemLine(
    lineId: number,
    data: Partial<{
      receivedQty: number;
      acceptedQty: number;
      rejectedQty: number;
      qaStatus: string;
      isQaBypassed: boolean;
      qaBypassReason: string | null;
      qaBypassedBy: number | null;
      batchNumber: string | null;
    }>,
    tx?: Tx,
  ) {
    const executor = tx ?? db;
    const [row] = await executor
      .update(grnItems)
      .set(data)
      .where(eq(grnItems.id, lineId))
      .returning(grnItemColumns);

    return row;
  },

  async insertQaTest(
    data: {
      grnItemId: number;
      status: "passed" | "failed";
      testReportUrl?: string | null;
      notes?: string | null;
      testedBy: number;
    },
    tx?: Tx,
  ) {
    const executor = tx ?? db;
    const [row] = await executor
      .insert(qaTests)
      .values({
        grnItemId: data.grnItemId,
        type: "internal",
        status: data.status,
        testReportUrl: data.testReportUrl ?? null,
        notes: data.notes ?? null,
        testedBy: data.testedBy,
        testedAt: new Date(),
      })
      .returning();

    return row;
  },

  async setGrnStatus(
    grnId: number,
    status: (typeof grns.$inferInsert)["status"],
    tx?: Tx,
  ) {
    const executor = tx ?? db;
    const [row] = await executor
      .update(grns)
      .set({ status })
      .where(eq(grns.id, grnId))
      .returning(grnColumns);

    return row;
  },

  async updateHeader(grnId: number, data: UpdateGrnHeaderData, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .update(grns)
      .set(data)
      .where(eq(grns.id, grnId))
      .returning(grnColumns);

    return row;
  },

  async updateLineArrivedQty(
    grnId: number,
    lineId: number,
    arrivedQty: number,
    tx?: Tx,
  ) {
    const executor = tx ?? db;
    const [row] = await executor
      .update(grnItems)
      .set({ receivedQty: arrivedQty })
      .where(and(eq(grnItems.id, lineId), eq(grnItems.grnId, grnId)))
      .returning(grnItemColumns);

    return row;
  },

  async deleteGrnWithItems(grnId: number) {
    return db.transaction(async (tx) => {
      await tx.delete(grnItems).where(eq(grnItems.grnId, grnId));
      const deletedRows = await tx
        .delete(grns)
        .where(eq(grns.id, grnId))
        .returning({ id: grns.id });
      return deletedRows[0];
    });
  },

  async getDetails(grnId: number) {
    const [grnRows, items] = await Promise.all([
      db.select(grnColumns).from(grns).where(eq(grns.id, grnId)).limit(1),
      db
        .select(grnItemDetailColumns)
        .from(grnItems)
        .innerJoin(
          purchaseOrderItems,
          eq(purchaseOrderItems.id, grnItems.poItemId),
        )
        .innerJoin(itemMaster, eq(itemMaster.id, purchaseOrderItems.itemId))
        .where(eq(grnItems.grnId, grnId))
        .orderBy(asc(grnItems.id)),
    ]);

    const grn = grnRows[0];
    if (!grn) {
      return undefined;
    }

    return { grn, items };
  },

  async list(params: grnListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in grnSortColumns
        ? grnSortColumns[params.sortBy as keyof typeof grnSortColumns]
        : grns.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? `%${q}%` : undefined;

    const filters = [
      pattern ? ilike(grns.grnNumber, pattern) : undefined,
      params.poId !== undefined ? eq(grns.poId, params.poId) : undefined,
      params.status !== undefined ? eq(grns.status, params.status) : undefined,
      // qaStatus filters at the line level — a GRN "matches" if any of its
      // lines carry that qaStatus. EXISTS keeps the header-level
      // pagination/count at 1 row per GRN instead of fanning out via a join.
      params.qaStatus !== undefined
        ? sql`exists (
            select 1 from ${grnItems}
            where ${grnItems.grnId} = ${grns.id}
              and ${grnItems.qaStatus} = ${params.qaStatus}
          )`
        : undefined,
    ].filter((filter) => filter !== undefined);

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(grnColumns)
        .from(grns)
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(grns.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(grns).where(whereClause),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },
};
