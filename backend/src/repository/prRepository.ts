import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../db/client";
import {
  itemMaster,
  machines,
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
} from "../db/schemas/02_procurement";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { allocateDocumentSequence } from "../lib/document-number";
import { AppError } from "../lib/errors";
import type { prListQuerySchemaType } from "../types/pr.types";

const purchaseRequestColumns = {
  id: purchaseRequests.id,
  prNumber: purchaseRequests.prNumber,
  type: purchaseRequests.type,
  saleOrderId: purchaseRequests.saleOrderId,
  assetId: purchaseRequests.assetId,
  status: purchaseRequests.status,
  requestedBy: purchaseRequests.requestedBy,
  approvedBy: purchaseRequests.approvedBy,
  currentApprovalLevel: purchaseRequests.currentApprovalLevel,
  totalApprovalLevels: purchaseRequests.totalApprovalLevels,
  notes: purchaseRequests.notes,
  estimatedAmountPaise: purchaseRequests.estimatedAmountPaise,
  createdAt: purchaseRequests.createdAt,
  updatedAt: purchaseRequests.updatedAt,
};

const purchaseRequestItemWriteColumns = {
  id: purchaseRequestItems.id,
  prId: purchaseRequestItems.prId,
  itemId: purchaseRequestItems.itemId,
  requestedQty: purchaseRequestItems.requestedQty,
  issuedQty: purchaseRequestItems.issuedQty,
  uom: purchaseRequestItems.uom,
  expectedDate: purchaseRequestItems.expectedDate,
};

const purchaseRequestItemDetailColumns = {
  ...purchaseRequestItemWriteColumns,
  status: purchaseRequestItems.status,
  itemSku: itemMaster.sku,
  itemName: itemMaster.name,
  itemCategory: itemMaster.category,
  estRatePaise: itemMaster.averageCostPaise,
};

type PurchaseRequestInsert = typeof purchaseRequests.$inferInsert;
type PurchaseRequestItemInsert = typeof purchaseRequestItems.$inferInsert;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CreatePrData = Pick<
  PurchaseRequestInsert,
  "type" | "saleOrderId" | "assetId" | "notes" | "requestedBy"
>;

export type CreatePrItemData = Pick<
  PurchaseRequestItemInsert,
  "itemId" | "requestedQty" | "uom"
>;

export type CreateOrUpdatePrItemData = Pick<
  PurchaseRequestItemInsert,
  "itemId" | "requestedQty" | "uom" | "expectedDate"
>;

export type UpdatePrData = Partial<
  Pick<
    PurchaseRequestInsert,
    "type" | "saleOrderId" | "assetId" | "notes" | "status"
  >
> & {
  updatedAt: Date;
};

export type UpdatePrItemData = Partial<
  Pick<
    PurchaseRequestItemInsert,
    "itemId" | "requestedQty" | "uom" | "expectedDate"
  >
>;

type PrCostRow = {
  requestedQty: number;
  averageCostPaise: number;
};

async function calculateEstimatedAmountPaiseByItems(
  tx: Tx,
  items: CreatePrItemData[],
) {
  if (items.length === 0) {
    return 0;
  }

  const uniqueItemIds = [...new Set(items.map((item) => item.itemId))];
  const itemRows = await tx
    .select({
      id: itemMaster.id,
      averageCostPaise: itemMaster.averageCostPaise,
    })
    .from(itemMaster)
    .where(inArray(itemMaster.id, uniqueItemIds));

  const itemCostMap = new Map(
    itemRows.map((row) => [row.id, row.averageCostPaise]),
  );
  const missingItemIds = uniqueItemIds.filter(
    (itemId) => !itemCostMap.has(itemId),
  );

  if (missingItemIds.length > 0) {
    throw new AppError(
      `Invalid itemId entries: ${missingItemIds.join(", ")}`,
      400,
      "PR_INVALID_ITEM_IDS",
    );
  }

  const total = items.reduce((sum, item) => {
    const averageCostPaise = itemCostMap.get(item.itemId);
    if (averageCostPaise === undefined) {
      return sum;
    }
    return sum + item.requestedQty * averageCostPaise;
  }, 0);

  return Math.round(total);
}

