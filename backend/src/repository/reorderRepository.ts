import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../db/client";
import { rolePermissions, roles } from "../db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../db/schemas/02_procurement-catalog";
import {
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
} from "../db/schemas/02_procurement-purchasing";
import {
  reorderRunItems,
  reorderRuns,
  reorderSettings,
  reorderSettingsHistory,
} from "../db/schemas/02_procurement-reorder";
import { employees } from "../db/schemas/03_hcm";
import { SUPER_ADMIN_ROLE_NAME } from "../lib/auth-middleware";
import { safeSearch } from "../lib/safe-search";
import type {
  ReorderItemsQuery,
  ReorderOwnerCandidatesQuery,
  ReorderRunsQuery,
} from "../types/reorder.types";
import { authRepository } from "./authRepository";
import type { DbExecutor, DbTransaction } from "./executor";

type ItemState = "will_be_ordered" | "covered" | "needs_reorder_qty" | "ok";

/** One low item read by a run (thousandths are integers). */
export type RunReadRow = {
  id: number;
  uom: string;
  level: number;
  level_m: number;
  usable_m: number;
  otw_m: number;
  proj_m: number;
  rq_m: number;
  min_m: number;
  mult_m: number;
  rate: number;
  shortfall_m: number;
  state: ItemState;
};

export type RunReadResult = { checked: number; rows: RunReadRow[] };

export type ListedItemRow = {
  id: number;
  sku: string;
  name: string;
  uom: string;
  level: number;
  usable_m: number;
  otw_m: number;
  proj_m: number;
  rq_m: number;
  min_m: number;
  mult_m: number;
  shortfall_m: number;
  state: ItemState;
  cpr_id: number | null;
  cpr_number: string | null;
  cpo_id: number | null;
  cpo_number: string | null;
};

export type ListedItems = {
  total: number;
  counts: Partial<Record<ItemState, number>>;
  rows: ListedItemRow[];
};

const OPEN_PR_STATUSES = sql`('draft','pending_approval','approved','partial_ordered')`;
const CLOSED_PO_STATUSES = sql`('cancelled','closed','fully_received','invoiced')`;

/**
 * The set-based read of BR-RO-01..05 (data.md): base items (active, level > 0),
 * usable stock (main_store + finished_goods, latest ledger row per item and
 * location), on the way (open PR lines + open PO remainder), state. All
 * quantities are integer thousandths; float columns are rounded inside SQL.
 */
