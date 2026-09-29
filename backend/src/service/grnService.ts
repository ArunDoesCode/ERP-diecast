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

// Over-receipt tolerance: 5% above the PO line's ordered qty (BR-GRN-15).
// Beyond that, the actor needs the override right and a reason.
const OVER_RECEIPT_TOLERANCE_RATIO = 1.05;
const OVER_RECEIPT_OVERRIDE_ROLES: Role[] = [
  "super-admin",
  "owner",
  "back_office",
]; // perm: grn.over_receipt_override

const toMilli = (qty: number) => Math.round(qty * 1000);

// Accept / bypass only while the PO can still receive goods (BR-GRN-01).
const RECEIVABLE_PO_STATUSES = ["dispatched", "partial_received"];

// Corrections are blocked once the PO is invoiced or closed (BR-GRN-34).
const CORRECTABLE_PO_STATUSES = [
  "dispatched",
  "partial_received",
  "fully_received",
];

// Units counted in whole pieces (BR-GRN-02).
const WHOLE_NUMBER_UNITS = ["pcs", "set", "sets", "nos"];

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Returns the qty past the tolerance (to be stored on the line), or null when
// within tolerance. Runs under the PO-line row lock, so `existingReceivedQty`
// is the latest value.
function overReceiptGuard(
  orderedQty: number,
  existingReceivedQty: number,
  incomingQty: number,
  actorRole: Role,
  overrideReason: string | undefined,
) {
  const toleranceMilli = Math.round(
    toMilli(orderedQty) * OVER_RECEIPT_TOLERANCE_RATIO,
  );
  const excessMilli =
    toMilli(existingReceivedQty) + toMilli(incomingQty) - toleranceMilli;
  if (excessMilli <= 0) {
    return null;
  }
  if (!OVER_RECEIPT_OVERRIDE_ROLES.includes(actorRole)) {
    throw new BadRequestError(
      `Accepted quantity would exceed 105% of the ordered qty (${orderedQty}). ` +
        "You do not have the right to override an over-receipt.",
    );
  }
  if (!overrideReason) {
    throw new BadRequestError(
      `Accepted quantity would exceed 105% of the ordered qty (${orderedQty}). ` +
        "Give an overrideReason to accept the excess.",
    );
  }
  return {
    overReceiptExcessQty: excessMilli / 1000,
    overReceiptReason: overrideReason,
  };
}

