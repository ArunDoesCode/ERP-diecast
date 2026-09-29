import {
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
} from "../lib/errors";
import type { Role } from "../lib/token";
import { grnRepository } from "../repository/grnRepository";
import { poRepository } from "../repository/poRepository";
import { postStock } from "../repository/stockPostingRepository";
import { poService } from "../service/poService";
import type {
  createGrnSchemaType,
  grnBypassSchemaType,
  grnCorrectionSchemaType,
  grnListQuerySchemaType,
  grnQaActionSchemaType,
  updateGrnSchemaType,
} from "../types/grn.types";

// Over-receipt tolerance: 5% above the PO line's ordered qty. Beyond that,
// only owner/back_office may proceed (see overReceiptGuard).
const OVER_RECEIPT_TOLERANCE_RATIO = 1.05;
const OVER_RECEIPT_OVERRIDE_ROLES: Role[] = ["owner", "back_office"];

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function overReceiptGuard(
  orderedQty: number,
  existingReceivedQty: number,
  incomingQty: number,
  actorRole: Role,
) {
  const tolerance = orderedQty * OVER_RECEIPT_TOLERANCE_RATIO;
  if (existingReceivedQty + incomingQty > tolerance) {
    if (!OVER_RECEIPT_OVERRIDE_ROLES.includes(actorRole)) {
      throw new BadRequestError(
        `Accepted quantity would exceed 105% of the ordered qty (${orderedQty}). ` +
          "Only owner/back_office can override an over-receipt.",
      );
    }
  }
}

// Recomputes a GRN header's status from its lines' current disposition.
// draft is the only status set at create() time — this only ever moves the
// header away from draft, never back into it.
async function recomputeGrnHeaderStatus(
  grnId: number,
  tx: Parameters<typeof grnRepository.findGrnItemsByGrnId>[1],
) {
  const items = await grnRepository.findGrnItemsByGrnId(grnId, tx);
  if (items.length === 0) {
    return;
  }

  const isFinalized = (item: (typeof items)[number]) =>
    item.isQaBypassed ||
    item.qaStatus === "passed" ||
    item.qaStatus === "failed";
  const isAccepted = (item: (typeof items)[number]) =>
    item.isQaBypassed || item.qaStatus === "passed";
  const isRejected = (item: (typeof items)[number]) =>
    !item.isQaBypassed && item.qaStatus === "failed";

  const allFinalized = items.every(isFinalized);
  const allAccepted = items.every(isAccepted);
  const allRejected = items.every(isRejected);

  const nextStatus = allFinalized
    ? allAccepted
      ? "accepted"
      : allRejected
        ? "rejected"
        : "partial_accepted"
    : "pending_qa";

  const current = await grnRepository.findGrnById(grnId, tx);
  if (current && current.status !== nextStatus) {
    await grnRepository.setGrnStatus(grnId, nextStatus, tx);
  }
}

