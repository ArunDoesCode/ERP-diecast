import { db } from "../db/client";
import { conflictLocation, isUniqueViolation } from "../lib/db-errors";
import { AppError, ConflictError } from "../lib/errors";
import { istDayKey } from "../lib/ist-day";
import { milliToNumber } from "../lib/milli";
import { MAX_MONEY_PAISE } from "../lib/money";
import { computeOrderMilli } from "../lib/reorder-math";
import { prRepository } from "../repository/prRepository";
import {
  type RunReadRow,
  reorderRepository,
} from "../repository/reorderRepository";
import {
  checkDraftOwner,
  type OwnerCheck,
  reorderService,
} from "./reorderService";

// BR-RO-13: most lines on one reorder PR.
const MAX_PR_LINES = 500;
// BR-RO-27: a run still `running` after this long is interrupted.
const STALE_RUN_MS = 15 * 60_000;

// BR-RO-16: the only texts a run may save or show. Raw errors go to the log.
const FAILURE_TEXT = {
  OWNER_MISSING: "No draft owner is set – choose a draft owner",
  OWNER_INACTIVE: "Draft owner is inactive – choose a new owner",
  OWNER_NO_PR_RIGHT: "Draft owner cannot use requisitions – choose a new owner",
  INTERRUPTED: "Interrupted – server stopped",
  RUN_ERROR: "Something went wrong, nothing was saved",
} as const;

const OWNER_FAILURE: Record<Exclude<OwnerCheck, "ok">, string> = {
  missing: FAILURE_TEXT.OWNER_MISSING,
  inactive: FAILURE_TEXT.OWNER_INACTIVE,
  no_right: FAILURE_TEXT.OWNER_NO_PR_RIGHT,
};

class ReorderRunInsertError extends AppError {
  constructor() {
    super("Reorder run could not be saved", 500, "REORDER_RUN_INSERT_FAILED");
  }
}

export type StartRunInput = {
  trigger: "schedule" | "manual";
  startedBy: number | null;
};

/** `busy`: another run is running; `already_ran`: the IST day is used up. */
export type StartRunResult =
  | { kind: "started"; runId: number }
  | { kind: "busy" }
  | { kind: "already_ran" };

const ddmmyyyy = (day: string) =>
  `${day.slice(8)}-${day.slice(5, 7)}-${day.slice(0, 4)}`;

/** Transaction A (BR-RO-12, 27): sweep stale runs, then insert the `running` row, committed. */
async function openRun(
  input: StartRunInput,
  now: Date,
): Promise<StartRunResult> {
  const scheduledDay = input.trigger === "schedule" ? istDayKey(now) : null;
  try {
    const runId = await db.transaction(async (tx) => {
      await reorderRepository.failStaleRuns(
        tx,
        new Date(now.getTime() - STALE_RUN_MS),
        now,
        FAILURE_TEXT.INTERRUPTED,
      );
      const settings = await reorderRepository.getSettings(tx);
      const row = await reorderRepository.insertRunningRun(tx, {
        trigger: input.trigger,
        startedBy: input.startedBy,
        scheduledDay,
        draftOwnerId: settings?.draftOwnerId ?? null,
        startedAt: now,
      });
      return row?.id;
    });
    if (runId === undefined) throw new ReorderRunInsertError();
    return { kind: "started", runId };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const { constraint } = conflictLocation(error);
    if (constraint === "uq_reorder_runs_schedule_day") {
      return { kind: "already_ran" };
    }
    return { kind: "busy" };
  }
}

type Line = {
  row: RunReadRow;
  orderMilli: number;
};

