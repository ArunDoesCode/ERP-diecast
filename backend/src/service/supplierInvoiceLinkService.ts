import { toMilli } from "../lib/supplier-invoice-math";
import { poRepository } from "../repository/poRepository";
import { purchaseReturnRepository } from "../repository/purchaseReturnRepository";
import {
  LIVE_STATUSES,
  supplierInvoiceRepository as repo,
  type Tx,
} from "../repository/supplierInvoiceRepository";

// What a supplier bill does to other documents: the PO "invoiced" test (BR-SINV-29)
// and the debit-note link (BR-SINV-31, BR-PRT-44, 45). Used by the invoice service and
// by purchase-returns post / cancel, so it must not import either of them. Every
// function runs in the caller's transaction, after the caller took its locks.

const net = (
  acceptedQty: number,
  correctionsMilli: number,
  acceptedReturnedQty: number,
) =>
  Math.max(
    0,
    toMilli(acceptedQty) - correctionsMilli - toMilli(acceptedReturnedQty),
  );

export const supplierInvoiceLinkService = {
  // BR-SINV-29. The caller holds the PO lock. fully_received -> invoiced when every GRN
  // line has approved bill qty >= net accepted - accepted returned (and at least one
  // approved bill exists); invoiced -> fully_received when that stops holding.
  async reevaluatePoInvoiced(poId: number, actorId: number, tx: Tx) {
    const po = await poRepository.findPoById(poId, tx);
    if (!po || (po.status !== "fully_received" && po.status !== "invoiced")) {
      return;
    }
    const lines = await repo.listPoGrnLines(poId, tx);
    const ids = lines.map((l) => l.id);
    const [corrections, counters, approved] = await Promise.all([
      purchaseReturnRepository.correctionsMilliByGrnLine(ids, tx),
      purchaseReturnRepository.postedCounters(ids, tx),
      repo.billedMilliByGrnItem(ids, ["approved"], tx),
    ]);
    const returned = new Map(counters.map((c) => [c.id, c.acceptedReturned]));
    let anyApproved = false;
    let covered = true;
    for (const line of lines) {
      const need = net(
        line.acceptedQty,
        corrections.get(line.id) ?? 0,
        returned.get(line.id) ?? 0,
      );
      const have = approved.get(line.id) ?? 0;
      if (have > 0) {
        anyApproved = true;
      }
      if (have < need) {
        covered = false;
      }
    }
    const shouldBeInvoiced = covered && anyApproved;
    if (shouldBeInvoiced && po.status === "fully_received") {
      await poRepository.setStatus(poId, "invoiced", tx, {
        invoicedBy: actorId,
        invoicedAt: new Date(),
      });
    } else if (!shouldBeInvoiced && po.status === "invoiced") {
      await poRepository.setStatus(poId, "fully_received", tx, {
        invoicedBy: null,
        invoicedAt: null,
      });
    }
  },

  // BR-PRT-44, 45: at return post, link the oldest approved bill with a line on a
  // returned GRN line (no qty test: a bill approved earlier already billed those kg).
  // Offset = taxable + GST of the accepted lines; a rejected-only note links with 0.
  async findBillForReturnPost(
    lines: {
      grnItemId: number;
      source: "rejected" | "accepted";
      taxablePaise: number;
      gstPaise: number;
    }[],
    tx: Tx,
  ) {
    const bill = await repo.findOldestApprovedBillCovering(
      [...new Set(lines.map((l) => l.grnItemId))],
      tx,
    );
    if (!bill) {
      return { supplierInvoiceId: null, billOffsetPaise: 0 };
    }
    const billOffsetPaise = lines
      .filter((l) => l.source === "accepted")
      .reduce((sum, l) => sum + l.taxablePaise + l.gstPaise, 0);
    return { supplierInvoiceId: bill.id, billOffsetPaise };
  },

  // BR-SINV-31: a bill was approved (submit or release). Link the unlinked posted notes of
  // its GRN lines, but only when the billed qty includes the returned qty:
  // billed > net accepted - accepted returned - qty on the other live bills.
  // Returns the linked note ids (stored in the history row, BR-SINV-35).
  async linkOnApproval(invoiceId: number, tx: Tx): Promise<number[]> {
    const lines = (await repo.listLines(invoiceId, tx)).filter(
      (l) => l.grnItemId !== null,
    );
    const billed = new Map<number, number>();
    for (const l of lines) {
      if (l.grnItemId !== null) {
        billed.set(
          l.grnItemId,
          (billed.get(l.grnItemId) ?? 0) + toMilli(l.qty ?? 0),
        );
      }
    }
    const ids = [...billed.keys()].sort((a, b) => a - b);
    const notes = await repo.lockUnlinkedNotesForGrnLines(ids, tx);
    if (notes.length === 0) {
      return [];
    }
    const [accepted, corrections, counters, others, returnLines] =
      await Promise.all([
        repo.listGrnLineAccepted(ids, tx),
        purchaseReturnRepository.correctionsMilliByGrnLine(ids, tx),
        purchaseReturnRepository.postedCounters(ids, tx),
        repo.billedMilliByGrnItem(ids, LIVE_STATUSES, tx, invoiceId),
        repo.listReturnLinesByPro(
          notes.map((n) => n.proId),
          tx,
        ),
      ]);
    const acceptedBy = new Map(accepted.map((a) => [a.id, a.acceptedQty]));
    const returnedBy = new Map(counters.map((c) => [c.id, c.acceptedReturned]));
    const includes = new Map<number, boolean>();
    for (const id of ids) {
      const without = net(
        acceptedBy.get(id) ?? 0,
        corrections.get(id) ?? 0,
        returnedBy.get(id) ?? 0,
      );
      includes.set(
        id,
        (billed.get(id) ?? 0) > Math.max(0, without - (others.get(id) ?? 0)),
      );
    }

    const linked: number[] = [];
    for (const note of notes) {
      const noteLines = returnLines.filter((l) => l.proId === note.proId);
      const covered = noteLines.filter((l) => billed.has(l.grnItemId));
      if (covered.length === 0) {
        continue;
      }
      const ok = covered
        .filter((l) => l.source === "accepted")
        .every((l) => includes.get(l.grnItemId) === true);
      if (!ok) {
        continue;
      }
      const offset = noteLines
        .filter((l) => l.source === "accepted")
        .reduce((sum, l) => sum + (l.taxablePaise ?? 0) + (l.gstPaise ?? 0), 0);
      await repo.setNoteLink(note.id, invoiceId, offset, tx);
      linked.push(note.id);
    }
    return linked;
  },

  // BR-SINV-31: a cancelled bill gives its notes back (offset 0 until a covering bill is approved).
  async unlinkOfInvoice(invoiceId: number, tx: Tx): Promise<number[]> {
    const notes = await repo.lockNotesOfInvoice(invoiceId, tx);
    for (const note of notes) {
      await repo.setNoteLink(note.id, null, 0, tx);
    }
    return notes.map((n) => n.id);
  },
};
