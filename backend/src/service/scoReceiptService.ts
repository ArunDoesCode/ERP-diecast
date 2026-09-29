import { db } from "../db/client";
import type { Actor } from "../lib/auth-middleware";
import { isUniqueViolation } from "../lib/db-errors";
import { allocateDocumentSequence } from "../lib/document-number";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { nothingLeftAtVendor, rawUsedFor } from "../lib/sco-math";
import { scoChallanRepository } from "../repository/scoChallanRepository";
import { scoReceiptRepository } from "../repository/scoReceiptRepository";
import {
  type ScoItemRow,
  scoRepository,
  type Tx,
} from "../repository/scoRepository";
import {
  type PostStockInput,
  postStock,
} from "../repository/stockPostingRepository";
import type {
  createReceiptSchemaType,
  qaDecisionSchemaType,
  receiptDetailsSchemaType,
  receiptResponseSchemaType,
} from "../types/scoReceipt.types";

type ReceiptStatus =
  | "pending_qa"
  | "accepted"
  | "partial_accepted"
  | "rejected";

type Segment = {
  challanLineId: number;
  qty: number;
  unitIssueCostPaise: number;
  heatNumber: string | null;
};

type OpenChallanLine = {
  id: number;
  qty: number;
  settledQty: number;
  unitIssueCostPaise: number;
  heatNumber: string | null;
};

function ratioOf(line: ScoItemRow) {
  return {
    send: line.rawQtyToIssue,
    ret: line.expectedReturnQty,
  };
}

// BR-SCO-12: (processed x ratio) + unprocessed <= still at the vendor, line by
// line in request order (a repeated line sees the earlier ones). Returns a
// message when refused so the caller can choose 400 (on arrival) or 409 (lost the lock).
function findQtyViolation(
  lines: ScoItemRow[],
  input: createReceiptSchemaType["lines"],
): string | null {
  const running = new Map(
    lines.map((l) => [
      l.id,
      {
        processed: l.acceptedQty + l.rejectedQty + l.pendingQaQty,
        unprocessed: l.unprocessedQty,
      },
    ]),
  );
  const byId = new Map(lines.map((l) => [l.id, l]));
  for (const wanted of input) {
    const line = byId.get(wanted.scoItemId);
    const state = running.get(wanted.scoItemId);
    if (!line || !state)
      return `SCO line ${wanted.scoItemId} is not on this SCO`;
    state.processed += wanted.processedQty;
    state.unprocessed += wanted.unprocessedQty;
    const { send, ret } = ratioOf(line);
    const needed =
      rawUsedFor(state.processed, send, ret) + state.unprocessed + line.lossQty;
    if (needed > line.issuedQty) {
      return `Qty for SCO line ${wanted.scoItemId} is more than what is still at the vendor`;
    }
  }
  return null;
}

// BR-SCO-17: take `qty` raw pieces from the oldest open challan lines. The
// list is shared between calls so processed and unprocessed never overlap.
function takeFifo(open: OpenChallanLine[], qty: number): Segment[] {
  const segments: Segment[] = [];
  let left = qty;
  for (const line of open) {
    if (left <= 0) break;
    const room = line.qty - line.settledQty;
    if (room <= 0) continue;
    const take = Math.min(room, left);
    line.settledQty += take;
    left -= take;
    segments.push({
      challanLineId: line.id,
      qty: take,
      unitIssueCostPaise: line.unitIssueCostPaise,
      heatNumber: line.heatNumber,
    });
  }
  if (left > 0) {
    throw new ConflictError(
      "Not enough open challan quantity to settle this receipt",
      "SCO_SETTLEMENT_SHORT",
    );
  }
  return segments;
}

// Receipt status follows its lines: pending_qa until every line with processed
// pieces is decided, then accepted / rejected / partial_accepted from the totals.
function deriveReceiptStatus(
  lines: {
    processedQty: number;
    qaStatus: string;
    acceptedQty: number | null;
    rejectedQty: number | null;
  }[],
): ReceiptStatus {
  const processed = lines.filter((l) => l.processedQty > 0);
  if (processed.some((l) => l.qaStatus === "pending_qa")) return "pending_qa";
  const accepted = processed.reduce((s, l) => s + (l.acceptedQty ?? 0), 0);
  const rejected = processed.reduce((s, l) => s + (l.rejectedQty ?? 0), 0);
  if (rejected === 0) return "accepted";
  if (accepted === 0) return "rejected";
  return "partial_accepted";
}

