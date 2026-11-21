import { NotFoundError } from "../lib/errors";
import { istDayKey } from "../lib/ist-day";
import {
  type OnTimeLineRow,
  type PriceLineRow,
  type RatingRow,
  type RejectionLineRow,
  supplierRatingRepository,
  type TrendRow,
} from "../repository/supplierRatingRepository";
import type {
  SupplierRating,
  SupplierRatingLinesQuery,
  SupplierRatingListQuery,
} from "../types/supplierRating.types";

type Label = "good" | "watch" | "poor";

const num = (v: number | string) => Number(v);
const numOrNull = (v: number | string | null) =>
  v === null ? null : Number(v);

/** BR-SRT-24: Good 80-100, Watch 60-79, Poor 0-59; no label without a score. */
function labelOf(score: number | null): Label | null {
  if (score === null) return null;
  if (score >= 80) return "good";
  if (score >= 60) return "watch";
  return "poor";
}

function paging(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function parseQtyList(raw: RatingRow["rj_ni_qty"]) {
  const list = (typeof raw === "string" ? JSON.parse(raw) : raw) as Array<{
    uom: string;
    qty: string;
  }>;
  return list.map((r) => ({ uom: r.uom, qty: r.qty }));
}

function toRating(r: RatingRow): SupplierRating {
  const score = numOrNull(r.score);
  const judged = num(r.ot_judged);
  const decided = num(r.rj_decided);
  return {
    supplierId: num(r.supplier_id),
    supplierName: r.supplier_name,
    isActive: r.is_active,
    windowFrom: r.window_from,
    windowTo: r.window_to,
    onTime: {
      pctTenths: numOrNull(r.ot_pct),
      lines: judged,
      onTimeLines: num(r.ot_on_time),
      lateLines: num(r.ot_late),
      openLateLines: num(r.ot_open_late),
      shortClosedLateCount: num(r.ot_sc_late),
      cancelledAfterDispatchCount: num(r.ot_ca_late),
      noDueDateCount: num(r.ot_no_due),
    },
    rejection: {
      pctTenths: numOrNull(r.rj_pct),
      lines: decided,
      linesWithRejects: num(r.rj_with_rejects),
      decidedLines: decided,
      notInspectedLines: num(r.rj_not_insp),
      notInspectedRejectedQty: parseQtyList(r.rj_ni_qty),
    },
    priceVariance: {
      pctTenths: numOrNull(r.pr_pct),
      lines: num(r.pr_lines),
      comparedLines: num(r.pr_compared),
      notComparedLines: num(r.pr_not_compared),
    },
    score,
    label: labelOf(score),
    notEnoughData:
      judged < 5 || decided < 5
        ? { judgedLines: judged, decidedLines: decided, required: 5 }
        : null,
  };
}

async function requireSupplier(supplierId: number) {
  if (!(await supplierRatingRepository.supplierExists(supplierId))) {
    throw new NotFoundError("Supplier not found", "SUPPLIER_NOT_FOUND");
  }
}

function toOnTimeLine(r: OnTimeLineRow) {
  return {
    poItemId: num(r.po_item_id),
    poNumber: r.po_number,
    prId: numOrNull(r.pr_id),
    grnId: null,
    itemSku: r.sku,
    itemName: r.item_name,
    uom: r.uom,
    orderedQty: r.ordered_qty,
    arrivedQty: r.arrived_qty,
    dueDate: r.due,
    revisedDate: r.revised,
    completionDate: r.completion,
    judgementDate: r.judgement,
    verdict: r.verdict,
    daysLate: numOrNull(r.days_late),
    state: r.state,
  };
}

function toRejectionLine(r: RejectionLineRow) {
  return {
    grnItemId: num(r.grn_item_id),
    grnId: num(r.grn_id),
    grnNumber: r.grn_number,
    poNumber: r.po_number,
    prId: numOrNull(r.pr_id),
    itemSku: r.sku,
    receivedDate: r.received_date,
    arrivedQty: r.arrived_qty,
    rejectedQty: r.rejected_qty,
    uom: r.uom,
    ratePaise: num(r.rate),
    rejectedValuePaise: num(r.rejected_value),
    arrivedValuePaise: num(r.arrived_value),
    inspection: r.inspection,
  };
}

function toPriceLine(r: PriceLineRow) {
  return {
    poItemId: num(r.po_item_id),
    poNumber: r.po_number,
    prId: numOrNull(r.pr_id),
    grnId: null,
    poDate: r.po_date,
    itemSku: r.sku,
    uom: r.uom,
    qty: r.qty,
    ratePaise: num(r.rate),
    referenceRatePaise: numOrNull(r.ref_rate),
    referenceSource: r.ref_source,
    variancePaise: numOrNull(r.variance),
    variancePctTenths: numOrNull(r.variance_pct),
    lineVariancePaise: numOrNull(r.line_variance),
    compared: r.compared,
    notComparedReason: r.reason,
  };
}

function toTrendMonth(r: TrendRow) {
  const score = numOrNull(r.score);
  return {
    month: r.month,
    onTime: { pctTenths: numOrNull(r.ot_pct), lines: num(r.ot_judged) },
    rejection: { pctTenths: numOrNull(r.rj_pct), lines: num(r.rj_decided) },
    priceVariance: { pctTenths: numOrNull(r.pr_pct), lines: num(r.pr_lines) },
    score,
    label: labelOf(score),
    notEnoughData: null,
  };
}

export const supplierRatingService = {
  async list(query: SupplierRatingListQuery) {
    // Default sort name asc; an explicit sortBy without sortDir is asc.
    const sortBy = query.sortBy ?? "name";
    const sortDir = query.sortDir ?? "asc";
    const { rows, total } = await supplierRatingRepository.list(istDayKey(), {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      q: query.q,
      sortBy,
      sortDir,
    });
    return {
      data: rows.map(toRating),
      meta: paging(query.page, query.pageSize, total),
    };
  },

  async card(supplierId: number) {
    const row = await supplierRatingRepository.card(istDayKey(), supplierId);
    if (!row) {
      throw new NotFoundError("Supplier not found", "SUPPLIER_NOT_FOUND");
    }
    return toRating(row);
  },

  async trend(supplierId: number) {
    const [exists, rows] = await Promise.all([
      supplierRatingRepository.supplierExists(supplierId),
      supplierRatingRepository.trend(istDayKey(), supplierId),
    ]);
    if (!exists) {
      throw new NotFoundError("Supplier not found", "SUPPLIER_NOT_FOUND");
    }
    return { months: rows.map(toTrendMonth) };
  },

  async lines(supplierId: number, query: SupplierRatingLinesQuery) {
    await requireSupplier(supplierId);
    const today = istDayKey();
    const base = { page: query.page, pageSize: query.pageSize };
    // sortBy omitted -> the measure's default sort and direction;
    // sortBy given without sortDir -> asc. The Zod refine already checked
    // sortBy against the measure's whitelist.
    const explicit = query.sortBy !== undefined;
    const dir = query.sortDir ?? (explicit ? "asc" : undefined);

    if (query.measure === "on_time") {
      const { rows, total } = await supplierRatingRepository.onTimeLines(
        today,
        supplierId,
        {
          ...base,
          verdict: query.verdict ?? "all",
          sortBy: (query.sortBy ?? "daysLate") as Parameters<
            typeof supplierRatingRepository.onTimeLines
          >[2]["sortBy"],
          sortDir: dir ?? "desc",
        },
      );
      return {
        data: rows.map(toOnTimeLine),
        meta: paging(query.page, query.pageSize, total),
      };
    }
    if (query.measure === "rejection") {
      const { rows, total } = await supplierRatingRepository.rejectionLines(
        today,
        supplierId,
        {
          ...base,
          sortBy: (query.sortBy ?? "receivedDate") as Parameters<
            typeof supplierRatingRepository.rejectionLines
          >[2]["sortBy"],
          sortDir: dir ?? "desc",
        },
      );
      return {
        data: rows.map(toRejectionLine),
        meta: paging(query.page, query.pageSize, total),
      };
    }
    const { rows, total } = await supplierRatingRepository.priceLines(
      today,
      supplierId,
      {
        ...base,
        sortBy: (query.sortBy ?? "poDate") as Parameters<
          typeof supplierRatingRepository.priceLines
        >[2]["sortBy"],
        sortDir: dir ?? "desc",
      },
    );
    return {
      data: rows.map(toPriceLine),
      meta: paging(query.page, query.pageSize, total),
    };
  },
};
