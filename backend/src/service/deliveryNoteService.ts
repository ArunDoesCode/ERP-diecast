import { conflictLocation, isUniqueViolation } from "../lib/db-errors";
import {
  computeNoteLine,
  computeNoteTotals,
  ewayValidUntil,
  isEwayExpired,
  isEwayNeeded,
  toMilli,
} from "../lib/delivery-note-math";
import { allocateFinancialYearSequence } from "../lib/document-number";
import {
  AppError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
} from "../lib/errors";
import { istDayKey } from "../lib/ist-day";
import { milliToString } from "../lib/milli";
import {
  type DeliveryNoteInsert,
  type DeliveryNoteLineRow,
  type DeliveryNoteRow,
  deliveryNoteRepository as repo,
} from "../repository/deliveryNoteRepository";
import type { DbExecutor, DbTransaction } from "../repository/executor";
import {
  type SaleOrderLineRow,
  saleOrderRepository,
} from "../repository/saleOrderRepository";
import { salesAuditRepository } from "../repository/salesAuditRepository";
import { postStock } from "../repository/stockPostingRepository";
import type {
  CancelDeliveryNoteInput,
  CreateDeliveryNoteInput,
  DeliveryNoteDetail,
  NoteLineInput,
  NoteListQuery,
  PackageInput,
  PendingListQuery,
  TransportHistoryQuery,
  TransportInput,
  UpdateDeliveryNoteInput,
  UpdateTransportInput,
} from "../types/dispatch.types";
import { saleOrderService } from "./saleOrderService";

// Dispatch: delivery note against a confirmed sale order. docs/specs/dispatch.

export type Viewer = { actorId: number; canSeePrice: boolean };

const WHOLE_UNITS = new Set(["pcs", "set"]); // BR-DSP-05
const DEFAULT_EWAY_LIMIT_PAISE = 5_000_000;

const toMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

const noteNotFound = () => new NotFoundError("Delivery note not found");
const noteStatusError = (message: string) =>
  new ConflictError(message, "DISPATCH_NOTE_STATUS");
const soNotConfirmed = () =>
  new ConflictError(
    "The sale order is not confirmed",
    "DISPATCH_SO_NOT_CONFIRMED",
  );
const lineNotOnSo = (message = "Line is not on this sale order") =>
  new BadRequestError(message, "DISPATCH_LINE_NOT_ON_SO");
const ewayReused = () =>
  new ConflictError(
    "This e-way bill number is already on another delivery note",
    "DISPATCH_EWAY_REUSED",
  );
const fieldLocked = (field: string) =>
  new ConflictError(
    `${field} cannot be changed after posting`,
    "DISPATCH_NOTE_FIELD_LOCKED",
  );

type SoLineRow = SaleOrderLineRow;
type SoLineWithItem = Awaited<ReturnType<typeof repo.findSoLines>>[number];

const openMilli = (l: Pick<SoLineRow, "qty" | "deliveredQty">) =>
  toMilli(l.qty) - toMilli(l.deliveredQty);

// ---------------------------------------------------------------------------
// Transport helpers (BR-DSP-24, 25, 27)
// ---------------------------------------------------------------------------

type TransportCols = Pick<
  DeliveryNoteRow,
  | "transportMode"
  | "vehicleNo"
  | "transporterId"
  | "transporterName"
  | "transportDocNo"
  | "transportDocDate"
  | "distanceKm"
  | "ewayBillNo"
  | "ewayBillDate"
>;

const TRANSPORT_MAP = [
  ["mode", "transportMode"],
  ["vehicleNo", "vehicleNo"],
  ["transporterId", "transporterId"],
  ["transporterName", "transporterName"],
  ["transportDocNo", "transportDocNo"],
  ["transportDocDate", "transportDocDate"],
  ["distanceKm", "distanceKm"],
  ["ewayBillNo", "ewayBillNo"],
  ["ewayBillDate", "ewayBillDate"],
] as const;

function transportOf(row: TransportCols): TransportCols {
  return {
    transportMode: row.transportMode,
    vehicleNo: row.vehicleNo,
    transporterId: row.transporterId,
    transporterName: row.transporterName,
    transportDocNo: row.transportDocNo,
    transportDocDate: row.transportDocDate,
    distanceKm: row.distanceKm,
    ewayBillNo: row.ewayBillNo,
    ewayBillDate: row.ewayBillDate,
  };
}

/** Merge a patch key by key: undefined = keep, null = clear. */
function mergeTransport(
  current: TransportCols,
  patch: TransportInput | undefined,
): TransportCols {
  const merged: TransportCols = { ...current };
  if (!patch) return merged;
  for (const [key, col] of TRANSPORT_MAP) {
    const v = patch[key];
    if (v !== undefined) {
      (merged as Record<string, unknown>)[col] = v;
    }
  }
  return merged;
}

/** Format-independent checks of the merged transport block (zod did the formats). */
function validateTransport(t: TransportCols, noteDate: string, today: string) {
  if (t.ewayBillNo && !t.ewayBillDate) {
    throw new BadRequestError("E-way bill date is required with the number");
  }
  if (t.ewayBillDate) {
    if (t.ewayBillDate < noteDate) {
      throw new BadRequestError(
        "E-way bill date cannot be before the note date",
      );
    }
    if (t.ewayBillDate > today) {
      throw new BadRequestError("E-way bill date cannot be in the future");
    }
  }
}

function validateNoteDate(noteDate: string, soDate: string, today: string) {
  if (noteDate > today) {
    throw new BadRequestError("Note date cannot be in the future");
  }
  if (noteDate < soDate) {
    throw new BadRequestError("Note date cannot be before the sale order date");
  }
}

/** BR-DSP-24: what a note that needs an e-way bill must carry. */
function assertEwayFieldsForPost(t: TransportCols) {
  const missing: string[] = [];
  if (!t.transportMode) {
    missing.push("transport mode");
  } else if (t.transportMode === "road") {
    if (!t.vehicleNo && !t.transporterId) {
      missing.push("vehicle number or transporter ID");
    }
  } else {
    if (!t.transportDocNo) missing.push("transport document number");
    if (!t.transportDocDate) missing.push("transport document date");
  }
  if (!t.distanceKm) missing.push("distance");
  if (!t.ewayBillNo) missing.push("e-way bill number");
  if (!t.ewayBillDate) missing.push("e-way bill date");
  if (missing.length > 0) {
    throw new BadRequestError(
      `An e-way bill is needed. Missing: ${missing.join(", ")}`,
      "DISPATCH_EWAY_REQUIRED",
    );
  }
}

