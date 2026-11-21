import { sql } from "drizzle-orm";
import {
  inventoryLedger,
  locations,
} from "../db/schemas/02_procurement-catalog";
import type { DbExecutor } from "./executor";

/**
 * BR-SO-30 (CR-SO/INV-1): free stock per item in one query. The latest
 * `balance_after` per location, summed over active, non-virtual locations
 * except the scrap yard (and vendor premises). Not `item_master.current_stock`,
 * which also counts what sits at a job worker. Read only; items without any
 * such stock are absent from the map.
 */
export async function freeStockByItems(
  executor: DbExecutor,
  itemIds: number[],
): Promise<Map<number, number>> {
  if (itemIds.length === 0) return new Map();
  const ids = sql.join(
    itemIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = (await executor.execute(sql`
    select t.item_id as item_id, sum(t.balance_after)::float8 as qty
    from (
      select distinct on (item_id, location_id) item_id, location_id, balance_after
      from ${inventoryLedger}
      where item_id in (${ids})
      order by item_id, location_id, id desc
    ) t
    join ${locations} l on l.id = t.location_id
    where l.is_active
      and not l.is_virtual
      and l.type not in ('scrap_yard', 'vendor_premise')
    group by t.item_id
  `)) as unknown as Array<{ item_id: number; qty: number }>;
  return new Map(rows.map((r) => [Number(r.item_id), Number(r.qty)]));
}
