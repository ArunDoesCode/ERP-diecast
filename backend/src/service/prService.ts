import { db } from "../db/client";
import { type Actor, can } from "../lib/auth-middleware";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../lib/errors";
import { approvalRepository } from "../repository/approvalRepository";
import { prRepository } from "../repository/prRepository";
import type {
  createPrSchemaType,
  prItemSchemaType,
  prListQuerySchemaType,
  updatePrSchemaType,
} from "../types/pr.types";

// BR-AUTH-26: saving a PR with a machine needs pr.link_machine.
function assertCanLinkMachine(
  actor: Actor,
  assetId: number | null | undefined,
) {
  if (assetId != null && !can(actor, "pr.link_machine")) {
    throw new ForbiddenError("Permission denied", "PERMISSION_DENIED", {
      key: "pr.link_machine",
    });
  }
}

// BR-PR-08: a required-by date cannot be before today when saved.
function assertNotPastDate(date: Date | null | undefined) {
  if (!date) return;
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  if (date.getTime() < startOfToday.getTime()) {
    throw new BadRequestError(
      "Required-by date cannot be in the past",
      "PR_DATE_IN_PAST",
    );
  }
}

// BR-PR-06: every line item must exist in the item master and be active.
function assertItemsUsable(
  itemIds: number[],
  itemMap: Map<number, { isActive: boolean }>,
) {
  const bad = itemIds.filter((id) => !itemMap.get(id)?.isActive);
  if (bad.length > 0) {
    throw new BadRequestError(
      `Item not found or inactive: ${bad.join(", ")}`,
      "PR_INVALID_ITEM",
    );
  }
}

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export const prService = {
  async getDetails(prId: number) {
    const row = await prRepository.findPrDetailsById(prId);
    if (!row) {
      throw new NotFoundError("Purchase request not found");
    }

    return row;
  },

  async list(params: prListQuerySchemaType) {
    const { rows, total } = await prRepository.list(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async create(input: createPrSchemaType, actorId: number, actor: Actor) {
    assertCanLinkMachine(actor, input.assetId);
    if (input.type === "maintenance" && input.assetId == null) {
      throw new BadRequestError(
        "assetId is required when PR type is maintenance",
      );
    }

    if (input.assetId != null) {
      const machine = await prRepository.findMachineById(input.assetId);
      if (!machine) {
        throw new BadRequestError("Invalid assetId");
      }
    }

    const itemIds = [...new Set(input.items.map((item) => item.itemId))];
    if (itemIds.length !== input.items.length) {
      throw new BadRequestError(
        "Each item can appear only once per PR",
        "PR_DUPLICATE_ITEM",
      );
    }
    for (const item of input.items) assertNotPastDate(item.expectedDate);

    const itemMap = await prRepository.findItemMasterByIds(itemIds);
    assertItemsUsable(itemIds, itemMap);

    const normalizedItems = input.items.map((item) => {
      const itemMasterRow = itemMap.get(item.itemId);
      if (!itemMasterRow) {
        throw new BadRequestError(`Invalid itemId: ${item.itemId}`);
      }

      return {
        itemId: item.itemId,
        requestedQty: item.requestedQty,
        uom: itemMasterRow.uom,
        expectedDate: item.expectedDate ?? null,
      };
    });

    return prRepository.createWithItems(
      {
        type: input.type,
        saleOrderId: input.saleOrderId ?? null,
        assetId: input.assetId ?? null,
        notes: input.notes ?? null,
        requestedBy: actorId,
      },
      normalizedItems,
    );
  },

  async update(input: updatePrSchemaType, actor: Actor) {
    return db.transaction(async (tx) => {
      const existingPr = await prRepository.findPrByIdForUpdate(input.prId, tx);
      if (!existingPr) {
        throw new NotFoundError("Purchase request not found");
      }
      // BR-PR-17: only the requester or a super-admin edits.
      if (existingPr.requestedBy !== actor.id && !actor.isSuperAdmin) {
        throw new ForbiddenError(
          "Only the requester or a super-admin can edit this PR",
          "PR_NOT_REQUESTER",
        );
      }
      // BR-PR-15: header and lines change only in draft.
      if (existingPr.status !== "draft") {
        throw new ConflictError(
          `A PR in status ${existingPr.status} cannot be edited`,
          "PR_NOT_EDITABLE",
        );
      }

      // BR-AUTH-26 (PR v2): the key is needed only when the machine is added or changed.
      if (input.assetId !== undefined && input.assetId !== existingPr.assetId) {
        assertCanLinkMachine(actor, input.assetId);
      }

      const targetType = input.type ?? existingPr.type;
      const targetAssetId =
        input.assetId !== undefined ? input.assetId : existingPr.assetId;

      if (targetType === "maintenance" && targetAssetId == null) {
        throw new BadRequestError(
          "assetId is required when PR type is maintenance",
        );
      }

      if (targetAssetId != null) {
        const machine = await prRepository.findMachineById(targetAssetId);
        if (!machine) {
          throw new BadRequestError("Invalid assetId");
        }
      }

      const sanitizedUpdateData = {
        updatedAt: new Date(),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.saleOrderId !== undefined
          ? { saleOrderId: input.saleOrderId }
          : {}),
        ...(input.assetId !== undefined ? { assetId: input.assetId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      };

      const pr = await prRepository.updatePrById(
        input.prId,
        sanitizedUpdateData,
        tx,
      );

      if (!pr) {
        throw new NotFoundError("Purchase request not found");
      }

      const inserts = input.inserts;
      const updates = input.updates;
      const deletes = input.deletes;

      const changedItems: prItemSchemaType[] = [];
      const hasItemMutations =
        inserts.length > 0 || updates.length > 0 || deletes.length > 0;

      let responsePr = pr;

      if (hasItemMutations) {
        const existingPrItems = await prRepository.findPrItemsByPrId(
          input.prId,
          tx,
        );
        const existingItemByLineId = new Map(
          existingPrItems.map((row) => [row.id, row.itemId]),
        );

        const deleteIds = new Set(deletes.map((item) => item.id));
        for (const deleteId of deleteIds) {
          if (!existingItemByLineId.has(deleteId)) {
            throw new NotFoundError(`PR item not found for id ${deleteId}`);
          }
        }

        for (const item of updates) {
          if (!existingItemByLineId.has(item.id)) {
            throw new NotFoundError(`PR item not found for id ${item.id}`);
          }
        }

        const finalItemIds = new Map<number, number>();
        for (const row of existingPrItems) {
          if (row.itemId == null) {
            throw new BadRequestError("Invalid PR item data");
          }
          if (!deleteIds.has(row.id)) {
            finalItemIds.set(row.id, row.itemId);
          }
        }

        for (const item of updates) {
          if (item.itemId !== undefined) {
            finalItemIds.set(item.id, item.itemId);
          }
        }

        inserts.forEach((item, index) => {
          finalItemIds.set(-(index + 1), item.itemId);
        });

        // BR-PR-15: a PR cannot be left with zero lines.
        if (finalItemIds.size === 0) {
          throw new BadRequestError(
            "A PR must keep at least one line",
            "PR_MIN_ONE_LINE",
          );
        }

        const uniqueFinalItemIds = new Set<number>();
        for (const itemId of finalItemIds.values()) {
          if (uniqueFinalItemIds.has(itemId)) {
            throw new BadRequestError(
              "Each item can appear only once per PR",
              "PR_DUPLICATE_ITEM",
            );
          }
          uniqueFinalItemIds.add(itemId);
        }

        for (const item of [...inserts, ...updates]) {
          assertNotPastDate(item.expectedDate);
        }

        const requestedItemIds = [
          ...new Set([
            ...inserts.map((item) => item.itemId),
            ...updates
              .map((item) => item.itemId)
              .filter((itemId): itemId is number => itemId !== undefined),
          ]),
        ];
        const itemMap =
          await prRepository.findItemMasterByIds(requestedItemIds);

        assertItemsUsable(requestedItemIds, itemMap);

        if (deleteIds.size > 0) {
          await prRepository.deletePrItemsByIds(input.prId, [...deleteIds], tx);
        }

        for (const item of updates) {
          const updateItemData = {
            ...(item.requestedQty !== undefined
              ? { requestedQty: item.requestedQty }
              : {}),
            ...(item.expectedDate !== undefined
              ? { expectedDate: item.expectedDate }
              : {}),
          };

          if (item.itemId !== undefined) {
            const itemMasterRow = itemMap.get(item.itemId);
            if (!itemMasterRow) {
              throw new BadRequestError(`Invalid itemId: ${item.itemId}`);
            }
            Object.assign(updateItemData, {
              itemId: item.itemId,
              uom: itemMasterRow.uom,
            });
          }

          const updatedItem = await prRepository.updatePrItemById(
            input.prId,
            item.id,
            updateItemData,
            tx,
          );

          if (!updatedItem) {
            throw new NotFoundError(`PR item not found for id ${item.id}`);
          }

          changedItems.push(updatedItem);
        }

        for (const item of inserts) {
          const itemMasterRow = itemMap.get(item.itemId);
          if (!itemMasterRow) {
            throw new BadRequestError(`Invalid itemId: ${item.itemId}`);
          }

          const createdItem = await prRepository.createPrItem(
            input.prId,
            {
              itemId: item.itemId,
              requestedQty: item.requestedQty,
              uom: itemMasterRow.uom,
              expectedDate: item.expectedDate ?? null,
            },
            tx,
          );

          if (!createdItem) {
            throw new BadRequestError("Failed to create PR item");
          }

          changedItems.push(createdItem);
        }
      }

      const recalculatedPr =
        await prRepository.recalculateEstimatedAmountByPrId(input.prId, tx);
      if (!recalculatedPr) {
        throw new NotFoundError("Purchase request not found");
      }
      responsePr = recalculatedPr;

      return {
        pr: responsePr,
        items: changedItems,
      };
    });
  },

  // BR-PR-33, 36: cancel one pending line while the header is approved /
  // partial_ordered. Requester or super-admin only. Lock order everywhere:
  // PR header first, then its lines (CRP-2); header recomputed after.
  // The body reason (3-500) is validated by the controller and stored on the
  // line with who/when.
  async cancelLine(prId: number, lineId: number, reason: string, actor: Actor) {
    return db.transaction(async (tx) => {
      const pr = await prRepository.findPrByIdForUpdate(prId, tx);
      if (!pr) {
        throw new NotFoundError("Purchase request not found", "PR_NOT_FOUND");
      }

      const line = await prRepository.findItemByIdForUpdate(lineId, tx);
      if (!line || line.prId !== prId) {
        throw new NotFoundError("PR line not found", "PR_LINE_NOT_FOUND");
      }

      if (pr.requestedBy !== actor.id && !actor.isSuperAdmin) {
        throw new ForbiddenError(
          "Only the requester or a super-admin can cancel a line of this PR",
          "PR_NOT_REQUESTER",
        );
      }

      if (line.status === "po_draft" || line.status === "ordered") {
        throw new ConflictError(
          "This line is on a purchase order. Cancel the PO first.",
          "PR_LINE_ON_LIVE_PO",
        );
      }

      if (line.status !== "pending") {
        throw new ConflictError(
          `A ${line.status} line cannot be cancelled`,
          "PR_LINE_NOT_PENDING",
        );
      }

      if (!["approved", "partial_ordered"].includes(pr.status)) {
        throw new ConflictError(
          `Cannot cancel a line of a PR in status ${pr.status}`,
          "PR_INVALID_TRANSITION",
        );
      }

      const item = await prRepository.cancelItem(
        lineId,
        { reason, actorId: actor.id },
        tx,
      );
      const header = await prRepository.recomputeHeaderStatusFromItems(
        prId,
        tx,
      );
      return { pr: header ?? pr, item };
    });
  },

  // BR-PR-39, 41, 42, 43, 46, 47: one transaction, row lock, status re-checked under the lock.
  async cancel(prId: number, reason: string, actor: Actor) {
    return db.transaction(async (tx) => {
      const pre = await prRepository.findPrById(prId, tx);
      if (!pre) {
        throw new NotFoundError("Purchase request not found", "PR_NOT_FOUND");
      }

      // Same lock order as approval actions (request, then PR) so they cannot deadlock.
      if (pre.status === "pending_approval") {
        const open = await approvalRepository.findPendingRequestByDoc(
          "pr",
          prId,
          tx,
        );
        if (open) {
          await approvalRepository.lockRequestById(open.id, tx);
        }
      }

      const pr = await prRepository.findPrByIdForUpdate(prId, tx);
      if (!pr) {
        throw new NotFoundError("Purchase request not found", "PR_NOT_FOUND");
      }

      if (pr.requestedBy !== actor.id && !actor.isSuperAdmin) {
        throw new ForbiddenError(
          "Only the requester or a super-admin can cancel this PR",
          "PR_NOT_REQUESTER",
        );
      }

      const ordered = await prRepository.findOrderedLinesWithLivePos(prId, tx);
      if (ordered.lineCount > 0) {
        const names =
          ordered.poNumbers.length > 0
            ? ` (${ordered.poNumbers.join(", ")})`
            : "";
        throw new ConflictError(
          `PR has lines on a purchase order${names}. Cancel the PO first, or cancel the pending lines one by one.`,
          "PR_HAS_ORDERED_LINES",
        );
      }

      if (!["draft", "pending_approval", "approved"].includes(pr.status)) {
        throw new ConflictError(
          `Cannot cancel a PR in status ${pr.status}`,
          "PR_INVALID_TRANSITION",
        );
      }

      const row = await prRepository.cancelPr(
        prId,
        { actorId: actor.id, reason },
        tx,
      );
      if (!row) {
        throw new NotFoundError("Purchase request not found", "PR_NOT_FOUND");
      }

      await approvalRepository.cancelOpenRequestForDocument(
        "pr",
        prId,
        undefined,
        { actorId: actor.id, notes: reason, tx },
      );

      return row;
    });
  },
};
