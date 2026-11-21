import { db } from "../db/client";
import { isSuperAdminRoleName } from "../lib/auth-middleware";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { milliToNumber } from "../lib/milli";
import { computeOrderMilli } from "../lib/reorder-math";
import { reorderRepository } from "../repository/reorderRepository";
import type {
  ReorderItemRow,
  ReorderItemsQuery,
  ReorderOwnerCandidatesQuery,
  ReorderRun,
  ReorderRunsQuery,
  ReorderSettings,
  UpdateReorderSettingsInput,
} from "../types/reorder.types";

// Run detail is not paged: at most this many item rows (api.md).
const RUN_DETAIL_ITEM_LIMIT = 500;

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type OwnerCheck = "ok" | "missing" | "inactive" | "no_right";

/**
 * The one draft-owner check (BR-RO-14, 15, 20): the employee exists, is
 * active and holds pr.manage (super-admin holds every key). Read fresh, never
 * from the actor cache, so a run sees a just-changed owner.
 */
export async function checkDraftOwner(
  employeeId: number | null | undefined,
): Promise<OwnerCheck> {
  if (employeeId == null) return "missing";
  const facts = await reorderRepository.readOwnerFacts(employeeId);
  if (!facts) return "missing";
  if (!facts.isActive) return "inactive";
  if (
    isSuperAdminRoleName(facts.roleName) ||
    facts.keys.includes("pr.manage")
  ) {
    return "ok";
  }
  return "no_right";
}

const idName = (id: number | null, name: string | null) =>
  id !== null && name !== null ? { id, name } : null;

type SettingsRow = NonNullable<
  Awaited<ReturnType<typeof reorderRepository.getSettings>>
>;

async function shapeSettings(row: SettingsRow): Promise<ReorderSettings> {
  return {
    enabled: row.enabled,
    runHour: row.runHour,
    draftOwner: idName(row.draftOwnerId, row.draftOwnerName),
    draftOwnerValid: (await checkDraftOwner(row.draftOwnerId)) === "ok",
    updatedBy: idName(row.updatedById, row.updatedByName),
    updatedAt: row.updatedAt,
  };
}

type RunRow = NonNullable<
  Awaited<ReturnType<typeof reorderRepository.findRunById>>
>;

function shapeRun(
  row: RunRow,
  po: { id: number; poNumber: string; status: string } | undefined,
): ReorderRun {
  return {
    id: row.id,
    trigger: row.trigger,
    state: row.state,
    startedBy: idName(row.startedById, row.startedByName),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    draftOwner: idName(row.draftOwnerId, row.draftOwnerName),
    itemsChecked: row.itemsChecked,
    itemsRaised: row.itemsRaised,
    itemsSkipped: row.itemsSkipped,
    itemsDeferred: row.itemsDeferred,
    pr:
      row.prId !== null && row.prNumber !== null && row.prStatus !== null
        ? { id: row.prId, prNumber: row.prNumber, status: row.prStatus }
        : null,
    po: po ?? null,
    failureReason: row.failureReason,
  };
}