export const grnService = {
  async getDetails(grnId: number) {
    const row = await grnRepository.getDetails(grnId);
    if (!row) {
      throw new NotFoundError("GRN not found");
    }
    return row;
  },

  async list(params: grnListQuerySchemaType) {
    const { rows, total } = await grnRepository.list(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async create(input: createGrnSchemaType, actorId: number) {
    const po = await grnRepository.findPoForGrn(input.poId);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }

    if (po.status !== "dispatched" && po.status !== "partial_received") {
      throw new BadRequestError(
        `Purchase order must be dispatched or partial_received to record a GRN (current: ${po.status})`,
      );
    }

    const poItemIds = input.lines.map((line) => line.poItemId);
    const poItems = await grnRepository.findPoItemsByIds(po.id, poItemIds);
    const poItemMap = new Map(poItems.map((item) => [item.id, item]));

    const missingIds = poItemIds.filter((id) => !poItemMap.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestError(
        `Invalid poItemId entries for this PO: ${missingIds.join(", ")}`,
      );
    }

    return grnRepository.createWithItems(
      {
        poId: po.id,
        supplierId: po.supplierId,
        createdBy: actorId,
        challanNo: input.challanNo ?? null,
        challanDate: input.challanDate ?? null,
        vehicleNo: input.vehicleNo ?? null,
        driverName: input.driverName ?? null,
        driverPhone: input.driverPhone ?? null,
        remarks: input.remarks ?? null,
      },
      input.lines.map((line) => ({
        poItemId: line.poItemId,
        arrivedQty: line.arrivedQty,
        batchNumber: line.batchNumber ?? null,
      })),
    );
  },

  async update(input: updateGrnSchemaType) {
    const grn = await grnRepository.findGrnById(input.grnId);
    if (!grn) {
      throw new NotFoundError("GRN not found");
    }

    if (grn.status !== "draft") {
      throw new BadRequestError(
        "GRN can only be edited while in draft status — use the correction endpoint for a posted line.",
      );
    }

    const headerData = {
      ...(input.challanNo !== undefined ? { challanNo: input.challanNo } : {}),
      ...(input.challanDate !== undefined
        ? { challanDate: input.challanDate }
        : {}),
      ...(input.vehicleNo !== undefined ? { vehicleNo: input.vehicleNo } : {}),
      ...(input.driverName !== undefined
        ? { driverName: input.driverName }
        : {}),
      ...(input.driverPhone !== undefined
        ? { driverPhone: input.driverPhone }
        : {}),
      ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
    };

    if (Object.keys(headerData).length > 0) {
      await grnRepository.updateHeader(input.grnId, headerData);
    }

    for (const line of input.lines) {
      const updated = await grnRepository.updateLineArrivedQty(
        input.grnId,
        line.id,
        line.arrivedQty,
      );
      if (!updated) {
        throw new NotFoundError(`GRN line not found for id ${line.id}`);
      }
    }

    return grnRepository.getDetails(input.grnId);
  },

  async remove(grnId: number) {
    const grn = await grnRepository.findGrnById(grnId);
    if (!grn) {
      throw new NotFoundError("GRN not found");
    }

    if (grn.status !== "draft") {
      throw new BadRequestError(
        "Only draft GRNs can be deleted — use the correction endpoint for a posted line.",
      );
    }

    const deleted = await grnRepository.deleteGrnWithItems(grnId);
    if (!deleted) {
      throw new NotFoundError("GRN not found");
    }

    return { id: deleted.id };
  },

  // QA decision on one line. One transaction: line lock, ledger row, item
  // stock + average, line, QA row, PO line, PO and GRN status (BR-GRN-22).
  // acceptedQty > 0 posts stock; acceptedQty = 0 is a full reject (no posting).
  async qaAction(
    grnId: number,
    lineId: number,
    input: grnQaActionSchemaType,
    actorId: number,
    actorRole: Role,
  ) {
    const acceptedQty = input.acceptedQty;
    const rejectedQty = input.rejectedQty;

    return grnRepository.withTransaction(async (tx) => {
      const line = await grnRepository.findGrnItemForUpdate(grnId, lineId, tx);
      if (!line) {
        throw new NotFoundError("GRN line not found");
      }
      if (line.poItemId == null || line.poId == null) {
        throw new InternalServerError(
          "GRN line is missing its purchase order item link",
        );
      }
      if (line.isQaBypassed || line.qaStatus !== "pending") {
        throw new ConflictError(
          "GRN line has already been finalized (accepted, rejected, or bypassed)",
        );
      }

      const batchNumber = input.batchNumber ?? line.batchNumber ?? null;

      if (acceptedQty > 0) {
        overReceiptGuard(
          line.orderedQty,
          line.poItemReceivedQty ?? 0,
          acceptedQty,
          actorRole,
        );
        const locationId =
          await grnRepository.findDefaultReceivingLocationId(tx);
        await postStock(tx, {
          itemId: line.itemId,
          locationId,
          transactionType: "in",
          referenceType: "grn",
          referenceId: grnId,
          referenceLineId: lineId,
          batchNumber,
          quantityChange: acceptedQty,
          unitCostPaise: line.unitPricePaise,
          notes: `GRN #${grnId} line #${lineId} QA accept`,
          createdBy: actorId,
        });
      }

      const updatedLine = await grnRepository.updateGrnItemLine(
        lineId,
        {
          acceptedQty,
          rejectedQty,
          qaStatus: acceptedQty > 0 ? "passed" : "failed",
          batchNumber,
        },
        tx,
      );
      await grnRepository.insertQaTest(
        {
          grnItemId: lineId,
          status: acceptedQty > 0 ? "passed" : "failed",
          testReportUrl: input.certificateUrl ?? null,
          notes: input.remarks ?? null,
          testedBy: actorId,
        },
        tx,
      );
      if (acceptedQty > 0) {
        await poRepository.incrementPoItemReceivedQty(
          line.poItemId,
          acceptedQty,
          tx,
        );
        await poService.recomputeReceiptStatus(line.poId, tx);
      }
      await recomputeGrnHeaderStatus(grnId, tx);
      return updatedLine;
    });
  },

  // QA bypass — mandatory reason, posts immediately with referenceType
  // `grn_bypass`, in one transaction like the accept path.
  async bypass(
    grnId: number,
    lineId: number,
    input: grnBypassSchemaType,
    actorId: number,
    actorRole: Role,
  ) {
    return grnRepository.withTransaction(async (tx) => {
      const line = await grnRepository.findGrnItemForUpdate(grnId, lineId, tx);
      if (!line) {
        throw new NotFoundError("GRN line not found");
      }
      if (line.poItemId == null || line.poId == null) {
        throw new InternalServerError(
          "GRN line is missing its purchase order item link",
        );
      }
      if (line.isQaBypassed || line.qaStatus !== "pending") {
        throw new ConflictError(
          "GRN line has already been finalized (accepted, rejected, or bypassed)",
        );
      }

      const acceptedQty = input.acceptedQty ?? line.receivedQty;
      const batchNumber = input.batchNumber ?? line.batchNumber ?? null;

      overReceiptGuard(
        line.orderedQty,
        line.poItemReceivedQty ?? 0,
        acceptedQty,
        actorRole,
      );

      const locationId = await grnRepository.findDefaultReceivingLocationId(tx);
      await postStock(tx, {
        itemId: line.itemId,
        locationId,
        transactionType: "in",
        referenceType: "grn_bypass",
        referenceId: grnId,
        referenceLineId: lineId,
        batchNumber,
        quantityChange: acceptedQty,
        unitCostPaise: line.unitPricePaise,
        notes: `GRN #${grnId} line #${lineId} QA bypass: ${input.bypassReason}`,
        createdBy: actorId,
      });

      const updatedLine = await grnRepository.updateGrnItemLine(
        lineId,
        {
          acceptedQty,
          qaStatus: "waived",
          isQaBypassed: true,
          qaBypassReason: input.bypassReason,
          qaBypassedBy: actorId,
          batchNumber,
        },
        tx,
      );
      await poRepository.incrementPoItemReceivedQty(
        line.poItemId,
        acceptedQty,
        tx,
      );
      await poService.recomputeReceiptStatus(line.poId, tx);
      await recomputeGrnHeaderStatus(grnId, tx);
      return updatedLine;
    });
  },

  // Correction after posting — one `grn_correction` ledger row, a correction
  // record and the PO line's received qty rolled back, in one transaction.
  // Does not mutate the original GRN line row; audit trail stays intact.
  // (Sum-of-corrections, negative-balance and PO status rules: slice S4.)
  async correction(
    grnId: number,
    lineId: number,
    input: grnCorrectionSchemaType,
    actorId: number,
  ) {
    return grnRepository.withTransaction(async (tx) => {
      const line = await grnRepository.findGrnItemForUpdate(grnId, lineId, tx);
      if (!line) {
        throw new NotFoundError("GRN line not found");
      }
      if (line.poItemId == null || line.poId == null) {
        throw new InternalServerError(
          "GRN line is missing its purchase order item link",
        );
      }

      if (!line.isQaBypassed && line.qaStatus !== "passed") {
        throw new BadRequestError(
          "This GRN line has not posted to inventory yet — nothing to correct.",
        );
      }

      if (input.qty > line.acceptedQty) {
        throw new BadRequestError(
          `Correction qty (${input.qty}) cannot exceed the line's accepted qty (${line.acceptedQty}).`,
        );
      }

      const locationId = await grnRepository.findDefaultReceivingLocationId(tx);
      const posted = await postStock(tx, {
        itemId: line.itemId,
        locationId,
        transactionType: "adjustment",
        referenceType: "grn_correction",
        referenceId: grnId,
        referenceLineId: lineId,
        batchNumber: line.batchNumber,
        quantityChange: -input.qty,
        unitCostPaise: line.unitPricePaise,
        averageEffect: "out_at_cost",
        notes: `GRN correction for GRN #${grnId} line #${lineId}: ${input.reason}`,
        createdBy: actorId,
      });
      await grnRepository.insertCorrection(
        {
          grnItemId: lineId,
          qty: input.qty,
          reason: input.reason,
          createdBy: actorId,
        },
        tx,
      );
      await poRepository.incrementPoItemReceivedQty(
        line.poItemId,
        -input.qty,
        tx,
      );
      return posted;
    });
  },
};
