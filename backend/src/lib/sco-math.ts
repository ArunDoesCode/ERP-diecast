// Whole-piece maths shared by the SCO receipt, QA and read-out code (BR-SCO-12, 14, 18).

// Raw pieces used for `processed` finished pieces (cumulative): processed x send / return,
// rounded half up to whole pieces (spec changelog S3: proportional to cumulative
// processed, no drift, fully returned = fully used).
export function rawUsedFor(
  processed: number,
  sendQty: number,
  returnQty: number,
): number {
  return Math.floor((2 * processed * sendQty + returnQty) / (2 * returnQty));
}

type LineCounters = {
  issuedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  pendingQaQty: number;
  unprocessedQty: number;
  lossQty: number;
  rawQtyToIssue: number;
  expectedReturnQty: number;
};

// Raw pieces still at the vendor; processed pieces waiting for QA are reserved
// (BR-SCO-12: earlier receipts, even pending QA, reduce what is still there).
export function qtyAtVendor(line: LineCounters): number {
  const processed = line.acceptedQty + line.rejectedQty + line.pendingQaQty;
  return (
    line.issuedQty -
    rawUsedFor(processed, line.rawQtyToIssue, line.expectedReturnQty) -
    line.unprocessedQty -
    line.lossQty
  );
}

// BR-SCO-18: nothing left at the vendor when pending-QA pieces still count as there.
export function nothingLeftAtVendor(line: LineCounters): boolean {
  if (line.pendingQaQty > 0) return false;
  return qtyAtVendor(line) === 0;
}