async function loadDetails(
  receiptId: number,
  tx?: Tx,
): Promise<receiptDetailsSchemaType> {
  const receipt = await scoReceiptRepository.findById(receiptId, tx);
  if (!receipt) throw new NotFoundError("Receipt not found");
  const [lines, settlements] = await Promise.all([
    scoReceiptRepository.findLines(receiptId, tx),
    scoReceiptRepository.findSettlements(receiptId, tx),
  ]);
  return { receipt, lines, settlements };
}

// BR-SCO-18: material_received once every line is fully issued and nothing is at the vendor.
async function refreshScoStatus(
  scoId: number,
  status: string,
  actorId: number,
  tx: Tx,
) {
  if (status !== "material_issued") return;
  const lines = await scoRepository.findLines(scoId, tx);
  const done = lines.every(
    (l) => l.issuedQty === l.rawQtyToIssue && nothingLeftAtVendor(l),
  );
  if (!done) return;
  await scoRepository.updateHeader(
    scoId,
    {
      status: "material_received",
      lastUpdatedBy: actorId,
      lastUpdatedAt: new Date(),
    },
    tx,
  );
}

export const scoReceiptService = {
  // BR-SCO-12, 16, 17, 18, 24, 25: one transaction, SCO row locked first.
  async create(
    scoId: number,
    input: createReceiptSchemaType,
    actorId: number,
    _actor: Actor,
  ): Promise<receiptDetailsSchemaType> {
    return db.transaction(async (tx) => {
      const pre = await scoRepository.findHeader(scoId, tx);
      if (!pre) throw new NotFoundError("Subcontracting order not found");
      if (pre.status !== "material_issued") {
        throw new ConflictError(
          `A receipt cannot be made on an SCO in status ${pre.status}`,
          "SCO_INVALID_TRANSITION",
        );
      }
      const preLines = await scoRepository.findLines(scoId, tx);
      const preIds = new Set(preLines.map((l) => l.id));
      if (input.lines.some((l) => !preIds.has(l.scoItemId))) {
        throw new BadRequestError(
          "A receipt line is not on this SCO",
          "SCO_RECEIPT_LINE_INVALID",
        );
      }
      const preViolation = findQtyViolation(preLines, input.lines);
      if (preViolation) {
        throw new BadRequestError(preViolation, "SCO_RECEIPT_QTY_EXCEEDED");
      }

      const locked = await scoRepository.lockById(scoId, tx);
      if (!locked) throw new NotFoundError("Subcontracting order not found");
      if (locked.status !== "material_issued") {
        throw new ConflictError(
          `A receipt cannot be made on an SCO in status ${locked.status}`,
          "SCO_INVALID_TRANSITION",
        );
      }
      const lines = await scoRepository.findLines(scoId, tx);
      if (findQtyViolation(lines, input.lines)) {
        throw new ConflictError(
          "Another receipt took this material first; reload and try again",
          "SCO_RECEIPT_CONFLICT",
        );
      }

      if (
        await scoReceiptRepository.vendorChallanExists(
          locked.vendorId,
          input.vendorChallanNo,
          tx,
        )
      ) {
        throw new ConflictError(
          `Vendor challan/invoice ${input.vendorChallanNo} is already recorded for this vendor`,
          "SCO_RECEIPT_CHALLAN_REPEATED",
        );
      }

      const needsStore = input.lines.some((l) => l.unprocessedQty > 0);
      const mainStore = needsStore
        ? await scoChallanRepository.findMainStore(tx)
        : undefined;
      const vendorLocation = needsStore
        ? await scoReceiptRepository.findVendorLocation(locked.vendorId, tx)
        : undefined;
      if (needsStore && (!mainStore || !vendorLocation)) {
        throw new ConflictError("Main store or vendor location is not set up");
      }

      const { periodKey, seq } = await allocateDocumentSequence(
        tx,
        "sco_grn",
        actorId,
      );
      let receiptId: number;
      try {
        receiptId = await scoReceiptRepository.insertReceipt(
          {
            grnNumber: `SCO-GRN-${periodKey}-${seq}`,
            scoId,
            vendorId: locked.vendorId,
            vendorChallanNo: input.vendorChallanNo,
            status: "pending_qa",
            receivedDate: input.receivedDate ?? new Date(),
            notes: input.notes ?? null,
            createdBy: actorId,
          },
          tx,
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            `Vendor challan/invoice ${input.vendorChallanNo} is already recorded for this vendor`,
            "SCO_RECEIPT_CHALLAN_REPEATED",
          );
        }
        throw error;
      }

      const byId = new Map(lines.map((l) => [l.id, l]));
      const running = new Map(
        lines.map((l) => [
          l.id,
          l.acceptedQty + l.rejectedQty + l.pendingQaQty,
        ]),
      );
      const openByItem = new Map<number, OpenChallanLine[]>();

      // Stock postings go in item id order so concurrent receipts cannot deadlock.
      const ordered = [...input.lines].sort(
        (a, b) =>
          (byId.get(a.scoItemId)?.rawItemId ?? 0) -
          (byId.get(b.scoItemId)?.rawItemId ?? 0),
      );
      for (const wanted of ordered) {
        const line = byId.get(wanted.scoItemId);
        if (!line) throw new NotFoundError("SCO line not found");
        const { send, ret } = ratioOf(line);
        const before = running.get(line.id) ?? 0;
        const after = before + wanted.processedQty;
        running.set(line.id, after);
        const processedRaw =
          rawUsedFor(after, send, ret) - rawUsedFor(before, send, ret);

        let open = openByItem.get(line.id);
        if (!open) {
          open = await scoReceiptRepository.lockOpenChallanLines(line.id, tx);
          openByItem.set(line.id, open);
        }
        const processedSegments = takeFifo(open, processedRaw);
        const unprocessedSegments = takeFifo(open, wanted.unprocessedQty);
        const first = processedSegments[0] ?? unprocessedSegments[0];

        const noQa = wanted.processedQty === 0;
        const lineId = await scoReceiptRepository.insertLine(
          {
            scoGrnId: receiptId,
            scoItemId: line.id,
            processedQty: wanted.processedQty,
            unprocessedQty: wanted.unprocessedQty,
            // Nothing processed = nothing for QA to decide.
            acceptedQty: noQa ? 0 : null,
            rejectedQty: noQa ? 0 : null,
            qaStatus: noQa ? "accepted" : "pending_qa",
            heatNumber: first?.heatNumber ?? line.rawItemBatch ?? null,
          },
          tx,
        );

        // BR-SCO-17: one row per challan line touched, oldest first.
        // processedQty is kept apart so QA costs from processed pieces only (BR-SCO-14).
        const settled = new Map<
          number,
          { qty: number; processedQty: number }
        >();
        const tally = (segs: Segment[], processed: boolean) => {
          for (const seg of segs) {
            const row = settled.get(seg.challanLineId) ?? {
              qty: 0,
              processedQty: 0,
            };
            row.qty += seg.qty;
            if (processed) row.processedQty += seg.qty;
            settled.set(seg.challanLineId, row);
          }
        };
        tally(processedSegments, true);
        tally(unprocessedSegments, false);
        for (const [challanLineId, row] of settled) {
          await scoReceiptRepository.insertSettlement(
            {
              receiptItemId: lineId,
              challanLineId,
              qty: row.qty,
              processedQty: row.processedQty,
            },
            tx,
          );
          await scoReceiptRepository.addSettledQty(challanLineId, row.qty, tx);
        }

        // BR-SCO-16, 25: unprocessed raw goes back to main store in one pair of
        // rows, at the weighted issue cost of the challan lines it came from.
        if (wanted.unprocessedQty > 0) {
          const value = unprocessedSegments.reduce(
            (sum, seg) => sum + seg.qty * seg.unitIssueCostPaise,
            0,
          );
          const base = {
            itemId: line.rawItemId,
            referenceType: "sco_receipt" as const,
            referenceId: receiptId,
            referenceLineId: lineId,
            batchNumber: unprocessedSegments[0]?.heatNumber ?? null,
            unitCostPaise: Math.round(value / wanted.unprocessedQty),
            averageEffect: "none" as const,
            createdBy: actorId,
          };
          await postStock(tx, {
            ...base,
            locationId: (vendorLocation as { id: number }).id,
            transactionType: "out",
            quantityChange: -wanted.unprocessedQty,
          });
          await postStock(tx, {
            ...base,
            locationId: (mainStore as { id: number }).id,
            transactionType: "in",
            quantityChange: wanted.unprocessedQty,
          });
        }

        await scoReceiptRepository.addCounters(
          line.id,
          {
            unprocessedQty: wanted.unprocessedQty,
            pendingQaQty: wanted.processedQty,
          },
          tx,
        );
      }

      const savedLines = await scoReceiptRepository.findLines(receiptId, tx);
      const status = deriveReceiptStatus(savedLines);
      if (status !== "pending_qa") {
        await scoReceiptRepository.updateStatus(receiptId, status, tx);
      }
      await scoRepository.updateHeader(
        scoId,
        { lastUpdatedBy: actorId, lastUpdatedAt: new Date() },
        tx,
      );
      await refreshScoStatus(scoId, locked.status, actorId, tx);

      return loadDetails(receiptId, tx);
    });
  },

  // BR-SCO-13, 14, 15, 24, 25: one decision per line, SCO row locked first.
  async decideQa(
    receiptId: number,
    lineId: number,
    input: qaDecisionSchemaType,
    actorId: number,
    _actor: Actor,
  ): Promise<receiptDetailsSchemaType> {
    return db.transaction(async (tx) => {
      const receipt = await scoReceiptRepository.findById(receiptId, tx);
      if (!receipt) throw new NotFoundError("Receipt not found");
      const pre = await scoReceiptRepository.findLine(receiptId, lineId, tx);
      if (!pre) throw new NotFoundError("Receipt line not found");
      const alreadyDecided = () =>
        new ConflictError(
          "This receipt line already has a QA decision",
          "SCO_QA_ALREADY_DECIDED",
        );
      if (pre.qaStatus !== "pending_qa") throw alreadyDecided();
      if (input.acceptedQty + input.rejectedQty !== pre.processedQty) {
        throw new BadRequestError(
          `Accepted + rejected must equal the processed qty (${pre.processedQty})`,
          "SCO_QA_TOTAL_MISMATCH",
        );
      }

      const locked = await scoRepository.lockById(receipt.scoId, tx);
      if (!locked) throw new NotFoundError("Subcontracting order not found");
      const line = await scoReceiptRepository.findLine(receiptId, lineId, tx);
      if (!line) throw new NotFoundError("Receipt line not found");
      if (line.qaStatus !== "pending_qa") throw alreadyDecided();

      const scoLines = await scoRepository.findLines(receipt.scoId, tx);
      const scoLine = scoLines.find((l) => l.id === line.scoItemId);
      if (!scoLine) throw new NotFoundError("SCO line not found");

      const { acceptedQty: accepted, rejectedQty: rejected } = input;
      const { send, ret } = ratioOf(scoLine);
      const decided = scoLine.acceptedQty + scoLine.rejectedQty;
      const usedBefore = rawUsedFor(decided, send, ret);
      const rawAccepted =
        rawUsedFor(decided + accepted, send, ret) - usedBefore;
      const rawTotal =
        rawUsedFor(decided + accepted + rejected, send, ret) - usedBefore;
      const rawRejected = rawTotal - rawAccepted;

      // BR-SCO-14: issue cost of the processed pieces only (average over the
      // processed part of the challan lines it settled).
      const settled = await scoReceiptRepository.findSettledCosts(line.id, tx);
      const settledQty = settled.reduce((s, r) => s + r.processedQty, 0);
      const settledValue = settled.reduce(
        (s, r) => s + r.processedQty * r.unitIssueCostPaise,
        0,
      );
      const issueCost =
        settledQty > 0 ? Math.round(settledValue / settledQty) : 0;

      const vendorLocation = await scoReceiptRepository.findVendorLocation(
        locked.vendorId,
        tx,
      );
      const mainStore = await scoChallanRepository.findMainStore(tx);
      const scrapYard =
        rawRejected > 0 ? await scoReceiptRepository.findScrapYard(tx) : null;
      if (!vendorLocation || !mainStore || (rawRejected > 0 && !scrapYard)) {
        throw new ConflictError(
          "Vendor location, main store or scrap yard is not set up",
        );
      }

      const rawBase = {
        itemId: scoLine.rawItemId,
        referenceType: "sco_receipt" as const,
        referenceId: receiptId,
        referenceLineId: line.id,
        batchNumber: line.heatNumber,
        unitCostPaise: issueCost,
        averageEffect: "none" as const,
        createdBy: actorId,
      };
      // Collected, then posted in item id order so concurrent QA decisions cannot deadlock.
      const postings: PostStockInput[] = [];
      if (rawAccepted > 0) {
        postings.push({
          ...rawBase,
          locationId: vendorLocation.id,
          transactionType: "out",
          quantityChange: -rawAccepted,
        });
      }
      if (rawRejected > 0 && scrapYard) {
        postings.push(
          {
            ...rawBase,
            locationId: vendorLocation.id,
            transactionType: "out",
            quantityChange: -rawRejected,
          },
          {
            ...rawBase,
            locationId: scrapYard.id,
            transactionType: "in",
            quantityChange: rawRejected,
          },
        );
      }
      if (accepted > 0) {
        postings.push({
          itemId: scoLine.finishedItemId,
          locationId: mainStore.id,
          transactionType: "in",
          quantityChange: accepted,
          referenceType: "sco_receipt",
          referenceId: receiptId,
          referenceLineId: line.id,
          batchNumber: line.heatNumber,
          // BR-SCO-14: ratio x issue cost + service price (no GST).
          unitCostPaise:
            Math.round((send * issueCost) / ret) +
            scoLine.serviceUnitPricePaise,
          createdBy: actorId,
        });
      }
      postings.sort((x, y) => x.itemId - y.itemId);
      for (const posting of postings) await postStock(tx, posting);

      const lineStatus: ReceiptStatus =
        rejected === 0
          ? "accepted"
          : accepted === 0
            ? "rejected"
            : "partial_accepted";
      await scoReceiptRepository.updateLine(
        line.id,
        {
          acceptedQty: accepted,
          rejectedQty: rejected,
          qaStatus: lineStatus,
          qaDecidedBy: actorId,
          qaDecidedAt: new Date(),
          qaNotes: input.notes ?? null,
        },
        tx,
      );
      await scoReceiptRepository.addCounters(
        line.scoItemId,
        {
          acceptedQty: accepted,
          rejectedQty: rejected,
          pendingQaQty: -(accepted + rejected),
        },
        tx,
      );

      const allLines = await scoReceiptRepository.findLines(receiptId, tx);
      await scoReceiptRepository.updateStatus(
        receiptId,
        deriveReceiptStatus(allLines),
        tx,
      );
      await scoRepository.updateHeader(
        receipt.scoId,
        { lastUpdatedBy: actorId, lastUpdatedAt: new Date() },
        tx,
      );
      await refreshScoStatus(receipt.scoId, locked.status, actorId, tx);

      return loadDetails(receiptId, tx);
    });
  },

  async listBySco(scoId: number): Promise<receiptResponseSchemaType[]> {
    const sco = await scoRepository.findHeader(scoId);
    if (!sco) throw new NotFoundError("Subcontracting order not found");
    return scoReceiptRepository.listBySco(scoId);
  },

  async getDetails(receiptId: number): Promise<receiptDetailsSchemaType> {
    return loadDetails(receiptId);
  },
};
