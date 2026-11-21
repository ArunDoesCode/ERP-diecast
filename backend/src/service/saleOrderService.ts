import { db } from "../db/client";
import { conflictLocation, isUniqueViolation } from "../lib/db-errors";
import { allocateDocumentSequence } from "../lib/document-number";
import { AppError, BadRequestError, NotFoundError } from "../lib/errors";
import { istDayKey, istMonthKey } from "../lib/ist-day";
import { customerRepository } from "../repository/customerRepository";
import type { DbExecutor, DbTransaction } from "../repository/executor";
import {
  type ItemRef,
  type SaleOrderInsert,
  type SaleOrderLineInsert,
  type SaleOrderLineRow,
  type SaleOrderRow,
  saleOrderRepository,
} from "../repository/saleOrderRepository";
import { salesAuditRepository } from "../repository/salesAuditRepository";
import type {
  CreateSaleOrderInput,
  SoListQuery,
  SoReasonBody,
  SoVersionBody,
  UpdateSaleOrderInput,
} from "../types/saleOrder.types";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const MIN_DATE = "2000-01-01"; // BR-SO-61
const WHOLE_UNITS = new Set(["pcs", "set"]); // BR-SO-07

/** Quantities are numeric(14,3): compare and add them as whole thousandths. */
const toMilli = (v: number | string) => Math.round(Number(v) * 1000);
const milliToString = (m: number) => (m / 1000).toFixed(3);

/** BR-SO-11: round(qty x unit price) in integer paise, exact (BigInt, half up). */
function lineAmountPaise(qtyMilli: number, unitPricePaise: number): number {
  const product = BigInt(qtyMilli) * BigInt(unitPricePaise);
  return Number((product + 500n) / 1000n);
}

/** Last allowed plant day: today + 5 years (BR-SO-61). */
function maxAllowedDate(today: string): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  // a bare date is 05:30 IST the same day, so istDayKey reads it back as that day
  return istDayKey(new Date(Date.UTC(y + 5, m - 1, d)));
}

function toMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

const notFound = () =>
  new NotFoundError("Sale order not found", "SO_NOT_FOUND");

function conflict(message: string, code: string, details?: unknown) {
  return new AppError(
    message,
    409,
    code,
    details === undefined ? undefined : { details },
  );
}

function assertVersion(so: SaleOrderRow, editVersion: number) {
  if (so.editVersion !== editVersion) {
    throw conflict(
      "This sale order was changed by someone else. Reload and try again.",
      "STALE_VERSION",
    );
  }
}

function assertDateInRange(
  label: string,
  date: string,
  min: string,
  max: string,
) {
  if (date < min || date > max) {
    throw new BadRequestError(
      `${label} must be between ${min} and ${max}`,
      "DATE_OUT_OF_RANGE",
    );
  }
}

function assertQtyForUnit(sku: string, uom: string, qty: number) {
  if (WHOLE_UNITS.has(uom.toLowerCase()) && toMilli(qty) % 1000 !== 0) {
    throw new BadRequestError(
      `Quantity of ${sku} must be a whole number (unit ${uom})`,
      "QTY_NOT_WHOLE",
    );
  }
}

function assertItemUsable(item: ItemRef | undefined, itemId: number): ItemRef {
  if (!item) {
    throw new BadRequestError(`Item ${itemId} not found`, "ITEM_NOT_FOUND");
  }
  if (!item.isActive) {
    throw new BadRequestError(`Item ${item.sku} is inactive`, "ITEM_INACTIVE");
  }
  return item;
}

async function assertCustomerUsable(customerId: number, tx: DbExecutor) {
  const customer = await customerRepository.findById(customerId, tx);
  if (!customer) {
    throw new BadRequestError("Customer not found", "CUSTOMER_NOT_FOUND");
  }
  if (!customer.isActive) {
    throw new BadRequestError(
      `Customer ${customer.name} is inactive`,
      "CUSTOMER_INACTIVE",
    );
  }
  return customer;
}

async function assertCustomerPoFree(
  customerId: number,
  poNumber: string | null,
  excludeSoId: number | null,
  tx: DbExecutor,
) {
  if (!poNumber) return;
  const clash = await saleOrderRepository.findCustomerPoClash(
    customerId,
    poNumber,
    excludeSoId,
    tx,
  );
  if (clash) throw customerPoExists(clash.soNumber);
}

const customerPoExists = (soNumber: string) =>
  conflict(
    `This customer PO number is already on ${soNumber}`,
    "CUSTOMER_PO_EXISTS",
    { soNumber },
  );

/**
 * Race fallback: the pre-checks above cover the normal case, the unique
 * indexes cover two requests at once.
 */
async function translateConflict(
  error: unknown,
  customerId: number,
  poNumber: string | null,
): Promise<never> {
  if (isUniqueViolation(error)) {
    const { constraint } = conflictLocation(error);
    if (constraint === "uq_sale_orders_customer_po" && poNumber) {
      const clash = await saleOrderRepository.findCustomerPoClash(
        customerId,
        poNumber,
        null,
      );
      if (clash) throw customerPoExists(clash.soNumber);
    }
    if (constraint === "uq_sale_order_lines_so_item_date") {
      throw new BadRequestError(
        "The same item can appear again only with a different delivery date",
        "SO_DUPLICATE_ITEM_DATE",
      );
    }
  }
  throw error;
}