function classifiedCtes(search?: SQL) {
  return sql`
    base as (
      select ${itemMaster.id} as id, ${itemMaster.sku} as sku, ${itemMaster.name} as name,
        ${itemMaster.uom} as uom, ${itemMaster.reorderLevel} as level,
        (${itemMaster.reorderLevel}::numeric * 1000) as level_m,
        round(${itemMaster.reorderQty} * 1000)::bigint as rq_m,
        round(${itemMaster.minOrderQty} * 1000)::bigint as min_m,
        round(${itemMaster.orderMultiple} * 1000)::bigint as mult_m,
        (case when ${itemMaster.averageCostPaise} > 0 then ${itemMaster.averageCostPaise} else ${itemMaster.standardRatePaise} end) as rate
      from ${itemMaster}
      where ${itemMaster.reorderLevel} > 0 and ${itemMaster.isActive} = true
      ${search ? sql`and ${search}` : sql``}
    ),
    usable as (
      select b.id as item_id,
        coalesce(sum(round(lb.balance_after * 1000)), 0)::bigint as usable_m
      from base b
      cross join ${locations} loc
      left join lateral (
        select il.balance_after from ${inventoryLedger} il
        where il.item_id = b.id and il.location_id = loc.id
        order by il.id desc limit 1
      ) lb on true
      where loc.type in ('main_store', 'finished_goods')
      group by b.id
    ),
    otw_pr as (
      select pri.item_id, sum(round(pri.requested_qty * 1000))::bigint as qty_m
      from ${purchaseRequestItems} pri
      join ${purchaseRequests} pr on pr.id = pri.pr_id
      where pri.status = 'pending' and pr.status in ${OPEN_PR_STATUSES}
        and pri.item_id in (select id from base)
      group by pri.item_id
    ),
    otw_po as (
      select poi.item_id,
        sum(greatest(round(poi.qty * 1000) - round(coalesce(poi.received_qty, 0) * 1000), 0))::bigint as qty_m
      from ${purchaseOrders} po
      join ${purchaseOrderItems} poi on poi.po_id = po.id
      where po.status not in ${CLOSED_PO_STATUSES}
        and poi.item_id in (select id from base)
      group by poi.item_id
    ),
    calc as (
      select b.id, b.sku, b.name, b.uom, b.level, b.level_m, b.rq_m, b.min_m, b.mult_m, b.rate,
        coalesce(u.usable_m, 0) as usable_m,
        coalesce(p1.qty_m, 0) + coalesce(p2.qty_m, 0) as otw_m,
        coalesce(u.usable_m, 0) + coalesce(p1.qty_m, 0) + coalesce(p2.qty_m, 0) as proj_m
      from base b
      left join usable u on u.item_id = b.id
      left join otw_pr p1 on p1.item_id = b.id
      left join otw_po p2 on p2.item_id = b.id
    ),
    classified as (
      select c.*,
        (case
          when c.proj_m <= c.level_m then (case when c.rq_m > 0 then 'will_be_ordered' else 'needs_reorder_qty' end)
          when c.usable_m <= c.level_m then 'covered'
          else 'ok'
        end) as state,
        ceil(c.level_m - c.proj_m)::bigint as shortfall_m
      from calc c
    )`;
}

const ITEM_ORDER = {
  sku: "sku",
  name: "name",
  usableQty: "usable_m",
  projectedQty: "proj_m",
  state:
    "(case state when 'will_be_ordered' then 1 when 'covered' then 2 when 'needs_reorder_qty' then 3 else 4 end)",
} as const;

async function selectOne<T>(
  executor: DbExecutor,
  query: SQL,
  key: string,
): Promise<T> {
  const rows = (await executor.execute(query)) as unknown as Array<
    Record<string, T>
  >;
  return rows[0]?.[key] as T;
}

