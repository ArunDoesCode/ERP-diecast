import { type SQL, sql } from "drizzle-orm";

import {
  purchaseOrderItems,
  purchaseOrders,
} from "../db/schemas/02_procurement-purchasing";

/** BR-PO-19: due date = revised date if set, else expected date. */
export const poDueSql = sql`coalesce(${purchaseOrders.revisedDeliveryDate}, ${purchaseOrders.expectedDeliveryDate})`;

export const poInTransitSql = sql`${purchaseOrders.status} in ('dispatched', 'partial_received')`;

/** The plant day of a timestamp expression, as a date. */
export const dayOfSql = (e: SQL) => sql`(${e})::date`;

/**
 * The one named predicate "Late" (frozen BR-PO-19, A-54): ordered - received
 * > 0 on some line, dispatched / partly received, due before IST `today`.
 * Shared by the Home tile, the PO list `bucket=late`, `overdue` and `lateCount`.
 */
export const poLateSql = (today: string) => sql`(${poInTransitSql}
  and ${dayOfSql(poDueSql)} < ${today}::date
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
  const due = dayOfSql(poDueSql);
  if (bucket === "today") return sql`${due} = ${today}::date`;
  return sql`(${due} is null or ${due} > ${today}::date)`;
}
