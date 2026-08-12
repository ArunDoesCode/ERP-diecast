import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  lt,
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
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { allocateDocumentSequence } from "../lib/document-number";
import { AppError, ConflictError } from "../lib/errors";
import type {
  poListQuerySchemaType,
  poStatusSchemaType,
} from "../types/po.types";
import { prRepository } from "./prRepository";

const purchaseOrderColumns = {
  id: purchaseOrders.id,
  poNumber: purchaseOrders.poNumber,
  supplierId: purchaseOrders.supplierId,
  status: purchaseOrders.status,
  subtotalPaise: purchaseOrders.subtotalPaise,
  taxAmountPaise: purchaseOrders.taxAmountPaise,
  totalAmountPaise: purchaseOrders.totalAmountPaise,
  paymentTermsDays: purchaseOrders.paymentTermsDays,
  deliveryTerms: purchaseOrders.deliveryTerms,
  notes: purchaseOrders.notes,
  expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
  approvedBy: purchaseOrders.approvedBy,
  currentApprovalLevel: purchaseOrders.currentApprovalLevel,
  totalApprovalLevels: purchaseOrders.totalApprovalLevels,
  createdAt: purchaseOrders.createdAt,
  createdBy: purchaseOrders.createdBy,
};

const purchaseOrderItemWriteColumns = {
  id: purchaseOrderItems.id,
  poId: purchaseOrderItems.poId,
  itemId: purchaseOrderItems.itemId,
  qty: purchaseOrderItems.qty,
  receivedQty: purchaseOrderItems.receivedQty,
  unitPricePaise: purchaseOrderItems.unitPricePaise,
  uom: purchaseOrderItems.uom,
};

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
  >
>;

export type PoLineInsertData = CreatePoLineData;
export type PoLineUpdateData = { id: number; unitPricePaise: number };

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

function computeTotalsPaise(lines: { qty: number; unitPricePaise: number }[]) {
  const subtotalPaise = Math.round(
    lines.reduce((sum, line) => sum + line.qty * line.unitPricePaise, 0),
  );
  // No per-line tax-rate field on purchaseOrderItems today, so tax stays 0
  // for MVP — see backend build plan "KNOWN OPEN ITEM".
  const taxAmountPaise = 0;
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
            lt(purchaseOrders.expectedDeliveryDate, sql`now()`),
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
      .select({ id: supplierMaster.id, isActive: supplierMaster.isActive })
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
      .where(inArray(purchaseRequestItems.id, ids))
      .for("update");
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
        .returning(purchaseOrderColumns);

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

      return {
        po: createdPo,
        items: createdItems,
      };
    });
  },

  async findPoItemsByPoId(poId: number, tx?: Tx) {
    const executor = tx ?? db;
    return executor
      .select({
        id: purchaseOrderItems.id,
        itemId: purchaseOrderItems.itemId,
      })
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.poId, poId));
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

  async updatePoItemById(
    poId: number,
    poItemId: number,
    data: { unitPricePaise: number },
    tx?: Tx,
  ) {
    const executor = tx ?? db;
    const [row] = await executor
      .update(purchaseOrderItems)
      .set(data)
      .where(
        and(
          eq(purchaseOrderItems.id, poItemId),
          eq(purchaseOrderItems.poId, poId),
        ),
      )
      .returning(purchaseOrderItemWriteColumns);

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

  async recalculateTotalsByPoId(poId: number, tx?: Tx) {
    const executor = tx ?? db;
    const lines = await executor
      .select({
        qty: purchaseOrderItems.qty,
        unitPricePaise: purchaseOrderItems.unitPricePaise,
      })
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.poId, poId));

    const totals = computeTotalsPaise(lines);

    const [row] = await executor
      .update(purchaseOrders)
      .set(totals)
      .where(eq(purchaseOrders.id, poId))
      .returning(purchaseOrderColumns);

    return row;
  },

  async updateWithItems(
    poId: number,
    headerData: UpdatePoData,
    inserts: PoLineInsertData[],
    updates: PoLineUpdateData[],
    deletes: { id: number }[],
  ) {
    return db.transaction(async (tx) => {
      const po = await this.updatePoById(poId, headerData, tx);
      if (!po) {
        throw new AppError("Purchase order not found", 404, "NOT_FOUND");
      }

      const changedItems = [];
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
        const updatedItem = await this.updatePoItemById(
          poId,
          update.id,
          { unitPricePaise: update.unitPricePaise },
          tx,
        );
        if (!updatedItem) {
          throw new AppError(
            `PO item not found for id ${update.id}`,
            404,
            "NOT_FOUND",
          );
        }
        changedItems.push(updatedItem);
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

  async hasGrnForPo(poId: number) {
    const [row] = await db
      .select({ id: grns.id })
      .from(grns)
      .where(eq(grns.poId, poId))
      .limit(1);

    return row !== undefined;
  },

  async setStatusCancelled(poId: number) {
    return db.transaction(async (tx) => {
      const [po] = await tx
        .update(purchaseOrders)
        .set({ status: "cancelled" })
        .where(eq(purchaseOrders.id, poId))
        .returning(purchaseOrderColumns);

      if (!po) {
        return undefined;
      }

      const poItems = await this.findPoItemsByPoId(poId, tx);
      const affectedPrIds = new Set<number>();

      for (const poItem of poItems) {
        const link = await this.findLinkByPoItemId(poId, poItem.id, tx);
        if (!link || link.prItemId == null) {
          continue;
        }

        await this.revertPrItemToPending(link.prItemId, link.linkedQty, tx);

        const [prItemRow] = await tx
          .select({ prId: purchaseRequestItems.prId })
          .from(purchaseRequestItems)
          .where(eq(purchaseRequestItems.id, link.prItemId))
          .limit(1);
        if (prItemRow) {
          affectedPrIds.add(prItemRow.prId);
        }
      }

      for (const prId of affectedPrIds) {
        await prRepository.recomputeHeaderStatusFromItems(prId, tx);
      }

      return po;
    });
  },

  async setStatus(poId: number, status: poStatusSchemaType, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .update(purchaseOrders)
      .set({ status })
      .where(eq(purchaseOrders.id, poId))
      .returning(purchaseOrderColumns);

    return row;
  },

  async setStatusDispatched(poId: number, tx?: Tx) {
    return this.setStatus(poId, "dispatched", tx);
  },

  async insertCommunication(
    data: {
      poId: number;
      type: "po_sent" | "reminder" | "escalation";
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

  async listCommunications(poId: number) {
    return db
      .select()
      .from(poCommunications)
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