export const reorderRepository = {
  // ---- live list (BR-RO-21) ----
  async listItems(params: ReorderItemsQuery): Promise<ListedItems> {
    const search = safeSearch(params.q, itemMaster.sku, itemMaster.name);
    const orderBy = sql.raw(
      `${ITEM_ORDER[params.sortBy]} ${params.sortDir === "desc" ? "desc" : "asc"}, id asc`,
    );
    const stateFilter =
      params.state && params.state.length > 0
        ? sql`where f0.state in (${sql.join(
            params.state.map((s) => sql`${s}`),
            sql`, `,
          )})`
        : sql``;
    const offset = (params.page - 1) * params.pageSize;
    const query = sql`
      with ${classifiedCtes(search)},
      filtered as (select f0.* from classified f0 ${stateFilter}),
      paged as (
        select f.*, row_number() over (order by ${orderBy}) as rn
        from filtered f order by rn limit ${params.pageSize} offset ${offset}
      ),
      decorated as (
        select p.*, cpr.id as cpr_id, cpr.pr_number as cpr_number,
          cpo.id as cpo_id, cpo.po_number as cpo_number
        from paged p
        left join lateral (
          select pr.id, pr.pr_number
          from ${purchaseRequestItems} pri join ${purchaseRequests} pr on pr.id = pri.pr_id
          where p.state = 'covered' and pri.item_id = p.id and pri.status = 'pending'
            and pr.status in ${OPEN_PR_STATUSES}
          order by pr.id desc limit 1
        ) cpr on true
        left join lateral (
          select po.id, po.po_number
          from ${purchaseOrderItems} poi join ${purchaseOrders} po on po.id = poi.po_id
          where p.state = 'covered' and cpr.id is null and poi.item_id = p.id
            and po.status not in ${CLOSED_PO_STATUSES}
            and round(poi.qty * 1000) - round(coalesce(poi.received_qty, 0) * 1000) > 0
          order by po.id desc limit 1
        ) cpo on true
      )
      select jsonb_build_object(
        'total', (select count(*) from filtered),
        'counts', (select coalesce(jsonb_object_agg(state, n), '{}'::jsonb)
                   from (select state, count(*) as n from classified group by state) s),
        'rows', coalesce((select jsonb_agg(to_jsonb(d) order by d.rn) from decorated d), '[]'::jsonb)
      ) as result`;
    return selectOne<ListedItems>(db, query, "result");
  },

  // ---- run read (BR-RO-26): one statement, one snapshot ----
  async readLowItems(tx: DbTransaction): Promise<RunReadResult> {
    const query = sql`
      with ${classifiedCtes()}
      select jsonb_build_object(
        'checked', (select count(*) from classified),
        'rows', coalesce((
          select jsonb_agg(to_jsonb(x) order by x.shortfall_m desc, x.id)
          from (
            select id, uom, level, level_m, usable_m, otw_m, proj_m, rq_m, min_m, mult_m, rate, shortfall_m, state
            from classified where state in ('will_be_ordered', 'needs_reorder_qty')
          ) x
        ), '[]'::jsonb)
      ) as result`;
    const raw = await selectOne<{
      checked: number;
      rows: Array<Omit<RunReadRow, "level_m"> & { level_m: number | string }>;
    }>(tx, query, "result");
    return {
      checked: Number(raw.checked),
      rows: raw.rows.map((r) => ({
        ...r,
        level_m: Math.round(Number(r.level_m)),
      })),
    };
  },

  // ---- runs ----
  /** Marks `running` rows started before `cutoff` as failed (BR-RO-27). */
  async failStaleRuns(
    tx: DbExecutor,
    cutoff: Date,
    finishedAt: Date,
    reason: string,
  ) {
    await tx
      .update(reorderRuns)
      .set({ state: "failed", finishedAt, failureReason: reason })
      .where(
        and(
          eq(reorderRuns.state, "running"),
          lt(reorderRuns.startedAt, cutoff),
        ),
      );
  },

  async insertRunningRun(
    tx: DbExecutor,
    data: {
      trigger: "schedule" | "manual";
      startedBy: number | null;
      scheduledDay: string | null;
      draftOwnerId: number | null;
      startedAt: Date;
    },
  ) {
    const [row] = await tx
      .insert(reorderRuns)
      .values({ ...data, state: "running" })
      .returning({ id: reorderRuns.id });
    return row;
  },

  async finishRun(
    tx: DbExecutor,
    runId: number,
    data: {
      state: "done" | "failed";
      finishedAt: Date;
      itemsChecked?: number;
      itemsRaised?: number;
      itemsSkipped?: number;
      itemsDeferred?: number;
      failureReason?: string | null;
    },
  ) {
    await tx
      .update(reorderRuns)
      .set({
        state: data.state,
        finishedAt: data.finishedAt,
        itemsChecked: data.itemsChecked ?? 0,
        itemsRaised: data.itemsRaised ?? 0,
        itemsSkipped: data.itemsSkipped ?? 0,
        itemsDeferred: data.itemsDeferred ?? 0,
        failureReason: data.failureReason ?? null,
      })
      .where(eq(reorderRuns.id, runId));
  },

  async insertRunItems(
    tx: DbTransaction,
    rows: Array<typeof reorderRunItems.$inferInsert>,
  ) {
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(reorderRunItems).values(rows.slice(i, i + 500));
    }
  },

  async hasScheduledRunOn(day: string) {
    const [row] = await db
      .select({ id: reorderRuns.id })
      .from(reorderRuns)
      .where(
        and(
          eq(reorderRuns.trigger, "schedule"),
          eq(reorderRuns.scheduledDay, day),
        ),
      )
      .limit(1);
    return row !== undefined;
  },

  /** Run rows with names and PR / PO links, one shape for list and detail. */
  async listRuns(params: ReorderRunsQuery) {
    const sortColumn = {
      startedAt: reorderRuns.startedAt,
      id: reorderRuns.id,
      state: reorderRuns.state,
    }[params.sortBy];
    const dir = params.sortDir === "desc" ? desc : asc;
    const where = and(
      params.state && params.state.length > 0
        ? inArray(reorderRuns.state, params.state)
        : undefined,
      params.trigger ? eq(reorderRuns.trigger, params.trigger) : undefined,
    );
    const [rows, [totalRow]] = await Promise.all([
      runSelect()
        .where(where)
        .orderBy(dir(sortColumn), dir(reorderRuns.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(reorderRuns).where(where),
    ]);
    return { rows, total: totalRow?.value ?? 0 };
  },

  async findRunById(id: number) {
    const [row] = await runSelect().where(eq(reorderRuns.id, id)).limit(1);
    return row;
  },

  /** Newest PO linked to each PR's lines (DocumentFlow). */
  async findLatestPosByPrIds(prIds: number[]) {
    if (prIds.length === 0) return new Map<number, PoLink>();
    const rows = await db
      .selectDistinctOn([purchaseRequestItems.prId], {
        prId: purchaseRequestItems.prId,
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        status: purchaseOrders.status,
      })
      .from(purchaseRequestItems)
      .innerJoin(
        prPoItemLinks,
        eq(prPoItemLinks.prItemId, purchaseRequestItems.id),
      )
      .innerJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, prPoItemLinks.poItemId),
      )
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.poId))
      .where(inArray(purchaseRequestItems.prId, prIds))
      .orderBy(purchaseRequestItems.prId, desc(purchaseOrders.id));
    return new Map(
      rows.map((r) => [
        r.prId,
        { id: r.id, poNumber: r.poNumber, status: r.status },
      ]),
    );
  },

  async listRunItems(runId: number, limit: number) {
    return db
      .select({
        itemId: reorderRunItems.itemId,
        sku: itemMaster.sku,
        name: itemMaster.name,
        uom: reorderRunItems.uom,
        outcome: reorderRunItems.outcome,
        usableQty: reorderRunItems.usableQty,
        onTheWayQty: reorderRunItems.onTheWayQty,
        projectedQty: reorderRunItems.projectedQty,
        reorderLevel: reorderRunItems.reorderLevel,
        reorderQty: reorderRunItems.reorderQty,
        orderQty: reorderRunItems.orderQty,
        prItemId: reorderRunItems.prItemId,
      })
      .from(reorderRunItems)
      .innerJoin(itemMaster, eq(itemMaster.id, reorderRunItems.itemId))
      .where(eq(reorderRunItems.runId, runId))
      .orderBy(
        sql`case ${reorderRunItems.outcome} when 'raised' then 1 when 'invalid_line' then 2 when 'needs_reorder_qty' then 3 else 4 end`,
        asc(reorderRunItems.id),
      )
      .limit(limit);
  },

  // ---- settings ----
  async getSettings(executor: DbExecutor = db) {
    const owner = alias(employees, "reorder_owner");
    const changer = alias(employees, "reorder_changer");
    const [row] = await executor
      .select({
        enabled: reorderSettings.enabled,
        runHour: reorderSettings.runHour,
        draftOwnerId: reorderSettings.draftOwnerId,
        draftOwnerName: owner.name,
        scheduleChangedAt: reorderSettings.scheduleChangedAt,
        updatedById: reorderSettings.updatedBy,
        updatedByName: changer.name,
        updatedAt: reorderSettings.updatedAt,
      })
      .from(reorderSettings)
      .leftJoin(owner, eq(owner.id, reorderSettings.draftOwnerId))
      .leftJoin(changer, eq(changer.id, reorderSettings.updatedBy))
      .where(eq(reorderSettings.id, 1))
      .limit(1);
    return row;
  },

  /** Row lock on the single settings row (PATCH serialises on it). */
  async lockSettings(tx: DbTransaction) {
    await tx.execute(
      sql`select ${reorderSettings.id} from ${reorderSettings} where ${reorderSettings.id} = 1 for update`,
    );
  },

  async updateSettings(
    tx: DbTransaction,
    data: Partial<typeof reorderSettings.$inferInsert>,
  ) {
    await tx.update(reorderSettings).set(data).where(eq(reorderSettings.id, 1));
  },

  async insertSettingsHistory(
    tx: DbTransaction,
    rows: Array<typeof reorderSettingsHistory.$inferInsert>,
  ) {
    if (rows.length === 0) return;
    await tx.insert(reorderSettingsHistory).values(rows);
  },

  // ---- draft owner ----
  /**
   * Fresh read (no actor cache) of the employee's state and whether they hold
   * pr.manage (super-admin holds every key, BR-AUTH-18).
   */
  async readOwnerFacts(employeeId: number) {
    const row = await authRepository.getActorRowById(employeeId);
    if (!row) return undefined;
    return {
      isActive: row.isActive,
      roleName: row.roleName,
      keys: row.keys as string[],
    };
  },

  /** Active employees holding pr.manage, super-admin included. */
  async listOwnerCandidates(params: ReorderOwnerCandidatesQuery) {
    const holdsKey = sql`(${roles.name} = ${SUPER_ADMIN_ROLE_NAME} or exists (
      select 1 from ${rolePermissions} rp
      where rp.role_id = ${employees.roleId} and rp.permission_key = 'pr.manage'))`;
    const where = and(
      eq(employees.isActive, true),
      holdsKey,
      safeSearch(params.q, employees.name),
    );
    const dir = params.sortDir === "desc" ? desc : asc;
    const [rows, [totalRow]] = await Promise.all([
      db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .innerJoin(roles, eq(roles.id, employees.roleId))
        .where(where)
        .orderBy(dir(employees.name), asc(employees.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db
        .select({ value: count() })
        .from(employees)
        .innerJoin(roles, eq(roles.id, employees.roleId))
        .where(where),
    ]);
    return { rows, total: totalRow?.value ?? 0 };
  },
};

type PoLink = { id: number; poNumber: string; status: string };

function runSelect() {
  const starter = alias(employees, "reorder_starter");
  const owner = alias(employees, "reorder_run_owner");
  return db
    .select({
      id: reorderRuns.id,
      trigger: reorderRuns.trigger,
      state: reorderRuns.state,
      startedById: reorderRuns.startedBy,
      startedByName: starter.name,
      startedAt: reorderRuns.startedAt,
      finishedAt: reorderRuns.finishedAt,
      draftOwnerId: reorderRuns.draftOwnerId,
      draftOwnerName: owner.name,
      itemsChecked: reorderRuns.itemsChecked,
      itemsRaised: reorderRuns.itemsRaised,
      itemsSkipped: reorderRuns.itemsSkipped,
      itemsDeferred: reorderRuns.itemsDeferred,
      failureReason: reorderRuns.failureReason,
      prId: purchaseRequests.id,
      prNumber: purchaseRequests.prNumber,
      prStatus: purchaseRequests.status,
    })
    .from(reorderRuns)
    .leftJoin(starter, eq(starter.id, reorderRuns.startedBy))
    .leftJoin(owner, eq(owner.id, reorderRuns.draftOwnerId))
    .leftJoin(
      purchaseRequests,
      eq(purchaseRequests.reorderRunId, reorderRuns.id),
    );
}