type ItemMasterLookupRow = Pick<
  typeof itemMaster.$inferSelect,
  "id" | "uom" | "averageCostPaise"
>;

const prSortColumns = {
  id: purchaseRequests.id,
  prNumber: purchaseRequests.prNumber,
  type: purchaseRequests.type,
  status: purchaseRequests.status,
  createdAt: purchaseRequests.createdAt,
} as const;

export const prRepository = {
  async list(params: prListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in prSortColumns
        ? prSortColumns[params.sortBy as keyof typeof prSortColumns]
        : purchaseRequests.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? `%${q}%` : undefined;

    const filters = [
      pattern
        ? or(
            ilike(purchaseRequests.prNumber, pattern),
            ilike(purchaseRequests.notes, pattern),
            sql`${purchaseRequests.type}::text ilike ${pattern}`,
            sql`${purchaseRequests.status}::text ilike ${pattern}`,
          )
        : undefined,
      params.status && params.status.length > 0
        ? inArray(purchaseRequests.status, params.status)
        : undefined,
      params.type ? eq(purchaseRequests.type, params.type) : undefined,
    ].filter((filter) => filter !== undefined);

    const whereClause = filters.length > 0 ? and(...filters) : undefined;
    const [rows, [totalRow]] = whereClause
      ? await Promise.all([
          db
            .select(purchaseRequestColumns)
            .from(purchaseRequests)
            .where(whereClause)
            .orderBy(orderFn(sortColumn), asc(purchaseRequests.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db
            .select({ value: count() })
            .from(purchaseRequests)
            .where(whereClause),
        ])
      : await Promise.all([
          db
            .select(purchaseRequestColumns)
            .from(purchaseRequests)
            .orderBy(orderFn(sortColumn), asc(purchaseRequests.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(purchaseRequests),
        ]);

    return {
      rows,
      total: totalRow?.value ?? 0,
    };
  },

  async findPrById(prId: number, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .select(purchaseRequestColumns)
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, prId))
      .limit(1);

    return row;
  },

  async findPrItemsByPrId(prId: number, tx?: Tx) {
    const executor = tx ?? db;
    return executor
      .select({
        id: purchaseRequestItems.id,
        itemId: purchaseRequestItems.itemId,
      })
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.prId, prId));
  },

  async findPrDetailsById(prId: number) {
    const [prRows, items, linkedPos] = await Promise.all([
      db
        .select({
          ...purchaseRequestColumns,
          requestedByName: employees.name,
        })
        .from(purchaseRequests)
        .innerJoin(employees, eq(employees.id, purchaseRequests.requestedBy))
        .where(eq(purchaseRequests.id, prId))
        .limit(1),
      db
        .select({
          ...purchaseRequestItemDetailColumns,
          linkedPoId: purchaseOrders.id,
          linkedPoNumber: purchaseOrders.poNumber,
        })
        .from(purchaseRequestItems)
        .innerJoin(itemMaster, eq(itemMaster.id, purchaseRequestItems.itemId))
        .leftJoin(
          prPoItemLinks,
          eq(prPoItemLinks.prItemId, purchaseRequestItems.id),
        )
        .leftJoin(
          purchaseOrderItems,
          eq(purchaseOrderItems.id, prPoItemLinks.poItemId),
        )
        .leftJoin(
          purchaseOrders,
          eq(purchaseOrders.id, purchaseOrderItems.poId),
        )
        .where(eq(purchaseRequestItems.prId, prId))
        .orderBy(asc(purchaseRequestItems.id)),
      db
        .selectDistinct({
          id: purchaseOrders.id,
          poNumber: purchaseOrders.poNumber,
          supplierId: purchaseOrders.supplierId,
          status: purchaseOrders.status,
          totalAmountPaise: purchaseOrders.totalAmountPaise,
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
        .innerJoin(
          purchaseOrders,
          eq(purchaseOrders.id, purchaseOrderItems.poId),
        )
        .where(eq(purchaseRequestItems.prId, prId)),
    ]);

    const pr = prRows[0];

    if (!pr) {
      return undefined;
    }

    // Most recent PO supplier per item, independent of this PR — lets the
    // UI offer a "same as last time" quick-pick when creating a PO from
    // this PR's lines. Batched in one query keyed by this PR's distinct
    // item ids (not a subquery per line) to avoid N+1.
    const itemIds = [...new Set(items.map((item) => item.itemId))];

    const latestSuppliersByItem =
      itemIds.length === 0
        ? []
        : await db
            .selectDistinctOn([purchaseOrderItems.itemId], {
              itemId: purchaseOrderItems.itemId,
              supplierId: purchaseOrders.supplierId,
              supplierName: supplierMaster.name,
            })
            .from(purchaseOrderItems)
            .innerJoin(
              purchaseOrders,
              eq(purchaseOrders.id, purchaseOrderItems.poId),
            )
            .innerJoin(
              supplierMaster,
              eq(supplierMaster.id, purchaseOrders.supplierId),
            )
            .where(inArray(purchaseOrderItems.itemId, itemIds))
            .orderBy(purchaseOrderItems.itemId, desc(purchaseOrders.createdAt));

    const defaultSupplierByItemId = new Map(
      latestSuppliersByItem.map((row) => [row.itemId, row]),
    );

    return {
      pr,
      items: items.map((item) => {
        const defaultSupplier = defaultSupplierByItemId.get(item.itemId);
        return {
          ...item,
          defaultSupplierId: defaultSupplier?.supplierId ?? null,
          defaultSupplierName: defaultSupplier?.supplierName ?? null,
        };
      }),
      linkedPos,
    };
  },

  async findMachineById(machineId: number) {
    const [row] = await db
      .select({ id: machines.id })
      .from(machines)
      .where(eq(machines.id, machineId))
      .limit(1);

    return row;
  },

  async findItemMasterByIds(
    itemIds: number[],
  ): Promise<Map<number, ItemMasterLookupRow>> {
    if (itemIds.length === 0) {
      return new Map<number, ItemMasterLookupRow>();
    }

    const rows = await db
      .select({
        id: itemMaster.id,
        uom: itemMaster.uom,
        averageCostPaise: itemMaster.averageCostPaise,
      })
      .from(itemMaster)
      .where(inArray(itemMaster.id, itemIds));

    return new Map(rows.map((row) => [row.id, row]));
  },

  async createWithItems(data: CreatePrData, items: CreatePrItemData[]) {
    return db.transaction(async (tx) => {
      const { periodKey, seq } = await allocateDocumentSequence(
        tx,
        "pr",
        data.requestedBy,
      );
      const prNumber = `PR-${periodKey}-${seq}`;
      const estimatedAmountPaise = await calculateEstimatedAmountPaiseByItems(
        tx,
        items,
      );

      const [createdPr] = await tx
        .insert(purchaseRequests)
        .values({
          prNumber,
          type: data.type,
          saleOrderId: data.saleOrderId,
          assetId: data.assetId,
          status: "draft",
          requestedBy: data.requestedBy,
          currentApprovalLevel: 0,
          totalApprovalLevels: 0,
          notes: data.notes,
          estimatedAmountPaise,
        })
        .returning(purchaseRequestColumns);

      if (!createdPr) {
        throw new AppError(
          "Failed to create purchase request",
          500,
          "PR_CREATE_FAILED",
        );
      }

      const createdItems = await tx
        .insert(purchaseRequestItems)
        .values(
          items.map((item) => ({
            prId: createdPr.id,
            itemId: item.itemId,
            requestedQty: item.requestedQty,
            uom: item.uom,
          })),
        )

        .returning(purchaseRequestItemWriteColumns);

      return {
        pr: createdPr,
        items: createdItems,
      };
    });
  },

  async updatePrById(prId: number, data: UpdatePrData, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .update(purchaseRequests)
      .set(data)
      .where(eq(purchaseRequests.id, prId))
      .returning(purchaseRequestColumns);

    return row;
  },

  async updatePrItemById(
    prId: number,
    prItemId: number,
    data: UpdatePrItemData,
    tx?: Tx,
  ) {
    const executor = tx ?? db;
    const [row] = await executor
      .update(purchaseRequestItems)
      .set(data)
      .where(
        and(
          eq(purchaseRequestItems.prId, prId),
          eq(purchaseRequestItems.id, prItemId),
        ),
      )
      .returning(purchaseRequestItemWriteColumns);

    return row;
  },

  async createPrItem(prId: number, item: CreateOrUpdatePrItemData, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .insert(purchaseRequestItems)
      .values({
        prId,
        itemId: item.itemId,
        requestedQty: item.requestedQty,
        uom: item.uom,
        expectedDate: item.expectedDate,
      })
      .returning(purchaseRequestItemWriteColumns);

    return row;
  },

  async deletePrItemsByIds(prId: number, itemIds: number[], tx?: Tx) {
    if (itemIds.length === 0) {
      return [];
    }

    const executor = tx ?? db;
    return executor
      .delete(purchaseRequestItems)
      .where(
        and(
          eq(purchaseRequestItems.prId, prId),
          inArray(purchaseRequestItems.id, itemIds),
        ),
      )
      .returning({ id: purchaseRequestItems.id });
  },

  async recalculateEstimatedAmountByPrId(prId: number, tx?: Tx) {
    const executor = tx ?? db;
    const costRows = await executor
      .select({
        requestedQty: purchaseRequestItems.requestedQty,
        averageCostPaise: itemMaster.averageCostPaise,
      })
      .from(purchaseRequestItems)
      .innerJoin(itemMaster, eq(itemMaster.id, purchaseRequestItems.itemId))
      .where(eq(purchaseRequestItems.prId, prId));

    const estimatedAmountPaise = Math.round(
      costRows.reduce(
        (total, row: PrCostRow) =>
          total + row.requestedQty * row.averageCostPaise,
        0,
      ),
    );

    const [row] = await executor
      .update(purchaseRequests)
      .set({ estimatedAmountPaise, updatedAt: new Date() })
      .where(eq(purchaseRequests.id, prId))
      .returning(purchaseRequestColumns);

    return row;
  },

  async setStatusCancelled(prId: number) {
    const [row] = await db
      .update(purchaseRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(purchaseRequests.id, prId))
      .returning(purchaseRequestColumns);

    return row;
  },

  // Recomputes a PR header's status from its items' statuses. Direct write —
  // bypasses prService.assertValidStatusTransition, same rationale as the
  // existing approval-mirror writes in approvalRepository (poService is the
  // caller, after PO create/update/cancel touches PR items).
  async recomputeHeaderStatusFromItems(prId: number, tx?: Tx) {
    const executor = tx ?? db;
    const items = await executor
      .select({ status: purchaseRequestItems.status })
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.prId, prId));

    if (items.length === 0) {
      return undefined;
    }

    const allPending = items.every((item) => item.status === "pending");
    const allOrdered = items.every((item) =>
      ["po_draft", "ordered", "closed"].includes(item.status),
    );

    const nextStatus = allPending
      ? "approved"
      : allOrdered
        ? "fully_ordered"
        : "partial_ordered";

    const [row] = await executor
      .update(purchaseRequests)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(purchaseRequests.id, prId))
      .returning(purchaseRequestColumns);

    return row;
  },
};
