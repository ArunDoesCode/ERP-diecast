import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../db/client";
import { itemMaster } from "../db/schemas/02_procurement-catalog";
import {
  grns,
  poCommunications,
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  supplierInvoices,
} from "../db/schemas/02_procurement-purchasing";
import {
  supplierItems,
  supplierMaster,
} from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { allocateDocumentSequence } from "../lib/document-number";
import { AppError, BadRequestError, ConflictError } from "../lib/errors";
import type {
  poListQuerySchemaType,
  poStatusSchemaType,
} from "../types/po.types";
import { prRepository } from "./prRepository";

// All stored PO columns plus the canceller's name and the due date
// (BR-PO-19: revised date if set, else expected date).
const purchaseOrderColumns = {
  ...getTableColumns(purchaseOrders),
  cancelledByName: sql<
    string | null
  >`(select ${employees.name} from ${employees} where ${employees.id} = ${purchaseOrders.cancelledBy})`.as(
    "cancelled_by_name",
  ),
  dueDate:
    sql<Date | null>`coalesce(${purchaseOrders.revisedDeliveryDate}, ${purchaseOrders.expectedDeliveryDate})`
      .mapWith(purchaseOrders.expectedDeliveryDate)
      .as("due_date"),
};

const purchaseOrderItemWriteColumns = getTableColumns(purchaseOrderItems);

const purchaseOrderItemDetailColumns = {
  ...purchaseOrderItemWriteColumns,
  itemSku: itemMaster.sku,
  itemName: itemMaster.name,
  itemCategory: itemMaster.category,
  prItemId: prPoItemLinks.prItemId,
  prNumber: purchaseRequests.prNumber,
};

type PurchaseOrderInsert = typeof purchaseOrders.$inferInsert;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CreatePoData = Pick<
  PurchaseOrderInsert,
  | "supplierId"
  | "paymentTermsDays"
  | "deliveryTerms"
  | "expectedDeliveryDate"
  | "notes"
  | "createdBy"
>;

export type CreatePoLineData = {
  prItemId: number;
  unitPricePaise: number;
  gstPercent: number;
};

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
  >
>;

export type PoLineInsertData = CreatePoLineData;
export type PoLineUpdateData = {
  id: number;
  unitPricePaise?: number | undefined;
  gstPercent?: number | undefined;
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
};

const poSortColumns = {
  id: purchaseOrders.id,
  poNumber: purchaseOrders.poNumber,
  status: purchaseOrders.status,
  createdAt: purchaseOrders.createdAt,
} as const;

// BR-PO-04: line value = round(qty x rate); line tax = round(value x GST% / 100).
// GST % is turned into whole basis points first so the tax maths is integer only.
export function computeLinePaise(
  qty: number,
  unitPricePaise: number,
  gstPercent: number,
) {
  const lineValuePaise = Math.round(qty * unitPricePaise);
  const lineTaxPaise = Math.round(
    (lineValuePaise * Math.round(gstPercent * 100)) / 10000,
  );
  return { lineValuePaise, lineTaxPaise };
}

function computeTotalsPaise(
  lines: { lineValuePaise: number; lineTaxPaise: number }[],
) {
  const subtotalPaise = lines.reduce((sum, l) => sum + l.lineValuePaise, 0);
  const taxAmountPaise = lines.reduce((sum, l) => sum + l.lineTaxPaise, 0);
  return {
    subtotalPaise,
    taxAmountPaise,
    totalAmountPaise: subtotalPaise + taxAmountPaise,
  };
}

