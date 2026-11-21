import { db } from "../db/client";
import { type Actor, can } from "../lib/auth-middleware";
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../lib/errors";
import { istDayKey } from "../lib/ist-day";
import { milliToNumber, toMilli } from "../lib/milli";
import { saleExplosionRepository } from "../repository/saleExplosionRepository";
import { saleOrderRepository } from "../repository/saleOrderRepository";
import { salesAuditRepository } from "../repository/salesAuditRepository";
import type { createPrSchemaType } from "../types/pr.types";
import type { CreateDraftsInput } from "../types/saleOrder.types";
import type { createScoSchemaType } from "../types/sco.types";
import { expandBomLevel } from "./bomNeedsService";
import { prService } from "./prService";
import {
  assertReturnDateInWindow,
  insertPreparedSco,
  loadScoDetails,
  prepareScoCreate,
} from "./scoService";

// POST /sale-orders/:id/explosions/:eid/drafts (BR-SO-39..48, 62). One
// transaction: SO row lock -> snapshot rows `for update` by id -> every check ->
// the PR and SCO services with this same `tx`. Document numbers are allocated
// last, after every row and every SCO has been validated.

const WHOLE_UNITS = new Set(["pcs", "set"]);

const conflict = (message: string, code: string) =>
  new AppError(message, 409, code);
const bad = (message: string, code: string) =>
  new BadRequestError(message, code);
const denied = (key: string) =>
  new ForbiddenError("Permission denied", "PERMISSION_DENIED", { key });

type PickRows = Awaited<
  ReturnType<typeof saleExplosionRepository.findRowsForPick>
>;

/** Date at 00:00 UTC of a plant day: what the PR / SCO date columns hold. */
const dayDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