async function assertEwayFree(
  ewayBillNo: string | null,
  excludeId: number | null,
  ex: DbExecutor,
) {
  if (!ewayBillNo) return;
  if (await repo.findEwayClash(ewayBillNo, excludeId, ex)) {
    throw ewayReused();
  }
}

/** Run `fn`; a unique violation on the e-way index becomes the spec's 409. */
async function mapEwayUnique<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (
      isUniqueViolation(e) &&
      conflictLocation(e).constraint === "uq_delivery_notes_eway_bill_no"
    ) {
      throw ewayReused();
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Line, package and location checks (BR-DSP-03..05, 08, 20)
// ---------------------------------------------------------------------------

async function assertSourceLocation(locationId: number, ex?: DbExecutor) {
  const loc = await repo.findLocation(locationId, ex);
  if (!loc?.isActive || loc.isVirtual || loc.type === "vendor_premise") {
    throw new BadRequestError(
      "Pick an active stock location that is not a job worker's location",
    );
  }
  return loc;
}

type ResolvedLine = {
  soLine: SoLineWithItem;
  qty: number;
  lotNo: string | null;
};

function resolveLines(
  soLines: SoLineWithItem[],
  inputs: NoteLineInput[],
): ResolvedLine[] {
  const byId = new Map(soLines.map((l) => [l.line.id, l]));
  const seen = new Set<number>();
  const out: ResolvedLine[] = [];
  for (const input of inputs) {
    if (seen.has(input.soLineId)) {
      throw lineNotOnSo("The same sale order line is on the note twice");
    }
    seen.add(input.soLineId);
    const soLine = byId.get(input.soLineId);
    if (!soLine || soLine.line.removedAt) throw lineNotOnSo();
    assertQtyUnit(soLine.line.uom, input.qty);
    if (toMilli(input.qty) > openMilli(soLine.line)) {
      throw new AppError(
        `${soLine.sku}: only ${milliToString(openMilli(soLine.line))} open`,
        400,
        "DISPATCH_OVER_OPEN_QTY",
      );
    }
    out.push({ soLine, qty: input.qty, lotNo: input.lotNo?.trim() || null });
  }
  return out;
}

function assertQtyUnit(uom: string, qty: number) {
  if (WHOLE_UNITS.has(uom.toLowerCase()) && toMilli(qty) % 1000 !== 0) {
    throw new BadRequestError(`Quantity must be a whole number for ${uom}`);
  }
}

type PackageDraft = {
  soLineId: number;
  packageNo: string;
  qty: number;
  netKg: number;
  grossKg: number;
  lotNo: string | null;
};

function resolvePackages(
  inputs: PackageInput[],
  uomBySoLine: Map<number, string>,
): PackageDraft[] {
  const nos = new Set<string>();
  return inputs.map((p) => {
    const uom = uomBySoLine.get(p.soLineId);
    if (uom === undefined) {
      throw lineNotOnSo("A package names a line that is not on the note");
    }
    if (nos.has(p.packageNo)) {
      throw new BadRequestError(`Package number ${p.packageNo} is used twice`);
    }
    nos.add(p.packageNo);
    assertQtyUnit(uom, p.qty);
    return {
      soLineId: p.soLineId,
      packageNo: p.packageNo,
      qty: p.qty,
      netKg: p.netKg,
      grossKg: p.grossKg,
      lotNo: p.lotNo?.trim() || null,
    };
  });
}

// ---------------------------------------------------------------------------
// Amounts and the e-way answer (BR-DSP-19, 23)
// ---------------------------------------------------------------------------

type CompanyRow = NonNullable<Awaited<ReturnType<typeof repo.findCompany>>>;

function ewayAnswer(
  valuePaise: number,
  shipToStateCode: string,
  company: CompanyRow | undefined,
) {
  const plantState = company?.stateCode.trim() || null;
  const sameState = plantState !== null && plantState === shipToStateCode;
  const limit = company?.ewayIntraLimitPaise ?? DEFAULT_EWAY_LIMIT_PAISE;
  return {
    sameState,
    ewayRequired: isEwayNeeded({
      valuePaise,
      sameState,
      intraLimitPaise: limit,
    }),
  };
}

function priceLine(soLine: SoLineRow, qty: number | string) {
  const m = computeNoteLine({
    qty,
    unitPricePaise: soLine.unitPricePaise,
    gstPercent: soLine.gstPercent,
  });
  return { ...m, unitPricePaise: soLine.unitPricePaise };
}

// ---------------------------------------------------------------------------
// Audit (BR-DSP-36): no prices in the rows, the activity panel shows them to dispatch.view
// ---------------------------------------------------------------------------

function audit(
  tx: DbExecutor,
  actorId: number,
  action: string,
  note: { id: number; soId: number },
  before: unknown,
  after: unknown,
) {
  return salesAuditRepository.write(
    {
      actorId,
      action,
      targetType: "delivery_note",
      targetId: note.id,
      soId: note.soId,
      before,
      after,
    },
    tx,
  );
}

// ---------------------------------------------------------------------------
// Detail (BR-DSP-38, 41, 43)
// ---------------------------------------------------------------------------

async function buildDetail(
  id: number,
  canSeePrice: boolean,
  ex?: DbExecutor,
): Promise<DeliveryNoteDetail> {
  const h = await repo.findHeader(id, ex);
  if (!h) throw noteNotFound();
  const [lines, pkgs, company, soLines, so, activity, location] =
    await Promise.all([
      repo.findLines(id, ex),
      repo.findPackages(id, ex),
      repo.findCompany(ex),
      repo.findSoLines(h.soId, ex),
      repo.findSoHeader(h.soId, ex),
      repo.listActivity(id, ex),
      repo.findLocation(h.sourceLocationId, ex),
    ]);
  const people = await repo.findEmployeeNames(
    [h.postedBy, h.cancelledBy, h.createdBy].filter(
      (v): v is number => v !== null,
    ),
    ex,
  );
  const person = (pid: number | null) =>
    pid === null ? null : { id: pid, name: people.get(pid) ?? "" };
  const soLineById = new Map(soLines.map((l) => [l.line.id, l.line]));
  const isDraft = h.status === "draft";

  const outLines = lines.map(({ line, sku, itemName, itemHsn }) => {
    const soLine = soLineById.get(line.soLineId);
    const live = isDraft && soLine ? priceLine(soLine, line.qty) : undefined;
    const base = {
      id: line.id,
      soLineId: line.soLineId,
      item: {
        id: line.itemId,
        sku,
        name: itemName,
        hsnCode: isDraft ? (itemHsn ?? null) : line.hsnCode,
      },
      qty: Number(line.qty),
      uom: line.uom,
      deliveryDate: line.deliveryDate,
      lotNo: line.lotNo,
      openQtyAtRead: soLine ? openMilli(soLine) / 1000 : 0,
    };
    if (!canSeePrice) return base;
    return {
      ...base,
      unitPricePaise: live?.unitPricePaise ?? line.unitPricePaise,
      gstPercent: Number(
        isDraft && soLine ? soLine.gstPercent : line.gstPercent,
      ),
      taxablePaise: live?.taxablePaise ?? line.taxablePaise,
      gstPaise: live?.gstPaise ?? line.gstPaise,
    };
  });

  let taxablePaise = h.taxablePaise;
  let gstPaise = h.gstPaise;
  let valuePaise = h.valuePaise;
  if (isDraft) {
    const totals = computeNoteTotals(
      lines.map(({ line }) => {
        const soLine = soLineById.get(line.soLineId);
        return soLine
          ? priceLine(soLine, line.qty)
          : { taxablePaise: line.taxablePaise, gstPaise: line.gstPaise };
      }),
    );
    taxablePaise = totals.taxablePaise;
    gstPaise = totals.gstPaise;
    valuePaise = totals.valuePaise;
  }

  const validUntil = ewayValidUntil(h.ewayBillDate, h.distanceKm);
  const draftCompany = company
    ? {
        name: company.name,
        address: company.address,
        gstin: company.gstin,
        stateCode: company.stateCode,
      }
    : null;
  const snapshot = {
    name: h.companyName,
    address: h.companyAddress,
    gstin: h.companyGstin,
    stateCode: h.companyStateCode,
  };
  const hasSnapshot = Object.values(snapshot).some((v) => v !== null);

  const detail: DeliveryNoteDetail = {
    soStatus: so?.status ?? "",
    activity: activity.map((a) => ({
      at: a.at.toISOString(),
      actorName: a.actorName ?? null,
      action: a.action,
      reason: a.reason ?? null,
    })),
    id: h.id,
    dnNumber: h.dnNumber,
    status: h.status,
    soId: h.soId,
    soNumber: h.soNumber,
    customerPoNumber: h.customerPoNumber,
    customer: {
      id: h.customerId,
      name: h.customerName,
      address: h.customerAddress,
      gstin: h.customerGstin,
      stateCode: h.customerStateCode,
    },
    shipTo: { address: h.shipToAddress, stateCode: h.shipToStateCode },
    noteDate: h.noteDate,
    sourceLocation: {
      id: h.sourceLocationId,
      name: location?.name ?? "",
    },
    remarks: h.remarks,
    lines: outLines,
    packages: pkgs.map(({ pkg, soLineId }) => ({
      id: pkg.id,
      lineId: pkg.lineId,
      soLineId,
      packageNo: pkg.packageNo,
      qty: Number(pkg.qty),
      netKg: Number(pkg.netKg),
      grossKg: Number(pkg.grossKg),
      lotNo: pkg.lotNo,
    })),
    transport: {
      mode: h.transportMode as DeliveryNoteDetail["transport"]["mode"],
      vehicleNo: h.vehicleNo,
      transporterId: h.transporterId,
      transporterName: h.transporterName,
      transportDocNo: h.transportDocNo,
      transportDocDate: h.transportDocDate,
      distanceKm: h.distanceKm,
      ewayBillNo: h.ewayBillNo,
      ewayBillDate: h.ewayBillDate,
    },
    ewayValidUntil: validUntil,
    ewayExpired: isEwayExpired(validUntil, new Date()),
    ewayNeeded: h.ewayRequired,
    ewayLimitPaise: company?.ewayIntraLimitPaise ?? DEFAULT_EWAY_LIMIT_PAISE,
    company: isDraft ? draftCompany : hasSnapshot ? snapshot : null,
    postedBy: person(h.postedBy),
    postedAt: h.postedAt?.toISOString() ?? null,
    cancelReason: h.cancelReason,
    cancelledBy: person(h.cancelledBy),
    cancelledAt: h.cancelledAt?.toISOString() ?? null,
    createdBy: person(h.createdBy),
    createdAt: h.createdAt.toISOString(),
  };
  if (canSeePrice) {
    detail.taxablePaise = taxablePaise;
    detail.gstPaise = gstPaise;
    detail.valuePaise = valuePaise;
  }
  return detail;
}

// ---------------------------------------------------------------------------
// Draft amounts refresh: indicative price, GST and e-way answer (BR-DSP-19, 23, CR-DSP-4)
// ---------------------------------------------------------------------------

async function refreshDraftAmounts(
  noteId: number,
  tx: DbTransaction,
  actorId: number,
) {
  const h = await repo.findHeader(noteId, tx);
  if (!h) throw noteNotFound();
  const [lines, soLines, company] = await Promise.all([
    repo.findLines(noteId, tx),
    repo.findSoLines(h.soId, tx),
    repo.findCompany(tx),
  ]);
  const soById = new Map(soLines.map((l) => [l.line.id, l.line]));
  const results = [];
  for (const { line } of lines) {
    const soLine = soById.get(line.soLineId);
    if (!soLine) throw lineNotOnSo();
    const p = priceLine(soLine, line.qty);
    await repo.updateLine(
      line.id,
      {
        unitPricePaise: p.unitPricePaise,
        gstPercent: soLine.gstPercent,
        taxablePaise: p.taxablePaise,
        gstPaise: p.gstPaise,
      },
      tx,
    );
    results.push(p);
  }
  const totals = computeNoteTotals(results);
  const answer = ewayAnswer(totals.valuePaise, h.shipToStateCode, company);
  await repo.updateHeader(
    noteId,
    {
      taxablePaise: totals.taxablePaise,
      gstPaise: totals.gstPaise,
      valuePaise: totals.valuePaise,
      ewayRequired: answer.ewayRequired,
      sameState: answer.sameState,
      lastUpdatedBy: actorId,
      lastUpdatedAt: new Date(),
    },
    tx,
  );
}

// ---------------------------------------------------------------------------
// Post checks that read SO lines (BR-DSP-03, 10)
// ---------------------------------------------------------------------------

function checkNoteAgainstSoLines(
  soLines: Map<number, SoLineRow>,
  noteLines: DeliveryNoteLineRow[],
  overStatus: 400 | 409,
) {
  for (const line of noteLines) {
    const soLine = soLines.get(line.soLineId);
    if (!soLine || soLine.removedAt) throw lineNotOnSo();
    if (toMilli(line.qty) > openMilli(soLine)) {
      throw new AppError(
        `Only ${milliToString(openMilli(soLine))} is open on a line`,
        overStatus,
        "DISPATCH_OVER_OPEN_QTY",
      );
    }
  }
}

export const deliveryNoteService = {
  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async settings() {
    const company = await repo.findCompany();
    return {
      ewayIntraLimitPaise:
        company?.ewayIntraLimitPaise ?? DEFAULT_EWAY_LIMIT_PAISE,
      plantStateCode: company?.stateCode.trim() || null,
    };
  },

  async pending(query: PendingListQuery) {
    let locationId: number | null;
    if (query.locationId !== undefined) {
      await assertSourceLocation(query.locationId, undefined);
      locationId = query.locationId;
    } else {
      locationId = await repo.findDefaultSourceLocationId();
    }
    const sort = {
      by: query.sortBy ?? "soDate",
      dir: query.sortDir ?? "asc",
    } as const;
    const [{ rows, total }, customers, items, soHeader] = await Promise.all([
      repo.listPending(query, sort),
      repo.pendingCustomerOptions(query),
      repo.pendingItemOptions(query),
      query.soId !== undefined
        ? repo.findSoPickerHeader(query.soId)
        : Promise.resolve(undefined),
    ]);
    const stock =
      locationId === null
        ? new Map<number, number>()
        : await repo.stockAtLocation(
            [...new Set(rows.map((r) => r.itemId))],
            locationId,
          );
    return {
      data: rows.map((r) => ({
        soId: r.soId,
        soNumber: r.soNumber,
        soLineId: r.soLineId,
        customer: { id: r.customerId, name: r.customerName },
        item: { id: r.itemId, sku: r.sku, name: r.itemName },
        uom: r.uom,
        deliveryDate: r.deliveryDate,
        ordered: Number(r.qty),
        delivered: Number(r.deliveredQty),
        open: (toMilli(r.qty) - toMilli(r.deliveredQty)) / 1000,
        soDate: r.soDate,
        stockAtLocation: stock.get(r.itemId) ?? 0,
      })),
      meta: {
        ...toMeta(query.page, query.pageSize, total),
        customers,
        items,
        ...(soHeader
          ? {
              so: {
                soNumber: soHeader.soNumber,
                customerPoNumber: soHeader.customerPoNumber,
                customer: {
                  id: soHeader.customerId,
                  name: soHeader.customerName,
                  address: soHeader.customerAddress,
                  stateCode: soHeader.customerStateCode,
                  gstin: soHeader.customerGstin,
                },
                shipTo: {
                  address: soHeader.shipToAddress ?? soHeader.customerAddress,
                  stateCode:
                    soHeader.shipToStateCode ?? soHeader.customerStateCode,
                },
              },
            }
          : {}),
      },
    };
  },

  async list(query: NoteListQuery, canSeePrice: boolean) {
    if (query.sortBy === "valuePaise" && !canSeePrice) {
      throw new BadRequestError("Sorting by value needs the sale price right");
    }
    // sortBy omitted -> noteDate desc; sortBy without sortDir -> asc
    const sort =
      query.sortBy === undefined
        ? { by: "noteDate", dir: query.sortDir ?? ("desc" as const) }
        : { by: query.sortBy, dir: query.sortDir ?? ("asc" as const) };
    const [{ rows, total }, customers] = await Promise.all([
      repo.listNotes(query, sort),
      repo.noteCustomerOptions(),
    ]);
    const qtys = await repo.totalQtyByNote(rows.map((r) => r.id));
    const now = new Date();
    return {
      data: rows.map((r) => {
        const validUntil = ewayValidUntil(r.ewayBillDate, r.distanceKm);
        const base = {
          id: r.id,
          dnNumber: r.dnNumber,
          soId: r.soId,
          soNumber: r.soNumber,
          totalQty: qtys.get(r.id) ?? 0,
          noteDate: r.noteDate,
          customer: { id: r.customerId, name: r.customerName },
          status: r.status,
          ewayBillNo: r.ewayBillNo,
          ewayValidUntil: validUntil,
          ewayExpired: isEwayExpired(validUntil, now),
          ewayNeeded: r.ewayRequired,
        };
        return canSeePrice ? { ...base, valuePaise: r.valuePaise } : base;
      }),
      meta: { ...toMeta(query.page, query.pageSize, total), customers },
    };
  },

  async getDetails(id: number, viewer: Viewer) {
    return buildDetail(id, viewer.canSeePrice, undefined);
  },

  async transportHistory(id: number, query: TransportHistoryQuery) {
    if (!(await repo.findHeader(id))) throw noteNotFound();
    const { rows, total } = await repo.listHistory(
      id,
      query.page,
      query.pageSize,
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        field: r.field,
        oldValue: r.oldValue,
        newValue: r.newValue,
        changedBy: r.changedBy,
        changedByName: r.changedByName ?? null,
        changedAt: r.changedAt.toISOString(),
      })),
      meta: toMeta(query.page, query.pageSize, total),
    };
  },

  // -------------------------------------------------------------------------
  // Create and edit a draft (BR-DSP-01..09, 20, 22, 25)
  // -------------------------------------------------------------------------

  async create(input: CreateDeliveryNoteInput, viewer: Viewer) {
    const so = await repo.findSoHeader(input.soId);
    if (!so) throw new NotFoundError("Sale order not found");
    if (so.status !== "confirmed") throw soNotConfirmed(); // BR-DSP-01
    const [soLines, customer, company] = await Promise.all([
      repo.findSoLines(so.id),
      repo.findCustomer(so.customerId),
      repo.findCompany(),
    ]);
    if (!customer) throw new NotFoundError("Customer not found");

    const today = istDayKey();
    const noteDate = input.noteDate ?? today;
    validateNoteDate(noteDate, so.orderDate, today); // BR-DSP-07
    const locationId =
      input.sourceLocationId ?? (await repo.findDefaultSourceLocationId());
    if (locationId === null) {
      throw new BadRequestError("No stock location is set up to dispatch from");
    }
    await assertSourceLocation(locationId, undefined); // BR-DSP-08

    const resolved = resolveLines(soLines, input.lines); // BR-DSP-03..05
    const transport = mergeTransport(emptyTransport(), input.transport);
    validateTransport(transport, noteDate, today);
    const packages = resolvePackages(
      input.packages ?? [],
      new Map(resolved.map((r) => [r.soLine.line.id, r.soLine.line.uom])),
    );

    const priced = resolved.map((r) => priceLine(r.soLine.line, r.qty));
    const totals = computeNoteTotals(priced);
    const shipToStateCode = so.shipToStateCode ?? customer.stateCode;
    const answer = ewayAnswer(totals.valuePaise, shipToStateCode, company);

    const id = await mapEwayUnique(() =>
      repo.withTransaction(async (tx) => {
        await assertEwayFree(transport.ewayBillNo, null, tx);
        const header = await repo.insertHeader(
          {
            status: "draft",
            soId: so.id,
            soNumber: so.soNumber,
            customerPoNumber: so.customerPoNumber,
            customerId: customer.id,
            customerName: customer.name,
            customerAddress: customer.address,
            customerGstin: customer.gstin,
            customerStateCode: customer.stateCode,
            shipToAddress: so.shipToAddress ?? customer.address,
            shipToStateCode,
            sameState: answer.sameState,
            sourceLocationId: locationId,
            noteDate,
            taxablePaise: totals.taxablePaise,
            gstPaise: totals.gstPaise,
            valuePaise: totals.valuePaise,
            ewayRequired: answer.ewayRequired,
            ...transport,
            remarks: input.remarks?.trim() || null,
            createdBy: viewer.actorId,
            lastUpdatedBy: viewer.actorId,
          },
          tx,
        );
        if (!header) throw new InternalServerError("Failed to create the note");
        const lineRows = await repo.insertLines(
          resolved.map((r, i) => ({
            noteId: header.id,
            soLineId: r.soLine.line.id,
            itemId: r.soLine.line.itemId,
            qty: milliToString(toMilli(r.qty)),
            uom: r.soLine.line.uom,
            deliveryDate: r.soLine.line.deliveryDate,
            lotNo: r.lotNo,
            unitPricePaise: priced[i]?.unitPricePaise ?? 0,
            gstPercent: r.soLine.line.gstPercent,
            taxablePaise: priced[i]?.taxablePaise ?? 0,
            gstPaise: priced[i]?.gstPaise ?? 0,
          })),
          tx,
        );
        await insertPackageRows(header.id, packages, lineRows, tx);
        await audit(tx, viewer.actorId, "dispatch.create", header, null, {
          status: "draft",
          lines: lineRows.length,
          packages: packages.length,
        });
        return header.id;
      }),
    );
    return buildDetail(id, viewer.canSeePrice, undefined);
  },

  async update(id: number, input: UpdateDeliveryNoteInput, viewer: Viewer) {
    await mapEwayUnique(() =>
      repo.withTransaction(async (tx) => {
        const header = await repo.lockHeader(id, tx);
        if (!header) throw noteNotFound();
        if (header.status !== "draft") {
          throw noteStatusError("Only a draft note can be edited"); // BR-DSP-22
        }
        const [so, soLines] = await Promise.all([
          repo.findSoHeader(header.soId, tx),
          repo.findSoLines(header.soId, tx),
        ]);
        if (!so) throw new NotFoundError("Sale order not found");
        const today = istDayKey();
        const noteDate = input.noteDate ?? header.noteDate;
        if (input.noteDate !== undefined) {
          validateNoteDate(noteDate, so.orderDate, today);
        }
        if (input.sourceLocationId !== undefined) {
          await assertSourceLocation(input.sourceLocationId, tx);
        }
        const existingLines = await repo.findLines(id, tx);
        const existingPkgs = await repo.findPackages(id, tx);

        // lines: validated whole, then diffed by SO line id
        let finalSoLineUom = new Map(
          existingLines.map((l) => [l.line.soLineId, l.line.uom]),
        );
        const resolved = input.lines
          ? resolveLines(soLines, input.lines)
          : undefined;
        if (resolved) {
          finalSoLineUom = new Map(
            resolved.map((r) => [r.soLine.line.id, r.soLine.line.uom]),
          );
        }
        const packages = input.packages
          ? resolvePackages(input.packages, finalSoLineUom)
          : undefined;
        if (resolved && !packages) {
          for (const p of existingPkgs) {
            if (!finalSoLineUom.has(p.soLineId)) {
              throw lineNotOnSo(
                "A package names a line that is no longer on the note",
              );
            }
          }
        }

        const transport = mergeTransport(transportOf(header), input.transport);
        validateTransport(transport, noteDate, today);
        if (transport.ewayBillNo !== header.ewayBillNo) {
          await assertEwayFree(transport.ewayBillNo, id, tx);
        }

        if (packages) await repo.deletePackages(id, tx);
        if (resolved) {
          const keep = new Map(resolved.map((r) => [r.soLine.line.id, r]));
          const existingBySo = new Map(
            existingLines.map((l) => [l.line.soLineId, l.line]),
          );
          // packages of kept lines stay; packages of dropped lines were refused above
          await repo.deleteLines(
            existingLines
              .filter((l) => !keep.has(l.line.soLineId))
              .map((l) => l.line.id),
            tx,
          );
          for (const r of resolved) {
            const current = existingBySo.get(r.soLine.line.id);
            const qty = milliToString(toMilli(r.qty));
            if (current) {
              await repo.updateLine(current.id, { qty, lotNo: r.lotNo }, tx);
            } else {
              await repo.insertLines(
                [
                  {
                    noteId: id,
                    soLineId: r.soLine.line.id,
                    itemId: r.soLine.line.itemId,
                    qty,
                    uom: r.soLine.line.uom,
                    deliveryDate: r.soLine.line.deliveryDate,
                    lotNo: r.lotNo,
                    unitPricePaise: r.soLine.line.unitPricePaise,
                    gstPercent: r.soLine.line.gstPercent,
                    taxablePaise: 0,
                    gstPaise: 0,
                  },
                ],
                tx,
              );
            }
          }
        }
        if (packages) {
          const lineRows = await repo.findLines(id, tx);
          await insertPackageRows(
            id,
            packages,
            lineRows.map((l) => l.line),
            tx,
          );
        }

        const set: Partial<DeliveryNoteInsert> = {
          noteDate,
          ...transport,
          lastUpdatedBy: viewer.actorId,
          lastUpdatedAt: new Date(),
        };
        if (input.sourceLocationId !== undefined) {
          set.sourceLocationId = input.sourceLocationId;
        }
        if (input.remarks !== undefined) {
          set.remarks = input.remarks?.trim() || null;
        }
        await repo.updateHeader(id, set, tx);
        await refreshDraftAmounts(id, tx, viewer.actorId);
        await audit(
          tx,
          viewer.actorId,
          "dispatch.edit",
          header,
          { status: "draft" },
          {
            status: "draft",
            changed: Object.keys(input),
          },
        );
      }),
    );
    return buildDetail(id, viewer.canSeePrice, undefined);
  },

  async cancelDraft(
    id: number,
    input: CancelDeliveryNoteInput,
    viewer: Viewer,
  ) {
    await repo.withTransaction(async (tx) => {
      const header = await repo.lockHeader(id, tx);
      if (!header) throw noteNotFound();
      if (header.status !== "draft") {
        throw noteStatusError("Only a draft note can be cancelled this way");
      }
      const now = new Date();
      await repo.updateHeader(
        id,
        {
          status: "cancelled",
          cancelReason: input.reason,
          cancelledBy: viewer.actorId,
          cancelledAt: now,
          lastUpdatedBy: viewer.actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      await audit(
        tx,
        viewer.actorId,
        "dispatch.cancel",
        header,
        { status: "draft" },
        { status: "cancelled", reason: input.reason },
      );
    });
    return buildDetail(id, viewer.canSeePrice, undefined);
  },

  // -------------------------------------------------------------------------
  // Post (BR-DSP-10..19, 21, 23, 24, 44)
  // Lock order: SO header -> SO lines (id asc) -> note row -> items (id asc) ->
  // number counter -> hooks and ledger rows. Every path takes the SO first, so
  // two posts / cancels of one SO never cross.
  // -------------------------------------------------------------------------

  async post(id: number, viewer: Viewer) {
    // Arrival checks without locks: 400 when already wrong (BR-DSP-10, 11).
    const pre = await repo.findHeader(id);
    if (!pre) throw noteNotFound();
    if (pre.status !== "draft") {
      throw noteStatusError("Only a draft note can be posted");
    }
    const [preSo, preSoLines, preLines] = await Promise.all([
      repo.findSoHeader(pre.soId),
      repo.findSoLines(pre.soId),
      repo.findLines(id),
    ]);
    if (preSo?.status !== "confirmed") throw soNotConfirmed();
    checkNoteAgainstSoLines(
      new Map(preSoLines.map((l) => [l.line.id, l.line])),
      preLines.map((l) => l.line),
      400,
    );

    await mapEwayUnique(() =>
      repo.withTransaction(async (tx) => {
        const so = await saleOrderRepository.lockById(pre.soId, tx);
        if (!so) throw new NotFoundError("Sale order not found");
        const lockedSoLines = await saleOrderRepository.findAllLinesForUpdate(
          pre.soId,
          tx,
        );
        const note = await repo.lockHeader(id, tx);
        if (!note) throw noteNotFound();
        if (note.status !== "draft") {
          throw noteStatusError("Only a draft note can be posted"); // BR-DSP-16
        }
        if (so.status !== "confirmed") throw soNotConfirmed(); // BR-DSP-11
        const noteLines = await repo.findLines(id, tx);
        if (noteLines.length === 0) {
          throw new BadRequestError("A note needs at least one line");
        }
        const soLineById = new Map(lockedSoLines.map((l) => [l.id, l]));
        checkNoteAgainstSoLines(
          soLineById,
          noteLines.map((l) => l.line),
          409, // lost a race
        );

        // BR-DSP-08, 44, 18: data checks, nothing is written yet
        await assertSourceLocation(note.sourceLocationId, tx);
        for (const l of noteLines) {
          if (!l.itemActive) {
            throw new BadRequestError(`${l.sku} is inactive`);
          }
        }
        const company = await repo.findCompany(tx);
        if (
          !company?.name.trim() ||
          !company.address.trim() ||
          !company.gstin.trim() ||
          !company.stateCode.trim()
        ) {
          throw new BadRequestError(
            "Set the company name, address, GSTIN and state before posting",
            "DISPATCH_COMPANY_OR_HSN_MISSING",
          );
        }
        const noHsn = noteLines.filter((l) => !l.itemHsn?.trim());
        if (noHsn.length > 0) {
          throw new BadRequestError(
            `Add an HSN code to item ${noHsn.map((l) => l.sku).join(", ")}`,
            "DISPATCH_COMPANY_OR_HSN_MISSING",
          );
        }

        // BR-DSP-21: packed qty must equal the line qty for packed lines
        const pkgs = await repo.findPackages(id, tx);
        const packedByLine = new Map<number, number>();
        for (const p of pkgs) {
          packedByLine.set(
            p.pkg.lineId,
            (packedByLine.get(p.pkg.lineId) ?? 0) + toMilli(p.pkg.qty),
          );
        }
        for (const l of noteLines) {
          const packed = packedByLine.get(l.line.id);
          if (packed !== undefined && packed !== toMilli(l.line.qty)) {
            throw new BadRequestError(
              `${l.sku}: packed qty does not match the line qty`,
              "DISPATCH_PACKED_QTY_MISMATCH",
            );
          }
        }

        // BR-DSP-19, 23, 24: price now, frozen on the note
        const customer = await repo.findCustomer(note.customerId, tx);
        if (!customer) throw new NotFoundError("Customer not found");
        const shipToAddress = so.shipToAddress ?? customer.address;
        const shipToStateCode = so.shipToStateCode ?? customer.stateCode;
        const priced = noteLines.map((l) => {
          const soLine = soLineById.get(l.line.soLineId);
          if (!soLine) throw lineNotOnSo();
          return { l, soLine, ...priceLine(soLine, l.line.qty) };
        });
        const totals = computeNoteTotals(priced);
        const answer = ewayAnswer(totals.valuePaise, shipToStateCode, company);
        const transport = transportOf(note);
        validateTransport(transport, note.noteDate, istDayKey());
        if (answer.ewayRequired) assertEwayFieldsForPost(transport);
        await assertEwayFree(note.ewayBillNo, id, tx);

        // items locked up front, ascending id (PERF-02); number after them
        const itemIds = [...new Set(noteLines.map((l) => l.line.itemId))].sort(
          (a, b) => a - b,
        );
        await repo.lockItems(itemIds, tx);
        const now = new Date();
        const seq = await allocateFinancialYearSequence(
          tx,
          "delivery_note",
          viewer.actorId,
          new Date(`${note.noteDate}T00:00:00.000Z`),
        );
        const dnNumber = `DN/${seq.fy}/${seq.seq}`;

        // BR-DSP-14: delivered qty, reservations; SO lines in id order
        const byLine = [...priced].sort(
          (a, b) => a.l.line.soLineId - b.l.line.soLineId,
        );
        for (const p of byLine) {
          await saleOrderService.applyDelivery(tx, {
            lineId: p.l.line.soLineId,
            qty: Number(p.l.line.qty),
            actorId: viewer.actorId,
            noteRef: dnNumber,
          });
        }
        await saleOrderService.closeFullyDelivered(tx, {
          soId: so.id,
          actorId: viewer.actorId,
          noteRef: dnNumber,
        });

        // BR-DSP-12, 13: one out row per line at the average, no negative stock
        const stockOrder = [...priced].sort(
          (a, b) =>
            a.l.line.itemId - b.l.line.itemId || a.l.line.id - b.l.line.id,
        );
        for (const p of stockOrder) {
          const row = await postStock(tx, {
            itemId: p.l.line.itemId,
            locationId: note.sourceLocationId,
            transactionType: "out",
            referenceType: "delivery_note",
            referenceId: id,
            referenceLineId: p.l.line.id,
            batchNumber: p.l.line.lotNo,
            quantityChange: -Number(p.l.line.qty),
            unitCostPaise: 0,
            valueAtAverage: true,
            blockNegative: true,
            notes: dnNumber,
            createdBy: viewer.actorId,
          });
          if (!row) {
            throw new InternalServerError(
              "Stock posting returned no ledger row",
            );
          }
          await repo.updateLine(
            p.l.line.id,
            {
              hsnCode: p.l.itemHsn?.trim() ?? null,
              unitPricePaise: p.unitPricePaise,
              gstPercent: p.soLine.gstPercent,
              taxablePaise: p.taxablePaise,
              gstPaise: p.gstPaise,
              ledgerOutId: row.id,
            },
            tx,
          );
        }

        await repo.updateHeader(
          id,
          {
            status: "posted",
            dnNumber,
            customerName: customer.name,
            customerAddress: customer.address,
            customerGstin: customer.gstin,
            customerStateCode: customer.stateCode,
            customerPoNumber: so.customerPoNumber,
            shipToAddress,
            shipToStateCode,
            companyName: company.name,
            companyAddress: company.address,
            companyGstin: company.gstin,
            companyStateCode: company.stateCode,
            sameState: answer.sameState,
            taxablePaise: totals.taxablePaise,
            gstPaise: totals.gstPaise,
            valuePaise: totals.valuePaise,
            ewayRequired: answer.ewayRequired,
            postedBy: viewer.actorId,
            postedAt: now,
            lastUpdatedBy: viewer.actorId,
            lastUpdatedAt: now,
          },
          tx,
        );
        await audit(
          tx,
          viewer.actorId,
          "dispatch.post",
          note,
          { status: "draft" },
          { status: "posted", dnNumber },
        );
      }),
    );
    return buildDetail(id, viewer.canSeePrice, undefined);
  },

  // -------------------------------------------------------------------------
  // Cancel a posted note (BR-DSP-30..33)
  // -------------------------------------------------------------------------

  async cancel(id: number, input: CancelDeliveryNoteInput, viewer: Viewer) {
    const pre = await repo.findHeader(id);
    if (!pre) throw noteNotFound();
    if (pre.status !== "posted") {
      throw noteStatusError("Only a posted note can be cancelled this way");
    }
    await repo.withTransaction(async (tx) => {
      const so = await saleOrderRepository.lockById(pre.soId, tx);
      if (!so) throw new NotFoundError("Sale order not found");
      await saleOrderRepository.findAllLinesForUpdate(pre.soId, tx);
      const note = await repo.lockHeader(id, tx);
      if (!note) throw noteNotFound();
      if (note.status !== "posted") {
        throw noteStatusError("Only a posted note can be cancelled this way"); // BR-DSP-33
      }
      if (so.status === "closed" && so.closeKind !== "fully_delivered") {
        throw new ConflictError(
          "The sale order was closed by hand; this note cannot be cancelled",
          "DISPATCH_SO_CLOSED_MANUALLY",
        );
      }
      const noteLines = await repo.findLines(id, tx);
      await repo.lockItems(
        [...new Set(noteLines.map((l) => l.line.itemId))].sort((a, b) => a - b),
        tx,
      );
      const ledgerOut = new Map(
        (
          await repo.findLedgerRows(
            noteLines.flatMap((l) =>
              l.line.ledgerOutId === null ? [] : [l.line.ledgerOutId],
            ),
            tx,
          )
        ).map((r) => [r.id, r]),
      );

      // delivered qty back, SO reopened, BEFORE any stock row (a hand-closed SO rolls all back)
      const byLine = [...noteLines].sort(
        (a, b) => a.line.soLineId - b.line.soLineId,
      );
      for (const l of byLine) {
        await saleOrderService.applyDelivery(tx, {
          lineId: l.line.soLineId,
          qty: -Number(l.line.qty),
          actorId: viewer.actorId,
          noteRef: note.dnNumber ?? `#${id}`,
        });
      }
      try {
        await saleOrderService.reopenAfterDeliveryCancel(tx, {
          soId: so.id,
          actorId: viewer.actorId,
          noteRef: note.dnNumber ?? `#${id}`,
        });
      } catch (e) {
        if (e instanceof AppError && e.code === "SO_CLOSED_BY_HAND") {
          throw new ConflictError(e.message, "DISPATCH_SO_CLOSED_MANUALLY");
        }
        throw e;
      }

      const stockOrder = [...noteLines].sort(
        (a, b) => a.line.itemId - b.line.itemId || a.line.id - b.line.id,
      );
      for (const l of stockOrder) {
        const out = l.line.ledgerOutId
          ? ledgerOut.get(l.line.ledgerOutId)
          : undefined;
        if (!out) {
          throw new InternalServerError("Posted note line has no ledger row");
        }
        const row = await postStock(tx, {
          itemId: l.line.itemId,
          locationId: note.sourceLocationId,
          transactionType: "in",
          referenceType: "delivery_note_cancel",
          referenceId: id,
          referenceLineId: l.line.id,
          batchNumber: l.line.lotNo,
          quantityChange: Number(l.line.qty),
          unitCostPaise: out.unitCostPaise,
          notes: `${note.dnNumber ?? `#${id}`} cancelled: ${input.reason}`,
          createdBy: viewer.actorId,
        });
        if (!row) {
          throw new InternalServerError("Stock posting returned no ledger row");
        }
        await repo.updateLine(l.line.id, { ledgerInId: row.id }, tx);
      }

      const now = new Date();
      await repo.updateHeader(
        id,
        {
          status: "cancelled",
          cancelReason: input.reason,
          cancelledBy: viewer.actorId,
          cancelledAt: now,
          lastUpdatedBy: viewer.actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      await audit(
        tx,
        viewer.actorId,
        "dispatch.cancel",
        note,
        { status: "posted" },
        { status: "cancelled", reason: input.reason },
      );
    });
    return buildDetail(id, viewer.canSeePrice, undefined);
  },

  // -------------------------------------------------------------------------
  // Transport after posting (BR-DSP-25..27)
  // -------------------------------------------------------------------------

  async updateTransport(
    id: number,
    patch: UpdateTransportInput,
    viewer: Viewer,
  ) {
    await mapEwayUnique(() =>
      repo.withTransaction(async (tx) => {
        const note = await repo.lockHeader(id, tx);
        if (!note) throw noteNotFound();
        if (note.status !== "posted") {
          throw noteStatusError("Transport can change only on a posted note");
        }
        if (patch.mode !== undefined) throw fieldLocked("Transport mode");

        const current = transportOf(note);
        const merged = mergeTransport(current, patch);
        const changed = TRANSPORT_MAP.filter(([key, col]) => {
          const v = patch[key];
          return v !== undefined && (v ?? null) !== (current[col] ?? null);
        });
        if (changed.length === 0) return; // equal values are ignored

        const ewayKeys = new Set(["ewayBillNo", "ewayBillDate", "distanceKm"]);
        const ewayChanged = changed.filter(([key]) => ewayKeys.has(key));
        if (ewayChanged.length > 0) {
          if (current.ewayBillNo !== null) throw fieldLocked("E-way bill data");
          if (
            ewayChanged.some(
              ([key]) => key === "distanceKm" && current.distanceKm !== null,
            )
          ) {
            throw fieldLocked("Distance");
          }
          if (!merged.ewayBillNo || !merged.ewayBillDate) {
            throw new BadRequestError(
              "Add the e-way bill number and date together",
            );
          }
          validateTransport(merged, note.noteDate, istDayKey());
          await assertEwayFree(merged.ewayBillNo, id, tx);
        }
        if (
          note.ewayRequired &&
          merged.transportMode === "road" &&
          !merged.vehicleNo &&
          !merged.transporterId
        ) {
          throw new BadRequestError(
            "A road note that needs an e-way bill keeps a vehicle number or a transporter ID",
          );
        }

        const now = new Date();
        const set: Partial<DeliveryNoteInsert> = {
          ...merged,
          lastUpdatedBy: viewer.actorId,
          lastUpdatedAt: now,
        };
        await repo.updateHeader(id, set, tx);
        await repo.insertHistory(
          changed.map(([key, col]) => ({
            noteId: id,
            field: key,
            oldValue: current[col] === null ? null : String(current[col]),
            newValue: merged[col] === null ? "" : String(merged[col]),
            changedBy: viewer.actorId,
            changedAt: now,
          })),
          tx,
        );
        await audit(
          tx,
          viewer.actorId,
          "dispatch.transport",
          note,
          Object.fromEntries(changed.map(([key, col]) => [key, current[col]])),
          Object.fromEntries(changed.map(([key, col]) => [key, merged[col]])),
        );
      }),
    );
    return buildDetail(id, viewer.canSeePrice, undefined);
  },
};

// ---------------------------------------------------------------------------

function emptyTransport(): TransportCols {
  return {
    transportMode: null,
    vehicleNo: null,
    transporterId: null,
    transporterName: null,
    transportDocNo: null,
    transportDocDate: null,
    distanceKm: null,
    ewayBillNo: null,
    ewayBillDate: null,
  };
}

async function insertPackageRows(
  noteId: number,
  packages: PackageDraft[],
  lineRows: Pick<DeliveryNoteLineRow, "id" | "soLineId">[],
  tx: DbExecutor,
) {
  const lineBySo = new Map(lineRows.map((l) => [l.soLineId, l.id]));
  await repo.insertPackages(
    packages.map((p) => {
      const lineId = lineBySo.get(p.soLineId);
      if (lineId === undefined) throw lineNotOnSo();
      return {
        noteId,
        lineId,
        packageNo: p.packageNo,
        qty: milliToString(toMilli(p.qty)),
        netKg: p.netKg.toFixed(3),
        grossKg: p.grossKg.toFixed(3),
        lotNo: p.lotNo,
      };
    }),
    tx,
  );
}