function assertNoDuplicateItemDate(
  lines: Array<{ itemId: number; deliveryDate: string }>,
) {
  const seen = new Set<string>();
  for (const l of lines) {
    const key = `${l.itemId}|${l.deliveryDate}`;
    if (seen.has(key)) {
      throw new BadRequestError(
        "The same item can appear again only with a different delivery date",
        "SO_DUPLICATE_ITEM_DATE",
      );
    }
    seen.add(key);
  }
}

// BR-SO-14, 19: live PR / SCO lines raised from this SO block a cut or a cancel.
async function assertNoLiveDocuments(soId: number, tx: DbExecutor) {
  const docs = await saleOrderRepository.findRaisedDocuments(soId, true, tx);
  if (docs.length > 0) {
    const numbers = docs.map((d) => d.number).join(", ");
    throw conflict(
      `Live documents raised from this sale order must be cancelled first: ${numbers}`,
      "LIVE_DOCUMENTS_LINKED",
      { documents: docs.map((d) => ({ type: d.type, number: d.number })) },
    );
  }
}

// ---------------------------------------------------------------------------
// Detail shape
// ---------------------------------------------------------------------------

async function buildDetail(soId: number, executor: DbExecutor = db) {
  const header = await saleOrderRepository.findHeader(soId, executor);
  if (!header) throw notFound();
  const { so } = header;
  const [lineRows, raisedDocuments, snapshot] = await Promise.all([
    saleOrderRepository.findLines(soId, executor),
    saleOrderRepository.findRaisedDocuments(soId, false, executor),
    saleOrderRepository.findCurrentSnapshot(soId, executor),
  ]);

  return {
    id: so.id,
    soNumber: so.soNumber,
    customerId: so.customerId,
    customerName: header.customerName,
    status: so.status,
    orderDate: so.orderDate,
    customerPoNumber: so.customerPoNumber,
    customerPoDate: so.customerPoDate,
    shipToAddress: so.shipToAddress,
    shipToStateCode: so.shipToStateCode,
    notes: so.notes,
    totalAmountPaise: so.totalAmountPaise,
    editVersion: so.editVersion,
    closeKind: so.closeKind,
    holdReason: so.holdReason,
    closeReason: so.closeReason,
    cancelReason: so.cancelReason,
    confirmedAt: so.confirmedAt,
    createdByName: header.createdByName ?? "",
    createdAt: so.createdAt,
    lastUpdatedAt: so.lastUpdatedAt,
    lines: lineRows.map(({ line, sku, itemName }) => ({
      id: line.id,
      lineNo: line.lineNo,
      itemId: line.itemId,
      sku,
      itemName,
      uom: line.uom,
      qty: Number(line.qty),
      unitPricePaise: line.unitPricePaise,
      lineAmountPaise: line.lineAmountPaise,
      gstPercent: Number(line.gstPercent),
      deliveryDate: line.deliveryDate,
      deliveredQty: Number(line.deliveredQty),
      openQty: (toMilli(line.qty) - toMilli(line.deliveredQty)) / 1000,
      notes: line.notes,
    })),
    raisedDocuments,
    currentSnapshot: snapshot
      ? {
          id: snapshot.id,
          runNo: snapshot.runNo,
          number: `${so.soNumber}/E${snapshot.runNo}`,
          outOfDate: snapshot.outOfDate,
          rowCount: snapshot.rowCount,
          flaggedCount: snapshot.flaggedCount,
          createdAt: snapshot.createdAt,
        }
      : null,
  };
}

async function lockSo(soId: number, editVersion: number, tx: DbTransaction) {
  const so = await saleOrderRepository.lockById(soId, tx);
  if (!so) throw notFound();
  assertVersion(so, editVersion);
  return so;
}

const wrongStatus = (status: string, action: string) =>
  conflict(
    `A ${status.replace("_", " ")} sale order cannot be ${action}`,
    "SO_INVALID_STATUS",
  );