/** Transaction B body (BR-RO-13, 26, 29): read, compute, one PR, run items, run done. */
async function executeRun(
  runId: number,
  now: Date,
): Promise<{ failureReason: string } | null> {
  return db.transaction(async (tx) => {
    // SEC-02/SPEC-08: re-read the owner here; the run row and the PR requester use this one owner.
    const settings = await reorderRepository.getSettings(tx);
    const ownerId = settings?.draftOwnerId ?? null;
    const ownerState = await checkDraftOwner(ownerId);
    if (ownerState !== "ok" || ownerId === null) {
      return {
        failureReason:
          OWNER_FAILURE[ownerState === "ok" ? "missing" : ownerState],
      };
    }
    await reorderRepository.setRunOwner(tx, runId, ownerId);

    const { checked, rows } = await reorderRepository.readLowItems(tx);

    const needsQty = rows.filter((r) => r.state === "needs_reorder_qty");
    // rows arrive sorted: largest shortfall first, lower item id on a tie
    const toOrder = rows.filter((r) => r.state === "will_be_ordered");
    const lines: Line[] = [];
    const invalid: RunReadRow[] = [];
    const deferred: RunReadRow[] = [];
    let total = 0n;
    // SPEC-04: invalid lines use no cap slot; valid ones fill up to the cap, the rest are deferred.
    for (const row of toOrder) {
      const orderMilli = computeOrderMilli({
        shortfallMilli: row.shortfall_m,
        reorderQtyMilli: row.rq_m,
        minOrderMilli: row.min_m,
        multipleMilli: row.mult_m,
        uom: row.uom,
      });
      // line estimate in paise, rounded half up, in BigInt (BR-RO-29)
      const estimate = (BigInt(orderMilli) * BigInt(row.rate) + 500n) / 1000n;
      const limit = BigInt(MAX_MONEY_PAISE);
      if (
        orderMilli <= 0 ||
        !Number.isSafeInteger(orderMilli) ||
        estimate > limit ||
        total + estimate > limit
      ) {
        invalid.push(row);
        continue;
      }
      if (lines.length >= MAX_PR_LINES) {
        deferred.push(row);
        continue;
      }
      total += estimate;
      lines.push({ row, orderMilli });
    }

    let prItemByItem = new Map<number, number>();
    if (lines.length > 0) {
      const created = await prRepository.createWithItemsTx(
        tx,
        {
          type: "stock_reorder",
          saleOrderId: null,
          assetId: null,
          requestedBy: ownerId,
          reorderRunId: runId,
          notes: `Raised by reorder check ${ddmmyyyy(istDayKey(now))} (run ${runId})`,
        },
        lines.map((l) => ({
          itemId: l.row.id,
          requestedQty: milliToNumber(l.orderMilli),
          uom: l.row.uom,
          expectedDate: null,
        })),
      );
      prItemByItem = new Map(created.items.map((i) => [i.itemId, i.id]));
    }

    const snapshot = (row: RunReadRow) => ({
      runId,
      itemId: row.id,
      uom: row.uom,
      usableQty: milliToNumber(row.usable_m),
      onTheWayQty: milliToNumber(row.otw_m),
      projectedQty: milliToNumber(row.proj_m),
      reorderLevel: milliToNumber(row.level_m),
      reorderQty: milliToNumber(row.rq_m),
    });
    await reorderRepository.insertRunItems(tx, [
      ...lines.map((l) => ({
        ...snapshot(l.row),
        outcome: "raised" as const,
        orderQty: milliToNumber(l.orderMilli),
        prItemId: prItemByItem.get(l.row.id) ?? null,
      })),
      ...needsQty.map((row) => ({
        ...snapshot(row),
        outcome: "needs_reorder_qty" as const,
        orderQty: null,
        prItemId: null,
      })),
      ...invalid.map((row) => ({
        ...snapshot(row),
        outcome: "invalid_line" as const,
        orderQty: null,
        prItemId: null,
      })),
      ...deferred.map((row) => ({
        ...snapshot(row),
        outcome: "deferred" as const,
        orderQty: null,
        prItemId: null,
      })),
    ]);

    await reorderRepository.finishRun(tx, runId, {
      state: "done",
      finishedAt: new Date(),
      itemsChecked: checked,
      itemsRaised: lines.length,
      itemsSkipped: needsQty.length + invalid.length,
      itemsDeferred: deferred.length,
    });
    return null;
  });
}

export const reorderRunService = {
  /**
   * Starts one run and finishes it (BR-RO-10..16). The timer and "Check now"
   * both call this. Owner or data problems end as a saved `failed` run.
   */
  async start(
    input: StartRunInput,
    now: Date = new Date(),
  ): Promise<StartRunResult> {
    const opened = await openRun(input, now);
    if (opened.kind !== "started") return opened;
    const { runId } = opened;

    try {
      const failed = await executeRun(runId, now);
      if (failed) {
        await reorderRepository.finishRun(db, runId, {
          state: "failed",
          finishedAt: new Date(),
          failureReason: failed.failureReason,
        });
      }
    } catch (error) {
      // BR-RO-16: raw error to the log only; the PR rolled back with the transaction.
      console.error(`Reorder run ${runId} failed`, error);
      try {
        await reorderRepository.finishRun(db, runId, {
          state: "failed",
          finishedAt: new Date(),
          failureReason: FAILURE_TEXT.RUN_ERROR,
        });
      } catch (finishError) {
        // CR-01: the run stays `running`; the stale sweep marks it interrupted.
        console.error(
          `Reorder run ${runId} could not be marked failed`,
          finishError,
        );
      }
    }
    return opened;
  },

  /** POST check-now (BR-RO-11, 12): the finished run, or 409 when busy. */
  async checkNow(actorId: number) {
    const result = await this.start({ trigger: "manual", startedBy: actorId });
    if (result.kind !== "started") {
      throw new ConflictError(
        "A reorder run is already running",
        "REORDER_RUN_BUSY",
      );
    }
    return reorderService.getRun(result.runId);
  },
};
