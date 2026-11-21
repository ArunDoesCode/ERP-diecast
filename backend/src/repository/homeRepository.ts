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
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  scoChallanLines,
  scoChallans,
} from "../db/schemas/02_procurement-purchasing";
import { istDayBoundsOfKey } from "../lib/ist-day";
import type { HomeTileKey } from "../types/home.types";
import { hasOpenQtySql } from "./openQty";
import { poDueSql, poInTransitSql, poLateSql } from "./poPredicates";

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

// The plant day of a timestamp, as a date (display key for hints). `due` and
// `hint` are timestamp columns: buckets compare instants against the IST day
// bounds (BR-FF-08), never `::date`.
const istDaySql = (e: SQL) =>
  sql`((${e}) at time zone 'UTC' at time zone 'Asia/Kolkata')::date`;

// Builds the `count(*) filter (where …)` columns for the wanted tiles of one
// source table and runs a single SELECT (PERF-01).
async function runTable(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle table type differs per call
  table: any,
  specs: Partial<Record<HomeTileKey, TileSpec>>,
  wanted: HomeTileKey[],
  today: string,
  source?: SQL,
): Promise<Map<HomeTileKey, HomeTileResult>> {
  const keys = wanted.filter((k) => specs[k]);
  const out = new Map<HomeTileKey, HomeTileResult>();
  if (keys.length === 0) return out;
  const fields: Record<string, SQL> = {};
  const day = istDayBoundsOfKey(today);
  const startIso = day.start.toISOString();
  const nextIso = day.next.toISOString();
  for (const k of keys) {
    const s = specs[k] as TileSpec;
    fields[`${k}__count`] = sql`count(*) filter (where ${s.where})`;
    if (s.due) {
      fields[`${k}__late`] =
        sql`count(*) filter (where ${s.where} and ${s.due} < ${startIso}::timestamp)`;
      fields[`${k}__today`] =
        sql`count(*) filter (where ${s.where} and ${s.due} >= ${startIso}::timestamp and ${s.due} < ${nextIso}::timestamp)`;
    }
    if (s.hint) {
      fields[`${k}__hint`] =
        sql`to_char(min(${istDaySql(s.hint)}) filter (where ${s.where}), 'YYYY-MM-DD')`;
    }
    if (s.sentBack) {
      fields[`${k}__sent`] =
        sql`count(*) filter (where ${s.where} and ${s.sentBack})`;
    }
  }
  try {
    const [row] = (await db.select(fields).from(source ?? table)) as Record<
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

const poDue = poDueSql;
const IN_TRANSIT = poInTransitSql;
const HAS_OPEN_QTY = hasOpenQtySql;
const poLate = poLateSql;

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

    // PERF-06: earliest pending required-by computed once per PR row (lateral),
    // not once per tile column.
    const earliestPending = sql`pr_ep.earliest`;
    const prSource = sql`${purchaseRequests} left join lateral (
      select min(${purchaseRequestItems.expectedDate}) as earliest from ${purchaseRequestItems}
      where ${purchaseRequestItems.prId} = ${purchaseRequests.id} and ${purchaseRequestItems.status} = 'pending'
    ) pr_ep on true`;
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
      runTable(purchaseRequests, prSpecs, wanted, today, prSource),
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
