import { type SQL, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  approvalRequests,
  approvalTrails,
} from "../db/schemas/02_procurement-approval";
import { itemMaster } from "../db/schemas/02_procurement-catalog";
import {
  grnItems,
  grns,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  scoChallanLines,
  scoChallans,
} from "../db/schemas/02_procurement-purchasing";
import type { HomeTileKey } from "../types/home.types";

// Raw per-tile numbers; the service adds tone and the hint shape.
export type HomeTileRaw = {
  count: number;
  late: number;
  today: number;
  later: number;
  /** YYYY-MM-DD of the tile's hint date, null when there is none. */
  hintDate: string | null;
  /** Drafts whose last approval request was sent back (my_prs_draft, my_pos_draft). */
  sentBack: number;
};
export type HomeTileResult = HomeTileRaw | "error";

type Ctx = { actorId: number; roleName: string; today: string };

const num = (v: unknown) => Number(v ?? 0);

// One tile's columns inside a table statement. `where` is the tile predicate,
// `due` the date expression the Late / Today / Later split reads (omit for
// undated tiles), `hint` the expression whose min is the hint date.
type TileSpec = {
  where: SQL;
  due?: SQL;
  hint?: SQL;
  sentBack?: SQL;
};

const dayOf = (e: SQL) => sql`(${e})::date`;

// Builds the `count(*) filter (where …)` columns for the wanted tiles of one
// source table and runs a single SELECT (PERF-01).
async function runTable(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle table type differs per call
  table: any,
  specs: Partial<Record<HomeTileKey, TileSpec>>,
  wanted: HomeTileKey[],
  today: string,
): Promise<Map<HomeTileKey, HomeTileResult>> {
  const keys = wanted.filter((k) => specs[k]);
  const out = new Map<HomeTileKey, HomeTileResult>();
  if (keys.length === 0) return out;
  const fields: Record<string, SQL> = {};
  for (const k of keys) {
    const s = specs[k] as TileSpec;
    fields[`${k}__count`] = sql`count(*) filter (where ${s.where})`;
    if (s.due) {
      fields[`${k}__late`] =
        sql`count(*) filter (where ${s.where} and ${dayOf(s.due)} < ${today}::date)`;
      fields[`${k}__today`] =
        sql`count(*) filter (where ${s.where} and ${dayOf(s.due)} = ${today}::date)`;
    }
    if (s.hint) {
      fields[`${k}__hint`] =
        sql`to_char(min(${dayOf(s.hint)}) filter (where ${s.where}), 'YYYY-MM-DD')`;
    }
    if (s.sentBack) {
      fields[`${k}__sent`] =
        sql`count(*) filter (where ${s.where} and ${s.sentBack})`;
    }
  }
  try {
    const [row] = (await db.select(fields).from(table)) as Record<
      string,
      unknown
    >[];
    for (const k of keys) {
      const count = num(row?.[`${k}__count`]);
      const late = num(row?.[`${k}__late`]);
      const todayN = num(row?.[`${k}__today`]);
      out.set(k, {
        count,
        late,
        today: todayN,
        later: count - late - todayN,
        hintDate: (row?.[`${k}__hint`] as string | null | undefined) ?? null,
        sentBack: num(row?.[`${k}__sent`]),
      });
    }
  } catch {
    // BR-FF-19: a failed statement marks only its own tiles.
    for (const k of keys) out.set(k, "error");
  }
  return out;
}

const poDue = sql`coalesce(${purchaseOrders.revisedDeliveryDate}, ${purchaseOrders.expectedDeliveryDate})`;
const IN_TRANSIT = sql`${purchaseOrders.status} in ('dispatched', 'partial_received')`;

// BR-FF-09 open quantity > 0 on any line: ordered - accepted - arrived and
// still pending QA. (Same expression as the receivable-PO picker; kept here
// until it is shared.)
const HAS_OPEN_QTY = sql`exists (
  select 1 from ${purchaseOrderItems}
  where ${purchaseOrderItems.poId} = ${purchaseOrders.id}
    and ${purchaseOrderItems.qty} - coalesce(${purchaseOrderItems.receivedQty}, 0)
      - coalesce((select sum(${grnItems.receivedQty}) from ${grnItems}
          where ${grnItems.poItemId} = ${purchaseOrderItems.id}
            and ${grnItems.qaStatus} = 'pending'), 0) > 0
)`;

// BR-PO-19 (frozen, A-54): ordered - received > 0, due before IST today.
const poLate = (today: string) => sql`(${IN_TRANSIT}
  and ${dayOf(poDue)} < ${today}::date
  and exists (
    select 1 from ${purchaseOrderItems}
    where ${purchaseOrderItems.poId} = ${purchaseOrders.id}
      and ${purchaseOrderItems.qty} - coalesce(${purchaseOrderItems.receivedQty}, 0) > 0
  ))`;

const lastRequestSentBack = (docType: "pr" | "po", docIdCol: SQL) => sql`(
  select ${approvalRequests.status} from ${approvalRequests}
  where ${approvalRequests.docType} = ${docType} and ${approvalRequests.docId} = ${docIdCol}
  order by ${approvalRequests.id} desc limit 1
) = 'require_more_info'`;