type LineEdit = NonNullable<UpdateSaleOrderInput["lines"]>[number];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const saleOrderService = {
  async list(query: SoListQuery) {
    const { rows, total, statusCounts } = await saleOrderRepository.list(query);
    return {
      data: rows,
      meta: { ...toMeta(query.page, query.pageSize, total), statusCounts },
    };
  },

  async getDetails(soId: number) {
    return buildDetail(soId);
  },

  async listAudit(
    soId: number,
    query: {
      page: number;
      pageSize: number;
      sortDir: "asc" | "desc";
      action?: string | undefined;
    },
  ) {
    const header = await saleOrderRepository.findStatusById(soId);
    if (!header) throw notFound();
    const { rows, total } = await salesAuditRepository.listForSo(soId, query);
    return { data: rows, meta: toMeta(query.page, query.pageSize, total) };
  },

  // BR-SO-05..08, 56, 57, 61: header and every line in one transaction.
  async create(input: CreateSaleOrderInput, actorId: number) {
    const poNumber = input.customerPoNumber ?? null;
    try {
      return await db.transaction(async (tx) => {
        const now = new Date();
        const today = istDayKey(now);
        const maxDate = maxAllowedDate(today);

        await assertCustomerUsable(input.customerId, tx);
        assertDateInRange("Order date", input.orderDate, MIN_DATE, today);
        if (input.customerPoDate) {
          assertDateInRange(
            "Customer PO date",
            input.customerPoDate,
            MIN_DATE,
            today,
          );
        }

        const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
        const items = await saleOrderRepository.findItemsByIds(itemIds, tx);
        for (const l of input.lines) {
          const item = assertItemUsable(items.get(l.itemId), l.itemId);
          assertQtyForUnit(item.sku, item.uom, l.qty);
          assertDateInRange("Delivery date", l.deliveryDate, today, maxDate);
        }
        assertNoDuplicateItemDate(input.lines);
        await assertCustomerPoFree(input.customerId, poNumber, null, tx);

        const { periodKey, seq } = await allocateDocumentSequence(
          tx,
          "SO",
          actorId,
          now,
          istMonthKey(now),
        );
        const soNumber = `SO-${periodKey.slice(2, 4)}${periodKey.slice(5, 7)}-${String(seq).padStart(4, "0")}`;

        const lineRows: SaleOrderLineInsert[] = [];
        let total = 0;
        for (const [index, l] of input.lines.entries()) {
          const item = items.get(l.itemId) as ItemRef;
          const amount = lineAmountPaise(toMilli(l.qty), l.unitPricePaise);
          total += amount;
          lineRows.push({
            soId: 0, // set below
            lineNo: index + 1,
            itemId: l.itemId,
            uom: item.uom,
            qty: milliToString(toMilli(l.qty)),
            unitPricePaise: l.unitPricePaise,
            lineAmountPaise: amount,
            gstPercent: String(l.gstPercent),
            deliveryDate: l.deliveryDate,
            notes: l.notes ?? null,
            createdBy: actorId,
          });
        }

        const so = await saleOrderRepository.insertSo(
          {
            soNumber,
            customerId: input.customerId,
            status: "draft",
            orderDate: input.orderDate,
            customerPoNumber: poNumber,
            customerPoDate: input.customerPoDate ?? null,
            notes: input.notes ?? null,
            shipToAddress: input.shipToAddress ?? null,
            shipToStateCode: input.shipToStateCode ?? null,
            totalAmountPaise: total,
            lastLineNo: input.lines.length,
            createdBy: actorId,
          },
          tx,
        );
        if (!so) throw new BadRequestError("Sale order was not saved");
        await saleOrderRepository.insertLines(
          lineRows.map((r) => ({ ...r, soId: so.id })),
          tx,
        );

        await salesAuditRepository.write(
          {
            actorId,
            action: "so.create",
            targetType: "sale_order",
            targetId: so.id,
            soId: so.id,
            after: {
              soNumber,
              customerId: input.customerId,
              orderDate: input.orderDate,
              totalAmountPaise: total,
              lines: lineRows.map((r) => ({
                lineNo: r.lineNo,
                itemId: r.itemId,
                qty: Number(r.qty),
                unitPricePaise: r.unitPricePaise,
                gstPercent: Number(r.gstPercent),
                deliveryDate: r.deliveryDate,
              })),
            },
          },
          tx,
        );
        return buildDetail(so.id, tx);
      });
    } catch (error) {
      return translateConflict(error, input.customerId, poNumber);
    }
  },

  // BR-SO-09, 10, 13, 14, 53, 59, 60: patch semantics on lines.
  async update(soId: number, input: UpdateSaleOrderInput, actorId: number) {
    let customerId = input.customerId ?? 0;
    let poNumber: string | null = input.customerPoNumber ?? null;
    try {
      return await db.transaction(async (tx) => {
        const so = await lockSo(soId, input.editVersion, tx);
        customerId = input.customerId ?? so.customerId;
        poNumber =
          input.customerPoNumber !== undefined
            ? input.customerPoNumber
            : so.customerPoNumber;
        if (so.status !== "draft" && so.status !== "confirmed") {
          throw conflict(
            `A ${so.status.replace("_", " ")} sale order cannot be edited`,
            "SO_NOT_EDITABLE",
          );
        }
        const isDraft = so.status === "draft";
        const now = new Date();
        const today = istDayKey(now);
        const maxDate = maxAllowedDate(today);
        const locked = (what: string) =>
          conflict(
            `${what} cannot be changed after the sale order is confirmed`,
            "SO_FIELD_LOCKED",
          );

        // ---- header ----
        const headerSet: Partial<SaleOrderInsert> = {};
        const hBefore: Record<string, unknown> = {};
        const hAfter: Record<string, unknown> = {};
        const setHeader = <
          K extends keyof SaleOrderRow & keyof SaleOrderInsert,
        >(
          key: K,
          value: SaleOrderRow[K] | undefined,
        ) => {
          if (value === undefined || value === so[key]) return;
          headerSet[key] = value as SaleOrderInsert[K];
          hBefore[key] = so[key];
          hAfter[key] = value;
        };

        if (
          input.customerId !== undefined &&
          input.customerId !== so.customerId
        ) {
          if (!isDraft) throw locked("The customer");
          await assertCustomerUsable(input.customerId, tx);
          setHeader("customerId", input.customerId);
        }
        if (input.orderDate !== undefined && input.orderDate !== so.orderDate) {
          if (!isDraft) throw locked("The order date");
          assertDateInRange("Order date", input.orderDate, MIN_DATE, today);
          setHeader("orderDate", input.orderDate);
        }
        if (
          input.customerPoNumber !== undefined &&
          input.customerPoNumber !== so.customerPoNumber
        ) {
          if (!isDraft) throw locked("The customer PO number");
          setHeader("customerPoNumber", input.customerPoNumber);
        }
        if (
          input.customerPoDate !== undefined &&
          input.customerPoDate !== so.customerPoDate
        ) {
          if (!isDraft) throw locked("The customer PO date");
          if (input.customerPoDate !== null) {
            assertDateInRange(
              "Customer PO date",
              input.customerPoDate,
              MIN_DATE,
              today,
            );
          }
          setHeader("customerPoDate", input.customerPoDate);
        }
        setHeader("shipToAddress", input.shipToAddress);
        setHeader("shipToStateCode", input.shipToStateCode);
        setHeader("notes", input.notes);

        const finalShipAddress =
          input.shipToAddress !== undefined
            ? input.shipToAddress
            : so.shipToAddress;
        const finalShipState =
          input.shipToStateCode !== undefined
            ? input.shipToStateCode
            : so.shipToStateCode;
        if (finalShipAddress && !finalShipState) {
          throw new BadRequestError(
            "shipToStateCode is required when shipToAddress is set",
            "SHIP_TO_STATE_REQUIRED",
          );
        }
        const customerOrPoChanged =
          headerSet.customerId !== undefined ||
          headerSet.customerPoNumber !== undefined;
        if (customerOrPoChanged) {
          await assertCustomerPoFree(customerId, poNumber, soId, tx);
        }

        // ---- lines ----
        const allLines = await saleOrderRepository.findAllLinesForUpdate(
          soId,
          tx,
        );
        const byId = new Map<number, SaleOrderLineRow>(
          allLines.map((l) => [l.id, l]),
        );
        const liveOf = (id: number) => {
          const l = byId.get(id);
          if (!l || l.removedAt) {
            throw new NotFoundError(
              `Line ${id} does not belong to this sale order`,
              "SO_LINE_NOT_FOUND",
            );
          }
          return l;
        };

        const edits = (input.lines ?? []).filter(
          (l): l is LineEdit & { id: number } => l.id !== undefined,
        );
        const adds = (input.lines ?? []).filter((l) => l.id === undefined);
        const removeIds = [...new Set(input.removeLineIds ?? [])];
        // BR-SO-59: every id must be a live line of this SO, before any write
        for (const e of edits) liveOf(e.id);
        for (const id of removeIds) liveOf(id);
        if (new Set(edits.map((e) => e.id)).size !== edits.length) {
          throw new BadRequestError(
            "A line id is sent twice",
            "SO_LINE_REPEATED",
          );
        }
        if (edits.some((e) => removeIds.includes(e.id))) {
          throw new BadRequestError(
            "A line cannot be edited and removed in one request",
            "SO_LINE_REPEATED",
          );
        }

        const itemIdsNeeded = new Set<number>();
        for (const e of edits) {
          // existing line items too: the sku lookup below reads this one query
          itemIdsNeeded.add(liveOf(e.id).itemId);
          if (e.itemId !== undefined) itemIdsNeeded.add(e.itemId);
        }
        for (const a of adds) {
          if (a.itemId === undefined) {
            throw new BadRequestError(
              "itemId is required for a new line",
              "ITEM_REQUIRED",
            );
          }
          itemIdsNeeded.add(a.itemId);
        }
        const items = await saleOrderRepository.findItemsByIds(
          [...itemIdsNeeded],
          tx,
        );

        // removals (BR-SO-14, 60)
        for (const id of removeIds) {
          const l = liveOf(id);
          if (toMilli(l.deliveredQty) > 0) {
            throw conflict(
              "A line with delivered quantity cannot be removed",
              "SO_LINE_DELIVERED",
            );
          }
        }

        // updates
        type Planned = {
          line: SaleOrderLineRow;
          set: Partial<SaleOrderLineInsert>;
          before: Record<string, unknown>;
          after: Record<string, unknown>;
        };
        const planned: Planned[] = [];
        let needChanged = false;
        let qtyReduced = false;
        const finalById = new Map<
          number,
          { itemId: number; deliveryDate: string }
        >();
        for (const l of allLines) {
          if (!l.removedAt && !removeIds.includes(l.id)) {
            finalById.set(l.id, {
              itemId: l.itemId,
              deliveryDate: l.deliveryDate,
            });
          }
        }

        for (const e of edits) {
          const line = liveOf(e.id);
          const set: Partial<SaleOrderLineInsert> = {};
          const before: Record<string, unknown> = {};
          const after: Record<string, unknown> = {};
          let itemId = line.itemId;
          let uom = line.uom;
          let sku = "";

          if (e.itemId !== undefined && e.itemId !== line.itemId) {
            if (!isDraft) throw locked("A line item");
            const item = assertItemUsable(items.get(e.itemId), e.itemId);
            itemId = item.id;
            uom = item.uom;
            sku = item.sku;
            set.itemId = item.id;
            set.uom = item.uom;
            before.itemId = line.itemId;
            after.itemId = item.id;
            needChanged = true;
          }
          if (!sku) {
            sku = items.get(itemId)?.sku ?? String(itemId);
          }
          assertQtyForUnit(sku, uom, e.qty);

          const newMilli = toMilli(e.qty);
          const oldMilli = toMilli(line.qty);
          if (newMilli < toMilli(line.deliveredQty)) {
            throw conflict(
              "Quantity cannot be below the delivered quantity",
              "QTY_BELOW_DELIVERED",
            );
          }
          if (newMilli !== oldMilli) {
            set.qty = milliToString(newMilli);
            before.qty = Number(line.qty);
            after.qty = e.qty;
            needChanged = true;
            if (newMilli < oldMilli) qtyReduced = true;
          }
          if (e.unitPricePaise !== line.unitPricePaise) {
            set.unitPricePaise = e.unitPricePaise;
            before.unitPricePaise = line.unitPricePaise;
            after.unitPricePaise = e.unitPricePaise;
          }
          if (e.gstPercent !== Number(line.gstPercent)) {
            set.gstPercent = String(e.gstPercent);
            before.gstPercent = Number(line.gstPercent);
            after.gstPercent = e.gstPercent;
          }
          if (e.deliveryDate !== line.deliveryDate) {
            // BR-SO-07: the date check runs only on a changed date
            assertDateInRange("Delivery date", e.deliveryDate, today, maxDate);
            set.deliveryDate = e.deliveryDate;
            before.deliveryDate = line.deliveryDate;
            after.deliveryDate = e.deliveryDate;
            needChanged = true;
          }
          if (e.notes !== undefined && e.notes !== line.notes) {
            set.notes = e.notes;
            before.notes = line.notes;
            after.notes = e.notes;
          }
          if (Object.keys(set).length > 0) {
            if (set.qty !== undefined || set.unitPricePaise !== undefined) {
              set.lineAmountPaise = lineAmountPaise(newMilli, e.unitPricePaise);
            }
            planned.push({ line, set, before, after });
          }
          finalById.set(line.id, { itemId, deliveryDate: e.deliveryDate });
        }

        // additions
        let lastLineNo = so.lastLineNo;
        const added: SaleOrderLineInsert[] = [];
        const finalAdded: Array<{ itemId: number; deliveryDate: string }> = [];
        for (const a of adds) {
          const item = assertItemUsable(
            items.get(a.itemId as number),
            a.itemId as number,
          );
          assertQtyForUnit(item.sku, item.uom, a.qty);
          assertDateInRange("Delivery date", a.deliveryDate, today, maxDate);
          lastLineNo += 1;
          added.push({
            soId,
            lineNo: lastLineNo,
            itemId: item.id,
            uom: item.uom,
            qty: milliToString(toMilli(a.qty)),
            unitPricePaise: a.unitPricePaise,
            lineAmountPaise: lineAmountPaise(toMilli(a.qty), a.unitPricePaise),
            gstPercent: String(a.gstPercent),
            deliveryDate: a.deliveryDate,
            notes: a.notes ?? null,
            createdBy: actorId,
          });
          finalAdded.push({ itemId: item.id, deliveryDate: a.deliveryDate });
        }

        const finalLines = [...finalById.values(), ...finalAdded];
        if (finalLines.length === 0) {
          throw new BadRequestError(
            "A sale order must keep at least one line",
            "SO_MIN_ONE_LINE",
          );
        }
        assertNoDuplicateItemDate(finalLines);

        if (removeIds.length > 0) needChanged = true;
        if (added.length > 0) needChanged = true;
        // BR-SO-14, 53: a cut or a removal waits for live raised documents
        if (qtyReduced || removeIds.length > 0) {
          await assertNoLiveDocuments(soId, tx);
        }

        const linesTouched =
          planned.length > 0 || added.length > 0 || removeIds.length > 0;
        if (Object.keys(headerSet).length === 0 && !linesTouched) {
          return buildDetail(soId, tx);
        }

        // ---- writes: removals first so a freed (item, date) can be reused ----
        await saleOrderRepository.softRemoveLines(removeIds, actorId, tx);
        for (const p of planned) {
          await saleOrderRepository.updateLine(
            p.line.id,
            { ...p.set, lastUpdatedBy: actorId, lastUpdatedAt: now },
            tx,
          );
        }
        const inserted = await saleOrderRepository.insertLines(added, tx);
        if (linesTouched) await saleOrderRepository.recomputeTotal(soId, tx);

        await saleOrderRepository.updateSo(
          soId,
          {
            ...headerSet,
            editVersion: so.editVersion + 1,
            ...(needChanged ? { needVersion: so.needVersion + 1 } : {}),
            ...(added.length > 0 ? { lastLineNo } : {}),
            lastUpdatedBy: actorId,
            lastUpdatedAt: now,
          },
          tx,
        );

        const before: Record<string, unknown> = { ...hBefore };
        const after: Record<string, unknown> = { ...hAfter };
        if (linesTouched) {
          before.lines = [
            ...planned.map((p) => ({
              lineNo: p.line.lineNo,
              ...p.before,
            })),
            ...removeIds.map((id) => {
              const l = liveOf(id);
              return {
                lineNo: l.lineNo,
                itemId: l.itemId,
                qty: Number(l.qty),
                unitPricePaise: l.unitPricePaise,
              };
            }),
          ];
          after.lines = [
            ...planned.map((p) => ({ lineNo: p.line.lineNo, ...p.after })),
            ...removeIds.map((id) => ({
              lineNo: liveOf(id).lineNo,
              removed: true,
            })),
            ...inserted.map((l) => ({
              lineNo: l.lineNo,
              added: true,
              itemId: l.itemId,
              qty: Number(l.qty),
              unitPricePaise: l.unitPricePaise,
              gstPercent: Number(l.gstPercent),
              deliveryDate: l.deliveryDate,
            })),
          ];
        }
        await salesAuditRepository.write(
          {
            actorId,
            action: "so.edit",
            targetType: "sale_order",
            targetId: soId,
            soId,
            before,
            after,
          },
          tx,
        );
        return buildDetail(soId, tx);
      });
    } catch (error) {
      return translateConflict(error, customerId, poNumber);
    }
  },

  // BR-SO-12
  async confirm(soId: number, input: SoVersionBody, actorId: number) {
    return db.transaction(async (tx) => {
      const so = await lockSo(soId, input.editVersion, tx);
      if (so.status !== "draft") throw wrongStatus(so.status, "confirmed");

      const today = istDayKey();
      const customer = await customerRepository.findById(so.customerId, tx);
      if (!customer?.isActive) {
        throw new BadRequestError(
          `Customer ${customer?.name ?? so.customerId} is inactive`,
          "CUSTOMER_INACTIVE",
        );
      }
      const lines = await saleOrderRepository.findLines(soId, tx);
      const items = await saleOrderRepository.findItemsByIds(
        lines.map((l) => l.line.itemId),
        tx,
      );
      const inactive = lines
        .filter((l) => items.get(l.line.itemId)?.isActive !== true)
        .map((l) => l.sku);
      if (inactive.length > 0) {
        throw new BadRequestError(
          `Inactive items on this sale order: ${[...new Set(inactive)].join(", ")}`,
          "ITEM_INACTIVE",
        );
      }
      const past = lines
        .filter((l) => l.line.deliveryDate < today)
        .map((l) => `line ${l.line.lineNo} (${l.sku})`);
      if (past.length > 0) {
        throw new BadRequestError(
          `Delivery date has passed on ${past.join(", ")}`,
          "DELIVERY_DATE_PASSED",
        );
      }

      const now = new Date();
      await saleOrderRepository.updateSo(
        soId,
        {
          status: "confirmed",
          confirmedBy: actorId,
          confirmedAt: now,
          editVersion: so.editVersion + 1,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      await salesAuditRepository.write(
        {
          actorId,
          action: "so.confirm",
          targetType: "sale_order",
          targetId: soId,
          soId,
          before: { status: "draft" },
          after: { status: "confirmed" },
        },
        tx,
      );
      return buildDetail(soId, tx);
    });
  },

  // BR-SO-16
  async hold(soId: number, input: SoReasonBody, actorId: number) {
    return db.transaction(async (tx) => {
      const so = await lockSo(soId, input.editVersion, tx);
      if (so.status !== "confirmed")
        throw wrongStatus(so.status, "put on hold");
      const now = new Date();
      await saleOrderRepository.updateSo(
        soId,
        {
          status: "on_hold",
          holdReason: input.reason,
          heldBy: actorId,
          heldAt: now,
          editVersion: so.editVersion + 1,
          needVersion: so.needVersion + 1,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      await salesAuditRepository.write(
        {
          actorId,
          action: "so.hold",
          targetType: "sale_order",
          targetId: soId,
          soId,
          before: { status: "confirmed" },
          after: { status: "on_hold", reason: input.reason },
        },
        tx,
      );
      return buildDetail(soId, tx);
    });
  },

  async resume(soId: number, input: SoVersionBody, actorId: number) {
    return db.transaction(async (tx) => {
      const so = await lockSo(soId, input.editVersion, tx);
      if (so.status !== "on_hold") throw wrongStatus(so.status, "resumed");
      const now = new Date();
      await saleOrderRepository.updateSo(
        soId,
        {
          status: "confirmed",
          editVersion: so.editVersion + 1,
          needVersion: so.needVersion + 1,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      await salesAuditRepository.write(
        {
          actorId,
          action: "so.resume",
          targetType: "sale_order",
          targetId: soId,
          soId,
          before: { status: "on_hold" },
          after: { status: "confirmed" },
        },
        tx,
      );
      return buildDetail(soId, tx);
    });
  },

  // BR-SO-17: final, releases claims, leaves linked PR / SCO untouched.
  async close(soId: number, input: SoReasonBody, actorId: number) {
    return db.transaction(async (tx) => {
      const so = await lockSo(soId, input.editVersion, tx);
      if (so.status !== "confirmed" && so.status !== "on_hold") {
        throw wrongStatus(so.status, "closed");
      }
      const now = new Date();
      await saleOrderRepository.updateSo(
        soId,
        {
          status: "closed",
          closeKind: "manual",
          closeReason: input.reason,
          closedBy: actorId,
          closedAt: now,
          editVersion: so.editVersion + 1,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      await saleOrderRepository.releaseReservations(soId, tx);
      await salesAuditRepository.write(
        {
          actorId,
          action: "so.close",
          targetType: "sale_order",
          targetId: soId,
          soId,
          before: { status: so.status },
          after: {
            status: "closed",
            closeKind: "manual",
            reason: input.reason,
          },
        },
        tx,
      );
      return buildDetail(soId, tx);
    });
  },

  // BR-SO-18, 19, 20
  // BR-SO-20: never hard-deleted; a cancelled SO keeps its number, reservations are released
  async cancel(soId: number, input: SoReasonBody, actorId: number) {
    return db.transaction(async (tx) => {
      const so = await lockSo(soId, input.editVersion, tx);
      if (
        so.status !== "draft" &&
        so.status !== "confirmed" &&
        so.status !== "on_hold"
      ) {
        throw wrongStatus(so.status, "cancelled");
      }
      if (so.status !== "draft") {
        const lines = await saleOrderRepository.findLines(soId, tx);
        if (lines.some((l) => toMilli(l.line.deliveredQty) > 0)) {
          throw conflict(
            "Part of this sale order is already delivered. Close it instead.",
            "HAS_DELIVERIES",
          );
        }
        await assertNoLiveDocuments(soId, tx);
      }
      const now = new Date();
      await saleOrderRepository.updateSo(
        soId,
        {
          status: "cancelled",
          cancelReason: input.reason,
          cancelledBy: actorId,
          cancelledAt: now,
          editVersion: so.editVersion + 1,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        },
        tx,
      );
      await saleOrderRepository.releaseReservations(soId, tx);
      await salesAuditRepository.write(
        {
          actorId,
          action: "so.cancel",
          targetType: "sale_order",
          targetId: soId,
          soId,
          before: { status: so.status },
          after: { status: "cancelled", reason: input.reason },
        },
        tx,
      );
      return buildDetail(soId, tx);
    });
  },

  // -------------------------------------------------------------------------
  // Dispatch hooks (BR-SO-09, 54, 55, 58). Not routes: the dispatch module
  // calls them inside its own posting / cancelling transaction `tx`. Each takes
  // the SO row lock first and writes one sales_audit_log row in `tx`.
  // -------------------------------------------------------------------------

  /**
   * Post (qty > 0) or cancel (qty < 0) a delivery of one SO line.
   * Keeps 0 <= delivered <= qty, bumps delivery / edit version so the
   * snapshot reads out of date, and on a post lowers this SO's stock claims
   * of the shipped item by the shipped qty (BR-SO-58; a cancel restores none).
   */
  async applyDelivery(
    tx: DbTransaction,
    input: { lineId: number; qty: number; actorId: number; noteRef: string },
  ) {
    const lineHead = await saleOrderRepository.findLineById(input.lineId, tx);
    if (!lineHead) {
      throw new NotFoundError("Sale order line not found", "SO_LINE_NOT_FOUND");
    }
    const so = await saleOrderRepository.lockById(lineHead.soId, tx);
    if (!so) throw notFound();
    const line = await saleOrderRepository.findLineByIdForUpdate(
      input.lineId,
      tx,
    );
    if (!line) {
      throw new NotFoundError("Sale order line not found", "SO_LINE_NOT_FOUND");
    }
    if (line.removedAt) {
      throw new BadRequestError(
        "A removed line cannot be delivered",
        "SO_LINE_REMOVED",
      );
    }
    const delta = toMilli(input.qty);
    if (delta === 0) {
      throw new BadRequestError("Delivered quantity change is zero");
    }
    if (delta > 0 && so.status !== "confirmed") {
      throw conflict(
        `A ${so.status.replace("_", " ")} sale order cannot be delivered against`,
        "SO_NOT_DELIVERABLE",
      );
    }
    const beforeMilli = toMilli(line.deliveredQty);
    const afterMilli = beforeMilli + delta;
    if (afterMilli < 0 || afterMilli > toMilli(line.qty)) {
      throw conflict(
        "Delivered quantity must stay between 0 and the line quantity",
        "DELIVERED_QTY_OUT_OF_RANGE",
      );
    }

    const now = new Date();
    await saleOrderRepository.updateLine(
      line.id,
      {
        deliveredQty: milliToString(afterMilli),
        lastUpdatedBy: input.actorId,
        lastUpdatedAt: now,
      },
      tx,
    );

    let claimsLowered = 0;
    if (delta > 0) {
      let remaining = delta;
      const claims = await saleOrderRepository.findStockClaims(
        so.id,
        line.itemId,
        tx,
      );
      for (const claim of claims) {
        if (remaining <= 0) break;
        const have = toMilli(claim.qty);
        const take = Math.min(have, remaining);
        if (take === have) {
          await saleOrderRepository.releaseClaim(claim.id, tx);
        } else {
          await saleOrderRepository.setClaimQty(
            claim.id,
            milliToString(have - take),
            tx,
          );
        }
        remaining -= take;
        claimsLowered += take;
      }
    }

    await saleOrderRepository.updateSo(
      so.id,
      {
        deliveryVersion: so.deliveryVersion + 1,
        editVersion: so.editVersion + 1,
        lastUpdatedBy: input.actorId,
        lastUpdatedAt: now,
      },
      tx,
    );
    await salesAuditRepository.write(
      {
        actorId: input.actorId,
        action: "so.delivery_applied",
        targetType: "sale_order",
        targetId: so.id,
        soId: so.id,
        before: {
          lineNo: line.lineNo,
          deliveredQty: Number(line.deliveredQty),
        },
        after: {
          lineNo: line.lineNo,
          deliveredQty: afterMilli / 1000,
          claimsLowered: claimsLowered / 1000,
          note: input.noteRef,
        },
      },
      tx,
    );
    return {
      soId: so.id,
      lineId: line.id,
      deliveredQty: afterMilli / 1000,
      openQty: (toMilli(line.qty) - afterMilli) / 1000,
      claimsLowered: claimsLowered / 1000,
    };
  },

  /**
   * BR-SO-54: closes a confirmed SO as "fully delivered" when every
   * non-removed line has open qty 0; releases its claims. Returns whether it closed.
   */
  async closeFullyDelivered(
    tx: DbTransaction,
    input: { soId: number; actorId: number; noteRef?: string },
  ) {
    const so = await saleOrderRepository.lockById(input.soId, tx);
    if (!so) throw notFound();
    if (so.status !== "confirmed") return { closed: false as const };
    const lines = await saleOrderRepository.findLines(input.soId, tx);
    const allDelivered =
      lines.length > 0 &&
      lines.every((l) => toMilli(l.line.deliveredQty) >= toMilli(l.line.qty));
    if (!allDelivered) return { closed: false as const };

    const now = new Date();
    await saleOrderRepository.updateSo(
      so.id,
      {
        status: "closed",
        closeKind: "fully_delivered",
        closeReason: null,
        closedBy: input.actorId,
        closedAt: now,
        editVersion: so.editVersion + 1,
        lastUpdatedBy: input.actorId,
        lastUpdatedAt: now,
      },
      tx,
    );
    await saleOrderRepository.releaseReservations(so.id, tx);
    await salesAuditRepository.write(
      {
        actorId: input.actorId,
        action: "so.close_fully_delivered",
        targetType: "sale_order",
        targetId: so.id,
        soId: so.id,
        before: { status: "confirmed" },
        after: {
          status: "closed",
          closeKind: "fully_delivered",
          note: input.noteRef ?? null,
        },
      },
      tx,
    );
    return { closed: true as const };
  },

  /**
   * BR-SO-55: after a delivery note cancel, a "fully delivered" SO with open
   * qty again goes back to confirmed (close fields cleared, claims not
   * restored). A SO closed by hand is never reopened: 409 SO_CLOSED_BY_HAND.
   * Returns whether it reopened.
   */
  async reopenAfterDeliveryCancel(
    tx: DbTransaction,
    input: { soId: number; actorId: number; noteRef?: string },
  ) {
    const so = await saleOrderRepository.lockById(input.soId, tx);
    if (!so) throw notFound();
    if (so.status !== "closed") return { reopened: false as const };
    if (so.closeKind !== "fully_delivered") {
      throw conflict(
        "A sale order closed by hand is never reopened",
        "SO_CLOSED_BY_HAND",
      );
    }
    const lines = await saleOrderRepository.findLines(input.soId, tx);
    const hasOpen = lines.some(
      (l) => toMilli(l.line.deliveredQty) < toMilli(l.line.qty),
    );
    if (!hasOpen) return { reopened: false as const };

    const now = new Date();
    await saleOrderRepository.updateSo(
      so.id,
      {
        status: "confirmed",
        closeKind: null,
        closeReason: null,
        closedBy: null,
        closedAt: null,
        deliveryVersion: so.deliveryVersion + 1,
        editVersion: so.editVersion + 1,
        lastUpdatedBy: input.actorId,
        lastUpdatedAt: now,
      },
      tx,
    );
    await salesAuditRepository.write(
      {
        actorId: input.actorId,
        action: "so.reopen",
        targetType: "sale_order",
        targetId: so.id,
        soId: so.id,
        before: { status: "closed", closeKind: "fully_delivered" },
        after: { status: "confirmed", note: input.noteRef ?? null },
      },
      tx,
    );
    return { reopened: true as const };
  },

  /** BR-SO-48: a PR may name only an existing, confirmed SO. */
  async assertConfirmedForPrLink(soId: number, executor?: DbExecutor) {
    const row = await saleOrderRepository.findStatusById(soId, executor);
    // SEC-001: one answer for "no such SO" and "not confirmed", no status leak
    if (!row || row.status !== "confirmed") {
      throw new BadRequestError(
        "saleOrderId must name a confirmed sale order",
        "PR_SALE_ORDER_INVALID",
      );
    }
  },
};

export const { applyDelivery, closeFullyDelivered, reopenAfterDeliveryCancel } =
  saleOrderService;