export const poRepository = {
  async list(params: poListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in poSortColumns
        ? poSortColumns[params.sortBy as keyof typeof poSortColumns]
        : purchaseOrders.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? `%${q}%` : undefined;

    const filters = [
      pattern
        ? or(
            ilike(purchaseOrders.poNumber, pattern),
            ilike(purchaseOrders.notes, pattern),
          )
        : undefined,
      params.status && params.status.length > 0
        ? inArray(purchaseOrders.status, params.status)
        : undefined,
      params.supplierId
        ? eq(purchaseOrders.supplierId, params.supplierId)
        : undefined,
      params.overdue
        ? and(
            inArray(purchaseOrders.status, ["dispatched", "partial_received"]),
            // BR-PO-19: due date = revised date if set, else expected date; before today.
            sql`coalesce(${purchaseOrders.revisedDeliveryDate}, ${purchaseOrders.expectedDeliveryDate}) < current_date`,
            sql`exists (
              select 1 from ${purchaseOrderItems}
              where ${purchaseOrderItems.poId} = ${purchaseOrders.id}
                and (${purchaseOrderItems.qty} - coalesce(${purchaseOrderItems.receivedQty}, 0)) > 0
            )`,
          )
        : undefined,
    ].filter((filter) => filter !== undefined);

    const whereClause = filters.length > 0 ? and(...filters) : undefined;
    const [rows, [totalRow]] = whereClause
      ? await Promise.all([
          db
            .select(purchaseOrderColumns)
            .from(purchaseOrders)
            .where(whereClause)
            .orderBy(orderFn(sortColumn), asc(purchaseOrders.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(purchaseOrders).where(whereClause),
        ])
      : await Promise.all([
          db
            .select(purchaseOrderColumns)
            .from(purchaseOrders)
            .orderBy(orderFn(sortColumn), asc(purchaseOrders.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(purchaseOrders),
        ]);

    return {
      rows,
      total: totalRow?.value ?? 0,
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
      })
      .from(purchaseRequestItems)
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.prId),
      )
      .where(inArray(purchaseRequestItems.id, sortedIds))
      .orderBy(asc(purchaseRequestItems.id))
      .for("update", { of: purchaseRequestItems });
  },

  // Unlocked, best-effort read used only for the service-level "friendly"
  // 400 pre-check before a transaction opens. It is NOT the source of truth
  // for the pending/draftable invariant — findPurchaseRequestItemsByIdsForUpdate
  // re-asserts that under the FOR UPDATE lock inside the transaction, and that
  // check is what actually prevents a double-draft race.
  async findPurchaseRequestItemsByIds(ids: number[]) {
    if (ids.length === 0) {
      return [];
    }

    return db
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
      })
      .from(purchaseRequestItems)
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.prId),
      )
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

  async createWithItems(data: CreatePoData, lines: CreatePoLineData[]) {
    return db.transaction(async (tx) => {
      const prItemIds = lines.map((line) => line.prItemId);
      const prItemRows = await this.findPurchaseRequestItemsByIdsForUpdate(
        prItemIds,
        tx,
      );
      const prItemMap = new Map(prItemRows.map((row) => [row.id, row]));

      const { periodKey, seq } = await allocateDocumentSequence(
        tx,
        "po",
        data.createdBy,
      );
      const poNumber = `PO-${periodKey}-${seq}`;

      const preparedLines = lines.map((line) => {
        const prItem = prItemMap.get(line.prItemId);
        if (!prItem) {
          throw new AppError(
            `Invalid prItemId: ${line.prItemId}`,
            400,
            "PO_INVALID_PR_ITEM",
          );
        }

        // Re-assert under the FOR UPDATE lock — a concurrent PO create/update
        // may have flipped this PR item to po_draft/ordered between the
        // service-level pre-check and this locked read.
        if (prItem.status !== "pending") {
          throw new ConflictError(
            `PR item ${line.prItemId} is no longer pending (already ${prItem.status})`,
            "PO_LINE_ALREADY_DRAFTED",
          );
        }

        const qty = prItem.requestedQty - (prItem.issuedQty ?? 0);
        return {
          prItemId: line.prItemId,
          itemId: prItem.itemId,
          qty,
          uom: prItem.uom,
          unitPricePaise: line.unitPricePaise,
          gstPercent: line.gstPercent,
          ...computeLinePaise(qty, line.unitPricePaise, line.gstPercent),
        };
      });

      const totals = computeTotalsPaise(preparedLines);

      const [createdPo] = await tx
        .insert(purchaseOrders)
        .values({
          poNumber,
          supplierId: data.supplierId,
          status: "draft",
          subtotalPaise: totals.subtotalPaise,
          taxAmountPaise: totals.taxAmountPaise,
          totalAmountPaise: totals.totalAmountPaise,
          paymentTermsDays: data.paymentTermsDays ?? 0,
          deliveryTerms: data.deliveryTerms ?? null,
          notes: data.notes ?? null,
          expectedDeliveryDate: data.expectedDeliveryDate ?? null,
          currentApprovalLevel: 0,
          totalApprovalLevels: 0,
          createdBy: data.createdBy,
        })
        .returning({ id: purchaseOrders.id });

      if (!createdPo) {
        throw new AppError(
          "Failed to create purchase order",
          500,
          "PO_CREATE_FAILED",
        );
      }

      const createdItems = await tx
        .insert(purchaseOrderItems)
        .values(
          preparedLines.map((line) => ({
            poId: createdPo.id,
            itemId: line.itemId,
            qty: line.qty,
            unitPricePaise: line.unitPricePaise,
            uom: line.uom,
            gstPercent: line.gstPercent,
            lineValuePaise: line.lineValuePaise,
            lineTaxPaise: line.lineTaxPaise,
          })),
        )
        .returning(purchaseOrderItemWriteColumns);

      await tx.insert(prPoItemLinks).values(
        createdItems.map((createdItem, index) => {
          const line = preparedLines[index];
          if (!line) {
            throw new AppError(
              "PO item/line mismatch during link creation",
              500,
              "PO_LINK_MISMATCH",
            );
          }
          return {
            prItemId: line.prItemId,
            poItemId: createdItem.id,
            linkedQty: line.qty,
          };
        }),
      );

      const affectedPrIds = new Set<number>();
      for (const line of preparedLines) {
        const prItem = prItemMap.get(line.prItemId);
        if (!prItem) {
          continue;
        }

        await tx
          .update(purchaseRequestItems)
          .set({
            issuedQty: sql`${purchaseRequestItems.issuedQty} + ${line.qty}`,
            status: "po_draft",
          })
          .where(eq(purchaseRequestItems.id, line.prItemId));

        affectedPrIds.add(prItem.prId);
      }

      for (const prId of affectedPrIds) {
        await prRepository.recomputeHeaderStatusFromItems(prId, tx);
      }

      const po = await this.findPoById(createdPo.id, tx);
      if (!po) {
        throw new AppError(
          "Failed to create purchase order",
          500,
          "PO_CREATE_FAILED",
        );
      }

      return { po, items: createdItems };
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

  // Scoped by poId (joined) so a link belonging to a different PO's item
  // can never be read/mutated by a request targeting this PO.
  async findLinkByPoItemId(poId: number, poItemId: number, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .select({
        id: prPoItemLinks.id,
        prItemId: prPoItemLinks.prItemId,
        linkedQty: prPoItemLinks.linkedQty,
      })
      .from(prPoItemLinks)
      .innerJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, prPoItemLinks.poItemId),
      )
      .where(
        and(
          eq(prPoItemLinks.poItemId, poItemId),
          eq(purchaseOrderItems.poId, poId),
        ),
      )
      .limit(1);

    return row;
  },

  async deletePoItemsByIds(poId: number, itemIds: number[], tx?: Tx) {
    if (itemIds.length === 0) {
      return [];
    }

    const executor = tx ?? db;
    return executor
      .delete(purchaseOrderItems)
      .where(
        and(
          eq(purchaseOrderItems.poId, poId),
          inArray(purchaseOrderItems.id, itemIds),
        ),
      )
      .returning({ id: purchaseOrderItems.id });
  },

  async deleteLinkByPoItemId(poItemId: number, tx: Tx) {
    return tx
      .delete(prPoItemLinks)
      .where(eq(prPoItemLinks.poItemId, poItemId))
      .returning({ id: prPoItemLinks.id });
  },

  // BR-PR-31: a line removed from a draft PO goes back to pending.
  async revertPrItemToPending(prItemId: number, linkedQty: number, tx: Tx) {
    await tx
      .update(purchaseRequestItems)
      .set({
        issuedQty: sql`greatest(${purchaseRequestItems.issuedQty} - ${linkedQty}, 0)`,
        status: "pending",
      })
      .where(eq(purchaseRequestItems.id, prItemId));
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

  // BR-PO-04: totals are always the sum of the stored line columns.
  async recalculateTotalsByPoId(poId: number, tx: Tx) {
    const lines = await tx
      .select({
        lineValuePaise: purchaseOrderItems.lineValuePaise,
        lineTaxPaise: purchaseOrderItems.lineTaxPaise,
      })
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.poId, poId));

    const [row] = await tx
      .update(purchaseOrders)
      .set(computeTotalsPaise(lines))
      .where(eq(purchaseOrders.id, poId))
      .returning(purchaseOrderColumns);

    return row;
  },

  // BR-PO-05: draft only, checked again under the row lock. A PO can't be left with no lines.
  async updateWithItems(
    poId: number,
    headerData: UpdatePoData,
    inserts: PoLineInsertData[],
    updates: PoLineUpdateData[],
    deletes: { id: number }[],
  ) {
    return db.transaction(async (tx) => {
      const locked = await this.lockPoById(poId, tx);
      if (!locked) {
        throw new AppError("Purchase order not found", 404, "NOT_FOUND");
      }
      if (locked.status === "pending_approval") {
        throw new ConflictError(
          "Purchase order is locked while it is in approval",
          "DOC_LOCKED_IN_APPROVAL",
        );
      }
      if (locked.status !== "draft") {
        throw new ConflictError(
          `Purchase order can only be edited in draft (now ${locked.status})`,
          "PO_NOT_EDITABLE",
        );
      }

      if (Object.keys(headerData).length > 0) {
        await this.updatePoById(poId, headerData, tx);
      }

      // CRP-2: take every PR lock this edit needs up front, headers first and
      // lines in id order, before any line is changed.
      const removedLinks =
        deletes.length > 0
          ? await tx
              .select({ prItemId: prPoItemLinks.prItemId })
              .from(prPoItemLinks)
              .where(
                inArray(
                  prPoItemLinks.poItemId,
                  deletes.map((del) => del.id),
                ),
              )
          : [];
      await this.findPurchaseRequestItemsByIdsForUpdate(
        [
          ...removedLinks
            .map((link) => link.prItemId)
            .filter((id): id is number => id != null),
          ...inserts.map((line) => line.prItemId),
        ],
        tx,
      );

      const changedItems: Awaited<ReturnType<typeof this.findPoItemsByPoId>> =
        [];
      const affectedPrIds = new Set<number>();

      for (const del of deletes) {
        const link = await this.findLinkByPoItemId(poId, del.id, tx);
        if (link?.prItemId != null) {
          await this.revertPrItemToPending(link.prItemId, link.linkedQty, tx);
          const [prItemRow] = await tx
            .select({ prId: purchaseRequestItems.prId })
            .from(purchaseRequestItems)
            .where(eq(purchaseRequestItems.id, link.prItemId))
            .limit(1);
          if (prItemRow) {
            affectedPrIds.add(prItemRow.prId);
          }
          await this.deleteLinkByPoItemId(del.id, tx);
        }
        const deletedRows = await this.deletePoItemsByIds(poId, [del.id], tx);
        if (deletedRows.length === 0) {
          throw new AppError(
            `PO item not found for id ${del.id}`,
            404,
            "NOT_FOUND",
          );
        }
      }

      for (const update of updates) {
        const [existing] = await tx
          .select(purchaseOrderItemWriteColumns)
          .from(purchaseOrderItems)
          .where(
            and(
              eq(purchaseOrderItems.id, update.id),
              eq(purchaseOrderItems.poId, poId),
            ),
          )
          .for("update");
        if (!existing) {
          throw new AppError(
            `PO item not found for id ${update.id}`,
            404,
            "NOT_FOUND",
          );
        }
        const unitPricePaise = update.unitPricePaise ?? existing.unitPricePaise;
        const gstPercent = update.gstPercent ?? existing.gstPercent;
        const [updatedItem] = await tx
          .update(purchaseOrderItems)
          .set({
            unitPricePaise,
            gstPercent,
            ...computeLinePaise(existing.qty, unitPricePaise, gstPercent),
          })
          .where(eq(purchaseOrderItems.id, update.id))
          .returning(purchaseOrderItemWriteColumns);
        if (updatedItem) {
          changedItems.push(updatedItem);
        }
      }

      if (inserts.length > 0) {
        const prItemIds = inserts.map((line) => line.prItemId);
        const prItemRows = await this.findPurchaseRequestItemsByIdsForUpdate(
          prItemIds,
          tx,
        );
        const prItemMap = new Map(prItemRows.map((row) => [row.id, row]));

        for (const line of inserts) {
          const prItem = prItemMap.get(line.prItemId);
          if (!prItem) {
            throw new AppError(
              `Invalid prItemId: ${line.prItemId}`,
              400,
              "PO_INVALID_PR_ITEM",
            );
          }

          // Same re-assert as createWithItems — see comment there.
          if (prItem.status !== "pending") {
            throw new ConflictError(
              `PR item ${line.prItemId} is no longer pending (already ${prItem.status})`,
              "PO_LINE_ALREADY_DRAFTED",
            );
          }

          const qty = prItem.requestedQty - (prItem.issuedQty ?? 0);

          const [createdItem] = await tx
            .insert(purchaseOrderItems)
            .values({
              poId,
              itemId: prItem.itemId,
              qty,
              unitPricePaise: line.unitPricePaise,
              uom: prItem.uom,
              gstPercent: line.gstPercent,
              ...computeLinePaise(qty, line.unitPricePaise, line.gstPercent),
            })
            .returning(purchaseOrderItemWriteColumns);

          if (!createdItem) {
            throw new AppError(
              "Failed to create PO item",
              500,
              "PO_ITEM_CREATE_FAILED",
            );
          }

          await tx.insert(prPoItemLinks).values({
            prItemId: line.prItemId,
            poItemId: createdItem.id,
            linkedQty: qty,
          });

          await tx
            .update(purchaseRequestItems)
            .set({
              issuedQty: sql`${purchaseRequestItems.issuedQty} + ${qty}`,
              status: "po_draft",
            })
            .where(eq(purchaseRequestItems.id, line.prItemId));

          affectedPrIds.add(prItem.prId);
          changedItems.push(createdItem);
        }
      }

      const remaining = await this.findPoItemsByPoId(poId, tx);
      if (remaining.length === 0) {
        throw new BadRequestError(
          "A purchase order needs at least one line",
          "PO_NEEDS_A_LINE",
        );
      }

      for (const prId of affectedPrIds) {
        await prRepository.recomputeHeaderStatusFromItems(prId, tx);
      }

      const recalculatedPo = await this.recalculateTotalsByPoId(poId, tx);
      if (!recalculatedPo) {
        throw new AppError("Purchase order not found", 404, "NOT_FOUND");
      }

      return {
        po: recalculatedPo,
        items: changedItems,
      };
    });
  },

  async getDetails(poId: number) {
    const [poRows, items] = await Promise.all([
      db
        .select(purchaseOrderColumns)
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId))
        .limit(1),
      db
        .select(purchaseOrderItemDetailColumns)
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
        .where(eq(purchaseOrderItems.poId, poId))
        .orderBy(asc(purchaseOrderItems.id)),
    ]);

    const po = poRows[0];

    if (!po) {
      return undefined;
    }

    return {
      po,
      items,
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

  async findSupplierInvoice(
    supplierId: number,
    invoiceNumber: string,
    tx?: Tx,
  ) {
    const executor = tx ?? db;
    const [row] = await executor
      .select({ id: supplierInvoices.id })
      .from(supplierInvoices)
      .where(
        and(
          eq(supplierInvoices.supplierId, supplierId),
          eq(supplierInvoices.invoiceNumber, invoiceNumber),
        ),
      )
      .limit(1);
    return row;
  },

  async insertSupplierInvoice(
    data: {
      invoiceNumber: string;
      invoiceDate: Date;
      poId: number;
      supplierId: number;
      billedAmountPaise: number;
      dueDate?: Date | null;
    },
    tx?: Tx,
  ) {
    const executor = tx ?? db;
    const [row] = await executor
      .insert(supplierInvoices)
      .values({
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        poId: data.poId,
        supplierId: data.supplierId,
        billedAmountPaise: data.billedAmountPaise,
        dueDate: data.dueDate ?? null,
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
  // race-sensitive allocation like createWithItems.
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
