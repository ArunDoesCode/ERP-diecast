import { db } from "../db/client";
import type { Actor } from "../lib/auth-middleware";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { approvalRepository } from "../repository/approvalRepository";
import {
  computeScoLinePaise,
  computeScoTotalsPaise,
  type PreparedScoLine,
  scoRepository,
  type Tx,
} from "../repository/scoRepository";
import type {
  cancelScoSchemaType,
  createScoSchemaType,
  scoDetailsSchemaType,
  scoLineInputSchemaType,
  scoListQuerySchemaType,
  scoResponseSchemaType,
  updateScoSchemaType,
} from "../types/sco.types";
import { approvalService } from "./approvalService";

type Paginated<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

const DAY_MS = 86_400_000;
const CANCELLABLE_STATUSES = ["draft", "pending_approval", "approved"] as const;

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// BR-SCO-03: today .. today + 365 days (whole days, UTC).
function assertReturnDateInWindow(date: Date) {
  const now = new Date();
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const t = date.getTime();
  if (t < startOfToday) {
    throw new BadRequestError(
      "Expected return date cannot be before today",
      "SCO_RETURN_DATE_INVALID",
    );
  }
  if (t >= startOfToday + 366 * DAY_MS) {
    throw new BadRequestError(
      "Expected return date cannot be more than 365 days away",
      "SCO_RETURN_DATE_INVALID",
    );
  }
}

// BR-SCO-01, 02: checks every line against the vendor's service list and the
// item master, copies price / GST % when omitted, and returns rows to store.
async function prepareLines(
  vendorId: number,
  lines: scoLineInputSchemaType[],
  tx?: Tx,
): Promise<PreparedScoLine[]> {
  for (const line of lines) {
    if (line.rawItemId === line.finishedItemId) {
      throw new BadRequestError(
        "Raw item and finished item must be different",
        "SCO_SAME_ITEM",
      );
    }
  }

  const itemIds = [
    ...new Set(lines.flatMap((l) => [l.rawItemId, l.finishedItemId])),
  ];
  const itemRows = await scoRepository.findItemsByIds(itemIds, tx);
  const itemById = new Map(itemRows.map((row) => [row.id, row]));
  for (const id of itemIds) {
    const item = itemById.get(id);
    if (!item) {
      throw new NotFoundError(`Item ${id} not found`);
    }
    if (!item.isActive) {
      throw new BadRequestError(`Item ${id} is inactive`, "ITEM_INACTIVE");
    }
  }

  const serviceIds = [...new Set(lines.map((l) => l.serviceId))];
  const serviceRows = await scoRepository.findServicesByIds(serviceIds, tx);
  const serviceById = new Map(serviceRows.map((row) => [row.id, row]));
  const priceRows = await scoRepository.findVendorServiceRows(
    vendorId,
    serviceIds,
    tx,
  );
  const priceByService = new Map(priceRows.map((row) => [row.serviceId, row]));
  for (const id of serviceIds) {
    const service = serviceById.get(id);
    if (!service) {
      throw new NotFoundError(`Service ${id} not found`);
    }
    if (!service.isActive || !priceByService.has(id)) {
      throw new BadRequestError(
        `Service ${id} is not on the vendor's active service list`,
        "SCO_SERVICE_NOT_OFFERED",
      );
    }
  }

  return lines.map((line) => {
    const service = serviceById.get(line.serviceId);
    const price = priceByService.get(line.serviceId);
    if (!service || !price) {
      throw new BadRequestError("Invalid service", "SCO_SERVICE_NOT_OFFERED");
    }
    return {
      rawItemId: line.rawItemId,
      rawItemBatch: line.rawItemBatch ?? null,
      rawQtyToIssue: line.rawQtyToIssue,
      serviceId: line.serviceId,
      serviceDescription: service.name,
      serviceHsnSacCode: service.sacCode,
      serviceUnitPricePaise:
        line.serviceUnitPricePaise ?? price.serviceUnitPricePaise,
      serviceTaxPercentage: line.serviceTaxPercentage ?? price.taxPercentage,
      finishedItemId: line.finishedItemId,
      expectedReturnQty: line.expectedReturnQty,
    };
  });
}

function totalsOf(lines: PreparedScoLine[]) {
  return computeScoTotalsPaise(
    lines.map((l) =>
      computeScoLinePaise(
        l.expectedReturnQty,
        l.serviceUnitPricePaise,
        l.serviceTaxPercentage ?? 0,
      ),
    ),
  );
}

async function loadDetails(id: number, tx?: Tx): Promise<scoDetailsSchemaType> {
  const sco = await scoRepository.findHeader(id, tx);
  if (!sco) {
    throw new NotFoundError("Subcontracting order not found");
  }
  const lines = await scoRepository.findLines(id, tx);
  return {
    sco,
    items: lines.map((line) => ({
      ...line,
      ...computeScoLinePaise(
        line.expectedReturnQty,
        line.serviceUnitPricePaise,
        line.serviceTaxPercentage,
      ),
    })),
  };
}

