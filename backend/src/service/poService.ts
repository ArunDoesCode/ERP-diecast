import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { approvalRepository } from "../repository/approvalRepository";
import type { Tx } from "../repository/poRepository";
import { poRepository } from "../repository/poRepository";
import type {
  closePoSchemaType,
  confirmPoSchemaType,
  createPoSchemaType,
  logPoCommunicationSchemaType,
  markPoInvoicedSchemaType,
  markPoSentSchemaType,
  poListQuerySchemaType,
  poStatusSchemaType,
  updatePoDelaySchemaType,
  updatePoSchemaType,
} from "../types/po.types";

// Allowed forward moves per status. Empty array = terminal state. Only
// draft/pending_approval/approved/cancelled are reachable by anything built
// so far — the rest is pre-wired for the GRN/invoicing phase.
//
// Deviation from the original set: `dispatched` also allows a direct jump to
// `fully_received` — a single GRN pass can fully receive every line without
// ever passing through `partial_received` (grnService.recomputeReceiptStatus
// needs this edge to be legal).
const PO_STATUS_TRANSITIONS: Record<poStatusSchemaType, poStatusSchemaType[]> =
  {
    draft: ["pending_approval", "cancelled"],
    pending_approval: ["approved", "cancelled"],
    approved: ["dispatched", "cancelled"],
    dispatched: ["partial_received", "fully_received", "cancelled"],
    partial_received: ["fully_received", "cancelled"],
    fully_received: ["invoiced", "closed"],
    invoiced: ["closed"],
    closed: [],
    cancelled: [],
  };