export const reorderService = {
  // BR-RO-21: live list, saves nothing.
  async listItems(params: ReorderItemsQuery) {
    const { total, counts, rows } = await reorderRepository.listItems(params);
    const data: ReorderItemRow[] = rows.map((r) => {
      const orderQty =
        r.state === "will_be_ordered"
          ? milliToNumber(
              computeOrderMilli({
                shortfallMilli: Number(r.shortfall_m),
                reorderQtyMilli: Number(r.rq_m),
                minOrderMilli: Number(r.min_m),
                multipleMilli: Number(r.mult_m),
                uom: r.uom,
              }),
            )
          : null;
      const coveredBy =
        r.state !== "covered"
          ? null
          : r.cpr_id !== null && r.cpr_number !== null
            ? { type: "pr" as const, id: r.cpr_id, number: r.cpr_number }
            : r.cpo_id !== null && r.cpo_number !== null
              ? { type: "po" as const, id: r.cpo_id, number: r.cpo_number }
              : null;
      return {
        itemId: r.id,
        sku: r.sku,
        name: r.name,
        uom: r.uom,
        usableQty: milliToNumber(Number(r.usable_m)),
        onTheWayQty: milliToNumber(Number(r.otw_m)),
        projectedQty: milliToNumber(Number(r.proj_m)),
        reorderLevel: Number(r.level),
        reorderQty: milliToNumber(Number(r.rq_m)),
        orderQty,
        state: r.state,
        coveredBy,
      };
    });
    return {
      data,
      meta: {
        ...toPaginatedMeta(params.page, params.pageSize, Number(total)),
        stateCounts: {
          will_be_ordered: Number(counts.will_be_ordered ?? 0),
          covered: Number(counts.covered ?? 0),
          needs_reorder_qty: Number(counts.needs_reorder_qty ?? 0),
          ok: Number(counts.ok ?? 0),
        },
      },
    };
  },

  async listRuns(params: ReorderRunsQuery) {
    const { rows, total } = await reorderRepository.listRuns(params);
    const prIds = rows.flatMap((r) => (r.prId !== null ? [r.prId] : []));
    const pos = await reorderRepository.findLatestPosByPrIds(prIds);
    return {
      data: rows.map((r) =>
        shapeRun(r, r.prId !== null ? pos.get(r.prId) : undefined),
      ),
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async getRun(id: number) {
    const row = await reorderRepository.findRunById(id);
    if (!row) {
      throw new NotFoundError("Reorder run not found", "REORDER_RUN_NOT_FOUND");
    }
    const pos = await reorderRepository.findLatestPosByPrIds(
      row.prId !== null ? [row.prId] : [],
    );
    const items = await reorderRepository.listRunItems(
      id,
      RUN_DETAIL_ITEM_LIMIT,
    );
    return {
      ...shapeRun(row, row.prId !== null ? pos.get(row.prId) : undefined),
      items,
    };
  },

  async getSettings(): Promise<ReorderSettings> {
    const row = await reorderRepository.getSettings();
    if (!row) throw new NotFoundError("Reorder settings not found");
    return shapeSettings(row);
  },

  // BR-RO-15, 20: switch, hour, owner; one history row per changed field.
  async updateSettings(input: UpdateReorderSettingsInput, actorId: number) {
    await db.transaction(async (tx) => {
      await reorderRepository.lockSettings(tx);
      const cur = await reorderRepository.getSettings(tx);
      if (!cur) throw new NotFoundError("Reorder settings not found");

      const next = {
        enabled: input.enabled ?? cur.enabled,
        runHour: input.runHour ?? cur.runHour,
        draftOwnerId:
          input.draftOwnerId !== undefined
            ? input.draftOwnerId
            : cur.draftOwnerId,
      };

      const ownerState = await checkDraftOwner(next.draftOwnerId);
      if (input.draftOwnerId != null && ownerState !== "ok") {
        throw new BadRequestError(
          "Draft owner must be an active employee who can raise requisitions",
          "REORDER_OWNER_INVALID",
        );
      }
      if (next.enabled && ownerState !== "ok") {
        throw new BadRequestError(
          "Choose a valid draft owner before switching reorder on",
          "REORDER_OWNER_INVALID",
        );
      }

      const history: Array<{
        field: string;
        oldValue: string | null;
        newValue: string;
        createdBy: number;
      }> = [];
      if (next.enabled !== cur.enabled) {
        history.push({
          field: "enabled",
          oldValue: String(cur.enabled),
          newValue: String(next.enabled),
          createdBy: actorId,
        });
      }
      if (next.runHour !== cur.runHour) {
        history.push({
          field: "runHour",
          oldValue: String(cur.runHour),
          newValue: String(next.runHour),
          createdBy: actorId,
        });
      }
      if (next.draftOwnerId !== cur.draftOwnerId) {
        history.push({
          field: "draftOwnerId",
          oldValue: cur.draftOwnerId === null ? null : String(cur.draftOwnerId),
          newValue:
            next.draftOwnerId === null ? "none" : String(next.draftOwnerId),
          createdBy: actorId,
        });
      }
      if (history.length === 0) return;

      const now = new Date();
      const scheduleMoved =
        next.enabled !== cur.enabled || next.runHour !== cur.runHour;
      await reorderRepository.updateSettings(tx, {
        enabled: next.enabled,
        runHour: next.runHour,
        draftOwnerId: next.draftOwnerId,
        updatedBy: actorId,
        updatedAt: now,
        ...(scheduleMoved ? { scheduleChangedAt: now } : {}),
      });
      await reorderRepository.insertSettingsHistory(tx, history);
    });
    return this.getSettings();
  },

  async listOwnerCandidates(params: ReorderOwnerCandidatesQuery) {
    const { rows, total } = await reorderRepository.listOwnerCandidates(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },
};
