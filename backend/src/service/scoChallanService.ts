import { db } from "../db/client";
import type { Actor } from "../lib/auth-middleware";
import { allocateFinancialYearSequence } from "../lib/document-number";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { scoChallanRepository } from "../repository/scoChallanRepository";
import { scoRepository, type Tx } from "../repository/scoRepository";
import { postStock } from "../repository/stockPostingRepository";
import type {
  challanDetailsSchemaType,
  challanLineResponseSchemaType,
  challanPrintSchemaType,
  challanResponseSchemaType,
  createChallanSchemaType,
  openChallanListQuerySchemaType,
} from "../types/scoChallan.types";

type Paginated<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

const CHALLANABLE_STATUSES = ["approved", "material_issued"];
// BR-SCO-10: challan value at or above Rs 50,000 needs an e-way bill.
const EWB_THRESHOLD_PAISE = 5_000_000;
const WARNING_DAYS = 60;
const DECLARATION = "Goods sent for job work u/s 143, no tax charged.";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// BR-SCO-11: challan date + 1 year (29 Feb -> 28 Feb).
function addOneYear(date: Date) {
  const due = new Date(date.getTime());
  due.setUTCFullYear(due.getUTCFullYear() + 1);
  if (due.getUTCMonth() !== date.getUTCMonth()) {
    due.setUTCDate(0);
  }
  return due;
}

function dueStatusOf(daysLeft: number) {
  if (daysLeft < 0) return "overdue" as const;
  if (daysLeft <= WARNING_DAYS) return "warning" as const;
  return "ok" as const;
}

type ChallanQueryRow = NonNullable<
  Awaited<ReturnType<typeof scoChallanRepository.findById>>
>;

function toChallanResponse(row: ChallanQueryRow): challanResponseSchemaType {
  return { ...row, dueStatus: dueStatusOf(row.daysLeft) };
}

function toLineResponse(
  line: Awaited<ReturnType<typeof scoChallanRepository.findLines>>[number],
): challanLineResponseSchemaType {
  return { ...line, lineValuePaise: line.qty * line.unitIssueCostPaise };
}

function totalsByItem(lines: createChallanSchemaType["lines"]) {
  const totals = new Map<number, number>();
  for (const line of lines) {
    totals.set(line.scoItemId, (totals.get(line.scoItemId) ?? 0) + line.qty);
  }
  return totals;
}

function stateCodeOf(gstin: string | null) {
  return gstin ? gstin.slice(0, 2) : null;
}

async function loadDetails(
  challanId: number,
  tx: Tx,
): Promise<challanDetailsSchemaType> {
  const challan = await scoChallanRepository.findByIdInTx(
    challanId,
    todayKey(),
    tx,
  );
  if (!challan) throw new NotFoundError("Challan not found");
  const lines = await scoChallanRepository.findLines(challanId, tx);
  return {
    challan: toChallanResponse(challan),
    lines: lines.map(toLineResponse),
  };
}