function assertValidStatusTransition(
  current: poStatusSchemaType,
  next: poStatusSchemaType,
) {
  if (current === next) {
    return;
  }

  if (!PO_STATUS_TRANSITIONS[current].includes(next)) {
    throw new BadRequestError(`Cannot move PO from ${current} to ${next}`);
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

async function assertLinesAreDraftable(prItemIds: number[]) {
  const uniqueIds = [...new Set(prItemIds)];
  if (uniqueIds.length !== prItemIds.length) {
    throw new BadRequestError("Duplicate prItemId in the same request");
  }

  const rows = await poRepository.findPurchaseRequestItemsByIds(uniqueIds);
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const missingIds = uniqueIds.filter((id) => !rowById.has(id));
  if (missingIds.length > 0) {
    throw new BadRequestError(
      `Invalid prItemId entries: ${missingIds.join(", ")}`,
    );
  }

  for (const id of uniqueIds) {
    const row = rowById.get(id);
    if (!row) {
      continue;
    }

    if (row.status !== "pending") {
      throw new BadRequestError(
        `PR item ${id} is not in pending status (current: ${row.status})`,
      );
    }

    if (row.prStatus !== "approved" && row.prStatus !== "partial_ordered") {
      throw new BadRequestError(
        `PR item ${id}'s parent PR must be approved or partial_ordered (current: ${row.prStatus})`,
      );
    }
  }
}

export const poService = {
  async getDetails(poId: number) {
    const row = await poRepository.getDetails(poId);
    if (!row) {
      throw new NotFoundError("Purchase order not found");
    }

    return row;
  },

  async list(params: poListQuerySchemaType) {
    const { rows, total } = await poRepository.list(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async create(input: createPoSchemaType, actorId: number) {
    const supplier = await poRepository.findSupplierById(input.supplierId);
    if (!supplier?.isActive) {
      throw new NotFoundError("Supplier not found or inactive");
    }

    const prItemIds = input.lines.map((line) => line.prItemId);
    await assertLinesAreDraftable(prItemIds);

    return poRepository.createWithItems(
      {
        supplierId: input.supplierId,
        paymentTermsDays: input.paymentTermsDays ?? 0,
        deliveryTerms: input.deliveryTerms ?? null,
        expectedDeliveryDate: input.expectedDeliveryDate ?? null,
        notes: input.notes ?? null,
        createdBy: actorId,
      },
      input.lines.map((line) => ({
        prItemId: line.prItemId,
        unitPricePaise: line.unitPricePaise,
      })),
    );
  },

  async update(input: updatePoSchemaType) {
    const existingPo = await poRepository.findPoById(input.poId);
    if (!existingPo) {
      throw new NotFoundError("Purchase order not found");
    }

    if (existingPo.status !== "draft") {
      throw new BadRequestError(
        "Purchase order can only be updated while in draft status",
      );
    }

    const insertPrItemIds = input.inserts.map((line) => line.prItemId);
    if (insertPrItemIds.length > 0) {
      await assertLinesAreDraftable(insertPrItemIds);
    }

    const headerData = {
      ...(input.paymentTermsDays !== undefined
        ? { paymentTermsDays: input.paymentTermsDays }
        : {}),
      ...(input.deliveryTerms !== undefined
        ? { deliveryTerms: input.deliveryTerms }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.expectedDeliveryDate !== undefined
        ? { expectedDeliveryDate: input.expectedDeliveryDate }
        : {}),
    };

    return poRepository.updateWithItems(
      input.poId,
      headerData,
      input.inserts,
      input.updates,
      input.deletes,
    );
  },

  async cancel(poId: number, reason?: string) {
    const existingPo = await poRepository.findPoById(poId);
    if (!existingPo) {
      throw new NotFoundError("Purchase order not found");
    }

    if (await poRepository.hasGrnForPo(poId)) {
      throw new ConflictError(
        "Purchase order has GRN(s) recorded and cannot be cancelled.",
      );
    }

    // A draft "cancel" is really a discard — no reason needed. Anything
    // already submitted (pending_approval/approved/dispatched) requires one.
    if (existingPo.status !== "draft" && !reason?.trim()) {
      throw new BadRequestError(
        "A reason is required to cancel a purchase order that is no longer a draft.",
      );
    }

    assertValidStatusTransition(existingPo.status, "cancelled");

    await approvalRepository.cancelOpenRequestForDocument("po", poId, reason);

    const row = await poRepository.setStatusCancelled(poId);
    if (!row) {
      throw new NotFoundError("Purchase order not found");
    }

    return row;
  },

  // approved -> dispatched, logs a `po_sent` communication row. This is the
  // "sent to supplier" action — reuses the existing `dispatched` status,
  // no new enum value.
  async markSent(poId: number, input: markPoSentSchemaType, actorId: number) {
    const existingPo = await poRepository.findPoById(poId);
    if (!existingPo) {
      throw new NotFoundError("Purchase order not found");
    }

    assertValidStatusTransition(existingPo.status, "dispatched");

    await poRepository.insertCommunication({
      poId,
      type: "po_sent",
      channel: input.channel,
      toEmail: input.toEmail ?? null,
      note: input.note ?? null,
      sentBy: actorId,
    });

    const row = await poRepository.setStatusDispatched(poId);
    if (!row) {
      throw new NotFoundError("Purchase order not found");
    }

    return row;
  },

  // Log-only actions for the overdue queue — no status change.
  async logReminder(
    poId: number,
    input: logPoCommunicationSchemaType,
    actorId: number,
  ) {
    const po = await poRepository.findPoById(poId);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }

    return poRepository.insertCommunication({
      poId,
      type: "reminder",
      channel: input.channel,
      toEmail: input.toEmail ?? null,
      note: input.note ?? null,
      sentBy: actorId,
    });
  },

  async escalate(
    poId: number,
    input: logPoCommunicationSchemaType,
    actorId: number,
  ) {
    const po = await poRepository.findPoById(poId);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }

    return poRepository.insertCommunication({
      poId,
      type: "escalation",
      channel: input.channel,
      toEmail: input.toEmail ?? null,
      note: input.note ?? null,
      sentBy: actorId,
    });
  },

  // Patches revisedDeliveryDate/delayReason — expectedDeliveryDate itself is
  // never overwritten, kept as the original promise for audit purposes.
  async updateDelay(poId: number, input: updatePoDelaySchemaType) {
    const po = await poRepository.findPoById(poId);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }

    const row = await poRepository.updatePoById(poId, {
      ...(input.revisedDeliveryDate !== undefined
        ? { revisedDeliveryDate: input.revisedDeliveryDate }
        : {}),
      ...(input.delayReason !== undefined
        ? { delayReason: input.delayReason }
        : {}),
    });

    if (!row) {
      throw new NotFoundError("Purchase order not found");
    }

    return row;
  },

  // Supplier confirmation of receipt/acceptance of the PO — informational
  // only, never blocks any status transition.
  async confirmSupplier(
    poId: number,
    input: confirmPoSchemaType,
    actorId: number,
  ) {
    const po = await poRepository.findPoById(poId);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }

    const row = await poRepository.updatePoById(poId, {
      supplierConfirmed: true,
      confirmationMethod: input.confirmationMethod,
      confirmationNote: input.note ?? null,
      confirmedAt: new Date(),
      confirmedBy: actorId,
    });

    if (!row) {
      throw new NotFoundError("Purchase order not found");
    }

    return row;
  },

  // Records a supplier invoice against a fully-received PO and moves it to
  // `invoiced`. Full 3-way-match/payment workflow is a future AP feature —
  // this only creates the supplierInvoices row with matchStatus/paymentStatus
  // left at their table defaults ('pending'/'unpaid').
  async markInvoiced(poId: number, input: markPoInvoicedSchemaType) {
    const existingPo = await poRepository.findPoById(poId);
    if (!existingPo) {
      throw new NotFoundError("Purchase order not found");
    }

    assertValidStatusTransition(existingPo.status, "invoiced");

    await poRepository.insertSupplierInvoice({
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      poId,
      supplierId: existingPo.supplierId,
      billedAmountPaise: input.billedAmountPaise,
      dueDate: input.dueDate ?? null,
    });

    const row = await poRepository.setStatus(poId, "invoiced");
    if (!row) {
      throw new NotFoundError("Purchase order not found");
    }

    return row;
  },

  // Terminal close. Legal directly from `fully_received` OR `invoiced` per
  // PO_STATUS_TRANSITIONS — both are intentional (a PO can be closed without
  // a formal invoice on file if the business process doesn't require one).
  async close(poId: number, input: closePoSchemaType, actorId: number) {
    const existingPo = await poRepository.findPoById(poId);
    if (!existingPo) {
      throw new NotFoundError("Purchase order not found");
    }

    assertValidStatusTransition(existingPo.status, "closed");

    await poRepository.updatePoById(poId, {
      closedAt: new Date(),
      closedBy: actorId,
      closeNote: input.note ?? null,
    });

    const row = await poRepository.setStatus(poId, "closed");
    if (!row) {
      throw new NotFoundError("Purchase order not found");
    }

    return row;
  },

  // Recomputes a PO's receipt status after a GRN line posts (accept/bypass).
  // Called from grnService, not duplicated there — reuses this module's
  // status-transition table. `tx` lets the caller run this inside its own
  // transaction (see the GRN-side known non-atomicity note).
  async recomputeReceiptStatus(poId: number, tx?: Tx) {
    const po = await poRepository.findPoById(poId, tx);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }

    const items = await poRepository.findPoItemQuantitiesByPoId(poId, tx);
    if (items.length === 0) {
      return po;
    }

    const allReceived = items.every(
      (item) => (item.receivedQty ?? 0) >= item.qty,
    );
    const anyReceived = items.some((item) => (item.receivedQty ?? 0) > 0);

    let next: poStatusSchemaType | undefined;
    if (allReceived) {
      next = "fully_received";
    } else if (anyReceived) {
      next = "partial_received";
    }

    if (!next || next === po.status) {
      return po;
    }

    assertValidStatusTransition(po.status, next);
    const row = await poRepository.setStatus(poId, next, tx);
    if (!row) {
      throw new NotFoundError("Purchase order not found");
    }
    return row;
  },
};
