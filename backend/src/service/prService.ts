import { db } from "../db/client";
import { type Actor, can } from "../lib/auth-middleware";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors";
import { approvalRepository } from "../repository/approvalRepository";
import { prRepository } from "../repository/prRepository";
import type {
  createPrSchemaType,
  prListQuerySchemaType,
  prStatusSchemaType,
  updatePrSchemaType,
} from "../types/pr.types";

// Allowed forward moves per status. Empty array = terminal state.
const PR_STATUS_TRANSITIONS: Record<prStatusSchemaType, prStatusSchemaType[]> =
  {
    draft: ["pending_approval", "cancelled"],
    pending_approval: ["approved", "rejected", "cancelled"],
    approved: ["partial_ordered", "fully_ordered", "cancelled"],
    partial_ordered: ["fully_ordered", "cancelled"],
    fully_ordered: [],
    rejected: [],
    cancelled: [],
  };

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

function assertValidStatusTransition(
  current: prStatusSchemaType,
  next: prStatusSchemaType,
) {
  if (current === next) {
    return;
  }

  if (!PR_STATUS_TRANSITIONS[current].includes(next)) {
    throw new BadRequestError(`Cannot move PR from ${current} to ${next}`);
  }
}

const APPROVAL_OWNED_STATUSES = new Set<prStatusSchemaType>([
  "approved",
  "rejected",
  "partial_ordered",
  "fully_ordered",
]);

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
    const itemMap = await prRepository.findItemMasterByIds(itemIds);

    const missingItemIds = itemIds.filter((itemId) => !itemMap.has(itemId));
    if (missingItemIds.length > 0) {
      throw new BadRequestError(
        `Invalid itemId entries: ${missingItemIds.join(", ")}`,
      );
    }

    const normalizedItems = input.items.map((item) => {
      const itemMasterRow = itemMap.get(item.itemId);
      if (!itemMasterRow) {
        throw new BadRequestError(`Invalid itemId: ${item.itemId}`);
      }

      return {
        itemId: item.itemId,
        requestedQty: item.requestedQty,
        uom: itemMasterRow.uom,
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
    assertCanLinkMachine(actor, input.assetId);
    if (
      input.status !== undefined &&
      APPROVAL_OWNED_STATUSES.has(input.status)
    ) {
      throw new BadRequestError(
        "Use the approval action endpoint to approve or reject a PR",
      );
    }

    return db.transaction(async (tx) => {
      const existingPr = await prRepository.findPrById(input.prId, tx);
      if (!existingPr) {
        throw new NotFoundError("Purchase request not found");
      }

      const targetType = input.type ?? existingPr.type;
      const targetAssetId =
        input.assetId !== undefined ? input.assetId : existingPr.assetId;

      if (input.status !== undefined) {
        assertValidStatusTransition(existingPr.status, input.status);
      }

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
        ...(input.status !== undefined ? { status: input.status } : {}),
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

      const changedItems = [];
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

        for (const item of inserts) {
          finalItemIds.set(-(finalItemIds.size + 1), item.itemId);
        }

        const uniqueFinalItemIds = new Set<number>();
        for (const itemId of finalItemIds.values()) {
          if (uniqueFinalItemIds.has(itemId)) {
            throw new BadRequestError("Item already exists");
          }
          uniqueFinalItemIds.add(itemId);
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

        const missingItemIds = requestedItemIds.filter(
          (itemId) => !itemMap.has(itemId),
        );
        if (missingItemIds.length > 0) {
          throw new BadRequestError(
            `Invalid itemId entries: ${missingItemIds.join(", ")}`,
          );
        }

        if (deleteIds.size > 0) {
          await prRepository.deletePrItemsByIds(input.prId, [...deleteIds], tx);
        }

        for (const item of updates) {
          const updateItemData = {
            ...(item.requestedQty !== undefined
              ? { requestedQty: item.requestedQty }
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

  async cancel(prId: number) {
    const existingPr = await prRepository.findPrById(prId);
    if (!existingPr) {
      throw new NotFoundError("Purchase request not found");
    }

    assertValidStatusTransition(existingPr.status, "cancelled");

    const row = await prRepository.setStatusCancelled(prId);
    if (!row) {
      throw new NotFoundError("Purchase request not found");
    }

    await approvalRepository.cancelOpenRequestForDocument("pr", prId);

    return row;
  },
};