async function assertPoReceivable(
  poId: number,
  tx: Parameters<typeof poRepository.findPoById>[1],
) {
  const po = await poRepository.findPoById(poId, tx);
  if (!po) {
    throw new NotFoundError("Purchase order not found");
  }
  if (!RECEIVABLE_PO_STATUSES.includes(po.status)) {
    throw new ConflictError(
      `Purchase order is ${po.status} - goods can no longer be received against it`,
    );
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

// Draft-only guard (BR-GRN-06): locks the GRN row, re-checks status and that
// no line has been decided, inside the caller's transaction.
async function lockDraftGrn(
  grnId: number,
  tx: Parameters<typeof grnRepository.lockGrn>[1],
  message: string,
) {
  const grn = await grnRepository.lockGrn(grnId, tx);
  if (!grn) {
    throw new NotFoundError("GRN not found");
  }
  if (grn.status !== "draft") {
    throw new BadRequestError(message);
  }
  const lines = await grnRepository.findGrnItemsByGrnId(grnId, tx);
  if (lines.some((l) => l.isQaBypassed || l.qaStatus !== "pending")) {
    throw new BadRequestError(message);
  }
  return grn;
}

// BR-GRN-05: same challan from the same supplier only once. Also maps the
// unique-index error of a racing write to the same plain 409.
function duplicateChallan(challanNo: string) {
  return new ConflictError(
    `Challan ${challanNo} is already recorded for this supplier`,
  );
}

function mapChallanClash(error: unknown, challanNo: string | undefined) {
  const e = error as { code?: string; cause?: { code?: string } };
  if (challanNo && (e?.code ?? e?.cause?.code) === "23505") {
    return duplicateChallan(challanNo);
  }
  return error;
}

async function applyDraftUpdate(
  input: updateGrnSchemaType,
  tx: Parameters<typeof grnRepository.lockGrn>[1],
) {
  const grn = await lockDraftGrn(
    input.grnId,
    tx,
    "GRN can only be edited while in draft status — use the correction endpoint for a posted line.",
  ); // BR-GRN-06

  // Same whole-number rule as create (BR-GRN-02), checked before any write.
  if (input.lines.length > 0) {
    const uoms = await grnRepository.findLineUoms(input.grnId);
    for (const line of input.lines) {
      const uom = uoms.get(line.id)?.trim().toLowerCase();
      if (
        uom &&
        WHOLE_NUMBER_UNITS.includes(uom) &&
        !Number.isInteger(line.arrivedQty)
      ) {
        throw new BadRequestError(
          `Arrived qty must be a whole number for items in ${uom}`,
        );
      }
    }
  }

  if (input.challanNo !== undefined) {
    const clash = await grnRepository.findByChallan(
      grn.supplierId,
      input.challanNo,
      input.grnId,
    );
    if (clash) {
      throw duplicateChallan(input.challanNo);
    }
  }

  const headerData = {
    ...(input.challanNo !== undefined ? { challanNo: input.challanNo } : {}),
    ...(input.challanDate !== undefined
      ? { challanDate: input.challanDate }
      : {}),
    ...(input.vehicleNo !== undefined ? { vehicleNo: input.vehicleNo } : {}),
    ...(input.driverName !== undefined ? { driverName: input.driverName } : {}),
    ...(input.driverPhone !== undefined
      ? { driverPhone: input.driverPhone }
      : {}),
    ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
  };
  if (Object.keys(headerData).length > 0) {
    await grnRepository.updateHeader(input.grnId, headerData, tx);
  }

  for (const line of input.lines) {
    const updated = await grnRepository.updateLineArrivedQty(
      input.grnId,
      line.id,
      line.arrivedQty,
      line.batchNumber,
      tx,
    );
    if (!updated) {
      throw new NotFoundError(`GRN line not found for id ${line.id}`);
    }
  }
}

// Locks GRN header then PO row, in that order everywhere (no deadlocks).
async function lockGrnAndPo(
  grnId: number,
  tx: Parameters<typeof grnRepository.lockGrn>[1],
) {
  const grn = await grnRepository.lockGrn(grnId, tx);
  if (!grn) {
    throw new NotFoundError("GRN not found");
  }
  if (grn.poId != null) {
    await grnRepository.lockPo(grn.poId, tx);
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
    if (new Set(poItemIds).size !== poItemIds.length) {
      throw new BadRequestError("A PO line can appear only once per GRN");
    }
    const poItems = await grnRepository.findPoItemsByIds(po.id, poItemIds);
    const poItemMap = new Map(poItems.map((item) => [item.id, item]));

    const missingIds = poItemIds.filter((id) => !poItemMap.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestError(
        `Invalid poItemId entries for this PO: ${missingIds.join(", ")}`,
      );
    }

    for (const line of input.lines) {
      const uom = poItemMap.get(line.poItemId)?.uom.trim().toLowerCase();
      if (
        uom &&
        WHOLE_NUMBER_UNITS.includes(uom) &&
        !Number.isInteger(line.arrivedQty)
      ) {
        throw new BadRequestError(
          `Arrived qty must be a whole number for items in ${uom}`,
        );
      }
    }

    if (await grnRepository.findByChallan(po.supplierId, input.challanNo)) {
      throw duplicateChallan(input.challanNo);
    }

    try {
      return await grnRepository.createWithItems(
        {
          poId: po.id,
          supplierId: po.supplierId,
          createdBy: actorId,
          challanNo: input.challanNo,
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
    } catch (error) {
      // Two creates racing past the check above: the unique index decides.
      throw mapChallanClash(error, input.challanNo);
    }
  },

  async update(input: updateGrnSchemaType) {
    try {
      await grnRepository.withTransaction((tx) => applyDraftUpdate(input, tx));
    } catch (error) {
      throw mapChallanClash(error, input.challanNo);
    }
    return grnRepository.getDetails(input.grnId);
  },

  async remove(grnId: number) {
    return grnRepository.withTransaction(async (tx) => {
      await lockDraftGrn(
        grnId,
        tx,
        "Only draft GRNs can be deleted — use the correction endpoint for a posted line.",
      ); // BR-GRN-06
      const deleted = await grnRepository.deleteGrnWithItems(grnId, tx);
      if (!deleted) {
        throw new NotFoundError("GRN not found");
      }
      return { id: deleted.id };
    });
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
      await lockGrnAndPo(grnId, tx);
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

      if (
        toMilli(acceptedQty) + toMilli(rejectedQty) !==
        toMilli(line.receivedQty)
      ) {
        throw new BadRequestError(
          `Accepted (${acceptedQty}) + rejected (${rejectedQty}) must equal the arrived qty (${line.receivedQty})`,
        );
      }

      const batchNumber = input.batchNumber ?? line.batchNumber ?? null;

      let overReceipt: ReturnType<typeof overReceiptGuard> = null;
      if (acceptedQty > 0) {
        await assertPoReceivable(line.poId, tx);
        overReceipt = overReceiptGuard(
          line.orderedQty,
          line.poItemReceivedQty ?? 0,
          acceptedQty,
          actorRole,
          input.overrideReason,
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
          // BR-GRN-10: passed if accepted > 0, else failed
          // BR-GRN-13: rejected qty never goes into stock (only accepted is posted)
          qaStatus: acceptedQty > 0 ? "passed" : "failed",
          batchNumber,
          ...(overReceipt ? { ...overReceipt, overReceiptBy: actorId } : {}),
        },
        tx,
      );
      // BR-GRN-12: one QA test row per decision (tester, time, remarks, url)
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
        // BR-GRN-27: accepted qty rolls into the PO line, PO status follows
        await poRepository.incrementPoItemReceivedQty(
          line.poItemId,
          acceptedQty,
          tx,
        );
        await poService.recomputeReceiptStatus(line.poId, tx);
      }
      await recomputeGrnHeaderStatus(grnId, tx); // BR-GRN-25
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
      await lockGrnAndPo(grnId, tx);
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

      if (toMilli(acceptedQty) > toMilli(line.receivedQty)) {
        throw new BadRequestError(
          `Accepted qty (${acceptedQty}) cannot exceed the arrived qty (${line.receivedQty})`,
        );
      }
      const rejectedQty =
        (toMilli(line.receivedQty) - toMilli(acceptedQty)) / 1000;

      await assertPoReceivable(line.poId, tx);
      const overReceipt = overReceiptGuard(
        line.orderedQty,
        line.poItemReceivedQty ?? 0,
        acceptedQty,
        actorRole,
        input.overrideReason,
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
          rejectedQty,
          qaStatus: "waived",
          isQaBypassed: true,
          qaBypassReason: input.bypassReason,
          qaBypassedBy: actorId,
          qaBypassedAt: new Date(), // BR-GRN-12: who, when, why
          batchNumber,
          ...(overReceipt ? { ...overReceipt, overReceiptBy: actorId } : {}),
        },
        tx,
      );
      await poRepository.incrementPoItemReceivedQty(
        line.poItemId,
        acceptedQty,
        tx,
      );
      await poService.recomputeReceiptStatus(line.poId, tx);
      await recomputeGrnHeaderStatus(grnId, tx); // BR-GRN-25
      return updatedLine;
    });
  },

  // Correction after posting — one `grn_correction` ledger row, a correction
  // record and the PO line's received qty rolled back, in one transaction.
  // Does not mutate the original GRN line row; audit trail stays intact.
  async correction(
    grnId: number,
    lineId: number,
    input: grnCorrectionSchemaType,
    actorId: number,
  ) {
    return grnRepository.withTransaction(async (tx) => {
      await lockGrnAndPo(grnId, tx);
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

      const po = await poRepository.findPoById(line.poId, tx);
      if (!po) {
        throw new NotFoundError("Purchase order not found");
      }
      if (!CORRECTABLE_PO_STATUSES.includes(po.status)) {
        throw new ConflictError(
          `Purchase order is ${po.status} - a received line can no longer be corrected`,
        );
      }

      const alreadyCorrected = await grnRepository.sumCorrections(lineId, tx);
      if (
        toMilli(alreadyCorrected) + toMilli(input.qty) >
        toMilli(line.acceptedQty)
      ) {
        throw new BadRequestError(
          `Corrections (${alreadyCorrected} already + ${input.qty}) cannot exceed the line's accepted qty (${line.acceptedQty}).`,
        );
      }

      const posted0 = await grnRepository.findPostedRow(lineId, tx);
      const locationId =
        posted0?.locationId ??
        (await grnRepository.findDefaultReceivingLocationId(tx));
      const posted = await postStock(tx, {
        itemId: line.itemId,
        locationId,
        transactionType: "adjustment",
        referenceType: "grn_correction",
        referenceId: grnId,
        referenceLineId: lineId,
        batchNumber: line.batchNumber,
        quantityChange: -input.qty,
        unitCostPaise: posted0?.unitCostPaise ?? line.unitPricePaise,
        averageEffect: "out_at_cost", // BR-GRN-39
        blockNegative: true,
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
      await poService.recomputeReceiptStatus(line.poId, tx);
      return posted;
    });
  },
};