export const saleDraftService = {
  async createDrafts(
    soId: number,
    eid: number,
    input: CreateDraftsInput,
    actor: Actor,
  ) {
    const actorId = actor.id;
    const rowIds = input.rows.map((r) => r.rowId);

    // BR-SO-62, 45: which snapshot and rows, and the keys they need, are known
    // before the transaction, so a refusal costs no lock. Checked again below.
    const first = await saleExplosionRepository.findHeader(soId, eid);
    if (!first) {
      throw new NotFoundError("Explosion not found", "EXPLOSION_NOT_FOUND");
    }
    const preRows = await saleExplosionRepository.findRowsForPick(
      eid,
      rowIds,
      db,
      false,
    );
    if (preRows.length !== rowIds.length) {
      throw new NotFoundError(
        "A picked row does not belong to this explosion",
        "EXPLOSION_ROW_NOT_FOUND",
      );
    }
    if (
      preRows.some((r) => r.row.rowType === "buy") &&
      !can(actor, "pr.manage")
    ) {
      throw denied("pr.manage");
    }
    if (
      preRows.some((r) => r.row.rowType === "job_work") &&
      !can(actor, "sco.manage")
    ) {
      throw denied("sco.manage");
    }

    // BR-SO-45: pr.manage / sco.manage checked above, before anything is created
    // BR-SO-40, 47: the drafts are ordinary draft PRs / SCOs, never auto-submitted
    return db.transaction(async (tx) => {
      const so = await saleOrderRepository.lockById(soId, tx);
      if (!so) {
        throw new NotFoundError("Sale order not found", "SO_NOT_FOUND");
      }
      if (so.status !== "confirmed") {
        throw conflict(
          `A ${so.status.replace("_", " ")} sale order cannot raise documents`,
          "SO_NOT_CONFIRMED",
        );
      }
      const header = await saleExplosionRepository.findHeader(soId, eid, tx);
      if (!header) {
        throw new NotFoundError("Explosion not found", "EXPLOSION_NOT_FOUND");
      }
      if (header.status === "superseded") {
        throw conflict(
          "This explosion was replaced by a newer run. Re-run first.",
          "SNAPSHOT_SUPERSEDED",
        );
      }
      if (header.soChanged || header.deliveryChanged || header.bomChanged) {
        throw conflict(
          "The sale order or a BOM changed after this run. Re-run first.",
          "SNAPSHOT_OUT_OF_DATE",
        );
      }

      const locked: PickRows = await saleExplosionRepository.findRowsForPick(
        eid,
        rowIds,
        tx,
        true,
      );
      if (locked.length !== rowIds.length) {
        throw new NotFoundError(
          "A picked row does not belong to this explosion",
          "EXPLOSION_ROW_NOT_FOUND",
        );
      }
      const rowOf = new Map(locked.map((l) => [l.row.id, l]));
      const today = istDayKey();
      const number = `${header.soNumber}/E${header.runNo}`;

      type Pick = {
        rowId: number;
        itemId: number;
        sku: string;
        type: "buy" | "job_work";
        qtyMilli: number;
        netMilli: number;
        requiredBy: string;
        vendorId?: number | undefined;
        expectedReturnDate?: string | undefined;
      };
      const picks: Pick[] = [];

      // ---- BR-SO-39, 43, 44, 46: every row, before anything is written ----
      for (const p of input.rows) {
        const found = rowOf.get(p.rowId);
        if (!found) continue;
        const { row, sku } = found;
        if (row.prItemId !== null || row.scoItemId !== null) {
          throw conflict(
            `${sku} was already raised from this explosion`,
            "ROW_ALREADY_RAISED",
          );
        }
        if (row.blockReason !== null) {
          throw bad(
            `${sku} cannot be raised: ${row.blockReason.replace("_", " ")}`,
            "ROW_NOT_RAISABLE",
          );
        }
        if (row.rowType !== "buy" && row.rowType !== "job_work") {
          throw bad(
            `${sku} is made in-house (${row.rowType}); it is for planning only`,
            "ROW_NOT_RAISABLE",
          );
        }
        const netMilli = toMilli(row.netQty);
        if (netMilli <= 0) {
          throw bad(`${sku} has nothing short`, "ROW_NOT_RAISABLE");
        }
        const qtyMilli = toMilli(p.qty);
        if (qtyMilli > netMilli) {
          throw bad(
            `${sku}: picked ${p.qty} is more than the shortage ${milliToNumber(netMilli)}`,
            "PICK_OVER_NET",
          );
        }
        const needsWhole =
          row.rowType === "job_work" || WHOLE_UNITS.has(row.uom.toLowerCase());
        if (needsWhole && qtyMilli % 1000 !== 0) {
          throw bad(`${sku}: quantity must be a whole number`, "QTY_NOT_WHOLE");
        }
        if (
          row.rowType === "buy" &&
          (p.vendorId !== undefined || p.expectedReturnDate !== undefined)
        ) {
          throw bad(
            `${sku}: a job worker and a return date are for job-work rows only`,
            "ROW_NOT_JOB_WORK",
          );
        }
        picks.push({
          rowId: row.id,
          itemId: row.itemId,
          sku,
          type: row.rowType,
          qtyMilli,
          netMilli,
          requiredBy: row.requiredBy,
          vendorId: p.vendorId,
          expectedReturnDate: p.expectedReturnDate,
        });
      }

      const noteText = (what: string) =>
        `Auto-generated from ${number} — review before ${what}`;

      // ---- BR-SO-43: a job worker (default from the BOM) and a return date per row
      // ---- BR-SO-42, 43: job-work rows -> one SCO per job worker, validated now ----
      const jobPicks = picks.filter((p) => p.type === "job_work");
      const scoGroups = new Map<
        number,
        { input: createScoSchemaType; rowIds: number[]; date: Date }
      >();
      if (jobPicks.length > 0) {
        const expanded = await expandBomLevel(tx, {
          items: jobPicks.map((p) => ({
            partId: p.itemId,
            qty: p.qtyMilli / 1000, // whole, checked above: the return qty
          })),
        });
        expanded.forEach((part, i) => {
          const p = jobPicks[i] as Pick;
          const node = part.node;
          if (
            node.status !== "ok" ||
            node.kind !== "job_work" ||
            !node.jobWork ||
            node.jobWork.sentItemId === null ||
            node.jobWork.serviceId === null
          ) {
            throw bad(
              `${p.sku} has no complete job-work BOM`,
              "ROW_NOT_RAISABLE",
            );
          }
          const vendorId = p.vendorId ?? node.jobWork.jobWorkerId;
          if (vendorId === null) {
            throw bad(`${p.sku}: choose a job worker`, "JOB_WORKER_REQUIRED");
          }
          if (p.expectedReturnDate === undefined && p.requiredBy < today) {
            throw bad(
              `${p.sku}: the delivery date has passed, enter a return date`,
              "RETURN_DATE_REQUIRED",
            );
          }
          const returnDate = dayDate(p.expectedReturnDate ?? p.requiredBy);
          assertReturnDateInWindow(returnDate);

          const line = {
            rawItemId: node.jobWork.sentItemId,
            finishedItemId: p.itemId,
            serviceId: node.jobWork.serviceId,
            rawQtyToIssue: node.jobWork.sendNeed,
            expectedReturnQty: p.qtyMilli / 1000,
          };
          const group = scoGroups.get(vendorId);
          if (group) {
            group.input.lines.push(line);
            group.rowIds.push(p.rowId);
            if (returnDate > group.date) {
              group.date = returnDate;
              group.input.expectedReturnDate = returnDate;
            }
          } else {
            scoGroups.set(vendorId, {
              input: {
                vendorId,
                expectedReturnDate: returnDate,
                projectRef: header.soNumber,
                notes: noteText("sending material"),
                lines: [line],
              },
              rowIds: [p.rowId],
              date: returnDate,
            });
          }
        });
      }
      const preparedScos = [];
      for (const group of scoGroups.values()) {
        preparedScos.push({
          group,
          lines: await prepareScoCreate(group.input, tx),
        });
      }

      // ---- numbers are allocated from here on ----
      const prPicks = picks.filter((p) => p.type === "buy");
      const prs: { id: number; prNumber: string; lineCount: number }[] = [];
      const prItemOf = new Map<number, number>(); // rowId -> pr line id
      if (prPicks.length > 0) {
        const prInput: createPrSchemaType = {
          type: "sale_order",
          saleOrderId: soId,
          notes: noteText("buying"),
          items: prPicks.map((p) => ({
            itemId: p.itemId,
            requestedQty: p.qtyMilli / 1000,
            // BR-SO-41: a delivery date already past is left empty
            ...(p.requiredBy >= today
              ? { expectedDate: dayDate(p.requiredBy) }
              : {}),
          })),
        };
        const created = await prService.create(prInput, actorId, actor, tx);
        prs.push({
          id: created.pr.id,
          prNumber: created.pr.prNumber,
          lineCount: created.items.length,
        });
        const lineOfItem = new Map(created.items.map((i) => [i.itemId, i.id]));
        for (const p of prPicks) {
          prItemOf.set(p.rowId, lineOfItem.get(p.itemId) as number);
        }
      }

      const pickByRow = new Map(picks.map((x) => [x.rowId, x]));
      const scos: { id: number; scoNumber: string }[] = [];
      const scoItemOf = new Map<number, number>(); // rowId -> sco line id
      for (const { group, lines } of preparedScos) {
        const id = await insertPreparedSco(group.input, lines, actorId, tx);
        const details = await loadScoDetails(id, tx);
        scos.push({ id, scoNumber: details.sco.scoNumber });
        const lineOfItem = new Map(
          details.items.map((i) => [i.finishedItemId, i.id]),
        );
        for (const rowId of group.rowIds) {
          const p = pickByRow.get(rowId) as Pick;
          scoItemOf.set(rowId, lineOfItem.get(p.itemId) as number);
        }
      }

      // ---- BR-SO-46: each row records the line it became ----
      const now = new Date();
      await saleExplosionRepository.markRaised(
        picks.map((p) => ({
          rowId: p.rowId,
          prItemId: prItemOf.get(p.rowId) ?? null,
          scoItemId: scoItemOf.get(p.rowId) ?? null,
          qty: (p.qtyMilli / 1000).toFixed(3),
        })),
        actorId,
        now,
        tx,
      );

      await salesAuditRepository.write(
        {
          actorId,
          action: "so.drafts_created",
          targetType: "explosion",
          targetId: eid,
          soId,
          after: {
            explosion: number,
            prs: prs.map((p) => p.prNumber),
            scos: scos.map((s) => s.scoNumber),
            rows: picks.map((p) => ({
              item: p.sku,
              qty: milliToNumber(p.qtyMilli),
            })),
          },
        },
        tx,
      );

      return {
        prs,
        scos,
        rows: picks.map((p) => ({
          rowId: p.rowId,
          prItemId: prItemOf.get(p.rowId) ?? null,
          scoItemId: scoItemOf.get(p.rowId) ?? null,
          // BR-SO-39: a smaller pick is allowed and shows what is still short
          stillShortBy: milliToNumber(p.netMilli - p.qtyMilli),
        })),
      };
    });
  },
};