export const scoService = {
  async list(
    query: scoListQuerySchemaType,
  ): Promise<Paginated<scoResponseSchemaType>> {
    const { rows, total } = await scoRepository.list(query);
    return {
      data: rows,
      meta: toPaginatedMeta(query.page, query.pageSize, total),
    };
  },

  async getDetails(id: number): Promise<scoDetailsSchemaType> {
    return loadDetails(id);
  },

  // BR-SCO-01..04: header and lines saved together as a draft.
  async create(
    input: createScoSchemaType,
    actorId: number,
  ): Promise<scoDetailsSchemaType> {
    const vendor = await scoRepository.findVendor(input.vendorId);
    if (!vendor) {
      throw new NotFoundError("Vendor not found");
    }
    if (!vendor.isActive) {
      throw new BadRequestError("Vendor is inactive", "SUPPLIER_INACTIVE");
    }
    if (vendor.type !== "service_provider" && vendor.type !== "both") {
      throw new BadRequestError(
        "Vendor must be a service provider",
        "SCO_VENDOR_TYPE_INVALID",
      );
    }
    assertReturnDateInWindow(input.expectedReturnDate);

    const lines = await prepareLines(input.vendorId, input.lines);

    return db.transaction(async (tx) => {
      const id = await scoRepository.insertOrder(
        {
          vendorId: input.vendorId,
          status: "draft",
          projectRef: input.projectRef ?? null,
          notes: input.notes ?? null,
          expectedReturnDate: input.expectedReturnDate,
          ...totalsOf(lines),
          createdBy: actorId,
          lastUpdatedBy: actorId,
        },
        lines,
        tx,
      );
      return loadDetails(id, tx);
    });
  },

  // BR-SCO-05: header and lines change only in draft.
  async update(
    input: updateScoSchemaType,
    actorId: number,
  ): Promise<scoDetailsSchemaType> {
    if (input.expectedReturnDate !== undefined) {
      assertReturnDateInWindow(input.expectedReturnDate);
    }

    return db.transaction(async (tx) => {
      const locked = await scoRepository.lockById(input.scoId, tx);
      if (!locked) {
        throw new NotFoundError("Subcontracting order not found");
      }
      if (locked.status === "pending_approval") {
        throw new ConflictError(
          "Subcontracting order is locked while it is in approval",
          "DOC_LOCKED_IN_APPROVAL",
        );
      }
      if (locked.status !== "draft") {
        throw new ConflictError(
          `A subcontracting order can only be edited in draft (now ${locked.status})`,
          "SCO_NOT_DRAFT",
        );
      }

      const header: Parameters<typeof scoRepository.updateHeader>[1] = {
        lastUpdatedBy: actorId,
        lastUpdatedAt: new Date(),
      };
      if (input.expectedReturnDate !== undefined) {
        header.expectedReturnDate = input.expectedReturnDate;
      }
      if (input.projectRef !== undefined) header.projectRef = input.projectRef;
      if (input.notes !== undefined) header.notes = input.notes;

      if (input.lines !== undefined) {
        const lines = await prepareLines(locked.vendorId, input.lines, tx);
        await scoRepository.replaceLines(locked.id, lines, tx);
        Object.assign(header, totalsOf(lines));
      }
      await scoRepository.updateHeader(locked.id, header, tx);
      return loadDetails(locked.id, tx);
    });
  },

  // BR-SCO-06: submit follows approval.md; the approval service checks the
  // creator, locks the SCO row and matches the policy on the total incl. GST.
  async submit(
    id: number,
    actorId: number,
    actor: Actor,
  ): Promise<scoDetailsSchemaType> {
    await approvalService.submitRequest(
      { docType: "sco", docId: id },
      actorId,
      actor,
    );
    return loadDetails(id);
  },

  // BR-SCO-20: draft / pending_approval / approved with nothing issued; reason
  // always; the open approval request is cancelled in the same transaction.
  async cancel(
    id: number,
    input: cancelScoSchemaType,
    actorId: number,
  ): Promise<scoDetailsSchemaType> {
    return db.transaction(async (tx) => {
      const pre = await scoRepository.findHeader(id, tx);
      if (!pre) {
        throw new NotFoundError("Subcontracting order not found");
      }

      // Same lock order as approval actions (request, then document) so they cannot deadlock.
      if (pre.status === "pending_approval") {
        const open = await approvalRepository.findPendingRequestByDoc(
          "sco",
          id,
          tx,
        );
        if (open) {
          await approvalRepository.lockRequestById(open.id, tx);
        }
      }

      const locked = await scoRepository.lockById(id, tx);
      if (!locked) {
        throw new NotFoundError("Subcontracting order not found");
      }
      if (
        !(CANCELLABLE_STATUSES as readonly string[]).includes(locked.status)
      ) {
        throw new ConflictError(
          `A subcontracting order in status ${locked.status} cannot be cancelled`,
          "SCO_INVALID_TRANSITION",
        );
      }
      const lines = await scoRepository.findLines(id, tx);
      if (lines.some((line) => line.issuedQty > 0)) {
        throw new ConflictError(
          "Material has already been issued; the order cannot be cancelled",
          "SCO_HAS_ISSUE",
        );
      }

      const now = new Date();
      await scoRepository.updateHeader(
        id,
        {
          status: "cancelled",
          cancelledBy: actorId,
          cancelledAt: now,
          cancelReason: input.reason,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      await approvalRepository.cancelOpenRequestForDocument(
        "sco",
        id,
        undefined,
        { actorId, notes: input.reason, tx },
      );

      return loadDetails(id, tx);
    });
  },
};
