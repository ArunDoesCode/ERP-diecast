import { type SQL, sql } from "drizzle-orm";
import {
  purchaseOrderItems,
  purchaseOrders,
} from "../db/schemas/02_procurement-purchasing";
import { istDayBoundsOfKey } from "../lib/ist-day";

/** BR-PO-19: due date = revised date if set, else expected date. */
export const poDueSql = sql`coalesce(${purchaseOrders.revisedDeliveryDate}, ${purchaseOrders.expectedDeliveryDate})`;

export const poInTransitSql = sql`${purchaseOrders.status} in ('dispatched', 'partial_received')`;

/**
 * IST day bounds of a YYYY-MM-DD key as timestamp literals. Due dates are
 * timestamps; they are compared as instants against these bounds so a time of
 * day near midnight IST lands on the right plant day (BR-FF-08).
 */
export function istBoundsSql(today: string) {
  const { start, next } = istDayBoundsOfKey(today);
  return {
    start: sql`${start.toISOString()}::timestamp`,
    next: sql`${next.toISOString()}::timestamp`,
  };
}

/**
 * The one named predicate "Late" (frozen BR-PO-19, A-54): ordered - received
 * > 0 on some line, dispatched / partly received, due before IST `today`.
 * Shared by the Home tile, the PO list `bucket=late`, `overdue` and `lateCount`.
 */
export const poLateSql = (today: string) => sql`(${poInTransitSql}
  and ${poDueSql} < ${istBoundsSql(today).start}
  and exists (
    select 1 from ${purchaseOrderItems}
    where ${purchaseOrderItems.poId} = ${purchaseOrders.id}
      and ${purchaseOrderItems.qty} - coalesce(${purchaseOrderItems.receivedQty}, 0) > 0
  ))`;

/** PO list bucket on the due date; late is the BR-PO-19 predicate. No due date = Later. */
export function poBucketSql(
  bucket: "late" | "today" | "later",
  today: string,
): SQL {
  if (bucket === "late") return poLateSql(today);
  const { start, next } = istBoundsSql(today);
  if (bucket === "today")
    return sql`(${poDueSql} >= ${start} and ${poDueSql} < ${next})`;
  return sql`(${poDueSql} is null or ${poDueSql} >= ${next})`;
}