export const homeRepository = {
  /** One statement per source table (<= 6). Tiles not in `wanted` are not read. */
  async getTileCounts(
    wanted: HomeTileKey[],
    ctx: Ctx,
  ): Promise<Map<HomeTileKey, HomeTileResult>> {
    const { actorId, roleName, today } = ctx;

    const approvalSpecs: Partial<Record<HomeTileKey, TileSpec>> = {
      approvals: {
        // BR-FF-20: same predicate as listPendingRequests.
        where: sql`(${approvalRequests.status} = 'pending_approval'
          and (${approvalRequests.currentApproverRole} = ${roleName}
            or ${approvalRequests.currentApproverEmployeeId} = ${actorId})
          and not exists (
            select 1 from ${approvalTrails}
            where ${approvalTrails.requestId} = ${approvalRequests.id}
              and ${approvalTrails.action} = 'approved'
              and ${approvalTrails.actionBy} = ${actorId}))`,
        hint: sql`${approvalRequests.requestedAt}`,
      },
    };

    const earliestPending = sql`(select min(${purchaseRequestItems.expectedDate}) from ${purchaseRequestItems}
      where ${purchaseRequestItems.prId} = ${purchaseRequests.id} and ${purchaseRequestItems.status} = 'pending')`;
    const prSpecs: Partial<Record<HomeTileKey, TileSpec>> = {
      my_prs_draft: {
        where: sql`(${purchaseRequests.requestedBy} = ${actorId} and ${purchaseRequests.status} = 'draft')`,
        sentBack: lastRequestSentBack("pr", sql`${purchaseRequests.id}`),
      },
      my_prs_pending: {
        where: sql`(${purchaseRequests.requestedBy} = ${actorId} and ${purchaseRequests.status} = 'pending_approval')`,
        hint: sql`(select max(${approvalRequests.requestedAt}) from ${approvalRequests}
          where ${approvalRequests.docType} = 'pr' and ${approvalRequests.docId} = ${purchaseRequests.id}
            and ${approvalRequests.status} = 'pending_approval')`,
      },
      prs_to_order: {
        where: sql`(${purchaseRequests.status} in ('approved', 'partial_ordered')
          and exists (select 1 from ${purchaseRequestItems}
            where ${purchaseRequestItems.prId} = ${purchaseRequests.id}
              and ${purchaseRequestItems.status} = 'pending'))`,
        due: earliestPending,
        hint: earliestPending,
      },
    };

    const poSpecs: Partial<Record<HomeTileKey, TileSpec>> = {
      pos_to_send: {
        where: sql`${purchaseOrders.status} = 'approved'`,
        due: poDue,
        hint: poDue,
      },
      my_pos_draft: {
        where: sql`(${purchaseOrders.createdBy} = ${actorId} and ${purchaseOrders.status} = 'draft')`,
        sentBack: lastRequestSentBack("po", sql`${purchaseOrders.id}`),
      },
      pos_late: { where: poLate(today), hint: poDue },
      goods_expected: {
        where: sql`(${IN_TRANSIT} and ${HAS_OPEN_QTY})`,
        due: poDue,
        hint: poDue,
      },
    };

    const grnSpecs: Partial<Record<HomeTileKey, TileSpec>> = {
      grns_to_inspect: {
        where: sql`exists (select 1 from ${grnItems}
          where ${grnItems.grnId} = ${grns.id} and ${grnItems.qaStatus} = 'pending')`,
        due: sql`${grns.receivedDate}`,
        hint: sql`${grns.receivedDate}`,
      },
    };

    const challanSpecs: Partial<Record<HomeTileKey, TileSpec>> = {
      jobwork_due: {
        // Same "open" rule as challans/open.
        where: sql`exists (select 1 from ${scoChallanLines}
          where ${scoChallanLines.challanId} = ${scoChallans.id}
            and ${scoChallanLines.settledQty} < ${scoChallanLines.qty})`,
        due: sql`${scoChallans.returnDueDate}`,
        hint: sql`${scoChallans.returnDueDate}`,
      },
    };

    const stockSpecs: Partial<Record<HomeTileKey, TileSpec>> = {
      stock_low: {
        // Same predicate as the stock list belowReorder flag.
        where: sql`(${itemMaster.isActive} = true and ${itemMaster.reorderLevel} > 0
          and ${itemMaster.currentStock} <= ${itemMaster.reorderLevel})`,
      },
    };

    const parts = await Promise.all([
      runTable(approvalRequests, approvalSpecs, wanted, today),
      runTable(purchaseRequests, prSpecs, wanted, today),
      runTable(purchaseOrders, poSpecs, wanted, today),
      runTable(grns, grnSpecs, wanted, today),
      runTable(scoChallans, challanSpecs, wanted, today),
      runTable(itemMaster, stockSpecs, wanted, today),
    ]);
    const merged = new Map<HomeTileKey, HomeTileResult>();
    for (const p of parts) for (const [k, v] of p) merged.set(k, v);
    return merged;
  },
};