export const scoChallanService = {
  // BR-SCO-07..11, 24, 25: everything below runs in one transaction that
  // locks the SCO row first; any refusal rolls back all rows and the number.
  async create(
    scoId: number,
    input: createChallanSchemaType,
    actorId: number,
    _actor: Actor,
  ): Promise<challanDetailsSchemaType> {
    const challanDate = input.challanDate ?? new Date();
    const wanted = totalsByItem(input.lines);

    return db.transaction(async (tx) => {
      // Arrival check (400) on the unlocked read; re-checked after the lock (409).
      const pre = await scoRepository.findHeader(scoId, tx);
      if (!pre) throw new NotFoundError("Subcontracting order not found");
      if (!CHALLANABLE_STATUSES.includes(pre.status)) {
        throw new ConflictError(
          `A challan cannot be made on an SCO in status ${pre.status}`,
          "SCO_INVALID_TRANSITION",
        );
      }
      const preLines = await scoRepository.findLines(scoId, tx);
      const preById = new Map(preLines.map((l) => [l.id, l]));
      for (const [itemId, qty] of wanted) {
        const line = preById.get(itemId);
        if (!line) {
          throw new NotFoundError(`SCO line ${itemId} not found on this SCO`);
        }
        if (qty > line.rawQtyToIssue - line.issuedQty) {
          throw new BadRequestError(
            `Qty for SCO line ${itemId} is more than what is left to issue (${line.rawQtyToIssue - line.issuedQty})`,
            "SCO_CHALLAN_QTY_EXCEEDED",
          );
        }
      }

      const locked = await scoRepository.lockById(scoId, tx);
      if (!locked) throw new NotFoundError("Subcontracting order not found");
      if (!CHALLANABLE_STATUSES.includes(locked.status)) {
        throw new ConflictError(
          `A challan cannot be made on an SCO in status ${locked.status}`,
          "SCO_INVALID_TRANSITION",
        );
      }
      const lines = await scoRepository.findLines(scoId, tx);
      const lineById = new Map(lines.map((l) => [l.id, l]));
      for (const [itemId, qty] of wanted) {
        const line = lineById.get(itemId);
        if (!line || qty > line.rawQtyToIssue - line.issuedQty) {
          throw new ConflictError(
            "Another challan issued this material first; reload and try again",
            "SCO_ISSUE_CONFLICT",
          );
        }
      }

      // BR-SCO-09: plant details and HSN before anything is written.
      const company = await scoChallanRepository.getCompanySettings(tx);
      if (!company) {
        throw new BadRequestError(
          "Company details are not set; the owner must save them first",
          "COMPANY_SETTINGS_MISSING",
        );
      }
      const rawItemIds = [
        ...new Set(
          input.lines.map((l) => lineById.get(l.scoItemId)?.rawItemId),
        ),
      ].filter((id): id is number => id !== undefined);
      const items = await scoChallanRepository.lockItems(rawItemIds, tx);
      const itemById = new Map(items.map((i) => [i.id, i]));
      for (const item of items) {
        if (!item.hsnCode) {
          throw new BadRequestError(
            `Raw item ${item.id} has no HSN code`,
            "ITEM_HSN_MISSING",
          );
        }
      }

      const prepared = input.lines.map((l) => {
        const scoLine = lineById.get(l.scoItemId);
        const item = scoLine ? itemById.get(scoLine.rawItemId) : undefined;
        if (!scoLine || !item) throw new NotFoundError("SCO line not found");
        return {
          scoItemId: l.scoItemId,
          itemId: item.id,
          qty: l.qty,
          unitIssueCostPaise: item.averageCostPaise,
          heatNumber: l.heatNumber ?? scoLine.rawItemBatch ?? null,
          hsnCode: item.hsnCode as string,
        };
      });
      const valuePaise = prepared.reduce(
        (sum, l) => sum + l.qty * l.unitIssueCostPaise,
        0,
      );

      // BR-SCO-10: e-way bill number.
      const vendor = await scoChallanRepository.findVendor(locked.vendorId, tx);
      if (!vendor) throw new NotFoundError("Vendor not found");
      const vendorState = stateCodeOf(vendor.gstNumber);
      const needsEwb =
        vendorState === null ||
        vendorState !== company.stateCode ||
        valuePaise >= EWB_THRESHOLD_PAISE;
      if (needsEwb && !input.ewayBillNo) {
        throw new BadRequestError(
          "An e-way bill number is required for this challan",
          "EWAY_BILL_REQUIRED",
        );
      }

      const mainStore = await scoChallanRepository.findMainStore(tx);
      if (!mainStore) {
        throw new ConflictError("No main store location is set up");
      }
      const vendorLocationId = await scoChallanRepository.ensureVendorLocation(
        vendor.id,
        vendor.name,
        actorId,
        tx,
      );

      const { fy, seq } = await allocateFinancialYearSequence(
        tx,
        "sco_challan",
        actorId,
        challanDate,
      );
      const challanNumber = `JWC/${fy}/${seq}`;
      // BR-SCO-09 (Rule 55): challan number is at most 16 characters.
      if (challanNumber.length > 16) {
        throw new ConflictError(
          "Challan number would be longer than 16 characters",
          "SCO_CHALLAN_NUMBER_TOO_LONG",
        );
      }
      const challanId = await scoChallanRepository.insertChallan(
        {
          challanNumber,
          scoId,
          vendorId: vendor.id,
          challanDate,
          ewayBillNo: input.ewayBillNo ?? null,
          valuePaise,
          returnDueDate: addOneYear(challanDate),
          createdBy: actorId,
        },
        tx,
      );

      // BR-SCO-08, 25: two rows per line, heat number on both, reference = challan.
      for (const line of prepared) {
        const lineId = await scoChallanRepository.insertLine(
          { ...line, challanId },
          tx,
        );
        const base = {
          itemId: line.itemId,
          referenceType: "sco_issue" as const,
          referenceId: challanId,
          referenceLineId: lineId,
          batchNumber: line.heatNumber,
          unitCostPaise: line.unitIssueCostPaise,
          averageEffect: "none" as const,
          createdBy: actorId,
        };
        await postStock(tx, {
          ...base,
          locationId: mainStore.id,
          transactionType: "out",
          quantityChange: -line.qty,
          blockNegative: true,
        });
        await postStock(tx, {
          ...base,
          locationId: vendorLocationId,
          transactionType: "in",
          quantityChange: line.qty,
        });
      }
      for (const [itemId, qty] of wanted) {
        await scoChallanRepository.addIssuedQty(itemId, qty, tx);
      }
      await scoRepository.updateHeader(
        scoId,
        {
          status: "material_issued",
          lastUpdatedBy: actorId,
          lastUpdatedAt: new Date(),
        },
        tx,
      );

      return loadDetails(challanId, tx);
    });
  },

  async listBySco(scoId: number): Promise<challanResponseSchemaType[]> {
    const sco = await scoRepository.findHeader(scoId);
    if (!sco) throw new NotFoundError("Subcontracting order not found");
    const rows = await scoChallanRepository.listBySco(scoId, todayKey());
    return rows.map(toChallanResponse);
  },

  async listOpen(
    query: openChallanListQuerySchemaType,
  ): Promise<Paginated<challanResponseSchemaType>> {
    const { rows, total } = await scoChallanRepository.listOpen(
      query,
      todayKey(),
    );
    return {
      data: rows.map(toChallanResponse),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  },

  // BR-SCO-09: challan plus the Rule 55 print fields.
  async getPrintData(challanId: number): Promise<challanPrintSchemaType> {
    const challan = await scoChallanRepository.findById(challanId, todayKey());
    if (!challan) throw new NotFoundError("Challan not found");
    const [lines, vendor, company] = await Promise.all([
      scoChallanRepository.findLines(challanId),
      scoChallanRepository.findVendorForPrint(challan.vendorId),
      scoChallanRepository.getCompanySettingsPlain(),
    ]);
    if (!vendor) throw new NotFoundError("Vendor not found");
    if (!company) {
      throw new BadRequestError(
        "Company details are not set; the owner must save them first",
        "COMPANY_SETTINGS_MISSING",
      );
    }
    return {
      challan: toChallanResponse(challan),
      lines: lines.map(toLineResponse),
      company,
      vendor: {
        id: vendor.id,
        name: vendor.name,
        address: vendor.address,
        gstin: vendor.gstNumber,
        stateCode: stateCodeOf(vendor.gstNumber),
      },
      declaration: DECLARATION,
    };
  },
};
