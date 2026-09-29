import { db } from "../db/client";
import { isUniqueViolation } from "../lib/db-errors";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { approvalRepository } from "../repository/approvalRepository";
import { assetRepository } from "../repository/assetRepository";
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
  shortClosePoSchemaType,
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

  return rowById;
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

// BR-PO-18: the expected delivery date can't be before the PO date.
function assertNotBeforePoDate(
  expected: Date | null | undefined,
  poDate: Date,
) {
  if (expected && expected.getTime() < startOfUtcDay(poDate).getTime()) {
    throw new BadRequestError(
      "Expected delivery date cannot be before the PO date",
      "PO_DATE_BEFORE_PO_DATE",
    );
  }
}

// BR-PO-05, BR-APR-47: only a draft PO can be edited.
function assertEditable(status: poStatusSchemaType) {
  if (status === "pending_approval") {
    throw new ConflictError(
      "Purchase order is locked while it is in approval",
      "DOC_LOCKED_IN_APPROVAL",
    );
  }
  if (status !== "draft") {
    throw new ConflictError(
      `Purchase order can only be edited in draft (now ${status})`,
      "PO_NOT_EDITABLE",
    );
  }
}

// BR-PO-03 / BR-PO-04 / BR-SUP-16: fill an omitted rate (last PO rate, else
// price list, else average cost) and an omitted GST % (price list, else 0).
async function resolveLines(
  supplierId: number,
  lines: {
    prItemId: number;
    unitPricePaise?: number | undefined;
    gstPercent?: number | undefined;
  }[],
  prRows: Map<number, { itemId: number }>,
) {
  const itemIds = [
    ...new Set(
      lines.flatMap((l) => {
        const row = prRows.get(l.prItemId);
        return row ? [row.itemId] : [];
      }),
    ),
  ];
  const priceRows = await poRepository.findActivePriceRows(supplierId, itemIds);
  const gstByItem = new Map(priceRows.map((r) => [r.itemId, r.taxPercentage]));

  const resolved: {
    prItemId: number;
    unitPricePaise: number;
    gstPercent: number;
  }[] = [];
  for (const line of lines) {
    const itemId = prRows.get(line.prItemId)?.itemId;
    let unitPricePaise = line.unitPricePaise;
    if (unitPricePaise === undefined && itemId !== undefined) {
      const suggestion = await assetRepository.getLastRate(itemId, supplierId);
      unitPricePaise = suggestion?.ratePaise;
    }
    if (unitPricePaise === undefined || unitPricePaise < 1) {
      throw new BadRequestError(
        `A rate of at least 1 paise is required for PR item ${line.prItemId}`,
        "PO_RATE_REQUIRED",
      );
    }
    resolved.push({
      prItemId: line.prItemId,
      unitPricePaise,
      gstPercent:
        line.gstPercent ??
        (itemId !== undefined ? gstByItem.get(itemId) : undefined) ??
        0,
    });
  }
  return resolved;
}

const LOGGABLE_STATUSES: poStatusSchemaType[] = [
  "dispatched",
  "partial_received",
];
const CANCELLABLE_STATUSES: poStatusSchemaType[] = [
  "draft",
  "pending_approval",
  "approved",
  "dispatched",
];

// BR-PO-22: check status (400 for a wrong status), then take the row lock and
// check again inside the same transaction (409 for the loser of a race).
async function withLockedPo<T>(
  poId: number,
  allowed: readonly poStatusSchemaType[],
  action: string,
  work: (
    tx: Tx,
    po: NonNullable<Awaited<ReturnType<typeof poRepository.lockPoById>>>,
  ) => Promise<T>,
): Promise<T> {
  const pre = await poRepository.findPoById(poId);
  if (!pre) {
    throw new NotFoundError("Purchase order not found");
  }
  if (!allowed.includes(pre.status)) {
    throw new BadRequestError(
      `Cannot ${action} a purchase order in status ${pre.status}`,
      "PO_INVALID_STATUS",
    );
  }

  return db.transaction(async (tx) => {
    const po = await poRepository.lockPoById(poId, tx);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }
    if (!allowed.includes(po.status)) {
      throw new ConflictError(
        `Purchase order is now ${po.status}; reload and try again`,
        "PO_STATUS_CHANGED",
      );
    }
    return work(tx, po);
  });
}

