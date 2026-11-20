import { sql } from "drizzle-orm";

import {
  grnItems,
  purchaseOrderItems,
} from "../db/schemas/02_procurement-purchasing";

/**
 * BR-FF-09: arrived on GRN lines that still exist and are pending QA. Rejected
 * goods and deleted draft GRN lines are not counted, so they are open again.
 */
export const pendingQaQtySql = sql<number>`coalesce((
  select sum(${grnItems.receivedQty}) from ${grnItems}
  where ${grnItems.poItemId} = ${purchaseOrderItems.id}
    and ${grnItems.qaStatus} = 'pending'
), 0)`;

/** BR-FF-09: open = ordered - accepted (the line's received qty) - pending QA. */
export const openQtySql = sql<number>`(${purchaseOrderItems.qty} - coalesce(${purchaseOrderItems.receivedQty}, 0) - ${pendingQaQtySql})`;

/** Quantities show 3 decimals. */
export function round3(n: number | string | null | undefined): number {
  return Math.round(Number(n ?? 0) * 1000) / 1000;
}