async function reloadPo(poId: number, tx: Tx) {
  const row = await poRepository.findPoById(poId, tx);
  if (!row) {
    throw new NotFoundError("Purchase order not found");
  }
  return row;
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
    if (!supplier) {
      throw new NotFoundError("Supplier not found");
    }
    if (!supplier.isActive) {
      throw new BadRequestError("Supplier is inactive", "SUPPLIER_INACTIVE");
    }

    assertNotBeforePoDate(input.expectedDeliveryDate, new Date());

    const prItemIds = input.lines.map((line) => line.prItemId);
    const prRows = await assertLinesAreDraftable(prItemIds);
    const lines = await resolveLines(input.supplierId, input.lines, prRows);

    return poRepository.createWithItems(
      {
        supplierId: input.supplierId,
        // BR-PO-23: no terms typed -> the supplier's default terms.
        paymentTermsDays:
          input.paymentTermsDays ?? supplier.defaultPaymentTermsDays,
        deliveryTerms: input.deliveryTerms ?? null,
        expectedDeliveryDate: input.expectedDeliveryDate ?? null,
        notes: input.notes ?? null,
        createdBy: actorId,
      },
      lines,
    );
  },

  async update(input: updatePoSchemaType) {
    const existingPo = await poRepository.findPoById(input.poId);
    if (!existingPo) {
      throw new NotFoundError("Purchase order not found");
    }

    assertEditable(existingPo.status);
    assertNotBeforePoDate(input.expectedDeliveryDate, existingPo.createdAt);

    const insertPrItemIds = input.inserts.map((line) => line.prItemId);
    const inserts =
      insertPrItemIds.length > 0
        ? await resolveLines(
            existingPo.supplierId,
            input.inserts,
            await assertLinesAreDraftable(insertPrItemIds),
          )
        : [];

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
      inserts,
      input.updates,
      input.deletes,
    );
  },

  // BR-PO-11: draft / pending_approval / approved / dispatched with no GRN,
  // reason always required. One transaction under the PO row lock.
  async cancel(poId: number, reason: string, actorId: number) {
    return db.transaction(async (tx) => {
      const pre = await poRepository.findPoById(poId, tx);
      if (!pre) {
        throw new NotFoundError("Purchase order not found");
      }

      // Same lock order as approval actions (request, then document) so they cannot deadlock.
      if (pre.status === "pending_approval") {
        const open = await approvalRepository.findPendingRequestByDoc(
          "po",
          poId,
          tx,
        );
        if (open) {
          await approvalRepository.lockRequestById(open.id, tx);
        }
      }

      const po = await poRepository.lockPoById(poId, tx);
      if (!po) {
        throw new NotFoundError("Purchase order not found");
      }
      if (!CANCELLABLE_STATUSES.includes(po.status)) {
        throw new ConflictError(
          `A purchase order in status ${po.status} cannot be cancelled`,
          "PO_INVALID_TRANSITION",
        );
      }
      if (await poRepository.hasGrnForPo(poId, tx)) {
        throw new ConflictError(
          "Purchase order has a GRN and cannot be cancelled.",
          "PO_HAS_GRN",
        );
      }

      await poRepository.cancelLockedPo(poId, { actorId, reason }, tx);
      // BR-APR-48: the open request is cancelled in the same transaction.
      await approvalRepository.cancelOpenRequestForDocument(
        "po",
        poId,
        undefined,
        { actorId, notes: reason, tx },
      );

      return reloadPo(poId, tx);
    });
  },

  // BR-PO-08, 18: approved -> dispatched with a channel; one "PO sent" row in the same save.
  async markSent(poId: number, input: markPoSentSchemaType, actorId: number) {
    return withLockedPo(poId, ["approved"], "send", async (tx, po) => {
      if (!po.expectedDeliveryDate) {
        throw new BadRequestError(
          "Expected delivery date is required before sending",
          "PO_EXPECTED_DATE_REQUIRED",
        );
      }
      assertNotBeforePoDate(po.expectedDeliveryDate, po.createdAt);

      await poRepository.insertCommunication(
        {
          poId,
          type: "po_sent",
          channel: input.channel,
          toEmail: input.toEmail ?? null,
          note: input.note ?? null,
          sentBy: actorId,
        },
        tx,
      );
      await poRepository.setStatus(poId, "dispatched", tx);
      return reloadPo(poId, tx);
    });
  },

  // BR-PO-17: log rows only, on dispatched / partial_received.
  async logReminder(
    poId: number,
    input: logPoCommunicationSchemaType,
    actorId: number,
  ) {
    return withLockedPo(poId, LOGGABLE_STATUSES, "log a reminder on", (tx) =>
      poRepository.insertCommunication(
        {
          poId,
          type: "reminder",
          channel: input.channel,
          toEmail: input.toEmail ?? null,
          note: input.note ?? null,
          sentBy: actorId,
        },
        tx,
      ),
    );
  },

  async escalate(
    poId: number,
    input: logPoCommunicationSchemaType,
    actorId: number,
  ) {
    return withLockedPo(poId, LOGGABLE_STATUSES, "escalate", (tx) =>
      poRepository.insertCommunication(
        {
          poId,
          type: "escalation",
          channel: input.channel,
          toEmail: input.toEmail ?? null,
          note: input.note ?? null,
          sentBy: actorId,
        },
        tx,
      ),
    );
  },

  // BR-PO-16: dispatched / partial_received; expectedDeliveryDate is never overwritten.
  async updateDelay(poId: number, input: updatePoDelaySchemaType) {
    return withLockedPo(
      poId,
      LOGGABLE_STATUSES,
      "record a delay on",
      async (tx) => {
        await poRepository.updatePoById(
          poId,
          {
            revisedDeliveryDate: input.revisedDeliveryDate,
            delayReason: input.delayReason,
          },
          tx,
        );
        return reloadPo(poId, tx);
      },
    );
  },

  // BR-PO-17: supplier confirmation — who, when, method, note; never changes status.
  async confirmSupplier(
    poId: number,
    input: confirmPoSchemaType,
    actorId: number,
  ) {
    return withLockedPo(poId, LOGGABLE_STATUSES, "confirm", async (tx) => {
      await poRepository.updatePoById(
        poId,
        {
          supplierConfirmed: true,
          confirmationMethod: input.confirmationMethod,
          confirmationNote: input.note ?? null,
          confirmedAt: new Date(),
          confirmedBy: actorId,
        },
        tx,
      );
      // BR-PO-17: also a PO log row (columns above stay in sync for the UI).
      await poRepository.insertCommunication(
        {
          poId,
          type: "confirmation",
          channel: input.confirmationMethod,
          note: input.note ?? null,
          sentBy: actorId,
        },
        tx,
      );
      return reloadPo(poId, tx);
    });
  },

  // BR-PO-15: fully_received only; same invoice number from the same supplier twice = 409.
  async markInvoiced(
    poId: number,
    input: markPoInvoicedSchemaType,
    actorId: number,
  ) {
    return withLockedPo(poId, ["fully_received"], "invoice", async (tx, po) => {
      const duplicate = () =>
        new ConflictError(
          `Invoice ${input.invoiceNumber} is already recorded for this supplier`,
          "SUPPLIER_INVOICE_DUPLICATE",
        );

      if (
        await poRepository.findSupplierInvoice(
          po.supplierId,
          input.invoiceNumber,
          tx,
        )
      ) {
        throw duplicate();
      }

      try {
        await poRepository.insertSupplierInvoice(
          {
            invoiceNumber: input.invoiceNumber,
            invoiceDate: input.invoiceDate,
            poId,
            supplierId: po.supplierId,
            billedAmountPaise: input.billedAmountPaise,
            dueDate: input.dueDate ?? null,
          },
          tx,
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw duplicate();
        }
        throw error;
      }

      await poRepository.setStatus(poId, "invoiced", tx, {
        invoicedBy: actorId,
        invoicedAt: new Date(),
      });
      return reloadPo(poId, tx);
    });
  },

  // BR-PO-14: fully_received or invoiced -> closed, with who, when, optional note.
  async close(poId: number, input: closePoSchemaType, actorId: number) {
    return withLockedPo(
      poId,
      ["fully_received", "invoiced"],
      "close",
      async (tx) => {
        await poRepository.setStatus(poId, "closed", tx, {
          closedAt: new Date(),
          closedBy: actorId,
          closeNote: input.note ?? null,
        });
        return reloadPo(poId, tx);
      },
    );
  },

  // BR-PO-13: partial_received -> closed as a whole; its PR lines -> closed (BR-PR-32).
  async shortClose(
    poId: number,
    input: shortClosePoSchemaType,
    actorId: number,
  ) {
    return withLockedPo(
      poId,
      ["partial_received"],
      "short-close",
      async (tx) => {
        await poRepository.setStatus(poId, "closed", tx, {
          shortClosed: true,
          closedAt: new Date(),
          closedBy: actorId,
          closeNote: input.reason,
        });
        await poRepository.closePrLinesOfPo(poId, tx);
        return reloadPo(poId, tx);
      },
    );
  },

  // BR-PO-21: the PO log (sent / reminder / escalation), newest first.
  async communications(poId: number) {
    const po = await poRepository.findPoById(poId);
    if (!po) {
      throw new NotFoundError("Purchase order not found");
    }
    return poRepository.listCommunications(poId);
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
